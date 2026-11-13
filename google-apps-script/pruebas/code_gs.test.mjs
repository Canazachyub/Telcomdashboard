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

let lecturas = 0;
let busquedasTextFinder = 0; // getValues sobre jornadas (para medir qué se vuelve a leer)
let siguienteId = 100;
class Sheet {
  constructor(name, rows) { this.name = name; this.rows = rows; this.id = siguienteId++; this.formulas = {}; }
  getName() { return this.name; }
  getSheetId() { return this.id; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return this.rows[0]?.length || 0; }
  getRange(r, c, nr = 1, nc = 1) {
    const self = this;
    const rango = {
      getValues: () => (!self.name.startsWith('_') && nc >= 12 && lecturas++, 0) || Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => self.rows[r - 1 + i]?.[c - 1 + j] ?? '')),
      getFormulas: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, k) => self.formulas[r + i + ',' + (c + k)] || '')),
      setValues: (v) => {
        v.forEach((row, i) => row.forEach((x, j) => { (self.rows[r - 1 + i] ||= [])[c - 1 + j] = x; }));
        return rango;
      },
      setValue: (x) => { (self.rows[r - 1] ||= [])[c - 1] = x; return rango; },
      getValue: () => self.rows[r - 1]?.[c - 1] ?? '',
      setFontWeight: () => rango, setBackground: () => rango,
      setFormula: (f) => { self.formulas[r + ',' + c] = f; return rango; },
      setNumberFormat: () => rango,
      clearContent: () => {
        for (let i = 0; i < nr; i++) for (let k = 0; k < nc; k++) if (self.rows[r - 1 + i]) self.rows[r - 1 + i][c - 1 + k] = '';
        while (self.rows.length && self.rows[self.rows.length - 1].every((x) => x === '' || x == null)) self.rows.pop();
        return rango;
      },
      createTextFinder: (q) => ({
        matchCase() { return this; },
        findAll: () => {
          const out = [];
          for (let i = 0; i < nr; i++) {
            for (let k = 0; k < nc; k++) {
              const v = String(self.rows[r - 1 + i]?.[c - 1 + k] ?? '');
              if (v.toUpperCase().includes(String(q).toUpperCase())) out.push({ getRow: () => r + i });
            }
          }
          busquedasTextFinder++;
          return out;
        },
      }),
    };
    return rango;
  }
  appendRow(row) { this.rows.push(row.slice()); }
  setFrozenRows() {}
  clearContents() { this.rows = []; }
  hideSheet() { this.oculta = true; }
  getMaxColumns() { return this.maxCols || Math.max(36, ...this.rows.map((x) => x.length)); }
  insertColumnsAfter(_, n) { this.maxCols = this.getMaxColumns() + n; }
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
  LockService: (() => {
    const candado = (nombre) => ({ waitLock() { usos.push(nombre); }, tryLock: () => (usos.push(nombre), true), releaseLock() {} });
    const usos = [];
    return { usos, getScriptLock: () => candado('script'), getUserLock: () => candado('indice') };
  })(),
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
    formatDate: (d, _tz, f) => { const z = (n) => String(n).padStart(2, '0'); return f.replace('dd', z(d.getDate())).replace('MM', z(d.getMonth() + 1)).replace('yyyy', d.getFullYear()).replace('HH', z(d.getHours())).replace('mm', z(d.getMinutes())).replace('ss', z(d.getSeconds())); },
  },
  PropertiesService: (() => {
    const mem = {};
    const p = { getProperty: (k) => (k in mem ? mem[k] : null), setProperty: (k, v) => { mem[k] = String(v); return p; } };
    return { mem, getScriptProperties: () => p };
  })(),
  CacheService: (() => {
    const mem = {};
    const c = { get: (k) => mem[k] ?? null, put: (k, v) => { mem[k] = v; }, remove: (k) => { delete mem[k]; } };
    return { mem, getScriptCache: () => c };
  })(),
  console,
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2], 'utf8') + '\n;globalThis.__f={handleBuscarEnHojas,handleTraerSuministro,handleCorregirSuministro,handleRegistrarCredencial,handleGetCredenciales,handleGuardarFormato,handleGetFormatos,handleGetPlanJornada,handleMarcarCoincidente,handleAsignarNumeros,handleMarcarAvisado,handleEditarFormato,doGet,doPost}; globalThis.__f2={instalarIndiceBusqueda,actualizarIndiceBusqueda,reconstruirIndiceBusqueda}; globalThis.__f3={handleGetSheets,handleGetAllPointsExtended,handleGetTrackingFromPhotos};;', ctx);
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
assert.ok(busquedasTextFinder > 0, 'usa el buscador de Sheets sobre el índice');
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
// Muchas coincidencias parciales: lee el índice completo y ordena bien
const muchas = ss.getSheetByName('OSINERMING');
for (let i = 0; i < 70; i++) muchas.rows.push(fila('', '1007777' + String(i).padStart(4, '0'), 'AB' + i));
ctx.__f2.actualizarIndiceBusqueda();
r = j(handleBuscarEnHojas({ tipo: 'suministro', q: '10077770' }));
assert.equal(r.total, 70);
assert.equal(r.resultados.length, 20);
r = j(handleBuscarEnHojas({ tipo: 'suministro', q: '10077770042' }));
assert.equal(r.resultados[0].exacta, true);
console.log('OK muchas coincidencias: lee el índice completo; exactas primero');
// El índice nunca toma el candado del script (el de savePhoto)
ctx.LockService.usos.length = 0;
ss.getSheetByName('OSINERMING').rows.push(fila(10, '10070000066', '12121212'));
ctx.__f2.actualizarIndiceBusqueda();
ctx.__f2.instalarIndiceBusqueda();
assert.ok(ctx.LockService.usos.length > 0 && ctx.LockService.usos.every((u) => u === 'indice'), ctx.LockService.usos.join(','));
console.log('OK el índice usa su propio candado: no hace esperar a savePhoto');

// getSheets no lista las hojas internas nuevas (la app antigua las mostraría como jornada)
const hojasApi = JSON.parse(ctx.__f3.handleGetSheets().getContent()).map((h) => h.name);
assert.ok(!hojasApi.some((n) => ['_Indice', '_IndiceHojas', '_Traslados', '_Correcciones'].includes(n)));
assert.ok(hojasApi.includes('Usuarios') && hojasApi.includes('_ODT_Tecnicos'), 'las de siempre siguen');
console.log('OK getSheets oculta solo las hojas internas nuevas');
// Reescribir el índice nunca deja la hoja vacía ni con filas viejas sobrantes
{
  const shI = ss.getSheetByName('_Indice');
  const antes = shI.rows.length;
  let minimo = Infinity;
  const orig = shI.getRange.bind(shI);
  shI.getRange = (...a) => { minimo = Math.min(minimo, shI.rows.length); return orig(...a); };
  ctx.__f2.reconstruirIndiceBusqueda();
  shI.getRange = orig;
  assert.ok(minimo > 1, 'la hoja del índice nunca queda vacía al reescribirla');
  assert.equal(shI.rows.length, antes, 'mismo número de filas tras reconstruir');
  ss.getSheetByName('OSINERMING').rows.splice(-70);
  ctx.__f2.reconstruirIndiceBusqueda();
  assert.equal(shI.rows.length, antes - 70, 'las filas que sobran se borran');
  console.log('OK índice: se reescribe sin quedar vacío y borra lo que sobra');
}
// --- formatos 1A / 2A (guardados en la misma jornada, columnas AK–AW) ---
{
  const { handleGuardarFormato, handleGetFormatos, doGet, doPost } = ctx.__f;
  const { handleGetAllPointsExtended, handleGetTrackingFromPhotos } = ctx.__f3;
  const SUM = '10010000500';
  const foto = (num, ts, extra = {}) => fila(num, SUM, 'S500', { 31: ts, 33: 'TEC12345', 34: 'Yub', 35: '#2196F3', 26: -13.5, 27: -72.0, ...extra });
  // AF como fecha: Sheets convirtió el texto «12/11/2026 10:31:05» (fecha del contexto de Code.gs)
  const afFecha = vm.runInContext('new Date(2026, 10, 12, 10, 31, 5)', ctx);
  const jf = new Sheet('JORNADA F', [
    HEAD.slice(),
    fila('', SUM, 'S500'), // 2: fila de la lista
    foto(1, '12/11/2026 10:30:00', { 28: '' }), // 3: medidor
    foto(2, afFecha, { 28: '4321.5' }), // 4: panorámica (AF fecha)
    fila(3, '10010000999', 'X', { 31: '12/11/2026 10:30:00' }), // 5: otro suministro, misma hora
    foto(4, '12/11/2026 10:32:00'), // 6: caja
    foto(5, '12/11/2026 10:40:00'), // 7: foto fuera del formulario
  ]);
  jf.maxCols = 36;
  sheets.push(jf);
  const copiaAJ = () => JSON.stringify(jf.rows.map((x) => x.slice(0, 36)));
  const antesAJ = copiaAJ();
  const puntosAntes = j(handleGetAllPointsExtended('JORNADA F'));
  const rastreoAntes = j(handleGetTrackingFromPhotos());
  const base = () => ({
    id: 'uuid-0001', tipo: '1A', hoja: 'JORNADA F', suministro: ' ' + SUM + ' ', fecha: '12/11/2026 10:35',
    lectura: '4321.5', fechaSticker: '23/02/2026', observacion: '', conforme: true,
    resp: { sticker_ubicado: 'SI', usuario_confirma: 'N.A.', sticker_color: 'SI' },
    patron: 'LE-C-066-2026 · 23/02/2026', carga: '',
    fotos: [
      { timestamp: '12/11/2026 10:30:00', rol: 'Medidor: placa, sticker y precinto' },
      { timestamp: '12/11/2026 10:31:05', rol: 'Panorámica del predio' },
      { timestamp: '12/11/2026 10:32:00', rol: 'Caja portamedidor cerrada' },
    ],
    appVersion: '2.3.0',
  });
  const guardar = (formato, odtId = 'TEC12345') => j(handleGuardarFormato({ action: 'guardarFormato', odtId, formato }));
  const AK = 36; // índice 0-based de AK
  const et = (n) => [jf.rows[n - 1][AK] ?? '', jf.rows[n - 1][48] ?? ''];

  r = j(handleGetFormatos('JORNADA F'));
  assert.equal(r.success, true);
  assert.deepEqual(r.formatos, []);
  console.log('OK getFormatos en jornada sin columnas de formulario: formatos []');

  r = guardar(base(), 'NOEXISTE');
  assert.equal(r.success, false);
  assert.equal(r.message, 'No autorizado: tu perfil de técnico no está registrado. Abre la app con internet e inténtalo otra vez');
  r = guardar(base(), '');
  assert.equal(r.success, false);
  assert.match(r.message, /No autorizado/);
  console.log('OK guardarFormato: técnico no registrado rechazado');

  for (const [cambio, motivo] of [
    [{ tipo: '3B' }, 'tipo'], [{ tipo: '' }, 'tipo vacío'], [{ hoja: 'NO EXISTE' }, 'hoja inexistente'],
    [{ hoja: '_ODT_Tecnicos' }, 'hoja interna _'], [{ hoja: 'Usuarios' }, 'hoja Usuarios'],
    [{ suministro: '' }, 'sin suministro'], [{ id: '' }, 'sin id'], [{ id: 'x'.repeat(65) }, 'id > 64'],
    [{ resp: null }, 'resp null'], [{ resp: ['SI'] }, 'resp array'], [{ resp: 'SI' }, 'resp texto'],
    [{ conforme: false, observacion: '  ' }, 'NO sin observación'], [{ conforme: 'no' }, 'conforme no booleano'],
  ]) {
    r = guardar({ ...base(), ...cambio });
    assert.equal(r.success, false, motivo);
  }
  r = guardar({ ...base(), hoja: 'legacy' });
  assert.equal(r.message, 'Esta jornada es de formato antiguo; el formulario no se puede guardar ahí');
  r = guardar({ ...base(), fotos: [{ timestamp: '01/01/2020 00:00:00', rol: 'Panorámica del predio' }] });
  assert.deepEqual([r.success, r.message], [false, 'Primero sincroniza las fotos de este suministro']);
  r = guardar({ ...base(), suministro: '10070000009', hoja: 'OSINERMING' });
  assert.equal(r.message, 'Primero sincroniza las fotos de este suministro');
  assert.equal(copiaAJ(), antesAJ);
  assert.ok(jf.rows.every((x) => x.length <= 36), 'los rechazos no escriben');
  console.log('OK rechaza tipo, hoja, hoja interna, id, resp, NO sin observación, jornada antigua y fotos sin sincronizar');

  ctx.LockService.usos.length = 0;
  r = guardar({ ...base(), resp: { ...base().resp, sticker_plumon: 'NO', caja_cerrada: 'NO' }, conforme: false, observacion: 'Sin plumón' });
  assert.equal(r.success, true, r.message);
  assert.deepEqual([r.id, r.fila, r.actualizado], ['uuid-0001', 4, false]);
  assert.ok(ctx.LockService.usos.includes('script'), 'escribe con el candado del script');
  assert.equal(jf.maxCols, 54, 'agrega columnas hasta BB');
  assert.deepEqual(jf.rows[0].slice(AK), ['ETIQUETA_FOTO', 'FORMATO', 'FORMATO_ID', 'CONFORME', 'FECHA_STICKER', 'OBS_FORMATO',
    'ITEMS_NO', 'RESPUESTAS', 'CERT_PATRON', 'CERT_CARGA', 'RECIBIDO', 'FORMATO_FECHA', 'FORMATO_ID_FOTO', 'LECTURA_FORMATO',
    'COINCIDENTE_PLAN', 'REPORTE', 'AVISADO', 'EDITADO']);
  assert.equal(jf.rows[0].slice(0, 36).join('|'), HEAD.join('|'), 'encabezados A–AJ intactos');
  assert.equal(copiaAJ(), antesAJ, 'A–AJ de todas las filas intactas');
  assert.deepEqual(et(3), ['Medidor: placa, sticker y precinto', 'uuid-0001']);
  assert.deepEqual(et(4), ['Panorámica del predio', 'uuid-0001'], 'reconoce AF guardado como fecha');
  assert.deepEqual(et(6), ['Caja portamedidor cerrada', 'uuid-0001']);
  assert.deepEqual(et(5), ['', ''], 'otro suministro con la misma hora no se toca');
  assert.deepEqual(et(7), ['', '']);
  assert.deepEqual(et(2), ['', ''], 'la fila de la lista no se toca');
  const fp = jf.rows[3];
  assert.deepEqual(fp.slice(37, 46), ['1A', 'uuid-0001', 'NO', '23/02/2026', 'Sin plumón',
    'Sticker llenado con plumón indeleble; Caja cerrada y asegurada',
    'sticker_ubicado=SI; sticker_plumon=NO; sticker_color=SI; caja_cerrada=NO; usuario_confirma=N.A.',
    'LE-C-066-2026 · 23/02/2026', '']);
  assert.equal(Object.prototype.toString.call(fp[46]), '[object Date]', 'RECIBIDO es fecha del servidor');
  assert.equal(fp[47], '12/11/2026 10:35');
  assert.equal(fp[49], '4321.5', 'AX LECTURA_FORMATO en la fila del formulario');
  assert.ok([3, 6].every((n) => jf.rows[n - 1].slice(37, 48).every((x) => x === '' || x == null)), 'datos solo en la fila panorámica');
  console.log('OK primer guardado: etiquetas por hora (incl. AF fecha), formulario en la fila panorámica, A–AJ intactas');

  r = j(handleGetFormatos('JORNADA F'));
  assert.equal(r.success, true);
  assert.equal(r.formatos.length, 1);
  const fo = r.formatos[0];
  assert.deepEqual(Object.keys(fo).sort(), ['carga', 'conforme', 'fecha', 'fechaSticker', 'fotos', 'hoja', 'id', 'lectura',
    'observacion', 'patron', 'recibido', 'resp', 'suministro', 'tecnico', 'tipo', 'reporte', 'avisado', 'editado'].sort());
  assert.ok(!('odtId' in fo) && !JSON.stringify(r).includes('TEC12345'), 'nunca devuelve el odtId');
  assert.deepEqual([fo.id, fo.tipo, fo.hoja, fo.suministro, fo.fecha, fo.tecnico, fo.lectura, fo.fechaSticker, fo.conforme],
    ['uuid-0001', '1A', 'JORNADA F', SUM, '12/11/2026 10:35', 'Yub', '4321.5', '23/02/2026', false]);
  assert.deepEqual(fo.resp, { sticker_ubicado: 'SI', sticker_plumon: 'NO', sticker_color: 'SI', caja_cerrada: 'NO', usuario_confirma: 'N.A.' });
  assert.deepEqual(fo.fotos.map((x) => ({ timestamp: x.timestamp, rol: x.rol })), base().fotos, 'fotos con su timestamp de la app y su rol');
  assert.deepEqual(fo.fotos.map((x) => x.fila), [3, 4, 6], 'y su fila');
  assert.match(fo.recibido, /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  console.log('OK getFormatos: arma el formulario desde AK–AW, fotos por dueño, sin odtId');

  // Mismo id otra vez: sin la panorámica y con otra foto → se mueve, sin duplicar
  r = guardar({ ...base(), fotos: [base().fotos[0], { timestamp: '12/11/2026 10:40:00', rol: 'Foto adicional' }] });
  assert.equal(r.success, true, r.message);
  assert.deepEqual([r.fila, r.actualizado], [3, true], 'sin panorámica: la primera foto encontrada');
  assert.deepEqual(et(4), ['', ''], 'la panorámica que salió pierde su etiqueta');
  assert.deepEqual(et(6), ['', '']);
  assert.deepEqual(et(7), ['Foto adicional', 'uuid-0001']);
  assert.ok(jf.rows[3].slice(37, 48).every((x) => x === '') && jf.rows[3][49] === '', 'datos viejos borrados (AL–AV y AX)');
  assert.equal(jf.rows.filter((x) => x[38] === 'uuid-0001').length, 1, 'un solo formulario con ese id');
  r = guardar(base());
  assert.deepEqual([r.fila, r.actualizado], [4, true]);
  assert.equal(jf.rows.filter((x) => x[38] === 'uuid-0001').length, 1);
  assert.deepEqual([et(3)[0], et(4)[0], et(6)[0], et(7)[0]],
    ['Medidor: placa, sticker y precinto', 'Panorámica del predio', 'Caja portamedidor cerrada', '']);
  assert.equal(copiaAJ(), antesAJ);
  console.log('OK mismo id dos veces: se mueve/actualiza, actualizado:true, nunca duplica');

  // Segundo formulario (2A) en la misma jornada, por las rutas reales
  const f2 = {
    ...base(), id: 'uuid-0002', tipo: '2A', resp: { ot: 'SI', cumple: 'NO' }, conforme: false, observacion: 'x',
    fotos: [{ timestamp: '12/11/2026 10:40:00', rol: 'Panorámica con el personal trabajando' }],
  };
  r = j(doPost({ parameter: { payload: JSON.stringify({ action: 'guardarFormato', odtId: 'TEC12345', formato: f2 }) } }));
  assert.equal(r.success, true, r.message);
  assert.equal(r.fila, 7);
  r = j(doGet({ parameter: { action: 'getFormatos', sheetName: 'JORNADA F' } }));
  assert.equal(r.formatos.length, 2);
  assert.deepEqual(r.formatos.find((x) => x.id === 'uuid-0002').fotos, [{ timestamp: '12/11/2026 10:40:00', rol: 'Panorámica con el personal trabajando', url: '', fila: 7 }]);
  assert.equal(r.formatos.find((x) => x.id === 'uuid-0001').fotos.length, 3);
  assert.equal(jf.rows[6][42], 'Cumplió el procedimiento de trabajo');
  r = j(doGet({ parameter: { action: 'getFormatos', sheetName: 'OSINERMING' } }));
  assert.deepEqual([r.success, r.formatos], [true, []], 'filtra por jornada');
  r = j(doGet({ parameter: { action: 'getFormatos', sheetName: 'legacy' } }));
  assert.deepEqual(r.formatos, []);
  console.log('OK doPost guardarFormato / doGet getFormatos; filtra por jornada');

  // Los lectores de siempre no cambian con las columnas nuevas
  assert.equal(JSON.stringify(j(handleGetAllPointsExtended('JORNADA F'))), JSON.stringify(puntosAntes));
  const sinHora = (x) => JSON.stringify({ ...x, timestamp: undefined }); // hora de la respuesta
  assert.equal(sinHora(j(handleGetTrackingFromPhotos())), sinHora(rastreoAntes));
  delete cache.indice_revisado;
  ctx.__f2.reconstruirIndiceBusqueda();
  r = j(handleBuscarEnHojas({ tipo: 'suministro', q: SUM }));
  assert.deepEqual(r.resultados.map((x) => [x.hoja, x.fotos, x.deLista]), [['JORNADA F', 4, true]]);
  console.log('OK getAllPointsExtended, rastreo e índice dan lo mismo con AK–AW');

  const hojas = JSON.parse(ctx.__f3.handleGetSheets().getContent()).map((h) => h.name);
  assert.deepEqual(hojas, sheets.map((s) => s.name).filter((n) => !['_Indice', '_IndiceHojas', '_Traslados', '_Correcciones'].includes(n)));
  assert.ok(!ss.getSheetByName('_Formatos'), 'no existe hoja aparte');
  console.log('OK getSheets igual que siempre; no se crea ninguna hoja nueva');
}
// --- formatos: AX LECTURA_FORMATO, prioridad de la lectura y foto «Lectura del medidor» ---
{
  const { handleGuardarFormato, handleGetFormatos } = ctx.__f;
  const SUM = '10010000600';
  const foto = (num, ts, ac) => fila(num, SUM, 'S600', { 31: ts, 33: 'TEC12345', 34: 'Yub', 28: ac });
  const jg = new Sheet('JORNADA G', [
    HEAD.slice(),
    fila('', SUM, 'S600'),
    foto(1, '13/11/2026 09:00:00', '111'), // 3: panorámica
    foto(2, '13/11/2026 09:01:00', '222'), // 4: lectura del medidor
    foto(3, '13/11/2026 09:02:00', '333'), // 5: medidor
  ]);
  sheets.push(jg);
  const antesAJ = JSON.stringify(jg.rows.map((x) => x.slice(0, 36)));
  const F = {
    pan: { timestamp: '13/11/2026 09:00:00', rol: 'Panorámica del predio' },
    lec: { timestamp: '13/11/2026 09:01:00', rol: 'Lectura del medidor' },
    med: { timestamp: '13/11/2026 09:02:00', rol: 'Medidor: placa, sticker y precinto' },
  };
  const g = (extra) => j(handleGuardarFormato({ odtId: 'TEC12345', formato: {
    id: 'uuid-g', tipo: '1A', hoja: 'JORNADA G', suministro: SUM, fecha: '13/11/2026 09:05', fechaSticker: '',
    observacion: '', conforme: true, resp: { sticker_ubicado: 'SI' }, patron: '', carga: '', appVersion: '2.3.0',
    lectura: '0777.70', fotos: [F.pan, F.lec, F.med], ...extra } }));
  const lectura = () => j(handleGetFormatos('JORNADA G')).formatos.find((x) => x.id === 'uuid-g').lectura;

  r = g({});
  assert.equal(r.success, true, r.message);
  assert.deepEqual([r.fila, r.actualizado], [3, false], 'la panorámica sigue siendo la preferida');
  assert.equal(jg.rows[0][49], 'LECTURA_FORMATO');
  assert.equal(jg.rows[2][49], '0777.70', 'AX en la fila del formulario, como texto');
  assert.equal(jg.rows[3][36], 'Lectura del medidor', 'la foto de la lectura queda etiquetada');
  assert.equal(lectura(), '0777.70', '1º AX');
  console.log('OK AX LECTURA_FORMATO se escribe y se lee (prioridad 1)');

  r = g({ lectura: '' });
  assert.deepEqual([r.fila, r.actualizado], [3, true]);
  assert.equal(jg.rows[2][49], '');
  assert.equal(lectura(), '222', '2º AC de su foto «Lectura del medidor»');
  r = g({ lectura: '', fotos: [F.pan, F.med] });
  assert.equal(lectura(), '111', '3º AC de la fila del formulario');
  jg.rows[2][28] = '';
  assert.equal(lectura(), '333', '4º primera AC no vacía entre sus fotos');
  jg.rows[2][28] = '111';
  console.log('OK prioridad de la lectura: AX > foto «Lectura del medidor» > fila del formulario > sus fotos');

  r = g({ lectura: '0888', fotos: [F.lec, F.med] });
  assert.deepEqual([r.fila, r.actualizado], [4, true], 'sin panorámica: la fila de «Lectura del medidor»');
  assert.ok(jg.rows[2].slice(37, 48).every((x) => x === '') && jg.rows[2][49] === '', 'la fila anterior queda sin AL–AV ni AX');
  assert.deepEqual([jg.rows[2][36], jg.rows[2][48]], ['', '']);
  assert.equal(jg.rows[3][49], '0888');
  assert.equal(jg.rows.filter((x) => x[38] === 'uuid-g').length, 1);
  assert.equal(lectura(), '0888');
  assert.equal(JSON.stringify(jg.rows.map((x) => x.slice(0, 36))), antesAJ, 'A–AJ intactas');
  console.log('OK mover el id limpia AX; sin panorámica usa la fila de «Lectura del medidor»');
}
// --- ampliación (tarde): plan de la jornada, coincidentes, numeración fija, avisos y links de fotos ---
{
  const { handleGuardarFormato, handleGetFormatos, handleGetPlanJornada, handleMarcarCoincidente, handleAsignarNumeros,
    handleMarcarAvisado, handleEditarFormato, doGet, doPost } = ctx.__f;
  const { handleGetAllPointsExtended, handleGetTrackingFromPhotos } = ctx.__f3;
  const props = ctx.PropertiesService.mem;
  ss.getSheetByName('Usuarios').rows.push(['sup@x.com', 'h', 'S', 'SUPERVISOR', 'TRUE'], ['tec@x.com', 'h', 'T', 'TECNICO', 'TRUE']);
  vm.runInContext("verifyToken = (t) => ({ TOKEN_ADMIN: 'admin@x.com', TOKEN_SUP: 'sup@x.com', TOKEN_TEC: 'tec@x.com' })[t] || null;", ctx);
  const fechaC = vm.runInContext('new Date(2026, 10, 14, 0, 0, 0)', ctx);

  // Jornada con un formulario por suministro: fila programada + fila de foto (panorámica)
  const jornada = (nombre, lista, odt = 'TEC12345') => {
    const rows = [HEAD.slice()];
    lista.forEach((x, k) => rows.push(fila('', x.sum, 'S', { 2: k === 0 ? fechaC : '15/11/2026' })));
    lista.forEach((x, k) => {
      x.ts = '20/11/2026 08:' + String(k).padStart(2, '0') + ':00';
      rows.push(fila(k + 1, x.sum, 'S', { 31: x.ts, 33: odt, 34: odt ? 'Yub' : '', 28: '1' }));
    });
    const sh = new Sheet(nombre, rows);
    sheets.push(sh);
    return sh;
  };
  const guardarEn = (hoja, x, extra = {}) => j(handleGuardarFormato({ odtId: 'TEC12345', formato: {
    id: x.id, tipo: x.tipo, hoja, suministro: x.sum, fecha: x.fecha, lectura: '', fechaSticker: '', observacion: 'obs',
    conforme: false, resp: {}, patron: '', carga: '', appVersion: '2.3.0',
    fotos: [{ timestamp: x.ts, rol: x.tipo === '1A' ? 'Panorámica del predio' : 'Panorámica con el personal trabajando' }], ...extra } }));

  // JORNADA H: 12 formularios 1A (fechas en orden inverso a las filas) y 2 formularios 2A
  const H = [];
  for (let k = 0; k < 12; k++) H.push({ id: 'h1a-' + k, tipo: '1A', sum: '2000000' + String(k).padStart(4, '0'), fecha: (28 - k) + '/11/2026 09:00' });
  H.push({ id: 'h2a-0', tipo: '2A', sum: '20000000100', fecha: '21/11/2026 10:00' }, { id: 'h2a-1', tipo: '2A', sum: '20000000101', fecha: '20/11/2026 10:00' });
  // Uno más con su foto ya en la hoja, que se guarda después de numerar
  const extraH = { id: 'h1a-nuevo', tipo: '1A', sum: '20000000200', fecha: '01/11/2026 08:00' };
  const jh = jornada('JORNADA H', H.concat([extraH]));
  const filaFoto = (x) => jh.rows.findIndex((row) => row[0] !== '' && row[3] === x.sum) + 1;
  // Link de la foto: fórmula HYPERLINK en X (como savePhoto) y, en otra, el link como valor
  jh.formulas[filaFoto(H[0]) + ',24'] = '=HYPERLINK("https://drive.google.com/file/d/AAA111/view", "Ver foto")';
  jh.rows[filaFoto(H[1]) - 1][23] = 'https://drive.google.com/file/d/BBB222/view';
  H.forEach((x) => assert.equal(guardarEn('JORNADA H', x).success, true, x.id));
  const antesAJ = JSON.stringify(jh.rows.map((x) => x.slice(0, 36)));
  const puntosAntes = j(handleGetAllPointsExtended('JORNADA H'));
  const sinHora = (x) => JSON.stringify({ ...x, timestamp: undefined });
  const rastreoAntes = j(handleGetTrackingFromPhotos());
  const hojasAntes = JSON.parse(ctx.__f3.handleGetSheets().getContent()).map((h) => h.name);

  // --- getPlanJornada ---
  r = j(doGet({ parameter: { action: 'getPlanJornada', sheetName: 'JORNADA H' } }));
  assert.equal(r.success, true, r.message);
  assert.equal(r.plan.length, 15, 'una entrada por suministro programado');
  assert.deepEqual(r.plan[0], { suministro: '20000000000', fechaProgramada: '14/11/2026', tecnico: 'TEC', coincidente: false }, 'fecha de C como fecha');
  assert.equal(r.plan[1].fechaProgramada, '15/11/2026', 'fecha de C como texto');
  r = j(handleGetPlanJornada('legacy'));
  assert.deepEqual([r.success, r.plan], [true, []]);
  r = j(handleGetPlanJornada('Usuarios'));
  assert.deepEqual([r.success, r.plan], [false, []]);
  sheets.push(new Sheet('SOLO FOTOS', [HEAD.slice(), fila(1, '30000000001', 'S', { 2: fechaC }), fila(2, '30000000001', 'S'), fila(3, '30000000002', 'S')]));
  r = j(handleGetPlanJornada('SOLO FOTOS'));
  assert.deepEqual(r.plan.map((x) => [x.suministro, x.fechaProgramada]), [['30000000001', ''], ['30000000002', '']], 'sin programadas: suministros de D sin fecha');
  console.log('OK getPlanJornada: programadas con fecha de C (fecha o texto), sin programadas usa D, antigua → []');

  // --- Autorización: sin token, token falso y rol técnico se rechazan sin escribir ---
  const pedidos = {
    marcarCoincidente: { hoja: 'JORNADA H', suministros: ['20000000000'], valor: true },
    asignarNumeros: { hoja: 'JORNADA H' },
    marcarAvisado: { hoja: 'JORNADA H', id: 'h1a-0', avisado: true },
  };
  const copia = () => JSON.stringify(jh.rows);
  const antes = copia();
  for (const [action, body] of Object.entries(pedidos)) {
    for (const token of [undefined, 'token-falso', 'TOKEN_TEC']) {
      r = j(doPost({ parameter: { payload: JSON.stringify({ action, token, ...body }) } }));
      assert.equal(r.success, false, action + ' ' + token);
      assert.equal(r.message, 'No autorizado: inicia sesión en el dashboard como administrador o supervisor');
    }
  }
  assert.equal(copia(), antes, 'los rechazos no escriben');
  assert.deepEqual(Object.keys(props), [], 'ni tocan los contadores');
  console.log('OK marcarCoincidente / asignarNumeros / marcarAvisado: sin token, token falso o rol técnico → No autorizado');

  // --- marcarCoincidente ---
  r = j(handleMarcarCoincidente({ token: 'TOKEN_SUP', hoja: 'JORNADA H', suministros: ['20000000000', ' 20000000001 ', '99999'], valor: true }));
  assert.deepEqual([r.success, r.marcados], [true, 2], r.message);
  assert.equal(jh.rows[0][50], 'COINCIDENTE_PLAN');
  assert.deepEqual([jh.rows[1][50], jh.rows[2][50], jh.rows[3][50]], ['SI', 'SI', '']);
  assert.ok(jh.rows.filter((x) => x[0] !== '' && x !== jh.rows[0]).every((x) => (x[50] ?? '') === ''), 'filas de foto sin AY');
  r = j(handleMarcarCoincidente({ token: 'TOKEN_ADMIN', hoja: 'JORNADA H', suministros: ['20000000001'], valor: false }));
  assert.equal(r.marcados, 1);
  r = j(handleGetPlanJornada('JORNADA H'));
  assert.deepEqual(r.plan.slice(0, 3).map((x) => x.coincidente), [true, false, false]);
  r = j(handleMarcarCoincidente({ token: 'TOKEN_SUP', hoja: 'legacy', suministros: ['1'], valor: true }));
  assert.equal(r.success, false);
  console.log('OK marcarCoincidente: SI en AY de la fila programada; desmarca; getPlanJornada lo refleja');

  // --- asignarNumeros ---
  const numeros = () => Object.fromEntries(j(handleGetFormatos('JORNADA H')).formatos.map((f) => [f.id, f.reporte]));
  r = j(handleAsignarNumeros({ token: 'TOKEN_SUP', hoja: 'JORNADA H' }));
  assert.equal(r.success, true, r.message);
  assert.deepEqual([r.asignados.length, r.sp, r.sc], [14, 2, 2]);
  let n = numeros();
  // Por FORMATO_FECHA: los 10 más antiguos (k = 11..2) son SP-001; los 2 más nuevos (k = 1, 0) SP-002
  for (let k = 2; k < 12; k++) assert.equal(n['h1a-' + k], 'SP-2026-001', 'h1a-' + k);
  assert.deepEqual([n['h1a-0'], n['h1a-1']], ['SP-2026-002', 'SP-2026-002']);
  assert.deepEqual([n['h2a-1'], n['h2a-0']], ['SC-2026-001', 'SC-2026-002'], '2A: uno por formulario, por fecha');
  assert.deepEqual([props.contador_SP_2026, props.contador_SC_2026], ['2', '2']);
  r = j(handleAsignarNumeros({ token: 'TOKEN_SUP', hoja: 'JORNADA H' }));
  assert.deepEqual([r.success, r.asignados, r.sp, r.sc], [true, [], 0, 0]);
  assert.deepEqual(numeros(), n, 'volver a numerar no cambia nada');
  assert.deepEqual([props.contador_SP_2026, props.contador_SC_2026], ['2', '2']);
  console.log('OK asignarNumeros: 1A por fecha en bloques de 10, 2A uno por uno; repetir no cambia nada');

  // Formulario nuevo en la misma jornada: toma el número siguiente sin renumerar los viejos
  assert.equal(guardarEn('JORNADA H', extraH).success, true);
  r = j(handleAsignarNumeros({ token: 'TOKEN_ADMIN', hoja: 'JORNADA H' }));
  assert.deepEqual(r.asignados, [{ id: 'h1a-nuevo', reporte: 'SP-2026-003' }]);
  const n2 = numeros();
  Object.keys(n).forEach((id) => assert.equal(n2[id], n[id], 'los numerados no cambian: ' + id));

  // Otra jornada: los contadores siguen (globales por año) y cada año tiene el suyo
  const I = [
    { id: 'i1a-0', tipo: '1A', sum: '21000000000', fecha: '30/11/2026 09:00' },
    { id: 'i1a-1', tipo: '1A', sum: '21000000001', fecha: '02/01/2027 09:00' },
    { id: 'i2a-0', tipo: '2A', sum: '21000000002', fecha: '30/11/2026 10:00' },
  ];
  jornada('JORNADA I', I, '');
  I.forEach((x) => assert.equal(guardarEn('JORNADA I', x).success, true));
  r = j(handleAsignarNumeros({ token: 'TOKEN_SUP', hoja: 'JORNADA I' }));
  assert.deepEqual(Object.fromEntries(r.asignados.map((x) => [x.id, x.reporte])),
    { 'i1a-0': 'SP-2026-004', 'i1a-1': 'SP-2027-001', 'i2a-0': 'SC-2026-003' });
  assert.deepEqual([props.contador_SP_2026, props.contador_SC_2026, props.contador_SP_2027], ['4', '3', '1']);
  props.contador_SC_2026 = '999';
  const K = [{ id: 'k2a-0', tipo: '2A', sum: '22000000000', fecha: '30/11/2026 10:00' }];
  jornada('JORNADA K', K, '');
  assert.equal(guardarEn('JORNADA K', K[0]).success, true);
  r = j(handleAsignarNumeros({ token: 'TOKEN_SUP', hoja: 'JORNADA K' }));
  assert.equal(r.asignados[0].reporte, 'SC-2026-1000', 'más de 999: más dígitos');
  console.log('OK asignarNumeros: formularios nuevos toman el siguiente; contadores globales entre jornadas y por año');

  // --- marcarAvisado ---
  r = j(handleMarcarAvisado({ token: 'TOKEN_SUP', hoja: 'JORNADA H', id: 'h1a-0', avisado: true }));
  assert.equal(r.success, true, r.message);
  assert.match(r.avisado, /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  const filaH0 = r.fila;
  assert.equal(Object.prototype.toString.call(jh.rows[filaH0 - 1][52]), '[object Date]', 'BA es fecha del servidor');
  r = j(handleMarcarAvisado({ token: 'TOKEN_SUP', hoja: 'JORNADA H', id: 'no-existe', avisado: true }));
  assert.equal(r.success, false);
  r = j(handleMarcarAvisado({ token: 'TOKEN_SUP', hoja: 'JORNADA H', id: 'h1a-1', avisado: true }));
  r = j(handleMarcarAvisado({ token: 'TOKEN_SUP', hoja: 'JORNADA H', id: 'h1a-1', avisado: false }));
  assert.deepEqual([r.success, r.avisado], [true, '']);
  console.log('OK marcarAvisado: fecha del servidor en BA de la fila del formulario; se puede borrar');

  // --- getFormatos: reporte, avisado, url y fila ---
  let fs0 = j(handleGetFormatos('JORNADA H')).formatos;
  const f0 = fs0.find((x) => x.id === 'h1a-0');
  const f1 = fs0.find((x) => x.id === 'h1a-1');
  assert.equal(f0.reporte, 'SP-2026-002');
  assert.match(f0.avisado, /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  assert.equal(f1.avisado, '');
  assert.deepEqual(f0.fotos, [{ timestamp: H[0].ts, rol: 'Panorámica del predio', url: 'https://drive.google.com/file/d/AAA111/view', fila: filaFoto(H[0]) }]);
  assert.equal(f1.fotos[0].url, 'https://drive.google.com/file/d/BBB222/view', 'link como valor si no hay fórmula');
  assert.equal(fs0.find((x) => x.id === 'h1a-2').fotos[0].url, '', 'sin link: vacío');
  console.log('OK getFormatos: reporte, avisado, url (de la fórmula HYPERLINK) y fila de cada foto');

  // --- AZ y BA siguen al formulario cuando su id se mueve de fila ---
  const nuevaFila = jh.rows.length + 1;
  jh.rows.push(fila(99, H[0].sum, 'S', { 31: '20/11/2026 09:30:00', 33: 'TEC12345', 34: 'Yub' }));
  const avisadoAntes = jh.rows[filaH0 - 1][52];
  r = guardarEn('JORNADA H', H[0], { fotos: [{ timestamp: '20/11/2026 09:30:00', rol: 'Medidor: placa, sticker y precinto' }] });
  assert.deepEqual([r.success, r.fila, r.actualizado], [true, nuevaFila, true], r.message);
  assert.deepEqual([jh.rows[nuevaFila - 1][51], jh.rows[nuevaFila - 1][52]], ['SP-2026-002', avisadoAntes], 'AZ y BA en la fila nueva');
  assert.deepEqual([jh.rows[filaH0 - 1][51], jh.rows[filaH0 - 1][52]], ['', ''], 'la fila vieja queda sin AZ ni BA');
  assert.equal(jh.rows.filter((x) => x[38] === 'h1a-0').length, 1);
  r = guardarEn('JORNADA H', H[0]); // vuelve a la panorámica
  assert.deepEqual([r.fila, jh.rows[filaH0 - 1][51], jh.rows[filaH0 - 1][52]], [filaH0, 'SP-2026-002', avisadoAntes]);
  assert.deepEqual([jh.rows[nuevaFila - 1][51], jh.rows[nuevaFila - 1][52]], ['', '']);
  jh.rows.pop();
  console.log('OK AZ (número) y BA (aviso) se mueven con el formulario, no se quedan en la fila');

  // --- editarFormato (corrección desde el dashboard) ---
  const editar = (extra) => j(handleEditarFormato({ token: 'TOKEN_SUP', hoja: 'JORNADA H', id: 'h1a-0', ...extra }));
  r = j(handleEditarFormato({ token: 'TOKEN_TEC', hoja: 'JORNADA H', id: 'h1a-0', cambios: {} }));
  assert.equal(r.success, false, 'un técnico no corrige desde el dashboard');
  assert.equal(editar({}).success, false, 'sin cambios');
  assert.match(editar({ cambios: { resp: { inventada: 'SI' } } }).message, /Pregunta desconocida/);
  assert.match(editar({ cambios: { resp: { caja_cerrada: 'TAL VEZ' } } }).message, /Respuesta no válida/);
  assert.equal(j(handleEditarFormato({ token: 'TOKEN_SUP', hoja: 'JORNADA H', id: 'no-existe', cambios: {} })).success, false);
  const filaE = filaH0 - 1;
  const antesE = jh.rows[filaE].slice();
  assert.match(editar({ cambios: { resp: { caja_cerrada: 'NO' }, observacion: '' } }).message, /necesita una observación/);
  assert.deepEqual(jh.rows[filaE], antesE, 'un rechazo no escribe nada');
  r = editar({ cambios: { resp: { caja_cerrada: 'NO', sticker_ubicado: 'SI' }, observacion: 'No cumple: Caja cerrada y asegurada.', fechaSticker: '14/11/2026', lectura: '4521.3' } });
  assert.equal(r.success, true, r.message);
  assert.deepEqual([r.fila, r.conforme], [filaH0, false]);
  assert.match(r.editado, /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2} · sup@x\.com$/);
  assert.deepEqual([jh.rows[filaE][39], jh.rows[filaE][41], jh.rows[filaE][42], jh.rows[filaE][43], jh.rows[filaE][49]],
    ['NO', 'No cumple: Caja cerrada y asegurada.', 'Caja cerrada y asegurada', 'sticker_ubicado=SI; caja_cerrada=NO', '4521.3']);
  assert.equal(jh.rows[filaE][40], '14/11/2026');
  assert.deepEqual([jh.rows[filaE][51], jh.rows[filaE][52], jh.rows[filaE][46], jh.rows[filaE][38]],
    [antesE[51], antesE[52], antesE[46], antesE[38]], 'número, aviso, recibido e id no cambian');
  r = editar({ cambios: { resp: { caja_cerrada: 'SI' } } });
  assert.deepEqual([r.success, r.conforme, jh.rows[filaE][39], jh.rows[filaE][42], jh.rows[filaE][41]],
    [true, true, 'SI', '', 'No cumple: Caja cerrada y asegurada.'], 'sin NO vuelve a conforme; la observación se conserva si no llega');
  let fE = j(handleGetFormatos('JORNADA H')).formatos.find((x) => x.id === 'h1a-0');
  assert.deepEqual([fE.conforme, fE.resp.caja_cerrada, fE.lectura], [true, 'SI', '4521.3']);
  assert.match(fE.editado, /sup@x\.com/);
  r = j(doPost({ parameter: { payload: JSON.stringify({ action: 'editarFormato', token: 'TOKEN_SUP', hoja: 'JORNADA H', id: 'h1a-0', cambios: { patron: 'X' } }) } }));
  assert.equal(r.success, true, 'doPost enruta editarFormato');
  assert.equal(guardarEn('JORNADA H', H[0]).success, true);
  assert.equal(jh.rows[filaE][53], '', 'un reenvío de la app borra la marca EDITADO');
  assert.equal(j(handleGetFormatos('JORNADA H')).formatos.find((x) => x.id === 'h1a-0').editado, '');
  console.log('OK editarFormato: solo admin/supervisor, valida, recalcula conforme e ítems NO, marca BB y no toca AZ/BA/fotos');

  // --- Los lectores de siempre y getSheets no cambian ---
  assert.equal(JSON.stringify(jh.rows.map((x) => x.slice(0, 36))), antesAJ, 'A–AJ intactas');
  assert.equal(JSON.stringify(j(handleGetAllPointsExtended('JORNADA H'))), JSON.stringify(puntosAntes));
  assert.equal(sinHora(j(handleGetTrackingFromPhotos())), sinHora(rastreoAntes));
  const hojasDespues = JSON.parse(ctx.__f3.handleGetSheets().getContent()).map((h) => h.name);
  assert.deepEqual(hojasDespues.filter((h) => hojasAntes.includes(h)), hojasAntes);
  assert.ok(hojasDespues.every((h) => !['_Indice', '_IndiceHojas', '_Traslados', '_Correcciones'].includes(h)));
  console.log('OK getAllPointsExtended, rastreo y getSheets sin cambios con AY–BA');
}
console.log('TODO OK');
