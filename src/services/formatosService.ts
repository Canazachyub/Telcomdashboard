// Formularios 1A / 2A que llena el técnico en la app (TELCOM Operaciones v2.3+).
// Acción «getFormatos» de Code.gs (solo lectura), según docs/diseno/contrato_formatos_api.md.
// Mientras Code.gs no se vuelva a desplegar, el servidor responde «Acción no reconocida»:
// eso se trata como «aún no disponible», nunca como error ni con respuestas inventadas.
import { API_POINTS } from '../config/api';
import type { GpsPointExtended } from '../types/point';
import { EVENTO_REVISAR_SESION, sesionVencida } from '../utils/sesion';
import {
  ITEMS_2A,
  ID_OTRAS,
  ID_CONFORME_2A,
  PREGUNTAS_1A,
  TEXTO_USUARIO_1A,
  fmtFecha,
  fmtHora,
  parseFecha,
  type Evidencia,
  type Resp,
  type Supervisada,
} from '../utils/pdfFormatos';

/** Un formulario tal como lo devuelve el servidor (sin odtId). */
export interface FormatoServidor {
  id: string;
  tipo: '1A' | '2A';
  hoja: string;
  suministro: string;
  /** dd/MM/yyyy HH:mm */
  fecha: string;
  tecnico: string;
  lectura: string;
  fechaSticker: string;
  conforme: boolean | string;
  observacion: string;
  resp: Record<string, string>;
  patron: string;
  carga: string;
  /** `url` y `fila` llegan desde la ampliación de la tarde (link de Drive de la columna X). */
  fotos: { timestamp: string; rol: string; url?: string; fila?: number }[];
  recibido: string;
  /** Número fijo (SP-2026-004 / SC-2026-002) o vacío hasta que se numere. */
  reporte?: string;
  /** Fecha y hora del aviso a la contratista, o vacío. */
  avisado?: string;
  /** «dd/MM/yyyy HH:mm · usuario» si se corrigió desde el dashboard (columna BB), o vacío. */
  editado?: string;
}

/** Una foto del formulario con su etiqueta (para el panel de detalle). */
export interface FotoFormato {
  url?: string;
  rol: string;
  timestamp: string;
}

/** Supervisión con los datos del formulario que solo usa el dashboard (no el PDF). */
export interface SupervisadaApp extends Supervisada {
  /** Id del formulario (para marcarAvisado). */
  id: string;
  /** El número de reporte es provisional (el servidor todavía no lo fijó). */
  provisional: boolean;
  /** Fecha y hora del aviso (vacío si no se avisó). */
  avisadoEn: string;
  fotosApp: FotoFormato[];
  /** Formulario tal como llegó del servidor (para corregirlo); no existe en los simulados. */
  servidor?: FormatoServidor;
  /** «dd/MM/yyyy HH:mm · usuario» de la última corrección desde el dashboard. */
  editado: string;
}

export interface RespuestaFormatos {
  success: boolean;
  message?: string;
  formatos: FormatoServidor[];
  /** La acción todavía no está desplegada en el Apps Script */
  sinInstalar?: boolean;
}

// ------------------------------------------------------------------ Caché local (se muestra al instante)
// Cada lectura del Apps Script tarda ~3 s. La última respuesta buena de cada jornada se guarda en el
// navegador y la página la muestra de inmediato mientras pide la versión nueva (se reemplaza al llegar).

const CLAVE_CACHE = 'telcom-formatos-cache-v1';
type Cache = Record<string, { formatos?: FormatoServidor[]; plan?: PlanItem[]; t: number }>;
const leerCache = (): Cache => {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_CACHE) || '{}') as Cache;
  } catch {
    return {};
  }
};
function guardarCache(hoja: string, datos: { formatos?: FormatoServidor[]; plan?: PlanItem[] }) {
  try {
    const c = leerCache();
    c[hoja] = { ...c[hoja], ...datos, t: Date.now() };
    // Solo las 8 jornadas más recientes
    const claves = Object.keys(c).sort((a, b) => c[b].t - c[a].t);
    for (const k of claves.slice(8)) delete c[k];
    localStorage.setItem(CLAVE_CACHE, JSON.stringify(c));
  } catch {
    /* sin almacenamiento: no pasa nada, solo no hay caché */
  }
}
/** Última copia guardada de la jornada (o null). */
export function formatosEnCache(hoja: string): { formatos: FormatoServidor[]; plan: PlanItem[] } | null {
  const e = leerCache()[hoja];
  return e?.formatos ? { formatos: e.formatos, plan: e.plan ?? [] } : null;
}

export async function getFormatos(hoja: string): Promise<RespuestaFormatos> {
  try {
    const r = await fetch(`${API_POINTS}?action=getFormatos&sheetName=${encodeURIComponent(hoja)}`, {
      redirect: 'follow',
    });
    const text = await r.text();
    const j = JSON.parse(text) as RespuestaFormatos;
    j.formatos = Array.isArray(j.formatos) ? j.formatos.filter((f) => f && (f.tipo === '1A' || f.tipo === '2A')) : [];
    if (!j.success && /Acción no reconocida/i.test(j.message || '')) j.sinInstalar = true;
    if (j.success) guardarCache(hoja, { formatos: j.formatos });
    return j;
  } catch (e) {
    return { success: false, message: `No se pudo leer los formularios: ${(e as Error).message}`, formatos: [] };
  }
}

// ------------------------------------------------------------------ Planificación y acciones

/** Un suministro programado de la jornada (filas con la columna A vacía). */
export interface PlanItem {
  suministro: string;
  /** dd/MM/yyyy o vacío */
  fechaProgramada: string;
  tecnico: string;
  coincidente: boolean;
}

export interface RespuestaPlan {
  success: boolean;
  message?: string;
  plan: PlanItem[];
  sinInstalar?: boolean;
}

export async function getPlanJornada(hoja: string): Promise<RespuestaPlan> {
  try {
    const r = await fetch(`${API_POINTS}?action=getPlanJornada&sheetName=${encodeURIComponent(hoja)}`, {
      redirect: 'follow',
    });
    const j = JSON.parse(await r.text()) as RespuestaPlan;
    j.plan = Array.isArray(j.plan)
      ? j.plan
          .filter((x) => x && String(x.suministro ?? '').trim())
          .map((x) => ({
            suministro: String(x.suministro).trim(),
            fechaProgramada: String(x.fechaProgramada ?? '').trim(),
            tecnico: String(x.tecnico ?? '').trim(),
            coincidente: x.coincidente === true || /^(SI|TRUE)$/i.test(String(x.coincidente ?? '')),
          }))
      : [];
    if (!j.success && /Acción no reconocida/i.test(j.message || '')) j.sinInstalar = true;
    if (j.success) guardarCache(hoja, { plan: j.plan });
    return j;
  } catch (e) {
    return { success: false, message: `No se pudo leer la programación: ${(e as Error).message}`, plan: [] };
  }
}

export interface RespuestaAccion {
  success: boolean;
  message?: string;
  sinInstalar?: boolean;
  [k: string]: unknown;
}

/** POST de escritura (admin / supervisor) con el token de sesión. */
async function accion(action: string, datos: Record<string, unknown>): Promise<RespuestaAccion> {
  try {
    const r = await fetch(API_POINTS, {
      method: 'POST',
      // Texto JSON: evita la petición previa CORS que Apps Script no responde
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: localStorage.getItem('authToken') || '', ...datos }),
      redirect: 'follow',
    });
    const text = await r.text();
    try {
      const j = JSON.parse(text) as RespuestaAccion;
      if (!j.success && /Acción no reconocida/i.test(j.message || '')) {
        j.sinInstalar = true;
        j.message = 'El servidor todavía no tiene esta acción desplegada.';
      }
      // Token de más de 24 h: el servidor responde «No autorizado»; decirlo claro y mostrar la franja
      if (!j.success && /No autorizado/i.test(j.message || '') && sesionVencida()) {
        j.message = 'Tu sesión venció: vuelve a iniciar sesión';
        window.dispatchEvent(new Event(EVENTO_REVISAR_SESION));
      }
      return j;
    } catch {
      return { success: false, message: `Respuesta no válida del servidor (${r.status})` };
    }
  } catch (e) {
    return { success: false, message: `Sin conexión con el servidor: ${(e as Error).message}` };
  }
}

/** Marca (o desmarca) suministros programados como coincidentes (columna AY). */
export const marcarCoincidente = (hoja: string, suministros: string[], valor: boolean) =>
  accion('marcarCoincidente', { hoja, suministros, valor });

/** Fija los números SP / SC de los formularios que aún no tienen. Los ya numerados no cambian. */
export const asignarNumeros = (hoja: string) => accion('asignarNumeros', { hoja });

/** Lo que se puede corregir de un formulario desde el dashboard (los que no van, quedan igual). */
export interface CambiosFormato {
  /** Respuestas con los ids de la app (SI / NO / N.A.; vacío borra la respuesta). */
  resp?: Record<string, string>;
  observacion?: string;
  fechaSticker?: string;
  lectura?: string;
  patron?: string;
  carga?: string;
  /** Lista COMPLETA de fotos de evidencia: hora de la foto (Synced_At) e ítem ('' = general). */
  evidencias?: { timestamp: string; pregunta: string }[];
}

/** Corrige las respuestas de un formulario ya recibido (columna BB guarda quién y cuándo). */
export const editarFormato = (hoja: string, id: string, cambios: CambiosFormato) =>
  accion('editarFormato', { hoja, id, cambios });

/** Registra (o borra) el aviso a la contratista de un formulario no conforme. */
export const marcarAvisado = (hoja: string, id: string, avisado: boolean) =>
  accion('marcarAvisado', { hoja, id, avisado });

/**
 * Fecha límite de entrega: 5.º día hábil después del último día programado.
 * `quedan`: días hábiles desde hoy (negativo si ya venció).
 */
export function plazoEntrega(fechas: (Date | null)[], hoy = new Date()) {
  const validas = fechas.filter((d): d is Date => !!d);
  if (!validas.length) return null;
  const fin = new Date(Math.max(...validas.map((d) => d.getTime())));
  const vence = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate());
  let n = 0;
  while (n < 5) {
    vence.setDate(vence.getDate() + 1);
    if (vence.getDay() !== 0 && vence.getDay() !== 6) n++;
  }
  let quedan = 0;
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const sign = d <= vence ? 1 : -1;
  while ((sign > 0 && d < vence) || (sign < 0 && d > vence)) {
    d.setDate(d.getDate() + sign);
    if (d.getDay() !== 0 && d.getDay() !== 6) quedan += sign;
  }
  return {
    fin,
    vence,
    quedan,
    venceTxt: vence.toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: '2-digit' }),
  };
}

/**
 * Ids del 2A: la app (app-movil/lib/prototipo/supervision.dart, bloques2A) usa nombres; el PDF usa
 * `${bloque}_${item}` de ITEMS_2A. Emparejados por el texto y el orden de la plantilla.
 * «otras» en la app es «Sin otras observaciones» (pregunta al revés): se invierte.
 * La última fila («Trabajo ejecutado CONFORME», 3_2) no se pregunta: sale de `conforme`.
 */
export const MAPA_2A: { app: string; pdf: string; invertir?: boolean }[] = [
  // EN CUANTO A LA ADECUADA GESTIÓN DE LAS ACTIVIDADES DE CONTRASTE
  { app: 'ot', pdf: '0_0' }, // Cuenta con Orden de trabajo…
  { app: 'fecha_programada', pdf: '0_1' }, // La intervención corresponde a la fecha programada
  { app: 'grupo', pdf: '0_2' }, // El Grupo de Trabajo se encuentra completo…
  { app: 'senalizo', pdf: '0_3' }, // Se señalizó y/o demarcó la zona de trabajo
  { app: 'registrado', pdf: '0_4' }, // Personal operativo registrado y autorizado ante ELSE
  { app: 'epp', pdf: '0_5' }, // EPP's y uniforme completos…
  { app: 'fotocheck', pdf: '0_6' }, // FOTOCHEK de identificación…
  { app: 'herramientas', pdf: '0_7' }, // Herramientas completas…
  { app: 'equipo_movil', pdf: '0_8' }, // Equipo móvil operativo…
  { app: 'patron_carga', pdf: '0_9' }, // Equipos de contraste (patrón y carga)…
  { app: 'procedimiento', pdf: '0_10' }, // «Procedimiento técnico de contrastación en campo»
  { app: 'vehiculo', pdf: '0_11' }, // Unidad vehicular…
  { app: 'otras', pdf: '0_12', invertir: true }, // Existen otras observaciones (app: «Sin otras…»)
  // PROCEDIMIENTO DE TRABAJO
  { app: 'pruebas', pdf: '1_0' }, // Pruebas de vacío y de contraste
  { app: 'aprueba', pdf: '1_1' }, // Resultados de los ensayos (APRUEBA)
  { app: 'equipos', pdf: '1_2' }, // Uso de Equipos y Herramientas
  { app: 'sticker', pdf: '1_3' }, // Pegado y llenado del sticker
  { app: 'plumon', pdf: '1_4' }, // Uso de plumón indeleble
  { app: 'traslado', pdf: '1_5' }, // Traslado del equipo patrón y carga
  { app: 'informe', pdf: '1_6' }, // Llenado del Informe de Inspección
  // CERTIFICADOS
  { app: 'cert_patron', pdf: '2_0' }, // Certificado vigente del equipo Patrón
  { app: 'cert_carga', pdf: '2_1' }, // Certificado vigente de la carga inductiva
  // CONFORMIDAD
  { app: 'orden', pdf: '3_0' }, // Orden y limpieza al término
  { app: 'cumple', pdf: '3_1' }, // Cumplimiento del procedimiento de trabajo
];

const aResp = (v: unknown): Resp | undefined => {
  const t = String(v ?? '')
    .trim()
    .toUpperCase();
  if (t === 'SI' || t === 'SÍ') return 'SI';
  if (t === 'NO') return 'NO';
  if (t === 'N.A.' || t === 'NA' || t === 'N/A') return 'N.A.';
  return undefined;
};

/** Código de suministro comparable (sin espacios ni ceros a la izquierda). */
export const normSuministro = (s: unknown) =>
  String(s ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/^0+(?=.)/, '');

/** Respuestas 2A de la app → ids del PDF. Sin respuesta, la casilla queda vacía. */
export function mapear2A(resp: Record<string, string>, conforme: boolean): Record<string, Resp> {
  const out: Record<string, Resp> = {};
  for (const m of MAPA_2A) {
    const r = aResp(resp?.[m.app]);
    if (!r) continue;
    out[m.pdf] = m.invertir && r !== 'N.A.' ? (r === 'SI' ? 'NO' : 'SI') : r;
  }
  out[ID_CONFORME_2A] = conforme ? 'SI' : 'NO';
  return out;
}

// ------------------------------------------------------------------ Fotos de evidencia

/** «Evidencia · <idPregunta>» (id de la app) o «Evidencia de la observación» (general). */
const ROL_EVIDENCIA = /^Evidencia\s*·\s*(.+)$/;
const ROL_EVIDENCIA_GENERAL = 'Evidencia de la observación';
/** Casillas del Formato 4 (van en el Formato 4 de siempre, no en el registro adicional del 1A/2A). */
const ROLES_CASILLA = new Set([
  'Panorámica del predio',
  'Panorámica con el personal trabajando',
  'Ensayo de precisión o marcha en vacío',
  'Medidor: placa, sticker y precinto',
  'Caja portamedidor cerrada',
  'Lectura del medidor',
]);
const esEvidencia = (rol: unknown) => {
  const r = String(rol ?? '').trim();
  return r === ROL_EVIDENCIA_GENERAL || ROL_EVIDENCIA.test(r);
};

/** Id de pregunta de la app → id y texto del PDF (1A: iguales; 2A: por MAPA_2A). */
function preguntaPdf(tipo: '1A' | '2A', idApp: string): { pregunta: string; texto: string } {
  if (tipo === '1A') {
    if (idApp === 'usuario_confirma') return { pregunta: idApp, texto: TEXTO_USUARIO_1A };
    const q = PREGUNTAS_1A.find((x) => x.id === idApp);
    return { pregunta: idApp, texto: q?.texto ?? idApp };
  }
  const pdf = MAPA_2A.find((m) => m.app === idApp)?.pdf;
  const q = ITEMS_2A.find((x) => x.id === pdf);
  return q ? { pregunta: q.id, texto: q.texto } : { pregunta: idApp, texto: idApp };
}

/** Segundos desde 1970 de «dd/MM/yyyy HH:mm:ss» (hora local) o de un Date.toString() / ISO. */
function segundos(t: string): number | null {
  const m = t.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  const d = m
    ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0))
    : new Date(t.trim());
  return Number.isNaN(d.getTime()) ? null : Math.floor(d.getTime() / 1000);
}

/**
 * Busca la foto de la hoja que corresponde a un timestamp de la app.
 * Regla: solo entre las fotos del mismo suministro (punto.photoLinks). Cada photoLink trae en
 * `fecha` el Synced_At de su fila, que es el timestamp que la app mandó en savePhoto
 * («dd/MM/yyyy HH:mm:ss»), o ese mismo valor convertido en fecha por Sheets (Date.toString()).
 * 1) texto idéntico; 2) mismo segundo. Sin coincidencia: url vacía (el PDF pone el aviso).
 */
export function resolverFoto(timestamp: string, punto: GpsPointExtended): string | undefined {
  const fotos = punto.photoLinks ?? [];
  const t = String(timestamp ?? '').trim();
  if (!t) return undefined;
  const exacta = fotos.find((p) => String(p.fecha ?? '').trim() === t);
  if (exacta) return exacta.url;
  const s = segundos(t);
  if (s === null) return undefined;
  return fotos.find((p) => p.fecha && segundos(String(p.fecha)) === s)?.url;
}

/** Link de la foto: el que manda el servidor (columna X); si no viene, se busca por la hora. */
const urlDeFoto = (x: { url?: string; timestamp?: string }, punto: GpsPointExtended) =>
  String(x?.url ?? '').trim() || resolverFoto(String(x?.timestamp ?? ''), punto);

/** Fotos de evidencia del formulario agrupadas por ítem, en el orden en que llegaron. */
function evidenciasDe(f: FormatoServidor, punto: GpsPointExtended): Evidencia[] {
  const out: Evidencia[] = [];
  for (const x of Array.isArray(f.fotos) ? f.fotos : []) {
    const rol = String(x?.rol ?? '').trim();
    let destino: { pregunta: string; texto: string; adicional?: boolean } | null = null;
    if (rol === ROL_EVIDENCIA_GENERAL) destino = { pregunta: '', texto: ROL_EVIDENCIA_GENERAL };
    else {
      const m = rol.match(ROL_EVIDENCIA);
      if (m) destino = preguntaPdf(f.tipo, m[1].trim());
    }
    // Foto adicional (etiquetada con un ítem del formulario): registro fotográfico adicional
    if (!destino && rol && !ROLES_CASILLA.has(rol) && rol !== 'Sin etiqueta')
      destino = { pregunta: `adicional:${rol}`, texto: rol, adicional: true };
    if (!destino) continue;
    let g = out.find((e) => e.pregunta === destino.pregunta);
    if (!g) out.push((g = { ...destino, fotos: [] }));
    const timestamp = String(x.timestamp ?? '').trim();
    g.fotos.push({ timestamp, url: urlDeFoto(x, punto), ...(destino.adicional ? { etiqueta: rol } : {}) });
  }
  return out;
}

const conformeDe = (v: boolean | string) => v === true || /^(SI|SÍ|TRUE)$/i.test(String(v).trim());

/** Un formulario por suministro y tipo: el último recibido (un reenvío reemplaza al anterior). */
export function ultimosFormatos(formatos: FormatoServidor[]): FormatoServidor[] {
  const tiempo = (f: FormatoServidor) => (parseFecha(f.recibido) ?? parseFecha(f.fecha))?.getTime() ?? 0;
  const ultimos = new Map<string, FormatoServidor>();
  for (const f of formatos) {
    const k = `${normSuministro(f.suministro)}|${f.tipo}`;
    const prev = ultimos.get(k);
    if (!prev || tiempo(f) >= tiempo(prev)) ultimos.set(k, f);
  }
  return [...ultimos.values()];
}

/**
 * Formularios del servidor + puntos de la jornada → supervisiones para los PDF 1A / 2A.
 * Por suministro y tipo queda el último recibido (un reenvío reemplaza al anterior).
 * Los formularios cuyo suministro no está en `puntos` se descartan. Trae el número fijo del
 * servidor si lo hay; para los demás, llamar a numerarJornada() con TODOS los de la jornada.
 */
export function aSupervisadas(
  formatos: FormatoServidor[],
  puntos: GpsPointExtended[],
  muestraDe?: (p: GpsPointExtended) => number,
): SupervisadaApp[] {
  const porCodigo = new Map<string, GpsPointExtended>();
  // N° de muestra por defecto: el N° de la hoja (col. A); si está vacío, el orden entre los
  // suministros con lectura, igual que la numeración del Formato 4 en Reportes
  const posicion = new Map<GpsPointExtended, number>();
  puntos.filter((p) => p.lectura != null && p.lectura !== '').forEach((p, k) => posicion.set(p, k + 1));
  for (const p of puntos) {
    const k = normSuministro(p.suministro);
    if (!porCodigo.has(k)) porCodigo.set(k, p);
  }
  const ultimos = ultimosFormatos(formatos);

  const out: SupervisadaApp[] = [];
  for (const f of ultimos) {
    const punto = porCodigo.get(normSuministro(f.suministro));
    if (!punto) continue;
    const fecha = parseFecha(f.fecha);
    const conforme = conformeDe(f.conforme);
    const resp: Record<string, Resp> = {};
    let usuario: Resp | '' = '';
    if (f.tipo === '1A') {
      for (const [k, v] of Object.entries(f.resp || {})) {
        const r = aResp(v);
        if (!r) continue;
        if (k === 'usuario_confirma') usuario = r;
        else resp[k] = r;
      }
    }
    const lectura = String(f.lectura ?? '').trim() || (punto.lectura != null ? String(punto.lectura) : '');
    // Fotos obligatorias del formato (las de evidencia no cuentan)
    const fotos = Array.isArray(f.fotos) ? f.fotos.filter((x) => !esEvidencia(x?.rol)).length : 0;
    out.push({
      punto,
      muestra: muestraDe?.(punto) || punto.numero || posicion.get(punto) || 0,
      tipo: f.tipo,
      fecha,
      fechaTxt: fmtFecha(fecha),
      horaTxt: fmtHora(fecha),
      tecnico: f.tecnico || '—',
      resp,
      resp2A: f.tipo === '2A' ? mapear2A(f.resp || {}, conforme) : {},
      usuario,
      avisado: !!String(f.avisado ?? '').trim(),
      avisadoEn: String(f.avisado ?? '').trim(),
      fechaSticker: String(f.fechaSticker ?? '').trim() || '—',
      lectura: lectura || '—',
      conforme,
      observacion: String(f.observacion ?? '').trim(),
      simulado: false,
      reporte: String(f.reporte ?? '').trim(),
      provisional: false,
      id: String(f.id ?? ''),
      servidor: f,
      editado: String(f.editado ?? '').trim(),
      fotosApp: (Array.isArray(f.fotos) ? f.fotos : []).map((x) => ({
        url: urlDeFoto(x, punto),
        rol: String(x?.rol ?? '').trim() || 'Sin etiqueta',
        timestamp: String(x?.timestamp ?? '').trim(),
      })),
      patron: String(f.patron ?? '').trim(),
      carga: String(f.carga ?? '').trim(),
      evidencias: evidenciasDe(f, punto),
      fotosFaltan: Math.max(0, 4 - fotos), // 1A: panorámica, medidor, caja y lectura · 2A: 4
      sinFormulario: false,
    });
  }
  return out;
}

/**
 * Números de reporte estables: los fijados por el servidor no se tocan. Los que faltan reciben un
 * número PROVISIONAL calculado sobre todos los formularios de la jornada (nunca sobre lo exportado),
 * a continuación del mayor número fijo de la jornada: 1A por fecha en bloques de 10, 2A uno por uno.
 * El número definitivo lo pone «Asignar números» (contadores globales del servidor).
 */
export function numerarJornada<T extends Supervisada & { provisional?: boolean }>(lista: T[]): T[] {
  const anio = new Date().getFullYear();
  const ord = (a: T, b: T) => (a.fecha?.getTime() ?? 0) - (b.fecha?.getTime() ?? 0);
  const mayor = (pre: string) =>
    Math.max(
      0,
      ...lista.map((s) => {
        const m = s.reporte.match(new RegExp(`^${pre}-\\d{4}-(\\d+)`));
        return m ? Number(m[1]) : 0;
      }),
    );
  const num = (pre: string, n: number) => `${pre}-${anio}-${String(n).padStart(3, '0')}`;
  const sp0 = mayor('SP');
  lista
    .filter((s) => s.tipo === '1A' && !s.reporte)
    .sort(ord)
    .forEach((s, k) => {
      s.reporte = num('SP', sp0 + Math.floor(k / 10) + 1);
      s.provisional = true;
    });
  const sc0 = mayor('SC');
  lista
    .filter((s) => s.tipo === '2A' && !s.reporte)
    .sort(ord)
    .forEach((s, k) => {
      s.reporte = num('SC', sc0 + k + 1);
      s.provisional = true;
    });
  return lista;
}

/** Texto del número para la pantalla. */
export const etiquetaReporte = (s: { reporte: string; provisional?: boolean }) =>
  s.provisional ? `${s.reporte} (provisional)` : s.reporte;

// Para revisar que el mapa cubre todo el 2A salvo la conformidad final (se deriva de `conforme`)
if (import.meta.env.DEV) {
  const sinMapa = ITEMS_2A.filter((i) => i.id !== ID_CONFORME_2A && !MAPA_2A.some((m) => m.pdf === i.id));
  if (sinMapa.length)
    console.warn(
      'MAPA_2A no cubre:',
      sinMapa.map((i) => i.texto),
    );
  if (!MAPA_2A.some((m) => m.pdf === ID_OTRAS && m.invertir)) console.warn('MAPA_2A: «otras» debe invertirse');
}
