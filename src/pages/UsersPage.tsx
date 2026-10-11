import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { PrefillUsuario } from '../services/credencialesService';
import { Users, UserPlus, Edit, Trash2, Search, X, Loader2, RefreshCw, AlertTriangle, UserCheck, UserX } from 'lucide-react';
import { roleLabels, type User, type UserRole } from '../types/user';
import RoleAvatar from '../components/RoleAvatar';
import { getUsers, createUser, updateUser, deleteUser, isTokenExpired } from '../services/authService';
import { useAuthStore } from '../stores/authStore';
import { PageHeader, StatCard, EmptyState, Badge, ui, type Tone } from '../components/ui';

/** Color de insignia por rol (solo presentación). */
const ROLE_TONE: Record<string, Tone> = { admin: 'amber', supervisor: 'blue', tecnico: 'green' };

/** Muestra la fecha de último acceso de forma legible; si no es una fecha válida, la deja tal cual. */
function formatLastLogin(value?: string) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const labelCls = 'mb-1.5 block text-sm font-medium text-gray-700';

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

  // «Crear usuario» desde Rastreo: abre el formulario con los datos del registro de la app
  const location = useLocation();
  useEffect(() => {
    const prefill = (location.state as { prefill?: PrefillUsuario } | null)?.prefill;
    if (!prefill) return;
    setFormData({ ...emptyForm, email: prefill.email, nombre: prefill.nombre, telefono: prefill.telefono, rol: 'tecnico' });
    setIsEditing(false);
    setShowModal(true);
    // Que recargar la página no vuelva a abrirlo
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

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

  const activeCount = users.filter((u) => u.activo).length;

  return (
    <div className="space-y-6">
      {/* Banner de sesión expirada */}
      {sessionExpired && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="shrink-0 text-amber-700" size={24} />
            <div>
              <p className="font-medium text-amber-800">Tu sesión ha expirado</p>
              <p className="text-sm text-amber-700">Por seguridad, vuelve a iniciar sesión para seguir administrando usuarios.</p>
            </div>
          </div>
          <button
            onClick={handleRelogin}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Iniciar sesión
          </button>
        </div>
      )}

      {/* Cabecera */}
      <PageHeader
        kicker="Administración"
        title="Gestión de usuarios"
        icon={<Users size={24} />}
        subtitle="Administra las cuentas de acceso del personal: roles, estado y jornadas asignadas."
        actions={
          <>
            <button onClick={loadUsers} disabled={isLoading} className={ui.btnSecondary} title="Recargar lista">
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
              Actualizar
            </button>
            <button onClick={handleOpenCreate} className={ui.btnPrimary}>
              <UserPlus size={16} />
              Nuevo usuario
            </button>
          </>
        }
      />

      {/* Indicadores */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Usuarios registrados" value={users.length.toLocaleString('es-PE')} tone="cyan" icon={<Users size={18} />} />
        <StatCard label="Activos" value={activeCount.toLocaleString('es-PE')} tone="green" icon={<UserCheck size={18} />} />
        <StatCard label="Inactivos" value={(users.length - activeCount).toLocaleString('es-PE')} tone="gray" icon={<UserX size={18} />} />
      </div>

      {/* Error global */}
      {error && !showModal && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Filtros */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre o correo..."
              className={`${ui.input} pl-10`}
            />
          </div>

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className={`${ui.input} sm:w-56`}
          >
            <option value="todos">Todos los roles</option>
            <option value="admin">Administrador</option>
            <option value="supervisor">Supervisor</option>
            <option value="tecnico">Técnico</option>
          </select>
        </div>
      </div>

      {/* Tabla de usuarios */}
      <div className={ui.tableWrap}>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-electric" size={32} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className={ui.theadRow}>
                  <th className={ui.th}>Usuario</th>
                  <th className={ui.th}>Rol</th>
                  <th className={ui.th}>Estado</th>
                  <th className={ui.th}>Último acceso</th>
                  <th className={`${ui.th} text-right`}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id} className={ui.tbodyRow}>
                    <td className={ui.td}>
                      <div className="flex items-center gap-3">
                        <RoleAvatar rol={user.rol} seed={user.email || user.id} nombre={user.nombre} size={40} />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-gray-900">{user.nombre}</p>
                          <p className="truncate text-xs text-gray-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className={ui.td}>
                      <Badge tone={ROLE_TONE[user.rol] ?? 'gray'}>
                        {roleLabels[user.rol] || user.rol}
                      </Badge>
                    </td>
                    <td className={ui.td}>
                      <Badge tone={user.activo ? 'green' : 'red'} dot>
                        {user.activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </td>
                    <td className={`${ui.td} font-mono text-xs text-gray-600`} title={user.lastLogin || ''}>
                      {formatLastLogin(user.lastLogin)}
                    </td>
                    <td className={ui.td}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenEdit(user)}
                          className="rounded-lg border border-transparent p-2 text-blue-800 transition-colors hover:border-gray-200 hover:bg-gray-50 hover:text-electric"
                          title="Editar usuario"
                          aria-label="Editar usuario"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(user.id)}
                          className="rounded-lg border border-transparent p-2 text-red-700 transition-colors hover:border-red-200 hover:bg-red-50"
                          title="Eliminar usuario"
                          aria-label="Eliminar usuario"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && filteredUsers.length === 0 && (
          <EmptyState
            icon="rastreo"
            compact
            title="No se encontraron usuarios"
            description="Prueba con otro nombre, correo o filtro de rol."
          />
        )}
      </div>

      {/* Modal de crear/editar usuario */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <p className="brand-kicker">Usuarios</p>
                <h3 className="text-lg font-semibold text-gray-900">
                  {isEditing ? 'Editar usuario' : 'Nuevo usuario'}
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto p-6">
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </div>
              )}

              <div>
                <label className={labelCls}>
                  Nombre completo
                </label>
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  required
                  className={ui.input}
                />
              </div>

              <div>
                <label className={labelCls}>
                  Correo electrónico
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  disabled={isEditing}
                  className={`${ui.input} disabled:cursor-not-allowed disabled:opacity-60`}
                />
                {isEditing && <p className="mt-1 text-xs text-gray-500">El correo no se puede cambiar.</p>}
              </div>

              <div>
                <label className={labelCls}>
                  {isEditing ? 'Nueva contraseña' : 'Contraseña'}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required={!isEditing}
                  className={ui.input}
                />
                {isEditing && <p className="mt-1 text-xs text-gray-500">Déjala vacía para mantener la contraseña actual.</p>}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>
                    Rol
                  </label>
                  <select
                    value={formData.rol}
                    onChange={(e) => setFormData({ ...formData, rol: e.target.value as UserRole })}
                    className={ui.input}
                  >
                    <option value="admin">Administrador</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="tecnico">Técnico</option>
                  </select>
                </div>

                <div>
                  <label className={labelCls}>
                    Teléfono
                  </label>
                  <input
                    type="tel"
                    value={formData.telefono}
                    onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                    className={`${ui.input} font-mono`}
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>
                  Jornadas asignadas
                </label>
                <input
                  type="text"
                  value={formData.jornadasAsignadas}
                  onChange={(e) => setFormData({ ...formData, jornadasAsignadas: e.target.value })}
                  placeholder="JOR001, JOR002"
                  className={`${ui.input} font-mono`}
                />
                <p className="mt-1 text-xs text-gray-500">Escribe los nombres de las jornadas separados por comas.</p>
              </div>

              {isEditing && (
                <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
                  <input
                    type="checkbox"
                    id="activo"
                    checked={formData.activo}
                    onChange={(e) => setFormData({ ...formData, activo: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 accent-electric"
                  />
                  <label htmlFor="activo" className="text-sm text-gray-700">
                    Usuario activo (puede iniciar sesión)
                  </label>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className={`${ui.btnSecondary} flex-1`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className={`${ui.btnPrimary} flex-1`}
                >
                  {isSaving && <Loader2 className="animate-spin" size={16} />}
                  {isEditing ? 'Guardar cambios' : 'Crear usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de confirmación de eliminación */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-700">
              <Trash2 size={20} />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900">
              ¿Eliminar este usuario?
            </h3>
            <p className="mb-6 text-sm text-gray-600">
              El usuario perderá el acceso al sistema. Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className={`${ui.btnSecondary} flex-1`}
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(showDeleteConfirm)}
                disabled={isSaving}
                className={`${ui.btnDanger} flex-1`}
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
