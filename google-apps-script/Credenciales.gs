// Credenciales.gs — Acciones NUEVAS «registrarCredencial» y «getCredenciales» (no modifican ninguna otra).
//
// Al instalar la app, el técnico registra correo, foto de credencial y la
// ubicación donde se registró. Así el dashboard lo muestra en Rastreo y hay datos
// para crearle usuario.
//
// - registrarCredencial (POST, app): { odtId, correo, lat, lng, precision, ubicacion, fotoBase64 }
//   El técnico ya debe estar en «_ODT_Tecnicos» (registerODT). Guarda las columnas
//   H–N de su fila y la foto en la carpeta «_Credenciales» de Drive (privada).
// - getCredenciales (POST, dashboard): { token } de ADMIN / SUPERVISOR. Datos
//   personales: no hay versión GET pública. Devuelve la foto en base64.
//
// Usa correccion_norm_ y correccion_usuarioAutorizado_ de la sección de correcciones.

const CREDENCIAL_COLS = ['Correo', 'Lat_Registro', 'Lng_Registro', 'Precision_m', 'Ubicacion_Registro',
  'Foto_Credencial', 'Fecha_Credencial'];
const CREDENCIAL_COL_INICIO = 8; // H
const CREDENCIALES_CARPETA = '_Credenciales';
const CREDENCIAL_FOTO_MAX = 3000000; // caracteres base64 (~2 MB)

function credencial_hoja_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName(ODT_SHEET_NAME);
  if (!sh) return null;
  // Encabezados H–N (solo si faltan)
  const head = sh.getRange(1, CREDENCIAL_COL_INICIO, 1, CREDENCIAL_COLS.length).getValues()[0];
  if (head.some(function (h, i) { return String(h) !== CREDENCIAL_COLS[i]; })) {
    sh.getRange(1, CREDENCIAL_COL_INICIO, 1, CREDENCIAL_COLS.length).setValues([CREDENCIAL_COLS]).setFontWeight('bold');
  }
  return sh;
}

function credencial_carpeta_() {
  const raiz = DriveApp.getFolderById(MAIN_FOLDER_ID);
  const it = raiz.getFoldersByName(CREDENCIALES_CARPETA);
  return it.hasNext() ? it.next() : raiz.createFolder(CREDENCIALES_CARPETA);
}

function credencial_fileId_(url) {
  const m = String(url || '').match(/\/d\/([a-zA-Z0-9_-]+)/) || String(url || '').match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : '';
}

function handleRegistrarCredencial(requestData) {
  const lock = LockService.getScriptLock();
  try {
    const d = requestData || {};
    const odtId = correccion_norm_(d.odtId);
    const correo = String(d.correo || '').trim().toLowerCase();
    if (!odtId) return createResponse(false, 'Falta el ID del técnico');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return createResponse(false, 'Correo no válido');
    const foto = String(d.fotoBase64 || '').replace(/^data:image\/\w+;base64,/, '');
    if (foto.length > CREDENCIAL_FOTO_MAX) return createResponse(false, 'La foto es demasiado grande');

    const sh = credencial_hoja_();
    if (!sh) return createResponse(false, 'No hay técnicos registrados todavía');

    lock.waitLock(20000);
    const last = sh.getLastRow();
    let fila = -1;
    if (last >= 2) {
      const ids = sh.getRange(2, 1, last - 1, 1).getValues();
      for (let i = 0; i < ids.length; i++) {
        if (correccion_norm_(ids[i][0]) === odtId) { fila = i + 2; break; }
      }
    }
    if (fila < 0) {
      return createResponse(false, 'No autorizado: tu perfil de técnico no está registrado. Abre la app con internet e inténtalo otra vez');
    }

    const actual = sh.getRange(fila, CREDENCIAL_COL_INICIO, 1, CREDENCIAL_COLS.length).getValues()[0];
    let fotoUrl = actual[5] || '';
    if (foto) {
      const nombre = String(sh.getRange(fila, 2).getValue() || odtId);
      const blob = Utilities.newBlob(Utilities.base64Decode(foto), 'image/jpeg', 'credencial_' + odtId + '.jpg');
      const archivo = credencial_carpeta_().createFile(blob);
      archivo.setDescription('Credencial de ' + nombre + ' (ODT ' + odtId + ')');
      // La foto anterior va a la papelera (recuperable 30 días)
      const anterior = credencial_fileId_(fotoUrl);
      if (anterior) {
        try { DriveApp.getFileById(anterior).setTrashed(true); } catch (e) {}
      }
      fotoUrl = archivo.getUrl();
    }

    const lat = parseFloat(d.lat);
    const lng = parseFloat(d.lng);
    const prec = parseFloat(d.precision);
    const tieneGps = !isNaN(lat) && !isNaN(lng);
    sh.getRange(fila, CREDENCIAL_COL_INICIO, 1, CREDENCIAL_COLS.length).setValues([[
      correo,
      tieneGps ? lat : actual[1],
      tieneGps ? lng : actual[2],
      tieneGps && !isNaN(prec) ? Math.round(prec) : actual[3],
      tieneGps ? String(d.ubicacion || '') : actual[4],
      fotoUrl,
      new Date()
    ]]);
    sh.getRange(fila, 6).setValue(new Date().toISOString()); // UltimaActividad
    SpreadsheetApp.flush();
    return createResponse(true, 'Credencial registrada', { fila: fila, conFoto: !!fotoUrl, conUbicacion: tieneGps });
  } catch (error) {
    Logger.log('Error en registrarCredencial: ' + error);
    return createResponse(false, 'Error: ' + error.toString());
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function handleGetCredenciales(requestData) {
  try {
    const d = requestData || {};
    const usuario = correccion_usuarioAutorizado_(d.token);
    if (!usuario) return createResponse(false, 'No autorizado: inicia sesión en el dashboard como administrador o supervisor');

    const sh = credencial_hoja_();
    if (!sh || sh.getLastRow() < 2) return createResponse(true, 'Sin técnicos', { tecnicos: [] });
    const ancho = CREDENCIAL_COL_INICIO - 1 + CREDENCIAL_COLS.length; // A–N
    const rows = sh.getRange(2, 1, sh.getLastRow() - 1, ancho).getValues();
    const conFotos = d.conFotos !== false;
    const iso = function (v) { return v instanceof Date ? v.toISOString() : String(v || ''); };
    const num = function (v) { const n = parseFloat(v); return isNaN(n) ? null : n; };

    const tecnicos = rows.filter(function (r) { return String(r[0] || '').trim(); }).map(function (r) {
      const fotoUrl = String(r[12] || '');
      let foto = '';
      if (conFotos && fotoUrl) {
        try {
          const blob = DriveApp.getFileById(credencial_fileId_(fotoUrl)).getBlob();
          foto = 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
        } catch (e) {}
      }
      return {
        id: String(r[0]),
        nombre: String(r[1] || ''),
        telefono: String(r[2] || ''),
        color: String(r[3] || ''),
        fechaRegistro: iso(r[4]),
        ultimaActividad: iso(r[5]),
        fotosCount: Number(r[6]) || 0,
        correo: String(r[7] || ''),
        lat: num(r[8]),
        lng: num(r[9]),
        precision: num(r[10]),
        ubicacion: String(r[11] || ''),
        fotoUrl: fotoUrl,
        foto: foto,
        fechaCredencial: iso(r[13])
      };
    });
    return createResponse(true, tecnicos.length + ' técnicos', { tecnicos: tecnicos });
  } catch (error) {
    Logger.log('Error en getCredenciales: ' + error);
    return createResponse(false, 'Error: ' + error.toString());
  }
}
