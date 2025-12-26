// Configuración de APIs

// API existente de la app móvil (timestamp_camera) - Actualizada 25/12/2025
export const API_POINTS = 'https://script.google.com/macros/s/AKfycbyeqP84CJ2cvaEVIIWF8DnY4D71x1SBhMvCL_ufyKpcuJMnNWYvEH39PWmfXtSiYKJD/exec';

// API de administración del dashboard
export const API_ADMIN = 'https://script.google.com/macros/s/AKfycbxoqTqUnl-VqSYAR04i570c6X_OG9WaPsl5s3azylV_XSmiySDOz1-MwjhpiAyA4Zlv/exec';

// Configuración del mapa
export const MAP_CONFIG = {
  defaultCenter: [-15.8402, -70.0219] as [number, number], // Puno, Perú
  defaultZoom: 13,
  tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
};

// Colores del tema
export const COLORS = {
  primary: '#2563eb',
  secondary: '#64748b',
  success: '#22c55e',
  warning: '#eab308',
  danger: '#ef4444',
  info: '#3b82f6',
};
