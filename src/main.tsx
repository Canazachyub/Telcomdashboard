import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { useAuthStore } from './stores/authStore';

// Si se abre la app fuera del basename (p.ej. "/" o "/Telcomdashboard" sin barra),
// React Router no renderiza nada (pagina en blanco). Redirigir al base configurado.
const base = import.meta.env.BASE_URL; // '/Telcomdashboard/'
const baseNoSlash = base.replace(/\/$/, '');
const { pathname, search, hash } = window.location;
if (baseNoSlash && pathname !== baseNoSlash && !pathname.startsWith(base)) {
  window.history.replaceState(null, '', base + search + hash);
}

// Solo en desarrollo: ?demo=1 entra con un supervisor ficticio para grabar tutoriales
// (sin contraseña real; el token 'demo' no sirve para escribir en el servidor).
if (import.meta.env.DEV && new URLSearchParams(search).get('demo') === '1') {
  useAuthStore
    .getState()
    .setUser(
      { id: 'demo', email: 'demo@telcom.local', nombre: 'Supervisor TELCOM', rol: 'supervisor', activo: true },
      'demo',
    );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
