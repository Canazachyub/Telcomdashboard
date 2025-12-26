import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Map,
  Users,
  FileText,
  Settings,
  LogOut,
  Zap,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Calendar,
  Package,
} from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';

interface MenuItem {
  name: string;
  path: string;
  icon: React.ReactNode;
  children?: MenuItem[];
  roles?: string[];
}

const menuItems: MenuItem[] = [
  {
    name: 'Dashboard',
    path: '/',
    icon: <LayoutDashboard size={20} />,
  },
  {
    name: 'Mapa',
    path: '/mapa',
    icon: <Map size={20} />,
  },
  {
    name: 'Suministros',
    path: '/suministros',
    icon: <ClipboardList size={20} />,
  },
  {
    name: 'Jornadas',
    path: '/jornadas',
    icon: <Calendar size={20} />,
    roles: ['admin', 'supervisor'],
  },
  {
    name: 'Inventario',
    path: '/inventario',
    icon: <Package size={20} />,
    roles: ['admin', 'supervisor'],
  },
  {
    name: 'Usuarios',
    path: '/usuarios',
    icon: <Users size={20} />,
    roles: ['admin'],
  },
  {
    name: 'Reportes',
    path: '/reportes',
    icon: <FileText size={20} />,
    roles: ['admin', 'supervisor'],
  },
];

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  const toggleExpanded = (name: string) => {
    setExpandedItems((prev) =>
      prev.includes(name)
        ? prev.filter((item) => item !== name)
        : [...prev, name]
    );
  };

  const canAccess = (item: MenuItem) => {
    if (!item.roles) return true;
    if (!user) return false;
    return item.roles.includes(user.rol);
  };

  const renderMenuItem = (item: MenuItem) => {
    if (!canAccess(item)) return null;

    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.includes(item.name);

    if (hasChildren) {
      return (
        <div key={item.name}>
          <button
            onClick={() => toggleExpanded(item.name)}
            className="w-full flex items-center justify-between px-4 py-3 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
          >
            <div className="flex items-center gap-3">
              {item.icon}
              <span>{item.name}</span>
            </div>
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          {isExpanded && (
            <div className="ml-4 border-l border-gray-700">
              {item.children?.map((child) => renderMenuItem(child))}
            </div>
          )}
        </div>
      );
    }

    return (
      <NavLink
        key={item.path}
        to={item.path}
        className={({ isActive }) =>
          `flex items-center gap-3 px-4 py-3 transition-colors ${
            isActive
              ? 'bg-primary-600 text-white'
              : 'text-gray-300 hover:bg-gray-700 hover:text-white'
          }`
        }
      >
        {item.icon}
        <span>{item.name}</span>
      </NavLink>
    );
  };

  return (
    <aside className="w-64 bg-gray-800 min-h-screen flex flex-col">
      {/* Logo */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <div className="bg-primary-600 p-2 rounded-lg">
            <Zap className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-white font-bold text-lg">TELCOM</h1>
            <p className="text-gray-400 text-xs">Dashboard</p>
          </div>
        </div>
      </div>

      {/* Menú de navegación */}
      <nav className="flex-1 py-4">
        {menuItems.map(renderMenuItem)}
      </nav>

      {/* Configuración y Cerrar sesión */}
      <div className="border-t border-gray-700 p-4">
        <NavLink
          to="/configuracion"
          className="flex items-center gap-3 px-4 py-3 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors rounded"
        >
          <Settings size={20} />
          <span>Configuración</span>
        </NavLink>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-4 py-3 text-gray-300 hover:bg-red-600 hover:text-white transition-colors rounded mt-2"
        >
          <LogOut size={20} />
          <span>Cerrar Sesión</span>
        </button>
      </div>
    </aside>
  );
}
