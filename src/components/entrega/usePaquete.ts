// Estado del armador del paquete (paso 4): qué archivos van marcados y las opciones del ZIP.
// Cada carpeta tiene un valor base (todo marcado o todo desmarcado) y las excepciones archivo por
// archivo; así los archivos que llegan después (al recargar) siguen lo que se eligió para su carpeta.
import { useMemo, useState } from 'react';
import type { ReporteItem } from '../../utils/exportarAnexos';
import type { SupervisadaApp } from '../../services/formatosService';
import { guardarAnexarF4, leerAnexarF4 } from '../../utils/formatosConAnexo';
import {
  estructuraPaquete,
  supervisadasElegidas,
  type ArchivoPaquete,
  type GrupoPaquete,
  type OpcionesPaquete,
} from './paquete';

export type OpcionesArmado = Pick<OpcionesPaquete, 'f4Fotos' | 'fotos' | 'anexarF4'>;

export function usePaquete(hoja: string, anexos: ReporteItem[], sup: SupervisadaApp[]) {
  const carpetas = useMemo(() => estructuraPaquete(hoja, anexos, sup), [hoja, anexos, sup]);

  const [op, setOpEstado] = useState<OpcionesArmado>(() => ({ f4Fotos: false, fotos: true, anexarF4: leerAnexarF4() }));
  // Anexos sueltos: null = automático hasta que se toquen. Con el Formato 4 anexado en cada 1A/2A empiezan
  // desmarcados (serían repetidos), salvo que la semana no tenga ningún 1A/2A: entonces son todo el paquete.
  const [base, setBase] = useState<Record<GrupoPaquete, boolean | null>>(() => ({
    f4: null,
    '1A': true,
    '2A': true,
  }));
  const [excepciones, setExcepciones] = useState<Set<string>>(() => new Set());

  const hay1A2A = carpetas.some((c) => c.grupo !== 'f4' && c.archivos.length > 0);
  const baseDe = (g: GrupoPaquete) => base[g] ?? !(op.anexarF4 && hay1A2A);
  const incluido = (a: ArchivoPaquete) => baseDe(a.grupo) !== excepciones.has(a.clave);
  /** Al marcar archivo por archivo, el automático queda fijo (si no, las excepciones se invertirían). */
  const fijarBase = (lista: ArchivoPaquete[]) => {
    if (base.f4 === null && lista.some((a) => a.grupo === 'f4')) setBase((b) => ({ ...b, f4: baseDe('f4') }));
  };

  const sinExcepciones = (grupo: GrupoPaquete) =>
    setExcepciones((e) => {
      const claves = new Set(carpetas.find((c) => c.grupo === grupo)?.archivos.map((a) => a.clave));
      return new Set([...e].filter((k) => !claves.has(k)));
    });

  const marcarCarpeta = (grupo: GrupoPaquete, v: boolean) => {
    setBase((b) => ({ ...b, [grupo]: v }));
    sinExcepciones(grupo);
  };

  const marcarArchivo = (a: ArchivoPaquete, v: boolean) => {
    if (incluido(a) === v) return;
    fijarBase([a]);
    setExcepciones((e) => {
      const n = new Set(e);
      if (n.has(a.clave)) n.delete(a.clave);
      else n.add(a.clave);
      return n;
    });
  };

  /** Marca o desmarca varios archivos de una vez (p. ej. los que deja ver el buscador). */
  const marcarVarios = (lista: ArchivoPaquete[], v: boolean) => {
    const cambian = lista.filter((a) => incluido(a) !== v).map((a) => a.clave);
    if (!cambian.length) return;
    fijarBase(lista);
    setExcepciones((e) => {
      const n = new Set(e);
      for (const k of cambian) {
        if (n.has(k)) n.delete(k);
        else n.add(k);
      }
      return n;
    });
  };

  const setOp = (o: Partial<OpcionesArmado>) => {
    const nuevo = { ...op, ...o };
    if (nuevo.anexarF4 !== op.anexarF4) {
      guardarAnexarF4(nuevo.anexarF4);
      // Anexado: los sueltos se quitan para no repetirlos. Sin anexar: si no quedaba ninguno suelto,
      // vuelven todos (si no, el paquete se quedaría sin Formato 4).
      const f4 = carpetas.find((c) => c.grupo === 'f4')!.archivos;
      if (nuevo.anexarF4) marcarCarpeta('f4', false);
      else if (!f4.some(incluido)) marcarCarpeta('f4', true);
    }
    setOpEstado(nuevo);
  };

  const elegidos = carpetas.map((c) => c.archivos.filter(incluido));
  const [sp, sc, f4] = [
    elegidos[carpetas.findIndex((c) => c.grupo === '1A')],
    elegidos[carpetas.findIndex((c) => c.grupo === '2A')],
    elegidos[carpetas.findIndex((c) => c.grupo === 'f4')],
  ];
  // Archivos de igual nombre en la carpeta del Formato 4 quedan como uno solo en el ZIP
  const n4 = new Set(f4.map((a) => a.nombre)).size;
  const supSel = supervisadasElegidas(sup, new Set([...sp, ...sc].map((a) => a.clave)));

  return {
    carpetas,
    op,
    setOp,
    incluido,
    marcarCarpeta,
    marcarArchivo,
    marcarVarios,
    n4,
    n1A: sp.length,
    n2A: sc.length,
    total: n4 + sp.length + sc.length,
    /** Archivos 1A/2A marcados con número provisional. */
    provisionales: [...sp, ...sc].filter((a) => a.provisional).length,
    anexosSel: f4.map((a) => a.anexo!).filter(Boolean),
    supSel,
  };
}

export type Paquete = ReturnType<typeof usePaquete>;
