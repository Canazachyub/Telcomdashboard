import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  GpsPoint,
  GpsPointExtended,
  Sheet,
  PointsStats,
  ExtendedStats
} from '../types/point';
import {
  getAllPoints,
  getAllPointsExtended,
  getSheets,
  getStats,
  calculateStats,
  calculateStatsFromExtended,
  getUniqueTecnicos,
  getUniqueDistritos,
  filterByTecnico,
  filterByDistrito,
  filterByStatus,
  searchBySuministro
} from '../services/pointsService';
import { useAuthStore } from './authStore';
import { filterJornadaSheets, isJornadaSheet, pickDefaultJornada } from '../utils/sheets';

// Identificador de la ultima solicitud de carga, para descartar respuestas viejas
// cuando el usuario cambia de jornada rapidamente.
let loadRequestId = 0;

interface Filters {
  tecnico: string;
  distrito: string;
  status: string;
  search: string;
}

interface PointsState {
  // Datos legacy (compatibilidad)
  points: GpsPoint[];
  sheets: Sheet[];
  selectedSheet: string | null;
  stats: PointsStats;

  // Datos extendidos (v2.0)
  pointsExtended: GpsPointExtended[];
  extendedStats: ExtendedStats | null;
  sheetStructure: 'legacy' | 'extended';

  // Filtros
  filters: Filters;
  filteredPoints: GpsPointExtended[];

  // Listas únicas para filtros
  tecnicos: string[];
  distritos: string[];

  // Estado UI
  isLoading: boolean;
  error: string | null;
  lastUpdated: string | null;

  // Acciones
  loadSheets: () => Promise<void>;
  loadPoints: (sheetName: string) => Promise<void>;
  loadPointsExtended: (sheetName: string) => Promise<void>;
  setSelectedSheet: (sheetName: string) => void;
  refreshPoints: () => Promise<void>;

  // Acciones de filtros
  setFilter: (key: keyof Filters, value: string) => void;
  resetFilters: () => void;
  applyFilters: () => void;
}

const emptyStats: PointsStats = {
  total: 0,
  pendientes: 0,
  enProceso: 0,
  completados: 0,
  porcentaje: 0,
};

const defaultFilters: Filters = {
  tecnico: 'Todos',
  distrito: 'Todos',
  status: 'todos',
  search: '',
};

export const usePointsStore = create<PointsState>()(
  persist(
  (set, get) => ({
  // Estado inicial
  points: [],
  sheets: [],
  selectedSheet: null,
  stats: emptyStats,

  pointsExtended: [],
  extendedStats: null,
  sheetStructure: 'legacy',

  filters: { ...defaultFilters },
  filteredPoints: [],

  tecnicos: [],
  distritos: [],

  isLoading: false,
  error: null,
  lastUpdated: null,

  // Cargar hojas disponibles (solo jornadas reales, sin hojas de sistema)
  loadSheets: async () => {
    set({ isLoading: true, error: null });
    try {
      const allSheets = await getSheets();
      const sheets = filterJornadaSheets(Array.isArray(allSheets) ? allSheets : []);
      set({ sheets, isLoading: false });

      // Mantener la jornada persistida si sigue existiendo; si no, la mas reciente
      const current = get().selectedSheet;
      const currentIsValid = !!current && isJornadaSheet(current) && sheets.some(s => s.name === current);
      const target = currentIsValid ? current : pickDefaultJornada(sheets);

      if (target) {
        set({ selectedSheet: target });
        await get().loadPointsExtended(target);
      } else {
        set({ selectedSheet: null });
      }
    } catch {
      set({
        error: 'Error cargando hojas',
        isLoading: false
      });
    }
  },

  // Cargar puntos legacy (compatibilidad)
  loadPoints: async (sheetName: string) => {
    const requestId = ++loadRequestId;
    set({ isLoading: true, error: null });
    try {
      const points = await getAllPoints(sheetName);
      if (requestId !== loadRequestId) return; // respuesta obsoleta
      const stats = calculateStats(points);
      // Los datos legacy no tienen estructura extendida: limpiar datos de la hoja anterior
      set({
        points,
        stats,
        pointsExtended: [],
        filteredPoints: [],
        extendedStats: null,
        sheetStructure: 'legacy',
        tecnicos: [],
        distritos: [],
        selectedSheet: sheetName,
        isLoading: false,
        lastUpdated: new Date().toISOString()
      });
    } catch {
      if (requestId !== loadRequestId) return;
      set({
        points: [],
        pointsExtended: [],
        filteredPoints: [],
        extendedStats: null,
        tecnicos: [],
        distritos: [],
        stats: emptyStats,
        error: 'Error cargando puntos',
        isLoading: false
      });
    }
  },

  // Cargar puntos extendidos (v2.0)
  loadPointsExtended: async (sheetName: string) => {
    const requestId = ++loadRequestId;
    set({ isLoading: true, error: null });
    try {
      // Cargar puntos extendidos y estadísticas en paralelo
      const [pointsResponse, statsResponse] = await Promise.all([
        getAllPointsExtended(sheetName),
        getStats(sheetName)
      ]);

      // Si el usuario ya cambio de jornada, descartar esta respuesta
      if (requestId !== loadRequestId) return;

      if (pointsResponse && pointsResponse.success && Array.isArray(pointsResponse.points)) {
        const pointsExtended = pointsResponse.points;
        const stats = calculateStatsFromExtended(pointsExtended);
        const tecnicos = getUniqueTecnicos(pointsExtended);
        const distritos = getUniqueDistritos(pointsExtended);

        // Verificar si el usuario es TECNICO para auto-filtrar
        const authState = useAuthStore.getState();
        const user = authState.user;
        const isTecnico = user?.rol?.toUpperCase() === 'TECNICO';

        // Si es TECNICO, establecer filtro por su nombre
        const initialFilters = isTecnico && user?.nombre
          ? { ...defaultFilters, tecnico: user.nombre }
          : { ...defaultFilters };

        set({
          pointsExtended,
          filteredPoints: pointsExtended,
          stats,
          extendedStats: statsResponse,
          sheetStructure: pointsResponse.structure,
          selectedSheet: sheetName,
          tecnicos,
          distritos,
          isLoading: false,
          lastUpdated: new Date().toISOString(),
          filters: initialFilters
        });

        // Aplicar filtros si es TECNICO
        if (isTecnico && user?.nombre) {
          get().applyFilters();
        }
      } else {
        // Fallback a legacy si falla
        await get().loadPoints(sheetName);
      }
    } catch (error) {
      if (requestId !== loadRequestId) return;
      console.error('Error cargando puntos extendidos:', error);
      // Fallback a legacy
      await get().loadPoints(sheetName);
    }
  },

  // Cambiar hoja seleccionada
  setSelectedSheet: (sheetName: string) => {
    set({ selectedSheet: sheetName });
    get().loadPointsExtended(sheetName);
  },

  // Refrescar puntos actuales
  refreshPoints: async () => {
    const { selectedSheet } = get();
    if (selectedSheet) {
      await get().loadPointsExtended(selectedSheet);
    }
  },

  // Establecer un filtro
  setFilter: (key: keyof Filters, value: string) => {
    // Bloquear cambio de técnico si el usuario es TECNICO
    if (key === 'tecnico') {
      const authState = useAuthStore.getState();
      const user = authState.user;
      const isTecnico = user?.rol?.toUpperCase() === 'TECNICO';
      if (isTecnico) {
        return; // TECNICO no puede cambiar su filtro de técnico
      }
    }

    set((state) => ({
      filters: { ...state.filters, [key]: value }
    }));
    get().applyFilters();
  },

  // Resetear todos los filtros
  resetFilters: () => {
    // Mantener filtro de técnico si el usuario es TECNICO
    const authState = useAuthStore.getState();
    const user = authState.user;
    const isTecnico = user?.rol?.toUpperCase() === 'TECNICO';

    const resetFilters = isTecnico && user?.nombre
      ? { ...defaultFilters, tecnico: user.nombre }
      : { ...defaultFilters };

    set({ filters: resetFilters });
    get().applyFilters();
  },

  // Aplicar filtros a los puntos
  applyFilters: () => {
    const { pointsExtended, filters } = get();
    let filtered = [...pointsExtended];

    // Filtrar por técnico
    if (filters.tecnico && filters.tecnico !== 'Todos') {
      filtered = filterByTecnico(filtered, filters.tecnico);
    }

    // Filtrar por distrito
    if (filters.distrito && filters.distrito !== 'Todos') {
      filtered = filterByDistrito(filtered, filters.distrito);
    }

    // Filtrar por estado
    if (filters.status && filters.status !== 'todos') {
      filtered = filterByStatus(filtered, filters.status);
    }

    // Filtrar por búsqueda
    if (filters.search) {
      filtered = searchBySuministro(filtered, filters.search);
    }

    // Recalcular estadísticas de puntos filtrados
    const stats = calculateStatsFromExtended(filtered);

    set({ filteredPoints: filtered, stats });
  },
  }),
  {
    name: 'telcom-points-storage',
    // Solo se persiste la jornada seleccionada (los datos se recargan del API)
    partialize: (state) => ({ selectedSheet: state.selectedSheet }),
  }
  )
);

// Selectores para componentes
export const useFilteredPoints = () => usePointsStore((state) => state.filteredPoints);
export const useStats = () => usePointsStore((state) => state.stats);
export const useExtendedStats = () => usePointsStore((state) => state.extendedStats);
export const useFilters = () => usePointsStore((state) => state.filters);
export const useTecnicos = () => usePointsStore((state) => state.tecnicos);
export const useDistritos = () => usePointsStore((state) => state.distritos);
export const useSheetStructure = () => usePointsStore((state) => state.sheetStructure);

// Helper para verificar si el usuario actual es TECNICO
export const useIsTecnico = () => {
  const user = useAuthStore((state) => state.user);
  return user?.rol?.toUpperCase() === 'TECNICO';
};
