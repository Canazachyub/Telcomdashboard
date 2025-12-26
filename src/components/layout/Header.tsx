import { Bell, User, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { usePointsStore } from '../../stores/pointsStore';
import { roleLabels, roleColors } from '../../types/user';

export default function Header() {
  const { user } = useAuthStore();
  const { sheets, selectedSheet, setSelectedSheet, refreshPoints, isLoading } = usePointsStore();

  const handleRefresh = () => {
    refreshPoints();
  };

  const formatDate = () => {
    const now = new Date();
    return now.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-3">
      <div className="flex items-center justify-between">
        {/* Lado izquierdo - Selector de jornada */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500">Seleccionar Jornada:</label>
            <select
              value={selectedSheet || ''}
              onChange={(e) => setSelectedSheet(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Seleccionar...</option>
              {sheets.map((sheet) => (
                <option key={sheet.id} value={sheet.name}>
                  {sheet.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className={`p-2 rounded-lg transition-colors ${
              isLoading
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            title="Actualizar datos"
          >
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Lado derecho - Fecha, notificaciones y usuario */}
        <div className="flex items-center gap-6">
          {/* Fecha y hora */}
          <span className="text-sm text-gray-500">{formatDate()}</span>

          {/* Notificaciones */}
          <button className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <Bell size={20} />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>

          {/* Usuario */}
          {user && (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{user.nombre}</p>
                <span className={`text-xs px-2 py-0.5 rounded ${roleColors[user.rol]}`}>
                  {roleLabels[user.rol]}
                </span>
              </div>
              <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                <User size={20} className="text-gray-500" />
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
