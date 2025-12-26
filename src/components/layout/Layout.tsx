import { Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import { usePointsStore } from '../../stores/pointsStore';

export default function Layout() {
  const { loadSheets } = usePointsStore();

  useEffect(() => {
    // Cargar hojas al montar el layout
    loadSheets();
  }, [loadSheets]);

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Sidebar */}
      <Sidebar />

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <Header />

        {/* Área de contenido */}
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
