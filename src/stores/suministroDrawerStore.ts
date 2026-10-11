import { create } from 'zustand';
import type { GpsPoint, GpsPointExtended } from '../types/point';

// Ficha de suministro abierta desde cualquier página (Dashboard, Suministros, Mapa, Cruce…)
interface DrawerState {
  point: GpsPointExtended | null;
  jornada: string | null;
  /** Si es true, la ficha busca el historial en todas las jornadas al abrirse */
  autoBuscar: boolean;
  open: (point: GpsPoint | GpsPointExtended, jornada: string | null, opts?: { autoBuscar?: boolean }) => void;
  close: () => void;
}

export const useSuministroDrawer = create<DrawerState>((set) => ({
  point: null,
  jornada: null,
  autoBuscar: false,
  open: (point, jornada, opts) =>
    set({ point: point as GpsPointExtended, jornada, autoBuscar: !!opts?.autoBuscar }),
  close: () => set({ point: null, jornada: null, autoBuscar: false }),
}));
