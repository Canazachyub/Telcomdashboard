import { create } from 'zustand';
import type { InventoryRecord, InventorySheet, InventoryFilters } from '../types/inventory';
import { getInventory, getInventorySheets } from '../services/inventoryService';

interface InventoryState {
  // Data
  records: InventoryRecord[];
  sheets: InventorySheet[];
  selectedSheet: string;

  // Filters
  filters: InventoryFilters;

  // UI State
  isLoading: boolean;
  error: string | null;

  // Derived
  filteredRecords: InventoryRecord[];
  categorias: string[];
  personas: string[];

  // Actions
  loadSheets: () => Promise<void>;
  loadInventory: (sheetName: string) => Promise<void>;
  setSelectedSheet: (sheetName: string) => void;
  setFilter: <K extends keyof InventoryFilters>(key: K, value: InventoryFilters[K]) => void;
  resetFilters: () => void;
  refresh: () => Promise<void>;
}

const initialFilters: InventoryFilters = {
  search: '',
  tipo: 'todos',
  categoria: 'todos',
  persona: 'todos',
};

function filterRecords(records: InventoryRecord[], filters: InventoryFilters): InventoryRecord[] {
  return records.filter(record => {
    // Filtro por busqueda
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const matchSearch =
        record.descripcion.toLowerCase().includes(searchLower) ||
        record.persona.toLowerCase().includes(searchLower) ||
        record.dni.includes(searchLower) ||
        record.categoria.toLowerCase().includes(searchLower) ||
        record.observaciones.toLowerCase().includes(searchLower);
      if (!matchSearch) return false;
    }

    // Filtro por tipo
    if (filters.tipo !== 'todos' && record.tipo !== filters.tipo) {
      return false;
    }

    // Filtro por categoria
    if (filters.categoria !== 'todos' && record.categoria !== filters.categoria) {
      return false;
    }

    // Filtro por persona
    if (filters.persona !== 'todos' && record.persona !== filters.persona) {
      return false;
    }

    return true;
  });
}

function extractUnique(records: InventoryRecord[], key: keyof InventoryRecord): string[] {
  const values = new Set<string>();
  records.forEach(r => {
    const value = r[key];
    if (value && typeof value === 'string' && value.trim()) {
      values.add(value);
    }
  });
  return Array.from(values).sort();
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
  // Initial state
  records: [],
  sheets: [],
  selectedSheet: '',
  filters: initialFilters,
  isLoading: false,
  error: null,
  filteredRecords: [],
  categorias: [],
  personas: [],

  // Load inventory sheets
  loadSheets: async () => {
    set({ isLoading: true, error: null });
    try {
      const sheets = await getInventorySheets();
      set({ sheets, isLoading: false });

      // Auto-select first sheet if none selected
      if (sheets.length > 0 && !get().selectedSheet) {
        get().loadInventory(sheets[0].name);
      }
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Error cargando hojas'
      });
    }
  },

  // Load inventory records for a sheet
  loadInventory: async (sheetName: string) => {
    set({ isLoading: true, error: null, selectedSheet: sheetName });
    try {
      const records = await getInventory(sheetName);
      const categorias = extractUnique(records, 'categoria');
      const personas = extractUnique(records, 'persona');

      set({
        records,
        filteredRecords: filterRecords(records, get().filters),
        categorias,
        personas,
        isLoading: false
      });
    } catch (error) {
      set({
        records: [],
        filteredRecords: [],
        isLoading: false,
        error: error instanceof Error ? error.message : 'Error cargando inventario'
      });
    }
  },

  // Set selected sheet
  setSelectedSheet: (sheetName: string) => {
    set({ selectedSheet: sheetName });
    get().loadInventory(sheetName);
  },

  // Set filter
  setFilter: (key, value) => {
    const newFilters = { ...get().filters, [key]: value };
    set({
      filters: newFilters,
      filteredRecords: filterRecords(get().records, newFilters)
    });
  },

  // Reset filters
  resetFilters: () => {
    set({
      filters: initialFilters,
      filteredRecords: filterRecords(get().records, initialFilters)
    });
  },

  // Refresh current sheet
  refresh: async () => {
    const { selectedSheet } = get();
    if (selectedSheet) {
      await get().loadInventory(selectedSheet);
    } else {
      await get().loadSheets();
    }
  },
}));

// Selector hooks
export const useInventoryRecords = () => useInventoryStore(state => state.filteredRecords);
export const useInventorySheets = () => useInventoryStore(state => state.sheets);
export const useInventoryFilters = () => useInventoryStore(state => state.filters);
export const useInventoryLoading = () => useInventoryStore(state => state.isLoading);
