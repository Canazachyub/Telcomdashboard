// Gráficos del Resumen de jornadas (SVG a mano, sin librerías).
import { useState, type ReactNode } from 'react';
import { ritmo, type ResumenJornada, type ResumenTecnico } from '../../utils/resumenJornadas';

const fmt = (n: number) => n.toLocaleString('es-PE');
const corto = (n: string) => n.replace(/^P\d+-[A-Z]+-[A-Z-]+?-\s*(?=SEM)/, '').trim() || n;
const fechaDe = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Leyenda de técnicos con su color. */
export function Leyenda({ tecnicos, colores }: { tecnicos: { nombre: string }[]; colores: Record<string, string> }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-600">
      {tecnicos.map((t) => (
        <span key={t.nombre} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: colores[t.nombre] }} />
          {t.nombre}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Anillo (dona) con varios tramos                                     */
/* ------------------------------------------------------------------ */
interface Tramo {
  valor: number;
  color: string;
  etiqueta: string;
}

export function Anillo({
  tramos,
  total,
  size = 132,
  grosor = 12,
  children,
  activo = null,
  onActivo,
}: {
  tramos: Tramo[];
  total: number;
  size?: number;
  grosor?: number;
  children?: ReactNode;
  /** Tramo resaltado (los demás se atenúan) */
  activo?: string | null;
  onActivo?: (etiqueta: string | null) => void;
}) {
  const r = (size - grosor) / 2;
  const C = 2 * Math.PI * r;
  const largos = tramos.map((t) => (t.valor / Math.max(1, total)) * C);
  const inicios = largos.map((_, i) => largos.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={grosor}
          stroke="currentColor"
          className="text-gray-200"
        />
        {tramos.map((t, i) => (
          <circle
            key={t.etiqueta}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={t.color}
            strokeWidth={grosor}
            strokeDasharray={`${Math.max(0.5, largos[i] - 1.5)} ${C}`}
            strokeDashoffset={-inicios[i]}
            opacity={activo && activo !== t.etiqueta ? 0.25 : 1}
            className={`transition-all duration-300 ${onActivo ? 'cursor-pointer' : ''}`}
            onMouseEnter={onActivo ? () => onActivo(t.etiqueta) : undefined}
            onMouseLeave={onActivo ? () => onActivo(null) : undefined}
          >
            <title>{`${t.etiqueta}: ${fmt(t.valor)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

/**
 * Proyección: días de trabajo que faltan si se sigue al ritmo de esta semana (solo
 * cuentan los días con avance de los últimos 7). Al pasar el cursor muestra el cálculo.
 */
export function Proyeccion({
  porDia,
  pendientes,
  className = '',
}: {
  porDia: Record<string, number>;
  pendientes: number;
  className?: string;
}) {
  const r = ritmo(porDia, pendientes);
  if (pendientes === 0) return <p className={`text-xs text-green-700 ${className}`}>Terminada</p>;
  if (!r) return <p className={`text-xs text-red-700 ${className}`}>Sin avance esta semana · parada</p>;
  const poca = r.diasTrabajados <= 2;
  const calculo =
    `Últimos 7 días: se trabajó ${r.diasTrabajados} ${r.diasTrabajados === 1 ? 'día' : 'días'}, ` +
    `${r.porDia.toFixed(1)} suministros por día trabajado.
` +
    `${fmt(pendientes)} pendientes ÷ ${r.porDia.toFixed(1)} = ${fmt(r.faltan)} días de trabajo.
` +
    'Son días trabajados, no días de calendario.';
  return (
    <p
      className={`cursor-help text-xs ${r.faltan > 60 ? 'text-amber-700' : 'text-gray-500'} ${className}`}
      title={calculo}
    >
      Al ritmo de esta semana: ~<span className="font-mono font-semibold">{fmt(r.faltan)}</span> días de trabajo
      {poca && (
        <span className="block text-[11px] text-gray-500">
          Poca actividad esta semana ({r.diasTrabajados} {r.diasTrabajados === 1 ? 'día' : 'días'})
        </span>
      )}
    </p>
  );
}

/** Un anillo por jornada: cada color es lo que llenó un técnico; el resto, pendiente. */
export function AnillosJornadas({
  jornadas,
  colores,
  onAbrir,
}: {
  jornadas: ResumenJornada[];
  colores: Record<string, string>;
  onAbrir: (nombre: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {jornadas.map((j) => {
        return (
          <button
            key={j.nombre}
            onClick={() => onAbrir(j.nombre)}
            title="Abrir esta jornada en el Dashboard"
            className="group flex items-center gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-left transition hover:border-electric/60"
          >
            <Anillo
              total={j.total}
              tramos={j.tecnicos.map((t) => ({ valor: t.puntos, color: colores[t.nombre], etiqueta: t.nombre }))}
            >
              <span className="font-mono text-2xl font-semibold leading-none text-gray-900">{j.porcentaje}%</span>
              <span className="mt-1 text-[11px] text-gray-500">
                {fmt(j.total - j.pendientes)} de {fmt(j.total)}
              </span>
            </Anillo>
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-semibold text-gray-900 group-hover:text-electric">{j.nombre}</p>
              <div className="mt-2 space-y-1">
                {j.tecnicos.slice(0, 3).map((t) => (
                  <p key={t.nombre} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colores[t.nombre] }} />
                    <span className="min-w-0 flex-1 break-words">{t.nombre}</span>
                    <span className="font-mono text-gray-900">{fmt(t.puntos)}</span>
                  </p>
                ))}
              </div>
              <Proyeccion porDia={j.porDia} pendientes={j.pendientes} className="mt-2" />
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ritmo diario: área del total + una curva por técnico                */
/* ------------------------------------------------------------------ */

/**
 * Curva suave que pasa por los puntos sin pasarse de ellos (monótona, Fritsch–Carlson):
 * nunca dibuja un pico más alto que el día real ni baja de cero.
 */
function curva(pts: [number, number][]) {
  const n = pts.length;
  if (n < 2) return '';
  const dx = pts.slice(1).map((p, i) => p[0] - pts[i][0]);
  const m = pts.slice(1).map((p, i) => (p[1] - pts[i][1]) / dx[i]);
  const t = pts.map((_, i) => {
    if (i === 0) return m[0];
    if (i === n - 1) return m[n - 2];
    return m[i - 1] * m[i] <= 0 ? 0 : (2 * m[i - 1] * m[i]) / (m[i - 1] + m[i]);
  });
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i][0] + h},${pts[i][1] + t[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - t[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}

function Dato({ label, valor, sub, tono }: { label: string; valor: string; sub?: string; tono: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className={`font-mono text-xl font-semibold leading-tight ${tono}`}>{valor}</p>
      {sub && <p className="text-[11px] text-gray-500">{sub}</p>}
    </div>
  );
}

type Capa = 'area' | 'barras' | 'tecnicos';
const CAPAS: { id: Capa; label: string }[] = [
  { id: 'area', label: 'Área' },
  { id: 'barras', label: 'Barras' },
  { id: 'tecnicos', label: 'Líneas por técnico' },
];

function alternar<T>(set: Set<T>, v: T) {
  const s = new Set(set);
  if (s.has(v)) s.delete(v);
  else s.add(v);
  return s;
}

/**
 * Ritmo diario interactivo: al pasar el cursor por un día muestra el detalle; se
 * pueden prender o apagar el área, las barras y las líneas por técnico, y ocultar
 * técnicos tocando la leyenda (los totales se recalculan sin ellos).
 */
export function RitmoDiario({
  dias,
  tecnicos,
  colores,
}: {
  dias: string[];
  tecnicos: ResumenTecnico[];
  colores: Record<string, string>;
}) {
  const [capas, setCapas] = useState<Set<Capa>>(() => new Set<Capa>(['area', 'tecnicos']));
  const [ocultos, setOcultos] = useState<Set<string>>(() => new Set());
  const [hover, setHover] = useState<number | null>(null);

  const W = 900;
  const H = 250;
  const pl = 16;
  const pr = 16;
  const pt = 24;
  const pb = 26;
  const visibles = tecnicos.filter((t) => !ocultos.has(t.nombre));
  const totales = dias.map((d) => visibles.reduce((n, t) => n + (t.porDia[d] || 0), 0));
  const max = Math.max(1, ...totales);
  const trabajados = totales.filter((v) => v > 0);
  const promedio = trabajados.length ? trabajados.reduce((a, b) => a + b, 0) / trabajados.length : 0;
  const iMejor = totales.indexOf(Math.max(...totales));
  const paso = (W - pl - pr) / Math.max(1, dias.length - 1);
  const x = (i: number) => pl + i * paso;
  const y = (v: number) => H - pb - (v / max) * (H - pt - pb);
  const base = H - pb;
  const lineaTotal = curva(totales.map((v, i) => [x(i), y(v)]));
  const area = `${lineaTotal} L${x(dias.length - 1)},${base} L${x(0)},${base} Z`;
  const hoy = totales[totales.length - 1];
  const diaLargo = (k: string) =>
    fechaDe(k).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
  const anchoBarra = Math.min(34, paso * 0.55);

  // Barras apiladas: [técnico, desde, hasta] por día
  const pilas = dias.map((d) => {
    let acum = 0;
    return visibles
      .filter((t) => t.porDia[d])
      .map((t) => {
        const desde = acum;
        acum += t.porDia[d];
        return { nombre: t.nombre, desde, hasta: acum };
      });
  });

  return (
    <div>
      <div className="mb-3 grid grid-cols-3 gap-3">
        <Dato
          label="Mejor día"
          valor={fmt(totales[iMejor] || 0)}
          sub={
            totales[iMejor]
              ? fechaDe(dias[iMejor]).toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric' })
              : '—'
          }
          tono="text-green-700"
        />
        <Dato
          label="Promedio"
          valor={promedio.toFixed(0)}
          sub={`por día trabajado (${trabajados.length} de ${dias.length})`}
          tono="text-amber-700"
        />
        <Dato
          label="Hoy"
          valor={fmt(hoy)}
          sub={hoy > 0 && hoy >= promedio ? 'sobre el promedio' : 'bajo el promedio'}
          tono="text-electric"
        />
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-gray-500">Mostrar:</span>
        {CAPAS.map((c) => (
          <button
            key={c.id}
            onClick={() => setCapas((s) => alternar(s, c.id))}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
              capas.has(c.id)
                ? 'border-electric/60 bg-electric/10 text-electric'
                : 'border-gray-200 text-gray-500 hover:text-gray-800'
            }`}
            aria-pressed={capas.has(c.id)}
          >
            {capas.has(c.id) ? '✓ ' : '+ '}
            {c.label}
          </button>
        ))}
      </div>

      <div className="relative" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full select-none">
          <defs>
            <linearGradient id="ritmo-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#00d4ff" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <line
              key={f}
              x1={pl}
              x2={W - pr}
              y1={y(max * f)}
              y2={y(max * f)}
              stroke="currentColor"
              className="text-gray-200"
            />
          ))}
          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={pt - 10} y2={base} stroke="#00d4ff" strokeOpacity={0.4} />
          )}

          {capas.has('barras') &&
            pilas.map((pila, i) => (
              <g key={dias[i]} opacity={hover === null || hover === i ? 1 : 0.45}>
                {pila.map((b) => (
                  <rect
                    key={b.nombre}
                    x={x(i) - anchoBarra / 2}
                    y={y(b.hasta)}
                    width={anchoBarra}
                    height={y(b.desde) - y(b.hasta)}
                    rx={3}
                    fill={colores[b.nombre]}
                    fillOpacity={0.85}
                  />
                ))}
              </g>
            ))}

          {capas.has('area') && <path d={area} fill="url(#ritmo-area)" />}
          {capas.has('tecnicos') &&
            visibles.map((t) => (
              <path
                key={t.nombre}
                d={curva(dias.map((d, i) => [x(i), y(t.porDia[d] || 0)]))}
                fill="none"
                stroke={colores[t.nombre]}
                strokeWidth={1.8}
                strokeDasharray="5 4"
              />
            ))}
          {capas.has('area') && <path d={lineaTotal} fill="none" stroke="#00d4ff" strokeWidth={2.5} />}

          {promedio > 0 && (
            <g>
              <line
                x1={pl}
                x2={W - pr}
                y1={y(promedio)}
                y2={y(promedio)}
                stroke="#f59e0b"
                strokeDasharray="2 4"
                strokeWidth={1.5}
              />
              <text x={pl + 2} y={y(promedio) - 5} fontSize={11} fill="#f59e0b">
                promedio {promedio.toFixed(0)}
              </text>
            </g>
          )}

          {totales.map((v, i) => (
            <g key={dias[i]}>
              {v > 0 && (
                <>
                  <circle
                    cx={x(i)}
                    cy={y(v)}
                    r={hover === i ? 6.5 : 4}
                    fill="#00d4ff"
                    stroke="#0b1220"
                    strokeWidth={1.5}
                  />
                  <text
                    x={x(i)}
                    y={y(v) - 10}
                    fontSize={hover === i ? 13 : 11}
                    fontWeight={hover === i ? 700 : 400}
                    textAnchor="middle"
                    fill="currentColor"
                    className="text-gray-700"
                  >
                    {v}
                  </text>
                </>
              )}
              {capas.has('tecnicos') &&
                hover === i &&
                visibles.map((t) =>
                  t.porDia[dias[i]] ? (
                    <circle
                      key={t.nombre}
                      cx={x(i)}
                      cy={y(t.porDia[dias[i]])}
                      r={4}
                      fill={colores[t.nombre]}
                      stroke="#0b1220"
                      strokeWidth={1.5}
                    />
                  ) : null,
                )}
              <text
                x={x(i)}
                y={H - 8}
                fontSize={10.5}
                textAnchor="middle"
                fill="currentColor"
                className={hover === i || i === dias.length - 1 ? 'text-electric' : 'text-gray-500'}
              >
                {i === dias.length - 1
                  ? 'hoy'
                  : fechaDe(dias[i]).toLocaleDateString('es-PE', { weekday: 'narrow', day: 'numeric' })}
              </text>
              {/* Zona sensible al cursor: todo el alto del día */}
              <rect
                x={x(i) - paso / 2}
                y={0}
                width={paso}
                height={H}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onClick={() => setHover(i)}
              />
            </g>
          ))}
        </svg>

        {hover !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 w-56 rounded-xl border border-electric/40 bg-white p-3 text-xs shadow-xl"
            style={
              x(hover) / W > 0.6
                ? { right: `${100 - (x(hover) / W) * 100 + 2}%` }
                : { left: `${(x(hover) / W) * 100 + 2}%` }
            }
          >
            <p className="font-semibold capitalize text-gray-900">{diaLargo(dias[hover])}</p>
            <p className="mt-1 flex items-baseline justify-between">
              <span className="text-gray-500">Total del equipo</span>
              <span className="font-mono text-base font-semibold text-electric">{fmt(totales[hover])}</span>
            </p>
            {totales[hover] > 0 && promedio > 0 && (
              <p className={totales[hover] >= promedio ? 'text-green-700' : 'text-amber-700'}>
                {totales[hover] >= promedio ? '▲' : '▼'} {Math.abs(totales[hover] - promedio).toFixed(0)}{' '}
                {totales[hover] >= promedio ? 'sobre' : 'bajo'} el promedio
              </p>
            )}
            <div className="mt-2 space-y-1 border-t border-gray-200 pt-2">
              {totales[hover] === 0 ? (
                <p className="text-gray-500">Nadie trabajó este día</p>
              ) : (
                visibles.map((t) => {
                  const v = t.porDia[dias[hover]] || 0;
                  return (
                    <p key={t.nombre} className={`flex items-center gap-2 ${v ? '' : 'opacity-50'}`}>
                      <span className="h-2 w-2 rounded-full" style={{ background: colores[t.nombre] }} />
                      <span className="flex-1 text-gray-700">{t.nombre}</span>
                      <span className="font-mono text-gray-900">{v || '—'}</span>
                    </p>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="text-gray-500">Técnicos (toca para ocultar):</span>
        {tecnicos.map((t) => {
          const off = ocultos.has(t.nombre);
          return (
            <button
              key={t.nombre}
              onClick={() => setOcultos((s) => alternar(s, t.nombre))}
              className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 transition ${
                off
                  ? 'border-gray-200 text-gray-400 line-through'
                  : 'border-gray-300 text-gray-700 hover:border-electric'
              }`}
              aria-pressed={!off}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: off ? '#475569' : colores[t.nombre] }} />
              {t.nombre}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Participación: dona con el % de cada técnico                        */
/* ------------------------------------------------------------------ */
export function Participacion({ tecnicos, colores }: { tecnicos: ResumenTecnico[]; colores: Record<string, string> }) {
  const [activo, setActivo] = useState<string | null>(null);
  const total = tecnicos.reduce((n, t) => n + t.puntos, 0);
  const sel = tecnicos.find((t) => t.nombre === activo);
  return (
    <div className="flex flex-col items-center gap-4">
      <Anillo
        size={180}
        grosor={26}
        total={total}
        activo={activo}
        onActivo={setActivo}
        tramos={tecnicos.map((t) => ({ valor: t.puntos, color: colores[t.nombre], etiqueta: t.nombre }))}
      >
        {sel ? (
          <>
            <span className="font-mono text-3xl font-semibold leading-none" style={{ color: colores[sel.nombre] }}>
              {total ? ((sel.puntos / total) * 100).toFixed(0) : 0}%
            </span>
            <span className="mt-1 max-w-[110px] break-words text-xs font-semibold text-gray-900">{sel.nombre}</span>
            <span className="text-[11px] text-gray-500">
              {fmt(sel.puntos)} sum. · {fmt(sel.fotos)} fotos
            </span>
          </>
        ) : (
          <>
            <span className="font-mono text-3xl font-semibold leading-none text-gray-900">{fmt(total)}</span>
            <span className="mt-1 text-[11px] text-gray-500">suministros</span>
          </>
        )}
      </Anillo>
      <div className="w-full space-y-1">
        {tecnicos.map((t) => (
          <div
            key={t.nombre}
            onMouseEnter={() => setActivo(t.nombre)}
            onMouseLeave={() => setActivo(null)}
            className={`flex cursor-default items-center gap-2 rounded-lg px-2 py-1 text-sm transition ${
              activo === t.nombre ? 'bg-gray-100' : activo ? 'opacity-50' : ''
            }`}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colores[t.nombre] }} />
            <span className="min-w-0 flex-1 break-words text-gray-800">{t.nombre}</span>
            <span className="font-mono text-gray-500">{fmt(t.puntos)}</span>
            <span className="w-12 text-right font-mono font-semibold text-gray-900">
              {total ? ((t.puntos / total) * 100).toFixed(0) : 0}%
            </span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-500">Pasa el cursor por el anillo o por un nombre</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Radar: perfil de cada técnico                                       */
/* ------------------------------------------------------------------ */
interface Eje {
  label: string;
  valor: (t: ResumenTecnico) => number;
  texto: (v: number) => string;
}

export function PerfilTecnicos({
  tecnicos,
  dias,
  colores,
}: {
  tecnicos: ResumenTecnico[];
  dias: string[];
  colores: Record<string, string>;
}) {
  const activos = (t: ResumenTecnico) => dias.filter((d) => t.porDia[d]).length;
  const enVentana = (t: ResumenTecnico) => dias.reduce((n, d) => n + (t.porDia[d] || 0), 0);
  const ejes: Eje[] = [
    { label: 'Volumen', valor: (t) => t.puntos, texto: (v) => `${fmt(v)} suministros` },
    { label: 'Constancia', valor: activos, texto: (v) => `${v} de ${dias.length} días` },
    {
      label: 'Ritmo',
      valor: (t) => (activos(t) ? enVentana(t) / activos(t) : 0),
      texto: (v) => `${v.toFixed(0)} por día`,
    },
    { label: 'Jornadas', valor: (t) => Object.keys(t.porJornada).length, texto: (v) => `${v} jornadas` },
    {
      label: 'Fotos',
      valor: (t) => (t.puntos ? t.fotos / t.puntos : 0),
      texto: (v) => `${v.toFixed(1)} fotos por suministro`,
    },
  ];
  const maximos = ejes.map((e) => Math.max(1e-9, ...tecnicos.map(e.valor)));
  const S = 320;
  const c = S / 2;
  const R = 105;
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / ejes.length;
  const punto = (i: number, f: number): [number, number] => [
    c + Math.cos(ang(i)) * R * f,
    c + Math.sin(ang(i)) * R * f,
  ];
  const poligono = (f: (i: number) => number) => ejes.map((_, i) => punto(i, f(i)).join(',')).join(' ');
  const [activo, setActivo] = useState<string | null>(null);
  // El resaltado se dibuja al final para quedar encima
  const orden = activo
    ? [...tecnicos.filter((t) => t.nombre !== activo), ...tecnicos.filter((t) => t.nombre === activo)]
    : tecnicos;

  return (
    <div className="flex flex-col items-center gap-4 lg:flex-row lg:items-start">
      <svg viewBox={`-50 0 ${S + 100} ${S}`} className="h-auto w-full max-w-[380px] shrink-0">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <polygon key={f} points={poligono(() => f)} fill="none" stroke="currentColor" className="text-gray-200" />
        ))}
        {ejes.map((e, i) => {
          const [ex, ey] = punto(i, 1);
          const [lx, ly] = punto(i, 1.16);
          return (
            <g key={e.label}>
              <line x1={c} y1={c} x2={ex} y2={ey} stroke="currentColor" className="text-gray-200" />
              <text
                x={lx}
                y={ly + 4}
                fontSize={12}
                textAnchor={Math.abs(lx - c) < 8 ? 'middle' : lx > c ? 'start' : 'end'}
                fill="currentColor"
                className="text-gray-600"
              >
                {e.label}
              </text>
            </g>
          );
        })}
        {orden.map((t) => (
          <polygon
            key={t.nombre}
            onMouseEnter={() => setActivo(t.nombre)}
            onMouseLeave={() => setActivo(null)}
            opacity={activo && activo !== t.nombre ? 0.2 : 1}
            className="cursor-pointer transition-opacity duration-200"
            points={poligono((i) => Math.max(0.04, ejes[i].valor(t) / maximos[i]))}
            fill={colores[t.nombre]}
            fillOpacity={activo === t.nombre ? 0.35 : 0.14}
            stroke={colores[t.nombre]}
            strokeWidth={2}
            strokeLinejoin="round"
          >
            <title>{[t.nombre, ...ejes.map((e) => `${e.label}: ${e.texto(e.valor(t))}`)].join('\n')}</title>
          </polygon>
        ))}
      </svg>
      <div className="w-full min-w-0 flex-1 space-y-3">
        {tecnicos.map((t) => (
          <div
            key={t.nombre}
            onMouseEnter={() => setActivo(t.nombre)}
            onMouseLeave={() => setActivo(null)}
            className={`rounded-xl border bg-gray-50 p-3 transition ${
              activo === t.nombre ? 'border-electric/60' : activo ? 'border-gray-200 opacity-50' : 'border-gray-200'
            }`}
          >
            <p className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-gray-900">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: colores[t.nombre] }} />
              {t.nombre}
            </p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-gray-600 sm:grid-cols-3">
              {ejes.map((e) => (
                <span key={e.label}>
                  {e.label}: <span className="font-mono text-gray-900">{e.texto(e.valor(t))}</span>
                </span>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-gray-500">
              {Object.entries(t.porJornada)
                .map(([j, n]) => `${corto(j)} ${fmt(n)}`)
                .join(' · ')}
            </p>
          </div>
        ))}
        <p className="text-[11px] text-gray-500">
          Cada eje se compara con el mejor del equipo: más afuera es mejor. Constancia y ritmo cuentan los últimos{' '}
          {dias.length} días.
        </p>
      </div>
    </div>
  );
}
