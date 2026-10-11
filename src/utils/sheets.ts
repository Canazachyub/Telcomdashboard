// Utilidades para distinguir hojas de "jornada" de las hojas de sistema
// del Spreadsheet TELCOM ENERGY (Usuarios, _ODT_Tecnicos, inventarios, observados...).

import { isObservadosSheet } from '../services/observadosService';

const INVENTORY_SHEET_PATTERN = /_INV$|INVENTARIO/i;

/**
 * Devuelve true si la hoja es una jornada de trabajo real (suministros).
 * Excluye: "Usuarios", hojas que empiezan con "_", hojas de inventario
 * y hojas OBSERVADOS (que tienen su propia pagina).
 */
export function isJornadaSheet(name: string | null | undefined): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (trimmed.toLowerCase() === 'usuarios') return false;
  if (trimmed.startsWith('_')) return false;
  if (INVENTORY_SHEET_PATTERN.test(trimmed)) return false;
  if (isObservadosSheet(trimmed)) return false;
  return true;
}

/** Filtra una lista de hojas dejando solo las jornadas reales. */
export function filterJornadaSheets<T extends { name: string }>(sheets: T[]): T[] {
  return (sheets || []).filter((s) => isJornadaSheet(s.name));
}

/**
 * Elige la jornada por defecto: la mas reciente.
 * Las hojas nuevas se agregan al final del Spreadsheet, por lo que se toma la ultima
 * jornada real en el orden devuelto por getSheets. Nunca devuelve una hoja de sistema.
 */
export function pickDefaultJornada<T extends { name: string }>(sheets: T[]): string | null {
  const jornadas = filterJornadaSheets(sheets);
  if (jornadas.length === 0) return null;
  return jornadas[jornadas.length - 1].name;
}
