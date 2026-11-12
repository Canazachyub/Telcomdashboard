// Entrega semanal: una sola pantalla con 4 pasos para armar el paquete que se entrega a ELSE sin
// equivocarse. 1) la semana  2) qué falta  3) números fijos  4) un ZIP con Formato 4, 1A y 2A.
// Lo único que impide la descarga final son los números provisionales (salvo «borrador»); lo demás
// son avisos que se pueden saltar a conciencia con «Entregar igual».
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Download, Hash, Loader2, Package, RefreshCw, Send, X } from 'lucide-react';
import { usePointsStore } from '../stores/pointsStore';
import { Badge, EmptyState, PageHeader, ui } from '../components/ui';
import { Paso, ItemRevision, type EstadoItem, type EstadoPaso } from '../components/entrega/Paso';
import { useEntrega } from '../components/entrega/useEntrega';
import { nombreSemana, nombreZip, plazoDe, revisar } from '../components/entrega/revision';
import { armarPaquete, descargar, type OpcionesPaquete, type Progreso } from '../components/entrega/paquete';
import { asignarNumeros, etiquetaReporte, marcarAvisado, type SupervisadaApp } from '../services/formatosService';
import { bloques1A } from '../utils/pdfFormatos';
import { guardarAnexarF4, leerAnexarF4 } from '../utils/formatosConAnexo';

const btnGrande = `${ui.btnPrimary} px-6 py-3 text-base`;
const btnArreglar =
  'inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 transition hover:border-electric hover:text-electric disabled:cursor-not-allowed disabled:opacity-50';
const fmt = (n: number) => n.toLocaleString('es-PE');
const plural = (n: number, uno: string, varios: string) => `${fmt(n)} ${n === 1 ? uno : varios}`;

export default function EntregaSemanalPage() {
  const selectedSheet = usePointsStore((s) => s.selectedSheet);
  const hoja = selectedSheet ?? '';
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        kicker="Supervisión · paquete para ELSE"
        title="Entrega semanal"
        icon={<Send size={22} />}
        subtitle="Cuatro pasos, en orden. Cada paso te dice qué falta y dónde arreglarlo."
      />
      {/* key: al cambiar de semana todo lo marcado vuelve a empezar */}
      <EntregaDeSemana key={hoja} hoja={hoja} />
    </div>
  );
}

function EntregaDeSemana({ hoja }: { hoja: string }) {
  const navigate = useNavigate();
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
  const [descargado, setDescargado] = useState<string | null>(null);

  const cargando = !!hoja && (estado === 'cargando' || (isLoading && !pointsExtended.length));
  const hayFormularios = sup.length > 0;
  const conDatos = estado === 'listo';

  // ---------------------------------------------------------------- revisión (paso 2)
  const items: { clave: string; estado: EstadoItem }[] = [
    {
      clave: 'programados',
      estado: !conDatos || !rev.programados ? 'na' : rev.faltanSupervisar.length ? 'aviso' : 'ok',
    },
    {
      clave: 'fotos',
      estado: !hayFormularios ? 'na' : rev.sinFotos.length || rev.sinLectura.length ? 'aviso' : 'ok',
    },
    { clave: 'avisos', estado: rev.porAvisar.length ? 'aviso' : !hayFormularios ? 'na' : 'ok' },
    {
      clave: 'coincidentes',
      estado: !hayFormularios ? 'na' : rev.coincidentes < rev.metaCoincidentes ? 'aviso' : 'ok',
    },
    { clave: 'numeros', estado: rev.provisionales.length ? 'bloquea' : !hayFormularios ? 'na' : 'ok' },
  ];
  const est = (c: string) => items.find((i) => i.clave === c)!.estado;
  const avisos = items.filter((i) => i.estado === 'aviso').length;
  const bloqueos = items.filter((i) => i.estado === 'bloquea').length;

  // ---------------------------------------------------------------- acciones de escritura
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [respuestas, setRespuestas] = useState<Record<string, { ok: boolean; texto: string }>>({});
  const [confirmar, setConfirmar] = useState(false);

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

  // ---------------------------------------------------------------- paquete (paso 4)
  // Con el Formato 4 anexado en cada 1A/2A, la carpeta Formato_4 aparte empieza desmarcada (sería repetido)
  const [op, setOpEstado] = useState<OpcionesPaquete>(() => {
    const anexarF4 = leerAnexarF4();
    return { f4: !anexarF4, f4Fotos: false, f1A: true, f2A: true, fotos: true, anexarF4 };
  });
  const setOp = (o: OpcionesPaquete) => {
    if (o.anexarF4 !== op.anexarF4) guardarAnexarF4(o.anexarF4);
    setOpEstado(o);
  };
  const [progreso, setProgreso] = useState<Progreso | null>(null);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const generando = progreso !== null;

  const f1A = op.f1A && bloques.length > 0;
  const f2A = op.f2A && coincidentes.length > 0;
  const f4 = op.f4 && anexos.length > 0;
  const motivos: ReactNode[] = [];
  if (cargando) motivos.push('Espera a que terminen de cargar los datos de la semana.');
  if (!cargando && !f4 && !f1A && !f2A) motivos.push('Marca al menos un formato que tenga documentos.');
  if (rev.provisionales.length && (f1A || f2A) && !borrador)
    motivos.push(
      <>
        Hay {plural(rev.provisionales.length, 'formulario', 'formularios')} con número provisional. Asigna los números
        en el <b>paso 3</b>, o marca «Descargar borrador».
      </>,
    );
  if (avisos && !entregarIgual && !borrador)
    motivos.push(
      <>
        {avisos === 1 ? 'Queda 1 punto' : `Quedan ${fmt(avisos)} puntos`} por revisar en el <b>paso 2</b>. Arréglalos o
        marca «Entregar igual».
      </>,
    );
  const esBorrador = borrador && rev.provisionales.length > 0 && (f1A || f2A);
  const zipNombre = nombreZip(hoja, esBorrador);
  const puedeDescargar = !motivos.length && !generando;

  const generar = async () => {
    setResultado(null);
    setProgreso({ pct: 0, texto: 'Preparando…' });
    try {
      const r = await armarPaquete(hoja, anexos, sup, { ...op, f4, f1A, f2A }, setProgreso);
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
      setDescargado(zipNombre);
    } catch (e) {
      setResultado({ ok: false, texto: `No se pudo armar el paquete: ${(e as Error).message}` });
    } finally {
      setProgreso(null);
    }
  };

  // ---------------------------------------------------------------- estados de cada paso
  const estadoPaso: EstadoPaso[] = [
    hoja ? 'hecho' : 'actual',
    !hoja || cargando ? 'pendiente' : avisos + bloqueos === 0 ? 'hecho' : 'actual',
    !hayFormularios ? 'pendiente' : rev.provisionales.length ? 'actual' : 'hecho',
    descargado ? 'hecho' : puedeDescargar && hoja ? 'actual' : 'pendiente',
  ];

  const irA = (ruta: string) => navigate(ruta);
  const aFormatos = (s?: string) => irA(s ? `/formatos?s=${encodeURIComponent(s)}` : '/formatos');

  return (
    <>
      {/* ------------------------------------------------------------ 1 */}
      <Paso n={1} titulo="Elige la semana" estado={estadoPaso[0]} ayuda="Todo lo de abajo es de esta semana.">
        <Semana hoja={hoja} plazo={plazo} />
      </Paso>

      {!hoja ? null : (
        <>
          {/* ------------------------------------------------------------ 2 */}
          <Paso
            n={2}
            titulo="Revisa lo que falta"
            estado={estadoPaso[1]}
            ayuda="Verde: listo. Ámbar: conviene arreglarlo antes de entregar. Rojo: impide la entrega final."
          >
            {cargando ? (
              <Cargando texto="Leyendo los formularios y la programación de la semana…" />
            ) : (
              <>
                <EstadoServidor estado={estado} mensaje={mensaje} hayFormularios={hayFormularios} recargar={recargar} />
                <ul className="space-y-2">
                  <ItemRevision
                    estado={est('programados')}
                    titulo="Todos los programados supervisados"
                    resumen={
                      !conDatos ? (
                        'Se revisa cuando lleguen los formularios del servidor.'
                      ) : !rev.programados ? (
                        'La semana no tiene suministros programados.'
                      ) : (
                        <>
                          {fmt(rev.programados - rev.faltanSupervisar.length)} de {fmt(rev.programados)} tienen su
                          formulario 1A o 2A
                          {rev.faltanSupervisar.length
                            ? ` · ${rev.faltanSupervisar.length === 1 ? 'falta' : 'faltan'} ${fmt(rev.faltanSupervisar.length)}`
                            : ''}
                          {!rev.planDisponible &&
                            (planSinServidor
                              ? ' (según los suministros de la hoja: el servidor aún no envía la programación)'
                              : ' (según los suministros de la hoja)')}
                        </>
                      )
                    }
                    accion={
                      conDatos &&
                      rev.faltanSupervisar.length > 0 && (
                        <button type="button" className={btnArreglar} onClick={() => irA('/mapa')}>
                          Arreglar
                        </button>
                      )
                    }
                    detalle={
                      conDatos &&
                      rev.faltanSupervisar.length > 0 && (
                        <>
                          <p className="mb-2 text-sm text-gray-600">
                            Falta que el técnico los supervise y envíe el formulario desde la app. Si alguno no tiene
                            técnico, asígnalo en el <b>Mapa</b>.
                          </p>
                          <Chips lista={rev.faltanSupervisar} />
                        </>
                      )
                    }
                  />

                  <ItemRevision
                    estado={est('fotos')}
                    titulo="Cada supervisado con su Formato 4"
                    resumen={
                      !hayFormularios ? (
                        'Sin formularios todavía.'
                      ) : (
                        <>
                          Fotos mínimas: panorámica, medidor y caja (2A: también ensayo).{' '}
                          {rev.sinFotos.length || rev.sinLectura.length
                            ? [
                                rev.sinFotos.length
                                  ? `${plural(rev.sinFotos.length, 'formulario con', 'formularios con')} fotos faltantes`
                                  : '',
                                rev.sinLectura.length ? `${fmt(rev.sinLectura.length)} sin lectura en la hoja` : '',
                              ]
                                .filter(Boolean)
                                .join(' · ')
                            : 'Todas completas.'}
                        </>
                      )
                    }
                    accion={
                      (rev.sinFotos.length > 0 || rev.sinLectura.length > 0) && (
                        <button
                          type="button"
                          className={btnArreglar}
                          onClick={() => aFormatos((rev.sinFotos[0]?.s ?? rev.sinLectura[0]).punto.suministro)}
                        >
                          Arreglar
                        </button>
                      )
                    }
                    detalle={
                      (rev.sinFotos.length > 0 || rev.sinLectura.length > 0) && (
                        <ul className="divide-y divide-gray-200 text-sm">
                          {rev.sinFotos.map(({ s, faltan }) => (
                            <FilaSuministro key={`f-${s.id}`} s={s} onAbrir={() => aFormatos(s.punto.suministro)}>
                              Falta: {faltan.join(', ')}
                            </FilaSuministro>
                          ))}
                          {rev.sinLectura.map((s) => (
                            <FilaSuministro key={`l-${s.id}`} s={s} onAbrir={() => aFormatos(s.punto.suministro)}>
                              Sin lectura en la hoja: no sale en el Formato 4
                            </FilaSuministro>
                          ))}
                        </ul>
                      )
                    }
                  />

                  <ItemRevision
                    key={`avisos-${rev.porAvisar.length > 0}`}
                    abiertoInicial={rev.porAvisar.length > 0}
                    estado={est('avisos')}
                    titulo="No conformes avisados a la contratista (24 h)"
                    resumen={
                      !rev.noConformes.length
                        ? 'No hay supervisiones no conformes.'
                        : rev.porAvisar.length
                          ? `${fmt(rev.porAvisar.length)} de ${fmt(rev.noConformes.length)} no conformes sin avisar.`
                          : `Los ${fmt(rev.noConformes.length)} no conformes ya están avisados.`
                    }
                    detalle={
                      rev.porAvisar.length > 0 && (
                        <ul className="divide-y divide-gray-200 text-sm">
                          {rev.porAvisar.map((s) => {
                            const clave = `avisado-${s.id}`;
                            const r = respuestas[clave];
                            return (
                              <FilaSuministro key={clave} s={s} onAbrir={() => aFormatos(s.punto.suministro)}>
                                <span className="block truncate" title={s.observacion}>
                                  {s.observacion || 'Sin observación escrita'}
                                </span>
                                {r && <span className={r.ok ? 'text-green-700' : 'text-red-700'}>{r.texto}</span>}
                                <button
                                  type="button"
                                  className={`${btnArreglar} mt-1`}
                                  disabled={ocupado !== null}
                                  onClick={() => avisar(s)}
                                >
                                  {ocupado === clave ? <Loader2 size={14} className="animate-spin" /> : null}
                                  Marcar como avisado
                                </button>
                              </FilaSuministro>
                            );
                          })}
                        </ul>
                      )
                    }
                  />

                  <ItemRevision
                    estado={est('coincidentes')}
                    titulo="Coincidentes: al menos el 10 % de lo supervisado"
                    resumen={
                      !hayFormularios
                        ? 'Sin formularios todavía.'
                        : `${plural(rev.coincidentes, 'coincidente', 'coincidentes')} (2A) de ${fmt(
                            sup.length,
                          )} supervisados · se necesitan al menos ${fmt(rev.metaCoincidentes)}.`
                    }
                    accion={
                      <button type="button" className={btnArreglar} onClick={() => irA('/formatos#coincidentes')}>
                        Planificar
                      </button>
                    }
                  />

                  <ItemRevision
                    estado={est('numeros')}
                    titulo="Números de reporte asignados"
                    resumen={
                      !hayFormularios
                        ? 'Sin formularios para numerar.'
                        : rev.provisionales.length
                          ? `${plural(rev.provisionales.length, 'formulario tiene', 'formularios tienen')} número provisional. Esto sí impide la entrega final.`
                          : 'Todos los formularios tienen número fijo.'
                    }
                    accion={
                      rev.provisionales.length > 0 && (
                        <button
                          type="button"
                          className={btnArreglar}
                          onClick={() => document.getElementById('paso-3')?.scrollIntoView({ behavior: 'smooth' })}
                        >
                          Arreglar
                        </button>
                      )
                    }
                  />
                </ul>

                {avisos > 0 && (
                  <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-gray-900">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-5 w-5 shrink-0 accent-amber-500"
                      checked={entregarIgual}
                      onChange={(e) => setEntregarIgual(e.target.checked)}
                    />
                    <span>
                      <b>Entregar igual.</b> Revisé{' '}
                      {avisos === 1 ? 'el punto ámbar' : `los ${fmt(avisos)} puntos ámbar`} y entrego así, sabiendo lo
                      que falta.
                    </span>
                  </label>
                )}
              </>
            )}
          </Paso>

          {/* ------------------------------------------------------------ 3 */}
          <Paso
            n={3}
            id="paso-3"
            titulo="Asigna los números"
            estado={estadoPaso[2]}
            ayuda="Los reportes SP (1A, de 10 en 10) y SC (2A, uno por suministro) llevan un número fijo del año."
          >
            {cargando ? (
              <Cargando texto="Cargando…" />
            ) : !hayFormularios ? (
              <p className="text-sm text-gray-500">Aún no hay formularios 1A / 2A que numerar en esta semana.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className={btnGrande}
                    disabled={!rev.provisionales.length || ocupado !== null || !conDatos}
                    onClick={() => setConfirmar(true)}
                  >
                    {ocupado === 'numeros' ? <Loader2 size={18} className="animate-spin" /> : <Hash size={18} />}
                    {rev.provisionales.length
                      ? `Asignar números a ${plural(rev.provisionales.length, 'formulario', 'formularios')}`
                      : 'Todos tienen número'}
                  </button>
                  {respuestas.numeros && <Mensaje ok={respuestas.numeros.ok}>{respuestas.numeros.texto}</Mensaje>}
                </div>
                <ListaNumeros bloques={bloques} coincidentes={coincidentes} />
              </div>
            )}
          </Paso>

          {/* ------------------------------------------------------------ 4 */}
          <Paso
            n={4}
            titulo="Descarga el paquete"
            estado={estadoPaso[3]}
            ayuda="Un solo ZIP con una carpeta por formato."
          >
            <div className="space-y-3">
              <Casilla
                checked={op.f4}
                disabled={generando || !anexos.length}
                onChange={(v) => setOp({ ...op, f4: v })}
                titulo={`Formato 4 · anexos (${fmt(anexos.length)})`}
                nota={
                  !anexos.length
                    ? 'No hay suministros con lectura en esta semana.'
                    : op.anexarF4 && (f1A || f2A)
                      ? 'Carpeta aparte, igual que en Reportes. Ya va dentro de cada 1A/2A: márcala solo si también la quieres suelta.'
                      : 'Carpeta aparte, igual que en Reportes.'
                }
              >
                {op.f4 && anexos.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[
                      { v: false, t: 'Sin fotos (rápido)' },
                      { v: true, t: 'Con fotos (lento)' },
                    ].map((x) => (
                      <label
                        key={x.t}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                          op.f4Fotos === x.v ? 'border-electric text-gray-900' : 'border-gray-300 text-gray-600'
                        }`}
                      >
                        <input
                          type="radio"
                          name="f4fotos"
                          className="accent-blue-600"
                          checked={op.f4Fotos === x.v}
                          disabled={generando}
                          onChange={() => setOp({ ...op, f4Fotos: x.v })}
                        />
                        {x.t}
                      </label>
                    ))}
                  </div>
                )}
              </Casilla>
              <Casilla
                checked={op.f1A}
                disabled={generando || !bloques.length}
                onChange={(v) => setOp({ ...op, f1A: v })}
                titulo={`Formato 1A · reportes SP (${fmt(bloques.length)})`}
                nota={!bloques.length ? 'Sin formularios 1A.' : undefined}
              />
              <Casilla
                checked={op.f2A}
                disabled={generando || !coincidentes.length}
                onChange={(v) => setOp({ ...op, f2A: v })}
                titulo={`Formato 2A · reportes SC (${fmt(coincidentes.length)})`}
                nota={!coincidentes.length ? 'Sin formularios 2A.' : undefined}
              />
              <Casilla
                checked={op.anexarF4}
                disabled={generando || (!f1A && !f2A)}
                onChange={(v) => setOp({ ...op, anexarF4: v, f4: v ? false : op.f4 })}
                titulo="Anexar el Formato 4 de cada suministro dentro del 1A / 2A"
                nota="Va después de la hoja del 1A/2A, con sus fotos (tarda más). Al marcarlo se desmarca la carpeta Formato 4 aparte para no repetirla."
              />
              <Casilla
                checked={op.fotos}
                disabled={generando || (!f1A && !f2A)}
                onChange={(v) => setOp({ ...op, fotos: v })}
                titulo="Incluir fotos en 1A / 2A (evidencias y registro adicional)"
                nota="Sin esto los PDF pesan menos, pero no llevan las fotos de los NO."
              />

              {rev.provisionales.length > 0 && (f1A || f2A) && (
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-gray-900">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-5 w-5 shrink-0 accent-red-500"
                    checked={borrador}
                    disabled={generando}
                    onChange={(e) => setBorrador(e.target.checked)}
                  />
                  <span>
                    <b>Descargar borrador (números provisionales).</b> Sirve para revisar, no para entregar: el archivo
                    termina en «_BORRADOR».
                  </span>
                </label>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button type="button" className={btnGrande} disabled={!puedeDescargar} onClick={generar}>
                  {generando ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                  Descargar el paquete
                </button>
                <span className="break-all font-mono text-sm text-gray-600">{zipNombre}</span>
              </div>

              {motivos.length > 0 && !generando && (
                <ul className="space-y-1 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                  <li className="font-semibold text-gray-900">Para descargar:</li>
                  {motivos.map((m, k) => (
                    <li key={k}>• {m}</li>
                  ))}
                </ul>
              )}

              {progreso && (
                <div role="status" aria-live="polite">
                  <div className="mb-1 flex justify-between text-sm text-gray-600">
                    <span className="truncate font-mono">{progreso.texto}</span>
                    <span className="font-mono">{progreso.pct}%</span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-electric transition-all duration-300"
                      style={{ width: `${progreso.pct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">No cierres ni recargues esta pestaña.</p>
                </div>
              )}
              {resultado && <Mensaje ok={resultado.ok}>{resultado.texto}</Mensaje>}
            </div>
          </Paso>
        </>
      )}

      {confirmar && (
        <ConfirmarNumeros
          hoja={hoja}
          n={rev.provisionales.length}
          onCancelar={() => setConfirmar(false)}
          onAceptar={numerar}
        />
      )}
    </>
  );
}

// ------------------------------------------------------------------ piezas

function Semana({ hoja, plazo }: { hoja: string; plazo: ReturnType<typeof plazoDe> }) {
  const { sheets, setSelectedSheet } = usePointsStore();
  const [cambiar, setCambiar] = useState(!hoja);
  // Las 8 jornadas más recientes (las hojas nuevas se agregan al final)
  const recientes = useMemo(() => {
    const r = [...sheets].reverse().slice(0, 8);
    if (hoja && !r.some((s) => s.name === hoja)) r.unshift({ name: hoja, id: -1 });
    return r;
  }, [sheets, hoja]);
  const { corto } = nombreSemana(hoja);

  return (
    <div className="space-y-3">
      {hoja ? (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <CalendarDays size={28} className="shrink-0 text-electric" />
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-bold text-gray-900">{corto}</p>
            {corto !== hoja.trim() && <p className="font-mono text-xs text-gray-500">Hoja: {hoja}</p>}
            {plazo ? (
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-700">
                <span>
                  Vence: <b>{plazo.venceTxt}</b> · 5.º día hábil
                </span>
                <Badge tone={plazo.quedan < 0 ? 'red' : plazo.quedan <= 2 ? 'amber' : 'green'}>
                  {plazo.quedan < 0
                    ? `Venció hace ${plural(-plazo.quedan, 'día hábil', 'días hábiles')}`
                    : plazo.quedan === 0
                      ? 'Vence hoy'
                      : `Quedan ${plural(plazo.quedan, 'día hábil', 'días hábiles')}`}
                </Badge>
              </p>
            ) : (
              <p className="mt-1 text-sm text-gray-500">Sin fechas programadas: no se puede calcular el plazo.</p>
            )}
          </div>
          <button type="button" className={ui.btnSecondary} onClick={() => setCambiar((v) => !v)}>
            {cambiar ? <X size={16} /> : <RefreshCw size={16} />}
            {cambiar ? 'Cerrar' : 'Cambiar semana'}
          </button>
        </div>
      ) : (
        <EmptyState
          compact
          title="Primero elige la semana"
          description="Elige la jornada que vas a entregar. Puedes cambiarla cuando quieras."
        />
      )}
      {cambiar && (
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Semanas más recientes</span>
          <select
            className={`${ui.input} py-3 text-base`}
            value={hoja}
            onChange={(e) => {
              if (e.target.value && e.target.value !== hoja) setSelectedSheet(e.target.value);
              setCambiar(false);
            }}
            autoFocus={!!hoja}
          >
            {!hoja && <option value="">— Elige una semana —</option>}
            {recientes.map((s) => (
              <option key={s.name} value={s.name}>
                {nombreSemana(s.name).corto}
                {nombreSemana(s.name).corto !== s.name.trim() ? `  (${s.name.trim()})` : ''}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-gray-500">
            ¿No está? Elige cualquier jornada en el selector de arriba y vuelve aquí.
          </span>
        </label>
      )}
    </div>
  );
}

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
      <Aviso tono="amber">
        El servidor todavía no tiene los formularios 1A / 2A («Acción no reconocida»). Hay que desplegar la nueva
        versión del Apps Script. Mientras tanto puedes descargar solo el Formato 4.
      </Aviso>
    );
  if (estado === 'error')
    return (
      <Aviso tono="red">
        {mensaje || 'No se pudieron leer los formularios.'}{' '}
        <button type="button" className="font-semibold underline" onClick={recargar}>
          Reintentar
        </button>
      </Aviso>
    );
  if (estado === 'listo' && !hayFormularios)
    return (
      <Aviso tono="amber">
        Todavía no llegó ningún formulario 1A / 2A de esta semana. Los técnicos los envían desde la app (TELCOM
        Operaciones) al sincronizar.
      </Aviso>
    );
  return null;
}

function Aviso({ tono, children }: { tono: 'amber' | 'red'; children: ReactNode }) {
  const c = tono === 'red' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800';
  return (
    <div role="alert" className={`mb-3 rounded-xl border p-3 text-sm ${c}`}>
      {children}
    </div>
  );
}

function Mensaje({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <p
      role="status"
      className={`break-words rounded-lg border px-3 py-2 text-sm [overflow-wrap:anywhere] ${
        ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'
      }`}
    >
      {children}
    </p>
  );
}

function Cargando({ texto }: { texto: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-gray-500">
      <Loader2 size={16} className="animate-spin text-electric" />
      {texto}
    </p>
  );
}

function Chips({ lista }: { lista: string[] }) {
  return (
    <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
      {lista.map((x) => (
        <span
          key={x}
          className="rounded-md border border-gray-200 bg-white px-2 py-0.5 font-mono text-xs text-gray-700"
        >
          {x}
        </span>
      ))}
    </div>
  );
}

function FilaSuministro({ s, onAbrir, children }: { s: SupervisadaApp; onAbrir: () => void; children: ReactNode }) {
  return (
    <li className="flex flex-wrap items-start gap-3 py-2">
      <Badge tone={s.tipo === '1A' ? 'blue' : 'amber'}>{s.tipo}</Badge>
      <button
        type="button"
        onClick={onAbrir}
        className="font-mono font-semibold text-gray-900 underline-offset-2 hover:text-electric hover:underline"
        title="Abrir en Formatos"
      >
        {s.punto.suministro}
      </button>
      <span className="text-gray-500">{s.tecnico}</span>
      <div className="flex min-w-[12rem] flex-1 flex-col items-start gap-1 text-gray-700">{children}</div>
    </li>
  );
}

function Casilla({
  checked,
  disabled,
  onChange,
  titulo,
  nota,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  titulo: string;
  nota?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`rounded-xl border border-gray-200 p-3 ${disabled && !checked ? 'opacity-60' : ''}`}>
      <label className={`flex items-start gap-3 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 shrink-0 accent-blue-600"
          checked={checked && !(disabled && !checked)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>
          <span className="block font-semibold text-gray-900">{titulo}</span>
          {nota && <span className="block text-xs text-gray-500">{nota}</span>}
        </span>
      </label>
      {children}
    </div>
  );
}

function ListaNumeros({
  bloques,
  coincidentes,
}: {
  bloques: [string, SupervisadaApp[]][];
  coincidentes: SupervisadaApp[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-gray-200 p-3">
        <p className="mb-2 text-sm font-semibold text-gray-900">Formato 1A · reportes SP</p>
        {bloques.length ? (
          <ul className="space-y-1 text-sm">
            {bloques.map(([num, b]) => (
              <li key={num} className="flex items-center justify-between gap-2">
                <span className="font-mono text-gray-900">
                  {etiquetaReporte({ reporte: num, provisional: b[0]?.provisional })}
                </span>
                <span className="text-gray-500">{plural(b.length, 'muestra', 'muestras')}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">Sin formularios 1A.</p>
        )}
      </div>
      <div className="rounded-xl border border-gray-200 p-3">
        <p className="mb-2 text-sm font-semibold text-gray-900">Formato 2A · reportes SC</p>
        {coincidentes.length ? (
          <ul className="space-y-1 text-sm">
            {coincidentes.map((s) => (
              <li key={s.id || s.punto.suministro} className="flex items-center justify-between gap-2">
                <span className="font-mono text-gray-900">{etiquetaReporte(s)}</span>
                <span className="font-mono text-gray-500">{s.punto.suministro}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">Sin formularios 2A.</p>
        )}
      </div>
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
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
