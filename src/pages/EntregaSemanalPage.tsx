// Entrega semanal: un espacio de trabajo para armar el ZIP que se entrega a ELSE sin equivocarse.
// Arriba, una barra con la semana y su plazo, los chequeos como chips (abren el cajón de revisión) y
// «Asignar números» si quedan provisionales. Debajo, el armador: opciones, árbol del ZIP y vista previa,
// con la barra de descarga fija abajo.
// Lo único que impide la descarga final son los números provisionales (salvo «borrador»); lo demás son
// avisos que se pueden saltar a conciencia con «Entregar igual».
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hash, Loader2, Package, X } from 'lucide-react';
import { usePointsStore } from '../stores/pointsStore';
import { ui } from '../components/ui';
import { useEntrega } from '../components/entrega/useEntrega';
import { chequeos, nombreSemana, nombreZip, plazoDe, revisar, type ClaveChequeo } from '../components/entrega/revision';
import { armarPaquete, descargar, type Progreso } from '../components/entrega/paquete';
import { usePaquete } from '../components/entrega/usePaquete';
import { ArmadorPaquete, BarraDescarga, type Motivo } from '../components/entrega/ArmadorPaquete';
import { BarraEntrega } from '../components/entrega/BarraEntrega';
import { CajonRevision, type Respuesta } from '../components/entrega/CajonRevision';
import { asignarNumeros, marcarAvisado, type SupervisadaApp } from '../services/formatosService';
import { bloques1A } from '../utils/pdfFormatos';

const fmt = (n: number) => n.toLocaleString('es-PE');
const plural = (n: number, uno: string, varios: string) => `${fmt(n)} ${n === 1 ? uno : varios}`;

export default function EntregaSemanalPage() {
  const selectedSheet = usePointsStore((s) => s.selectedSheet);
  const hoja = selectedSheet ?? '';
  // key: al cambiar de semana todo lo marcado vuelve a empezar
  return <EntregaDeSemana key={hoja} hoja={hoja} />;
}

/** Ajusta la altura del espacio de trabajo al alto libre de la ventana (en pantallas grandes). */
function useAltoVentana() {
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const ajustar = () => {
      const main = el.closest('main');
      const pie = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
      const arriba = el.getBoundingClientRect().top + window.scrollY;
      el.style.setProperty('--alto', `${Math.max(576, Math.floor(window.innerHeight - arriba - pie))}px`);
    };
    ajustar();
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, []);
  return raiz;
}

function EntregaDeSemana({ hoja }: { hoja: string }) {
  const navigate = useNavigate();
  const raiz = useAltoVentana();
  const { pointsExtended, isLoading } = usePointsStore();
  const puntos = useMemo(() => (hoja ? pointsExtended : []), [hoja, pointsExtended]);
  const { estado, mensaje, planSinServidor, plan, anexos, sup, recargar } = useEntrega(hoja, puntos);

  const rev = useMemo(() => revisar(sup, plan, puntos), [sup, plan, puntos]);
  const plazo = useMemo(() => plazoDe(plan, puntos), [plan, puntos]);
  const bloques = useMemo(() => bloques1A(sup) as [string, SupervisadaApp[]][], [sup]);
  const coincidentes = useMemo(
    () => sup.filter((s) => s.tipo === '2A').sort((a, b) => a.reporte.localeCompare(b.reporte)),
    [sup],
  );

  const [entregarIgual, setEntregarIgual] = useState(false);
  const [borrador, setBorrador] = useState(false);

  const cargando = !!hoja && (estado === 'cargando' || (isLoading && !pointsExtended.length));
  const hayFormularios = sup.length > 0;
  const conDatos = estado === 'listo';

  // ---------------------------------------------------------------- revisión (chips + cajón)
  const checks = chequeos(rev, { conDatos, hayFormularios });
  const avisos = checks.filter((i) => i.estado === 'aviso').length;
  const [cajon, setCajon] = useState<{ foco: ClaveChequeo | null; entregarIgual?: boolean } | null>(null);

  // ---------------------------------------------------------------- acciones de escritura
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [respuestas, setRespuestas] = useState<Record<string, Respuesta>>({});
  const [confirmar, setConfirmar] = useState(false);
  const puedeAsignar = rev.provisionales.length > 0 && ocupado === null && conDatos;

  const avisar = async (s: SupervisadaApp) => {
    setOcupado(`avisado-${s.id}`);
    const r = await marcarAvisado(hoja, s.id, true);
    setOcupado(null);
    setRespuestas((m) => ({
      ...m,
      [`avisado-${s.id}`]: r.success
        ? { ok: true, texto: 'Aviso registrado.' }
        : { ok: false, texto: r.message || 'El servidor rechazó la acción.' },
    }));
    if (r.success) recargar();
  };

  const numerar = async () => {
    setConfirmar(false);
    setOcupado('numeros');
    const r = await asignarNumeros(hoja);
    setOcupado(null);
    setRespuestas((m) => ({
      ...m,
      numeros: r.success
        ? {
            ok: true,
            texto: `Números asignados: ${plural(Number(r.sp ?? 0), 'reporte SP', 'reportes SP')} y ${plural(
              Number(r.sc ?? 0),
              'reporte SC',
              'reportes SC',
            )}. Ya son definitivos.`,
          }
        : { ok: false, texto: r.message || 'El servidor rechazó la acción.' },
    }));
    if (r.success) recargar();
  };

  // ---------------------------------------------------------------- paquete
  // Lo que va en el ZIP, archivo por archivo, y sus opciones (ver usePaquete)
  const paq = usePaquete(hoja, anexos, sup);
  const [progreso, setProgreso] = useState<Progreso | null>(null);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const generando = progreso !== null;

  const f1A = paq.n1A > 0;
  const f2A = paq.n2A > 0;
  const f4 = paq.n4 > 0;
  const motivos: Motivo[] = [];
  if (cargando) motivos.push({ texto: 'Espera a que terminen de cargar los datos de la semana.' });
  if (!cargando && !paq.total) motivos.push({ texto: 'Marca al menos un archivo en la lista.' });
  if (paq.provisionales && !borrador)
    motivos.push({
      texto: `${plural(paq.provisionales, 'archivo lleva', 'archivos llevan')} número provisional.`,
      acciones: [
        {
          texto: 'Asignar números',
          onClick: () => (puedeAsignar ? setConfirmar(true) : setCajon({ foco: 'numeros' })),
        },
        { texto: 'o bajar como borrador', onClick: () => setBorrador(true) },
      ],
    });
  if (avisos && !entregarIgual && !borrador)
    motivos.push({
      texto: `${avisos === 1 ? 'Queda 1 punto ámbar' : `Quedan ${fmt(avisos)} puntos ámbar`} sin revisar.`,
      acciones: [{ texto: 'Revisar y «Entregar igual»', onClick: () => setCajon({ foco: null, entregarIgual: true }) }],
    });
  const esBorrador = borrador && paq.provisionales > 0;
  const zipNombre = nombreZip(hoja, esBorrador);
  const puedeDescargar = !motivos.length && !generando;

  const generar = async () => {
    setResultado(null);
    setProgreso({ pct: 0, texto: 'Preparando…' });
    try {
      // Solo lo marcado: anexos elegidos y formularios de los reportes elegidos (mismos generadores)
      const r = await armarPaquete(hoja, paq.anexosSel, paq.supSel, { ...paq.op, f4, f1A, f2A }, setProgreso);
      descargar(r.blob, zipNombre);
      const partes: string[] = [];
      if (f4)
        partes.push(`Formato 4: ${fmt(r.anexos)} anexos${r.erroresAnexos ? ` (${r.erroresAnexos} con error)` : ''}`);
      if (f1A) partes.push(`Formato 1A: ${plural(r.n1A, 'reporte SP', 'reportes SP')}`);
      if (f2A) partes.push(`Formato 2A: ${plural(r.n2A, 'reporte SC', 'reportes SC')}`);
      if (r.errorFormatos) partes.push(`No se pudieron generar los 1A / 2A: ${r.errorFormatos}`);
      setResultado({
        ok: !r.erroresAnexos && !r.errorFormatos,
        texto: `Descargado «${zipNombre}». ${partes.join(' · ')}.`,
      });
    } catch (e) {
      setResultado({ ok: false, texto: `No se pudo armar el paquete: ${(e as Error).message}` });
    } finally {
      setProgreso(null);
    }
  };

  // Mientras se arma el ZIP, avisar antes de cerrar o recargar la pestaña
  useEffect(() => {
    if (!generando) return;
    const antes = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', antes);
    return () => window.removeEventListener('beforeunload', antes);
  }, [generando]);

  const irA = (ruta: string) => navigate(ruta);
  const aFormatos = (s?: string) => irA(s ? `/formatos?s=${encodeURIComponent(s)}` : '/formatos');

  return (
    <div
      ref={raiz}
      className="flex min-w-0 flex-col gap-3 max-lg:pb-40 lg:h-[var(--alto,calc(100dvh-8rem))] lg:min-h-[36rem]"
    >
      <BarraEntrega
        hoja={hoja}
        plazo={plazo}
        checks={checks}
        cargando={cargando}
        onChip={(c) => setCajon({ foco: c })}
        entregarIgual={entregarIgual}
        avisos={avisos}
        provisionales={rev.provisionales.length}
        puedeAsignar={puedeAsignar}
        asignando={ocupado === 'numeros'}
        onAsignar={() => setConfirmar(true)}
        onRecargar={recargar}
      >
        {!cargando && (
          <EstadoServidor estado={estado} mensaje={mensaje} hayFormularios={hayFormularios} recargar={recargar} />
        )}
        {respuestas.numeros && (
          <Linea tono={respuestas.numeros.ok ? 'green' : 'red'}>
            <span className="min-w-0 flex-1">{respuestas.numeros.texto}</span>
            <button
              type="button"
              onClick={() =>
                setRespuestas((m) => {
                  const resto = { ...m };
                  delete resto.numeros;
                  return resto;
                })
              }
              className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
              aria-label="Cerrar el mensaje"
            >
              <X size={14} />
            </button>
          </Linea>
        )}
      </BarraEntrega>

      {hoja && (
        <>
          {cargando ? (
            <div className="flex min-h-[20rem] flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white">
              <Loader2 size={28} className="animate-spin text-electric" />
              <p className="text-sm text-gray-600">Leyendo los formularios y la programación de la semana…</p>
            </div>
          ) : (
            <ArmadorPaquete
              hoja={hoja}
              paq={paq}
              zipNombre={zipNombre}
              generando={generando}
              borrador={borrador}
              setBorrador={setBorrador}
            />
          )}
          <BarraDescarga
            paq={paq}
            motivos={motivos}
            puedeDescargar={puedeDescargar}
            generando={generando}
            progreso={progreso}
            onDescargar={generar}
            resultado={resultado}
            onCerrarResultado={() => setResultado(null)}
          />
        </>
      )}

      {cajon && (
        <CajonRevision
          foco={cajon.foco}
          enfocarEntregarIgual={cajon.entregarIgual}
          onCerrar={() => setCajon(null)}
          checks={checks}
          rev={rev}
          conDatos={conDatos}
          hayFormularios={hayFormularios}
          planSinServidor={planSinServidor}
          supervisados={sup.length}
          avisos={avisos}
          entregarIgual={entregarIgual}
          setEntregarIgual={setEntregarIgual}
          ocupado={ocupado}
          respuestas={respuestas}
          onAvisar={avisar}
          onAsignar={() => setConfirmar(true)}
          bloques={bloques}
          coincidentes={coincidentes}
          irA={irA}
          aFormatos={aFormatos}
        />
      )}

      {confirmar && (
        <ConfirmarNumeros
          hoja={hoja}
          n={rev.provisionales.length}
          onCancelar={() => setConfirmar(false)}
          onAceptar={numerar}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ piezas

function EstadoServidor({
  estado,
  mensaje,
  hayFormularios,
  recargar,
}: {
  estado: string;
  mensaje?: string;
  hayFormularios: boolean;
  recargar: () => void;
}) {
  if (estado === 'sinServidor')
    return (
      <Linea tono="amber">
        El servidor todavía no tiene los formularios 1A / 2A («Acción no reconocida»). Hay que desplegar la nueva
        versión del Apps Script. Mientras tanto puedes descargar solo el Formato 4.
      </Linea>
    );
  if (estado === 'error')
    return (
      <Linea tono="red">
        <span>
          {mensaje || 'No se pudieron leer los formularios.'}{' '}
          <button type="button" className="font-semibold underline" onClick={recargar}>
            Reintentar
          </button>
        </span>
      </Linea>
    );
  if (estado === 'listo' && !hayFormularios)
    return (
      <Linea tono="amber">
        Todavía no llegó ningún formulario 1A / 2A de esta semana. Los técnicos los envían desde la app (TELCOM
        Operaciones) al sincronizar.
      </Linea>
    );
  return null;
}

function Linea({ tono, children }: { tono: 'amber' | 'red' | 'green'; children: ReactNode }) {
  const c = {
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    red: 'border-red-200 bg-red-50 text-red-800',
    green: 'border-green-200 bg-green-50 text-green-800',
  }[tono];
  return (
    <div
      role={tono === 'green' ? 'status' : 'alert'}
      className={`flex items-start gap-2 border-t px-4 py-2 text-sm last:rounded-b-2xl ${c}`}
    >
      {children}
    </div>
  );
}

function ConfirmarNumeros({
  hoja,
  n,
  onCancelar,
  onAceptar,
}: {
  hoja: string;
  n: number;
  onCancelar: () => void;
  onAceptar: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmar-numeros"
    >
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
        <h3 id="confirmar-numeros" className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <Package size={20} className="text-electric" />
          ¿Asignar los números ahora?
        </h3>
        <div className="mt-3 space-y-2 text-sm text-gray-700">
          <p>
            Se numeran {plural(n, 'formulario', 'formularios')} de <b>{nombreSemana(hoja).corto}</b>.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Los números quedan <b>fijos para siempre</b>: no cambian aunque después lleguen más formularios.
            </li>
            <li>
              Los contadores SP y SC son <b>de todo el año</b>: un número usado no se puede volver a usar.
            </li>
            <li>Los formularios que ya tienen número no se tocan.</li>
          </ul>
          <p>Hazlo cuando ya llegaron todos los formularios de la semana.</p>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className={ui.btnSecondary} onClick={onCancelar} autoFocus>
            Cancelar
          </button>
          <button type="button" className={ui.btnPrimary} onClick={onAceptar}>
            <Hash size={16} />
            Sí, asignar números
          </button>
        </div>
      </div>
    </div>
  );
}
