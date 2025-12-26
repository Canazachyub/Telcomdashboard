import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import Layout from './components/layout/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import MapPage from './pages/MapPage';
import SuministrosPage from './pages/SuministrosPage';
import UsersPage from './pages/UsersPage';
import JornadasPage from './pages/JornadasPage';
import ReportesPage from './pages/ReportesPage';
import InventoryPage from './pages/InventoryPage';

// Componente para rutas protegidas
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// Componente para rutas de admin
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.rol !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

// Componente para rutas de supervisor (admin o supervisor)
function SupervisorRoute({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.rol === 'tecnico') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter basename="/Telcomdashboard">
      <Routes>
        {/* Ruta pública - Login */}
        <Route path="/login" element={<LoginPage />} />

        {/* Rutas protegidas con Layout */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="mapa" element={<MapPage />} />
          <Route path="suministros" element={<SuministrosPage />} />
          <Route
            path="jornadas"
            element={
              <SupervisorRoute>
                <JornadasPage />
              </SupervisorRoute>
            }
          />
          <Route
            path="reportes"
            element={
              <SupervisorRoute>
                <ReportesPage />
              </SupervisorRoute>
            }
          />
          <Route
            path="inventario"
            element={
              <SupervisorRoute>
                <InventoryPage />
              </SupervisorRoute>
            }
          />

          {/* Rutas solo para admin */}
          <Route
            path="usuarios"
            element={
              <AdminRoute>
                <UsersPage />
              </AdminRoute>
            }
          />
        </Route>

        {/* Redirección por defecto */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
