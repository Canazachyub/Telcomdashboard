// Servicio para gestión de técnicos y asignaciones

import { API_POINTS } from '../config/api';
import type { User } from '../types/user';

interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  users?: User[];
  updated?: number;
  [key: string]: T | boolean | string | User[] | number | undefined;
}

/**
 * Realiza una petición POST al API con manejo de CORS
 */
async function apiPost<T>(action: string, data: Record<string, unknown> = {}): Promise<ApiResponse<T>> {
  const formData = new FormData();
  formData.append('payload', JSON.stringify({ action, ...data }));

  const response = await fetch(API_POINTS, {
    method: 'POST',
    body: formData,
    redirect: 'follow'
  });

  return response.json();
}

/**
 * Obtiene lista de técnicos (usuarios con rol TECNICO)
 */
export async function getTecnicos(): Promise<{ success: boolean; tecnicos?: User[]; message?: string }> {
  try {
    const result = await apiPost<User[]>('getUsers', {});

    if (result.success && result.users) {
      // Filtrar solo técnicos activos
      const tecnicos = result.users.filter(
        user => user.rol.toUpperCase() === 'TECNICO' && user.activo
      );

      return {
        success: true,
        tecnicos,
        message: `${tecnicos.length} técnicos encontrados`
      };
    }

    return {
      success: result.success,
      message: result.message
    };
  } catch (error) {
    console.error('Error obteniendo técnicos:', error);
    return {
      success: false,
      message: 'Error de conexion con el servidor'
    };
  }
}

/**
 * Asigna un técnico a múltiples suministros
 * @param sheetName - Nombre de la hoja/jornada
 * @param suministros - Array de IDs de suministro a actualizar
 * @param tecnicoNombre - Nombre del técnico a asignar
 */
export async function assignTecnico(
  sheetName: string,
  suministros: string[],
  tecnicoNombre: string
): Promise<{ success: boolean; updated?: number; message?: string }> {
  try {
    const result = await apiPost<number>('assignTecnico', {
      sheetName,
      suministros,
      tecnicoNombre
    });

    return {
      success: result.success,
      updated: result.updated,
      message: result.message
    };
  } catch (error) {
    console.error('Error asignando técnico:', error);
    return {
      success: false,
      message: 'Error de conexion con el servidor'
    };
  }
}
