// Estado de las casillas «Incluir Formato 1A / 2A» de la exportación de anexos:
// lee los formularios de la app para la jornada, recuerda la elección en este navegador y
// arma las supervisiones para los suministros que se exportan. Los números SP / SC no dependen de
// lo exportado: son los fijos del servidor o, si faltan, provisionales sobre TODA la jornada.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GpsPointExtended } from '../../types/point';
import {
  getFormatos,
  aSupervisadas,
  normSuministro,
  numerarJornada,
  ultimosFormatos,
  type FormatoServidor,
} from '../../services/formatosService';
import type { Supervisada } from '../../utils/pdfFormatos';
import { usePointsStore } from '../../stores/pointsStore';
import { guardarAnexarF4, leerAnexarF4 } from '../../utils/formatosConAnexo';

export type EstadoFormatos = 'sinJornada' | 'cargando' | 'listo' | 'sinServidor' | 'error';

export interface IncluirElegido {
  f1A: boolean;
  f2A: boolean;
  /** Evidencias de los NO y registro fotográfico adicional (páginas desde la 2). */
  fotos: boolean;
  /** Formato 4 de cada suministro dentro del PDF del 1A/2A (se recuerda aparte: telcom-anexar-f4). */
  anexarF4: boolean;
}

const CLAVE = 'telcom-incluir-formatos';

function leerElegido(): IncluirElegido {
  try {
    const j = JSON.parse(localStorage.getItem(CLAVE) || '{}') as Partial<IncluirElegido>;
    return { f1A: j.f1A === true, f2A: j.f2A === true, fotos: j.fotos !== false, anexarF4: leerAnexarF4() };
  } catch {
    return { f1A: false, f2A: false, fotos: true, anexarF4: leerAnexarF4() };
  }
}

/** Un suministro de la exportación y el N° de muestra que lleva en su Formato 4. */
export interface ItemExportado {
  point: GpsPointExtended;
  muestra: number;
}

/** `activo`: solo se consulta al servidor cuando hace falta (p. ej. al abrir la ventana de exportar). */
export function useIncluirFormatos(hoja: string | null, activo: boolean) {
  const todos = usePointsStore((st) => st.pointsExtended);
  const [elegido, setElegido] = useState<IncluirElegido>(leerElegido);
  const [simulado, setSimulado] = useState(false);
  const [datos, setDatos] = useState<{
    hoja: string;
    estado: EstadoFormatos;
    formatos: FormatoServidor[];
    mensaje?: string;
  }>({ hoja: '', estado: 'sinJornada', formatos: [] });
  const [recarga, setRecarga] = useState(0);

  // Recordar la elección en este navegador
  useEffect(() => {
    try {
      const { anexarF4, ...resto } = elegido;
      localStorage.setItem(CLAVE, JSON.stringify(resto));
      guardarAnexarF4(anexarF4);
    } catch {
      /* sin almacenamiento: queda solo en memoria */
    }
  }, [elegido]);

  // Leer los formularios de la jornada: una vez por jornada (o al reintentar). Solo vale la
  // respuesta del último pedido, así un cambio de jornada a medio camino no mezcla datos.
  const pedido = useRef({ clave: '', id: 0 });
  useEffect(() => {
    const clave = `${hoja}#${recarga}`;
    if (!hoja || !activo || pedido.current.clave === clave) return;
    const id = pedido.current.id + 1;
    pedido.current = { clave, id };
    getFormatos(hoja).then((r) => {
      if (pedido.current.id !== id) return;
      if (r.sinInstalar) setDatos({ hoja, estado: 'sinServidor', formatos: [] });
      else if (!r.success) setDatos({ hoja, estado: 'error', formatos: [], mensaje: r.message });
      else setDatos({ hoja, estado: 'listo', formatos: r.formatos });
    });
  }, [hoja, activo, recarga]);
  // Al cerrar la ventana se olvida el pedido: al abrirla otra vez se relee (pueden haber llegado
  // formularios nuevos). Mientras tanto se siguen mostrando los últimos datos.
  useEffect(() => {
    if (!activo) pedido.current.clave = '';
  }, [activo]);

  const estado: EstadoFormatos = !hoja ? 'sinJornada' : datos.hoja === hoja ? datos.estado : 'cargando';
  const formatos = useMemo(
    // Uno por suministro y tipo (los reenvíos no cuentan doble)
    () => (datos.hoja === hoja && estado === 'listo' ? ultimosFormatos(datos.formatos) : []),
    [datos, hoja, estado],
  );
  const n1A = formatos.filter((f) => f.tipo === '1A').length;
  const n2A = formatos.filter((f) => f.tipo === '2A').length;
  // Respuestas simuladas: solo en desarrollo y solo si no hay formularios reales
  const puedeSimular = import.meta.env.DEV && estado !== 'cargando' && formatos.length === 0;
  const usarSimulado = puedeSimular && simulado;

  const disponible1A = n1A > 0 || usarSimulado;
  const disponible2A = n2A > 0 || usarSimulado;
  // Formularios sin número fijo (el PDF lleva uno provisional)
  const provisionales = usarSimulado ? n1A + n2A || 1 : formatos.filter((f) => !String(f.reporte ?? '').trim()).length;
  const incluir: IncluirElegido = {
    f1A: elegido.f1A && disponible1A,
    f2A: elegido.f2A && disponible2A,
    fotos: elegido.fotos,
    anexarF4: elegido.anexarF4,
  };

  /** Suministros que no tienen ningún formulario de la app (para el aviso). */
  const sinFormulario = useCallback(
    (puntos: GpsPointExtended[]) => {
      if (usarSimulado) return puntos.filter((p) => !p.photoLinks?.length).map((p) => String(p.suministro));
      const con = new Set(formatos.map((f) => normSuministro(f.suministro)));
      return puntos.filter((p) => !con.has(normSuministro(p.suministro))).map((p) => String(p.suministro));
    },
    [formatos, usarSimulado],
  );

  /**
   * Supervisiones de los suministros exportados, numeradas sobre toda la jornada.
   * 2A: solo los exportados. 1A: el reporte SP completo de cada exportado (un SP es un documento
   * de hasta 10 muestras y no cambia según el filtro). N° de muestra: el del Formato 4 de esta
   * exportación; las muestras del bloque que no se exportan llevan su N° de la hoja.
   */
  const prepararSupervisadas = useCallback(
    async (items: ItemExportado[]): Promise<Supervisada[]> => {
      const muestras = new Map(items.map((it) => [normSuministro(it.point.suministro), it.muestra]));
      const muestraDe = (p: GpsPointExtended) => muestras.get(normSuministro(p.suministro)) ?? p.numero ?? 0;
      const puntos = todos.length ? todos : items.map((it) => it.point);
      let lista: Supervisada[];
      if (usarSimulado) {
        // Solo en desarrollo: el prototipo inventa las respuestas (el PDF lo dice en el pie)
        const { simular } = await import('../../prototipo/formatos');
        lista = simular(puntos).map((s) => ({ ...s, muestra: muestraDe(s.punto) }));
      } else {
        lista = numerarJornada(aSupervisadas(formatos, puntos, muestraDe));
      }
      const exportado = (s: Supervisada) => muestras.has(normSuministro(s.punto.suministro));
      const bloques = new Set(lista.filter((s) => s.tipo === '1A' && exportado(s)).map((s) => s.reporte));
      return lista.filter((s) => (s.tipo === '2A' ? exportado(s) : bloques.has(s.reporte)));
    },
    [formatos, usarSimulado, todos],
  );

  return {
    estado,
    mensaje: datos.mensaje,
    n1A,
    n2A,
    provisionales,
    elegido,
    setElegido,
    incluir,
    disponible1A,
    disponible2A,
    puedeSimular,
    simulado: usarSimulado,
    setSimulado,
    reintentar: () => {
      if (!hoja) return;
      setDatos({ hoja, estado: 'cargando', formatos: [] });
      setRecarga((n) => n + 1);
    },
    sinFormulario,
    prepararSupervisadas,
  };
}

export type IncluirFormatosControl = ReturnType<typeof useIncluirFormatos>;
