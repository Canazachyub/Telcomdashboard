// Tipos para el modulo de Inventario

export interface InventoryRecord {
  numero: number;
  fecha: string;
  hora: string;
  tipo: InventoryTipo;
  categoria: string;
  descripcion: string;
  cantidad: number;
  persona: string;
  dni: string;
  estado: string;
  observaciones: string;
  fotoLink: string;
}

export type InventoryTipo = 'INGRESO' | 'SALIDA' | 'DEVOL';

export interface InventorySheet {
  name: string;
  recordCount: number;
}

export interface InventoryFilters {
  search: string;
  tipo: InventoryTipo | 'todos';
  categoria: string;
  persona: string;
}

export interface InventoryApiResponse {
  success: boolean;
  message: string;
  data?: {
    sheetName: string;
    totalRecords: number;
    records: InventoryRecord[];
  };
}

export interface InventorySheetsResponse {
  success: boolean;
  message: string;
  data?: {
    sheets: InventorySheet[];
  };
}
