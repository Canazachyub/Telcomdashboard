// Componentes de interfaz compartidos por todas las páginas (solo presentación).
import type { ReactNode } from 'react';
import { brandAsset } from '../../config/brand';

/* ------------------------------------------------------------------ */
/* Cabecera de página                                                  */
/* ------------------------------------------------------------------ */
interface PageHeaderProps {
  kicker?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  /** Imagen de fondo opcional (archivo de public/brand) */
  image?: string;
}

export function PageHeader({ kicker, title, subtitle, icon, actions, image }: PageHeaderProps) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white bg-cover bg-right"
      style={image ? { backgroundImage: `url(${brandAsset(image)})` } : undefined}
    >
      {image && <div className="absolute inset-0 bg-gradient-to-r from-navy-850 via-navy-850/90 to-navy-850/40" />}
      <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {kicker && <p className="brand-kicker">{kicker}</p>}
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-gray-900">
            {icon && <span className="text-electric">{icon}</span>}
            <span className="truncate">{title}</span>
          </h1>
          {subtitle && <div className="mt-1 text-sm text-gray-500">{subtitle}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tarjeta de indicador (KPI)                                          */
/* ------------------------------------------------------------------ */
export type Tone = 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'cyan' | 'gray' | 'amber';

const TONE: Record<Tone, { text: string; dot: string; glow: string }> = {
  blue: { text: 'text-blue-800', dot: 'bg-blue-600', glow: 'from-blue-600/15' },
  green: { text: 'text-green-700', dot: 'bg-green-500', glow: 'from-green-500/15' },
  yellow: { text: 'text-yellow-700', dot: 'bg-yellow-500', glow: 'from-yellow-500/15' },
  amber: { text: 'text-amber-700', dot: 'bg-amber-500', glow: 'from-amber-500/15' },
  red: { text: 'text-red-700', dot: 'bg-red-500', glow: 'from-red-500/15' },
  purple: { text: 'text-purple-700', dot: 'bg-purple-500', glow: 'from-purple-500/15' },
  cyan: { text: 'text-electric', dot: 'bg-electric', glow: 'from-cyan-400/15' },
  gray: { text: 'text-gray-900', dot: 'bg-gray-400', glow: 'from-gray-400/10' },
};

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  onClick?: () => void;
  active?: boolean;
}

export function StatCard({ label, value, hint, icon, tone = 'gray', onClick, active }: StatCardProps) {
  const t = TONE[tone];
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl border bg-white p-4 text-left transition-colors ${
        active ? 'border-electric' : 'border-gray-200'
      } ${onClick ? 'hover:border-electric/60' : ''}`}
    >
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${t.glow} to-transparent`} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-medium text-gray-500">
            <span className={`h-2 w-2 rounded-sm ${t.dot}`} />
            {label}
          </p>
          <p className={`mt-2 font-mono text-3xl font-semibold leading-none tracking-tight ${t.text}`}>{value}</p>
          {hint && <p className="mt-2 text-xs text-gray-500">{hint}</p>}
        </div>
        {icon && <div className={`rounded-xl border border-gray-200 bg-gray-50 p-2 ${t.text}`}>{icon}</div>}
      </div>
    </Comp>
  );
}

/* ------------------------------------------------------------------ */
/* Tarjeta de sección                                                  */
/* ------------------------------------------------------------------ */
interface SectionCardProps {
  title?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function SectionCard({ title, icon, actions, children, className = '', bodyClassName = 'p-5' }: SectionCardProps) {
  return (
    <section className={`rounded-2xl border border-gray-200 bg-white ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            {icon && <span className="text-electric">{icon}</span>}
            {title}
          </h2>
          {actions}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Estado vacío con ícono 3D de marca                                  */
/* ------------------------------------------------------------------ */
export type BrandIcon = 'medidor' | 'mapa' | 'inventario' | 'rastreo' | 'reporte';

interface EmptyStateProps {
  icon?: BrandIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ icon = 'reporte', title, description, action, compact }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8' : 'py-14'}`}>
      <img
        src={brandAsset(`icon-${icon}.webp`)}
        alt=""
        className={`${compact ? 'h-20 w-20' : 'h-28 w-28'} drop-shadow-[0_10px_24px_rgba(0,212,255,0.25)]`}
      />
      <h3 className="mt-3 font-semibold text-gray-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-gray-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Insignia de estado                                                  */
/* ------------------------------------------------------------------ */
const BADGE: Record<Tone, string> = {
  blue: 'border-blue-200 bg-blue-50 text-blue-800',
  green: 'border-green-200 bg-green-50 text-green-800',
  yellow: 'border-yellow-200 bg-yellow-50 text-yellow-800',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  red: 'border-red-200 bg-red-50 text-red-800',
  purple: 'border-purple-200 bg-purple-50 text-purple-800',
  cyan: 'border-cyan-400/40 bg-cyan-400/10 text-electric',
  gray: 'border-gray-200 bg-gray-100 text-gray-600',
};

export function Badge({ tone = 'gray', children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${BADGE[tone]}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${TONE[tone].dot}`} />}
      {children}
    </span>
  );
}
