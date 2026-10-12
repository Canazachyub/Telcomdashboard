// Traslados.gs — Acciones NUEVAS «buscarEnHojas» y «traerSuministro» (no modifican ninguna otra).
//
// Problema que resuelve: el técnico está frente a un medidor que no figura en la
// lista de su jornada (se consignó en otra hoja o en ninguna). Puede buscarlo por
// suministro o por la serie de la placa en TODAS las jornadas y, si está en otra,
// traer su fila de la lista a la jornada actual. Así savePhoto encuentra la fila y
// la foto queda con cliente, dirección, coordenadas de referencia, etc.
//
// - buscarEnHojas (GET): ?action=buscarEnHojas&tipo=serie|suministro&q=...  No cambia las
//   jornadas; usa un índice oculto («_Indice») para responder en 1–2 s.
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

// ---- Índice de búsqueda («_Indice» y «_IndiceHojas», ocultas) ----
// Recorrer las 100 jornadas tarda ~45 s. El índice guarda suministro y serie de
// todas; una búsqueda solo lee el índice y vuelve a leer las hojas que cambiaron
// de nombre o de número de filas (fotos nuevas, suministros traídos, jornadas
// nuevas). Un disparador revisa los cambios cada 15 min en segundo plano y cada
// noche lo reconstruye completo (ediciones dentro de una fila). Traer y corregir
// actualizan su jornada al momento. Instalación: ejecutar una vez
// «instalarIndiceBusqueda» en el editor.
const INDICE_SHEET_NAME = '_Indice';
const INDICE_HOJAS_SHEET_NAME = '_IndiceHojas';
const INDICE_COLS = ['Hoja', 'SheetId', 'Suministro', 'SerieNorm', 'Serie', 'CodigoRuta', 'Distrito', 'DeLista', 'Fotos'];
const INDICE_MAX_FILAS_SUELTAS = 60; // más coincidencias que esto: se lee el índice completo
const INDICE_REVISION_SEG = 1200; // la revisión la hace el disparador cada 15 min; esto es el respaldo

/** Filas de índice de una jornada (una por suministro), o null si no es extendida. */
function indice_filasDeHoja_(sh) {
  const m = COLUMN_MAPPING.extended;
  const last = sh.getLastRow();
  if (last < 2 || sh.getLastColumn() < 12) return null;
  const data = sh.getRange(1, 1, last, 12).getValues(); // A–L, con encabezado
  if (!String(data[0][1] || '').toUpperCase().includes('TECNICO')) return null;
  const hoja = sh.getName();
  const id = sh.getSheetId();
  const por = {};
  const orden = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const sum = correccion_norm_(row[m.suministro]);
    if (!sum) continue;
    const deLista = row[m.numero] === '' || row[m.numero] === null;
    const r = por[sum];
    if (r) {
      if (deLista) r[7] = 1;
      else r[8]++;
      if (!r[4] && row[m.serie] !== '' && row[m.serie] !== null) {
        r[4] = String(row[m.serie]);
        r[3] = traslado_normSerie_(row[m.serie]);
      }
      continue;
    }
    const serie = row[m.serie] === null ? '' : String(row[m.serie]);
    por[sum] = [hoja, id, sum, traslado_normSerie_(serie), serie,
      String(row[m.codigoRuta] === null ? '' : row[m.codigoRuta]),
      String(row[m.distrito] === null ? '' : row[m.distrito]),
      deLista ? 1 : 0, deLista ? 0 : 1];
    orden.push(sum);
  }
  return orden.map(function (k) { return por[k]; });
}

function indice_hoja_(ss, nombre, cols) {
  let sh = ss.getSheetByName(nombre);
  if (!sh) {
    sh = ss.insertSheet(nombre);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
    try { sh.hideSheet(); } catch (e) {}
  }
  return sh;
}

function indice_leer_(sh, ancho) {
  const last = sh.getLastRow();
  return last < 2 ? [] : sh.getRange(2, 1, last - 1, ancho).getValues();
}

function indice_escribir_(sh, cols, filas) {
  sh.clearContents();
  sh.getRange(1, 1, 1, cols.length).setValues([cols]);
  if (filas.length) {
    // Texto plano: que Sheets no convierta códigos en números ni quite ceros
    sh.getRange(2, 1, filas.length, cols.length).setNumberFormat('@').setValues(filas);
  }
}

/**
 * Devuelve { filas, rango } con el índice al día. rango[sheetId] = posición de la
 * hoja en el libro (para ordenar resultados). forzar = reconstruir todo.
 * sinFilas = no leer el índice si no hizo falta actualizarlo (filas = null).
 */
function indice_obtener_(forzar, sinFilas) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const cache = CacheService.getScriptCache();
  const shI = indice_hoja_(ss, INDICE_SHEET_NAME, INDICE_COLS);
  const shH = indice_hoja_(ss, INDICE_HOJAS_SHEET_NAME, ['SheetId', 'Hoja', 'Filas']);

  const rangoDe = function (hojas) {
    const r = {};
    hojas.forEach(function (h, i) { r[String(h[0])] = i; });
    return r;
  };

  // Revisado hace poco: usar tal cual
  if (!forzar && cache.get('indice_revisado')) {
    return { filas: sinFilas ? null : indice_leer_(shI, INDICE_COLS.length), rango: rangoDe(indice_leer_(shH, 3)) };
  }

  // Estado actual de las jornadas (en el orden del libro)
  const actuales = [];
  const porId = {};
  ss.getSheets().forEach(function (s) {
    const n = s.getName();
    if (traslado_hojaOculta_(n)) return;
    const id = String(s.getSheetId());
    actuales.push([id, n, s.getLastRow()]);
    porId[id] = s;
  });
  const antes = {};
  indice_leer_(shH, 3).forEach(function (h) { antes[String(h[0])] = h; });
  const cambiadas = actuales.filter(function (h) {
    const a = antes[h[0]];
    return forzar || !a || String(a[1]) !== h[1] || Number(a[2]) !== h[2];
  }).map(function (h) { return h[0]; });
  const borradas = Object.keys(antes).filter(function (id) { return !porId[id]; });

  let filas = indice_leer_(shI, INDICE_COLS.length);
  if (forzar || cambiadas.length || borradas.length) {
    // Candado propio del índice: el del script lo usa savePhoto (espera máx. 10 s);
    // reescribir el índice nunca debe hacer esperar a un técnico que guarda fotos.
    const lock = LockService.getUserLock();
    if (!lock.tryLock(30000)) return { filas: filas, rango: rangoDe(actuales) }; // otro lo está actualizando
    try {
      const fuera = {};
      cambiadas.concat(borradas).forEach(function (id) { fuera[id] = true; });
      filas = filas.filter(function (r) { return !fuera[String(r[1])]; });
      cambiadas.forEach(function (id) {
        const nuevas = indice_filasDeHoja_(porId[id]);
        if (nuevas) filas = filas.concat(nuevas);
      });
      indice_escribir_(shI, INDICE_COLS, filas);
      indice_escribir_(shH, ['SheetId', 'Hoja', 'Filas'], actuales);
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
  }
  cache.put('indice_revisado', '1', INDICE_REVISION_SEG);
  return { filas: filas, rango: rangoDe(actuales) };
}

/**
 * Vuelve a indexar UNA jornada al momento (tras traer o corregir en ella), sin
 * revisar las demás: la búsqueda siguiente ya la ve.
 */
function indice_invalidar_(nombre) {
  const lock = LockService.getUserLock(); // candado del índice, no el de savePhoto
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const shI = ss.getSheetByName(INDICE_SHEET_NAME);
    const shH = ss.getSheetByName(INDICE_HOJAS_SHEET_NAME);
    const hoja = ss.getSheetByName(nombre);
    if (!shI || !shH || !hoja) return; // sin índice todavía: se arma en la próxima búsqueda
    if (!lock.tryLock(20000)) return;
    const id = String(hoja.getSheetId());
    const filas = indice_leer_(shI, INDICE_COLS.length).filter(function (r) { return String(r[1]) !== id; });
    const nuevas = indice_filasDeHoja_(hoja);
    indice_escribir_(shI, INDICE_COLS, nuevas ? filas.concat(nuevas) : filas);
    const hojas = indice_leer_(shH, 3);
    for (let i = 0; i < hojas.length; i++) {
      if (String(hojas[i][0]) === id) {
        shH.getRange(i + 2, 2, 1, 2).setValues([[nombre, hoja.getLastRow()]]);
        break;
      }
    }
    SpreadsheetApp.flush();
  } catch (e) {
    Logger.log('No se pudo actualizar el índice: ' + e);
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/**
 * Ejecutar UNA VEZ desde el editor: arma el índice, lo revisa en segundo plano
 * cada 15 minutos (así el técnico no espera la revisión) y lo reconstruye cada noche.
 */
function instalarIndiceBusqueda() {
  const nuestras = ['reconstruirIndiceBusqueda', 'actualizarIndiceBusqueda'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (nuestras.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('reconstruirIndiceBusqueda').timeBased().atHour(3).everyDays(1).create();
  ScriptApp.newTrigger('actualizarIndiceBusqueda').timeBased().everyMinutes(15).create();
  reconstruirIndiceBusqueda();
}

/** Disparador cada 15 min: revisa qué jornadas cambiaron y las vuelve a indexar. */
function actualizarIndiceBusqueda() {
  CacheService.getScriptCache().remove('indice_revisado');
  const t0 = Date.now();
  const r = indice_obtener_(false);
  Logger.log('Índice revisado: ' + r.filas.length + ' suministros en ' + Math.round((Date.now() - t0) / 1000) + ' s');
}

function reconstruirIndiceBusqueda() {
  const t0 = Date.now();
  const r = indice_obtener_(true);
  Logger.log('Índice de búsqueda: ' + r.filas.length + ' suministros en ' + Math.round((Date.now() - t0) / 1000) + ' s');
}

/**
 * Busca un suministro o una serie de medidor en todas las jornadas (estructura
 * extendida). Coincidencia exacta o parcial (contiene lo escrito). Solo lectura
 * de las jornadas; mantiene el índice oculto al día.
 */
function handleBuscarEnHojas(params) {
  try {
    const p = params || {};
    const tipo = p.tipo === 'serie' ? 'serie' : 'suministro';
    const q = tipo === 'serie' ? traslado_normSerie_(p.q) : correccion_norm_(p.q);
    if (q.length < 4) {
      return traslado_json_({ success: false, message: 'Escribe al menos 4 caracteres', resultados: [] });
    }
    const t0 = Date.now();
    const idx = indice_obtener_(false, true); // al día, sin leer todo el índice
    const shI = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(INDICE_SHEET_NAME);
    const last = shI.getLastRow();
    let filas = idx.filas;
    if (!filas && last >= 2) {
      // El buscador de Sheets encuentra las coincidencias sin traer las ~40 mil filas
      const col = tipo === 'serie' ? 4 : 3; // D = SerieNorm, C = Suministro
      const celdas = shI.getRange(2, col, last - 1, 1).createTextFinder(q).matchCase(false).findAll();
      filas = celdas.length <= INDICE_MAX_FILAS_SUELTAS
        ? celdas.map(function (c) { return shI.getRange(c.getRow(), 1, 1, INDICE_COLS.length).getValues()[0]; })
        : indice_leer_(shI, INDICE_COLS.length); // muchísimas parciales: leer todo es más rápido
    }
    const encontrados = [];
    (filas || []).forEach(function (r) {
      const valor = tipo === 'serie' ? String(r[3]) : correccion_norm_(r[2]);
      if (valor.length < 4 || valor.indexOf(q) < 0) return;
      encontrados.push({
        pos: idx.rango[String(r[1])] || 0,
        r: {
          hoja: String(r[0]),
          suministro: correccion_norm_(r[2]),
          serie: String(r[4]),
          codigoRuta: String(r[5]),
          distrito: String(r[6]),
          exacta: valor === q,
          deLista: Number(r[7]) === 1,
          fotos: Number(r[8]) || 0
        }
      });
    });
    // Exactas primero; dentro de cada grupo, las jornadas más recientes primero
    encontrados.sort(function (a, b) {
      if (a.r.exacta !== b.r.exacta) return a.r.exacta ? -1 : 1;
      return b.pos - a.pos;
    });
    return traslado_json_({
      success: true,
      tipo: tipo,
      q: q,
      total: encontrados.length,
      ms: Date.now() - t0,
      resultados: encontrados.slice(0, BUSQUEDA_MAX).map(function (x) { return x.r; })
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
    indice_invalidar_(hacia);

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
