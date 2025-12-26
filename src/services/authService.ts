// Servicio de autenticación - Conecta con Google Apps Script

import { API_POINTS } from '../config/api';
import type { User, LoginCredentials, AuthResponse } from '../types/user';

// Token expira en 24 horas (debe coincidir con backend)
const TOKEN_EXPIRY_HOURS = 24;

interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  user?: User;
  token?: string;
  users?: User[];
  [key: string]: T | boolean | string | User | User[] | undefined;
}

/**
 * Verifica si un token está expirado (decodifica base64 y verifica timestamp)
 */
export function isTokenExpired(token: string | null): boolean {
  if (!token) return true;

  try {
    const decoded = atob(token);
    const parts = decoded.split('|');
    if (parts.length !== 3) return true;

    const timestamp = parseInt(parts[1]);
    if (isNaN(timestamp)) return true;

    const now = Date.now();
    const expiryMs = TOKEN_EXPIRY_HOURS * 60 * 60 * 1000;

    return (now - timestamp) > expiryMs;
  } catch {
    return true;
  }
}

/**
 * Obtiene un token válido o null si está expirado
 */
export function getValidToken(token: string | null): string | undefined {
  if (!token || isTokenExpired(token)) {
    return undefined;
  }
  return token;
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
 * Login de usuario
 */
export async function login(credentials: LoginCredentials): Promise<AuthResponse> {
  try {
    const result = await apiPost<User>('login', {
      email: credentials.email,
      password: credentials.password
    });

    return {
      success: result.success,
      message: result.message,
      user: result.user,
      token: result.token
    };
  } catch (error) {
    console.error('Error en login:', error);
    return {
      success: false,
      message: 'Error de conexion con el servidor'
    };
  }
}

/**
 * Obtiene lista de usuarios (solo ADMIN)
 */
export async function getUsers(token?: string): Promise<{ success: boolean; users?: User[]; message?: string }> {
  try {
    const result = await apiPost<User[]>('getUsers', { token });

    return {
      success: result.success,
      users: result.users,
      message: result.message
    };
  } catch (error) {
    console.error('Error obteniendo usuarios:', error);
    return {
      success: false,
      message: 'Error de conexion con el servidor'
    };
  }
}

/**
 * Crea un nuevo usuario
 */
export async function createUser(userData: {
  email: string;
  password: string;
  nombre: string;
  rol: string;
  telefono?: string;
  jornadasAsignadas?: string;
}): Promise<{ success: boolean; user?: User; message?: string }> {
  try {
    const result = await apiPost<User>('createUser', userData);

    return {
      success: result.success,
      user: result.user,
      message: result.message
    };
  } catch (error) {
    console.error('Error creando usuario:', error);
    return {
      success: false,
      message: 'Error de conexion con el servidor'
    };
  }
}

/**
 * Actualiza un usuario existente
 */
export async function updateUser(userData: {
  id: string;
  nombre?: string;
  rol?: string;
  activo?: boolean;
  telefono?: string;
  jornadasAsignadas?: string;
  newPassword?: string;
}): Promise<{ success: boolean; message?: string }> {
  try {
    const result = await apiPost('updateUser', userData);

    return {
      success: result.success,
      message: result.message
    };
  } catch (error) {
    console.error('Error actualizando usuario:', error);
    return {
      success: false,
      message: 'Error de conexion con el servidor'
    };
  }
}

/**
 * Elimina un usuario
 */
export async function deleteUser(id: string): Promise<{ success: boolean; message?: string }> {
  try {
    const result = await apiPost('deleteUser', { id });

    return {
      success: result.success,
      message: result.message
    };
  } catch (error) {
    console.error('Error eliminando usuario:', error);
    return {
      success: false,
      message: 'Error de conexion con el servidor'
    };
  }
}

/**
 * Inicializa la hoja de usuarios (solo primera vez)
 */
export async function initUsersSheet(): Promise<{ success: boolean; message?: string }> {
  try {
    const response = await fetch(`${API_POINTS}?action=initUsersSheet`);
    return response.json();
  } catch (error) {
    console.error('Error inicializando usuarios:', error);
    return {
      success: false,
      message: 'Error de conexion con el servidor'
    };
  }
}
