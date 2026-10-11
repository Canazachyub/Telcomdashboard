import { buildPointsUrl } from './api';
import type { InventoryRecord, InventorySheet } from '../types/inventory';
import { downloadCsv } from '../utils/csv';

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

  const rows = records.map(r => [
    r.numero,
    r.fecha,
    r.hora,
    r.tipo,
    r.categoria,
    r.descripcion,
    r.cantidad,
    r.persona,
    r.dni,
    r.estado,
    r.observaciones,
    r.fotoLink
  ]);

  // BOM + escapado + neutralizacion de formulas en el helper compartido
  downloadCsv(`inventario_${sheetName}_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
}
