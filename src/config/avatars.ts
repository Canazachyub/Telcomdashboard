import { brandAsset } from './brand';
import type { UserRole } from '../types/user';

/**
 * Avatares predeterminados por cargo (public/brand/avatars/<rol>-<n>.webp).
 * Para agregar más variantes basta con subir los archivos y subir el número aquí.
 */
// En 0 se muestran las iniciales (aún no hay avatares aprobados).
export const AVATAR_VARIANTS: Record<UserRole, number> = {
  admin: 1,
  supervisor: 2,
  tecnico: 1,
};

// Hash estable: el mismo usuario recibe siempre el mismo avatar
function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function avatarFor(rol: UserRole, seed: string): string | null {
  const n = AVATAR_VARIANTS[rol] || 0;
  if (n === 0) return null;
  return brandAsset(`avatars/${rol}-${(hash(seed.toLowerCase()) % n) + 1}.webp`);
}
