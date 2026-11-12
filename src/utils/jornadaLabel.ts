// Nombre corto y amigable de una jornada a partir del nombre técnico de la hoja.
// «P227-SEM19-ABA-AND-CUS-VILC-ANT- URU-NOV-S2 2026» → «Semana 19 · P-227».
// Si el nombre no se entiende, se devuelve tal cual (sin espacios de más).

const MESES: [RegExp, string][] = [
  [/^ENE/, 'Enero'],
  [/^FEB/, 'Febrero'],
  [/^MAR/, 'Marzo'],
  [/^ABR/, 'Abril'],
  [/^MAY/, 'Mayo'],
  [/^JUN/, 'Junio'],
  [/^JUL/, 'Julio'],
  [/^AGO/, 'Agosto'],
  [/^SE[TP]/, 'Setiembre'],
  [/^OCT/, 'Octubre'],
  [/^NOV/, 'Noviembre'],
  [/^DIC/, 'Diciembre'],
];

const MES_RE =
  /(?:(?<![A-Z0-9])(\d{1,2})\s*)?(?<![A-Z])(ENERO|ENE|FEBRERO|FEB|MARZO|MAR|ABRIL|ABR|MAYO|MAY|JUNIO|JUN|JULIO|JUL|AGOSTO|AGO|SETIEMBRE|SEPTIEMBRE|SET|SEP|OCTUBRE|OCT|NOVIEMBRE|NOV|DICIEMBRE|DIC)(?![A-Z])/;

// Semana: «SEM19», «SEMANA 19», «sem 18», «SEM18_1», rangos «SEM 08-11» o listas «SEM1,4»
const SEMANA_RE = /(?<![A-Z])SEM(?:ANA)?\s*_?0*(\d{1,2})(?:\s*([-,])\s*0*(\d{1,2})(?!\d))?(?:_(\d))?/;

function programa(n: string): string {
  if (/(?<![A-Z0-9])P\s*-?\s*227(?!\d)/.test(n)) return 'P-227';
  if (/NTCSE\s*R\s*U/.test(n)) return 'NTCSERU';
  if (/NTCSE\s*U/.test(n)) return 'NTCSEU';
  if (/NTCSER/.test(n)) return 'NTCSER';
  if (/OSINER/.test(n)) return 'Osinergmin';
  return '';
}

/** Etiqueta corta de la jornada (o el nombre tal cual si no se reconoce). */
export function etiquetaJornada(nombre: string): string {
  const crudo = nombre.replace(/\s+/g, ' ').trim();
  const n = crudo.toUpperCase();
  const alterno = /(?<![A-Z])AL(?:TER|TEN|ERN|TE(?![A-Z]))/.test(n);
  const prog = programa(n);

  let base = '';
  const s = SEMANA_RE.exec(n);
  if (s) {
    const [, a, sep, b, parte] = s;
    if (b) base = `Semanas ${Number(a)}${sep === '-' ? '–' : ', '}${Number(b)}`;
    else base = `Semana ${Number(a)}${parte ? ` (${parte})` : ''}`;
  } else {
    const m = MES_RE.exec(n);
    if (m) {
      const mes = MESES.find(([re]) => re.test(m[2]))?.[1] ?? m[2];
      base = m[1] ? `${Number(m[1])} ${mes.toLowerCase()}` : mes;
    }
  }
  if (!base) return crudo;

  const partes = [alterno ? `Alternos ${base.toLowerCase()}` : base];
  if (prog) partes.push(prog);
  return partes.join(' · ');
}

/** Texto normalizado para buscar: minúsculas, sin tildes ni signos («SEM-19» ≈ «sem19»). */
export function normBusqueda(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
