// Vencimiento de la sesión, calculado en el navegador.
// El token del servidor es base64(«correo|milisegundos|secreto») y vale 24 h (TOKEN_EXPIRY_HOURS en
// Code.gs). Aquí solo se lee la hora de emisión: el token no se envía a ningún lado ni se muestra.

export const HORAS_SESION = 24;

/** Evento que avisa a la pantalla que conviene revisar la sesión ya (p. ej. tras un «No autorizado»). */
export const EVENTO_REVISAR_SESION = 'telcom:revisar-sesion';

/** Hora de emisión del token (ms) o null si no se puede leer (token de prueba, vacío, otro formato). */
export function emisionToken(token: string | null | undefined): number | null {
  if (!token) return null;
  try {
    const ms = Number(atob(token).split('|')[1]);
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  } catch {
    return null;
  }
}

/** true solo si el token se puede leer y ya pasaron más de 24 h desde que se emitió. */
export function tokenVencido(token: string | null | undefined, ahora = Date.now()): boolean {
  const ms = emisionToken(token);
  return ms !== null && ahora - ms > HORAS_SESION * 3600 * 1000;
}

/** Revisa el token guardado de la sesión actual. */
export function sesionVencida(ahora = Date.now()): boolean {
  try {
    return tokenVencido(localStorage.getItem('authToken'), ahora);
  } catch {
    return false;
  }
}
