import { RefreshCw, Menu, CalendarRange } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { usePointsStore } from '../../stores/pointsStore';
import { roleLabels } from '../../types/user';
import TerranClock from './TerranClock';
import RoleAvatar from '../RoleAvatar';

interface HeaderProps {
  onMenu: () => void;
}

export default function Header({ onMenu }: HeaderProps) {
  const { user } = useAuthStore();
  const { sheets, selectedSheet, setSelectedSheet, refreshPoints, isLoading } = usePointsStore();

  return (
    <header className="sticky top-0 z-[1000] border-b border-line bg-navy-900/85 px-4 py-3 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenu}
          className="rounded-lg p-2 text-gray-500 hover:bg-navy-800 hover:text-white lg:hidden"
          aria-label="Abrir menú"
        >
          <Menu size={20} />
        </button>

        {/* Selector de jornada */}
        <div className="flex min-w-0 items-center gap-2 rounded-xl border border-line-strong bg-navy-800 py-1 pl-3 pr-1">
          <CalendarRange size={16} className="shrink-0 text-electric" />
          <div className="min-w-0">
            <p className="hidden text-[10px] font-medium uppercase tracking-wider text-gray-400 sm:block">Jornada</p>
            <select
              value={selectedSheet || ''}
              onChange={(e) => setSelectedSheet(e.target.value)}
              className="max-w-[46vw] cursor-pointer truncate bg-transparent pr-1 text-sm font-semibold text-gray-900 outline-none sm:max-w-[260px]"
              aria-label="Seleccionar jornada"
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
            onClick={() => refreshPoints()}
            disabled={isLoading}
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-navy-700 hover:text-electric disabled:cursor-not-allowed disabled:opacity-50"
            title="Actualizar datos"
            aria-label="Actualizar datos"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="flex-1" />

        {/* Estado y reloj */}
        <div className="hidden items-center gap-2 text-xs text-green-700 md:flex">
          <span className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_0_4px_rgb(16_185_129/0.15)]" />
          Operativo
        </div>
        <TerranClock />

        {/* Usuario */}
        {user && (
          <div className="flex items-center gap-3 border-l border-line pl-3">
            <div className="hidden text-right sm:block">
              <p className="max-w-[180px] truncate text-sm font-semibold text-gray-900">{user.nombre}</p>
              <p className="text-[11px] font-semibold text-energy">{roleLabels[user.rol] || user.rol}</p>
            </div>
            <RoleAvatar rol={user.rol} seed={user.email || user.id} nombre={user.nombre} size={38} />
          </div>
        )}
      </div>
    </header>
  );
}
