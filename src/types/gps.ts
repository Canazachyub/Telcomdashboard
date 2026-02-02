// ==========================================
// Tipos para Sistema de Rastreo GPS
// ==========================================

/**
 * Estado de una entidad GPS
 */
export type GPSEstado = 'online' | 'offline' | 'moving';

/**
 * Tipo de vehículo
 */
export type TipoVehiculo = 'auto' | 'camioneta' | 'moto' | 'camion';

/**
 * Icono de vehículo
 */
export type IconoVehiculo = 'car' | 'truck' | 'motorcycle' | 'bus';

/**
 * Personal rastreable
 */
export interface GPSPersonal {
  id: string;
  userId: string;
  nombre: string;
  telefono: string;
  activo: boolean;
  latitud: number;
  longitud: number;
  ultimaActualizacion: string | null;
  velocidad: number;
  bateria: number;
  estado: GPSEstado;
  color: string;
  foto_url: string;
}

/**
 * Vehículo rastreable
 */
export interface GPSVehiculo {
  id: string;
  placa: string;
  tipo: TipoVehiculo;
  marca: string;
  modelo: string;
  conductorId: string;
  activo: boolean;
  latitud: number;
  longitud: number;
  ultimaActualizacion: string | null;
  velocidad: number;
  estado: GPSEstado;
  color: string;
  icono: IconoVehiculo;
}

/**
 * Punto de historial
 */
export interface GPSHistorial {
  id: string;
  entityId: string;
  tipo: 'personal' | 'vehiculo';
  latitud: number;
  longitud: number;
  timestamp: string;
  velocidad: number;
}

/**
 * Estadísticas de tracking
 */
export interface GPSStats {
  totalPersonal: number;
  personalOnline: number;
  personalOffline: number;
  totalVehiculos: number;
  vehiculosOnline: number;
  vehiculosOffline: number;
}

/**
 * Respuesta de getAllTracking
 */
export interface AllTrackingResponse {
  success: boolean;
  data?: {
    personal: GPSPersonal[];
    vehiculos: GPSVehiculo[];
    stats: GPSStats;
    timestamp: string;
  };
  error?: string;
}

/**
 * Respuesta genérica de la API
 */
export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  count?: number;
}

/**
 * Datos para registrar personal
 */
export interface RegisterPersonalData {
  userId?: string;
  nombre: string;
  telefono?: string;
  color?: string;
  foto_url?: string;
}

/**
 * Datos para registrar vehículo
 */
export interface RegisterVehiculoData {
  placa: string;
  tipo?: TipoVehiculo;
  marca?: string;
  modelo?: string;
  conductorId?: string;
  color?: string;
  icono?: IconoVehiculo;
}

/**
 * Datos para actualizar ubicación
 */
export interface UpdateLocationData {
  id: string;
  tipo: 'personal' | 'vehiculo';
  latitud: number;
  longitud: number;
  velocidad?: number;
  bateria?: number;
}

/**
 * Filtros para el mapa
 */
export interface GPSFilters {
  showPersonal: boolean;
  showVehiculos: boolean;
  onlyOnline: boolean;
  search: string;
}

/**
 * Entidad unificada para el mapa (puede ser personal o vehículo)
 */
export interface GPSEntity {
  id: string;
  tipo: 'personal' | 'vehiculo';
  nombre: string; // nombre para personal, placa para vehículo
  latitud: number;
  longitud: number;
  velocidad: number;
  estado: GPSEstado;
  color: string;
  ultimaActualizacion: string | null;
  // Datos adicionales
  extra?: {
    telefono?: string;
    bateria?: number;
    foto_url?: string;
    marca?: string;
    modelo?: string;
    conductorId?: string;
    icono?: IconoVehiculo;
  };
}

/**
 * Convertir GPSPersonal a GPSEntity
 */
export function personalToEntity(personal: GPSPersonal): GPSEntity {
  return {
    id: personal.id,
    tipo: 'personal',
    nombre: personal.nombre,
    latitud: personal.latitud,
    longitud: personal.longitud,
    velocidad: personal.velocidad,
    estado: personal.estado,
    color: personal.color,
    ultimaActualizacion: personal.ultimaActualizacion,
    extra: {
      telefono: personal.telefono,
      bateria: personal.bateria,
      foto_url: personal.foto_url,
    },
  };
}

/**
 * Convertir GPSVehiculo a GPSEntity
 */
export function vehiculoToEntity(vehiculo: GPSVehiculo): GPSEntity {
  return {
    id: vehiculo.id,
    tipo: 'vehiculo',
    nombre: vehiculo.placa,
    latitud: vehiculo.latitud,
    longitud: vehiculo.longitud,
    velocidad: vehiculo.velocidad,
    estado: vehiculo.estado,
    color: vehiculo.color,
    ultimaActualizacion: vehiculo.ultimaActualizacion,
    extra: {
      marca: vehiculo.marca,
      modelo: vehiculo.modelo,
      conductorId: vehiculo.conductorId,
      icono: vehiculo.icono,
    },
  };
}

// ==========================================
// Tipos para Rastreo basado en Fotos (ODT)
// ==========================================

/**
 * Técnico con tracking basado en fotos
 */
export interface ODTTecnico {
  id: string;
  nombre: string;
  telefono: string;
  color: string;
  fechaRegistro: string;
  ultimaActividad: string;
  fotosCount: number;
  // Ubicación de última foto
  latitud: number | null;
  longitud: number | null;
  ultimaFoto: string | null;
  ultimaFotoUrl: string | null;
  ultimoSuministro: string | null;
  ultimoProyecto: string | null;
  online: boolean;
}

/**
 * Estadísticas de tracking ODT
 */
export interface ODTStats {
  total: number;
  online: number;
  offline: number;
  conUbicacion: number;
  sinUbicacion: number;
}

/**
 * Respuesta de getTrackingFromPhotos
 */
export interface TrackingFromPhotosResponse {
  success: boolean;
  data?: {
    tecnicos: ODTTecnico[];
    stats: ODTStats;
    timestamp: string;
  };
  message?: string;
  error?: string;
}

/**
 * Convertir ODTTecnico a GPSEntity para reusar componentes del mapa
 */
export function odtToEntity(tecnico: ODTTecnico): GPSEntity | null {
  if (!tecnico.latitud || !tecnico.longitud) return null;

  return {
    id: tecnico.id,
    tipo: 'personal',
    nombre: tecnico.nombre,
    latitud: tecnico.latitud,
    longitud: tecnico.longitud,
    velocidad: 0,
    estado: tecnico.online ? 'online' : 'offline',
    color: tecnico.color,
    ultimaActualizacion: tecnico.ultimaFoto,
    extra: {
      telefono: tecnico.telefono,
      foto_url: tecnico.ultimaFotoUrl || undefined,
    },
  };
}
