import { create } from 'zustand';
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

export const usePointsStore = create<PointsState>((set, get) => ({
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

  // Cargar hojas disponibles
  loadSheets: async () => {
    set({ isLoading: true, error: null });
    try {
      const sheets = await getSheets();
      set({ sheets, isLoading: false });

      // Auto-seleccionar primera hoja si no hay seleccionada
      if (sheets.length > 0 && !get().selectedSheet) {
        const firstSheet = sheets[0].name;
        set({ selectedSheet: firstSheet });
        await get().loadPointsExtended(firstSheet);
      }
    } catch (error) {
      set({
        error: 'Error cargando hojas',
        isLoading: false
      });
    }
  },

  // Cargar puntos legacy (compatibilidad)
  loadPoints: async (sheetName: string) => {
    set({ isLoading: true, error: null });
    try {
      const points = await getAllPoints(sheetName);
      const stats = calculateStats(points);
      set({
        points,
        stats,
        selectedSheet: sheetName,
        isLoading: false,
        lastUpdated: new Date().toISOString()
      });
    } catch (error) {
      set({
        error: 'Error cargando puntos',
        isLoading: false
      });
    }
  },

  // Cargar puntos extendidos (v2.0)
  loadPointsExtended: async (sheetName: string) => {
    set({ isLoading: true, error: null });
    try {
      // Cargar puntos extendidos y estadísticas en paralelo
      const [pointsResponse, statsResponse] = await Promise.all([
        getAllPointsExtended(sheetName),
        getStats(sheetName)
      ]);

      if (pointsResponse.success) {
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
}));

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
