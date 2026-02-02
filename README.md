# TelcomDashboard - Dashboard de Control TELCOM ENERGY

Dashboard web para supervision y gestion de jornadas de trabajo de campo. Complementa la app movil Flutter (Timestamp Camera) para el registro fotografico de suministros electricos.

## Demo en Vivo

**URL:** https://canazachyub.github.io/Telcomdashboard/

**Repositorio:** https://github.com/Canazachyub/Telcomdashboard

---

## Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React + Vite)                              │
│              React 19 + TypeScript + Vite 7 + TailwindCSS 4 + Leaflet       │
│                                                                              │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ │
│  │  Dashboard │ │    Mapa    │ │ Suministros│ │  Jornadas  │ │  Usuarios  │ │
│  │(Estadistic)│ │(Leaflet +  │ │ (Tabla +   │ │ (CRUD de   │ │ (Solo      │ │
│  │            │ │  Draw)     │ │  filtros)  │ │  hojas)    │ │  ADMIN)    │ │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘ └────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    ▼                                   ▼
┌───────────────────────────────────┐   ┌───────────────────────────────────┐
│     API UNIFICADA (Code.gs)       │   │       GOOGLE DRIVE                │
│     Misma API para todo           │   │       (Fotos)                     │
│                                   │   │                                   │
│  AUTENTICACION:                   │   │  Carpeta Principal:               │
│  - login                          │   │  1U3bChcueLtOURH9kI8goA6qxJ5Q0UHVW│
│  - getUsers / createUser          │   │                                   │
│  - updateUser / deleteUser        │   │  Estructura:                      │
│                                   │   │  /Jornada1/                       │
│  PUNTOS:                          │   │    /Suministro123/                │
│  - getAllPointsExtended           │   │      Foto_1.jpg                   │
│  - getStats                       │   │      Foto_2.jpg                   │
│  - getSuministros                 │   │                                   │
│  - getSuministrosByTecnico (NEW)  │   │                                   │
│                                   │   │                                   │
│  OPERACIONES:                     │   │                                   │
│  - savePhoto                      │   │                                   │
│  - assignTecnico                  │   │                                   │
│  - uploadSuministros              │   │                                   │
└───────────────────────────────────┘   └───────────────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                    GOOGLE SHEETS                                           │
│                    ID: 1_ET81oeRJ12gf1ZeU6l9nRBPsokCey9kG7b-5aIfOps       │
│                                                                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │  Usuarios   │  │  Jornada1   │  │  Jornada2   │  │  PruebaGps  │       │
│  │  (Auth)     │  │  (Extended) │  │  (Extended) │  │  (Extended) │       │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘       │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Stack Tecnologico

| Categoria | Tecnologia | Version | Notas |
|-----------|------------|---------|-------|
| Framework | React | 19.x | Con hooks |
| Lenguaje | TypeScript | 5.9.x | Strict mode |
| Build Tool | Vite | 7.x | HMR rapido |
| Estilos | TailwindCSS | 4.x | Usa `@import "tailwindcss"` |
| Mapa | React-Leaflet | 5.x | OpenStreetMap |
| Dibujo Mapa | Leaflet-Draw | 1.0.4 | Poligonos para asignacion |
| Estado | Zustand | 5.x | Store global con persistencia |
| HTTP | Axios | 1.x | Con interceptors |
| PDF | jsPDF | 3.x | Reportes individuales |
| ZIP | JSZip | 3.10.x | Exportar PDFs masivos |
| Excel | xlsx | 0.18.x | Importar suministros |
| Iconos | Lucide React | 0.562.x | SVG icons |

---

## Estructura del Proyecto

```
c:\PROGRAMACION\TelcomDashboard\
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx          # Menu lateral con navegacion por rol
│   │   │   ├── Header.tsx           # Barra superior con usuario y logout
│   │   │   └── Layout.tsx           # Wrapper principal
│   │   ├── gps/                     # Componentes de Rastreo GPS (NEW v1.6.0)
│   │   │   ├── GPSPanel.tsx         # Panel lateral con lista de tecnicos
│   │   │   └── GPSMarker.tsx        # Marcador de tecnico en mapa
│   │   └── PhotoGalleryModal.tsx    # Modal galeria de fotos
│   │
│   ├── pages/
│   │   ├── LoginPage.tsx            # Autenticacion con Google Sheets
│   │   ├── DashboardPage.tsx        # Estadisticas y graficos
│   │   ├── MapPage.tsx              # Mapa + asignacion de tecnicos por area
│   │   ├── SuministrosPage.tsx      # Tabla con filtros y paginacion
│   │   ├── JornadasPage.tsx         # Gestion de hojas/jornadas
│   │   ├── ReportesPage.tsx         # Generacion de reportes PDF
│   │   ├── InventoryPage.tsx        # Gestion de inventario de equipos
│   │   ├── RastreoPage.tsx          # Rastreo GPS por fotos (NEW v1.6.0)
│   │   └── UsersPage.tsx            # CRUD de usuarios (solo ADMIN)
│   │
│   ├── stores/
│   │   ├── authStore.ts             # Estado de autenticacion (Zustand)
│   │   ├── pointsStore.ts           # Estado de puntos/suministros
│   │   └── gpsStore.ts              # Estado de rastreo GPS por fotos (NEW v1.6.0)
│   │
│   ├── services/
│   │   ├── api.ts                   # Cliente HTTP base
│   │   ├── authService.ts           # login, getUsers, createUser, etc.
│   │   ├── pointsService.ts         # getAllPointsExtended, getStats
│   │   ├── tecnicoService.ts        # getTecnicos, assignTecnico
│   │   └── gpsService.ts            # Rastreo GPS desde fotos (NEW v1.6.0)
│   │
│   ├── types/
│   │   ├── user.ts                  # Interface User
│   │   ├── point.ts                 # GpsPoint, GpsPointExtended
│   │   ├── gps.ts                   # Tipos GPS: ODTTecnico, GPSEntity (NEW v1.6.0)
│   │   └── react-leaflet-draw.d.ts  # Tipos para leaflet-draw
│   │
│   ├── utils/
│   │   ├── driveUtils.ts            # Helpers para URLs de Google Drive
│   │   └── pdfGenerator.ts          # Generacion de reportes PDF
│   │
│   ├── config/
│   │   └── api.ts                   # URLs de APIs y config del mapa
│   │
│   ├── App.tsx                      # Router con rutas protegidas por rol
│   ├── main.tsx                     # Entry point
│   └── index.css                    # Estilos globales + Tailwind
│
├── .github/
│   └── workflows/
│       └── deploy.yml            # GitHub Actions para deploy automatico
│
├── public/
│   └── 404.html                  # Redirect para SPA en GitHub Pages
│
├── package.json
├── postcss.config.js
├── vite.config.ts                # Incluye base: '/Telcomdashboard/'
└── README.md
```

---

## Sistema de Autenticacion

### Roles y Permisos

| Funcionalidad | ADMIN | SUPERVISOR | TECNICO |
|--------------|-------|------------|---------|
| Dashboard | ✅ | ✅ | ✅ |
| Mapa | ✅ | ✅ | ✅ |
| Suministros (ver) | ✅ | ✅ | ✅ |
| Jornadas | ✅ | ✅ | ❌ |
| Reportes | ✅ | ✅ | ❌ |
| Subir Excel | ✅ | ✅ | ❌ |
| Exportar CSV | ✅ | ✅ | ❌ |
| Asignar Tecnicos | ✅ | ✅ | ❌ |
| Usuarios (CRUD) | ✅ | ❌ | ❌ |

### Hoja "Usuarios" en Google Sheets

| Col | Campo | Descripcion |
|-----|-------|-------------|
| A | email | Correo electronico (unico, login) |
| B | password | Hash SHA-256 (columna oculta) |
| C | nombre | Nombre completo |
| D | rol | ADMIN / SUPERVISOR / TECNICO |
| E | activo | TRUE / FALSE |
| F | telefono | Telefono (opcional) |
| G | jornadasAsignadas | Lista de jornadas o "*" para todas |
| H | intentosFallidos | Contador (bloqueo a los 5) |
| I | createdAt | Fecha de creacion |
| J | lastLogin | Ultimo acceso |

### Usuario Admin por Defecto

- **Email**: `energysupervision13@gmail.com`
- **Password**: `TELCOM2025@PERU`
- Se crea automaticamente al ejecutar `?action=initUsersSheet`

### Seguridad

- Passwords hasheados con SHA-256
- Token con expiracion de 24 horas
- Bloqueo automatico tras 5 intentos fallidos
- Verificacion de rol en frontend Y backend

---

## Estructura de Hojas de Datos

### Estructura EXTENDED (33 columnas) - Recomendada

Usada para hojas creadas desde el Dashboard.

| Col | Campo | Descripcion |
|-----|-------|-------------|
| A | Nº | Numero secuencial (vacio = fila fuente) |
| B | TECNICO | Nombre del tecnico asignado |
| C | Fecha_Contraste | Fecha de contraste |
| D | Suministro | Codigo de suministro |
| E | Codigo_Ruta | Ruta asignada |
| F | Cliente_Nombre | Nombre del cliente |
| G | Direccion | Direccion del punto |
| H | Distrito | Distrito |
| I-S | ... | Datos adicionales del medidor |
| T | LONGITUD | Coordenada referencial (-73.xxx) |
| U | LATITUD | Coordenada referencial (-13.xxx) |
| V | GIS | Datos GIS |
| W | ESTADO_TAREA | Estado de la tarea |
| X | Link_Carpeta | Link a foto en Drive |
| Y | GPS_Real | Coordenadas capturadas por app |
| Z | Ubicacion_Geo | Direccion geocodificada |
| AA | LAT_REAL | Latitud real capturada |
| AB | LONG_REAL | Longitud real capturada |
| AC | LECTURA | Lectura del medidor |
| AD | Foto_Count | Cantidad de fotos |
| AE | Photo_Links | JSON con links de fotos |
| AF | Synced_At | Fecha de sincronizacion |
| AG | Notas | Observacion de contrastacion (SI/NO/texto personalizado) |

**Importante - Fila Fuente vs Fila Foto:**
- Columna A **vacia** = Fila fuente (datos originales del Excel)
- Columna A **con numero** = Fila de foto sincronizada desde app

### Estructura LEGACY (9 columnas) - Compatibilidad

Para hojas antiguas de la app movil.

| Col | Campo |
|-----|-------|
| A | Numero |
| B | Fecha |
| C | Suministro |
| D | Link_Carpeta |
| E | UbicacionGPS |
| F | Ubicacion |
| G | LAT_REF |
| H | LONG_REF |
| I | LECTURA |

---

## Estados de Suministros

| Estado | Color | Icono | Condicion |
|--------|-------|-------|-----------|
| Pendiente | Rojo | 🔴 | `photoCount === 0` |
| En Proceso | Amarillo | 🟡 | `photoCount > 0 && !latReal` |
| Completado | Verde | 🟢 | `photoCount > 0 && latReal` |

**Funcion:** `getPointStatus(point)` en `src/types/point.ts`

---

## API Endpoints (Google Apps Script)

### Archivo Backend

```
c:\PROGRAMACION\Apptelcom\timestamp_camera\google_apps_script\Code.gs
```

### GET Endpoints

| Action | Parametros | Descripcion |
|--------|------------|-------------|
| `getSheets` | - | Lista de hojas/jornadas |
| `getSuministros` | `sheetName` | Suministros unicos (app movil) |
| `getAllPoints` | `sheetName` | Puntos para mapa (app movil) |
| `getAllPointsExtended` | `sheetName` | Puntos con todos los campos (dashboard) |
| `getStats` | `sheetName` | Estadisticas por estado/tecnico/distrito |
| `getSheetMetadata` | - | Metadata de todas las hojas |
| `initUsersSheet` | - | Crear hoja Usuarios con admin |
| `getSuministrosByTecnico` | `sheetName`, `tecnico` | Suministros asignados a un tecnico |
| `getTrackingFromPhotos` | - | **NEW v1.6.0** Ubicacion de tecnicos basada en ultima foto |

### POST Endpoints

```javascript
// AUTENTICACION
{ "action": "login", "email": "...", "password": "..." }
{ "action": "getUsers" }
{ "action": "createUser", "email": "...", "password": "...", "nombre": "...", "rol": "..." }
{ "action": "updateUser", "id": "...", "nombre": "...", "rol": "...", "activo": true }
{ "action": "deleteUser", "id": "..." }

// FOTOS Y JORNADAS
{ "action": "savePhoto", "photoData": { ... } }
{ "action": "createSheet", "sheetName": "..." }
{ "action": "uploadSuministros", "sheetName": "...", "createNew": true, "suministros": [...] }
{ "action": "assignTecnico", "sheetName": "...", "suministros": [...], "tecnicoNombre": "..." }
```

---

## Funcionalidades Principales

### 1. Dashboard (DashboardPage.tsx)
- Estadisticas generales: total, pendientes, en proceso, completados
- Grafico de progreso por tecnico
- Grafico de avance por distrito
- Selector de jornada activa

### 2. Mapa Interactivo (MapPage.tsx)
- Visualizacion de todos los puntos con coordenadas
- Marcadores coloreados por estado (rojo/amarillo/verde)
- Panel de filtros colapsable: estado, tecnico, distrito, busqueda
- **Asignacion de tecnicos por area:**
  1. Click en boton "Asignar" (verde)
  2. Dibujar poligono de 3-5 puntos en el mapa
  3. El sistema detecta automaticamente los puntos dentro del area
  4. Modal para seleccionar tecnico de la lista
  5. Asignacion en lote (actualiza columna B: TECNICO)
- Ver fotos desde popup del marcador

### 3. Suministros (SuministrosPage.tsx)
- Tabla paginada con todos los suministros
- Filtros por estado, tecnico, distrito
- Busqueda por codigo de suministro
- Ver fotos en modal galeria
- Subir Excel para agregar suministros (SUPERVISOR+)
- Exportar a CSV (SUPERVISOR+)

### 4. Jornadas (JornadasPage.tsx)
- Lista de todas las hojas/jornadas
- Crear nueva jornada con estructura EXTENDED
- Ver estadisticas por jornada
- Seleccionar jornada activa

### 5. Reportes (ReportesPage.tsx)
- Tabla de suministros con lectura registrada
- Campo de observacion editable por suministro
- Carga automatica de observaciones desde servidor (campo `notas`)
- Generacion de PDF individual (Anexo Fotografico)
- **Exportar masivo a ZIP** (nuevo v1.3.0):
  - Boton "Exportar X PDFs" genera todos los anexos
  - Opcion "Sin imagenes" (rapido) - PDFs con links
  - Opcion "Con imagenes" (lento) - PDFs con fotos embebidas
  - Barra de progreso en tiempo real
  - Descarga automatica del archivo ZIP
- **Exportar por Categoria de Observacion** (nuevo v1.5.0):
  - Clasificacion automatica por tipo de observacion:
    - **EJECUTADOS** (verde): Contrastacion realizada
    - **NO EJECUTADOS** (rojo): Contrastacion no realizada + sin observacion
    - **CON OBSERVACIONES** (ambar): Observaciones personalizadas
  - Resumen visual de conteos por categoria en modal
  - Exportar ZIP separado por cada categoria (con imagenes)
  - Items sin observacion se consideran NO EJECUTADOS por defecto

### 6. Usuarios (UsersPage.tsx) - Solo ADMIN
- Tabla de usuarios con estado
- Crear nuevo usuario
- Editar usuario existente
- Desactivar/activar usuario
- Cambiar contraseña
- Desbloquear usuario (reset intentos fallidos)

### 7. Rastreo GPS por Fotos (RastreoPage.tsx) - NEW v1.6.0

Sistema de rastreo de tecnicos basado en la ubicacion de su ultima foto sincronizada.

**Caracteristicas:**
- **Mapa interactivo** con marcadores de tecnicos (iniciales del nombre)
- **Panel lateral** con lista de tecnicos y estadisticas
- **Estados de actividad:**
  - 🟢 **Activo**: Ultima foto hace menos de 2 horas
  - ⚪ **Inactivo**: Ultima foto hace mas de 2 horas
- **Informacion por tecnico:**
  - Nombre y telefono
  - Coordenadas de ultima ubicacion
  - Tiempo transcurrido desde ultima foto
  - Enlace para ver la ultima foto
- **Auto-refresh** configurable (default: 60 segundos)
- **Filtros:** Buscar por nombre, mostrar solo activos

**Arquitectura:**
```
App Movil (Flutter)                Dashboard (React)
     │                                   │
     │ Toma foto con GPS                 │
     ▼                                   │
Google Sheets                            │
  └── _ODT_Tecnicos                      │
       ├── ID (8 chars)                  │
       ├── Nombre                        │
       ├── Telefono                      │
       ├── Ultima Foto (timestamp)       │
       ├── Lat/Long                      │
       └── FotosCount                    │
                                         │
                    getTrackingFromPhotos│
                    ◄────────────────────┤
                                         ▼
                                    RastreoPage
                                         │
                                    ┌────┴────┐
                                    │  Mapa   │
                                    │ Markers │
                                    └─────────┘
```

**Diferencia con GPS tradicional:**
- NO requiere app GPS separada ni tracker externo
- Usa las coordenadas EXIF de las fotos que ya toman los tecnicos
- Ubicacion "pasiva" - se actualiza cada vez que sincronizan fotos

---

## Configuracion

### config/api.ts

```typescript
// API unificada (app movil + dashboard) - Actualizada 25/12/2025
export const API_POINTS = 'https://script.google.com/macros/s/AKfycbyeqP84CJ2cvaEVIIWF8DnY4D71x1SBhMvCL_ufyKpcuJMnNWYvEH39PWmfXtSiYKJD/exec';

// Configuracion del mapa (Puno, Peru)
export const MAP_CONFIG = {
  defaultCenter: [-15.8402, -70.0219] as [number, number],
  defaultZoom: 13,
  tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  tileAttribution: '© OpenStreetMap contributors',
};

// Colores del tema
export const COLORS = {
  primary: '#2563eb',
  secondary: '#64748b',
  success: '#22c55e',
  warning: '#eab308',
  danger: '#ef4444',
};
```

**IMPORTANTE:** Usar clases `bg-blue-600`, `bg-green-600`, etc. NO usar `primary-*`.

---

## Visualizacion de Fotos de Google Drive

### Problema CORS
Google Drive bloquea peticiones directas de imagenes desde dominios externos.

### Solucion Implementada
Se usa **iframe** con URL `/preview` para mostrar imagenes en vista completa:

```typescript
// src/utils/driveUtils.ts

// Extraer ID del archivo de cualquier URL de Drive
extractDriveFileId(url) → fileId

// Para thumbnails en galeria (funciona en img tag)
getDriveThumbnailUrl(url, 'w400') → https://drive.google.com/thumbnail?id=FILE_ID&sz=w400

// Para vista completa (usar en iframe, NO en img)
previewUrl = `https://drive.google.com/file/d/${fileId}/preview`
```

---

## Instalacion y Desarrollo

```bash
# Clonar repositorio
git clone https://github.com/Canazachyub/Telcomdashboard.git
cd Telcomdashboard

# Instalar dependencias
npm install

# Ejecutar en desarrollo (http://localhost:5173/Telcomdashboard/)
npm run dev

# Compilar para produccion
npm run build

# Previsualizar build
npm run preview

# Lint
npm run lint
```

---

## Despliegue a GitHub Pages

El proyecto esta configurado para desplegarse automaticamente en GitHub Pages usando GitHub Actions.

### Configuracion Actual

1. **Base Path:** `/Telcomdashboard/` configurado en `vite.config.ts`
2. **Router Basename:** `<BrowserRouter basename="/Telcomdashboard">` en `App.tsx`
3. **SPA Routing:** `404.html` redirige rutas al index para soporte de React Router

### Deploy Automatico

Cada push a la rama `main` dispara el workflow de GitHub Actions:

```yaml
# .github/workflows/deploy.yml
- Checkout del codigo
- Setup Node.js 20
- npm ci
- npm run build
- Deploy a GitHub Pages
```

### Deploy Manual

```bash
# Compilar el proyecto
npm run build

# El contenido de ./dist se despliega automaticamente
git add .
git commit -m "Update"
git push origin main
```

### URLs del Proyecto

| Entorno | URL |
|---------|-----|
| Produccion | https://canazachyub.github.io/Telcomdashboard/ |
| Desarrollo | http://localhost:5173/Telcomdashboard/ |

---

## Dependencias Principales

```json
{
  "react": "^19.2.0",
  "react-dom": "^19.2.0",
  "react-router-dom": "^7.11.0",
  "zustand": "^5.0.9",
  "leaflet": "^1.9.4",
  "react-leaflet": "^5.0.0",
  "leaflet-draw": "^1.0.4",
  "react-leaflet-draw": "^0.21.0",
  "axios": "^1.13.2",
  "lucide-react": "^0.562.0",
  "jspdf": "^3.0.4",
  "xlsx": "^0.18.5"
}
```

---

## Relacion con App Movil Flutter

```
c:\PROGRAMACION\Apptelcom\
├── timestamp_camera/
│   ├── lib/                      # Codigo Dart de la app
│   └── google_apps_script/
│       └── Code.gs               # Backend compartido
│
c:\PROGRAMACION\TelcomDashboard\  # Este proyecto (Dashboard React)
```

### Flujo de Datos

```
1. ADMIN/SUPERVISOR sube Excel con suministros → Dashboard
2. SUPERVISOR asigna tecnicos dibujando areas en mapa → Dashboard
3. TECNICO abre app movil, selecciona su nombre → Flutter App
4. App muestra solo suministros asignados a ese tecnico
5. TECNICO toma foto en campo → Flutter App
6. Foto se sincroniza → Google Drive + Google Sheets
7. Dashboard actualiza estadisticas en tiempo real
8. SUPERVISOR genera reportes PDF → Dashboard
```

### Endpoint para App Movil (Filtrar por Tecnico)

```
GET ?action=getSuministrosByTecnico&sheetName=Jornada1&tecnico=Juan%20Perez
```

Retorna solo los suministros donde columna B (TECNICO) coincide con el nombre.

### Filtro por Tecnico en App Movil Flutter

La app movil Flutter v2.2.0 ahora incluye:
- **Dropdown de tecnicos** en pantalla de mapa
- **Lista dinamica** de tecnicos unicos por hoja
- **Campo `tecnico`** sincronizado desde Google Sheets via endpoint `getAllPoints`
- **Base de datos SQLite v4** con columna `tecnico` para cache local

---

## Notas Importantes

1. **Deteccion de estructura:** El backend detecta automaticamente si una hoja es LEGACY o EXTENDED basandose en si la columna B contiene "TECNICO".

2. **Coordenadas Peru:**
   - Latitud: -3 a -18 (columna U)
   - Longitud: -68 a -81 (columna T)

3. **Asignacion de tecnicos:** Solo funciona en hojas EXTENDED (estructura de 33 columnas).

4. **TailwindCSS 4:** Usa `@import "tailwindcss"` en index.css, no `@tailwind`.

5. **Formularios POST:** Usar FormData con campo `payload` para evitar CORS.

---

## Archivos Clave para Modificaciones

| Archivo | Proposito |
|---------|-----------|
| `src/config/api.ts` | URLs de APIs |
| `src/pages/MapPage.tsx` | Mapa + asignacion de tecnicos |
| `src/pages/SuministrosPage.tsx` | Tabla + subir Excel |
| `src/stores/pointsStore.ts` | Estado global de puntos |
| `src/stores/authStore.ts` | Estado de autenticacion |
| `src/services/tecnicoService.ts` | Asignacion de tecnicos |
| `src/types/point.ts` | Tipos + getPointStatus |
| `Code.gs` | Backend completo |

---

## Historial de Cambios Recientes

### v1.6.0 (02/02/2026) - Rastreo GPS por Fotos (ODT)

Sistema de rastreo de tecnicos basado en ubicacion de ultima foto sincronizada.

**Backend (Code.gs):**
- **NEW:** Hoja `_ODT_Tecnicos` para registro de operadores
- **NEW:** Funcion `handleGetTrackingFromPhotos()` - obtiene ubicacion desde fotos
- **NEW:** Funcion `incrementODTFotoCount()` - contador de fotos por tecnico
- **NEW:** Endpoint `?action=getTrackingFromPhotos` en doGet
- **MOD:** `savePhotoExtended()` actualiza ubicacion del tecnico al sincronizar

**Frontend (Dashboard):**
- **NEW:** Pagina `RastreoPage.tsx` - mapa de rastreo GPS
- **NEW:** Componente `GPSPanel.tsx` - panel lateral con lista de tecnicos
- **NEW:** Componente `GPSMarker.tsx` - marcador personalizado con inicial
- **NEW:** Store `gpsStore.ts` - estado Zustand para rastreo
- **NEW:** Service `gpsService.ts` - comunicacion con API de rastreo
- **NEW:** Types `gps.ts` - interfaces ODTTecnico, GPSEntity, GPSStats
- **NEW:** Ruta `/rastreo` en sidebar para acceso rapido
- **NEW:** Auto-refresh cada 60 segundos

**App Movil (Flutter):**
- **NEW:** Sistema ODT (Operator Device Tracking) con ID de 8 caracteres
- **NEW:** Modelo `UserProfile` con generacion automatica de ID
- **NEW:** Pantalla de configuracion de perfil del tecnico
- **NEW:** ID ODT se envia con cada foto sincronizada
- **MOD:** IDs reducidos de 32 hex a 8 alfanumericos (218 billones combinaciones)

### v1.5.0 (19/01/2026) - Exportacion por Categoria de Observacion
- **NEW:** Clasificacion automatica de observaciones desde app movil
  - `EJECUTADOS`: "CONTRATISTA MALCOM EJECUTO EL CONTRASTE EN LA FECHA PROGRAMADA"
  - `NO EJECUTADOS`: "CONTRATISTA MALCOM NO EJECUTA EL CONTRASTE EN LA FECHA PROGRAMADA"
  - `CON OBSERVACIONES`: Cualquier texto personalizado
- **NEW:** Resumen visual por categoria en modal de exportacion
- **NEW:** Botones de exportacion por categoria (con imagenes):
  - EJECUTADOS (verde)
  - NO EJECUTADOS (rojo) - incluye items sin observacion
  - CON OBSERVACIONES (ambar)
- **NEW:** Carga automatica de observaciones del servidor (campo `notas`) al cargar pagina
- **NEW:** ZIP nombrado por categoria: `Anexos_EJECUTADOS_Jornada_2026-01-19.zip`
- **IMP:** Items sin observacion se clasifican como NO EJECUTADOS por defecto

### v1.4.0 (26/12/2025) - Despliegue a GitHub Pages
- **NEW:** Repositorio publico en GitHub: https://github.com/Canazachyub/Telcomdashboard
- **NEW:** Despliegue automatico con GitHub Actions
- **NEW:** URL de produccion: https://canazachyub.github.io/Telcomdashboard/
- **NEW:** Soporte SPA routing con 404.html redirect
- **FIX:** Agregado `basename="/Telcomdashboard"` al BrowserRouter
- **FIX:** Configurado `base: '/Telcomdashboard/'` en vite.config.ts
- **FIX:** Manejo mejorado de tokens expirados en UsersPage

### v1.3.1 (26/12/2025) - Correcciones de Fotos y PDFs
- **FIX:** PhotoGalleryModal - Corregido error CSP al visualizar fotos (cambiado iframe por img)
- **FIX:** PhotoGalleryModal - Agregados guards para fotos vacias o undefined
- **FIX:** Code.gs - Deteccion de URLs sin formula HIPERVINCULO (URLs planas)
- **FIX:** PDF Footer - Removida fecha/hora, solo muestra "TELCOM ENERGY - Sistema de Supervision"
- **FIX:** Exportacion ZIP - Carga secuencial de imagenes con multiples URLs de respaldo
- **FIX:** Exportacion ZIP - Delay de 300ms entre imagenes para evitar rate limiting
- **IMP:** driveUtils.ts - Funcion `getDriveUrls` retorna 4 formatos de URL diferentes

### v1.3.0 (25/12/2025) - Exportar PDFs masivo a ZIP
- **NEW:** Boton "Exportar X PDFs" en pagina de Reportes
- **NEW:** Modal de seleccion: con imagenes (lento) o sin imagenes (rapido)
- **NEW:** Barra de progreso en tiempo real durante generacion
- **NEW:** Empaquetado automatico en archivo ZIP con JSZip
- **NEW:** Funciones `generateReportePDFBlob` y `generateReportePDFSimpleBlob`
- **DEP:** Agregada dependencia `jszip@3.10.1`

### v1.2.0 (25/12/2025) - Filtro por Tecnico en App Movil
- **Nuevo deployment API** con soporte para campo `tecnico` en getAllPoints
- **Campo tecnico** incluido en respuesta del endpoint getAllPoints
- **Sincronizado con app Flutter** v2.2.0 para filtro por tecnico
- **URL API actualizada:** `AKfycbyeqP84CJ2cvaEVIIWF8DnY4D71x1SBhMvCL_ufyKpcuJMnNWYvEH39PWmfXtSiYKJD`

### v1.1.0 (24/12/2025) - Autenticacion con Google Sheets
- Hoja "Usuarios" con roles y permisos
- Login con hash SHA-256
- Bloqueo por intentos fallidos
- Token con expiracion

### v1.0.0 - Asignacion de Tecnicos por Area (MapPage.tsx)
- Integracion con leaflet-draw
- Dibujo de poligonos de 3-5 puntos
- Algoritmo ray-casting para detectar puntos
- Modal para seleccionar tecnico
- Endpoint `assignTecnico` para actualizar en lote

### Optimizacion del Mapa
- Eliminado panel de lista redundante
- Simplificado a poligono maximo 5 puntos
- Limpieza automatica del dibujo

### Endpoint para Tecnicos (App Movil)
- `getSuministrosByTecnico` para filtrar asignaciones
- Permite a tecnicos ver solo sus suministros

---

## Licencia

Proyecto privado - TELCOM ENERGY © 2025
