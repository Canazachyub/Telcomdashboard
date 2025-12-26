import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, UserPlus, Edit, Trash2, Search, X, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { roleLabels, roleColors, type User, type UserRole } from '../types/user';
import { getUsers, createUser, updateUser, deleteUser, isTokenExpired } from '../services/authService';
import { useAuthStore } from '../stores/authStore';

interface UserFormData {
  id?: string;
  email: string;
  password: string;
  nombre: string;
  rol: UserRole;
  telefono: string;
  jornadasAsignadas: string;
  activo: boolean;
}

const emptyForm: UserFormData = {
  email: '',
  password: '',
  nombre: '',
  rol: 'tecnico',
  telefono: '',
  jornadasAsignadas: '',
  activo: true,
};

export default function UsersPage() {
  const navigate = useNavigate();
  const { token, logout } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('todos');
  const [showModal, setShowModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState<UserFormData>(emptyForm);
  const [isEditing, setIsEditing] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Verificar si la sesión ha expirado
  useEffect(() => {
    if (isTokenExpired(token)) {
      setSessionExpired(true);
    }
  }, [token]);

  const handleRelogin = () => {
    logout();
    navigate('/login');
  };

  const loadUsers = async () => {
    setIsLoading(true);
    setError('');
    try {
      // No enviar token si está expirado para evitar error
      const validToken = isTokenExpired(token) ? undefined : token || undefined;
      const result = await getUsers(validToken);
      if (result.success && result.users) {
        setUsers(result.users);
      } else {
        setError(result.message || 'Error al cargar usuarios');
      }
    } catch (err) {
      setError('Error de conexión');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'todos' || user.rol === roleFilter;
    return matchesSearch && matchesRole;
  });

  const handleOpenCreate = () => {
    setFormData(emptyForm);
    setIsEditing(false);
    setShowModal(true);
  };

  const handleOpenEdit = (user: User) => {
    setFormData({
      id: user.id,
      email: user.email,
      password: '',
      nombre: user.nombre,
      rol: user.rol,
      telefono: (user as any).telefono || '',
      jornadasAsignadas: (user as any).jornadasAsignadas || '',
      activo: user.activo,
    });
    setIsEditing(true);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');

    try {
      if (isEditing && formData.id) {
        const result = await updateUser({
          id: formData.id,
          nombre: formData.nombre,
          rol: formData.rol,
          activo: formData.activo,
          telefono: formData.telefono,
          jornadasAsignadas: formData.jornadasAsignadas,
          newPassword: formData.password || undefined,
        });

        if (result.success) {
          setShowModal(false);
          loadUsers();
        } else {
          setError(result.message || 'Error al actualizar usuario');
        }
      } else {
        if (!formData.password) {
          setError('La contraseña es requerida');
          setIsSaving(false);
          return;
        }

        const result = await createUser({
          email: formData.email,
          password: formData.password,
          nombre: formData.nombre,
          rol: formData.rol,
          telefono: formData.telefono,
          jornadasAsignadas: formData.jornadasAsignadas,
        });

        if (result.success) {
          setShowModal(false);
          loadUsers();
        } else {
          setError(result.message || 'Error al crear usuario');
        }
      }
    } catch (err) {
      setError('Error de conexión');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setIsSaving(true);
    try {
      const result = await deleteUser(id);
      if (result.success) {
        setShowDeleteConfirm(null);
        loadUsers();
      } else {
        setError(result.message || 'Error al eliminar usuario');
      }
    } catch (err) {
      setError('Error de conexión');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner de sesión expirada */}
      {sessionExpired && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-amber-600" size={24} />
            <div>
              <p className="font-medium text-amber-800">Tu sesión ha expirado</p>
              <p className="text-sm text-amber-600">Por seguridad, te recomendamos volver a iniciar sesión.</p>
            </div>
          </div>
          <button
            onClick={handleRelogin}
            className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
          >
            Iniciar Sesión
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="text-blue-600" />
            Gestión de Usuarios
          </h1>
          <p className="text-gray-500">Administra los usuarios del sistema</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadUsers}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <UserPlus size={18} />
            Nuevo Usuario
          </button>
        </div>
      </div>

      {/* Error global */}
      {error && !showModal && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                size={18}
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar usuario..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2"
          >
            <option value="todos">Todos los roles</option>
            <option value="admin">Administrador</option>
            <option value="supervisor">Supervisor</option>
            <option value="tecnico">Técnico</option>
          </select>
        </div>
      </div>

      {/* Tabla de usuarios */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-blue-600" size={32} />
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                  Usuario
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                  Rol
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                  Estado
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                  Último Acceso
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="py-3 px-4">
                    <div>
                      <p className="font-medium text-gray-900">{user.nombre}</p>
                      <p className="text-sm text-gray-500">{user.email}</p>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${roleColors[user.rol]}`}>
                      {roleLabels[user.rol]}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.activo
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {user.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">
                    {user.lastLogin || '-'}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenEdit(user)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(user.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!isLoading && filteredUsers.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No se encontraron usuarios
          </div>
        )}
      </div>

      {/* Modal de crear/editar usuario */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold">
                {isEditing ? 'Editar Usuario' : 'Nuevo Usuario'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre
                </label>
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  disabled={isEditing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isEditing ? 'Nueva Contraseña (dejar vacío para mantener)' : 'Contraseña'}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required={!isEditing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rol
                </label>
                <select
                  value={formData.rol}
                  onChange={(e) => setFormData({ ...formData, rol: e.target.value as UserRole })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="admin">Administrador</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="tecnico">Técnico</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Teléfono
                </label>
                <input
                  type="tel"
                  value={formData.telefono}
                  onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Jornadas Asignadas (separadas por coma)
                </label>
                <input
                  type="text"
                  value={formData.jornadasAsignadas}
                  onChange={(e) => setFormData({ ...formData, jornadasAsignadas: e.target.value })}
                  placeholder="JOR001, JOR002"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {isEditing && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="activo"
                    checked={formData.activo}
                    onChange={(e) => setFormData({ ...formData, activo: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="activo" className="text-sm text-gray-700">
                    Usuario activo
                  </label>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSaving && <Loader2 className="animate-spin" size={16} />}
                  {isEditing ? 'Guardar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de confirmación de eliminación */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Confirmar Eliminación
            </h3>
            <p className="text-gray-600 mb-6">
              ¿Estás seguro de que deseas eliminar este usuario? Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(showDeleteConfirm)}
                disabled={isSaving}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSaving && <Loader2 className="animate-spin" size={16} />}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
