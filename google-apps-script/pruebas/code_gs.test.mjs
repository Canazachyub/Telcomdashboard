// Prueba de Code.gs con un Sheets simulado (no toca producción). Uso: node google-apps-script/pruebas/code_gs.test.mjs Code.gs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const HEAD = ['Nº', 'TECNICO', 'Fecha', 'Suministro', 'Codigo_Ruta', 'Cliente', 'Direccion', 'Distrito', 'SED', 'Marca', 'Modelo', 'Serie'];
while (HEAD.length < 36) HEAD.push('C' + HEAD.length);

function fila(num, sum, serie, extra = {}) {
  const r = new Array(36).fill('');
  r[0] = num; r[1] = 'TEC'; r[3] = sum; r[4] = 'R' + sum; r[5] = 'Cliente ' + sum; r[7] = 'Cusco'; r[11] = serie;
  r[19] = -72.0; r[20] = -13.5;
  for (const [k, v] of Object.entries(extra)) r[k] = v;
  return r;
}

let lecturas = 0; // getValues sobre jornadas (para medir qué se vuelve a leer)
let siguienteId = 100;
class Sheet {
  constructor(name, rows) { this.name = name; this.rows = rows; this.id = siguienteId++; }
  getName() { return this.name; }
  getSheetId() { return this.id; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return this.rows[0]?.length || 0; }
  getRange(r, c, nr = 1, nc = 1) {
    const self = this;
    const rango = {
      getValues: () => (!self.name.startsWith('_') && nc >= 12 && lecturas++, 0) || Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => self.rows[r - 1 + i]?.[c - 1 + j] ?? '')),
      getFormulas: () => Array.from({ length: nr }, () => new Array(nc).fill('')),
      setValues: (v) => {
        v.forEach((row, i) => row.forEach((x, j) => { (self.rows[r - 1 + i] ||= [])[c - 1 + j] = x; }));
        return rango;
      },
      setValue: (x) => { (self.rows[r - 1] ||= [])[c - 1] = x; return rango; },
      getValue: () => self.rows[r - 1]?.[c - 1] ?? '',
      setFontWeight: () => rango, setBackground: () => rango, setFormula: () => rango,
    };
    return rango;
  }
  appendRow(row) { this.rows.push(row.slice()); }
  setFrozenRows() {}
  clearContents() { this.rows = []; }
  hideSheet() { this.oculta = true; }
}

const sheets = [
  new Sheet('Usuarios', [['email', 'hash', 'nombre', 'rol', 'activo'], ['admin@x.com', 'h', 'A', 'ADMIN', 'TRUE']]),
  new Sheet('_ODT_Tecnicos', [['ID', 'Nombre'], ['TEC12345', 'Yub']]),
  new Sheet('SEMANA 1', [HEAD.slice(), fila('', '10010000001', '0012345678'), fila('', '10010000002', '87654321'), fila(1, '10010000002', '87654321')]),
  new Sheet('OSINERMING', [HEAD.slice(), fila('', '10070000009', '2191855'), fila(5, 'y', '', { 33: 'TEC12345', 26: -13.5, 27: -72.0 })]),
  new Sheet('legacy', [['Nº', 'Fecha', 'Suministro'], [1, 'x', '10010000001']]),
];
const ss = {
  getSheets: () => sheets,
  getSheetByName: (n) => sheets.find((s) => s.getName() === n) || null,
  insertSheet: (n) => { const s = new Sheet(n, []); sheets.push(s); return s; },
};
const out = (t) => ({ getContent: () => t, setMimeType() { return this; } });
const ctx = {
  SpreadsheetApp: { openById: () => ss, flush: () => {} },
  ContentService: { createTextOutput: out, MimeType: { JSON: 'json' } },
  LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
  ScriptApp: (() => {
    const triggers = [];
    const b = (fn) => ({
      timeBased: () => ({
        atHour: () => ({ everyDays: () => ({ create: () => triggers.push(fn) }) }),
        everyMinutes: () => ({ create: () => triggers.push(fn) }),
      }),
    });
    return { triggers, getProjectTriggers: () => triggers.map((fn) => ({ getHandlerFunction: () => fn })), deleteTrigger: () => {}, newTrigger: b };
  })(),
  Logger: { log: () => {} },
  DriveApp: (() => {
    const files = {};
    let n = 0;
    const carpeta = (name) => ({
      getFoldersByName: (nm) => { const f = drive.folders[nm]; return { hasNext: () => !!f, next: () => f }; },
      createFolder: (nm) => (drive.folders[nm] = carpeta(nm)),
      createFile: (blob) => {
        const id = 'F' + ++n;
        const f = { id, blob, trashed: false, setDescription() {}, getUrl: () => `https://drive.google.com/file/d/${id}/view`, getBlob: () => blob, setTrashed(t) { this.trashed = t; } };
        files[id] = f;
        return f;
      },
    });
    const drive = { folders: {}, files, getFolderById: () => carpeta('raiz'), getFileById: (id) => { if (!files[id]) throw new Error('no'); return files[id]; } };
    return drive;
  })(),
  Utilities: {
    base64Decode: (b) => Buffer.from(b, 'base64'),
    base64Encode: (b) => Buffer.from(b).toString('base64'),
    newBlob: (bytes, type, name) => ({ bytes, type, name, getBytes: () => bytes, getContentType: () => type }),
  }, PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
  CacheService: (() => {
    const mem = {};
    const c = { get: (k) => mem[k] ?? null, put: (k, v) => { mem[k] = v; }, remove: (k) => { delete mem[k]; } };
    return { mem, getScriptCache: () => c };
  })(),
  console,
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2], 'utf8') + '\n;globalThis.__f={handleBuscarEnHojas,handleTraerSuministro,handleCorregirSuministro,handleRegistrarCredencial,handleGetCredenciales}; globalThis.__f2={instalarIndiceBusqueda,actualizarIndiceBusqueda};;', ctx);
const { handleBuscarEnHojas, handleTraerSuministro, handleCorregirSuministro, handleRegistrarCredencial, handleGetCredenciales } = ctx.__f;
vm.runInContext("verifyToken = (t) => (t === 'TOKEN_ADMIN' ? 'admin@x.com' : null);", ctx);
const j = (r) => JSON.parse(r.getContent());

// --- buscarEnHojas ---
let r = j(handleBuscarEnHojas({ tipo: 'serie', q: '12345678' }));
assert.equal(r.success, true);
assert.equal(r.resultados.length, 1);
assert.deepEqual([r.resultados[0].hoja, r.resultados[0].suministro, r.resultados[0].exacta, r.resultados[0].deLista], ['SEMANA 1', '10010000001', true, true]);
console.log('OK buscar por serie exacta (con ceros a la izquierda en la hoja)');

r = j(handleBuscarEnHojas({ tipo: 'serie', q: '191855' }));
assert.equal(r.resultados[0].suministro, '10070000009');
assert.equal(r.resultados[0].exacta, false);
console.log('OK buscar por serie parcial');

r = j(handleBuscarEnHojas({ tipo: 'suministro', q: '10010000002' }));
assert.equal(r.resultados.length, 1);
assert.equal(r.resultados[0].fotos, 1);
assert.equal(r.resultados[0].deLista, true);
console.log('OK buscar por suministro: agrupa la fila de lista y sus fotos');

r = j(handleBuscarEnHojas({ tipo: 'suministro', q: '1001' }));
assert.ok(r.resultados.every((x) => x.hoja !== 'legacy' && x.hoja !== 'Usuarios'));
console.log('OK no busca en Usuarios, hojas _ ni estructura antigua');

r = j(handleBuscarEnHojas({ tipo: 'serie', q: '12' }));
assert.equal(r.success, false);
console.log('OK menos de 4 caracteres se rechaza');

// --- traerSuministro ---
const osi = ss.getSheetByName('OSINERMING');
const antes = osi.rows.length;
r = j(handleTraerSuministro({ odtId: 'NOEXISTE', desde: 'SEMANA 1', hacia: 'OSINERMING', suministro: '10010000001' }));
assert.equal(r.success, false); assert.match(r.message, /No autorizado/);
assert.equal(osi.rows.length, antes);
console.log('OK técnico no registrado: rechazado sin escribir');

r = j(handleTraerSuministro({ odtId: 'TEC12345', desde: 'SEMANA 1', hacia: 'OSINERMING', suministro: '10010000001' }));
assert.equal(r.success, true, r.message);
const nueva = osi.rows[osi.rows.length - 1];
assert.equal(nueva.length, 36);
assert.equal(nueva[0], '');
assert.equal(nueva[3], '10010000001');
assert.equal(nueva[11], '0012345678');
assert.equal(nueva[5], 'Cliente 10010000001');
assert.ok(nueva.slice(23).every((x) => x === ''));
assert.equal(ss.getSheetByName('SEMANA 1').rows.length, 4, 'el origen no cambia');
assert.equal(ss.getSheetByName('_Traslados').rows.length, 2);
console.log('OK traer: copia B–W como fila de lista, X–AJ vacías, origen intacto, anotado en _Traslados');

r = j(handleTraerSuministro({ odtId: 'TEC12345', desde: 'SEMANA 1', hacia: 'OSINERMING', suministro: '10010000001' }));
assert.equal(r.success, true); assert.equal(r.yaEstaba, true);
assert.equal(osi.rows.length, antes + 1);
console.log('OK traer dos veces no duplica');

r = j(handleTraerSuministro({ odtId: 'TEC12345', desde: 'SEMANA 1', hacia: 'Usuarios', suministro: '10010000001' }));
assert.equal(r.success, false);
r = j(handleTraerSuministro({ odtId: 'TEC12345', desde: 'SEMANA 1', hacia: 'legacy', suministro: '10010000001' }));
assert.equal(r.success, false);
r = j(handleTraerSuministro({ odtId: 'TEC12345', desde: 'SEMANA 1', hacia: 'OSINERMING', suministro: '99999999999' }));
assert.equal(r.success, false);
console.log('OK rechaza hoja oculta, estructura antigua y suministro inexistente');

// --- corregirSuministro (simulación: no escribe) ---
r = j(handleCorregirSuministro({ odtId: 'TEC12345', sheetName: 'OSINERMING', original: 'y', corregido: '10070000009', lat: -13.5, lng: -72.0, simular: true }));
assert.equal(r.success, true, r.message); assert.equal(r.fotos, 1); assert.equal(r.conFilaDeLista, true);
r = j(handleCorregirSuministro({ odtId: 'OTRO', sheetName: 'OSINERMING', original: 'y', corregido: '10070000009', simular: true }));
assert.equal(r.success, false);
r = j(handleCorregirSuministro({ odtId: 'TEC12345', sheetName: 'OSINERMING', original: 'y', corregido: '10010000002', simular: true }));
assert.equal(r.success, false); assert.match(r.message, /no está en la lista/);
r = j(handleCorregirSuministro({ odtId: 'TEC12345', sheetName: 'OSINERMING', original: 'y', corregido: '10070000009', lat: -10, lng: -75, simular: true }));
assert.equal(r.success, false);
console.log('OK corregir: solo sus fotos, solo a la lista, solo cerca del punto');
// --- credenciales ---
const odt = ss.getSheetByName('_ODT_Tecnicos');
odt.rows[0] = ['ID', 'Nombre', 'Telefono', 'Color', 'FechaRegistro', 'UltimaActividad', 'FotosCount'];
odt.rows[1] = ['TEC12345', 'Yub', '999', '#2196F3', '2026-10-01', '', 3];
const foto = Buffer.from('jpeg-falso').toString('base64');
r = j(handleRegistrarCredencial({ odtId: 'NOEXISTE', correo: 'a@b.com', fotoBase64: foto }));
assert.equal(r.success, false); assert.match(r.message, /No autorizado/);
r = j(handleRegistrarCredencial({ odtId: 'TEC12345', correo: 'no-es-correo', fotoBase64: foto }));
assert.equal(r.success, false);
r = j(handleRegistrarCredencial({ odtId: 'TEC12345', correo: ' Yub@Telcom.PE ', lat: -13.52, lng: -71.97, precision: 8.6, ubicacion: 'Cusco', fotoBase64: foto }));
assert.equal(r.success, true, r.message);
assert.deepEqual(odt.rows[0].slice(7, 14), ['Correo', 'Lat_Registro', 'Lng_Registro', 'Precision_m', 'Ubicacion_Registro', 'Foto_Credencial', 'Fecha_Credencial']);
assert.deepEqual(odt.rows[1].slice(0, 7).slice(0, 5), ['TEC12345', 'Yub', '999', '#2196F3', '2026-10-01'], 'A–E no cambian');
assert.deepEqual(odt.rows[1].slice(7, 12), ['yub@telcom.pe', -13.52, -71.97, 9, 'Cusco']);
const url1 = odt.rows[1][12];
assert.match(url1, /drive.google.com\/file\/d\/F1/);
console.log('OK registrar credencial: correo, ubicación y foto en H–N; A–G intactas');

r = j(handleRegistrarCredencial({ odtId: 'TEC12345', correo: 'yub@telcom.pe', fotoBase64: foto }));
assert.equal(r.success, true);
assert.equal(odt.rows[1][8], -13.52, 'sin GPS nuevo conserva la ubicación de registro');
assert.equal(ctx.DriveApp.files.F1.trashed, true, 'la foto anterior va a la papelera');
console.log('OK actualizar credencial: conserva ubicación y reemplaza la foto');

r = j(handleGetCredenciales({ token: 'otro' }));
assert.equal(r.success, false); assert.match(r.message, /No autorizado/);
r = j(handleGetCredenciales({}));
assert.equal(r.success, false);
r = j(handleGetCredenciales({ token: 'TOKEN_ADMIN' }));
assert.equal(r.success, true, r.message);
assert.equal(r.tecnicos.length, 1);
assert.equal(r.tecnicos[0].correo, 'yub@telcom.pe');
assert.equal(r.tecnicos[0].lat, -13.52);
assert.match(r.tecnicos[0].foto, /^data:image\/jpeg;base64,/);
console.log('OK getCredenciales: solo admin/supervisor, con foto en base64');
// --- índice de búsqueda ---
const cache = ctx.CacheService.mem;
const idx = ss.getSheetByName('_Indice');
assert.ok(idx && idx.oculta, 'el índice es una hoja oculta');
assert.ok(idx.rows.some((r) => r[2] === '10010000001'), 'el índice tiene los suministros');

lecturas = 0;
r = j(handleBuscarEnHojas({ tipo: 'serie', q: '87654321' }));
assert.equal(r.resultados[0].suministro, '10010000002');
assert.equal(lecturas, 0, 'con el índice revisado no lee ninguna jornada');
console.log('OK búsqueda con índice: no recorre las jornadas');

// Una foto nueva en SEMANA 1 (fila más): pasado el intervalo, solo se relee esa hoja
ss.getSheetByName('SEMANA 1').rows.push(fila(2, '10010000003', '55554444'));
r = j(handleBuscarEnHojas({ tipo: 'serie', q: '55554444' }));
assert.equal(r.total, 0, 'dentro de los 2 minutos usa el índice tal cual');
delete cache.indice_revisado;
lecturas = 0;
r = j(handleBuscarEnHojas({ tipo: 'serie', q: '55554444' }));
assert.equal(r.resultados[0].suministro, '10010000003');
assert.equal(lecturas, 1, 'solo vuelve a leer la jornada que cambió');
console.log('OK índice incremental: solo relee la jornada con filas nuevas');

// Jornada renombrada y jornada nueva
ss.getSheetByName('SEMANA 1').name = 'SEMANA 1 (renombrada)';
sheets.push(new Sheet('SEMANA 2', [HEAD.slice(), fila('', '10010000077', '77776666')]));
delete cache.indice_revisado;
lecturas = 0;
r = j(handleBuscarEnHojas({ tipo: 'suministro', q: '10010000077' }));
assert.equal(r.resultados[0].hoja, 'SEMANA 2');
r = j(handleBuscarEnHojas({ tipo: 'suministro', q: '10010000001' }));
assert.ok(r.resultados.some((x) => x.hoja === 'SEMANA 1 (renombrada)'));
assert.ok(!idx.rows.some((x) => x[0] === 'SEMANA 1'), 'el nombre viejo sale del índice');
assert.equal(lecturas, 2);
console.log('OK jornada nueva y renombrada se indexan');

// Hoja borrada sale del índice
sheets.splice(sheets.findIndex((x) => x.name === 'SEMANA 2'), 1);
delete cache.indice_revisado;
r = j(handleBuscarEnHojas({ tipo: 'suministro', q: '10010000077' }));
assert.equal(r.total, 0);
console.log('OK jornada borrada sale del índice');

// Traer reindexa solo la jornada destino, al momento y sin esperar la revisión
cache.indice_revisado = '1';
r = j(handleTraerSuministro({ odtId: 'TEC12345', desde: 'SEMANA 1 (renombrada)', hacia: 'OSINERMING', suministro: '10010000003' }));
assert.equal(r.success, true, r.message);
r = j(handleBuscarEnHojas({ tipo: 'suministro', q: '10010000003' }));
assert.ok(r.resultados.some((x) => x.hoja === 'OSINERMING'), 'traer se refleja sin esperar');
assert.equal(cache.indice_revisado, '1', 'traer no obliga a revisar las 100 jornadas');
console.log('OK traer actualiza el índice al momento');

// Reconstrucción nocturna e instalación
lecturas = 0;
ctx.__f2.instalarIndiceBusqueda();
assert.deepEqual(ctx.ScriptApp.triggers, ['reconstruirIndiceBusqueda', 'actualizarIndiceBusqueda']);
assert.ok(lecturas >= 2, 'la reconstrucción lee todas las jornadas');
console.log('OK instalarIndiceBusqueda: arma el índice, revisión cada 15 min y reconstrucción diaria');

// Disparador de 15 min: detecta una foto nueva sin que nadie busque
ss.getSheetByName('OSINERMING').rows.push(fila(9, '10070000055', '99990000'));
cache.indice_revisado = '1';
ctx.__f2.actualizarIndiceBusqueda();
lecturas = 0;
r = j(handleBuscarEnHojas({ tipo: 'serie', q: '99990000' }));
assert.equal(r.resultados[0]?.suministro, '10070000055');
assert.equal(lecturas, 0, 'la búsqueda ya no lee jornadas: lo hizo el disparador');
console.log('OK disparador de 15 min: la búsqueda nunca espera la revisión');
console.log('TODO OK');
