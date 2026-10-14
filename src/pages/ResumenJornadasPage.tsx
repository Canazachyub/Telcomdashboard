import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarRange,
  RefreshCw,
  Users,
  Camera,
  CheckCircle,
  MapPin,
  Layers,
  Activity,
  ArrowRight,
  PieChart,
  Radar,
  ChevronDown,
} from 'lucide-react';
import { usePointsStore } from '../stores/pointsStore';
import { cargarJornadas, primeCache } from '../services/suministroHistory';
import {
  masRecientes,
  resumirJornada,
  resumirTecnicos,
  ultimosDias,
  coloresDe,
  fotosRecientes,
  type ResumenJornada,
} from '../utils/resumenJornadas';
import UltimasFotos from '../components/resumen/UltimasFotos';
import { AnillosJornadas, Leyenda, Participacion, PerfilTecnicos, RitmoDiario } from '../components/resumen/Graficos';
import { PageHeader, StatCard, SectionCard, EmptyState, ui } from '../components/ui';
import type { GpsPointExtended } from '../types/point';

const fmt = (n: number) => n.toLocaleString('es-PE');
const OPCIONES = [5, 6, 8, 10];
const DIAS = 14;

/** "hoy 16:37", "ayer 12:30" o "10 oct 17:22". */
function cuando(d: Date | null) {
  if (!d) return '—';
  const hora = d.toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const hoy = new Date();
  const ayer = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return `hoy ${hora}`;
  if (d.toDateString() === ayer.toDateString()) return `ayer ${hora}`;
  return `${d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })} ${hora}`;
}

function Barra({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
      <div
        className="h-2 rounded-full bg-gradient-to-r from-blue-600 to-electric transition-all duration-500"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function Inicial({ nombre, color }: { nombre: string; color: string | null }) {
  return (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
      style={{ background: color || '#475569' }}
    >
      {nombre.charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * Resumen de las últimas jornadas trabajadas: avance de cada una y quién las llenó.
 * «Últimas» = las que tienen las fotos más recientes. Solo lectura.
 */
export default function ResumenJornadasPage() {
  const { sheets, selectedSheet, pointsExtended, setSelectedSheet } = usePointsStore();
  const navigate = useNavigate();

  const [cuantas, setCuantas] = useState(6);
  const [datos, setDatos] = useState<Map<string, GpsPointExtended[]> | null>(null);
  const [progreso, setProgreso] = useState<{
    hechas: number;
    total: number;
  } | null>(null);
  const [error, setError] = useState('');
  const [detalle, setDetalle] = useState(false);
  const [extra, setExtra] = useState(0); // jornadas más antiguas que se agregan a la revisión

  // Candidatas: las jornadas creadas más recientemente (las nuevas van al final del libro)
  const candidatas = useMemo(() => {
    const n = Math.max(20, cuantas * 3) + extra;
    return sheets.slice(-n).map((s) => s.name);
  }, [sheets, cuantas, extra]);

  const cargar = useCallback(
    async (forzar = false) => {
      if (!candidatas.length) return;
      setError('');
      if (!forzar && selectedSheet && pointsExtended.length) primeCache(selectedSheet, pointsExtended);
      setProgreso({ hechas: 0, total: candidatas.length });
      try {
        const res = await cargarJornadas(candidatas, (hechas, total) => setProgreso({ hechas, total }), forzar);
        setDatos(res);
      } catch {
        setError('No se pudieron cargar las jornadas. Revisa la conexión e inténtalo otra vez.');
      } finally {
        setProgreso(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidatas],
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  const jornadas: ResumenJornada[] = useMemo(() => {
    if (!datos) return [];
    const todas = candidatas.filter((n) => datos.has(n)).map((n) => resumirJornada(n, datos.get(n)!));
    return masRecientes(todas, cuantas);
  }, [datos, candidatas, cuantas]);

  const tecnicos = useMemo(
    () =>
      datos
        ? resumirTecnicos(
            jornadas.map((j) => ({
              nombre: j.nombre,
              points: datos.get(j.nombre) || [],
            })),
          )
        : [],
    [datos, jornadas],
  );

  const totales = useMemo(
    () =>
      jornadas.reduce(
        (t, j) => ({
          total: t.total + j.total,
          completados: t.completados + j.completados,
          fotos: t.fotos + j.fotos,
          hoy: t.hoy + j.hoy,
        }),
        { total: 0, completados: 0, fotos: 0, hoy: 0 },
      ),
    [jornadas],
  );
  const pctTotal = totales.total ? ((totales.completados / totales.total) * 100).toFixed(1) : '0';
  const dias = ultimosDias(DIAS);
  const colores = useMemo(() => coloresDe(tecnicos), [tecnicos]);
  const recientes = useMemo(
    () =>
      datos
        ? fotosRecientes(
            jornadas.map((j) => ({ nombre: j.nombre, points: datos.get(j.nombre) || [] })),
            64,
          )
        : [],
    [datos, jornadas],
  );
  const maxDia = Math.max(1, ...tecnicos.flatMap((t) => dias.map((d) => t.porDia[d] || 0)));

  const abrir = (nombre: string) => {
    setSelectedSheet(nombre);
    navigate('/');
  };

  const cargando = progreso !== null;

  return (
    <div className="space-y-6">
      <PageHeader
        image="hero-torre.webp"
        kicker="Supervisión"
        title="Resumen de jornadas"
        subtitle={<span>Las jornadas con las fotos más recientes: cuánto avanzó cada una y quién la llenó.</span>}
        actions={
          <>
            <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1">
              {OPCIONES.map((n) => (
                <button
                  key={n}
                  onClick={() => setCuantas(n)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    cuantas === n ? 'bg-blue-600 text-white' : 'text-gray-600 hover:text-electric'
                  }`}
                  title={`Últimas ${n} jornadas`}
                >
                  {n}
                </button>
              ))}
            </div>
            <button onClick={() => cargar(true)} disabled={cargando} className={ui.btnPrimary}>
              <RefreshCw size={16} className={cargando ? 'animate-spin' : ''} />
              {cargando ? 'Cargando…' : 'Actualizar'}
            </button>
          </>
        }
      />

      {cargando && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="mb-2 text-sm text-gray-600">
            Revisando las jornadas recientes… <span className="font-mono">{progreso!.hechas}</span> de{' '}
            <span className="font-mono">{progreso!.total}</span>
          </p>
          <Barra value={(progreso!.hechas / Math.max(1, progreso!.total)) * 100} />
        </div>
      )}

      {error && <p className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {!cargando && datos && jornadas.length === 0 && (
        <EmptyState
          icon="reporte"
          title="Sin jornadas con fotos"
          description="Ninguna de las jornadas recientes tiene fotos todavía."
        />
      )}

      {jornadas.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatCard label="Jornadas" value={fmt(jornadas.length)} tone="cyan" icon={<Layers size={20} />} />
            <StatCard label="Suministros" value={fmt(totales.total)} tone="blue" icon={<MapPin size={20} />} />
            <StatCard
              label="Completados"
              value={fmt(totales.completados)}
              hint={`${pctTotal}% del total`}
              tone="green"
              icon={<CheckCircle size={20} />}
            />
            <StatCard
              label="Fotos"
              value={fmt(totales.fotos)}
              hint={totales.hoy ? `${fmt(totales.hoy)} suministros hoy` : 'Ninguno hoy'}
              tone="amber"
              icon={<Camera size={20} />}
            />
            <StatCard
              label="Técnicos"
              value={fmt(tecnicos.filter((t) => t.nombre !== 'Sin perfil ODT').length)}
              hint="Llenaron alguna jornada"
              tone="purple"
              icon={<Users size={20} />}
            />
          </div>

          <SectionCard
            title="Avance por jornada y quién la llenó"
            icon={<PieChart size={18} />}
            actions={<Leyenda tecnicos={tecnicos} colores={colores} />}
          >
            <AnillosJornadas jornadas={jornadas} colores={colores} onAbrir={abrir} />
          </SectionCard>

          <SectionCard
            title="Lo último que se hizo"
            icon={<Camera size={18} />}
            actions={<span className="text-xs text-gray-500">En todas estas jornadas, lo más reciente primero</span>}
          >
            <UltimasFotos fotos={recientes} colores={colores} mostrarJornada />
          </SectionCard>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <SectionCard
              title={`Ritmo diario · últimos ${DIAS} días`}
              icon={<Activity size={18} />}
              actions={<span className="text-xs text-gray-500">Suministros llenados por día</span>}
              className="xl:col-span-2"
            >
              <RitmoDiario dias={dias} tecnicos={tecnicos} colores={colores} />
            </SectionCard>
            <SectionCard title="Participación" icon={<PieChart size={18} />}>
              <Participacion tecnicos={tecnicos} colores={colores} />
            </SectionCard>
          </div>

          <SectionCard
            title="Perfil de cada técnico"
            icon={<Radar size={18} />}
            actions={<span className="text-xs text-gray-500">Pasa el mouse por el gráfico para ver los valores</span>}
          >
            <PerfilTecnicos tecnicos={tecnicos} dias={dias} colores={colores} />
          </SectionCard>

          <button
            onClick={() => setDetalle((v) => !v)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-gray-700 transition hover:border-electric hover:text-electric"
          >
            {detalle ? 'Ocultar el detalle en tablas' : 'Ver el detalle en tablas'}
            <ChevronDown size={16} className={`transition-transform ${detalle ? 'rotate-180' : ''}`} />
          </button>

          {detalle && (
            <>
              {/* Una tarjeta por jornada */}
              <SectionCard
                title="Jornadas"
                icon={<CalendarRange size={18} />}
                actions={<span className="text-xs text-gray-500">De la más reciente a la más antigua</span>}
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {jornadas.map((j) => (
                    <div key={j.nombre} className="flex flex-col rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="break-words text-sm font-semibold text-gray-900">{j.nombre}</h3>
                          <p className="mt-0.5 text-xs text-gray-500">
                            Última foto: <span className="text-gray-700">{cuando(j.ultimaFoto)}</span>
                            {j.hoy > 0 && <span className="ml-2 font-medium text-green-700">+{fmt(j.hoy)} hoy</span>}
                          </p>
                        </div>
                        <span className="font-mono text-lg font-semibold text-electric">{j.porcentaje}%</span>
                      </div>
                      <Barra value={j.porcentaje} />
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        {[
                          {
                            label: 'Completados',
                            v: j.completados,
                            c: 'text-green-700',
                          },
                          {
                            label: 'Pendientes',
                            v: j.pendientes,
                            c: 'text-red-700',
                          },
                          { label: 'Fotos', v: j.fotos, c: 'text-gray-900' },
                        ].map((x) => (
                          <div key={x.label} className="rounded-lg border border-gray-200 bg-white px-1 py-1.5">
                            <p className="text-[11px] text-gray-500">{x.label}</p>
                            <p className={`font-mono text-sm font-semibold ${x.c}`}>{fmt(x.v)}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex-1 space-y-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                          Quién la llenó
                        </p>
                        {j.tecnicos.length === 0 && <p className="text-xs text-gray-500">Nadie todavía</p>}
                        {j.tecnicos.map((t) => (
                          <div key={t.nombre} className="flex items-center gap-2 text-sm">
                            <Inicial nombre={t.nombre} color={t.color} />
                            <span className="min-w-0 flex-1 break-words text-gray-800">{t.nombre}</span>
                            <span className="font-mono text-gray-900">{fmt(t.puntos)}</span>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => abrir(j.nombre)}
                        className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:border-electric hover:text-electric"
                      >
                        Abrir en el Dashboard <ArrowRight size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </SectionCard>

              {candidatas.length < sheets.length && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm text-gray-600">
                  <span>
                    Se revisaron las <span className="font-mono">{candidatas.length}</span> jornadas más recientes de{' '}
                    <span className="font-mono">{sheets.length}</span>. Si falta alguna que se trabajó hace poco,
                    búscala más atrás.
                  </span>
                  <button onClick={() => setExtra((e) => e + 15)} disabled={cargando} className={ui.btnSecondary}>
                    Buscar en 15 jornadas más
                  </button>
                </div>
              )}

              {/* Técnico × jornada */}
              <SectionCard
                title="Quién llenó cada jornada"
                icon={<Users size={18} />}
                actions={<span className="text-xs text-gray-500">Suministros con foto</span>}
                bodyClassName="p-0"
              >
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px]">
                    <thead>
                      <tr className={ui.theadRow}>
                        <th className={ui.th}>Técnico</th>
                        {jornadas.map((j) => (
                          <th
                            key={j.nombre}
                            className={`${ui.th} max-w-[140px] whitespace-normal text-right normal-case`}
                            title={j.nombre}
                          >
                            {j.nombre.replace(/^P\d+-[A-Z]+-[A-Z]+-[A-Z]+-\s*/, '')}
                          </th>
                        ))}
                        <th className={`${ui.th} text-right`}>Total</th>
                        <th className={`${ui.th} text-right`}>Fotos</th>
                        <th className={ui.th}>Última foto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tecnicos.map((t) => (
                        <tr key={t.nombre} className={ui.tbodyRow}>
                          <td className={ui.td}>
                            <span className="flex items-center gap-2">
                              <Inicial nombre={t.nombre} color={t.color} />
                              <span className="font-medium text-gray-900">{t.nombre}</span>
                            </span>
                          </td>
                          {jornadas.map((j) => (
                            <td key={j.nombre} className={`${ui.td} text-right font-mono`}>
                              {t.porJornada[j.nombre] ? (
                                fmt(t.porJornada[j.nombre])
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                          ))}
                          <td className={`${ui.td} text-right font-mono font-semibold text-electric`}>
                            {fmt(t.puntos)}
                          </td>
                          <td className={`${ui.td} text-right font-mono`}>{fmt(t.fotos)}</td>
                          <td className={`${ui.td} whitespace-nowrap`}>{cuando(t.ultimaFoto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>

              {/* Actividad diaria */}
              <SectionCard
                title={`Actividad de los últimos ${DIAS} días`}
                icon={<Activity size={18} />}
                actions={<span className="text-xs text-gray-500">Suministros llenados por día, en estas jornadas</span>}
                bodyClassName="p-0"
              >
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px]">
                    <thead>
                      <tr className={ui.theadRow}>
                        <th className={ui.th}>Técnico</th>
                        {dias.map((d) => {
                          const [y, m, dd] = d.split('-').map(Number);
                          const f = new Date(y, m - 1, dd);
                          return (
                            <th key={d} className={`${ui.th} text-center normal-case`}>
                              {f.toLocaleDateString('es-PE', {
                                weekday: 'short',
                                day: 'numeric',
                              })}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {tecnicos.map((t) => (
                        <tr key={t.nombre} className={ui.tbodyRow}>
                          <td className={`${ui.td} font-medium text-gray-900`}>{t.nombre}</td>
                          {dias.map((d) => {
                            const v = t.porDia[d] || 0;
                            return (
                              <td key={d} className="px-2 py-2 text-center">
                                {v > 0 ? (
                                  <span
                                    className="inline-flex min-w-[2.5rem] justify-center rounded-md px-2 py-1 font-mono text-sm font-semibold text-white"
                                    style={{
                                      background: `rgb(37 99 235 / ${0.35 + 0.65 * (v / maxDia)})`,
                                    }}
                                  >
                                    {fmt(v)}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            </>
          )}
        </>
      )}
    </div>
  );
}
