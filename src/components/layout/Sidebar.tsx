import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Map,
  Users,
  FileText,
  LogOut,
  ClipboardList,
  Calendar,
  Package,
  AlertCircle,
  Navigation,
  X,
  Layers,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { brandAsset } from '../../config/brand';

interface MenuItem {
  name: string;
  path: string;
  icon: React.ReactNode;
  roles?: string[];
}

interface MenuGroup {
  label?: string;
  items: MenuItem[];
}

const menuGroups: MenuGroup[] = [
  {
    items: [
      { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={18} /> },
      { name: 'Mapa', path: '/mapa', icon: <Map size={18} /> },
      { name: 'Suministros', path: '/suministros', icon: <ClipboardList size={18} /> },
      { name: 'Jornadas', path: '/jornadas', icon: <Calendar size={18} />, roles: ['admin', 'supervisor'] },
    ],
  },
  {
    label: 'Supervisión',
    items: [
      { name: 'Reportes', path: '/reportes', icon: <FileText size={18} />, roles: ['admin', 'supervisor'] },
      { name: 'Cruce de jornadas', path: '/cruce', icon: <Layers size={18} />, roles: ['admin', 'supervisor'] },
      { name: 'Observados', path: '/observados', icon: <AlertCircle size={18} />, roles: ['admin', 'supervisor'] },
      { name: 'Rastreo GPS', path: '/rastreo', icon: <Navigation size={18} />, roles: ['admin', 'supervisor'] },
      { name: 'Inventario', path: '/inventario', icon: <Package size={18} />, roles: ['admin', 'supervisor'] },
    ],
  },
  {
    label: 'Sistema',
    items: [{ name: 'Usuarios', path: '/usuarios', icon: <Users size={18} />, roles: ['admin'] }],
  },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { user, logout } = useAuthStore();

  const canAccess = (item: MenuItem) => {
    if (!item.roles) return true;
    if (!user) return false;
    return item.roles.includes(user.rol);
  };

  return (
    <>
      {/* Fondo del drawer en pantallas chicas */}
      <div
        className={`fixed inset-0 z-[1100] bg-black/60 backdrop-blur-sm transition-opacity lg:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-[1101] flex w-64 flex-col border-r border-line bg-navy-950 transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Marca */}
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <img
            src={brandAsset('isotipo.webp')}
            alt="TELCOM"
            className="h-10 w-10 drop-shadow-[0_4px_12px_rgba(0,212,255,0.25)]"
          />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[15px] font-bold tracking-[0.14em] text-white">TELCOM</h1>
            <p className="text-[11px] text-gray-500">Centro de Operaciones</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-navy-800 hover:text-white lg:hidden"
            aria-label="Cerrar menú"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navegación */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {menuGroups.map((group, gi) => {
            const items = group.items.filter(canAccess);
            if (items.length === 0) return null;
            return (
              <div key={gi} className={gi > 0 ? 'mt-5' : ''}>
                {group.label && (
                  <p className="mb-2 px-3 font-display text-[9px] font-bold uppercase tracking-[0.24em] text-gray-400">
                    {group.label}
                  </p>
                )}
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.path === '/'}
                      onClick={onClose}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-gradient-to-r from-blue-600/25 to-blue-600/5 text-white shadow-[inset_2px_0_0_var(--color-electric)]'
                            : 'text-gray-500 hover:bg-navy-800 hover:text-gray-900'
                        }`
                      }
                    >
                      {item.icon}
                      <span>{item.name}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Cerrar sesión */}
        <div className="border-t border-line p-3">
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-500 transition-colors hover:bg-red-600/15 hover:text-red-400"
          >
            <LogOut size={18} />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>
    </>
  );
}
