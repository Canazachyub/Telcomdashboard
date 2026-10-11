import { useState } from 'react';
import { avatarFor } from '../config/avatars';
import { fotoSegura } from '../services/credencialesService';
import type { UserRole } from '../types/user';

const RING: Record<UserRole, string> = {
  admin: 'ring-energy',
  supervisor: 'ring-electric',
  tecnico: 'ring-green-500',
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

interface Props {
  rol: UserRole;
  /** email o id: decide qué variante le toca */
  seed: string;
  nombre: string;
  size?: number;
  className?: string;
  /** Foto de credencial de la app (data URL); si existe, reemplaza al avatar por cargo */
  foto?: string;
}

/** Avatar por cargo con anillo de color; si la imagen no carga, muestra las iniciales. */
export default function RoleAvatar({ rol, seed, nombre, size = 36, className = '', foto }: Props) {
  const [failed, setFailed] = useState(false);
  const src = fotoSegura(foto) || avatarFor(rol, seed || nombre);
  const ring = RING[rol] || 'ring-gray-300';
  const style = { width: size, height: size };

  if (failed || !src) {
    return (
      <div
        style={style}
        className={`flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 text-sm font-bold text-white ring-2 ${ring} ${className}`}
      >
        {initials(nombre || '?')}
      </div>
    );
  }
  return (
    <span className={`unit-portrait inline-block shrink-0 ${className}`} style={{ width: size, height: size }}>
      <img
        src={src}
        alt={nombre}
        onError={() => setFailed(true)}
        className="h-full w-full bg-navy-800 object-cover"
        draggable={false}
      />
    </span>
  );
}
