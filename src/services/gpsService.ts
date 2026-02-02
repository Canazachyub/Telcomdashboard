// ==========================================
// Servicio de GPS - Comunicación con API
// ==========================================

import axios from 'axios';
import { API_GPS, API_POINTS } from '../config/api';
import type {
  GPSPersonal,
  GPSVehiculo,
  GPSHistorial,
  AllTrackingResponse,
  APIResponse,
  RegisterPersonalData,
  RegisterVehiculoData,
  UpdateLocationData,
  TrackingFromPhotosResponse,
} from '../types/gps';

// Instancia de Axios configurada
const api = axios.create({
  timeout: 30000, // 30 segundos
});

// ==========================================
// ENDPOINTS GET
// ==========================================

/**
 * Probar conexión con la API
 */
export async function testConnection(): Promise<boolean> {
  try {
    const response = await api.get(`${API_GPS}?action=test`);
    return response.data?.success === true;
  } catch (error) {
    console.error('Error probando conexión:', error);
    return false;
  }
}

/**
 * Obtener todo el tracking (personal + vehículos) - API GPS externa
 */
export async function getAllTracking(): Promise<AllTrackingResponse> {
  try {
    const response = await api.get(`${API_GPS}?action=getAllTracking`);
    return response.data;
  } catch (error) {
    console.error('Error obteniendo tracking:', error);
    return { success: false, error: 'Error de conexión' };
  }
}

/**
 * Obtener tracking de técnicos basado en sus últimas fotos (ODT)
 * Usa la API de la app móvil (timestamp_camera)
 */
export async function getTrackingFromPhotos(): Promise<TrackingFromPhotosResponse> {
  try {
    const response = await api.get(`${API_POINTS}?action=getTrackingFromPhotos`);
    return response.data;
  } catch (error) {
    console.error('Error obteniendo tracking desde fotos:', error);
    return { success: false, error: 'Error de conexión' };
  }
}

/**
 * Obtener todo el personal
 */
export async function getPersonal(): Promise<APIResponse<GPSPersonal[]>> {
  try {
    const response = await api.get(`${API_GPS}?action=getPersonal`);
    return response.data;
  } catch (error) {
    console.error('Error obteniendo personal:', error);
    return { success: false, error: 'Error de conexión' };
  }
}

/**
 * Obtener todos los vehículos
 */
export async function getVehiculos(): Promise<APIResponse<GPSVehiculo[]>> {
  try {
    const response = await api.get(`${API_GPS}?action=getVehiculos`);
    return response.data;
  } catch (error) {
    console.error('Error obteniendo vehículos:', error);
    return { success: false, error: 'Error de conexión' };
  }
}

/**
 * Obtener personal por ID
 */
export async function getPersonalById(id: string): Promise<APIResponse<GPSPersonal>> {
  try {
    const response = await api.get(`${API_GPS}?action=getPersonalById&id=${encodeURIComponent(id)}`);
    return response.data;
  } catch (error) {
    console.error('Error obteniendo personal:', error);
    return { success: false, error: 'Error de conexión' };
  }
}

/**
 * Obtener vehículo por ID
 */
export async function getVehiculoById(id: string): Promise<APIResponse<GPSVehiculo>> {
  try {
    const response = await api.get(`${API_GPS}?action=getVehiculoById&id=${encodeURIComponent(id)}`);
    return response.data;
  } catch (error) {
    console.error('Error obteniendo vehículo:', error);
    return { success: false, error: 'Error de conexión' };
  }
}

/**
 * Obtener historial de ubicaciones
 */
export async function getHistorial(
  entityId?: string,
  tipo?: 'personal' | 'vehiculo',
  fecha?: string
): Promise<APIResponse<GPSHistorial[]>> {
  try {
    let url = `${API_GPS}?action=getHistorial`;
    if (entityId) url += `&entityId=${encodeURIComponent(entityId)}`;
    if (tipo) url += `&tipo=${tipo}`;
    if (fecha) url += `&fecha=${encodeURIComponent(fecha)}`;

    const response = await api.get(url);
    return response.data;
  } catch (error) {
    console.error('Error obteniendo historial:', error);
    return { success: false, error: 'Error de conexión' };
  }
}

// ==========================================
// ENDPOINTS POST
// ==========================================

/**
 * Actualizar ubicación (desde PWA o app)
 */
export async function updateLocation(data: UpdateLocationData): Promise<APIResponse> {
  try {
    const response = await api.post(API_GPS, {
      action: 'updateLocation',
      ...data,
    });
    return response.data;
  } catch (error) {
    console.error('Error actualizando ubicación:', error);
    return { success: false, error: 'Error de conexión' };
  }
}

/**
 * Registrar nuevo personal
 */
export async function registerPersonal(data: RegisterPersonalData): Promise<APIResponse<{ id: string; trackingUrl: string }>> {
  try {
    const response = await api.post(API_GPS, {
      action: 'registerPersonal',
      ...data,
    });
    return response.data;
  } catch (error) {
    console.error('Error registrando personal:', error);
    return { success: false, error: 'Error de conexión' };
  }
}

/**
 * Registrar nuevo vehículo
 */
export async function registerVehiculo(data: RegisterVehiculoData): Promise<APIResponse<{ id: string; placa: string }>> {
  try {
    const response = await api.post(API_GPS, {
      action: 'registerVehiculo',
      ...data,
    });
    return response.data;
  } catch (error) {
    console.error('Error registrando vehículo:', error);
    return { success: false, error: 'Error de conexión' };
  }
}

/**
 * Actualizar datos de personal
 */
export async function updatePersonal(id: string, data: Partial<RegisterPersonalData>): Promise<APIResponse> {
  try {
    const response = await api.post(API_GPS, {
      action: 'updatePersonal',
      id,
      ...data,
    });
    return response.data;
  } catch (error) {
    console.error('Error actualizando personal:', error);
    return { success: false, error: 'Error de conexión' };
  }
}

/**
 * Actualizar datos de vehículo
 */
export async function updateVehiculo(id: string, data: Partial<RegisterVehiculoData>): Promise<APIResponse> {
  try {
    const response = await api.post(API_GPS, {
      action: 'updateVehiculo',
      id,
      ...data,
    });
    return response.data;
  } catch (error) {
    console.error('Error actualizando vehículo:', error);
    return { success: false, error: 'Error de conexión' };
  }
}

/**
 * Activar/desactivar rastreo
 */
export async function toggleTracking(
  id: string,
  tipo: 'personal' | 'vehiculo',
  activo: boolean
): Promise<APIResponse> {
  try {
    const response = await api.post(API_GPS, {
      action: 'toggleTracking',
      id,
      tipo,
      activo,
    });
    return response.data;
  } catch (error) {
    console.error('Error cambiando estado de rastreo:', error);
    return { success: false, error: 'Error de conexión' };
  }
}

/**
 * Eliminar entidad
 */
export async function deleteEntity(id: string, tipo: 'personal' | 'vehiculo'): Promise<APIResponse> {
  try {
    const response = await api.post(API_GPS, {
      action: 'deleteEntity',
      id,
      tipo,
    });
    return response.data;
  } catch (error) {
    console.error('Error eliminando entidad:', error);
    return { success: false, error: 'Error de conexión' };
  }
}

// ==========================================
// UTILIDADES
// ==========================================

/**
 * Calcular distancia entre dos puntos (Haversine)
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Radio de la Tierra en km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Formatear tiempo relativo
 */
export function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return 'Nunca';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Hace unos segundos';
  if (diffMin < 60) return `Hace ${diffMin} min`;
  if (diffHour < 24) return `Hace ${diffHour}h`;
  if (diffDay < 7) return `Hace ${diffDay} días`;

  return date.toLocaleDateString('es-PE');
}

/**
 * Formatear velocidad
 */
export function formatSpeed(speed: number): string {
  return `${Math.round(speed)} km/h`;
}

/**
 * Formatear batería
 */
export function formatBattery(battery: number): string {
  if (battery >= 80) return `🔋 ${battery}%`;
  if (battery >= 50) return `🔋 ${battery}%`;
  if (battery >= 20) return `🪫 ${battery}%`;
  return `⚠️ ${battery}%`;
}
