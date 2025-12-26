import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Mail, Lock, LogIn } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { login } from '../services/authService';

export default function LoginPage() {
  const navigate = useNavigate();
  const { setUser } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (!email || !password) {
        setError('Por favor ingresa email y contraseña');
        return;
      }

      const result = await login({ email, password });

      if (result.success && result.user && result.token) {
        setUser(result.user, result.token);
        navigate('/');
      } else {
        setError(result.message || 'Credenciales inválidas');
      }
    } catch (err) {
      console.error('Error en login:', err);
      setError('Error de conexión con el servidor');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gray-800 px-8 py-6">
          <div className="flex items-center justify-center gap-3">
            <div className="bg-blue-600 p-3 rounded-xl">
              <Zap className="text-white" size={32} />
            </div>
            <div>
              <h1 className="text-white font-bold text-2xl">TELCOM</h1>
              <p className="text-gray-400 text-sm">Dashboard de Control</p>
            </div>
          </div>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Iniciar Sesión</h2>
            <p className="text-gray-500 mt-1">
              Ingresa tus credenciales para continuar
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Correo Electrónico
              </label>
              <div className="relative">
                <Mail
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                  size={20}
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Contraseña
              </label>
              <div className="relative">
                <Lock
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                  size={20}
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              <>
                <LogIn size={20} />
                Ingresar
              </>
            )}
          </button>

          <p className="text-center text-sm text-gray-500">
            ¿Olvidaste tu contraseña?{' '}
            <a href="#" className="text-blue-600 hover:underline">
              Recuperar
            </a>
          </p>
        </form>

        {/* Footer */}
        <div className="px-8 py-4 bg-gray-50 border-t border-gray-200">
          <p className="text-center text-xs text-gray-500">
            TELCOM ENERGY © 2025 - Dashboard v1.0
          </p>
        </div>
      </div>
    </div>
  );
}
