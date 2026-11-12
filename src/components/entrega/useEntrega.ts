// Datos de «Entrega semanal»: formularios 1A / 2A (getFormatos) y programación (getPlanJornada) de la
// jornada elegida, más los anexos del Formato 4 y las supervisiones numeradas. Solo lectura.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  aSupervisadas,
  getFormatos,
  getPlanJornada,
  normSuministro,
  numerarJornada,
  type FormatoServidor,
  type PlanItem,
  type SupervisadaApp,
} from '../../services/formatosService';
import { itemsReporte } from '../../utils/exportarAnexos';
import type { GpsPointExtended } from '../../types/point';

export type EstadoDatos = 'sinJornada' | 'cargando' | 'listo' | 'sinServidor' | 'error';

interface Datos {
  hoja: string;
  estado: EstadoDatos;
  formatos: FormatoServidor[];
  plan: PlanItem[];
  planSinServidor: boolean;
  mensaje?: string;
}

export function useEntrega(hoja: string, puntos: GpsPointExtended[]) {
  const [datos, setDatos] = useState<Datos>({
    hoja: '',
    estado: 'cargando',
    formatos: [],
    plan: [],
    planSinServidor: false,
  });
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

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  const vigente = datos.hoja === hoja;
  const estado: EstadoDatos = !hoja ? 'sinJornada' : vigente ? datos.estado : 'cargando';
  const formatos = useMemo(() => (vigente ? datos.formatos : []), [datos, vigente]);
  const plan = useMemo(() => (vigente ? datos.plan : []), [datos, vigente]);

  // Anexos del Formato 4: todos los puntos con lectura de la jornada, numerados como en Reportes
  const anexos = useMemo(() => itemsReporte(puntos), [puntos]);

  // Supervisiones: el N° de muestra es el N° del anexo del Formato 4 (igual que en Reportes)
  const sup = useMemo<SupervisadaApp[]>(() => {
    const muestras = new Map(anexos.map((it) => [normSuministro(it.point.suministro), it.numero]));
    const muestraDe = (p: GpsPointExtended) => muestras.get(normSuministro(p.suministro)) ?? p.numero ?? 0;
    const l = numerarJornada(aSupervisadas(formatos, puntos, muestraDe));
    return [...l].sort((a, b) => (a.fecha?.getTime() ?? 0) - (b.fecha?.getTime() ?? 0));
  }, [formatos, puntos, anexos]);

  return {
    estado,
    mensaje: vigente ? datos.mensaje : undefined,
    planSinServidor: vigente && datos.planSinServidor,
    formatos,
    plan,
    anexos,
    sup,
    recargar,
  };
}
