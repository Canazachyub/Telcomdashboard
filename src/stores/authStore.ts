import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, UserRole } from '../types/user';

/** Normaliza el rol a minusculas ('ADMIN' -> 'admin') para comparaciones consistentes */
export function normalizeRole(rol: unknown): UserRole {
  const value = String(rol ?? '').trim().toLowerCase();
  if (value === 'admin' || value === 'supervisor' || value === 'tecnico') return value;
  if (value === 'técnico') return 'tecnico';
  return 'tecnico'; // rol desconocido: permisos minimos
}

export function normalizeUser(user: User): User {
  return { ...user, rol: normalizeRole(user.rol) };
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Acciones
  setUser: (user: User, token: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,

      setUser: (user, token) => {
        localStorage.setItem('authToken', token);
        set({
          user: normalizeUser(user),
          token,
          isAuthenticated: true,
        });
      },

      logout: () => {
        localStorage.removeItem('authToken');
        set({
          user: null,
          token: null,
          isAuthenticated: false,
        });
      },

      setLoading: (loading) => set({ isLoading: loading }),
    }),
    {
      name: 'auth-storage',
      // Normalizar el rol tambien al rehidratar sesiones guardadas antes de este cambio
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<AuthState>;
        return {
          ...current,
          ...p,
          user: p.user ? normalizeUser(p.user) : current.user,
        };
      },
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
