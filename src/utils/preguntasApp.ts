// Preguntas del formulario 1A / 2A tal como las ve el técnico en la app (ids y textos de
// app-movil/lib/prototipo/supervision.dart, bloques1A / bloques2A) y las mismas reglas de la app
// para corregir desde el dashboard: conforme = ninguna en NO, observación automática «No cumple: …»
// y certificados «N° · dd/mm/aaaa». El servidor (editarFormato) valida los mismos ids.

export type RespApp = 'SI' | 'NO' | 'N.A.';

export interface PreguntaApp {
  id: string;
  texto: string;
  /** Admite N.A. (en la app solo «Usuario confirma…» del 1A). */
  conNA?: boolean;
  ayuda?: string;
}

export interface BloqueApp {
  titulo: string;
  preguntas: PreguntaApp[];
}

export const BLOQUES_1A: BloqueApp[] = [
  {
    titulo: 'Verificación posterior del contraste',
    preguntas: [
      { id: 'sticker_ubicado', texto: 'Sticker de contraste bien ubicado' },
      { id: 'sticker_llenado', texto: 'Sticker bien llenado, legible y sin borrones' },
      { id: 'sticker_plumon', texto: 'Sticker llenado con plumón indeleble' },
      { id: 'sticker_color', texto: 'Color del sticker del periodo' },
      { id: 'precinto_bornera', texto: 'Precinto de bornera instalado', ayuda: 'Cuando sea visible' },
      { id: 'precinto_caja', texto: 'Precinto de caja portamedidor', ayuda: 'En caso corresponda' },
      { id: 'caja_cerrada', texto: 'Caja cerrada y asegurada' },
      { id: 'fecha_concordante', texto: 'Fecha del sticker = fecha programada' },
      {
        id: 'usuario_confirma',
        texto: 'Usuario confirma aviso y copia del certificado',
        ayuda: 'N.A.: usuario ausente o no declara',
        conNA: true,
      },
    ],
  },
];

export const BLOQUES_2A: BloqueApp[] = [
  {
    titulo: 'Gestión de la actividad',
    preguntas: [
      { id: 'ot', texto: 'Cuenta con orden de trabajo' },
      { id: 'fecha_programada', texto: 'Intervención en la fecha programada' },
      { id: 'grupo', texto: 'Grupo completo (técnico inspector + apoyo)' },
      { id: 'senalizo', texto: 'Señalizó o demarcó la zona' },
      { id: 'registrado', texto: 'Personal registrado y autorizado ante ELSE' },
      { id: 'epp', texto: 'EPP y uniforme completos y en buen estado' },
      { id: 'fotocheck', texto: 'Fotocheck en buen estado' },
      { id: 'herramientas', texto: 'Herramientas completas y en buen estado' },
      { id: 'equipo_movil', texto: 'Equipo móvil operativo' },
      { id: 'patron_carga', texto: 'Patrón y carga en buen estado y calibración vigente' },
      { id: 'procedimiento', texto: 'Tiene su «Procedimiento técnico de contrastación»' },
      { id: 'vehiculo', texto: 'Unidad vehicular en buen estado' },
      { id: 'otras', texto: 'Sin otras observaciones', ayuda: 'NO = detallar en observaciones' },
    ],
  },
  {
    titulo: 'Procedimiento de trabajo',
    preguntas: [
      { id: 'pruebas', texto: 'Pruebas de vacío y de contraste correctas' },
      { id: 'aprueba', texto: 'Resultado de los ensayos: APRUEBA' },
      { id: 'equipos', texto: 'Uso correcto de equipos y herramientas' },
      { id: 'sticker', texto: 'Pegado y llenado correcto del sticker' },
      { id: 'plumon', texto: 'Uso de plumón indeleble' },
      { id: 'traslado', texto: 'Traslado correcto del patrón y la carga' },
      { id: 'informe', texto: 'Llenado correcto del informe de contrastación' },
    ],
  },
  {
    titulo: 'Certificados',
    preguntas: [
      { id: 'cert_patron', texto: 'Certificado de calibración vigente del patrón' },
      { id: 'cert_carga', texto: 'Certificado de calibración vigente de la carga' },
    ],
  },
  {
    titulo: 'Conformidad',
    preguntas: [
      { id: 'orden', texto: 'Orden y limpieza al terminar' },
      { id: 'cumple', texto: 'Cumplió el procedimiento de trabajo' },
    ],
  },
];

export const bloquesDe = (tipo: '1A' | '2A') => (tipo === '1A' ? BLOQUES_1A : BLOQUES_2A);
export const preguntasDe = (tipo: '1A' | '2A') => bloquesDe(tipo).flatMap((b) => b.preguntas);

/** «si» / «Sí» / «na» … → valor de la app, o undefined si está vacío o no se entiende. */
export function leerResp(v: unknown): RespApp | undefined {
  const t = String(v ?? '')
    .trim()
    .toUpperCase();
  if (t === 'SI' || t === 'SÍ') return 'SI';
  if (t === 'NO') return 'NO';
  if (t === 'N.A.' || t === 'NA' || t === 'N/A') return 'N.A.';
  return undefined;
}

// ---------------------------------------------------------------- Observación automática (como la app)

export const lineaNoCumple = (texto: string) => `Observación: ${texto}.`;
/** Redacción de las versiones anteriores de la app; se reconoce para no duplicar ni dejar líneas viejas. */
const lineaAntigua = (texto: string) => `No cumple: ${texto}.`;

/**
 * Deja una línea «Observación: …» por cada ítem en NO (en ese orden) sin tocar lo que escribió la
 * persona; quita solo las líneas automáticas intactas (nuevas o antiguas «No cumple: …») de ítems
 * que ya no están en NO. Si un ítem en NO ya tiene su línea antigua, no se agrega otra.
 */
export function sincronizarObservacion(actual: string, enNo: string[], todos: string[]): string {
  const deseadas = new Set(enNo.flatMap((t) => [lineaNoCumple(t), lineaAntigua(t)]));
  const automaticas = new Set(todos.flatMap((t) => [lineaNoCumple(t), lineaAntigua(t)]));
  const lineas = actual.split('\n').filter((l) => !(automaticas.has(l.trim()) && !deseadas.has(l.trim())));
  while (lineas.length && !lineas[lineas.length - 1].trim()) lineas.pop();
  const presentes = new Set(lineas.map((l) => l.trim()));
  for (const t of enNo) {
    if (!presentes.has(lineaNoCumple(t)) && !presentes.has(lineaAntigua(t))) lineas.push(lineaNoCumple(t));
  }
  return lineas.join('\n');
}

// ---------------------------------------------------------------- Fechas y certificados

/** dd/mm/aaaa válida → Date (sin hora); si no, null. */
export function leerFechaDma(t: string): Date | null {
  const m = t.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return d.getDate() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 ? d : null;
}

/** Mientras se escribe: solo dígitos y las barras se ponen solas (15032026 → 15/03/2026). */
export function formatearFechaDma(t: string): string {
  const d = t.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** Error de una fecha opcional (null si está bien): dd/mm/aaaa y no posterior a hoy. */
export function errorFecha(t: string, que: string, hoy = new Date()): string | null {
  if (!t.trim()) return null;
  const d = leerFechaDma(t);
  if (!d) return `${que}: debe ser dd/mm/aaaa`;
  if (d > new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())) return `${que}: no puede ser posterior a hoy`;
  return null;
}

const SEP_CERT = ' · ';

/** «LE-C-066-2026 · 23/02/2026» → número y fecha (también «… 23/02/2026» o «… - 23/02/2026»). */
export function separarCertificado(texto: string): { numero: string; fecha: string } {
  const t = String(texto ?? '').trim();
  const m = t.match(/^(.*?)[\s·,;\-–]*(\d{2}\/\d{2}\/\d{4})$/);
  if (m && leerFechaDma(m[2])) return { numero: m[1].trim(), fecha: m[2] };
  return { numero: t, fecha: '' };
}

export function unirCertificado(numero: string, fecha: string): string {
  const n = numero.trim(),
    f = fecha.trim();
  if (!f) return n;
  if (!n) return f;
  return `${n}${SEP_CERT}${f}`;
}
