# Análisis del Dashboard TELCOM — 2026-10-10

Fuentes: lectura completa de `src/` + recorrido visual en local (`npm run dev`) con sesión de administrador.
El backend `Code.gs` (Apps Script dentro de la hoja *TELCOM ENERGY*) **no está en el repo**: lo que depende del servidor se marca como riesgo.

## 1. Seguridad (urgente)

| # | Hallazgo | Evidencia |
|---|---|---|
| S1 | Credenciales del admin publicadas en el repo público | `README.md:186-187`, `google-apps-script/ESTRUCTURA_HOJAS.md:28,104-109` |
| S2 | La hoja `Usuarios` se lista como jornada; Reportes muestra los hashes SHA-256 (sin sal) de las contraseñas | visto en `/reportes` con jornada "Usuarios" |
| S3 | GETs sin token: datos personales (DNI, nombres, direcciones, fotos) legibles por cualquiera con la URL `/exec` (está en el bundle público) | `config/api.ts`, `getAllPointsExtended`, `getInventory`, `getImageBase64?fileId=` |
| S4 | Mutaciones sin token (`createUser`, `updateUser`, `deleteUser`, `assignTecnico`, `uploadSuministros`) | `authService.ts:125,154,174`, `tecnicoService.ts` |
| S5 | XSS almacenado: `odtColor`/`color` de la app se interpolan sin escapar en DivIcons | `MapPage.tsx:85-100`, `GPSMarker.tsx:21-45` |
| S6 | Token base64 no firmado, `isAuthenticated` persistido sin verificar expiración, roles solo en cliente | `authService.ts:21-39`, `App.tsx:16-54` |
| S7 | CSV sin neutralizar fórmulas (`= + - @`) | exportaciones de Suministros/Reportes/Inventario |
| S8 | `xlsx 0.18.5` con CVE-2023-30533 y CVE-2024-22363 parseando archivos subidos; `axios` con avisos *high* en `npm audit` | `package.json` |

## 2. Bugs funcionales

1. **Tailwind 4 no carga `tailwind.config.js`** (`index.css:1`) → todas las clases `primary-*` no existen: sidebar activo sin resaltar, botón "Actualizar" invisible, **barras de progreso vacías**. `bg-opacity-*` ya no existe → overlays negros y miniaturas tapadas (`MapPage.tsx:159`).
2. **"Nueva Jornada" roto**: usa `import.meta.env.VITE_API_POINTS` (no definida) y GET (`JornadasPage.tsx:41`).
3. **Hojas del sistema como jornadas** (Usuarios, `_ODT_Tecnicos`, inventarios, OBSERVADOS): la jornada por defecto es "Usuarios".
4. **Jornada no persiste** al recargar ni está en la URL.
5. **Total por técnico = promedio** (todos "126 total"); resumen global de Jornadas (2421) menor que una sola jornada (2773).
6. Rol en mayúsculas vs minúsculas (`types/user.ts:3` vs `pointsStore.ts:167`) → riesgo de bloquear menús.
7. Fallback legacy deja datos de otra jornada (`pointsStore.ts:192-199`); sin control de carreras.
8. Reportes: observaciones no se guardan; **observación vacía se imprime como "NO EJECUTA EL CONTRASTE"** en el PDF (`pdfGenerator.ts:209-211`).
9. P227 y MALCOM siguen hardcodeados (`ReportesObservadosPage.tsx:483`, `pdfObservados.ts:186,416`, `ReportesPage.tsx:22-23`).
10. Vista previa Excel usa `row.cliente` (es `clienteNombre`); parser CSV rompe comillas; drag&drop anunciado sin implementar.
11. Paginación no se reinicia al cambiar hoja ("51-50 de 10").
12. Rastreo muestra "0 técnicos" con 7 filas en `_ODT_Tecnicos`; doble scroll; refresco cada 10 min presentado como tiempo real.
13. Raíz `/Telcomdashboard/` en blanco; ruta `/configuracion` enlazada pero inexistente; campana y fecha falsas; favicon de Vite.
14. Polling infinito en Observados (`ReportesObservadosPage.tsx:142-161`).

## 3. UI/UX

- Sin design system; colores sueltos; **azul** en el dashboard vs **naranja** en la app.
- **No es responsive** (sidebar fijo `w-64`, 0 breakpoints en 8 páginas): inutilizable en celular.
- Accesibilidad casi nula (1 atributo aria, modales sin foco/Escape, estado solo por color).
- 14 `alert()`, sin toasts, sin skeletons, errores tragados ("No hay datos" en vez de error).
- Tres selectores de jornada compitiendo.
- Mapa sin clustering: miles de `Marker` con DivIcon nuevo por render.
- Componentes gigantes: Suministros 1257 líneas, Mapa 1171, Reportes 1095, Observados 957; `pdfGenerator.ts` repite el layout 4 veces.

## 4. Integración con la app móvil

- Datos que la app envía y el dashboard no usa: `gpsCoords`/`location`, `odtId`, quién tomó cada foto (galería y PDF), distancia ref↔real (antifraude).
- Estados distintos en cada lado; propuesta de contrato único:
  campo `sin_visita / fotografiado / con_lectura / observado / validado` + sync (solo app) `pending / synced`.
- Identidad duplicada: `Usuarios` (web) vs `_ODT_Tecnicos` (app); la asignación es **por nombre** (frágil). Vincular `odtId ↔ userId` y asignar por id.
- Inventario: solo lectura; falta stock, kardex, saldo por persona.
- Endpoints nuevos sugeridos: `getJornadasSummary`, `getAllPointsExtended&since=`, `updateNotas`, `validatePoint`, `getThumbnail`, `getActivityFeed`, `getInventorySummary`, `linkOdtUser`, `getAnomalies` — todos con token y alcance por rol.

## 5. Plan

**Quick wins (1-3 días):** tema Tailwind 4 + `bg-black/N`; `createSheet` por POST; filtrar hojas del sistema; persistir jornada en URL; totales por técnico; rol normalizado; escapar colores; "SIN OBSERVACIÓN" en vez de "NO EJECUTA"; P227/MALCOM a configuración; limpiar ruta/campana/fecha/favicon; CSV con BOM y fórmulas neutralizadas; quitar credenciales y rotar contraseña.

**Mediano (1-3 semanas):** design system (Button, Card, StatCard, StatusBadge, DataTable virtualizada, Modal/Drawer accesibles, Toast, EmptyState, PageHeader, JornadaSwitcher, ErrorBoundary); layout responsive; `React.lazy` por ruta; TanStack Query; mapa con clustering y anomalías; galería única con miniaturas; PDF en Worker con un solo layout; observaciones persistentes; inventario con stock; reemplazar `xlsx`; borrar código muerto; vitest + lint en CI.

**Grande:** seguridad del backend (tokens firmados, autorización por acción, nada de PII en GET públicos); contrato compartido app↔dashboard; identidad unificada con login en la app; sincronización incremental; evaluar Firestore/Supabase si Apps Script no escala.

## 6. Imágenes a generar (estilo único: ilustración plana/semi-isométrica, sin texto, fondo transparente, técnicos peruanos con casco blanco y chaleco naranja)

1. Hero de login — técnico fotografiando un medidor en una calle de Puno, lago Titicaca y Andes al fondo.
2. Logo / ícono de app — rayo + pin + obturador.
3. Banner del dashboard — vista aérea abstracta de Puno con red eléctrica luminosa.
4. Vacío "sin jornada" — portapapeles con mapa doblado.
5. Vacío "sin resultados" — lupa sobre medidor con signo de pregunta.
6. Vacío "sin coordenadas" — mapa con pin ausente y brújula.
7. Vacío Reportes — documento con medidor en cero y lápiz.
8. Vacío Observados — carpeta con bandera de advertencia.
9. Vacío Inventario — caja de herramientas con medidores y cables.
10. Vacío Rastreo — técnico con celular y ondas de señal en pausa.
11. Usuarios — admin, supervisor y técnico juntos.
12. Error de conexión — nube con enchufe desconectado.
13. 404 — técnico mirando un mapa al revés junto a un poste.
14. Sesión expirada — candado con reloj de arena.
15. Sincronizando — foto viajando del celular a la nube.
16. "Cómo funciona" (4 viñetas) — Excel → asignar en mapa → foto y lectura → PDF.
17. Avatares por rol (3).
18. Íconos de categorías de inventario (EPP, herramientas, cable, equipo, vehículo).
19. Cabecera de PDF/acta TELCOM ENERGY.
20. Ilustración de exportación ZIP.
