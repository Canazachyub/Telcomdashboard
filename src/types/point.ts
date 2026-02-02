// Tipos para los puntos GPS del mapa
// Soporta estructura legacy (9 cols) y extended (33 cols)

export interface PhotoLink {
  url: string;
  fecha: string;
  numero: number;
  lectura?: number | string | null;  // Lectura asociada a esta foto
  // ODT - Identificación del técnico que tomó esta foto
  odtId?: string | null;
  odtNombre?: string | null;
  odtColor?: string | null;
}

// Punto GPS básico (compatible con legacy)
export interface GpsPoint {
  suministro: string;
  latRef: number | null;
  longRef: number | null;
  latReal: number | null;
  longReal: number | null;
  hasPhoto: boolean;
  synced: boolean;
  photoCount: number;
  photoLinks: PhotoLink[];
}

// Punto GPS extendido (33 columnas)
export interface GpsPointExtended extends GpsPoint {
  // Metadata
  rowIndex: number;
  structure: 'legacy' | 'extended';
  status: PointStatus;

  // Columnas A-W (datos del Excel)
  numero: number | null;           // A: Nº
  tecnico: string | null;          // B: TECNICO
  fecha: string | null;            // C: Fecha_Contraste
  // suministro ya está en GpsPoint   // D: Suministro
  codigoRuta: string | null;       // E: Codigo_Ruta
  clienteNombre: string | null;    // F: Cliente_Nombre
  direccion: string | null;        // G: Direccion
  distrito: string | null;         // H: Distrito
  sed: string | null;              // I: SED
  marca: string | null;            // J: Marca
  modelo: string | null;           // K: Modelo
  serie: string | null;            // L: Serie
  fase: string | null;             // M: Fase
  anioFabricacion: string | null;  // N: Anio_Fabricacion
  hilos: string | null;            // O: Hilos
  consumoPromedio: string | null;  // P: Consumo_Promedio
  equipoPatron: string | null;     // Q: Equipo_Patron
  carga: string | null;            // R: Carga
  dniCliente: string | null;       // S: DNI_Cliente
  // latRef ya está en GpsPoint       // T: LAT_REF
  // longRef ya está en GpsPoint      // U: LONG_REF
  gis: string | null;              // V: GIS
  estadoTarea: string | null;      // W: ESTADO_TAREA

  // Columnas X-AG (datos de la app)
  linkCarpeta: string | null;      // X: Link_Carpeta
  gpsReal: string | null;          // Y: GPS_Real
  ubicacionGeo: string | null;     // Z: Ubicacion_Geo
  // latReal ya está en GpsPoint      // AA: LAT_REAL
  // longReal ya está en GpsPoint     // AB: LONG_REAL
  lectura: string | number | null; // AC: LECTURA
  fotoCount: number | null;        // AD: Foto_Count
  // photoLinks ya está en GpsPoint   // AE: Photo_Links
  syncedAt: string | null;         // AF: Synced_At
  notas: string | null;            // AG: Notas

  // Columnas AH-AJ (ODT - Operator Device Tracking)
  odtId: string | null;            // AH: ODT_ID (ID único del técnico)
  odtNombre: string | null;        // AI: ODT_Nombre (Nombre del técnico)
  odtColor: string | null;         // AJ: ODT_Color (Color hexadecimal)

  // Campo calculado: Fecha de supervisión (de la fila con lectura)
  fechaSupervision: string | null;
}

export interface Sheet {
  name: string;
  id: number;
}

export interface SheetMetadata {
  name: string;
  id: number;
  structure: 'legacy' | 'extended';
  totalRows: number;
  columns: string[];
}

export interface PointsStats {
  total: number;
  pendientes: number;
  enProceso: number;
  completados: number;
  porcentaje: number;
}

// Estadísticas extendidas del API
export interface ExtendedStats {
  success: boolean;
  sheetName: string;
  structure: 'legacy' | 'extended';
  totals: {
    total: number;
    pendiente: number;
    en_proceso: number;
    completado: number;
    porcentajeAvance: number;
  };
  byTecnico: Record<string, {
    total: number;
    pendiente: number;
    en_proceso: number;
    completado: number;
  }>;
  byDistrito: Record<string, {
    total: number;
    completado: number;
  }>;
  lastUpdated: string;
}

// Respuesta del endpoint getAllPointsExtended
export interface AllPointsExtendedResponse {
  success: boolean;
  points: GpsPointExtended[];
  structure: 'legacy' | 'extended';
  totalCount: number;
  sheetName: string;
}

// Respuesta del endpoint getSheetMetadata
export interface SheetMetadataResponse {
  success: boolean;
  sheets: SheetMetadata[];
  timestamp: string;
}

export type PointStatus = 'pendiente' | 'en_proceso' | 'completado';

export function getPointStatus(point: GpsPoint | GpsPointExtended): PointStatus {
  // Si el punto ya tiene status calculado por el backend
  if ('status' in point && point.status) {
    return point.status;
  }

  // Cálculo local (fallback)
  if (point.synced && point.hasPhoto) {
    return 'completado';
  } else if (point.hasPhoto && !point.synced) {
    return 'en_proceso';
  }
  return 'pendiente';
}

export function getStatusColor(status: PointStatus): string {
  switch (status) {
    case 'completado':
      return '#22c55e'; // verde
    case 'en_proceso':
      return '#eab308'; // amarillo
    case 'pendiente':
      return '#ef4444'; // rojo
  }
}

export function getStatusLabel(status: PointStatus): string {
  switch (status) {
    case 'completado':
      return 'Completado';
    case 'en_proceso':
      return 'En Proceso';
    case 'pendiente':
      return 'Pendiente';
  }
}

export function getStatusIcon(status: PointStatus): string {
  switch (status) {
    case 'completado':
      return '✅';
    case 'en_proceso':
      return '🟡';
    case 'pendiente':
      return '🔴';
  }
}
