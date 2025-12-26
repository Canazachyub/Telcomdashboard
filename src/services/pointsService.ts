import axios from 'axios';
import { API_POINTS } from '../config/api';
import type {
  GpsPoint,
  GpsPointExtended,
  Sheet,
  PointsStats,
  ExtendedStats,
  AllPointsExtendedResponse,
  SheetMetadataResponse
} from '../types/point';

// ========== ENDPOINTS LEGACY (App Móvil) ==========

// Obtener todas las hojas disponibles
export async function getSheets(): Promise<Sheet[]> {
  try {
    const response = await axios.get(`${API_POINTS}?action=getSheets`);
    return response.data || [];
  } catch (error) {
    console.error('Error obteniendo hojas:', error);
    return [];
  }
}

// Obtener todos los puntos de una hoja (legacy)
export async function getAllPoints(sheetName: string): Promise<GpsPoint[]> {
  try {
    const response = await axios.get(`${API_POINTS}?action=getAllPoints&sheetName=${encodeURIComponent(sheetName)}`);
    return response.data || [];
  } catch (error) {
    console.error('Error obteniendo puntos:', error);
    return [];
  }
}

// Obtener suministros de una hoja
export async function getSuministros(sheetName: string): Promise<string[]> {
  try {
    const response = await axios.get(`${API_POINTS}?action=getSuministros&sheetName=${encodeURIComponent(sheetName)}`);
    return response.data || [];
  } catch (error) {
    console.error('Error obteniendo suministros:', error);
    return [];
  }
}

// Obtener historial de fotos
export async function getHistory(sheetName: string, suministro?: string): Promise<any[]> {
  try {
    let url = `${API_POINTS}?action=getHistory&sheetName=${encodeURIComponent(sheetName)}`;
    if (suministro) {
      url += `&suministro=${encodeURIComponent(suministro)}`;
    }
    const response = await axios.get(url);
    return response.data || [];
  } catch (error) {
    console.error('Error obteniendo historial:', error);
    return [];
  }
}

// Probar conexión con la API
export async function testConnection(): Promise<boolean> {
  try {
    const response = await axios.get(`${API_POINTS}?action=test`);
    return response.data?.success === true;
  } catch (error) {
    console.error('Error probando conexión:', error);
    return false;
  }
}

// ========== ENDPOINTS v2.0 (Dashboard - Estructura Extendida) ==========

// Obtener todos los puntos con estructura extendida (33 columnas)
export async function getAllPointsExtended(sheetName: string): Promise<AllPointsExtendedResponse> {
  try {
    const response = await axios.get(`${API_POINTS}?action=getAllPointsExtended&sheetName=${encodeURIComponent(sheetName)}`);
    return response.data;
  } catch (error) {
    console.error('Error obteniendo puntos extendidos:', error);
    return {
      success: false,
      points: [],
      structure: 'legacy',
      totalCount: 0,
      sheetName: sheetName
    };
  }
}

// Obtener estadísticas del API (por técnico, distrito, etc.)
export async function getStats(sheetName: string): Promise<ExtendedStats | null> {
  try {
    const response = await axios.get(`${API_POINTS}?action=getStats&sheetName=${encodeURIComponent(sheetName)}`);
    return response.data;
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    return null;
  }
}

// Obtener metadata de todas las hojas
export async function getSheetMetadata(): Promise<SheetMetadataResponse | null> {
  try {
    const response = await axios.get(`${API_POINTS}?action=getSheetMetadata`);
    return response.data;
  } catch (error) {
    console.error('Error obteniendo metadata de hojas:', error);
    return null;
  }
}

// ========== FUNCIONES DE CÁLCULO LOCAL ==========

// Calcular estadísticas de los puntos (local)
export function calculateStats(points: GpsPoint[]): PointsStats {
  const total = points.length;
  const completados = points.filter(p => p.synced && p.hasPhoto).length;
  const enProceso = points.filter(p => p.hasPhoto && !p.synced).length;
  const pendientes = points.filter(p => !p.hasPhoto).length;
  const porcentaje = total > 0 ? (completados / total) * 100 : 0;

  return {
    total,
    pendientes,
    enProceso,
    completados,
    porcentaje: Math.round(porcentaje * 100) / 100,
  };
}

// Calcular estadísticas desde puntos extendidos
export function calculateStatsFromExtended(points: GpsPointExtended[]): PointsStats {
  const total = points.length;
  const completados = points.filter(p => p.status === 'completado').length;
  const enProceso = points.filter(p => p.status === 'en_proceso').length;
  const pendientes = points.filter(p => p.status === 'pendiente').length;
  const porcentaje = total > 0 ? (completados / total) * 100 : 0;

  return {
    total,
    pendientes,
    enProceso,
    completados,
    porcentaje: Math.round(porcentaje * 100) / 100,
  };
}

// Agrupar puntos por técnico
export function groupByTecnico(points: GpsPointExtended[]): Record<string, GpsPointExtended[]> {
  const grouped: Record<string, GpsPointExtended[]> = {};

  points.forEach(point => {
    const tecnico = point.tecnico || 'Sin asignar';
    if (!grouped[tecnico]) {
      grouped[tecnico] = [];
    }
    grouped[tecnico].push(point);
  });

  return grouped;
}

// Agrupar puntos por distrito
export function groupByDistrito(points: GpsPointExtended[]): Record<string, GpsPointExtended[]> {
  const grouped: Record<string, GpsPointExtended[]> = {};

  points.forEach(point => {
    const distrito = point.distrito || 'Sin distrito';
    if (!grouped[distrito]) {
      grouped[distrito] = [];
    }
    grouped[distrito].push(point);
  });

  return grouped;
}

// Filtrar puntos por técnico
export function filterByTecnico(points: GpsPointExtended[], tecnico: string): GpsPointExtended[] {
  if (!tecnico || tecnico === 'Todos') {
    return points;
  }
  return points.filter(p => p.tecnico === tecnico);
}

// Filtrar puntos por distrito
export function filterByDistrito(points: GpsPointExtended[], distrito: string): GpsPointExtended[] {
  if (!distrito || distrito === 'Todos') {
    return points;
  }
  return points.filter(p => p.distrito === distrito);
}

// Filtrar puntos por estado
export function filterByStatus(points: GpsPointExtended[], status: string): GpsPointExtended[] {
  if (!status || status === 'todos') {
    return points;
  }
  return points.filter(p => p.status === status);
}

// Obtener lista única de técnicos
export function getUniqueTecnicos(points: GpsPointExtended[]): string[] {
  const tecnicos = new Set<string>();
  points.forEach(p => {
    if (p.tecnico) {
      tecnicos.add(p.tecnico);
    }
  });
  return Array.from(tecnicos).sort();
}

// Obtener lista única de distritos
export function getUniqueDistritos(points: GpsPointExtended[]): string[] {
  const distritos = new Set<string>();
  points.forEach(p => {
    if (p.distrito) {
      distritos.add(p.distrito);
    }
  });
  return Array.from(distritos).sort();
}

// Buscar puntos por suministro (parcial)
export function searchBySuministro(points: GpsPointExtended[], query: string): GpsPointExtended[] {
  if (!query) {
    return points;
  }
  const lowerQuery = query.toLowerCase();
  return points.filter(p =>
    p.suministro.toLowerCase().includes(lowerQuery) ||
    (p.clienteNombre && p.clienteNombre.toLowerCase().includes(lowerQuery)) ||
    (p.direccion && p.direccion.toLowerCase().includes(lowerQuery))
  );
}
