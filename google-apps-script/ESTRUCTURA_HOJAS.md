# Estructura de Hojas - Dashboard TELCOM

Google Spreadsheet ID: `1D37cWMwyeTn5jcjNRHB893SoyXFte-A5Rswr3nCsHTI`

---

## Hoja 1: Usuarios

| Columna | Campo | Tipo | Descripción |
|---------|-------|------|-------------|
| A | id | TEXT | UUID único (generado automáticamente) |
| B | email | TEXT | Email del usuario (login) |
| C | password | TEXT | Hash SHA256 de la contraseña |
| D | nombre | TEXT | Nombre completo |
| E | rol | TEXT | admin / supervisor / tecnico |
| F | activo | BOOLEAN | TRUE / FALSE |
| G | createdAt | DATE | Fecha de creación |
| H | lastLogin | DATE | Último acceso |

**Ejemplo de datos:**
```
id                                    | email              | password                                                          | nombre              | rol        | activo | createdAt  | lastLogin
--------------------------------------+--------------------+-------------------------------------------------------------------+---------------------+------------+--------+------------+-----------
550e8400-e29b-41d4-a716-446655440000 | admin@telcom.com   | 8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918 | Administrador       | admin      | TRUE   | 2025-01-01 | 2025-12-22
550e8400-e29b-41d4-a716-446655440001 | supervisor@telcom.com | (hash)                                                         | Juan Pérez          | supervisor | TRUE   | 2025-03-15 | 2025-12-21
```

**Nota:** La contraseña por defecto "admin" tiene hash: `8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918`

---

## Hoja 2: Sesiones

| Columna | Campo | Tipo | Descripción |
|---------|-------|------|-------------|
| A | token | TEXT | Token de sesión (UUID) |
| B | usuarioId | TEXT | ID del usuario |
| C | email | TEXT | Email del usuario |
| D | rol | TEXT | Rol del usuario |
| E | createdAt | DATETIME | Fecha/hora de creación |
| F | expiresAt | DATETIME | Fecha/hora de expiración |
| G | activo | BOOLEAN | TRUE si la sesión está activa |

---

## Hoja 3: Reportes

| Columna | Campo | Tipo | Descripción |
|---------|-------|------|-------------|
| A | id | TEXT | UUID del reporte |
| B | tipo | TEXT | resumen / detallado / fotos |
| C | sheetName | TEXT | Jornada del reporte |
| D | generadoPor | TEXT | ID del usuario que generó |
| E | fechaGeneracion | DATETIME | Fecha/hora de generación |
| F | parametros | TEXT | JSON con filtros aplicados |
| G | urlPdf | TEXT | URL del PDF en Drive (si se guardó) |

---

## Hoja 4: Configuracion

| Columna | Campo | Tipo | Descripción |
|---------|-------|------|-------------|
| A | clave | TEXT | Nombre de la configuración |
| B | valor | TEXT | Valor de la configuración |
| C | descripcion | TEXT | Descripción |

**Valores iniciales:**
```
clave                    | valor                                          | descripcion
-------------------------+------------------------------------------------+---------------------------
SPREADSHEET_PUNTOS_ID    | 1_ET81oeRJ12gf1ZeU6l9nRBPsokCey9kG7b-5aIfOps  | ID del Spreadsheet de puntos (app móvil)
FOLDER_REPORTES_ID       | (crear carpeta)                                | Carpeta para guardar PDFs
SESSION_DURATION_HOURS   | 24                                             | Duración de sesión en horas
APP_NAME                 | TELCOM Dashboard                               | Nombre de la aplicación
```

---

## Hoja 5: Jornadas (opcional)

| Columna | Campo | Tipo | Descripción |
|---------|-------|------|-------------|
| A | id | TEXT | UUID de la jornada |
| B | nombre | TEXT | Nombre de la jornada |
| C | sheetName | TEXT | Nombre de la hoja en Spreadsheet de puntos |
| D | fechaInicio | DATE | Fecha de inicio |
| E | fechaFin | DATE | Fecha de fin |
| F | supervisorId | TEXT | ID del supervisor asignado |
| G | estado | TEXT | activa / pausada / completada |
| H | descripcion | TEXT | Descripción de la jornada |

---

## Crear las hojas manualmente:

1. Abre: https://docs.google.com/spreadsheets/d/1D37cWMwyeTn5jcjNRHB893SoyXFte-A5Rswr3nCsHTI
2. Crea las hojas: `Usuarios`, `Sesiones`, `Reportes`, `Configuracion`
3. Agrega los encabezados en la fila 1 de cada hoja
4. En `Usuarios`, agrega al menos un usuario admin con:
   - email: `admin@telcom.com`
   - password: `8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918` (es "admin")
   - nombre: `Administrador`
   - rol: `admin`
   - activo: `TRUE`
