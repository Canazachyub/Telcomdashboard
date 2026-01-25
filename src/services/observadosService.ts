import axios from 'axios';
import { API_POINTS } from '../config/api';

// Tipos para OBSERVADOS
export interface ObservadoPoint {
  numero: number;
  serie: string;
  suministro: string;
  codigoRuta: string;
  tecnico: string;
  fechaContraste: string;
  syncedAt: string;
  notas: string;
  semana: string;
  photoLinks: { url: string; nombre: string }[];
}

export interface ObservadosDataResponse {
  success: boolean;
  message: string;
  points: ObservadoPoint[];
  semana: string;
  totalSuministros: number;
  totalFotos: number;
  structure: 'observados';
}

export interface MapeoStatusResponse {
  success: boolean;
  message: string;
  status: 'idle' | 'in_progress' | 'completed';
  sheetName?: string;
  processed?: number;
  total?: number;
  fotosEncontradas?: number;
  startedAt?: string;
}

export interface MapeoResultResponse {
  success: boolean;
  message: string;
  status: 'in_progress' | 'completed';
  processed: number;
  total: number;
  fotosEncontradas: number;
  filasCreadas?: number;
  suministrosConFotos?: number;
}

/**
 * Obtiene los datos de una hoja OBSERVADOS formateados para el Dashboard
 */
export async function getObservadosData(sheetName: string): Promise<ObservadosDataResponse | null> {
  try {
    const response = await axios.get(
      `${API_POINTS}?action=getObservadosData&sheetName=${encodeURIComponent(sheetName)}`
    );
    return response.data;
  } catch (error) {
    console.error('Error obteniendo datos de OBSERVADOS:', error);
    return null;
  }
}

/**
 * Inicia el mapeo de fotos desde la carpeta de Drive
 */
export async function mapearFotosObservados(sheetName: string): Promise<MapeoResultResponse | null> {
  try {
    const response = await axios.get(
      `${API_POINTS}?action=mapearFotosObservados&sheetName=${encodeURIComponent(sheetName)}`
    );
    return response.data;
  } catch (error) {
    console.error('Error mapeando fotos de OBSERVADOS:', error);
    return null;
  }
}

/**
 * Obtiene el estado actual del mapeo
 */
export async function getMapeoStatus(): Promise<MapeoStatusResponse | null> {
  try {
    const response = await axios.get(`${API_POINTS}?action=getMapeoStatus`);
    return response.data;
  } catch (error) {
    console.error('Error obteniendo estado del mapeo:', error);
    return null;
  }
}

/**
 * Verifica si una hoja es de tipo OBSERVADOS
 * Las hojas OBSERVADOS empiezan con "Observados" o "OBSERVADOS"
 */
export function isObservadosSheet(sheetName: string): boolean {
  if (!sheetName) return false;
  const name = sheetName.toLowerCase();
  return name.startsWith('observados') || name.startsWith('observado');
}

/**
 * Extrae el ID de archivo de una URL de Google Drive
 */
export function extractDriveFileId(url: string): string | null {
  if (!url) return null;

  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /id=([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

export interface ImageBase64Response {
  success: boolean;
  message: string;
  base64?: string;
  mimeType?: string;
  fileName?: string;
}

/**
 * Obtiene una imagen de Google Drive como base64
 * Esto evita los problemas de CORS al cargar imágenes directamente
 */
export async function getImageBase64(fileIdOrUrl: string): Promise<ImageBase64Response | null> {
  try {
    // Extraer el ID si es una URL
    let fileId = fileIdOrUrl;
    if (fileIdOrUrl.includes('drive.google.com')) {
      const extracted = extractDriveFileId(fileIdOrUrl);
      if (extracted) {
        fileId = extracted;
      }
    }

    const response = await axios.get(
      `${API_POINTS}?action=getImageBase64&fileId=${encodeURIComponent(fileId)}`
    );
    return response.data;
  } catch (error) {
    console.error('Error obteniendo imagen base64:', error);
    return null;
  }
}
