// Tipos para usuarios y autenticación

export type UserRole = 'admin' | 'supervisor' | 'tecnico';

export interface User {
  id: string;
  email: string;
  nombre: string;
  rol: UserRole;
  activo: boolean;
  createdAt?: string;
  lastLogin?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  token?: string;
  user?: User;
}

export interface CreateUserData {
  email: string;
  password: string;
  nombre: string;
  rol: UserRole;
}

export const roleLabels: Record<UserRole, string> = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  tecnico: 'Técnico',
};

export const roleColors: Record<UserRole, string> = {
  admin: 'bg-purple-100 text-purple-800',
  supervisor: 'bg-blue-100 text-blue-800',
  tecnico: 'bg-green-100 text-green-800',
};
