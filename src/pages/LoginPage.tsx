import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, LogIn, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { login } from '../services/authService';
import { brandAsset } from '../config/brand';
import LoginBackground from '../components/LoginBackground';
import { LOGIN_SLIDES, type LoginSlide } from '../config/loginSlides';
import ElectricIntro from '../components/electric/ElectricIntro';
import ElectricLogo from '../components/electric/ElectricLogo';

const INTRO_KEY = 'telcom-intro-visto';

function introYaVista() {
  try {
    return sessionStorage.getItem(INTRO_KEY) === '1';
  } catch {
    return false;
  }
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { setUser } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showIntro, setShowIntro] = useState(() => !introYaVista());
  const [slide, setSlide] = useState<LoginSlide>(LOGIN_SLIDES[0]);

  const endIntro = useCallback(() => {
    setShowIntro(false);
    try {
      sessionStorage.setItem(INTRO_KEY, '1');
    } catch {
      // sin almacenamiento: la intro se verá otra vez, no es grave
    }
  }, []);

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

  const inputClass =
    'w-full rounded-xl border border-line-strong bg-navy-950/60 py-3 pl-11 pr-4 text-sm text-gray-900 outline-none transition focus:border-electric focus:ring-4 focus:ring-[rgb(0_212_255/0.12)]';

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-navy-950 px-4 py-10 lg:justify-end lg:px-[7vw]">
      {/* Imagen de fondo a pantalla completa */}
      <LoginBackground onSlideChange={setSlide} />
      <div className="absolute inset-0 bg-gradient-to-r from-navy-950/45 via-transparent to-navy-950/75" />
      <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-navy-950/95 via-navy-950/60 to-transparent" />
      <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-navy-950/70 to-transparent" />

      {showIntro && <ElectricIntro onDone={endIntro} />}

      {/* Marca de la empresa (sobre la imagen) */}
      <div className="pointer-events-none absolute left-6 top-8 hidden lg:left-12 lg:top-10 lg:block">
        <img
          src={brandAsset('logo-horizontal.webp')}
          alt="Ingeniería Telcom E.I.R.L."
          className="h-36 w-auto drop-shadow-[0_10px_30px_rgba(0,0,0,0.55)] xl:h-44"
        />
        <div className="mt-5 flex items-center gap-3">
          <span className="h-px w-10 bg-energy" />
          <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-white/90">
            Especialistas en supervisión del sector eléctrico
          </p>
        </div>
      </div>

      {/* Frase del área, cambia con cada imagen */}
      <div className="pointer-events-none absolute bottom-16 left-6 hidden max-w-2xl lg:left-12 lg:block">
        <div key={slide.file} className="animate-[slideText_0.8s_ease-out]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-energy">{slide.etiqueta}</p>
          <p className="mt-2 text-2xl font-medium leading-snug text-white xl:text-[1.75rem]">{slide.texto}</p>
        </div>
      </div>

      {/* Panel de acceso */}
      <div className="hud-corners relative w-full max-w-md rounded-2xl border border-white/10 bg-navy-900/70 p-8 shadow-[0_30px_80px_rgb(0_0_0/0.55)] backdrop-blur-xl sm:p-10">
        <div className="pointer-events-none absolute inset-x-10 -top-px h-px bg-gradient-to-r from-transparent via-electric to-transparent opacity-80" />

        <div className="flex items-center gap-3">
          <ElectricLogo size={56} />
          <div>
            <h1 className="font-display text-xl font-bold tracking-[0.14em] text-white">TELCOM</h1>
            <p className="text-xs text-gray-500">Ingeniería Telcom E.I.R.L.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-9 space-y-5">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Iniciar sesión</h2>
            <p className="mt-1 text-sm text-gray-500">Ingresa tus credenciales para continuar</p>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
          )}

          <div>
            <label className="mb-2 block text-xs font-semibold text-gray-600">Correo electrónico</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold text-gray-600">Contraseña</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`${inputClass} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:text-gray-700"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-b from-[#2f6bf0] to-blue-600 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_rgb(37_99_235/0.45)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-20deg] bg-white/20 opacity-0 transition-all duration-700 group-hover:left-[110%] group-hover:opacity-100" />
            {isLoading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <>
                <LogIn size={18} />
                Ingresar
              </>
            )}
          </button>
        </form>

        <p className="mt-10 text-center text-xs text-gray-400">© {new Date().getFullYear()} Ingeniería Telcom E.I.R.L.</p>
      </div>
    </div>
  );
}
