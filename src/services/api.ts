import axios, { type AxiosInstance, type AxiosError } from 'axios';
import { API_POINTS, API_ADMIN } from '../config/api';

// Cliente para API de puntos (existente)
export const pointsApi: AxiosInstance = axios.create({
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Cliente para API de administración (nuevo)
export const adminApi: AxiosInstance = axios.create({
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para manejar errores globalmente
const handleError = (error: AxiosError) => {
  if (error.response) {
    console.error('Error de respuesta:', error.response.status, error.response.data);
  } else if (error.request) {
    console.error('Error de red:', error.message);
  } else {
    console.error('Error:', error.message);
  }
  return Promise.reject(error);
};

pointsApi.interceptors.response.use((response) => response, handleError);
adminApi.interceptors.response.use((response) => response, handleError);

// Interceptor para agregar token de autenticación
adminApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.params = { ...config.params, token };
  }
  return config;
});

// Helper para construir URLs
export const buildPointsUrl = (action: string, params?: Record<string, string>) => {
  const url = new URL(API_POINTS);
  url.searchParams.set('action', action);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }
  return url.toString();
};

export const buildAdminUrl = (action: string, params?: Record<string, string>) => {
  if (!API_ADMIN) {
    console.warn('API_ADMIN no configurada');
    return '';
  }
  const url = new URL(API_ADMIN);
  url.searchParams.set('action', action);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }
  return url.toString();
};
