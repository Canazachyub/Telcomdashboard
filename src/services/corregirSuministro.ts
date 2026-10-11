// Corrige en la hoja un suministro mal escrito por el técnico (acción
// «corregirSuministro» de google-apps-script/Correcciones.gs). Solo cambia las
// filas de foto de ese código: les pone el código correcto y los datos de la
// lista, igual que si el técnico lo hubiera escrito bien.
import { API_POINTS } from '../config/api';

// Mismo destino que las copias: en pruebas va al servidor simulado
const WRITE_URL: string = import.meta.env.VITE_COPY_API || API_POINTS;

export interface CorreccionHoja {
  sheetName: string;
  original: string;
  corregido: string;
  lat: number | null;
  lng: number | null;
}

export interface RespuestaCorreccion {
  success: boolean;
  message?: string;
  fotos?: number;
  conFilaDeLista?: boolean;
  fotosPreviasDestino?: number;
  /** La acción todavía no está instalada en el Apps Script */
  sinInstalar?: boolean;
}

export async function corregirEnHoja(c: CorreccionHoja): Promise<RespuestaCorreccion> {
  const r = await fetch(WRITE_URL, {
    method: 'POST',
    // Texto JSON: evita la petición previa CORS que Apps Script no responde
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'corregirSuministro',
      token: localStorage.getItem('authToken') || '',
      sheetName: c.sheetName,
      original: c.original,
      corregido: c.corregido,
      lat: c.lat,
      lng: c.lng,
    }),
    redirect: 'follow',
  });
  const text = await r.text();
  try {
    const j = JSON.parse(text) as RespuestaCorreccion;
    if (!j.success && /Acción no reconocida/i.test(j.message || '')) j.sinInstalar = true;
    return j;
  } catch {
    return { success: false, message: `Respuesta no válida del servidor (${r.status})` };
  }
}
