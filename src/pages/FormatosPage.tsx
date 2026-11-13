// Pestaña «Formatos 1A · 2A» de Reportes (contrato N° 111-2026, ELSE).
// Datos reales: formularios que llena el técnico en la app (getFormatos), la programación de la
// jornada (getPlanJornada) y los puntos de la hoja. Desde aquí se corrigen respuestas (con las
// reglas de la app, components/formatos/EditorFormato), se planifican coincidentes, se fijan los
// números SP / SC y se registra el aviso de los no conformes. El Formato 4 sigue en Reportes / Observados.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import JSZip from 'jszip';
import type { jsPDF } from 'jspdf';
import {
  FileDown,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Users,
  ClipboardCheck,
  CalendarClock,
  Search,
  BellRing,
  Check,
  X,
  Archive,
  Hash,
  RefreshCw,
  Loader2,
  ListChecks,
  FlaskConical,
  Shuffle,
  Sparkles,
  PencilLine,
} from 'lucide-react';
import { usePointsStore } from '../stores/pointsStore';
import { PageHeader, StatCard, SectionCard, Badge, EmptyState, ui } from '../components/ui';
import { brandAsset } from '../config/brand';
import { Thumb } from '../components/PhotoStrip';
import PhotoGalleryModal from '../components/PhotoGalleryModal';
import VistaPdf, { type Vista } from '../components/formatos/VistaPdf';
import EditorFormato from '../components/formatos/EditorFormato';
import type { GpsPointExtended, PhotoLink } from '../types/point';
import {
  pdf1A,
  pdf2A,
  procedimiento,
  prepararLogo,
  bloques1A,
  parseFecha,
  PREGUNTAS_1A,
  ITEMS_2A,
  TEXTO_USUARIO_1A,
  sinFotos,
  type Resp,
  type Supervisada,
} from '../utils/pdfFormatos';
import {
  getFormatos,
  getPlanJornada,
  aSupervisadas,
  numerarJornada,
  etiquetaReporte,
  normSuministro,
  plazoEntrega,
  asignarNumeros,
  marcarAvisado,
  marcarCoincidente,
  type FormatoServidor,
  type PlanItem,
  type SupervisadaApp,
} from '../services/formatosService';
import { guardarAnexarF4, leerAnexarF4, pdf1AConAnexo, pdf2AConAnexo, type PdfUnido } from '../utils/formatosConAnexo';

const POR_PAGINA = 15;
const PLAN_POR_PAGINA = 20;
type Filtro = 'todos' | '1A' | '2A' | 'no_conforme' | 'por_avisar' | 'provisional';
type Estado = 'cargando' | 'listo' | 'sinServidor' | 'error';

/** Aviso de resultado de una acción (éxito o error), arriba de la página. */
interface Aviso {
  tono: 'ok' | 'error';
  texto: string;
}

const id = (s: SupervisadaApp) => s.id || `${s.punto.suministro}#${s.tipo}`;

export default function FormatosPage() {
  const { pointsExtended, selectedSheet, isLoading } = usePointsStore();
  const hoja = selectedSheet ?? '';

  // ---------------------------------------------------------------- datos del servidor
  const [datos, setDatos] = useState<{
    hoja: string;
    estado: Estado;
    formatos: FormatoServidor[];
    plan: PlanItem[];
    planSinServidor: boolean;
    mensaje?: string;
  }>({ hoja: '', estado: 'cargando', formatos: [], plan: [], planSinServidor: false });
  const [recarga, setRecarga] = useState(0);
  const pedido = useRef(0);

  useEffect(() => {
    if (!hoja) return;
    const n = ++pedido.current;
    Promise.all([getFormatos(hoja), getPlanJornada(hoja)]).then(([f, p]) => {
      if (pedido.current !== n) return; // llegó tarde: ya se pidió otra jornada
      setDatos({
        hoja,
        estado: f.sinInstalar ? 'sinServidor' : f.success ? 'listo' : 'error',
        formatos: f.success ? f.formatos : [],
        plan: p.success ? p.plan : [],
        planSinServidor: !!p.sinInstalar,
        mensaje: f.success ? undefined : f.message,
      });
    });
  }, [hoja, recarga]);
  const recargar = () => setRecarga((n) => n + 1);
  const estado: Estado = datos.hoja === hoja ? datos.estado : 'cargando';
  const formatos = useMemo(() => (datos.hoja === hoja ? datos.formatos : []), [datos, hoja]);
  const plan = useMemo(() => (datos.hoja === hoja ? datos.plan : []), [datos, hoja]);

  // Solo en desarrollo y sin formularios reales: respuestas inventadas para probar la pantalla
  const [simulado, setSimulado] = useState(false);
  const puedeSimular = import.meta.env.DEV && estado !== 'cargando' && formatos.length === 0;
  const [sim, setSim] = useState<SupervisadaApp[]>([]);
  useEffect(() => {
    if (!puedeSimular || !simulado) return;
    let vivo = true;
    import('../prototipo/formatos').then(({ simular }) => {
      if (!vivo) return;
      setSim(
        simular(pointsExtended).map((s) => ({
          ...s,
          id: `sim-${s.punto.rowIndex}-${s.tipo}`,
          provisional: true,
          avisadoEn: '',
          editado: '',
          fotosApp: s.punto.photoLinks.map((p, k) => ({ url: p.url, rol: `Foto ${k + 1}`, timestamp: p.fecha })),
        })),
      );
    });
    return () => {
      vivo = false;
    };
  }, [puedeSimular, simulado, pointsExtended]);
  const usarSimulado = puedeSimular && simulado;

  // ---------------------------------------------------------------- supervisiones
  const sup = useMemo(() => {
    const l = usarSimulado ? sim : numerarJornada(aSupervisadas(formatos, pointsExtended));
    return [...l].sort((a, b) => (a.fecha?.getTime() ?? 0) - (b.fecha?.getTime() ?? 0));
  }, [usarSimulado, sim, formatos, pointsExtended]);

  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  // Fotos del 1A/2A (evidencias de los NO y registro adicional): se recuerda por navegador
  const [conFotos, setConFotos] = useState<boolean>(() => {
    try {
      return localStorage.getItem('telcom-formatos-con-fotos') !== 'no';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('telcom-formatos-con-fotos', conFotos ? 'si' : 'no');
    } catch {
      /* sin almacenamiento: queda en memoria */
    }
  }, [conFotos]);
  const f = <T extends Supervisada>(l: T[]): T[] => (conFotos ? l : sinFotos(l));
  // Formato 4 de cada suministro dentro del PDF del 1A/2A (se recuerda por navegador)
  const [anexarF4, setAnexarF4] = useState<boolean>(leerAnexarF4);
  useEffect(() => guardarAnexarF4(anexarF4), [anexarF4]);
  const [progresoTxt, setProgresoTxt] = useState('');
  const opAnexo = { onProgreso: setProgresoTxt };
  const doc1A = (b: SupervisadaApp[]) => (anexarF4 ? pdf1AConAnexo(f(b), hoja, opAnexo) : pdf1A(f(b), hoja));
  const doc2A = (s: SupervisadaApp) => (anexarF4 ? pdf2AConAnexo(f([s])[0], hoja, opAnexo) : pdf2A(f([s])[0], hoja));
  const [selId, setSelId] = useState<string | null>(null);
  const [pag, setPag] = useState(0);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [q, setQ] = useState('');
  const [tecnico, setTecnico] = useState('');
  const [reporte, setReporte] = useState('');
  const [galeria, setGaleria] = useState<{ photos: PhotoLink[]; suministro: string; i: number } | null>(null);
  const [vista, setVista] = useState<Vista | null>(null);
  const [editando, setEditando] = useState<SupervisadaApp | null>(null);

  // Al cambiar de jornada se limpia la selección y los filtros
  useEffect(() => {
    setSelId(null);
    setPag(0);
    setFiltro('todos');
    setQ('');
    setTecnico('');
    setReporte('');
    setAviso(null);
    setSimulado(false);
  }, [hoja]);

  // Programados: la lista del plan; si el servidor no la tiene, los suministros distintos de la hoja
  const programados = useMemo(() => {
    if (plan.length) return plan.length;
    return new Set(pointsExtended.map((p) => normSuministro(p.suministro))).size;
  }, [plan, pointsExtended]);
  const n1 = sup.filter((s) => s.tipo === '1A').length;
  const n2 = sup.length - n1;
  const meta2 = Math.max(1, Math.ceil(sup.length * 0.1));
  const noConf = sup.filter((s) => !s.conforme);
  const porAvisar = noConf.filter((s) => !s.avisado);
  const provisionales = sup.filter((s) => s.provisional).length;
  const tecnicos = useMemo(() => [...new Set(sup.map((s) => s.tecnico))].sort(), [sup]);
  const plazo = useMemo(() => {
    const delPlan = plan.map((p) => parseFecha(p.fechaProgramada)).filter((d) => d);
    return plazoEntrega(delPlan.length ? delPlan : pointsExtended.map((p) => parseFecha(p.fecha)));
  }, [plan, pointsExtended]);
  const { proc, sector } = procedimiento(hoja);

  const bloques = useMemo(() => bloques1A(sup) as [string, SupervisadaApp[]][], [sup]);
  const coincidentes = useMemo(
    () => sup.filter((s) => s.tipo === '2A').sort((a, b) => a.reporte.localeCompare(b.reporte)),
    [sup],
  );

  const visibles = useMemo(() => {
    const t = q.trim();
    return sup.filter((s) => {
      if (filtro === '1A' && s.tipo !== '1A') return false;
      if (filtro === '2A' && s.tipo !== '2A') return false;
      if (filtro === 'no_conforme' && s.conforme) return false;
      if (filtro === 'por_avisar' && (s.conforme || s.avisado)) return false;
      if (filtro === 'provisional' && !s.provisional) return false;
      if (tecnico && s.tecnico !== tecnico) return false;
      if (reporte && s.reporte !== reporte) return false;
      if (t && !String(s.punto.suministro).includes(t) && !String(s.muestra).startsWith(t)) return false;
      return true;
    });
  }, [sup, filtro, q, tecnico, reporte]);

  useEffect(() => setPag(0), [filtro, q, tecnico, reporte]);
  const paginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA));
  const filas = visibles.slice(pag * POR_PAGINA, (pag + 1) * POR_PAGINA);
  const actual = sup.find((s) => id(s) === selId) ?? filas[0] ?? null;

  // ---------------------------------------------------------------- acciones
  const ejecutar = useCallback(
    async (clave: string, f: () => Promise<{ success: boolean; message?: string }>, exito: string) => {
      setOcupado(clave);
      setAviso(null);
      try {
        const r = await f();
        if (r.success) {
          setAviso({ tono: 'ok', texto: exito });
          recargar();
        } else setAviso({ tono: 'error', texto: r.message || 'El servidor rechazó la acción.' });
      } finally {
        setOcupado(null);
      }
    },
    [],
  );

  const onAsignar = () => {
    if (
      !window.confirm(
        `Asignar números a ${provisionales} formulario(s) sin número de la jornada «${hoja}».\n\n` +
          'Los números quedan FIJOS: no cambian aunque después lleguen más formularios ni se puedan ' +
          'reutilizar (los contadores SP / SC son de todo el año). Los ya numerados no se tocan.\n\n¿Continuar?',
      )
    )
      return;
    ejecutar('numeros', () => asignarNumeros(hoja), 'Números asignados. Ya son definitivos.');
  };

  const onAvisado = (s: SupervisadaApp) =>
    ejecutar(
      `avisado-${id(s)}`,
      () => marcarAvisado(hoja, s.id, true),
      `Aviso registrado para el suministro ${s.punto.suministro}.`,
    );

  // Vista previa del PDF dentro de la página (no descarga nada)
  const ver = async (clave: string, f: () => Promise<jsPDF | PdfUnido>, nombre: string) => {
    setOcupado(clave);
    setProgresoTxt('');
    try {
      await prepararLogo(brandAsset('logo-horizontal.webp'));
      const doc = await f();
      if ('blob' in doc) {
        // Con el Formato 4 anexado (PDF unido con pdf-lib)
        setVista({ url: URL.createObjectURL(doc.blob), nombre, horizontal: doc.horizontal, paginas: doc.paginas });
      } else {
        doc.setProperties({ title: nombre });
        const t = doc.internal.pageSize;
        setVista({
          url: String(doc.output('bloburl')),
          nombre,
          horizontal: t.getWidth() > t.getHeight(),
          paginas: doc.getNumberOfPages(),
        });
      }
    } catch (e) {
      setAviso({ tono: 'error', texto: `No se pudo armar el PDF: ${(e as Error).message}` });
    } finally {
      setOcupado(null);
      setProgresoTxt('');
    }
  };
  const aBlob = async (d: jsPDF | PdfUnido) => ('blob' in d ? d.blob : d.output('blob'));

  const zip = async () => {
    setOcupado('zip');
    setProgresoTxt('');
    try {
      await prepararLogo(brandAsset('logo-horizontal.webp'));
      const z = new JSZip();
      for (const [num, b] of bloques) z.file(`1A/${num}_${proc}.pdf`, await aBlob(await doc1A(b)));
      for (const s of coincidentes) z.file(`2A/${s.reporte}_${s.punto.suministro}.pdf`, await aBlob(await doc2A(s)));
      setProgresoTxt('Comprimiendo…');
      const blob = await z.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const sem = hoja.match(/SEM\s?(\d+)/i)?.[1] ?? '';
      a.download = `Entrega_${proc}_Sem${sem}${provisionales ? '_PROVISIONAL' : ''}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    } catch (e) {
      setAviso({ tono: 'error', texto: `No se pudo armar el ZIP: ${(e as Error).message}` });
    } finally {
      setOcupado(null);
      setProgresoTxt('');
    }
  };

  const kpi = (f: Filtro) => ({ onClick: () => setFiltro(filtro === f ? 'todos' : f), active: filtro === f });

  // ---------------------------------------------------------------- vista
  const cargando = estado === 'cargando' || (isLoading && !pointsExtended.length);

  // Enlaces desde otras páginas: «?s=<suministro>» abre ese formulario (o lo busca en la
  // programación) y «#coincidentes» baja a «Planificar coincidentes». Se aplica una vez por enlace.
  const location = useLocation();
  const [planBuscar, setPlanBuscar] = useState('');
  const enlaceAplicado = useRef('');
  useEffect(() => {
    if (!hoja || cargando) return;
    const clave = location.search + location.hash;
    const destino = new URLSearchParams(location.search).get('s')?.trim() ?? '';
    const aCoincidentes = location.hash === '#coincidentes';
    if ((!destino && !aCoincidentes) || enlaceAplicado.current === clave) return;
    enlaceAplicado.current = clave;

    let selector = '#coincidentes';
    const buscado = normSuministro(destino);
    const s = destino && !aCoincidentes ? sup.find((x) => normSuministro(x.punto.suministro) === buscado) : undefined;
    if (s) {
      setFiltro('todos');
      setQ('');
      setTecnico('');
      setReporte('');
      setSelId(id(s));
      // Sin filtros la tabla muestra `sup` en el mismo orden: se va a la página de esa fila
      const pagina = Math.floor(sup.indexOf(s) / POR_PAGINA);
      window.setTimeout(() => setPag(pagina), 0);
      selector = `[data-suministro="${CSS.escape(buscado)}"]`;
    } else if (destino) setPlanBuscar(destino);

    // Esperar a que la fila o la sección estén en pantalla (máx. ~3 s)
    let intentos = 0;
    const t = window.setInterval(() => {
      const el = document.querySelector(selector);
      if (el || ++intentos > 30) {
        window.clearInterval(t);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }, [hoja, cargando, location.search, location.hash, sup]);

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Supervisión · Contrato N° 111-2026"
        title="Formatos 1A · 2A"
        subtitle={
          <span>
            <b>{hoja || '—'}</b> · {proc} · {sector}
          </span>
        }
        icon={<FileText size={22} />}
        image="hero-torre.webp"
        actions={
          <>
            {usarSimulado && (
              <span className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-700">
                PRUEBA · respuestas simuladas
              </span>
            )}
            <button className={ui.btnSecondary} onClick={recargar} disabled={!hoja || estado === 'cargando'}>
              <RefreshCw size={15} className={estado === 'cargando' ? 'animate-spin' : ''} /> Actualizar
            </button>
          </>
        }
      />

      <div className="flex gap-1 border-b border-gray-200 text-sm">
        <Link to="/reportes" className="px-4 py-2 text-gray-500 hover:text-gray-900">
          Anexos de programación
        </Link>
        <span className="border-b-2 border-electric px-4 py-2 font-semibold text-gray-900">Formatos 1A · 2A</span>
        <Link to="/observados" className="px-4 py-2 text-gray-500 hover:text-gray-900">
          Observados
        </Link>
      </div>

      {aviso && (
        <div
          role="status"
          className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm ${
            aviso.tono === 'ok'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          <span className="flex items-start gap-2">
            {aviso.tono === 'ok' ? (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            )}
            {aviso.texto}
          </span>
          <button
            onClick={() => setAviso(null)}
            aria-label="Cerrar aviso"
            className="shrink-0 opacity-70 hover:opacity-100"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {puedeSimular && (
        <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-amber-700">
          <input
            type="checkbox"
            className="accent-amber-500"
            checked={simulado}
            onChange={(e) => setSimulado(e.target.checked)}
          />
          <FlaskConical size={13} /> usar respuestas simuladas (prueba, solo en desarrollo)
        </label>
      )}

      {!hoja ? (
        <EmptyState title="Elige una jornada" description="Selecciona la jornada arriba para ver sus formularios." />
      ) : cargando ? (
        <EmptyState title="Cargando la jornada…" description="Leyendo formularios, programación y fotos." compact />
      ) : !sup.length ? (
        <EmptyState
          title={
            estado === 'sinServidor'
              ? 'El servidor todavía no tiene los formularios 1A · 2A'
              : estado === 'error'
                ? 'No se pudieron leer los formularios'
                : 'Aún no hay formularios 1A · 2A de la app para esta jornada'
          }
          description={
            estado === 'sinServidor'
              ? 'Falta desplegar la nueva versión del Apps Script (acción «getFormatos»).'
              : estado === 'error'
                ? datos.mensaje
                : 'Aparecen aquí cuando los técnicos guardan la supervisión en la app TELCOM Operaciones.'
          }
          action={
            <button className={ui.btnSecondary} onClick={recargar}>
              <RefreshCw size={15} /> Volver a consultar
            </button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <StatCard
              label="Supervisados"
              value={`${sup.length} / ${programados}`}
              hint={plan.length ? 'formularios de programados' : 'de suministros en la hoja'}
              tone="blue"
              icon={<ClipboardCheck size={18} />}
              {...kpi('todos')}
            />
            <StatCard
              label="Posteriores 1A"
              value={n1}
              hint={`${bloques.length} reporte${bloques.length === 1 ? '' : 's'} SP (10 c/u)`}
              tone="cyan"
              icon={<FileText size={18} />}
              {...kpi('1A')}
            />
            <StatCard
              label="Coincidentes 2A"
              value={`${n2} / ~${meta2}`}
              hint={n2 >= meta2 ? 'meta del 10 % cumplida' : `faltan ${meta2 - n2} para el 10 %`}
              tone="amber"
              icon={<Users size={18} />}
              {...kpi('2A')}
            />
            <StatCard
              label="No conformes"
              value={noConf.length}
              hint={`${noConf.length - porAvisar.length} ya avisados`}
              tone="red"
              icon={<AlertTriangle size={18} />}
              {...kpi('no_conforme')}
            />
            <StatCard
              label="Por avisar (24 h)"
              value={porAvisar.length}
              hint="notificar a la contratista"
              tone="yellow"
              icon={<BellRing size={18} />}
              {...kpi('por_avisar')}
            />
            <StatCard
              label="Plazo de entrega"
              value={plazo ? (plazo.quedan >= 0 ? `${plazo.quedan} días` : 'vencido') : '—'}
              hint={plazo ? `vence ${plazo.venceTxt} · 5.º día hábil` : 'sin fechas programadas'}
              tone={plazo && plazo.quedan <= 1 ? 'red' : 'green'}
              icon={<CalendarClock size={18} />}
            />
          </div>

          {provisionales > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
              <AlertTriangle size={16} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <b>{provisionales}</b> formulario{provisionales === 1 ? '' : 's'} con número <b>provisional</b>. Asigna
                los números antes de entregar: los provisionales pueden cambiar si llegan más formularios.{' '}
                <button
                  className="font-semibold underline underline-offset-2"
                  onClick={() => setFiltro(filtro === 'provisional' ? 'todos' : 'provisional')}
                >
                  {filtro === 'provisional' ? 'Ver todos' : 'Ver cuáles'}
                </button>
              </span>
              <button
                className={ui.btnPrimary}
                onClick={onAsignar}
                disabled={usarSimulado || ocupado !== null}
                title="Fija los números SP / SC de los formularios que todavía no tienen. Quedan definitivos."
              >
                {ocupado === 'numeros' ? <Loader2 size={15} className="animate-spin" /> : <Hash size={15} />}
                Asignar números ({provisionales})
              </button>
            </div>
          )}

          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative w-full sm:w-72">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar suministro o N° de muestra"
                className={`${ui.input} pl-9`}
              />
            </label>
            <select
              value={tecnico}
              onChange={(e) => setTecnico(e.target.value)}
              className={`${ui.input} !w-auto min-w-[210px]`}
            >
              <option value="">Todos los técnicos</option>
              {tecnicos.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <select
              value={reporte}
              onChange={(e) => setReporte(e.target.value)}
              className={`${ui.input} !w-auto min-w-[210px]`}
            >
              <option value="">Todos los reportes</option>
              {bloques.map(([n, b]) => (
                <option key={n} value={n}>
                  {etiquetaReporte(b[0])}
                </option>
              ))}
              {coincidentes.map((s) => (
                <option key={s.reporte} value={s.reporte}>
                  {etiquetaReporte(s)}
                </option>
              ))}
            </select>
            {(filtro !== 'todos' || q || tecnico || reporte) && (
              <button
                className={ui.btnSecondary}
                onClick={() => {
                  setFiltro('todos');
                  setQ('');
                  setTecnico('');
                  setReporte('');
                }}
              >
                <X size={14} /> Quitar filtros
              </button>
            )}
            <span className="ml-auto text-xs text-gray-500">
              {visibles.length} de {sup.length} formularios · ordenados por fecha
            </span>
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
            <div className={ui.tableWrap}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className={ui.theadRow}>
                      <th className={ui.th}>Muestra</th>
                      <th className={ui.th}>Suministro</th>
                      <th className={ui.th}>Tipo</th>
                      <th className={ui.th}>Supervisión</th>
                      <th className={ui.th}>Técnico</th>
                      <th className={ui.th}>Fotos</th>
                      <th className={ui.th}>Resultado</th>
                      <th className={ui.th}>Reporte</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((s) => (
                      <tr
                        key={id(s)}
                        data-suministro={normSuministro(s.punto.suministro)}
                        onClick={() => setSelId(id(s))}
                        className={`${ui.tbodyRow} cursor-pointer ${actual && id(actual) === id(s) ? '!bg-blue-100 outline outline-1 -outline-offset-1 outline-electric/60' : ''}`}
                      >
                        <td className={`${ui.td} tabular-nums`}>{s.muestra}</td>
                        <td className={`${ui.td} font-semibold tabular-nums text-gray-900`}>{s.punto.suministro}</td>
                        <td className={ui.td}>
                          <Badge tone={s.tipo === '1A' ? 'blue' : 'amber'}>{s.tipo}</Badge>
                        </td>
                        <td className={`${ui.td} whitespace-nowrap tabular-nums`}>
                          {s.fechaTxt} <span className="text-gray-500">{s.horaTxt}</span>
                        </td>
                        <td className={`${ui.td} max-w-[150px] truncate`} title={s.tecnico}>
                          {s.tecnico}
                        </td>
                        <td className={`${ui.td} tabular-nums`}>
                          {s.fotosApp.length}
                          {s.fotosFaltan > 0 && <span className="text-amber-700"> · faltan {s.fotosFaltan}</span>}
                        </td>
                        <td className={ui.td}>
                          <div className="flex flex-col items-start gap-1">
                            {s.conforme ? <Badge tone="green">Conforme</Badge> : <Badge tone="red">No conforme</Badge>}
                            {!s.conforme && !s.avisado && <Badge tone="yellow">Por avisar</Badge>}
                          </div>
                        </td>
                        <td className={`${ui.td} whitespace-nowrap tabular-nums`}>
                          <span className="font-semibold text-electric">{s.reporte}</span>
                          {s.provisional && <span className="block text-[10px] text-amber-700">provisional</span>}
                        </td>
                      </tr>
                    ))}
                    {!filas.length && (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-sm text-gray-500">
                          Ningún formulario con esos filtros.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-gray-200 px-4 py-2 text-xs text-gray-500">
                <span>
                  Página {pag + 1} de {paginas}
                </span>
                <span className="flex gap-2">
                  <button className={ui.btnSecondary} disabled={pag === 0} onClick={() => setPag((p) => p - 1)}>
                    Anterior
                  </button>
                  <button
                    className={ui.btnSecondary}
                    disabled={pag + 1 >= paginas}
                    onClick={() => setPag((p) => p + 1)}
                  >
                    Siguiente
                  </button>
                </span>
              </div>
            </div>

            {actual && (
              <Detalle
                s={actual}
                ocupado={ocupado}
                simulado={usarSimulado}
                onAvisado={() => onAvisado(actual)}
                onEditar={() => setEditando(actual)}
                onFoto={(photos, i) => setGaleria({ photos, suministro: String(actual.punto.suministro), i })}
                onPdf={() =>
                  actual.tipo === '2A'
                    ? ver('2a', () => doc2A(actual), `${actual.reporte}_${actual.punto.suministro}.pdf`)
                    : ver(
                        '1a',
                        () => doc1A(bloques.find(([n]) => n === actual.reporte)?.[1] ?? [actual]),
                        `${actual.reporte}_${proc}.pdf`,
                      )
                }
              />
            )}
          </div>

          <SectionCard title="Entrega de la semana" icon={<FileDown size={16} />} bodyClassName="p-4 space-y-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="space-y-2">
                <p className="text-sm text-gray-500">
                  Los 1A se ordenan por fecha y se agrupan de 10 en 10. Clic en un reporte para verlo.
                  {provisionales > 0 && <span className="text-amber-700"> Con números provisionales.</span>}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      [conFotos, setConFotos, 'Incluir fotos', 'evidencias de los NO y registro adicional'],
                      [anexarF4, setAnexarF4, 'Anexar el Formato 4', 'de cada suministro, después del 1A/2A'],
                    ] as const
                  ).map(([v, set, titulo, detalle]) => (
                    <label
                      key={titulo}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-xs transition ${
                        v ? 'border-electric/60 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={v}
                        onChange={(e) => set(e.target.checked)}
                        className="h-4 w-4 accent-electric"
                      />
                      <span>
                        <b className="block font-semibold text-gray-900">{titulo}</b>
                        <span className="text-gray-500">{detalle}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <button className={ui.btnSuccess} disabled={ocupado !== null} onClick={zip}>
                <Archive size={15} />{' '}
                {ocupado === 'zip'
                  ? progresoTxt || 'Armando ZIP…'
                  : `Descargar ZIP (${bloques.length} SP + ${coincidentes.length} SC)`}
              </button>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Formato 1A · posteriores
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {bloques.map(([num, b]) => {
                  const nc = b.filter((s) => !s.conforme).length;
                  return (
                    <button
                      key={num}
                      className="min-w-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left transition hover:border-electric"
                      disabled={ocupado !== null}
                      onClick={() => ver(num, () => doc1A(b), `${num}_${proc}.pdf`)}
                    >
                      <span className="block text-sm font-semibold text-electric">
                        {ocupado === num ? progresoTxt || 'Armando…' : etiquetaReporte(b[0])}
                      </span>
                      <span className="block truncate text-[11px] text-gray-500">
                        {b.length} muestras · {b[0]?.fechaTxt.slice(0, 5)}–{b[b.length - 1]?.fechaTxt.slice(0, 5)}
                        {nc > 0 && <span className="text-red-700"> · {nc} no conf.</span>}
                      </span>
                    </button>
                  );
                })}
                {!bloques.length && <p className="text-xs text-gray-500">Sin formularios 1A.</p>}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Formato 2A · coincidentes
              </p>
              <div className="flex flex-wrap gap-2">
                {coincidentes.map((s) => (
                  <button
                    key={id(s)}
                    className={ui.btnSecondary}
                    disabled={ocupado !== null}
                    onClick={() => ver(s.reporte, () => doc2A(s), `${s.reporte}_${s.punto.suministro}.pdf`)}
                  >
                    <Users size={14} /> {etiquetaReporte(s)} · {s.punto.suministro}
                    {!s.conforme && <span className="h-2 w-2 rounded-full bg-red-500" />}
                  </button>
                ))}
                {!coincidentes.length && <p className="text-xs text-gray-500">Sin formularios 2A.</p>}
              </div>
            </div>
          </SectionCard>
        </>
      )}

      {hoja && !cargando && (
        <div id="coincidentes" className="scroll-mt-24">
          <PlanCoincidentes
            key={hoja}
            hoja={hoja}
            buscarInicial={planBuscar}
            plan={plan}
            planSinServidor={datos.planSinServidor}
            sup={sup}
            puntos={pointsExtended}
            onCambio={(texto, ok) => {
              setAviso({ tono: ok ? 'ok' : 'error', texto });
              if (ok) recargar();
            }}
          />
        </div>
      )}

      {vista && <VistaPdf vista={vista} onCerrar={() => setVista(null)} />}

      {editando?.servidor && (
        <EditorFormato
          s={editando}
          hoja={hoja}
          onCerrar={() => setEditando(null)}
          onGuardado={(texto) => {
            setAviso({ tono: 'ok', texto });
            recargar();
          }}
        />
      )}

      {galeria && (
        <PhotoGalleryModal
          photos={galeria.photos}
          suministro={galeria.suministro}
          initialIndex={galeria.i}
          onClose={() => setGaleria(null)}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ detalle del formulario

function Detalle({
  s,
  ocupado,
  simulado,
  onAvisado,
  onEditar,
  onFoto,
  onPdf,
}: {
  s: SupervisadaApp;
  ocupado: string | null;
  simulado: boolean;
  onAvisado: () => void;
  onEditar: () => void;
  onFoto: (photos: PhotoLink[], i: number) => void;
  onPdf: () => void;
}) {
  const filas =
    s.tipo === '1A'
      ? [
          ...PREGUNTAS_1A.map((p) => ({ id: p.id, texto: p.texto, bloque: '', r: s.resp[p.id] as Resp | undefined })),
          { id: 'usuario', texto: TEXTO_USUARIO_1A, bloque: '', r: (s.usuario || undefined) as Resp | undefined },
        ]
      : ITEMS_2A.map((p) => ({ ...p, r: s.resp2A[p.id] as Resp | undefined }));
  const enNo = filas.filter((p) => p.r === 'NO').length;
  // Fotos con link, para la galería (con su etiqueta)
  const conLink = s.fotosApp.filter((f) => f.url);
  const galeria: PhotoLink[] = conLink.map((f, k) => ({
    url: f.url!,
    fecha: `${f.rol} · ${f.timestamp}`,
    numero: k + 1,
  }));
  const puedeEditar = !simulado && !!s.servidor && !!s.id;

  return (
    <SectionCard
      title={`${s.punto.suministro} · Muestra ${s.muestra}`}
      icon={<ClipboardCheck size={16} />}
      bodyClassName="p-4 space-y-4"
      className="xl:sticky xl:top-4"
    >
      {/* Quién, cuándo, número y acciones principales */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <Badge tone={s.tipo === '1A' ? 'blue' : 'amber'}>Formato {s.tipo}</Badge>
          {s.conforme ? <Badge tone="green">Conforme</Badge> : <Badge tone="red">No conforme · {enNo} en NO</Badge>}
          <b className="text-electric">{etiquetaReporte(s)}</b>
        </div>
        <p className="text-xs text-gray-500">
          {s.tecnico} · {s.fechaTxt} {s.horaTxt}
          {s.tipo === '1A' ? (
            <>
              {' '}
              · sticker <b className="text-gray-800">{s.fechaSticker}</b> · lectura{' '}
              <b className="text-gray-800">{s.lectura}</b>
            </>
          ) : (
            <>
              {' '}
              · patrón <b className="text-gray-800">{s.patron || '—'}</b> · carga{' '}
              <b className="text-gray-800">{s.carga || '—'}</b>
            </>
          )}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button className={ui.btnSecondary} onClick={onPdf} disabled={ocupado !== null}>
            {s.tipo === '2A' ? <FileDown size={15} /> : <FileText size={15} />}
            {s.tipo === '2A' ? 'Ver PDF 2A' : `Ver PDF ${s.reporte}`}
          </button>
          <button
            className={ui.btnSecondary}
            onClick={onEditar}
            disabled={!puedeEditar || ocupado !== null}
            title={puedeEditar ? 'Corregir respuestas, certificados u observación' : 'Solo formularios reales'}
          >
            <PencilLine size={15} /> Corregir respuestas
          </button>
        </div>
        {s.editado && (
          <p className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1.5 text-[11px] text-electric">
            <PencilLine size={12} className="shrink-0" /> Corregido desde el dashboard: {s.editado}
          </p>
        )}
      </div>

      {/* Observación y aviso (lo urgente, arriba) */}
      {!s.conforme && (
        <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          <b className="block">Observación (va al PDF y al aviso):</b>
          <p className="whitespace-pre-wrap">{s.observacion || '—'}</p>
          {s.avisado ? (
            <div className="flex items-center gap-1.5 font-semibold text-green-700">
              <Check size={14} /> Avisado a la contratista{s.avisadoEn ? ` · ${s.avisadoEn}` : ''}
            </div>
          ) : (
            <button className={ui.btnPrimary} onClick={onAvisado} disabled={ocupado !== null || simulado || !s.id}>
              {ocupado?.startsWith('avisado') ? <Loader2 size={14} className="animate-spin" /> : <BellRing size={14} />}
              Marcar como avisado
            </button>
          )}
        </div>
      )}

      {/* Fotos del formulario con su función */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Fotos ({s.fotosApp.length})
        </p>
        {s.fotosApp.length > 0 ? (
          <div className="grid grid-cols-4 gap-2">
            {s.fotosApp.map((f, k) => {
              const i = conLink.indexOf(f);
              return (
                <button
                  key={`${f.timestamp}-${k}`}
                  disabled={i < 0}
                  onClick={() => onFoto(galeria, i)}
                  className="min-w-0 text-left disabled:cursor-not-allowed"
                  title={f.rol}
                >
                  {f.url ? (
                    <Thumb url={f.url} size={88} />
                  ) : (
                    <span className="flex h-[88px] items-center justify-center rounded-lg border border-dashed border-gray-300 p-1 text-center text-[10px] text-gray-500">
                      Foto no encontrada
                    </span>
                  )}
                  <span className="mt-0.5 block text-[10px] leading-tight text-gray-500">{f.rol}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-gray-500">El formulario no trae fotos.</p>
        )}
      </div>

      {/* Respuestas */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Respuestas {enNo > 0 && <span className="text-red-700">· {enNo} en NO</span>}
        </p>
        <div className="max-h-[420px] divide-y divide-gray-200 overflow-y-auto rounded-xl border border-gray-200">
          {filas.map((p, k, arr) => {
            const nuevoBloque = s.tipo === '2A' && p.bloque && (k === 0 || arr[k - 1].bloque !== p.bloque);
            return (
              <div key={p.id}>
                {nuevoBloque && (
                  <div className="bg-gray-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                    {p.bloque}
                  </div>
                )}
                <div
                  className={`flex items-center justify-between gap-3 px-3 py-1.5 text-xs ${p.r === 'NO' ? 'bg-red-50' : ''}`}
                >
                  <span className="text-gray-700">{p.texto}</span>
                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold ${
                      p.r === 'SI'
                        ? 'bg-green-600 text-white'
                        : p.r === 'NO'
                          ? 'bg-red-600 text-white'
                          : 'border border-gray-300 text-gray-500'
                    }`}
                  >
                    {p.r ?? '—'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </SectionCard>
  );
}

// ------------------------------------------------------------------ planificación de coincidentes

function PlanCoincidentes({
  hoja,
  buscarInicial,
  plan,
  planSinServidor,
  sup,
  puntos,
  onCambio,
}: {
  hoja: string;
  /** Suministro a buscar al llegar con «?s=» (enlace desde otra página) */
  buscarInicial?: string;
  plan: PlanItem[];
  planSinServidor: boolean;
  sup: SupervisadaApp[];
  puntos: GpsPointExtended[];
  onCambio: (texto: string, ok: boolean) => void;
}) {
  const [q, setQ] = useState(buscarInicial ?? '');
  useEffect(() => {
    if (buscarInicial) setQ(buscarInicial);
  }, [buscarInicial]);
  // Con listas largas se empieza por «Solo marcados» (nadie tiene que recorrer 1.000 filas)
  const [soloMarcadosElegido, setSoloMarcados] = useState<boolean | null>(null);
  const soloMarcados = soloMarcadosElegido ?? plan.length > 50;
  const [pag, setPag] = useState(0);
  const [guardando, setGuardando] = useState<string | null>(null);
  // Cambios ya confirmados por el servidor (la relectura trae el mismo valor)
  const [local, setLocal] = useState<Record<string, boolean>>({});
  // Propuesta al azar pendiente de confirmar (suministros)
  const [propuesta, setPropuesta] = useState<string[] | null>(null);

  const tipos = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const s of sup) {
      const k = normSuministro(s.punto.suministro);
      m.set(k, (m.get(k) ?? new Set()).add(s.tipo));
    }
    return m;
  }, [sup]);
  const marcado = (p: PlanItem) => local[p.suministro] ?? p.coincidente;
  const nMarcados = plan.filter(marcado).length;
  // Cantidad que pide ELSE (el contrato dice «aproximadamente 10 %»; la cifra exacta la define ELSE)
  const sugerido = Math.max(1, Math.ceil(plan.length * 0.1));
  const [pedido, setPedido] = useState<string>('');
  const meta = Math.max(1, Number.parseInt(pedido, 10) || sugerido);
  const con2A = plan.filter((p) => marcado(p) && tipos.get(normSuministro(p.suministro))?.has('2A')).length;

  const t = q.trim();
  // Al buscar se busca en toda la programación, aunque esté activo «Solo marcados»
  const lista = plan.filter((p) =>
    t ? p.suministro.includes(t) || p.tecnico.toLowerCase().includes(t.toLowerCase()) : !soloMarcados || marcado(p),
  );
  useEffect(() => setPag(0), [q, soloMarcados]);
  const paginas = Math.max(1, Math.ceil(lista.length / PLAN_POR_PAGINA));
  const filas = lista.slice(pag * PLAN_POR_PAGINA, (pag + 1) * PLAN_POR_PAGINA);

  // ------------------------------------------------ propuesta del 10 %
  const libres = plan.filter((p) => !marcado(p));
  const faltan = Math.max(0, meta - nMarcados);
  const porPlan = useMemo(() => new Map(plan.map((p) => [p.suministro, p])), [plan]);

  /**
   * Elige al azar los que faltan para el 10 % entre los no marcados, repartidos en la semana:
   * se ordenan por fecha programada (al azar dentro de cada día) y se toman a intervalos iguales.
   */
  const proponer = () => {
    const n = Math.min(libres.length, Math.max(1, faltan));
    if (!n) return;
    const orden = libres
      .map((p) => ({ p, f: parseFecha(p.fechaProgramada)?.getTime() ?? 0, r: Math.random() }))
      .sort((a, b) => a.f - b.f || a.r - b.r);
    const paso = orden.length / n;
    const inicio = Math.random() * paso;
    setPropuesta(
      Array.from(
        { length: n },
        (_, i) => orden[Math.min(orden.length - 1, Math.floor(inicio + i * paso))].p.suministro,
      ),
    );
  };

  const confirmarPropuesta = async () => {
    if (!propuesta?.length) return;
    setGuardando('propuesta');
    try {
      // Un solo pedido con todos los suministros
      const r = await marcarCoincidente(hoja, propuesta, true);
      if (r.success) {
        setLocal((prev) => ({ ...prev, ...Object.fromEntries(propuesta.map((x) => [x, true])) }));
        onCambio(`${propuesta.length} suministro(s) marcados como coincidentes.`, true);
        setPropuesta(null);
      } else onCambio(r.message || 'El servidor rechazó el cambio.', false);
    } finally {
      setGuardando(null);
    }
  };

  const alternar = async (p: PlanItem) => {
    const valor = !marcado(p);
    setGuardando(p.suministro);
    try {
      const r = await marcarCoincidente(hoja, [p.suministro], valor);
      if (r.success) {
        setLocal((prev) => ({ ...prev, [p.suministro]: valor }));
        onCambio(`${p.suministro} ${valor ? 'marcado' : 'desmarcado'} como coincidente.`, true);
      } else onCambio(r.message || 'El servidor rechazó el cambio.', false);
    } finally {
      setGuardando(null);
    }
  };

  return (
    <SectionCard
      title="Planificar coincidentes"
      icon={<ListChecks size={16} />}
      bodyClassName="p-4 space-y-3"
      actions={
        plan.length > 0 && (
          <span className="text-xs text-gray-500">
            <b className={nMarcados >= meta ? 'text-green-700' : 'text-amber-700'}>{nMarcados}</b> de ~{meta}{' '}
            {pedido ? '(pedido por ELSE)' : '(10 %)'} · {con2A} ya con 2A
          </span>
        )
      }
    >
      {!plan.length ? (
        <p className="text-sm text-gray-500">
          {planSinServidor
            ? 'El servidor todavía no tiene la programación (acción «getPlanJornada»). Llega con la próxima versión del Apps Script.'
            : puntos.length
              ? 'Esta jornada no tiene suministros programados en la hoja.'
              : 'Sin datos de la jornada.'}
        </p>
      ) : (
        <>
          <p className="text-xs text-gray-500">
            Marca los suministros que TELCOM supervisará en coincidente (≈10 % de la programación). El técnico los ve
            como 2A en la app.
          </p>

          {propuesta ? (
            <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <Sparkles size={15} className="text-amber-500" /> Propuesta: {propuesta.length} suministro
                  {propuesta.length === 1 ? '' : 's'} al azar, repartidos por fecha programada
                </p>
                <p className="mt-0.5 text-xs text-amber-700">
                  La elección es de TELCOM (contrato): revisa antes de confirmar. Puedes quitar los que no quieras.
                </p>
              </div>
              <ul className="grid max-h-64 gap-1.5 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                {propuesta.map((sum) => {
                  const p = porPlan.get(sum);
                  return (
                    <li
                      key={sum}
                      className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5"
                    >
                      <span className="min-w-0">
                        <b className="block text-sm tabular-nums text-gray-900">{sum}</b>
                        <span className="block text-[11px] text-gray-500">
                          {p?.fechaProgramada || 'sin fecha'}
                          {p?.tecnico ? ` · ${p.tecnico}` : ''}
                        </span>
                      </span>
                      <button
                        onClick={() => setPropuesta((l) => (l && l.length > 1 ? l.filter((x) => x !== sum) : null))}
                        disabled={guardando !== null}
                        className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                        aria-label={`Quitar ${sum} de la propuesta`}
                        title="Quitar de la propuesta"
                      >
                        <X size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button className={ui.btnPrimary} onClick={confirmarPropuesta} disabled={guardando !== null}>
                  {guardando === 'propuesta' ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  Confirmar marcar {propuesta.length}
                </button>
                <button className={ui.btnSecondary} onClick={proponer} disabled={guardando !== null}>
                  <Shuffle size={15} /> Otra propuesta
                </button>
                <button className={ui.btnSecondary} onClick={() => setPropuesta(null)} disabled={guardando !== null}>
                  <X size={15} /> Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5">
              <button
                className={ui.btnPrimary}
                onClick={proponer}
                disabled={guardando !== null || !libres.length || faltan === 0}
              >
                <Sparkles size={15} /> Proponer {pedido ? meta : 'el 10 %'}
              </button>
              <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-gray-500">
                Cantidad que pidió ELSE
                <input
                  type="number"
                  min={1}
                  max={plan.length || undefined}
                  inputMode="numeric"
                  value={pedido}
                  placeholder={String(sugerido)}
                  onChange={(e) => setPedido(e.target.value.replace(/[^0-9]/g, ''))}
                  className={`${ui.input} w-20 py-1 text-xs`}
                  title="Déjalo vacío para usar el 10 % de lo programado"
                />
              </label>
              <span className="text-xs text-gray-500">
                {faltan === 0
                  ? `Meta cumplida (${nMarcados} marcados).`
                  : `Elige al azar ${faltan} suministro${faltan === 1 ? '' : 's'} sin marcar para completar ~${meta}. Nada se guarda hasta que confirmes.`}
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <label className="relative w-full sm:w-64">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar suministro o técnico"
                className={`${ui.input} pl-9`}
              />
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                className="accent-blue-600"
                checked={soloMarcados}
                disabled={!!t}
                onChange={(e) => setSoloMarcados(e.target.checked)}
              />
              Solo marcados
            </label>
            <span className="ml-auto text-xs text-gray-500">
              {t
                ? `${lista.length} de ${plan.length} programados`
                : soloMarcados
                  ? `${lista.length} marcados de ${plan.length} programados`
                  : `${lista.length} programados`}
            </span>
          </div>
          <div className={ui.tableWrap}>
            <table className="w-full">
              <thead>
                <tr className={ui.theadRow}>
                  <th className={ui.th}>Coincidente</th>
                  <th className={ui.th}>Suministro</th>
                  <th className={ui.th}>Fecha programada</th>
                  <th className={ui.th}>Técnico</th>
                  <th className={ui.th}>Formulario</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((p) => {
                  const t = tipos.get(normSuministro(p.suministro));
                  const on = marcado(p);
                  return (
                    <tr key={p.suministro} id={`plan-${p.suministro}`} className={ui.tbodyRow}>
                      <td className={ui.td}>
                        <label className="inline-flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            className="accent-amber-500"
                            checked={on}
                            disabled={guardando !== null}
                            onChange={() => alternar(p)}
                            aria-label={`Coincidente ${p.suministro}`}
                          />
                          {guardando === p.suministro && <Loader2 size={13} className="animate-spin" />}
                        </label>
                      </td>
                      <td className={`${ui.td} font-semibold tabular-nums text-gray-900`}>{p.suministro}</td>
                      <td className={`${ui.td} tabular-nums`}>{p.fechaProgramada || '—'}</td>
                      <td className={`${ui.td} max-w-[180px] truncate`}>{p.tecnico || '—'}</td>
                      <td className={ui.td}>
                        <div className="flex flex-wrap gap-1">
                          {t?.has('2A') && <Badge tone="amber">2A hecho</Badge>}
                          {t?.has('1A') && <Badge tone="blue">1A</Badge>}
                          {on && !t?.has('2A') && <Badge tone="yellow">2A pendiente</Badge>}
                          {!t && !on && <span className="text-xs text-gray-400">—</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!filas.length && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-sm text-gray-500">
                      {t
                        ? `Ningún suministro programado coincide con «${t}».`
                        : 'Todavía no hay coincidentes marcados. Usa «Proponer el 10 %» o desmarca «Solo marcados» para elegir a mano.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {paginas > 1 && (
              <div className="flex items-center justify-between border-t border-gray-200 px-4 py-2 text-xs text-gray-500">
                <span>
                  Página {pag + 1} de {paginas}
                </span>
                <span className="flex gap-2">
                  <button className={ui.btnSecondary} disabled={pag === 0} onClick={() => setPag((x) => x - 1)}>
                    Anterior
                  </button>
                  <button
                    className={ui.btnSecondary}
                    disabled={pag + 1 >= paginas}
                    onClick={() => setPag((x) => x + 1)}
                  >
                    Siguiente
                  </button>
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </SectionCard>
  );
}
