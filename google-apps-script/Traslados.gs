// Traslados.gs — Acciones NUEVAS «buscarEnHojas» y «traerSuministro» (no modifican ninguna otra).
//
// Problema que resuelve: el técnico está frente a un medidor que no figura en la
// lista de su jornada (se consignó en otra hoja o en ninguna). Puede buscarlo por
// suministro o por la serie de la placa en TODAS las jornadas y, si está en otra,
// traer su fila de la lista a la jornada actual. Así savePhoto encuentra la fila y
// la foto queda con cliente, dirección, coordenadas de referencia, etc.
//
// - buscarEnHojas (GET, solo lectura): ?action=buscarEnHojas&tipo=serie|suministro&q=...
// - traerSuministro (POST): copia B–W de la fila de la lista (columna A vacía) de
//   «desde» como fila de lista nueva al final de «hacia». No borra ni cambia la
//   hoja de origen. Cada traslado queda en «_Traslados».
//
// Seguridad de traerSuministro: token del dashboard (ADMIN / SUPERVISOR) o ODT_ID
// de un técnico registrado (igual que corregirSuministro). Usa las funciones
// correccion_* de la sección de correcciones.

const TRASLADOS_SHEET_NAME = '_Traslados';
const BUSQUEDA_MAX = 20;

function traslado_normSerie_(v) {
  return String(v === null || v === undefined ? '' : v)
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/^0+(?=.)/, '');
}

/** Hojas que la app no muestra: «Usuarios» y las que empiezan con «_». */
function traslado_hojaOculta_(nombre) {
  const n = String(nombre || '').trim();
  return !n || n.charAt(0) === '_' || n.toLowerCase() === USERS_SHEET_NAME.toLowerCase();
}

function traslado_json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Busca un suministro o una serie de medidor en todas las jornadas (estructura
 * extendida). Coincidencia exacta o parcial (contiene lo escrito). Solo lectura.
 */
function handleBuscarEnHojas(params) {
  try {
    const p = params || {};
    const tipo = p.tipo === 'serie' ? 'serie' : 'suministro';
    const q = tipo === 'serie' ? traslado_normSerie_(p.q) : correccion_norm_(p.q);
    if (q.length < 4) {
      return traslado_json_({ success: false, message: 'Escribe al menos 4 caracteres', resultados: [] });
    }

    const m = COLUMN_MAPPING.extended;
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const resultados = [];

    ss.getSheets().forEach(function (sh) {
      const hoja = sh.getName();
      if (traslado_hojaOculta_(hoja)) return;
      const last = sh.getLastRow();
      if (last < 2 || sh.getLastColumn() < 12) return;
      const data = sh.getRange(1, 1, last, 12).getValues(); // A–L, con encabezado
      if (!String(data[0][1] || '').toUpperCase().includes('TECNICO')) return; // solo extendidas

      const porCodigo = {};
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const sum = correccion_norm_(row[m.suministro]);
        if (!sum) continue;
        const valor = tipo === 'serie' ? traslado_normSerie_(row[m.serie]) : sum;
        if (valor.length < 4 || valor.indexOf(q) < 0) continue;
        const deLista = row[m.numero] === '' || row[m.numero] === null;
        const r = porCodigo[sum];
        if (r) {
          if (deLista) r.deLista = true;
          else r.fotos++;
          continue;
        }
        porCodigo[sum] = {
          hoja: hoja,
          suministro: sum,
          serie: String(row[m.serie] === null ? '' : row[m.serie]),
          codigoRuta: String(row[m.codigoRuta] === null ? '' : row[m.codigoRuta]),
          distrito: String(row[m.distrito] === null ? '' : row[m.distrito]),
          exacta: valor === q,
          deLista: deLista,
          fotos: deLista ? 0 : 1
        };
      }
      Object.keys(porCodigo).forEach(function (k) { resultados.push(porCodigo[k]); });
    });

    // Exactas primero; dentro de cada grupo, las jornadas más recientes primero
    const orden = resultados.map(function (r, i) { return { r: r, i: i }; });
    orden.sort(function (a, b) {
      if (a.r.exacta !== b.r.exacta) return a.r.exacta ? -1 : 1;
      return b.i - a.i;
    });
    return traslado_json_({
      success: true,
      tipo: tipo,
      q: q,
      total: resultados.length,
      resultados: orden.slice(0, BUSQUEDA_MAX).map(function (x) { return x.r; })
    });
  } catch (error) {
    Logger.log('Error en buscarEnHojas: ' + error);
    return traslado_json_({ success: false, message: 'Error: ' + error.toString(), resultados: [] });
  }
}

/**
 * requestData: { action: 'traerSuministro', desde, hacia, suministro, token? | odtId? }
 */
function handleTraerSuministro(requestData) {
  const lock = LockService.getScriptLock();
  try {
    const d = requestData || {};
    const odtId = d.token ? '' : correccion_norm_(d.odtId);
    const usuario = d.token ? correccion_usuarioAutorizado_(d.token) : correccion_tecnicoRegistrado_(odtId);
    if (!usuario) {
      return createResponse(false, d.token || !odtId
        ? 'No autorizado: inicia sesión en el dashboard como administrador o supervisor'
        : 'No autorizado: tu perfil de técnico no está registrado. Abre la app con internet e inténtalo otra vez');
    }

    const desde = String(d.desde || '').trim();
    const hacia = String(d.hacia || '').trim();
    const sum = correccion_norm_(d.suministro);
    if (!desde || !hacia || !sum) return createResponse(false, 'Faltan datos: desde, hacia y suministro');
    if (desde === hacia) return createResponse(false, 'El suministro ya es de esta jornada');
    if (traslado_hojaOculta_(desde) || traslado_hojaOculta_(hacia)) return createResponse(false, 'Hoja no permitida');

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const shD = ss.getSheetByName(desde);
    const shH = ss.getSheetByName(hacia);
    if (!shD) return createResponse(false, 'Hoja no encontrada: ' + desde);
    if (!shH) return createResponse(false, 'Hoja no encontrada: ' + hacia);
    if (detectSheetStructure(shD) !== 'extended' || detectSheetStructure(shH) !== 'extended') {
      return createResponse(false, 'Solo se puede traer entre hojas con estructura extendida');
    }

    const m = COLUMN_MAPPING.extended;
    lock.waitLock(20000);

    // ¿Ya está en la lista de la jornada destino?
    const lastH = shH.getLastRow();
    if (lastH >= 2) {
      const dh = shH.getRange(2, 1, lastH - 1, 4).getValues();
      for (let i = 0; i < dh.length; i++) {
        const esLista = dh[i][m.numero] === '' || dh[i][m.numero] === null;
        if (esLista && correccion_norm_(dh[i][m.suministro]) === sum) {
          return createResponse(true, 'El suministro ' + sum + ' ya estaba en ' + hacia, { yaEstaba: true, fila: i + 2 });
        }
      }
    }

    // Fila de la lista en el origen (A vacía); si no hay, la primera fila con ese código
    const lastD = shD.getLastRow();
    if (lastD < 2) return createResponse(false, 'La hoja ' + desde + ' está vacía');
    const dd = shD.getRange(2, 1, lastD - 1, 23).getValues(); // A–W
    let fuente = null;
    for (let i = 0; i < dd.length; i++) {
      if (correccion_norm_(dd[i][m.suministro]) !== sum) continue;
      const esLista = dd[i][m.numero] === '' || dd[i][m.numero] === null;
      if (esLista) { fuente = dd[i]; break; }
      if (!fuente) fuente = dd[i];
    }
    if (!fuente) return createResponse(false, 'El suministro ' + sum + ' no está en ' + desde);

    // Nueva fila de lista: A vacía, B–W copiadas, X–AJ vacías (36 columnas)
    const nueva = new Array(36).fill('');
    for (let c = 1; c <= 22; c++) nueva[c] = fuente[c] === null ? '' : fuente[c];
    shH.appendRow(nueva);
    SpreadsheetApp.flush();
    const fila = shH.getLastRow();

    traslado_hojaLog_(ss).appendRow([new Date(), usuario.email, usuario.rol, desde, hacia, sum, fila]);

    return createResponse(true, 'Suministro ' + sum + ' agregado a ' + hacia, {
      fila: fila, desde: desde, hacia: hacia, suministro: sum
    });
  } catch (error) {
    Logger.log('Error en traerSuministro: ' + error);
    return createResponse(false, 'Error: ' + error.toString());
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function traslado_hojaLog_(ss) {
  let sh = ss.getSheetByName(TRASLADOS_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(TRASLADOS_SHEET_NAME);
    sh.appendRow(['Fecha', 'Usuario', 'Rol', 'Desde (jornada)', 'Hacia (jornada)', 'Suministro', 'Fila nueva']);
    sh.getRange(1, 1, 1, 7).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
