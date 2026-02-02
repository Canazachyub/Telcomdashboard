// ==========================================
// Store de GPS (Zustand) - Rastreo basado en Fotos
// ==========================================

import { create } from 'zustand';
import type {
  GPSStats,
  GPSFilters,
  GPSEntity,
  ODTTecnico,
  ODTStats,
} from '../types/gps';
import { odtToEntity } from '../types/gps';
import { getTrackingFromPhotos } from '../services/gpsService';

interface GPSState {
  // Datos ODT (técnicos)
  tecnicos: ODTTecnico[];
  odtStats: ODTStats;

  // Entidades para el mapa (compatibilidad)
  entities: GPSEntity[];
  filteredEntities: GPSEntity[];

  // Estadísticas legacy (para compatibilidad con GPSPanel)
  stats: GPSStats;

  // Entidad seleccionada
  selectedEntity: GPSEntity | null;

  // Filtros
  filters: GPSFilters;

  // Estado UI
  isLoading: boolean;
  error: string | null;
  lastUpdated: string | null;

  // Acciones
  loadTracking: () => Promise<void>;
  setFilter: (key: keyof GPSFilters, value: boolean | string) => void;
  resetFilters: () => void;
  selectEntity: (entity: GPSEntity | null) => void;
  applyFilters: () => void;
}

const defaultFilters: GPSFilters = {
  showPersonal: true,
  showVehiculos: false, // No hay vehículos en este sistema
  onlyOnline: false,
  search: '',
};

const emptyStats: GPSStats = {
  totalPersonal: 0,
  personalOnline: 0,
  personalOffline: 0,
  totalVehiculos: 0,
  vehiculosOnline: 0,
  vehiculosOffline: 0,
};

const emptyODTStats: ODTStats = {
  total: 0,
  online: 0,
  offline: 0,
  conUbicacion: 0,
  sinUbicacion: 0,
};

export const useGPSStore = create<GPSState>((set, get) => ({
  // Estado inicial
  tecnicos: [],
  odtStats: emptyODTStats,
  entities: [],
  filteredEntities: [],
  stats: emptyStats,
  selectedEntity: null,
  filters: { ...defaultFilters },
  isLoading: false,
  error: null,
  lastUpdated: null,

  // Cargar datos de tracking desde fotos
  loadTracking: async () => {
    set({ isLoading: true, error: null });

    try {
      const response = await getTrackingFromPhotos();

      // La API devuelve tecnicos y stats directamente, no dentro de 'data'
      const responseData = response as unknown as {
        success: boolean;
        tecnicos?: ODTTecnico[];
        stats?: ODTStats;
        error?: string;
      };

      if (responseData.success && responseData.tecnicos) {
        const tecnicos = responseData.tecnicos;
        const odtStats = responseData.stats || emptyODTStats;

        // Convertir técnicos a entidades del mapa (solo los que tienen ubicación)
        const entities: GPSEntity[] = tecnicos
          .map(odtToEntity)
          .filter((e): e is GPSEntity => e !== null);

        // Convertir ODTStats a GPSStats para compatibilidad
        const stats: GPSStats = {
          totalPersonal: odtStats.total,
          personalOnline: odtStats.online,
          personalOffline: odtStats.offline,
          totalVehiculos: 0,
          vehiculosOnline: 0,
          vehiculosOffline: 0,
        };

        set({
          tecnicos,
          odtStats,
          entities,
          stats,
          isLoading: false,
          lastUpdated: new Date().toISOString(),
        });

        // Aplicar filtros
        get().applyFilters();
      } else {
        set({
          error: responseData.error || 'Error cargando datos',
          isLoading: false,
        });
      }
    } catch (error) {
      console.error('Error en loadTracking:', error);
      set({
        error: 'Error de conexión con el servidor',
        isLoading: false,
      });
    }
  },

  // Establecer un filtro
  setFilter: (key: keyof GPSFilters, value: boolean | string) => {
    set((state) => ({
      filters: { ...state.filters, [key]: value },
    }));
    get().applyFilters();
  },

  // Resetear filtros
  resetFilters: () => {
    set({ filters: { ...defaultFilters } });
    get().applyFilters();
  },

  // Seleccionar entidad
  selectEntity: (entity: GPSEntity | null) => {
    set({ selectedEntity: entity });
  },

  // Aplicar filtros a las entidades
  applyFilters: () => {
    const { entities, filters } = get();
    let filtered = [...entities];

    // Filtrar por tipo (personal siempre activo)
    if (!filters.showPersonal) {
      filtered = [];
    }

    // Filtrar solo online
    if (filters.onlyOnline) {
      filtered = filtered.filter((e) => e.estado === 'online');
    }

    // Filtrar por búsqueda
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter((e) =>
        e.nombre.toLowerCase().includes(searchLower) ||
        e.id.toLowerCase().includes(searchLower)
      );
    }

    set({ filteredEntities: filtered });
  },
}));

// ==========================================
// Selectores
// ==========================================

export const useEntities = () => useGPSStore((state) => state.filteredEntities);
export const useStats = () => useGPSStore((state) => state.stats);
export const useODTStats = () => useGPSStore((state) => state.odtStats);
export const useTecnicos = () => useGPSStore((state) => state.tecnicos);
export const useFilters = () => useGPSStore((state) => state.filters);
export const useSelectedEntity = () => useGPSStore((state) => state.selectedEntity);
export const useIsLoading = () => useGPSStore((state) => state.isLoading);
export const useLastUpdated = () => useGPSStore((state) => state.lastUpdated);
