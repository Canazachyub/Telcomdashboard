// Formatos.gs — Acciones NUEVAS «guardarFormato», «getFormatos», «getPlanJornada», «marcarCoincidente»,
// «asignarNumeros» y «marcarAvisado» (no modifican ninguna otra).
//
// Formatos de supervisión 1A / 2A llenados en la app de campo (v2.3). Contrato
// de pedido y respuesta en docs/diseno/contrato_formatos_api.md.
//
// Dónde se guardan: en la MISMA jornada, en columnas nuevas a la derecha de AJ
// (AK–BA). Las columnas A–AJ no se tocan nunca: savePhoto, el mapa, el índice y los
// demás lectores leen anchos fijos (A–W, A–AJ), así que no ven estas columnas.
//   - En CADA fila de foto del formulario: AK ETIQUETA_FOTO (rol de la foto) y
//     AW FORMATO_ID_FOTO (id del formulario dueño de esa foto).
//   - En UNA fila de foto (la panorámica; si no está, la de «Lectura del medidor»;
//     si tampoco, la primera foto encontrada): AL–AV y AX con los datos del formulario,
//     AZ REPORTE (número fijo SP-/SC-) y BA AVISADO (fecha del aviso a la contratista).
//   - En la FILA PROGRAMADA del suministro (A vacía): AY COINCIDENTE_PLAN («SI» o vacío).
// Las fotos se reconocen por suministro (D) y Synced_At (AF) = fotos[].timestamp,
// el mismo texto «dd/MM/yyyy HH:mm:ss» que la app mandó en savePhoto.
//
// - guardarFormato (POST, app): { odtId, formato: { id, tipo, hoja, suministro, fecha,
//   lectura, fechaSticker, observacion, conforme, resp, patron, carga, fotos, appVersion } }
//   Solo un técnico registrado en «_ODT_Tecnicos». Idempotente: el mismo «id» mueve
//   o actualiza su fila, nunca duplica. Si las fotos todavía no están en la hoja,
//   responde «Primero sincroniza…» y la app lo deja pendiente.
// - getFormatos (GET, dashboard): ?action=getFormatos&sheetName=<hoja>. Sin odtId.
// - getPlanJornada (GET, sin token, como getSuministros): suministros programados y si son coincidentes.
// - marcarCoincidente / asignarNumeros / marcarAvisado (POST, dashboard): token de sesión de
//   ADMIN o SUPERVISOR, la misma verificación que getCredenciales (correccion_usuarioAutorizado_).
//
// Usa correccion_norm_ y correccion_tecnicoRegistrado_ (correcciones) y traslado_hojaOculta_ (traslados).

const FORMATO_COL_INICIO = 37; // AK
const FORMATO_COLS = ['ETIQUETA_FOTO', 'FORMATO', 'FORMATO_ID', 'CONFORME', 'FECHA_STICKER', 'OBS_FORMATO',
  'ITEMS_NO', 'RESPUESTAS', 'CERT_PATRON', 'CERT_CARGA', 'RECIBIDO', 'FORMATO_FECHA', 'FORMATO_ID_FOTO',
  'LECTURA_FORMATO', 'COINCIDENTE_PLAN', 'REPORTE', 'AVISADO'];
// Posición (0-based) dentro de AK–BA
const FC = { etiqueta: 0, tipo: 1, id: 2, conforme: 3, fechaSticker: 4, obs: 5, itemsNo: 6, resp: 7,
  patron: 8, carga: 9, recibido: 10, fecha: 11, idFoto: 12, lectura: 13, coincidente: 14, reporte: 15, avisado: 16 };
const FORMATOS_TIPOS = ['1A', '2A'];
const FORMATO_ID_MAX = 64;
const FORMATO_CELDA_MAX = 45000; // una celda de Sheets admite 50 000 caracteres
// Primera foto obligatoria de cada formato: en su fila van los datos del formulario
const FORMATO_ROL_PRINCIPAL = { '1A': 'Panorámica del predio', '2A': 'Panorámica con el personal trabajando' };
// Foto de la lectura (1A): su fila es la segunda opción y su LECTURA (AC) la usa getFormatos
const FORMATO_ROL_LECTURA = 'Lectura del medidor';

// Preguntas en el orden del formulario (ids y textos de la app: prototipo/supervision.dart)
const FORMATO_PREGUNTAS = {
  '1A': [
    ['sticker_ubicado', 'Sticker de contraste bien ubicado'],
    ['sticker_llenado', 'Sticker bien llenado, legible y sin borrones'],
    ['sticker_plumon', 'Sticker llenado con plumón indeleble'],
    ['sticker_color', 'Color del sticker del periodo'],
    ['precinto_bornera', 'Precinto de bornera instalado'],
    ['precinto_caja', 'Precinto de caja portamedidor'],
    ['caja_cerrada', 'Caja cerrada y asegurada'],
    ['fecha_concordante', 'Fecha del sticker = fecha programada'],
    ['usuario_confirma', 'Usuario confirma aviso y copia del certificado']
  ],
  '2A': [
    ['ot', 'Cuenta con orden de trabajo'],
    ['fecha_programada', 'Intervención en la fecha programada'],
    ['grupo', 'Grupo completo (técnico inspector + apoyo)'],
    ['senalizo', 'Señalizó o demarcó la zona'],
    ['registrado', 'Personal registrado y autorizado ante ELSE'],
    ['epp', 'EPP y uniforme completos y en buen estado'],
    ['fotocheck', 'Fotocheck en buen estado'],
    ['herramientas', 'Herramientas completas y en buen estado'],
    ['equipo_movil', 'Equipo móvil operativo'],
    ['patron_carga', 'Patrón y carga en buen estado y calibración vigente'],
    ['procedimiento', 'Tiene su «Procedimiento técnico de contrastación»'],
    ['vehiculo', 'Unidad vehicular en buen estado'],
    ['otras', 'Sin otras observaciones'],
    ['pruebas', 'Pruebas de vacío y de contraste correctas'],
    ['aprueba', 'Resultado de los ensayos: APRUEBA'],
    ['equipos', 'Uso correcto de equipos y herramientas'],
    ['sticker', 'Pegado y llenado correcto del sticker'],
    ['plumon', 'Uso de plumón indeleble'],
    ['traslado', 'Traslado correcto del patrón y la carga'],
    ['informe', 'Llenado correcto del informe de contrastación'],
    ['cert_patron', 'Certificado de calibración vigente del patrón'],
    ['cert_carga', 'Certificado de calibración vigente de la carga'],
    ['orden', 'Orden y limpieza al terminar'],
    ['cumple', 'Cumplió el procedimiento de trabajo']
  ]
};

function formato_texto_(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function formato_zona_(ss) {
  try { return (ss.getSpreadsheetTimeZone && ss.getSpreadsheetTimeZone()) || 'America/Lima'; } catch (e) { return 'America/Lima'; }
}

/**
 * Textos con los que se compara Synced_At (AF). La app manda «dd/MM/yyyy HH:mm:ss»;
 * si Sheets lo convirtió en fecha, se vuelve a escribir así (y, por si la hoja leyó
 * el texto como mes/día, también «MM/dd/yyyy HH:mm:ss»).
 */
function formato_sellos_(v, zona) {
  if (v instanceof Date) {
    return [Utilities.formatDate(v, zona, 'dd/MM/yyyy HH:mm:ss'), Utilities.formatDate(v, zona, 'MM/dd/yyyy HH:mm:ss')];
  }
  const s = formato_texto_(v);
  return s ? [s] : [];
}

function formato_fecha_(v, zona, patron) {
  return v instanceof Date ? Utilities.formatDate(v, zona, patron) : formato_texto_(v);
}

/** «id=SI; id=NO; …» en el orden del formulario (las que no conoce, al final). */
function formato_respuestas_(tipo, resp) {
  const orden = FORMATO_PREGUNTAS[tipo].map(function (p) { return p[0]; });
  Object.keys(resp).forEach(function (k) { if (orden.indexOf(k) < 0) orden.push(k); });
  return orden.filter(function (k) { return resp[k] !== undefined && resp[k] !== null; })
    .map(function (k) { return k + '=' + formato_texto_(resp[k]); }).join('; ');
}

function formato_leerRespuestas_(texto) {
  const resp = {};
  formato_texto_(texto).split(';').forEach(function (par) {
    const i = par.indexOf('=');
    if (i > 0) resp[par.slice(0, i).trim()] = par.slice(i + 1).trim();
  });
  return resp;
}

/** Textos de las preguntas respondidas NO, separados por «; ». */
function formato_itemsNo_(tipo, resp) {
  const textos = {};
  FORMATO_PREGUNTAS[tipo].forEach(function (p) { textos[p[0]] = p[1]; });
  const orden = FORMATO_PREGUNTAS[tipo].map(function (p) { return p[0]; });
  Object.keys(resp).forEach(function (k) { if (orden.indexOf(k) < 0) orden.push(k); });
  return orden.filter(function (k) { return formato_texto_(resp[k]).toUpperCase() === 'NO'; })
    .map(function (k) { return textos[k] || k; }).join('; ');
}

/** Lee A–AJ y AK–BA de las filas 2..última (AK–BA vacías si la hoja aún no llega ahí). */
function formato_leerHoja_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return { base: [], extra: [] };
  const base = sh.getRange(2, 1, last - 1, 36).getValues();
  let extra;
  const ancho = Math.min(sh.getLastColumn(), FORMATO_COL_INICIO + FORMATO_COLS.length - 1) - FORMATO_COL_INICIO + 1;
  if (ancho > 0) {
    extra = sh.getRange(2, FORMATO_COL_INICIO, last - 1, ancho).getValues().map(function (r) {
      while (r.length < FORMATO_COLS.length) r.push('');
      return r;
    });
  } else {
    extra = base.map(function () { return new Array(FORMATO_COLS.length).fill(''); });
  }
  return { base: base, extra: extra };
}

/**
 * Prepara AK–BA: agrega columnas a la hoja si faltan y escribe los encabezados que
 * falten (solo esas celdas de la fila 1). Si alguna ya tiene OTRO encabezado, no
 * escribe nada (serían datos de otra persona) y devuelve un mensaje de error.
 */
function formato_prepararColumnas_(sh) {
  const ultima = FORMATO_COL_INICIO + FORMATO_COLS.length - 1; // BA = 53
  if (sh.getMaxColumns() < ultima) sh.insertColumnsAfter(sh.getMaxColumns(), ultima - sh.getMaxColumns());
  const head = sh.getRange(1, FORMATO_COL_INICIO, 1, FORMATO_COLS.length).getValues()[0];
  let faltan = false;
  for (let i = 0; i < FORMATO_COLS.length; i++) {
    const h = formato_texto_(head[i]);
    if (h && h !== FORMATO_COLS[i]) {
      return 'La columna ' + (FORMATO_COL_INICIO + i) + ' de la jornada ya tiene otro encabezado («' + h + '»)';
    }
    if (!h) faltan = true;
  }
  if (faltan) {
    sh.getRange(1, FORMATO_COL_INICIO, 1, FORMATO_COLS.length).setValues([FORMATO_COLS]).setFontWeight('bold');
  }
  return '';
}

/**
 * requestData: { action: 'guardarFormato', odtId, formato: {...} }
 * Respuesta: { success, message, id, fila, actualizado }  (fila = fila con los datos del formulario)
 */
function handleGuardarFormato(requestData) {
  const lock = LockService.getScriptLock();
  try {
    const d = requestData || {};

    // ---- Autorización: técnico registrado ----
    const odtId = correccion_norm_(d.odtId);
    if (!correccion_tecnicoRegistrado_(odtId)) {
      return createResponse(false, 'No autorizado: tu perfil de técnico no está registrado. Abre la app con internet e inténtalo otra vez');
    }

    // ---- Validación ----
    const f = d.formato;
    if (!f || typeof f !== 'object' || Array.isArray(f)) return createResponse(false, 'Falta el formato');
    const id = formato_texto_(f.id);
    const tipo = formato_texto_(f.tipo).toUpperCase();
    const hoja = formato_texto_(f.hoja);
    const suministro = correccion_norm_(f.suministro);
    const observacion = formato_texto_(f.observacion);
    if (!id) return createResponse(false, 'Falta el id del formato');
    if (id.length > FORMATO_ID_MAX) return createResponse(false, 'El id del formato es demasiado largo');
    if (FORMATOS_TIPOS.indexOf(tipo) < 0) return createResponse(false, 'Tipo de formato no válido: ' + f.tipo);
    if (!suministro) return createResponse(false, 'Falta el suministro');
    if (!hoja || traslado_hojaOculta_(hoja)) return createResponse(false, 'Hoja no permitida');
    if (!f.resp || typeof f.resp !== 'object' || Array.isArray(f.resp)) {
      return createResponse(false, 'Las respuestas (resp) deben ser un objeto');
    }
    if (typeof f.conforme !== 'boolean') return createResponse(false, 'Falta indicar si es conforme');
    if (f.conforme === false && !observacion) {
      return createResponse(false, 'Un formato NO conforme necesita una observación');
    }
    const fotos = (Array.isArray(f.fotos) ? f.fotos : []).filter(function (x) {
      return x && typeof x === 'object' && formato_texto_(x.timestamp);
    }).map(function (x) {
      return { timestamp: formato_texto_(x.timestamp), rol: formato_texto_(x.rol) };
    });
    const respuestas = formato_respuestas_(tipo, f.resp);
    const itemsNo = formato_itemsNo_(tipo, f.resp);
    if (respuestas.length > FORMATO_CELDA_MAX || itemsNo.length > FORMATO_CELDA_MAX ||
      observacion.length > FORMATO_CELDA_MAX) {
      return createResponse(false, 'El formato es demasiado grande');
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sh = ss.getSheetByName(hoja);
    if (!sh) return createResponse(false, 'Hoja no encontrada: ' + hoja);
    if (detectSheetStructure(sh) !== 'extended') {
      return createResponse(false, 'Esta jornada es de formato antiguo; el formulario no se puede guardar ahí');
    }
    const zona = formato_zona_(ss);
    const m = COLUMN_MAPPING.extended;

    // ---- Escribir (candado corto: lo usa también savePhoto) ----
    lock.waitLock(20000);
    const hoja_ = formato_leerHoja_(sh);
    const base = hoja_.base;
    const extra = hoja_.extra;

    // Filas de foto de este suministro cuya hora (AF) es la de alguna foto del formulario
    const rolDe = {};
    fotos.forEach(function (x) { if (!(x.timestamp in rolDe)) rolDe[x.timestamp] = x.rol; });
    const nuevas = {}; // índice de fila (0-based) → rol
    let primera = -1;
    let principal = -1;
    let deLectura = -1;
    for (let i = 0; i < base.length; i++) {
      const row = base[i];
      if (row[m.numero] === '' || row[m.numero] === null) continue; // fila de la lista, no de foto
      if (correccion_norm_(row[m.suministro]) !== suministro) continue;
      const sello = formato_sellos_(row[m.syncedAt], zona).filter(function (s) { return s in rolDe; })[0];
      if (sello === undefined) continue;
      nuevas[i] = rolDe[sello];
      if (primera < 0) primera = i;
      if (principal < 0 && rolDe[sello] === FORMATO_ROL_PRINCIPAL[tipo]) principal = i;
      if (deLectura < 0 && rolDe[sello] === FORMATO_ROL_LECTURA) deLectura = i;
    }
    if (primera < 0) return createResponse(false, 'Primero sincroniza las fotos de este suministro');
    const filaFormulario = principal >= 0 ? principal : deLectura >= 0 ? deLectura : primera;

    const aviso = formato_prepararColumnas_(sh);
    if (aviso) return createResponse(false, aviso);

    // Cambios fila por fila sobre AK–BA (A–AJ nunca se tocan)
    const cambios = {};
    const editar = function (i) {
      if (!cambios[i]) cambios[i] = extra[i].slice();
      return cambios[i];
    };
    let actualizado = false;
    let reporteAnterior = null; // número (AZ) y aviso (BA) son del formulario, no de la fila
    let avisadoAnterior = null;
    for (let i = 0; i < extra.length; i++) {
      if (formato_texto_(extra[i][FC.id]) === id) {
        // Datos anteriores de este formulario: se borran (se vuelven a escribir abajo)
        actualizado = true;
        const r = editar(i);
        for (let k = FC.tipo; k <= FC.fecha; k++) r[k] = '';
        r[FC.lectura] = '';
        if (reporteAnterior === null) {
          reporteAnterior = extra[i][FC.reporte];
          avisadoAnterior = extra[i][FC.avisado];
        }
        r[FC.reporte] = '';
        r[FC.avisado] = '';
      }
      if (formato_texto_(extra[i][FC.idFoto]) === id && !(i in nuevas)) {
        // Foto que ya no es parte del formulario: se le quita la etiqueta
        actualizado = true;
        const r = editar(i);
        r[FC.etiqueta] = '';
        r[FC.idFoto] = '';
      }
    }
    Object.keys(nuevas).forEach(function (k) {
      const i = Number(k);
      if (formato_texto_(extra[i][FC.idFoto]) === id) actualizado = true;
      const r = editar(i);
      r[FC.etiqueta] = nuevas[k];
      r[FC.idFoto] = id;
    });
    const r = editar(filaFormulario);
    r[FC.tipo] = tipo;
    r[FC.id] = id;
    r[FC.conforme] = f.conforme ? 'SI' : 'NO';
    r[FC.fechaSticker] = formato_texto_(f.fechaSticker);
    r[FC.obs] = observacion;
    r[FC.itemsNo] = itemsNo;
    r[FC.resp] = respuestas;
    r[FC.patron] = formato_texto_(f.patron);
    r[FC.carga] = formato_texto_(f.carga);
    r[FC.recibido] = new Date();
    r[FC.fecha] = formato_texto_(f.fecha);
    r[FC.lectura] = formato_texto_(f.lectura);
    if (reporteAnterior !== null) {
      r[FC.reporte] = reporteAnterior;
      r[FC.avisado] = avisadoAnterior;
    }

    Object.keys(cambios).forEach(function (k) {
      const fila = Number(k) + 2;
      const rango = sh.getRange(fila, FORMATO_COL_INICIO, 1, FORMATO_COLS.length);
      // Texto plano (menos RECIBIDO y AVISADO): que Sheets no convierta fechas ni códigos
      rango.setNumberFormat('@');
      sh.getRange(fila, FORMATO_COL_INICIO + FC.recibido).setNumberFormat('dd/MM/yyyy HH:mm:ss');
      sh.getRange(fila, FORMATO_COL_INICIO + FC.avisado).setNumberFormat('dd/MM/yyyy HH:mm:ss');
      rango.setValues([cambios[k]]);
    });
    SpreadsheetApp.flush();

    return createResponse(true, actualizado ? 'Formato actualizado' : 'Formato guardado', {
      id: id, fila: filaFormulario + 2, actualizado: actualizado
    });
  } catch (error) {
    Logger.log('Error en guardarFormato: ' + error);
    return createResponse(false, 'Error: ' + error.toString());
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/** GET ?action=getFormatos&sheetName=<hoja>. Solo lectura; nunca devuelve el odtId. */
function handleGetFormatos(sheetName) {
  try {
    const hoja = formato_texto_(sheetName);
    if (!hoja) return createResponse(false, 'Falta sheetName', { formatos: [] });
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sh = ss.getSheetByName(hoja);
    if (!sh) return createResponse(false, 'Hoja no encontrada: ' + hoja, { formatos: [] });
    if (traslado_hojaOculta_(hoja) || detectSheetStructure(sh) !== 'extended' || sh.getLastColumn() < FORMATO_COL_INICIO) {
      return createResponse(true, 'Sin formatos', { formatos: [] });
    }
    const zona = formato_zona_(ss);
    const m = COLUMN_MAPPING.extended;
    const datos = formato_leerHoja_(sh);
    const base = datos.base;
    const extra = datos.extra;
    // Link de cada foto (X): es una fórmula =HYPERLINK("url","Ver foto")
    const formulasX = base.length ? sh.getRange(2, m.linkCarpeta + 1, base.length, 1).getFormulas() : [];

    // Fotos etiquetadas, por formulario (en el orden de la hoja)
    const fotosDe = {};
    for (let i = 0; i < extra.length; i++) {
      const duenio = formato_texto_(extra[i][FC.idFoto]);
      if (!duenio || !formato_texto_(extra[i][FC.etiqueta])) continue;
      (fotosDe[duenio] = fotosDe[duenio] || []).push(i);
    }

    const formatos = [];
    for (let i = 0; i < extra.length; i++) {
      const e = extra[i];
      const id = formato_texto_(e[FC.id]);
      if (!id) continue;
      const suministro = correccion_norm_(base[i][m.suministro]);
      const propias = (fotosDe[id] || []).filter(function (k) {
        return correccion_norm_(base[k][m.suministro]) === suministro;
      });
      // Lectura: la que mandó la app (AX); si no, la de su foto «Lectura del medidor»;
      // si no, la de la fila del formulario; si está vacía, la primera de sus fotos
      let lectura = formato_texto_(e[FC.lectura]);
      for (let k = 0; !lectura && k < propias.length; k++) {
        if (formato_texto_(extra[propias[k]][FC.etiqueta]) === FORMATO_ROL_LECTURA) lectura = formato_texto_(base[propias[k]][m.lectura]);
      }
      if (!lectura) lectura = formato_texto_(base[i][m.lectura]);
      for (let k = 0; !lectura && k < propias.length; k++) lectura = formato_texto_(base[propias[k]][m.lectura]);
      formatos.push({
        id: id,
        tipo: formato_texto_(e[FC.tipo]),
        hoja: hoja,
        suministro: suministro,
        fecha: formato_fecha_(e[FC.fecha], zona, 'dd/MM/yyyy HH:mm'),
        tecnico: formato_texto_(base[i][m.odtNombre]),
        lectura: lectura,
        fechaSticker: formato_fecha_(e[FC.fechaSticker], zona, 'dd/MM/yyyy'),
        conforme: formato_texto_(e[FC.conforme]).toUpperCase() === 'SI',
        observacion: formato_texto_(e[FC.obs]),
        resp: formato_leerRespuestas_(e[FC.resp]),
        patron: formato_texto_(e[FC.patron]),
        carga: formato_texto_(e[FC.carga]),
        fotos: propias.map(function (k) {
          return {
            timestamp: formato_sellos_(base[k][m.syncedAt], zona)[0] || '',
            rol: formato_texto_(extra[k][FC.etiqueta]),
            url: formato_url_((formulasX[k] || [])[0], base[k][m.linkCarpeta]),
            fila: k + 2
          };
        }),
        recibido: formato_fecha_(e[FC.recibido], zona, 'dd/MM/yyyy HH:mm'),
        reporte: formato_texto_(e[FC.reporte]),
        avisado: formato_fecha_(e[FC.avisado], zona, 'dd/MM/yyyy HH:mm')
      });
    }
    return createResponse(true, formatos.length + ' formato(s)', { formatos: formatos });
  } catch (error) {
    Logger.log('Error en getFormatos: ' + error);
    return createResponse(false, 'Error: ' + error.toString(), { formatos: [] });
  }
}

// ---- Planificación, numeración fija y avisos (ampliación 2026-11-12, tarde) ----

const FORMATO_NO_AUTORIZADO = 'No autorizado: inicia sesión en el dashboard como administrador o supervisor';
const FORMATO_PREFIJO = { '1A': 'SP', '2A': 'SC' };
const FORMATO_BLOQUE_1A = 10; // formularios 1A por cada número SP

/** Link de Drive de la columna X: de la fórmula HYPERLINK o, si no hay, del valor si ya es un link. */
function formato_url_(formula, valor) {
  const deFormula = formula ? extractUrlFromHyperlink(formula) : '';
  if (/^https?:\/\//i.test(deFormula)) return deFormula;
  const v = formato_texto_(valor);
  return /^https?:\/\//i.test(v) ? v : '';
}

/** Jornada válida para escribir o leer el plan: { sh } o { error }. */
function formato_jornada_(hoja) {
  const n = formato_texto_(hoja);
  if (!n) return { error: 'Falta la hoja' };
  if (traslado_hojaOculta_(n)) return { error: 'Hoja no permitida' };
  const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(n);
  if (!sh) return { error: 'Hoja no encontrada: ' + n };
  if (detectSheetStructure(sh) !== 'extended') return { error: 'Esta jornada es de formato antiguo', antigua: true };
  return { sh: sh };
}

function formato_esProgramada_(row) {
  const a = row[COLUMN_MAPPING.extended.numero];
  return a === '' || a === null;
}

/**
 * GET ?action=getPlanJornada&sheetName=<hoja>. Solo lectura, sin token (como getSuministros).
 * Una entrada por suministro programado (filas con A vacía): fecha de C, técnico de B,
 * coincidente de AY. Sin filas programadas: los suministros distintos de D, sin fecha.
 */
function handleGetPlanJornada(sheetName) {
  try {
    const j = formato_jornada_(sheetName);
    if (j.antigua) return createResponse(true, 'Jornada de formato antiguo', { plan: [] });
    if (j.error) return createResponse(false, j.error, { plan: [] });
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const zona = formato_zona_(ss);
    const m = COLUMN_MAPPING.extended;
    const datos = formato_leerHoja_(j.sh);
    const base = datos.base;
    const extra = datos.extra;

    const hayProgramadas = base.some(function (row) {
      return formato_esProgramada_(row) && correccion_norm_(row[m.suministro]);
    });
    const plan = [];
    const pos = {};
    for (let i = 0; i < base.length; i++) {
      const row = base[i];
      const sum = correccion_norm_(row[m.suministro]);
      if (!sum) continue;
      const programada = formato_esProgramada_(row);
      if (hayProgramadas && !programada) continue;
      const coincide = programada && formato_texto_(extra[i][FC.coincidente]).toUpperCase() === 'SI';
      if (sum in pos) {
        if (coincide) plan[pos[sum]].coincidente = true;
        continue;
      }
      pos[sum] = plan.length;
      plan.push({
        suministro: sum,
        fechaProgramada: hayProgramadas ? formato_fechaProgramada_(row[m.fecha], zona) : '',
        tecnico: formato_texto_(row[m.tecnico]),
        coincidente: coincide
      });
    }
    return createResponse(true, plan.length + ' suministro(s)', { plan: plan });
  } catch (error) {
    Logger.log('Error en getPlanJornada: ' + error);
    return createResponse(false, 'Error: ' + error.toString(), { plan: [] });
  }
}

/**
 * POST { action: 'marcarCoincidente', token, hoja, suministros: [..], valor: true|false }
 * Escribe o borra «SI» en AY de las filas programadas de esos suministros. Respuesta: { marcados }
 * (marcados = suministros encontrados en la lista de la jornada).
 */
function handleMarcarCoincidente(requestData) {
  const lock = LockService.getScriptLock();
  try {
    const d = requestData || {};
    if (!correccion_usuarioAutorizado_(d.token)) return createResponse(false, FORMATO_NO_AUTORIZADO);
    if (!Array.isArray(d.suministros) || !d.suministros.length) return createResponse(false, 'Faltan los suministros');
    if (typeof d.valor !== 'boolean') return createResponse(false, 'Falta el valor (true o false)');
    const j = formato_jornada_(d.hoja);
    if (j.error) return createResponse(false, j.error);
    const sh = j.sh;
    const pedidos = {};
    d.suministros.forEach(function (s) { const n = correccion_norm_(s); if (n) pedidos[n] = true; });

    lock.waitLock(20000);
    const datos = formato_leerHoja_(sh);
    if (!datos.base.length) return createResponse(true, 'La jornada está vacía', { marcados: 0 });
    const aviso = formato_prepararColumnas_(sh);
    if (aviso) return createResponse(false, aviso);

    const m = COLUMN_MAPPING.extended;
    const encontrados = {};
    // Toda la columna AY de una vez (solo esa columna; A–AJ no se tocan)
    const columna = datos.extra.map(function (e, i) {
      const row = datos.base[i];
      const sum = correccion_norm_(row[m.suministro]);
      if (formato_esProgramada_(row) && pedidos[sum]) {
        encontrados[sum] = true;
        return [d.valor ? 'SI' : ''];
      }
      return [e[FC.coincidente] === null ? '' : e[FC.coincidente]];
    });
    const marcados = Object.keys(encontrados).length;
    if (marcados) {
      sh.getRange(2, FORMATO_COL_INICIO + FC.coincidente, columna.length, 1).setNumberFormat('@').setValues(columna);
      SpreadsheetApp.flush();
    }
    return createResponse(true, marcados + ' suministro(s) ' + (d.valor ? 'marcado(s)' : 'desmarcado(s)'), { marcados: marcados });
  } catch (error) {
    Logger.log('Error en marcarCoincidente: ' + error);
    return createResponse(false, 'Error: ' + error.toString());
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/** Año del formulario: de FORMATO_FECHA (AV); si no se puede, de RECIBIDO (AU); si no, el actual. */
function formato_anio_(fecha, recibido) {
  if (fecha instanceof Date) return fecha.getFullYear();
  const t = formato_texto_(fecha).match(/(\d{4})/);
  if (t) return Number(t[1]);
  if (recibido instanceof Date) return recibido.getFullYear();
  return new Date().getFullYear();
}

/** Clave ordenable «yyyyMMddHHmm» de FORMATO_FECHA (texto «dd/MM/yyyy HH:mm» o fecha). */
function formato_claveFecha_(fecha, zona) {
  if (fecha instanceof Date) return Utilities.formatDate(fecha, zona, 'yyyyMMddHHmm');
  const t = formato_texto_(fecha).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!t) return formato_texto_(fecha);
  const z = function (x) { return ('0' + (x || '0')).slice(-2); };
  return t[3] + z(t[2]) + z(t[1]) + z(t[4]) + z(t[5]);
}

/**
 * POST { action: 'asignarNumeros', token, hoja }
 * Numera SOLO los formularios de la jornada sin número (AZ vacío); los numerados no cambian.
 * 1A: ordenados por AV y luego AU, de 10 en 10, cada grupo un SP-<año>-NNN.
 * 2A: uno por formulario, SC-<año>-NNN. Contadores globales por año en las propiedades
 * del script («contador_SP_<año>», «contador_SC_<año>»), todo bajo el candado del script.
 * Respuesta: { asignados: [{ id, reporte }], sp, sc }  (sp / sc = números nuevos usados).
 */
function handleAsignarNumeros(requestData) {
  const lock = LockService.getScriptLock();
  try {
    const d = requestData || {};
    if (!correccion_usuarioAutorizado_(d.token)) return createResponse(false, FORMATO_NO_AUTORIZADO);
    const j = formato_jornada_(d.hoja);
    if (j.error) return createResponse(false, j.error);
    const sh = j.sh;
    const zona = formato_zona_(SpreadsheetApp.openById(SPREADSHEET_ID));

    lock.waitLock(20000);
    const datos = formato_leerHoja_(sh);
    const extra = datos.extra;

    // Formularios sin número, por tipo y año
    const grupos = {};
    for (let i = 0; i < extra.length; i++) {
      const e = extra[i];
      const id = formato_texto_(e[FC.id]);
      const tipo = formato_texto_(e[FC.tipo]).toUpperCase();
      if (!id || !FORMATO_PREFIJO[tipo] || formato_texto_(e[FC.reporte])) continue;
      const clave = tipo + '|' + formato_anio_(e[FC.fecha], e[FC.recibido]);
      (grupos[clave] = grupos[clave] || []).push({
        i: i, id: id,
        fecha: formato_claveFecha_(e[FC.fecha], zona),
        recibido: e[FC.recibido] instanceof Date ? e[FC.recibido].getTime() : 0
      });
    }
    const claves = Object.keys(grupos).sort();
    if (!claves.length) return createResponse(true, 'No hay formularios sin número', { asignados: [], sp: 0, sc: 0 });

    const aviso = formato_prepararColumnas_(sh);
    if (aviso) return createResponse(false, aviso);

    const props = PropertiesService.getScriptProperties();
    const asignados = [];
    const cuenta = { SP: 0, SC: 0 };
    const contadores = {};
    claves.forEach(function (clave) {
      const tipo = clave.split('|')[0];
      const anio = clave.split('|')[1];
      const prefijo = FORMATO_PREFIJO[tipo];
      const nombre = 'contador_' + prefijo + '_' + anio;
      let n = Number(props.getProperty(nombre)) || 0;
      const lista = grupos[clave].sort(function (a, b) {
        if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
        if (a.recibido !== b.recibido) return a.recibido - b.recibido;
        return a.i - b.i;
      });
      const porNumero = tipo === '1A' ? FORMATO_BLOQUE_1A : 1;
      lista.forEach(function (x, k) {
        if (k % porNumero === 0) {
          n++;
          cuenta[prefijo]++;
        }
        x.reporte = prefijo + '-' + anio + '-' + ('00' + n).slice(-Math.max(3, String(n).length));
        asignados.push(x);
      });
      contadores[nombre] = String(n);
    });

    // Primero los contadores: si algo falla después queda un número sin usar, nunca uno repetido
    Object.keys(contadores).forEach(function (k) { props.setProperty(k, contadores[k]); });
    asignados.forEach(function (x) {
      sh.getRange(x.i + 2, FORMATO_COL_INICIO + FC.reporte).setNumberFormat('@').setValue(x.reporte);
    });
    SpreadsheetApp.flush();

    return createResponse(true, asignados.length + ' formulario(s) numerado(s)', {
      asignados: asignados.map(function (x) { return { id: x.id, reporte: x.reporte }; }),
      sp: cuenta.SP,
      sc: cuenta.SC
    });
  } catch (error) {
    Logger.log('Error en asignarNumeros: ' + error);
    return createResponse(false, 'Error: ' + error.toString());
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/**
 * POST { action: 'marcarAvisado', token, hoja, id, avisado: true|false }
 * Escribe (fecha y hora del servidor) o borra BA en la fila del formulario con ese id.
 * Respuesta: { id, fila, avisado: 'dd/MM/yyyy HH:mm' | '' }
 */
function handleMarcarAvisado(requestData) {
  const lock = LockService.getScriptLock();
  try {
    const d = requestData || {};
    if (!correccion_usuarioAutorizado_(d.token)) return createResponse(false, FORMATO_NO_AUTORIZADO);
    const id = formato_texto_(d.id);
    if (!id) return createResponse(false, 'Falta el id del formulario');
    if (typeof d.avisado !== 'boolean') return createResponse(false, 'Falta indicar avisado (true o false)');
    const j = formato_jornada_(d.hoja);
    if (j.error) return createResponse(false, j.error);
    const sh = j.sh;
    const zona = formato_zona_(SpreadsheetApp.openById(SPREADSHEET_ID));

    lock.waitLock(20000);
    const extra = formato_leerHoja_(sh).extra;
    let i = -1;
    for (let k = 0; k < extra.length; k++) {
      if (formato_texto_(extra[k][FC.id]) === id) { i = k; break; }
    }
    if (i < 0) return createResponse(false, 'Formulario no encontrado en la jornada: ' + id);
    const aviso = formato_prepararColumnas_(sh);
    if (aviso) return createResponse(false, aviso);

    const ahora = d.avisado ? new Date() : '';
    sh.getRange(i + 2, FORMATO_COL_INICIO + FC.avisado).setNumberFormat('dd/MM/yyyy HH:mm:ss').setValue(ahora);
    SpreadsheetApp.flush();
    return createResponse(true, d.avisado ? 'Aviso registrado' : 'Aviso borrado', {
      id: id, fila: i + 2, avisado: ahora ? Utilities.formatDate(ahora, zona, 'dd/MM/yyyy HH:mm') : ''
    });
  } catch (error) {
    Logger.log('Error en marcarAvisado: ' + error);
    return createResponse(false, 'Error: ' + error.toString());
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/**
 * Fecha programada (columna C) siempre como dd/MM/yyyy, para que la app la compare con el sticker.
 * Acepta celdas de fecha, «02 de Marzo de 2026», «2/3/2026» o «02-03-2026». Si no la entiende, la deja tal cual.
 */
function formato_fechaProgramada_(v, zona) {
  if (v instanceof Date) return Utilities.formatDate(v, zona, 'dd/MM/yyyy');
  const t = formato_texto_(v);
  const dos = function (n) { return ('0' + n).slice(-2); };
  const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
    septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
  let m = t.match(/^(\d{1,2})\s+de\s+([a-záéíóú]+)\s+(?:de(?:l)?\s+)?(\d{4})$/i);
  if (m) {
    const mes = MESES[m[2].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')];
    if (mes) return dos(m[1]) + '/' + dos(mes) + '/' + m[3];
  }
  m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return dos(m[1]) + '/' + dos(m[2]) + '/' + m[3];
  return t;
}
