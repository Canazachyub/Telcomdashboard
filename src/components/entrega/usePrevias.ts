// Vistas previas del armador con caché: cada PDF se arma una sola vez por archivo + opciones, así que
// volver a uno ya visto es instantáneo. Las URL blob se liberan al cambiar las opciones (las que ya no
// corresponden), al pasar del límite y al salir de la página. La que está a la vista nunca se suelta.
import { useEffect, useRef, useState } from 'react';
import { armarArchivo, type ArchivoPaquete, type GrupoPaquete, type PdfArmado } from './paquete';
import type { OpcionesArmado } from './usePaquete';

/** Cuántos PDF se guardan como máximo (con fotos pesan varios MB cada uno). */
const MAX = 24;

/** Firma de las opciones que cambian el PDF de un archivo. */
export const firmaDe = (grupo: GrupoPaquete, o: OpcionesArmado) =>
  grupo === 'f4' ? `f4:${o.f4Fotos}` : `fa:${o.fotos}:${o.anexarF4}`;

export interface Previa extends PdfArmado {
  clave: string;
  nombre: string;
  grupo: GrupoPaquete;
  firma: string;
}

const llave = (clave: string, firma: string) => `${clave}|${firma}`;

export function usePrevias(hoja: string, op: OpcionesArmado) {
  const cache = useRef(new Map<string, Previa>());
  const pedido = useRef(0);
  /** La página ya se cerró: lo que llegue tarde se suelta. */
  const fuera = useRef(false);
  // Últimos valores, para los pedidos que terminan después de un cambio
  const opActual = useRef(op);
  const [vista, setVista] = useState<Previa | null>(null);
  const vistaActual = useRef<Previa | null>(null);
  const [armando, setArmando] = useState<{ clave: string; nombre: string; texto: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Llaves en caché (copia para pintar el indicador «al instante»). */
  const [enCache, setEnCache] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    opActual.current = op;
  }, [op]);

  useEffect(() => {
    const m = cache.current;
    const ped = pedido; // al salir, los pedidos en curso ya no se muestran
    const sal = fuera;
    sal.current = false;
    return () => {
      ped.current++;
      sal.current = true;
      m.forEach((p) => URL.revokeObjectURL(p.url));
      m.clear();
    };
  }, []);

  const mostrar = (p: Previa | null) => {
    vistaActual.current = p;
    setVista(p);
  };

  /** Suelta lo que ya no sirve con las opciones `o` y lo que pasa del límite (nunca la que se ve). */
  const purgar = (o: OpcionesArmado = opActual.current) => {
    const m = cache.current;
    const v = vistaActual.current;
    const fija = v ? llave(v.clave, v.firma) : null;
    for (const [k, p] of [...m]) {
      if (k !== fija && p.firma !== firmaDe(p.grupo, o)) {
        URL.revokeObjectURL(p.url);
        m.delete(k);
      }
    }
    // El Map guarda el orden de uso: lo primero es lo más viejo
    for (const [k, p] of [...m]) {
      if (m.size <= MAX) break;
      if (k === fija) continue;
      URL.revokeObjectURL(p.url);
      m.delete(k);
    }
    setEnCache(new Set(m.keys()));
  };

  const tieneCache = (a: ArchivoPaquete) => enCache.has(llave(a.clave, firmaDe(a.grupo, op)));

  /** Muestra un archivo: de la caché si ya se armó con estas opciones; si no, lo arma. */
  const ver = async (a: ArchivoPaquete) => {
    const firma = firmaDe(a.grupo, op);
    const k = llave(a.clave, firma);
    const m = cache.current;
    const hit = m.get(k);
    if (hit) {
      pedido.current++;
      setArmando(null);
      setError(null);
      m.delete(k);
      m.set(k, hit); // recién usada
      mostrar(hit);
      purgar();
      return;
    }
    const n = ++pedido.current;
    setError(null);
    setArmando({ clave: a.clave, nombre: a.nombre, texto: 'Preparando…' });
    try {
      const r = await armarArchivo(a, hoja, op, (texto) => {
        if (pedido.current === n) setArmando({ clave: a.clave, nombre: a.nombre, texto });
      });
      const p: Previa = { ...r, clave: a.clave, nombre: a.nombre, grupo: a.grupo, firma };
      if (pedido.current === n) {
        const antes = m.get(k);
        if (antes && antes !== vistaActual.current) URL.revokeObjectURL(antes.url);
        m.delete(k);
        m.set(k, p);
        mostrar(p);
      } else if (firma === firmaDe(a.grupo, opActual.current) && !m.has(k) && !fuera.current) {
        // Llegó tarde (ya se pidió otro), pero sirve si vuelve a este archivo
        m.set(k, p);
      } else {
        URL.revokeObjectURL(p.url);
      }
      purgar();
    } catch (e) {
      if (pedido.current === n) setError(`No se pudo armar «${a.nombre}»: ${(e as Error).message || 'error'}`);
    } finally {
      if (pedido.current === n) setArmando(null);
    }
  };

  return { vista, armando, error, ver, tieneCache, purgar };
}

export type Previas = ReturnType<typeof usePrevias>;
