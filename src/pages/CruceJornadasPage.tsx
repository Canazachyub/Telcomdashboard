import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Layers, Search, Download, ClipboardList, CheckSquare, Square, RefreshCw, X, Camera, Zap } from 'lucide-react';
import { usePointsStore } from '../stores/pointsStore';
import { useSuministroDrawer } from '../stores/suministroDrawerStore';
import {
  buscarEnJornadas,
  cargarJornadas,
  jornadasEnCache,
  normSuministro,
  ocurrenciaDe,
  primeCache,
  type Ocurrencia,
} from '../services/suministroHistory';
import { PageHeader, StatCard, SectionCard, EmptyState, Badge, STATUS_UI, ui, type Tone } from '../components/ui';
import { sourceRow, autoCols } from '../utils/sourceColumns';
import PhotoGalleryModal from '../components/PhotoGalleryModal';
import type { PhotoLink } from '../types/point';
import { parseFecha } from '../components/map/dailyProgress';

type Categoria = 'falta' | 'ya_hecho' | 'en_proceso' | 'completado';

const CATEGORIA: Record<Categoria, { label: string; tone: Tone; hint: string }> = {
  falta: { label: 'Falta hacer', tone: 'red', hint: 'No tiene fotos en ninguna jornada' },
  ya_hecho: { label: 'Ya hecho en otra', tone: 'amber', hint: 'Pendiente en una jornada, pero completado en otra' },
  en_proceso: { label: 'En proceso', tone: 'yellow', hint: 'Tiene fotos pero aún no se completa' },
  completado: { label: 'Completado', tone: 'green', hint: 'Completado y sin pendientes en otras jornadas' },
};

interface Fila {
  suministro: string;
  ocurrencias: Ocurrencia[]; // ordenadas: más reciente primero
  categoria: Categoria;
  repetido: boolean;
}

type Filtro = 'todos' | Categoria | 'repetidos';

const PAGE = 50;
const fmtN = (n: number) => n.toLocaleString('es-PE');
const fmtF = (d: Date | null) =>
  d ? d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

function clasificar(oc: Ocurrencia[]): Categoria {
  const completado = oc.some((o) => o.estado === 'completado');
  const pendiente = oc.some((o) => o.estado === 'pendiente');
  if (completado && pendiente) return 'ya_hecho';
  if (completado) return 'completado';
  if (oc.some((o) => o.estado === 'en_proceso')) return 'en_proceso';
  return 'falta';
}

/**
 * Cruce de jornadas: junta los suministros de varias jornadas para ver cuáles se
 * repiten, cuáles ya se hicieron en otra hoja y cuáles faltan de verdad, y exporta
 * a Excel solo lo filtrado. Todo es de solo lectura.
 */
export default function CruceJornadasPage() {
  const { sheets, selectedSheet, pointsExtended } = usePointsStore();
  const openFicha = useSuministroDrawer((s) => s.open);

  const [busquedaJornada, setBusquedaJornada] = useState('');
  const [elegidas, setElegidas] = useState<Set<string>>(() => new Set());
  const [datos, setDatos] = useState<Map<string, ReturnType<typeof ocurrenciaDe>[]> | null>(null);
  const [cargadas, setCargadas] = useState<string[]>([]);
  const [progreso, setProgreso] = useState<{ hechas: number; total: number } | null>(null);

  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [texto, setTexto] = useState('');
  const [lista, setLista] = useState('');
  const [mostrarLista, setMostrarLista] = useState(false);
  const [soloJornadaActual, setSoloJornadaActual] = useState(false);
  const [page, setPage] = useState(1);
  const [galeria, setGaleria] = useState<{ suministro: string; photos: PhotoLink[] } | null>(null);

  // Consulta rápida de un suministro en todas las jornadas
  const [consulta, setConsulta] = useState('');
  const [consultando, setConsultando] = useState<{ hechas: number; total: number } | null>(null);
  const [consultaMsg, setConsultaMsg] = useState('');

  const consultar = async () => {
    const k = normSuministro(consulta);
    if (!k) return;
    setConsultaMsg('');
    // Si ya está en el cruce cargado, abrir directo
    const ya = datos?.get(k);
    if (ya?.length) {
      const ult = [...ya].sort((a, b) => (b.ultimaFoto?.getTime() ?? 0) - (a.ultimaFoto?.getTime() ?? 0))[0];
      openFicha(ult.point, ult.jornada, { autoBuscar: true });
      return;
    }
    if (selectedSheet && pointsExtended.length) primeCache(selectedSheet, pointsExtended);
    setConsultando({ hechas: 0, total: nombres.length });
    const res = await buscarEnJornadas(k, nombres, (hechas, total) => setConsultando({ hechas, total }));
    setConsultando(null);
    if (res.length === 0) {
      setConsultaMsg(`El suministro ${k} no aparece en ninguna de las ${nombres.length} jornadas.`);
      return;
    }
    openFicha(res[0].point, res[0].jornada, { autoBuscar: true });
  };

  /** Todas las fotos del suministro en todas las jornadas, de la más antigua a la más reciente. */
  const fotosDe = (f: Fila): PhotoLink[] =>
    f.ocurrencias
      .flatMap((o) => (o.point.photoLinks || []).map((l) => ({ ...l, odtNombre: l.odtNombre || o.point.odtNombre })))
      .sort((a, b) => (parseFecha(a.fecha)?.getTime() ?? 0) - (parseFecha(b.fecha)?.getTime() ?? 0));

  const nombres = sheets.map((s) => s.name);
  const q = busquedaJornada.trim().toLowerCase();
  const visiblesJornadas = q ? nombres.filter((n) => n.toLowerCase().includes(q)) : nombres;
  const enCache = jornadasEnCache();

  const toggle = (n: string) =>
    setElegidas((prev) => {
      const s = new Set(prev);
      if (s.has(n)) s.delete(n);
      else s.add(n);
      return s;
    });
  const todasVisibles = visiblesJornadas.length > 0 && visiblesJornadas.every((n) => elegidas.has(n));
  const toggleVisibles = () =>
    setElegidas((prev) => {
      const s = new Set(prev);
      visiblesJornadas.forEach((n) => (todasVisibles ? s.delete(n) : s.add(n)));
      return s;
    });

  const cargar = async () => {
    const lista = [...elegidas];
    if (lista.length === 0) return;
    if (selectedSheet && pointsExtended.length) primeCache(selectedSheet, pointsExtended);
    setProgreso({ hechas: 0, total: lista.length });
    const res = await cargarJornadas(lista, (hechas, total) => setProgreso({ hechas, total }));
    // Índice suministro → ocurrencias
    const idx = new Map<string, Ocurrencia[]>();
    res.forEach((points, jornada) =>
      points.forEach((p) => {
        const k = normSuministro(p.suministro);
        if (!k) return;
        const arr = idx.get(k) || [];
        arr.push(ocurrenciaDe(jornada, p));
        idx.set(k, arr);
      }),
    );
    setDatos(idx);
    setCargadas(lista);
    setProgreso(null);
    setPage(1);
  };

  // Lista pegada (Excel, una por línea, comas o espacios)
  const listaSet = useMemo(() => {
    const items = lista
      .split(/[\s,;]+/)
      .map((x) => normSuministro(x))
      .filter(Boolean);
    return items.length ? new Set(items) : null;
  }, [lista]);

  const filas: Fila[] = useMemo(() => {
    if (!datos) return [];
    const out: Fila[] = [];
    datos.forEach((oc, suministro) => {
      const ord = [...oc].sort((a, b) => (b.ultimaFoto?.getTime() ?? 0) - (a.ultimaFoto?.getTime() ?? 0));
      out.push({ suministro, ocurrencias: ord, categoria: clasificar(ord), repetido: ord.length > 1 });
    });
    return out.sort((a, b) => a.suministro.localeCompare(b.suministro));
  }, [datos]);

  const conteo = useMemo(() => {
    const c = { total: filas.length, falta: 0, ya_hecho: 0, en_proceso: 0, completado: 0, repetidos: 0 };
    filas.forEach((f) => {
      c[f.categoria]++;
      if (f.repetido) c.repetidos++;
    });
    return c;
  }, [filas]);

  const filtradas = useMemo(() => {
    const q = texto.trim().toLowerCase();
    return filas.filter((f) => {
      if (filtro === 'repetidos' && !f.repetido) return false;
      if (filtro !== 'todos' && filtro !== 'repetidos' && f.categoria !== filtro) return false;
      if (listaSet && !listaSet.has(f.suministro)) return false;
      if (soloJornadaActual && selectedSheet && !f.ocurrencias.some((o) => o.jornada === selectedSheet)) return false;
      if (q) {
        const p = f.ocurrencias[0].point;
        const hay = [f.suministro, p.clienteNombre, p.direccion, ...f.ocurrencias.flatMap((o) => o.trabajadores)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [filas, filtro, texto, listaSet, soloJornadaActual, selectedSheet]);

  const noEncontrados = useMemo(
    () => (listaSet && datos ? [...listaSet].filter((s) => !datos.has(s)) : []),
    [listaSet, datos],
  );

  const totalPages = Math.max(1, Math.ceil(filtradas.length / PAGE));
  const pagina = filtradas.slice((Math.min(page, totalPages) - 1) * PAGE, Math.min(page, totalPages) * PAGE);

  const exportar = () => {
    const fecha = new Date().toISOString().slice(0, 10);
    const data = filtradas.map((f) => {
      const ult = f.ocurrencias[0];
      return {
        ...sourceRow(ult.point),
        'Situación': CATEGORIA[f.categoria].label,
        'Nº de jornadas': f.ocurrencias.length,
        'Jornadas (más reciente primero)': f.ocurrencias.map((o) => `${o.jornada} [${STATUS_UI[o.estado]?.label ?? o.estado}]`).join(' | '),
        'Jornada de los datos': ult.jornada,
        'Última foto': ult.ultimaFoto ? ult.ultimaFoto.toLocaleString('es-PE') : null,
        'Trabajado por': [...new Set(f.ocurrencias.flatMap((o) => o.trabajadores))].join(', ') || null,
      };
    });
    if (data.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = autoCols(Object.keys(data[0]));
    const wb = XLSX.utils.book_new();
    const nombreHoja = filtro === 'todos' ? 'Suministros' : filtro === 'repetidos' ? 'Repetidos' : CATEGORIA[filtro].label;
    XLSX.utils.book_append_sheet(wb, ws, nombreHoja.slice(0, 31));
    const notas = XLSX.utils.aoa_to_sheet([
      ['Cruce de jornadas — notas'],
      [],
      ['Filtro', nombreHoja],
      ['Suministros exportados', data.length],
      ['Jornadas cruzadas', cargadas.length],
      ['Jornadas', cargadas.join(', ')],
      ['Generado', new Date().toLocaleString('es-PE')],
      [],
      ['Las primeras 36 columnas son las de la hoja fuente (A–AJ), tomadas de la jornada más reciente del suministro.'],
      ['"Falta hacer" = sin fotos en ninguna de las jornadas cruzadas.'],
      ['"Ya hecho en otra" = pendiente en alguna jornada pero completado en otra: no hace falta volver a ir.'],
    ]);
    notas['!cols'] = [{ wch: 30 }, { wch: 100 }];
    XLSX.utils.book_append_sheet(wb, notas, 'Notas');
    XLSX.writeFile(wb, `Cruce_${nombreHoja.replace(/[^\w-]+/g, '_')}_${fecha}.xlsx`);
  };

  const chips: { key: Filtro; label: string; count: number; tone: Tone }[] = [
    { key: 'todos', label: 'Todos', count: conteo.total, tone: 'cyan' },
    { key: 'falta', label: 'Falta hacer', count: conteo.falta, tone: 'red' },
    { key: 'ya_hecho', label: 'Ya hecho en otra', count: conteo.ya_hecho, tone: 'amber' },
    { key: 'repetidos', label: 'Repetidos', count: conteo.repetidos, tone: 'purple' },
    { key: 'en_proceso', label: 'En proceso', count: conteo.en_proceso, tone: 'yellow' },
    { key: 'completado', label: 'Completados', count: conteo.completado, tone: 'green' },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Control de duplicados"
        icon={<Layers size={22} />}
        title="Cruce de jornadas"
        subtitle="Consulta en qué jornadas aparece cada suministro, detecta repetidos y exporta solo lo que falta."
        actions={
          datos && (
            <button onClick={exportar} disabled={filtradas.length === 0} className={ui.btnSuccess}>
              <Download size={16} /> Exportar Excel ({fmtN(filtradas.length)})
            </button>
          )
        }
      />

      {/* Consulta rápida */}
      <SectionCard title="Consulta rápida de un suministro" icon={<Zap size={16} />}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            consultar();
          }}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={consulta}
              onChange={(e) => setConsulta(e.target.value)}
              placeholder="Número de suministro (p. ej. 10010743192)"
              inputMode="numeric"
              className={`${ui.input} pl-9 font-mono`}
            />
          </div>
          <button type="submit" disabled={!consulta.trim() || !!consultando} className={ui.btnPrimary}>
            <Search size={15} /> Consultar en todas las jornadas
          </button>
        </form>
        <p className="mt-2 text-xs text-gray-500">
          Muestra en qué jornadas se trabajó, la situación en cada una, quién lo hizo, cuándo y sus fotos.
        </p>
        {consultando && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Buscando en las jornadas…</span>
              <span className="font-mono">
                {consultando.hechas}/{consultando.total}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-200">
              <div className="h-full bg-electric transition-all" style={{ width: `${(consultando.hechas / consultando.total) * 100}%` }} />
            </div>
          </div>
        )}
        {consultaMsg && <p className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">{consultaMsg}</p>}
      </SectionCard>

      {/* 1. Jornadas a cruzar */}
      <SectionCard
        title="1 · Jornadas a cruzar"
        icon={<ClipboardList size={16} />}
        actions={<span className="text-xs text-gray-500">{fmtN(elegidas.size)} elegidas</span>}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={busquedaJornada}
              onChange={(e) => setBusquedaJornada(e.target.value)}
              placeholder='Filtrar jornadas por nombre (p. ej. "SEMANA", "P227", "OSINERMING")'
              className={`${ui.input} pl-9`}
            />
          </div>
          <button onClick={toggleVisibles} className={ui.btnSecondary}>
            {todasVisibles ? <CheckSquare size={15} /> : <Square size={15} />}
            {todasVisibles ? 'Quitar' : 'Elegir'} las {fmtN(visiblesJornadas.length)} mostradas
          </button>
          <button onClick={cargar} disabled={elegidas.size === 0 || !!progreso} className={ui.btnPrimary}>
            <RefreshCw size={15} className={progreso ? 'animate-spin' : ''} />
            {datos ? 'Volver a cruzar' : 'Cruzar jornadas'}
          </button>
        </div>

        <div className="mt-3 flex max-h-44 flex-wrap gap-1.5 overflow-y-auto pr-1">
          {visiblesJornadas.map((n) => {
            const on = elegidas.has(n);
            return (
              <button
                key={n}
                onClick={() => toggle(n)}
                className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                  on ? 'border-electric bg-blue-50 text-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-800'
                }`}
                title={enCache.has(n) ? 'Ya cargada en memoria' : undefined}
              >
                {n}
                {enCache.has(n) && <span className="ml-1 text-green-700">●</span>}
              </button>
            );
          })}
        </div>

        {progreso && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Leyendo jornadas… (solo lectura)</span>
              <span className="font-mono">
                {progreso.hechas}/{progreso.total}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-200">
              <div className="h-full bg-electric transition-all" style={{ width: `${(progreso.hechas / progreso.total) * 100}%` }} />
            </div>
            <p className="mt-1 text-[11px] text-gray-400">
              Cada jornada tarda unos segundos; las ya leídas (●) quedan en memoria y son instantáneas.
            </p>
          </div>
        )}
      </SectionCard>

      {!datos ? (
        <SectionCard>
          <EmptyState
            icon="reporte"
            title="Elige las jornadas a cruzar"
            description="Marca las jornadas (o filtra por nombre y elige todas las mostradas) y pulsa «Cruzar jornadas»."
          />
        </SectionCard>
      ) : (
        <>
          {/* 2. Resumen */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label="Suministros únicos" value={fmtN(conteo.total)} tone="cyan" hint={`en ${cargadas.length} jornadas`} />
            <StatCard label="Falta hacer" value={fmtN(conteo.falta)} tone="red" hint="Sin fotos en ninguna" onClick={() => setFiltro('falta')} active={filtro === 'falta'} />
            <StatCard label="Ya hecho en otra" value={fmtN(conteo.ya_hecho)} tone="amber" hint="No volver a ir" onClick={() => setFiltro('ya_hecho')} active={filtro === 'ya_hecho'} />
            <StatCard label="Repetidos" value={fmtN(conteo.repetidos)} tone="purple" hint="En 2 o más jornadas" onClick={() => setFiltro('repetidos')} active={filtro === 'repetidos'} />
            <StatCard label="Completados" value={fmtN(conteo.completado)} tone="green" onClick={() => setFiltro('completado')} active={filtro === 'completado'} />
          </div>

          {/* 3. Filtros */}
          <SectionCard title="2 · Consultar y filtrar" icon={<Search size={16} />}>
            <div className="flex flex-wrap gap-2">
              {chips.map((c) => (
                <button
                  key={c.key}
                  onClick={() => {
                    setFiltro(c.key);
                    setPage(1);
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    filtro === c.key ? 'border-electric bg-blue-50 text-gray-900' : 'border-gray-200 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  {c.label} <span className="ml-1 font-mono">{fmtN(c.count)}</span>
                </button>
              ))}
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto]">
              <input
                value={texto}
                onChange={(e) => {
                  setTexto(e.target.value);
                  setPage(1);
                }}
                placeholder="Buscar suministro, cliente, dirección o técnico…"
                className={ui.input}
              />
              <button onClick={() => setMostrarLista((v) => !v)} className={ui.btnSecondary}>
                <ClipboardList size={15} /> {listaSet ? `Lista pegada (${fmtN(listaSet.size)})` : 'Pegar lista de Excel'}
              </button>
              {selectedSheet && (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={soloJornadaActual} onChange={(e) => setSoloJornadaActual(e.target.checked)} className="accent-blue-600" />
                  Solo los de «{selectedSheet}»
                </label>
              )}
            </div>

            {mostrarLista && (
              <div className="mt-3">
                <textarea
                  value={lista}
                  onChange={(e) => {
                    setLista(e.target.value);
                    setPage(1);
                  }}
                  rows={4}
                  placeholder="Pega aquí una columna de suministros copiada de Excel (uno por línea, o separados por comas)"
                  className={`${ui.input} font-mono`}
                />
                <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {listaSet
                      ? `${fmtN(listaSet.size)} suministros en la lista · ${fmtN(noEncontrados.length)} no aparecen en las jornadas cruzadas`
                      : 'La tabla mostrará solo los suministros de la lista.'}
                  </span>
                  {lista && (
                    <button onClick={() => setLista('')} className="flex items-center gap-1 hover:text-gray-900">
                      <X size={12} /> Quitar lista
                    </button>
                  )}
                </div>
                {noEncontrados.length > 0 && (
                  <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-mono text-xs text-red-800">
                    No encontrados: {noEncontrados.slice(0, 30).join(', ')}
                    {noEncontrados.length > 30 && ` … y ${noEncontrados.length - 30} más`}
                  </p>
                )}
              </div>
            )}
            {filtro !== 'todos' && filtro !== 'repetidos' && (
              <p className="mt-3 text-xs text-gray-500">
                <Badge tone={CATEGORIA[filtro].tone}>{CATEGORIA[filtro].label}</Badge> {CATEGORIA[filtro].hint}.
              </p>
            )}
          </SectionCard>

          {/* 4. Tabla */}
          <div className={ui.tableWrap}>
            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full min-w-[860px]">
                <thead className="sticky top-0 z-10">
                  <tr className={ui.theadRow}>
                    <th className={ui.th}>Suministro</th>
                    <th className={ui.th}>Situación</th>
                    <th className={ui.th}>Jornadas</th>
                    <th className={ui.th}>Fotos</th>
                    <th className={ui.th}>Última foto</th>
                    <th className={ui.th}>Trabajado por</th>
                    <th className={ui.th}>Cliente / dirección</th>
                  </tr>
                </thead>
                <tbody>
                  {pagina.map((f) => {
                    const ult = f.ocurrencias[0];
                    const cat = CATEGORIA[f.categoria];
                    const quienes = [...new Set(f.ocurrencias.flatMap((o) => o.trabajadores))];
                    return (
                      <tr key={f.suministro} className={ui.tbodyRow}>
                        <td className={ui.td}>
                          <button
                            onClick={() => openFicha(ult.point, ult.jornada)}
                            className="font-mono font-medium text-electric hover:underline"
                            title="Ver ficha e historial"
                          >
                            {f.suministro}
                          </button>
                        </td>
                        <td className={ui.td}>
                          <Badge tone={cat.tone} dot>
                            {cat.label}
                          </Badge>
                        </td>
                        <td className={ui.td}>
                          <div className="flex max-w-[340px] flex-wrap gap-1">
                            {f.ocurrencias.map((o) => (
                              <span
                                key={o.jornada}
                                className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-1.5 py-0.5 text-[11px] text-gray-700"
                                title={`${o.jornada} · ${STATUS_UI[o.estado]?.label ?? o.estado} · ${fmtF(o.ultimaFoto)}`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    o.estado === 'completado' ? 'bg-green-500' : o.estado === 'en_proceso' ? 'bg-yellow-500' : 'bg-red-500'
                                  }`}
                                />
                                <span className="max-w-[140px] truncate">{o.jornada}</span>
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className={ui.td}>
                          {(() => {
                            const total = f.ocurrencias.reduce((n, o) => n + (o.point.photoLinks?.length || 0), 0);
                            return total > 0 ? (
                              <button
                                onClick={() => setGaleria({ suministro: f.suministro, photos: fotosDe(f) })}
                                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2 py-1 font-mono text-xs text-gray-700 hover:border-electric hover:text-electric"
                                title="Ver todas las fotos (todas las jornadas)"
                              >
                                <Camera size={13} /> {total}
                              </button>
                            ) : (
                              <span className="font-mono text-xs text-gray-400">0</span>
                            );
                          })()}
                        </td>
                        <td className={`${ui.td} whitespace-nowrap font-mono text-xs`}>{fmtF(ult.ultimaFoto)}</td>
                        <td className={`${ui.td} text-xs`}>{quienes.join(', ') || '—'}</td>
                        <td className={`${ui.td} max-w-[240px] truncate text-xs`} title={[ult.point.clienteNombre, ult.point.direccion].filter(Boolean).join(' · ')}>
                          {[ult.point.clienteNombre, ult.point.direccion].filter(Boolean).join(' · ') || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {pagina.length === 0 && (
                <EmptyState compact icon="medidor" title="Ningún suministro coincide" description="Prueba con otro filtro o quita la lista pegada." />
              )}
            </div>
            <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 text-xs text-gray-500">
              <span>
                {fmtN(filtradas.length)} suministros · página {Math.min(page, totalPages)} de {totalPages}
              </span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className={`${ui.btnSecondary} px-3 py-1`}>
                  Anterior
                </button>
                <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className={`${ui.btnSecondary} px-3 py-1`}>
                  Siguiente
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      {galeria && (
        <PhotoGalleryModal photos={galeria.photos} suministro={galeria.suministro} initialIndex={0} onClose={() => setGaleria(null)} />
      )}
    </div>
  );
}
