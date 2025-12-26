// CodeAdmin.gs - Backend para Dashboard TELCOM
// Este archivo gestiona usuarios, sesiones y reportes
// Separado del Code.gs de la app móvil

// ========== CONFIGURACIÓN ==========
const ADMIN_SPREADSHEET_ID = '1D37cWMwyeTn5jcjNRHB893SoyXFte-A5Rswr3nCsHTI';
const PUNTOS_SPREADSHEET_ID = '1_ET81oeRJ12gf1ZeU6l9nRBPsokCey9kG7b-5aIfOps';

// Duración de sesión en horas
const SESSION_DURATION_HOURS = 24;

// ========== ENDPOINTS ==========

function doGet(e) {
  try {
    // CORS headers
    const output = handleGetRequest(e);
    return output;
  } catch (error) {
    Logger.log('Error en doGet: ' + error);
    return createJsonResponse({ success: false, error: error.toString() });
  }
}

function doPost(e) {
  try {
    const output = handlePostRequest(e);
    return output;
  } catch (error) {
    Logger.log('Error en doPost: ' + error);
    return createJsonResponse({ success: false, error: error.toString() });
  }
}

function handleGetRequest(e) {
  const action = e.parameter.action;
  const token = e.parameter.token;

  // Acciones públicas (sin autenticación)
  if (action === 'test') {
    return createJsonResponse({
      success: true,
      message: 'Dashboard API v1.0 - Online',
      timestamp: new Date().toString()
    });
  }

  // Validar token para acciones protegidas
  if (action !== 'test') {
    const session = validateToken(token);
    if (!session && action !== 'login') {
      return createJsonResponse({ success: false, error: 'Token inválido o expirado' });
    }
  }

  switch (action) {
    case 'validateToken':
      return handleValidateToken(token);

    case 'getUsers':
      return handleGetUsers(token);

    case 'getStats':
      return handleGetStats(e.parameter.sheetName, token);

    case 'getReportHistory':
      return handleGetReportHistory(token);

    case 'getConfig':
      return handleGetConfig(token);

    // Obtener foto como imagen (para previsualización)
    case 'getPhotoImage':
      return handleGetPhotoImage(e.parameter.fileId);

    default:
      return createJsonResponse({ success: false, error: 'Acción no reconocida: ' + action });
  }
}

function handlePostRequest(e) {
  const data = JSON.parse(e.postData.contents);
  const action = data.action;

  // Login no requiere token
  if (action === 'login') {
    return handleLogin(data.email, data.password);
  }

  // Validar token para otras acciones
  const session = validateToken(data.token);
  if (!session) {
    return createJsonResponse({ success: false, error: 'Token inválido o expirado' });
  }

  switch (action) {
    case 'logout':
      return handleLogout(data.token);

    case 'createUser':
      return handleCreateUser(data.userData, session);

    case 'updateUser':
      return handleUpdateUser(data.userId, data.userData, session);

    case 'deleteUser':
      return handleDeleteUser(data.userId, session);

    case 'generateReport':
      return handleGenerateReport(data.reportData, session);

    case 'updateConfig':
      return handleUpdateConfig(data.key, data.value, session);

    default:
      return createJsonResponse({ success: false, error: 'Acción no reconocida: ' + action });
  }
}

// ========== AUTENTICACIÓN ==========

function handleLogin(email, password) {
  try {
    if (!email || !password) {
      return createJsonResponse({ success: false, error: 'Email y contraseña requeridos' });
    }

    const ss = SpreadsheetApp.openById(ADMIN_SPREADSHEET_ID);
    const usersSheet = ss.getSheetByName('Usuarios');

    if (!usersSheet) {
      return createJsonResponse({ success: false, error: 'Hoja de usuarios no encontrada' });
    }

    const data = usersSheet.getDataRange().getValues();
    const headers = data[0];

    // Buscar usuario por email
    const passwordHash = hashPassword(password);

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const userEmail = row[1]; // Columna B
      const userPassword = row[2]; // Columna C
      const userActivo = row[5]; // Columna F

      if (userEmail === email && userPassword === passwordHash && userActivo === true) {
        // Usuario válido, crear sesión
        const user = {
          id: row[0],
          email: row[1],
          nombre: row[3],
          rol: row[4]
        };

        const token = createSession(user);

        // Actualizar último login
        usersSheet.getRange(i + 1, 8).setValue(new Date()); // Columna H

        return createJsonResponse({
          success: true,
          token: token,
          user: user
        });
      }
    }

    return createJsonResponse({ success: false, error: 'Credenciales inválidas' });
  } catch (error) {
    Logger.log('Error en login: ' + error);
    return createJsonResponse({ success: false, error: error.toString() });
  }
}

function handleLogout(token) {
  try {
    const ss = SpreadsheetApp.openById(ADMIN_SPREADSHEET_ID);
    const sessionsSheet = ss.getSheetByName('Sesiones');

    if (!sessionsSheet) {
      return createJsonResponse({ success: true });
    }

    const data = sessionsSheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === token) {
        sessionsSheet.getRange(i + 1, 7).setValue(false); // Columna G = activo
        break;
      }
    }

    return createJsonResponse({ success: true, message: 'Sesión cerrada' });
  } catch (error) {
    return createJsonResponse({ success: false, error: error.toString() });
  }
}

function handleValidateToken(token) {
  const session = validateToken(token);

  if (session) {
    return createJsonResponse({
      success: true,
      user: {
        id: session.usuarioId,
        email: session.email,
        rol: session.rol
      }
    });
  }

  return createJsonResponse({ success: false, error: 'Token inválido' });
}

function createSession(user) {
  const ss = SpreadsheetApp.openById(ADMIN_SPREADSHEET_ID);
  let sessionsSheet = ss.getSheetByName('Sesiones');

  // Crear hoja si no existe
  if (!sessionsSheet) {
    sessionsSheet = ss.insertSheet('Sesiones');
    sessionsSheet.getRange(1, 1, 1, 7).setValues([['token', 'usuarioId', 'email', 'rol', 'createdAt', 'expiresAt', 'activo']]);
  }

  const token = Utilities.getUuid();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DURATION_HOURS * 60 * 60 * 1000);

  sessionsSheet.appendRow([
    token,
    user.id,
    user.email,
    user.rol,
    now,
    expires,
    true
  ]);

  return token;
}

function validateToken(token) {
  if (!token) return null;

  try {
    const ss = SpreadsheetApp.openById(ADMIN_SPREADSHEET_ID);
    const sessionsSheet = ss.getSheetByName('Sesiones');

    if (!sessionsSheet) return null;

    const data = sessionsSheet.getDataRange().getValues();
    const now = new Date();

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[0] === token && row[6] === true) { // token y activo
        const expires = new Date(row[5]);
        if (now < expires) {
          return {
            token: row[0],
            usuarioId: row[1],
            email: row[2],
            rol: row[3]
          };
        }
      }
    }
  } catch (error) {
    Logger.log('Error validando token: ' + error);
  }

  return null;
}

function hashPassword(password) {
  const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
  return hash.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

// ========== GESTIÓN DE USUARIOS ==========

function handleGetUsers(token) {
  const session = validateToken(token);
  if (!session || session.rol !== 'admin') {
    return createJsonResponse({ success: false, error: 'No autorizado' });
  }

  try {
    const ss = SpreadsheetApp.openById(ADMIN_SPREADSHEET_ID);
    const usersSheet = ss.getSheetByName('Usuarios');

    if (!usersSheet) {
      return createJsonResponse({ success: true, users: [] });
    }

    const data = usersSheet.getDataRange().getValues();
    const users = [];

    for (let i = 1; i < data.length; i++) {
      users.push({
        id: data[i][0],
        email: data[i][1],
        nombre: data[i][3],
        rol: data[i][4],
        activo: data[i][5],
        createdAt: data[i][6],
        lastLogin: data[i][7]
      });
    }

    return createJsonResponse({ success: true, users: users });
  } catch (error) {
    return createJsonResponse({ success: false, error: error.toString() });
  }
}

function handleCreateUser(userData, session) {
  if (session.rol !== 'admin') {
    return createJsonResponse({ success: false, error: 'No autorizado' });
  }

  try {
    const ss = SpreadsheetApp.openById(ADMIN_SPREADSHEET_ID);
    let usersSheet = ss.getSheetByName('Usuarios');

    if (!usersSheet) {
      usersSheet = ss.insertSheet('Usuarios');
      usersSheet.getRange(1, 1, 1, 8).setValues([['id', 'email', 'password', 'nombre', 'rol', 'activo', 'createdAt', 'lastLogin']]);
    }

    // Verificar email único
    const data = usersSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === userData.email) {
        return createJsonResponse({ success: false, error: 'Email ya existe' });
      }
    }

    const userId = Utilities.getUuid();
    const passwordHash = hashPassword(userData.password);

    usersSheet.appendRow([
      userId,
      userData.email,
      passwordHash,
      userData.nombre,
      userData.rol || 'tecnico',
      true,
      new Date(),
      null
    ]);

    return createJsonResponse({ success: true, userId: userId });
  } catch (error) {
    return createJsonResponse({ success: false, error: error.toString() });
  }
}

function handleUpdateUser(userId, userData, session) {
  if (session.rol !== 'admin') {
    return createJsonResponse({ success: false, error: 'No autorizado' });
  }

  try {
    const ss = SpreadsheetApp.openById(ADMIN_SPREADSHEET_ID);
    const usersSheet = ss.getSheetByName('Usuarios');

    if (!usersSheet) {
      return createJsonResponse({ success: false, error: 'Hoja de usuarios no encontrada' });
    }

    const data = usersSheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === userId) {
        if (userData.nombre) usersSheet.getRange(i + 1, 4).setValue(userData.nombre);
        if (userData.rol) usersSheet.getRange(i + 1, 5).setValue(userData.rol);
        if (userData.activo !== undefined) usersSheet.getRange(i + 1, 6).setValue(userData.activo);
        if (userData.password) usersSheet.getRange(i + 1, 3).setValue(hashPassword(userData.password));

        return createJsonResponse({ success: true });
      }
    }

    return createJsonResponse({ success: false, error: 'Usuario no encontrado' });
  } catch (error) {
    return createJsonResponse({ success: false, error: error.toString() });
  }
}

function handleDeleteUser(userId, session) {
  if (session.rol !== 'admin') {
    return createJsonResponse({ success: false, error: 'No autorizado' });
  }

  try {
    const ss = SpreadsheetApp.openById(ADMIN_SPREADSHEET_ID);
    const usersSheet = ss.getSheetByName('Usuarios');

    if (!usersSheet) {
      return createJsonResponse({ success: false, error: 'Hoja de usuarios no encontrada' });
    }

    const data = usersSheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === userId) {
        // Desactivar en lugar de eliminar
        usersSheet.getRange(i + 1, 6).setValue(false);
        return createJsonResponse({ success: true });
      }
    }

    return createJsonResponse({ success: false, error: 'Usuario no encontrado' });
  } catch (error) {
    return createJsonResponse({ success: false, error: error.toString() });
  }
}

// ========== ESTADÍSTICAS ==========

function handleGetStats(sheetName, token) {
  try {
    const ss = SpreadsheetApp.openById(PUNTOS_SPREADSHEET_ID);
    const sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      return createJsonResponse({
        success: true,
        stats: { total: 0, pendientes: 0, enProceso: 0, completados: 0, porcentaje: 0 }
      });
    }

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return createJsonResponse({
        success: true,
        stats: { total: 0, pendientes: 0, enProceso: 0, completados: 0, porcentaje: 0 }
      });
    }

    const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues(); // Columnas A-C

    // Agrupar por suministro
    const suministros = new Map();

    data.forEach(row => {
      const numero = row[0];
      const suministro = row[2] ? row[2].toString().trim() : '';

      if (!suministro) return;

      if (!suministros.has(suministro)) {
        suministros.set(suministro, { hasPhoto: false });
      }

      if (numero !== '' && numero !== null && numero !== undefined) {
        suministros.get(suministro).hasPhoto = true;
      }
    });

    const total = suministros.size;
    let completados = 0;

    suministros.forEach(value => {
      if (value.hasPhoto) completados++;
    });

    const pendientes = total - completados;
    const porcentaje = total > 0 ? Math.round((completados / total) * 10000) / 100 : 0;

    return createJsonResponse({
      success: true,
      stats: {
        total: total,
        pendientes: pendientes,
        enProceso: 0, // Se maneja localmente en la app
        completados: completados,
        porcentaje: porcentaje
      }
    });
  } catch (error) {
    return createJsonResponse({ success: false, error: error.toString() });
  }
}

// ========== REPORTES ==========

function handleGenerateReport(reportData, session) {
  try {
    const ss = SpreadsheetApp.openById(ADMIN_SPREADSHEET_ID);
    let reportesSheet = ss.getSheetByName('Reportes');

    if (!reportesSheet) {
      reportesSheet = ss.insertSheet('Reportes');
      reportesSheet.getRange(1, 1, 1, 7).setValues([['id', 'tipo', 'sheetName', 'generadoPor', 'fechaGeneracion', 'parametros', 'urlPdf']]);
    }

    const reportId = Utilities.getUuid();

    reportesSheet.appendRow([
      reportId,
      reportData.tipo || 'resumen',
      reportData.sheetName,
      session.usuarioId,
      new Date(),
      JSON.stringify(reportData.parametros || {}),
      '' // URL se agrega después si se genera PDF
    ]);

    // Aquí se podría generar el PDF y guardarlo en Drive
    // Por ahora solo registramos el reporte

    return createJsonResponse({
      success: true,
      reportId: reportId,
      message: 'Reporte registrado'
    });
  } catch (error) {
    return createJsonResponse({ success: false, error: error.toString() });
  }
}

function handleGetReportHistory(token) {
  try {
    const ss = SpreadsheetApp.openById(ADMIN_SPREADSHEET_ID);
    const reportesSheet = ss.getSheetByName('Reportes');

    if (!reportesSheet) {
      return createJsonResponse({ success: true, reports: [] });
    }

    const data = reportesSheet.getDataRange().getValues();
    const reports = [];

    for (let i = 1; i < data.length; i++) {
      reports.push({
        id: data[i][0],
        tipo: data[i][1],
        sheetName: data[i][2],
        generadoPor: data[i][3],
        fechaGeneracion: data[i][4],
        parametros: data[i][5],
        urlPdf: data[i][6]
      });
    }

    // Ordenar por fecha descendente
    reports.sort((a, b) => new Date(b.fechaGeneracion) - new Date(a.fechaGeneracion));

    return createJsonResponse({ success: true, reports: reports.slice(0, 50) });
  } catch (error) {
    return createJsonResponse({ success: false, error: error.toString() });
  }
}

// ========== FOTOS ==========

// Función para obtener imagen de Drive como base64 o URL directa
function handleGetPhotoImage(fileId) {
  try {
    if (!fileId) {
      return createJsonResponse({ success: false, error: 'fileId requerido' });
    }

    const file = DriveApp.getFileById(fileId);

    // Hacer el archivo público temporalmente para acceso
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // Construir URL de visualización directa
    const viewUrl = 'https://drive.google.com/uc?export=view&id=' + fileId;
    const thumbnailUrl = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w400';

    return createJsonResponse({
      success: true,
      fileId: fileId,
      fileName: file.getName(),
      mimeType: file.getMimeType(),
      viewUrl: viewUrl,
      thumbnailUrl: thumbnailUrl
    });
  } catch (error) {
    Logger.log('Error obteniendo foto: ' + error);
    return createJsonResponse({ success: false, error: error.toString() });
  }
}

// ========== CONFIGURACIÓN ==========

function handleGetConfig(token) {
  try {
    const ss = SpreadsheetApp.openById(ADMIN_SPREADSHEET_ID);
    const configSheet = ss.getSheetByName('Configuracion');

    if (!configSheet) {
      return createJsonResponse({ success: true, config: {} });
    }

    const data = configSheet.getDataRange().getValues();
    const config = {};

    for (let i = 1; i < data.length; i++) {
      config[data[i][0]] = data[i][1];
    }

    return createJsonResponse({ success: true, config: config });
  } catch (error) {
    return createJsonResponse({ success: false, error: error.toString() });
  }
}

function handleUpdateConfig(key, value, session) {
  if (session.rol !== 'admin') {
    return createJsonResponse({ success: false, error: 'No autorizado' });
  }

  try {
    const ss = SpreadsheetApp.openById(ADMIN_SPREADSHEET_ID);
    let configSheet = ss.getSheetByName('Configuracion');

    if (!configSheet) {
      configSheet = ss.insertSheet('Configuracion');
      configSheet.getRange(1, 1, 1, 3).setValues([['clave', 'valor', 'descripcion']]);
    }

    const data = configSheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === key) {
        configSheet.getRange(i + 1, 2).setValue(value);
        return createJsonResponse({ success: true });
      }
    }

    // Si no existe, agregar
    configSheet.appendRow([key, value, '']);
    return createJsonResponse({ success: true });
  } catch (error) {
    return createJsonResponse({ success: false, error: error.toString() });
  }
}

// ========== UTILIDADES ==========

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ========== FUNCIONES DE PRUEBA ==========

function testLogin() {
  const result = handleLogin('admin@telcom.com', 'admin');
  Logger.log(result.getContent());
}

function testCreateInitialAdmin() {
  // Usar esta función para crear el primer usuario admin
  const ss = SpreadsheetApp.openById(ADMIN_SPREADSHEET_ID);
  let usersSheet = ss.getSheetByName('Usuarios');

  if (!usersSheet) {
    usersSheet = ss.insertSheet('Usuarios');
    usersSheet.getRange(1, 1, 1, 8).setValues([['id', 'email', 'password', 'nombre', 'rol', 'activo', 'createdAt', 'lastLogin']]);
  }

  const userId = Utilities.getUuid();
  const passwordHash = hashPassword('admin'); // Contraseña: admin

  usersSheet.appendRow([
    userId,
    'admin@telcom.com',
    passwordHash,
    'Administrador',
    'admin',
    true,
    new Date(),
    null
  ]);

  Logger.log('Usuario admin creado con ID: ' + userId);
  Logger.log('Email: admin@telcom.com');
  Logger.log('Password: admin');
}

function testGetStats() {
  const result = handleGetStats('PruebaGps', null);
  Logger.log(result.getContent());
}
