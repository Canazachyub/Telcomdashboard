# TELCOM — guía para sesiones de trabajo

Sistema de supervisión de trabajo de campo de **TELCOM ENERGY**: técnicos toman fotos de
medidores con una app Android, las fotos y datos llegan a un Google Sheet a través de un
Apps Script, y este dashboard React las muestra.

```
App Android (técnicos) ──┐
                         ├──► Apps Script (Code.gs) ──► Google Sheets + Drive (fotos)
Dashboard React (web) ───┘
```

- Dashboard en producción: https://canazachyub.github.io/Telcomdashboard/
- Apps Script (misma URL para app y dashboard): `API_POINTS` en `src/config/api.ts`

---

## Reglas de oro (producción)

1. **La app vieja sigue en uso.** Los técnicos usan la APK original `com.telcom.timestamp_camera`
   v1.0.0 (firmada con una llave perdida). Nada puede romperla: usa `getSheets`, `getSuministros`,
   `getAllPoints`, `getTecnicos`, `savePhoto`, `registerODT`, `createSheet`, `saveInventory`.
   No cambiar el formato de esas respuestas.
2. **Cambios en `Code.gs` solo aditivos**: acciones nuevas (`case` en `doGet`/`doPost`) y secciones
   nuevas al final del archivo. No tocar el comportamiento de las acciones existentes.
3. **Nunca escribir en las hojas reales durante pruebas.** Contra producción solo lecturas o pedidos
   que el servidor rechaza (ver `app-movil/tool/smoke_produccion.py`). Asignar, traer o corregir
   de verdad lo hace el usuario.
4. **Secretos fuera de git**: `Code.gs` (raíz), `app-movil/` (incluye `keystore/` y
   `android/key.properties`) están en `.gitignore`. Nunca commitearlos ni escribir contraseñas.
5. **Sincronización de la app: manual.** El técnico decide cuándo subir; nada automático.
6. Técnicos sin acceso sensible: en la app las hojas «Usuarios» y «_*» quedan ocultas; un técnico
   solo corrige sus propias fotos, a ≤300 m y hacia un código de la lista.

---

## Backend: `Code.gs`

- **`F:\TELCOMDASHBOARD\Code.gs` (raíz, gitignored)** es la copia completa que el usuario pega en
  el editor de Apps Script y despliega como **«Nueva versión»** (Implementar → Administrar
  implementaciones → Editar). La URL no cambia.
- `google-apps-script/*.gs` son **copias de referencia** (commiteadas) de las secciones nuevas:
  `Correcciones.gs`, `Traslados.gs` (incluye el índice de búsqueda), `Credenciales.gs`,
  `Miniaturas.gs`. Mantenerlas iguales a la sección correspondiente de `Code.gs` (este usa CRLF).
- Antes de tocar `Code.gs`, respaldar una copia en el scratchpad.

**Pruebas del servidor**

```bash
node google-apps-script/pruebas/code_gs.test.mjs Code.gs      # simulador de Sheets (requiere la ruta)
node -e "new Function(require('fs').readFileSync('Code.gs','utf8'))"   # sintaxis
python -I app-movil/tool/smoke_produccion.py <URL_API>        # 18 revisiones contra producción, solo lectura
```

**Acciones agregadas en 2026-10** (todas aditivas)

| Acción | Tipo | Qué hace |
|---|---|---|
| `corregirSuministro` | POST | Corrige el código de suministro de fotos ya tomadas (token admin/supervisor, o `odtId` de técnico con sus límites). Registra en `_Correcciones` |
| `buscarEnHojas` | GET | Busca suministro o serie en todas las jornadas usando el índice oculto (~3 s) |
| `traerSuministro` | POST | Copia un suministro de otra jornada a la actual. Registra en `_Traslados` |
| `registrarCredencial` | POST | Correo, ubicación y foto de credencial del técnico → `_ODT_Tecnicos` col. H–N + Drive `_Credenciales` |
| `getCredenciales` | POST | Lista las credenciales (solo con token de sesión) |
| `getImageThumb` | GET | Miniatura de Drive de una foto. Hoy pesa lo mismo que la original (~130 KB) y el dashboard no la usa |

**Formatos 1A/2A (2026-11-12, todo aditivo; contrato en `docs/diseno/contrato_formatos_api.md`)**

| Acción | Tipo | Qué hace |
|---|---|---|
| `guardarFormato` | POST | Formulario 1A/2A de la app (técnico registrado). Idempotente por `id`. Escribe en la **misma hoja de la jornada**, columnas AK–BB (AK etiqueta de cada foto, AL–AX el formulario en la fila de la panorámica) |
| `getFormatos` | GET | Formularios de una jornada (+ `url` y `fila` de cada foto, `reporte`, `avisado`); sin `odtId` |
| `getPlanJornada` | GET | Programados con fecha (col C), técnico (B) y coincidente planificado (AY) |
| `marcarCoincidente` · `asignarNumeros` · `marcarAvisado` | POST | Token de sesión admin/supervisor. AY coincidente, AZ número fijo SP/SC (contadores anuales en Script Properties `contador_SP_<año>`/`contador_SC_<año>`), BA fecha del aviso |
| `editarFormato` | POST | Token admin/supervisor. Corrige respuestas, observación, sticker/lectura o certificados con las reglas de la app (`components/formatos/EditorFormato.tsx`); BB guarda quién y cuándo |

Nunca crear hojas nuevas para esto: todo va en la hoja de la jornada (A–AJ intactas).

**Hojas internas** (ocultas; `getSheets` no las devuelve, salvo `_ODT_Tecnicos` como siempre):
`_ODT_Tecnicos` (perfiles de la app + credenciales H–N), `_Correcciones`, `_Traslados`,
`_Indice` (Hoja, SheetId, Suministro, SerieNorm, Serie, CodigoRuta, Distrito, DeLista, Fotos) e
`_IndiceHojas` (SheetId, Hoja, Filas).

**Índice de búsqueda**: disparadores `actualizarIndiceBusqueda` (cada 15 min) y
`reconstruirIndiceBusqueda` (3 a.m.), instalados con `instalarIndiceBusqueda`. Si la búsqueda
deja de encontrar cosas, ejecutar `reconstruirIndiceBusqueda` en el editor (~2 min). El índice
usa `LockService.getUserLock()` para no bloquear `savePhoto` (que usa el candado del script) y se
reescribe sin dejar la hoja vacía.

---

## Dashboard (este repo)

React 19 + TypeScript + Vite + Tailwind 4 + Leaflet + Zustand. Tema oscuro: las clases
`bg-white`/`text-gray-900` están remapeadas a colores oscuros; **no usar `bg-white/95`** y
similares (con opacidad no se remapean y salen blancos).

```bash
npm run dev          # http://localhost:5173/Telcomdashboard/
npx tsc -b           # tipos
npx eslint <archivos>
npm run build
```

- En esta máquina el puerto 5173 lo comparte otro proyecto (CUSCO RECLAMOS, en 127.0.0.1):
  para mostrarle el dashboard al usuario levantar uno aparte, p. ej.
  `npx vite --host 127.0.0.1 --port 5190 --strictPort`.
- Formato: `npx prettier --single-quote --print-width 120 --write <archivos>` (no hay config de
  prettier; sin esas opciones cambia el estilo del repo).
- PDFs 1A/2A: `utils/pdfFormatos.ts` (fiel al Anexo 01; evidencias y registro fotográfico adicional desde la pág. 2). El Formato 4 sigue en `utils/pdfGenerator.ts` y **no se toca**.
- **Deploy**: push a `main` → GitHub Actions (`.github/workflows/deploy.yml`) publica Pages.
- En el mapa quedan 2 errores de lint antiguos (`@ts-ignore` y un `setState` en efecto); no son nuevos.

**Páginas y piezas principales**

| Ruta | Archivo | Notas |
|---|---|---|
| `/` | `pages/DashboardPage.tsx` | Anillo de avance por técnico, ritmo diario, «Lo último que se hizo» (muro de fotos), quién la llenó, distritos o perfil radar |
| `/resumen` | `pages/ResumenJornadasPage.tsx` | Las N jornadas con fotos más recientes (revisa las últimas 20 + «Buscar en 15 más») |
| `/mapa` | `pages/MapPage.tsx` | Asignar área estilo juego de estrategia: `map/SeleccionCaja.tsx` (recuadro; Shift suma, Alt quita, Espacio mueve) + `map/BarraAsignacion.tsx` (técnicos en teclas 1–9, Enter asigna con `assignTecnico`) |
| `/rastreo` | `pages/RastreoPage.tsx` | GPS por última foto + capa «Registros de la app» (credenciales) |
| `/entrega` | `pages/EntregaSemanalPage.tsx` | Entrega semanal guiada en 4 pasos (semana → revisar lo que falta → asignar números → armador del ZIP con árbol de archivos y vista previa, `components/entrega/ArmadorPaquete.tsx`) |
| `/formatos` | `pages/FormatosPage.tsx` | Formularios 1A/2A reales, «Corregir respuestas», avisos 24 h, planificar coincidentes («Proponer el 10 %» o cantidad de ELSE) |
| `/usuarios` | `pages/UsersPage.tsx` | Crear usuarios con datos de credenciales (prefill) |

- Gráficos propios en SVG, sin librerías: `components/resumen/Graficos.tsx` (`Anillo`,
  `AnillosJornadas`, `RitmoDiario` interactivo, `Participacion`, `PerfilTecnicos`, `Proyeccion`).
- Cálculos puros: `utils/resumenJornadas.ts` (`resumirJornada`, `resumirTecnicos`, `ritmo`,
  `fotosRecientes`, `coloresDe`). «Quién llenó» = perfil de la app que tomó la foto (`odtNombre`),
  igual que «Quién fotografió» del mapa; no la columna B.
- **Proyección** = pendientes ÷ promedio por día trabajado en los últimos 7 días (solo días con
  avance). Son días de trabajo, no de calendario.
- Fotos: `utils/imageCache.ts` — una descarga por foto vía `getImageBase64`, caché en memoria y en
  Cache Storage del navegador (`telcom-fotos-v1`), sin pedidos duplicados en curso.
  `PhotoStrip` (`Thumb`), `PhotoGalleryModal` (precarga del resto de fotos) y
  `components/resumen/UltimasFotos.tsx`.
- Carga de varias jornadas: `services/suministroHistory.ts` (`cargarJornadas`, concurrencia 4, caché
  de sesión; `forzar` para releer).

---

## App móvil (`app-movil/`, fuera de git)

Flutter reconstruida (el código original se perdió). Ver `app-movil/README.md`.

| | APK vieja (en uso) | Nueva |
|---|---|---|
| Paquete | `com.telcom.timestamp_camera` v1.0.0 | `com.telcom.operaciones` v2.3.0+7 |
| Nombre | Timestamp Camera / TELCOM | **TELCOM Operaciones** |
| Firma | debug de la PC perdida | `app-movil/keystore/telcom-release.jks` (CN=TELCOM ENERGY) |

- Se instalan **lado a lado**; no desinstalar la vieja de nadie.
- Debug: `com.telcom.timestamp_camera.clon.test` («TELCOM Test»).
- APK firmada y protegida: `bash tool/build_release.sh` (desde `app-movil/`) → `apk-generadas/TELCOM_Operaciones_v2.2.0.apk`
  (Dart ofuscado + R8; símbolos en `app-movil/simbolos/`, no compartir). SHA-256 en `apk-generadas/SHA256.txt`.
- v2.1: GPS en vivo en el mapa, varias hojas a la vez (la foto va a la hoja que tiene el suministro) y
  sincronización en segundo plano con reintentos (`SyncQueue`, tarjeta flotante `SyncOverlay`).
  `savePhoto` no tiene id único: un reintento demasiado pronto puede duplicar; por eso timeout 120 s,
  una foto a la vez y ≥20 s antes de reenviar tras «sin respuesta».
- v2.2: sello nuevo (`lib/services/sello.dart`, dibujado con Canvas y letra Arimo con tildes): marca y
  suministro abajo a la izquierda, fecha/GPS/dirección arriba a la derecha, minimapa OSM tenue con pin
  del técnico abajo a la derecha (z17, caché compartido con el mapa; sin teselas → foto sin mapa).
  Fotos: lado largo ≤1920 y corto ≤1080 (vertical 1080×1440), JPG al 85 %. Si el sello falla, se usa
  el básico de antes. Muestra con foto real: `SELLO_MUESTRA=<dir> flutter test test/sello_test.dart`.
- Próximas versiones: **misma keystore** y subir `versionCode`. Respaldar keystore + `key.properties`.
- Pruebas: `flutter test` (134) · formato `dart format -l 120`.

---

## Pendientes conocidos

- Rotar la contraseña de admin que quedó en el historial público de git (README antiguo).
- Respaldar keystore + `key.properties` fuera de la PC.
- Posibles: crear usuarios inactivos en «Usuarios» desde credenciales; OCR del medidor; pasar
  mapa/inventario/historial de la app al estilo nuevo.
