// Correcciones.gs — Acción NUEVA «corregirSuministro» (no modifica ninguna otra).
//
// Problema que resuelve: el técnico escribe mal el suministro (p. ej. «g» o un
// dígito de menos). savePhoto no encuentra la fila de la lista y crea filas de
// foto solo con ese código, sin TECNICO, cliente, dirección, coordenadas de
// referencia, etc. El mapa muestra el punto «g» aparte y el real queda pendiente.
//
// Qué hace: en la jornada indicada, a cada FILA DE FOTO (columna A con Nº) con el
// código mal escrito le pone el código correcto en D y le copia B–W de la fila
// de la lista (columna A vacía) del código correcto: exactamente lo que savePhoto
// habría hecho si el técnico lo escribía bien. Las fotos se mueven a la carpeta
// del suministro correcto (el link no cambia). No borra filas.
// Cada cambio queda en la hoja «_Correcciones» con los valores anteriores.
//
// Seguridad:
//   - Dashboard: token de login de un usuario ADMIN o SUPERVISOR activo.
//   - App de campo: el ODT_ID del técnico registrado en «_ODT_Tecnicos». Solo corrige
//     SUS fotos (columna AH = su ID) y solo hacia un suministro que esté en la
//     lista de la jornada.
//
// INSTALACIÓN (2 pasos):
//   1. En el editor de Apps Script: Archivo > Nuevo > Secuencia de comandos,
//      nombre «Correcciones», y pegar este archivo completo.
//   2. En Code.gs, dentro del switch de doPost (junto a los demás «case»), agregar:
//        case 'corregirSuministro':
//          return handleCorregirSuministro(requestData);
//   Luego: Implementar > Gestionar implementaciones > editar (lápiz) >
//   Versión: «Nueva versión» > Implementar. La URL /exec sigue siendo la misma.

const CORRECCIONES_SHEET_NAME = '_Correcciones';
const CORRECCION_ROLES = ['ADMIN', 'SUPERVISOR'];
const CORRECCION_RADIO_M = 300; // filas de foto a esta distancia de la posición indicada

/**
 * requestData: {
 *   action: 'corregirSuministro', sheetName, original, corregido,
 *   token     // dashboard (ADMIN / SUPERVISOR)
 *   odtId     // o bien: app de campo (técnico registrado)
 *   lat?, lng?   // posición del punto mal escrito (para no tocar otra visita con el mismo error)
 *   simular?     // true = solo informa qué cambiaría, sin escribir
 * }
 */
function handleCorregirSuministro(requestData) {
  const lock = LockService.getScriptLock();
  try {
    const d = requestData || {};

    // ---- Autorización ----
    const odtId = d.token ? '' : correccion_norm_(d.odtId);
    const usuario = d.token ? correccion_usuarioAutorizado_(d.token) : correccion_tecnicoRegistrado_(odtId);
    if (!usuario) {
      return createResponse(false, d.token || !odtId
        ? 'No autorizado: inicia sesión en el dashboard como administrador o supervisor'
        : 'No autorizado: tu perfil de técnico no está registrado. Abre la app con internet e inténtalo otra vez');
    }

    // ---- Validación ----
    const sheetName = (d.sheetName || '').toString().trim();
    const original = correccion_norm_(d.original);
    const corregido = correccion_norm_(d.corregido);
    if (!sheetName || !original || !corregido) {
      return createResponse(false, 'Faltan datos: sheetName, original y corregido');
    }
    if (!/^\d+$/.test(corregido)) {
      return createResponse(false, 'El suministro corregido solo debe tener números');
    }
    if (original === corregido) {
      return createResponse(false, 'El suministro corregido es igual al original');
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return createResponse(false, 'Hoja no encontrada: ' + sheetName);
    if (detectSheetStructure(sheet) !== 'extended') {
      return createResponse(false, 'La corrección solo está disponible para hojas con estructura extendida');
    }

    // createSuministroFolder usa el mismo candado del script: se llama antes de tomarlo
    const carpeta = d.simular === true ? null : createSuministroFolder(sheetName, corregido);

    lock.waitLock(20000);

    const m = COLUMN_MAPPING.extended;
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return createResponse(false, 'La hoja está vacía');
    const data = sheet.getRange(2, 1, lastRow - 1, 36).getValues();
    const formulas = sheet.getRange(2, 1, lastRow - 1, 36).getFormulas();

    // ---- Filas de foto con el código mal escrito ----
    let filas = [];
    let fuente = null;
    let fotosPreviasDestino = 0;
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const sum = correccion_norm_(row[m.suministro]);
      const esFoto = !(row[m.numero] === '' || row[m.numero] === null);
      // El técnico solo corrige sus propias fotos
      const propia = !odtId || correccion_norm_(row[m.odtId]) === odtId;
      if (sum === original && esFoto && propia) filas.push(i);
      if (sum === corregido) {
        if (!esFoto && !fuente) fuente = row;
        if (esFoto) fotosPreviasDestino++;
      }
    }
    if (filas.length === 0) {
      return createResponse(false, (odtId ? 'No hay fotos tuyas' : 'No hay fotos registradas') +
        ' con el suministro «' + original + '» en ' + sheetName);
    }
    if (odtId && !fuente) {
      return createResponse(false, 'El suministro ' + corregido + ' no está en la lista de ' + sheetName +
        '. Desde la app solo se puede corregir a un suministro de la jornada');
    }

    // Si se indicó la posición, solo las fotos de esa visita (las que no tienen coordenadas también)
    const lat = parseFloat(d.lat);
    const lng = parseFloat(d.lng);
    if (!isNaN(lat) && !isNaN(lng)) {
      filas = filas.filter(function (i) {
        const fl = parseFloat(data[i][m.latReal]);
        const fg = parseFloat(data[i][m.longReal]);
        if (isNaN(fl) || isNaN(fg)) return true;
        return correccion_distancia_(lat, lng, fl, fg) <= CORRECCION_RADIO_M;
      });
      if (filas.length === 0) {
        return createResponse(false, 'Ninguna foto de «' + original + '» está cerca de la posición indicada');
      }
    }

    const resumen = {
      sheetName: sheetName,
      original: original,
      corregido: corregido,
      filas: filas.map(function (i) { return i + 2; }),
      fotos: filas.length,
      conFilaDeLista: !!fuente,
      fotosPreviasDestino: fotosPreviasDestino
    };
    if (d.simular === true) {
      return createResponse(true, 'Simulación: no se escribió nada', resumen);
    }

    // ---- Escribir: D = corregido y B–W desde la fila de la lista ----
    const log = correccion_hojaLog_(ss);
    const ahora = new Date();
    let fotosMovidas = 0;

    filas.forEach(function (i) {
      const fila = i + 2;
      const antes = sheet.getRange(fila, 2, 1, 22).getValues()[0]; // B–W
      const nuevo = antes.slice();
      if (fuente) {
        for (let c = 1; c <= 22; c++) nuevo[c - 1] = fuente[c] === null ? '' : fuente[c];
      }
      nuevo[m.suministro - 1] = fuente ? fuente[m.suministro] : corregido;
      sheet.getRange(fila, 2, 1, 22).setValues([nuevo]);

      // Mover la foto a la carpeta del suministro correcto (el link sigue igual)
      if (carpeta && carpeta.success) {
        try {
          const url = extractUrlFromHyperlink(formulas[i][m.linkCarpeta] || data[i][m.linkCarpeta]);
          const id = correccion_fileId_(url);
          if (id) {
            DriveApp.getFileById(id).moveTo(DriveApp.getFolderById(carpeta.folderId));
            fotosMovidas++;
          }
        } catch (err) {
          Logger.log('No se pudo mover la foto de la fila ' + fila + ': ' + err);
        }
      }

      log.appendRow([
        ahora, usuario.email, usuario.rol, sheetName, fila,
        original, corregido, fuente ? 'SI' : 'NO', JSON.stringify(antes)
      ]);
    });
    SpreadsheetApp.flush();
    // El código cambió sin agregar filas: que la búsqueda vuelva a leer esta jornada
    if (typeof indice_invalidar_ === 'function') indice_invalidar_(sheetName);

    resumen.fotosMovidas = fotosMovidas;
    return createResponse(true, 'Suministro corregido en ' + filas.length + ' foto(s)', resumen);

  } catch (error) {
    Logger.log('Error en corregirSuministro: ' + error);
    return createResponse(false, 'Error: ' + error.toString());
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/** Usuario {email, rol} si el token es válido, está activo y es ADMIN/SUPERVISOR. */
function correccion_usuarioAutorizado_(token) {
  if (!token) return null;
  const email = verifyToken(token);
  if (!email) return null;
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(USERS_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
  for (const row of rows) {
    if (row[0].toString().toLowerCase() !== email.toLowerCase()) continue;
    const rol = row[3].toString().toUpperCase();
    const activo = row[4].toString().toUpperCase() === 'TRUE';
    return activo && CORRECCION_ROLES.indexOf(rol) >= 0 ? { email: email, rol: rol } : null;
  }
  return null;
}

/** Técnico de la app {email, rol} si su ODT_ID está registrado en «_ODT_Tecnicos». */
function correccion_tecnicoRegistrado_(odtId) {
  if (!odtId) return null;
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(ODT_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  for (const row of rows) {
    if (correccion_norm_(row[0]) === odtId) {
      return { email: 'APP ' + row[1] + ' (' + odtId + ')', rol: 'TECNICO' };
    }
  }
  return null;
}

function correccion_hojaLog_(ss) {
  let sh = ss.getSheetByName(CORRECCIONES_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(CORRECCIONES_SHEET_NAME);
    sh.appendRow(['Fecha', 'Usuario', 'Rol', 'Jornada', 'Fila', 'Suministro escrito',
      'Suministro correcto', 'Datos de la lista copiados', 'Valores anteriores B–W (JSON)']);
    sh.getRange(1, 1, 1, 9).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function correccion_norm_(v) {
  if (v === null || v === undefined) return '';
  const s = v.toString().trim().replace(/\s+/g, '');
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

function correccion_fileId_(url) {
  if (!url) return '';
  const m = url.toString().match(/\/d\/([a-zA-Z0-9_-]+)/) || url.toString().match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : '';
}

function correccion_distancia_(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const r = function (x) { return x * Math.PI / 180; };
  const a = Math.pow(Math.sin(r(lat2 - lat1) / 2), 2) +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.pow(Math.sin(r(lng2 - lng1) / 2), 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}
