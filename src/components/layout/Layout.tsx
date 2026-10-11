import { Outlet, useLocation } from 'react-router-dom';
import ErrorBoundary from '../ErrorBoundary';
import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import { usePointsStore } from '../../stores/pointsStore';
import SuministroDrawer from '../SuministroDrawer';

export default function Layout() {
  const { loadSheets } = usePointsStore();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    // Cargar hojas al montar el layout
    loadSheets();
  }, [loadSheets]);

  return (
    <div className="flex min-h-screen">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* Contenido principal */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenu={() => setMenuOpen(true)} />

        <main className="flex-1 overflow-auto p-4 sm:p-6">
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
        <SuministroDrawer />
      </div>
    </div>
  );
}
