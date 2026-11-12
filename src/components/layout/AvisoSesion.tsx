// Franja arriba de todo cuando la sesión del servidor ya venció (24 h). El dashboard sigue
// mostrando datos, pero guardar cambios fallaría: se pide volver a iniciar sesión.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, LogIn } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { EVENTO_REVISAR_SESION, sesionVencida } from '../../utils/sesion';

const CADA_MS = 2 * 60 * 1000;

export default function AvisoSesion() {
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const revisar = () => setAhora(Date.now());
    const t = window.setInterval(revisar, CADA_MS);
    window.addEventListener('focus', revisar);
    window.addEventListener(EVENTO_REVISAR_SESION, revisar);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('focus', revisar);
      window.removeEventListener(EVENTO_REVISAR_SESION, revisar);
    };
  }, []);

  // `token` se lee para recalcular al cambiar de sesión; el valor que vale es el de localStorage
  const vencida = !!token && sesionVencida(ahora);
  if (!vencida) return null;

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-sm text-amber-800"
    >
      <span className="flex items-center gap-2 font-semibold">
        <Clock size={16} className="shrink-0" />
        Tu sesión venció. Vuelve a iniciar sesión para guardar cambios.
      </span>
      <button
        onClick={() => {
          logout();
          navigate('/login', { replace: true });
        }}
        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1 text-xs font-bold text-navy-950 hover:bg-amber-400"
      >
        <LogIn size={14} /> Iniciar sesión
      </button>
    </div>
  );
}
