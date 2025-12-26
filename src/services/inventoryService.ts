import { buildPointsUrl } from './api';
import type { InventoryRecord, InventorySheet } from '../types/inventory';

/**
 * Obtiene la lista de hojas de inventario disponibles
 * Usa fetch con redirect: 'follow' para manejar redirects de Google Apps Script
 */
export async function getInventorySheets(): Promise<InventorySheet[]> {
  try {
    const url = buildPointsUrl('getInventorySheets');
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow'
    });

    const data = await response.json();

    if (data.success && data.sheets) {
      return data.sheets;
    }

    console.warn('getInventorySheets: No sheets found', data.message);
    return [];
  } catch (error) {
    console.error('Error fetching inventory sheets:', error);
    throw error;
  }
}

/**
 * Obtiene los registros de inventario de una hoja especifica
 * Usa fetch con redirect: 'follow' para manejar redirects de Google Apps Script
 */
export async function getInventory(sheetName: string): Promise<InventoryRecord[]> {
  try {
    const url = buildPointsUrl('getInventory', { sheetName });
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow'
    });

    const data = await response.json();

    if (data.success && data.records) {
      return data.records;
    }

    console.warn('getInventory: No records found', data.message);
    return [];
  } catch (error) {
    console.error('Error fetching inventory:', error);
    throw error;
  }
}

/**
 * Exporta los registros de inventario a CSV
 */
export function exportInventoryToCSV(records: InventoryRecord[], sheetName: string): void {
  const headers = ['N°', 'Fecha', 'Hora', 'Tipo', 'Categoria', 'Descripcion', 'Cantidad', 'Persona', 'DNI', 'Estado', 'Observaciones', 'Foto'];

  const escapeCSV = (value: string | number): string => {
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = records.map(r => [
    escapeCSV(r.numero),
    escapeCSV(r.fecha),
    escapeCSV(r.hora),
    escapeCSV(r.tipo),
    escapeCSV(r.categoria),
    escapeCSV(r.descripcion),
    escapeCSV(r.cantidad),
    escapeCSV(r.persona),
    escapeCSV(r.dni),
    escapeCSV(r.estado),
    escapeCSV(r.observaciones),
    escapeCSV(r.fotoLink)
  ].join(','));

  const BOM = '\uFEFF';
  const csv = BOM + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `inventario_${sheetName}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
