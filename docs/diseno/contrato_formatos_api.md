# Contrato de datos · Formatos 1A / 2A (app ↔ Apps Script ↔ dashboard)

Acordado el 2026-11-12. Las tres partes (Code.gs, app v2.3 y dashboard) usan **exactamente** esto.
Todo es **aditivo**: `savePhoto` y las demás acciones existentes no cambian.

## POST `guardarFormato`

```json
{
  "action": "guardarFormato",
  "odtId": "<id del perfil de la app, igual que corregirSuministro>",
  "formato": {
    "id": "<uuid generado en el teléfono, ≤ 64 caracteres; único por supervisión>",
    "tipo": "1A" | "2A",
    "hoja": "<nombre de la jornada>",
    "suministro": "<código normalizado>",
    "fecha": "dd/MM/yyyy HH:mm",
    "lectura": "12345.6",
    "fechaSticker": "dd/MM/yyyy" | "",
    "observacion": "texto" | "",
    "conforme": true | false,
    "resp": { "<idPregunta>": "SI" | "NO" | "N.A." },
    "patron": "LE-C-066-2026 · 23/02/2026" | "",
    "carga": "LE-383-2026 · 21/09/2026" | "",
    "fotos": [ { "timestamp": "<mismo timestamp que se mandó en savePhoto>", "rol": "Panorámica del predio" } ],
    "appVersion": "2.3.0"
  }
}
```

- Solo un técnico registrado (`odtId` presente en `_ODT_Tecnicos`) puede guardar, igual que en
  `corregirSuministro`. Si no, responde `success:false` con el mismo mensaje «No autorizado: tu perfil…».
- Validaciones: `tipo` ∈ {1A, 2A}; `hoja` existe y no es interna (`_*`, `Usuarios`); `suministro`
  y `id` no vacíos; `resp` es un objeto; si `conforme === false`, la `observacion` no puede estar vacía.
- **Idempotente:** si ya existe una fila con el mismo `id`, se **reemplaza** (no se duplica).
- Respuesta: `{ "success": true, "message": "...", "id": "...", "fila": 12, "actualizado": false }`.

## Dónde se guarda: en la misma hoja de la jornada (columnas AK–AX)

No hay hojas nuevas. Las columnas A–AJ no se tocan. A la derecha se agregan:

| Col | Encabezado | Fila |
|---|---|---|
| AK | ETIQUETA_FOTO | cada fila de foto del formulario (se ubica por suministro + Synced_At = `fotos[].timestamp`) |
| AL | FORMATO (1A/2A) | fila de la foto panorámica (si no hay, la de «Lectura del medidor»; si tampoco, la primera foto) |
| AM | FORMATO_ID | ídem |
| AN | CONFORME (SI/NO) | ídem |
| AO | FECHA_STICKER | ídem |
| AP | OBS_FORMATO | ídem |
| AQ | ITEMS_NO (textos de lo que no cumple, separados por «; ») | ídem |
| AR | RESPUESTAS (`id=SI; id=NO; …`) | ídem |
| AS / AT | CERT_PATRON / CERT_CARGA | ídem |
| AU | RECIBIDO (fecha del servidor) | ídem |
| AV | FORMATO_FECHA | ídem |
| AW | FORMATO_ID_FOTO | cada fila de foto: a qué formulario pertenece |
| AX | LECTURA_FORMATO (`formato.lectura`, texto) | fila del formulario (como AL–AV) |

- Si las fotos del suministro todavía no están en la hoja, se rechaza con «Primero sincroniza las fotos de este suministro».
- Las jornadas antiguas (9 columnas) se rechazan.
- Si el mismo `id` llega otra vez, se mueve o se actualiza; nunca se duplica.

## GET `getFormatos&sheetName=<hoja>`

```json
{ "success": true, "message": "...", "formatos": [
  { "id": "...", "tipo": "1A", "hoja": "...", "suministro": "...", "fecha": "dd/MM/yyyy HH:mm",
    "tecnico": "Jael Canaza", "lectura": "...", "fechaSticker": "...", "conforme": true,
    "observacion": "...", "resp": { }, "patron": "...", "carga": "...",
    "fotos": [ { "timestamp": "...", "rol": "..." } ], "recibido": "dd/MM/yyyy HH:mm" } ] }
```

- **No** devuelve `odtId`, como pasa con `getAllPoints`.
- Si la jornada aún no tiene columnas de formulario, devuelve `formatos: []`.
- `lectura`: AX (la que mandó la app) → LECTURA (AC) de su foto «Lectura del medidor» → AC de la fila
  del formulario → primera AC no vacía entre sus fotos.
- Un servidor sin desplegar responde `Acción no reconocida`. El dashboard lo trata como «aún no
  disponible».

## Ids de preguntas

Son los de `src/prototipo/formatos.ts` (`PREGUNTAS_1A`, `ITEMS_2A`) y `app-movil/lib/prototipo/supervision.dart`
(`bloques1A`, `bloques2A`). Si difieren, mandan los de la app, y el dashboard los mapea.

---

# Ampliación 2026-11-12 (tarde) · planificación, numeración fija, avisos y links de fotos

Todo es aditivo. Las acciones y columnas anteriores no cambian. Columnas nuevas en la hoja de la jornada:

| Col | Encabezado | Fila | Qué guarda |
|---|---|---|---|
| AY | COINCIDENTE_PLAN | **fila programada** del suministro (la de la lista, con A vacía) | `SI` si TELCOM la eligió como coincidente; vacío si no |
| AZ | REPORTE | fila del formulario | número fijo, por ejemplo `SP-2026-004` o `SC-2026-002`; vacío hasta numerar |
| BA | AVISADO | fila del formulario | fecha y hora del aviso a la contratista (no conforme); vacío si no se avisó |

## GET `getPlanJornada&sheetName=<hoja>` (solo lectura, sin token, igual que getSuministros)
```json
{ "success": true, "plan": [ { "suministro": "...", "fechaProgramada": "dd/MM/yyyy" | "", "tecnico": "...", "coincidente": true | false } ] }
```
- Hay una entrada por suministro programado (filas con A vacía). `fechaProgramada` sale de la columna C (Fecha_Contraste), `tecnico` de B y `coincidente` de AY.
- Si no hay filas programadas, toma los suministros distintos de D, con fecha vacía.
- En hojas antiguas devuelve `plan: []`.

## POST `marcarCoincidente`  `{ token, hoja, suministros: [..], valor: true|false }`
- Solo con token de sesión de **admin o supervisor**, la misma verificación que getCredenciales.
- Escribe o borra `SI` en AY de las filas programadas de esos suministros.
- Respuesta: `{ success, marcados: n }`.

## POST `asignarNumeros`  `{ token, hoja }`
- Solo admin o supervisor.
- Numera **solo los formularios de la jornada que todavía no tienen número** (AZ vacío). Los ya numerados nunca cambian.
- 1A: se ordenan por FORMATO_FECHA (AV) y, a igualdad, por RECIBIDO (AU), y se agrupan de 10 en 10. Cada grupo recibe el siguiente `SP-<año>-NNN`.
- 2A: cada uno recibe el siguiente `SC-<año>-NNN`.
- Los contadores son globales por año, en PropertiesService: `contador_SP_<año>` y `contador_SC_<año>`. Todo va bajo el candado del script.
- Respuesta: `{ success, asignados: [ { id, reporte } ], sp: n, sc: m }`.

## POST `marcarAvisado`  `{ token, hoja, id, avisado: true|false }`
- Solo admin o supervisor. Escribe o borra en BA la fecha y hora del servidor, en la fila del formulario con ese id.

## Cambios en la respuesta de `getFormatos` (solo campos nuevos)
- Por formulario: `reporte` (AZ o ""), `avisado` (BA como `dd/MM/yyyy HH:mm` o "").
- Por foto: `url` (link de Drive de la columna X, sacado de la fórmula HYPERLINK) y `fila` (número de fila).
- El dashboard usa `url` en vez de buscar la foto por la hora.

## Etiquetas de fotos adicionales (app)
- La foto adicional se elige de una lista desplegable con **los ítems del mismo formulario** (los SI/NO), agrupados por bloque.
- `rol` = texto del ítem tal como se ve en la app, por ejemplo «Precinto de bornera instalado».
- No existe la opción «escribir otra».
- Las evidencias de un NO siguen como `Evidencia · <idPregunta>`, y la de la lectura como «Lectura del medidor».

## Ampliación 2026-11-13: corregir desde el dashboard

`POST { action: 'editarFormato', token, hoja, id, cambios: { resp?, observacion?, fechaSticker?, lectura?, patron?, carga? } }`
(token de ADMIN o SUPERVISOR). `resp` usa los ids de la app (`SI` / `NO` / `N.A.`; vacío borra). El servidor recalcula
CONFORME (algún NO = no conforme) e ITEMS_NO, exige observación si queda no conforme y escribe en la fila del
formulario solo AN–AT y AX, más **BB EDITADO** = «dd/MM/yyyy HH:mm · correo». No toca fotos, AU RECIBIDO, AZ REPORTE ni
BA AVISADO. Respuesta `{ id, fila, conforme, editado }`. `getFormatos` devuelve `editado`. Si después la app reenvía el
mismo formulario, lo reemplaza y borra BB.
