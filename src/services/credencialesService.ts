// Técnicos que se registraron en la app de campo, con su credencial (correo,
// foto y ubicación donde se registraron). Acción «getCredenciales» de Code.gs:
// solo ADMIN / SUPERVISOR, porque son datos personales.
import { API_POINTS } from '../config/api';

export interface TecnicoRegistrado {
  id: string;
  nombre: string;
  telefono: string;
  color: string;
  fechaRegistro: string;
  ultimaActividad: string;
  fotosCount: number;
  correo: string;
  lat: number | null;
  lng: number | null;
  precision: number | null;
  ubicacion: string;
  /** Foto de credencial como data URL (vacío si no envió foto) */
  foto: string;
  fechaCredencial: string;
}

export interface RespuestaCredenciales {
  success: boolean;
  message?: string;
  tecnicos: TecnicoRegistrado[];
  /** La acción todavía no está instalada en el Apps Script */
  sinInstalar?: boolean;
}

export async function getCredenciales(): Promise<RespuestaCredenciales> {
  const r = await fetch(API_POINTS, {
    method: 'POST',
    // Texto JSON: evita la petición previa CORS que Apps Script no responde
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'getCredenciales', token: localStorage.getItem('authToken') || '' }),
    redirect: 'follow',
  });
  const text = await r.text();
  try {
    const j = JSON.parse(text) as RespuestaCredenciales;
    j.tecnicos = Array.isArray(j.tecnicos) ? j.tecnicos : [];
    if (!j.success && /Acción no reconocida/i.test(j.message || '')) j.sinInstalar = true;
    return j;
  } catch {
    return { success: false, message: `Respuesta no válida del servidor (${r.status})`, tecnicos: [] };
  }
}

/** Solo imágenes en data URL (se interpolan en el HTML del marcador). */
export const fotoSegura = (foto: string | null | undefined) =>
  foto && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(foto) ? foto : '';

/** Datos para el formulario de «Nuevo usuario» a partir del registro de la app. */
export interface PrefillUsuario {
  email: string;
  nombre: string;
  telefono: string;
}

export const prefillDesde = (t: TecnicoRegistrado): PrefillUsuario => ({
  email: t.correo,
  nombre: t.nombre,
  telefono: t.telefono,
});
