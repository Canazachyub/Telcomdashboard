import { usePointsStore, useExtendedStats, useSheetStructure } from '../stores/pointsStore';
import {
  MapPin,
  CheckCircle,
  Clock,
  AlertCircle,
  TrendingUp,
  Camera,
  Users,
  Building2,
  RefreshCw,
  Database,
  Zap,
  ExternalLink,
  Link,
  Brain,
  Sparkles,
  Activity,
  Radar,
} from 'lucide-react';
import { useMemo } from 'react';
import { PageHeader, StatCard, SectionCard, EmptyState, Badge, ui } from '../components/ui';
import { Anillo, Participacion, PerfilTecnicos, Proyeccion, RitmoDiario } from '../components/resumen/Graficos';
import UltimasFotos from '../components/resumen/UltimasFotos';
import { coloresDe, fotosRecientes, resumirJornada, resumirTecnicos, ultimosDias } from '../utils/resumenJornadas';

/** Formatea un número con separador de miles (solo presentación). */
const fmt = (n: number | string | undefined | null) => {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString('es-PE') : String(n ?? '-');
};

export default function DashboardPage() {
  const { stats, filteredPoints, pointsExtended, selectedSheet, isLoading, lastUpdated, refreshPoints } =
    usePointsStore();
  const extendedStats = useExtendedStats();
  const sheetStructure = useSheetStructure();

  // Contar total de fotos
  const totalPhotos = filteredPoints.reduce((acc, p) => acc + (Number(p.photoCount) || 0), 0);

  // Avance, quién la llenó, ritmo y últimas fotos de esta jornada
  const resumen = useMemo(() => resumirJornada(selectedSheet || '', pointsExtended), [selectedSheet, pointsExtended]);
  const tecnicos = useMemo(
    () => resumirTecnicos([{ nombre: selectedSheet || '', points: pointsExtended }]),
    [selectedSheet, pointsExtended],
  );
  const colores = useMemo(() => coloresDe(tecnicos), [tecnicos]);
  const recientes = useMemo(
    () => fotosRecientes([{ nombre: selectedSheet || '', points: pointsExtended }], 48),
    [selectedSheet, pointsExtended],
  );
  const dias = useMemo(() => ultimosDias(14), []);
  const variosDistritos = Object.keys(extendedStats?.byDistrito || {}).length > 1;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-electric"></div>
      </div>
    );
  }

  const conFoto = filteredPoints.filter((p) => p.hasPhoto).length;
  const sinFoto = filteredPoints.filter((p) => !p.hasPhoto).length;

  return (
    <div className="space-y-6">
      {/* Cabecera con imagen de marca */}
      <PageHeader
        image="hero-torre.webp"
        kicker={selectedSheet ? 'Jornada activa' : 'Panel de control'}
        title={selectedSheet || 'Selecciona una jornada'}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {sheetStructure === 'extended' ? (
              <Badge tone="blue">
                <Database size={12} />
                Estructura completa
              </Badge>
            ) : (
              <Badge tone="gray">
                <Zap size={12} />
                Estructura simple
              </Badge>
            )}
            {lastUpdated && (
              <span>
                Última actualización: <span className="font-mono">{new Date(lastUpdated).toLocaleString('es-PE')}</span>
              </span>
            )}
          </span>
        }
        actions={
          <button onClick={() => refreshPoints()} disabled={isLoading} className={ui.btnPrimary}>
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            {isLoading ? 'Cargando...' : 'Actualizar'}
          </button>
        }
      />

      {/* Indicadores principales */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total de suministros" value={fmt(stats.total)} tone="cyan" icon={<MapPin size={20} />} />
        <StatCard label="Completados" value={fmt(stats.completados)} tone="green" icon={<CheckCircle size={20} />} />
        <StatCard label="En proceso" value={fmt(stats.enProceso)} tone="yellow" icon={<Clock size={20} />} />
        <StatCard label="Pendientes" value={fmt(stats.pendientes)} tone="red" icon={<AlertCircle size={20} />} />
      </div>

      {/* Avance (anillo por quién llenó) + ritmo diario */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <SectionCard title="Avance de la jornada" icon={<TrendingUp size={18} />} className="hud-corners">
          <div className="flex flex-col items-center gap-4">
            <Anillo
              size={190}
              grosor={22}
              total={resumen.total}
              tramos={resumen.tecnicos.map((t) => ({ valor: t.puntos, color: colores[t.nombre], etiqueta: t.nombre }))}
            >
              <span className="font-mono text-4xl font-semibold leading-none text-electric">{stats.porcentaje}%</span>
              <span className="mt-1 text-xs text-gray-500">
                {fmt(resumen.total - resumen.pendientes)} de {fmt(resumen.total)}
              </span>
            </Anillo>
            <div className="grid w-full grid-cols-3 gap-2 text-center">
              {[
                { label: 'Fotos', value: totalPhotos, text: 'text-electric' },
                { label: 'Con foto', value: conFoto, text: 'text-green-700' },
                { label: 'Sin foto', value: sinFoto, text: 'text-red-700' },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-gray-200 bg-gray-50 px-1 py-2">
                  <p className="text-[11px] text-gray-500">{item.label}</p>
                  <p className={`font-mono text-base font-semibold ${item.text}`}>{fmt(item.value)}</p>
                </div>
              ))}
            </div>
            <Proyeccion porDia={resumen.porDia} pendientes={resumen.pendientes} className="text-center" />
          </div>
        </SectionCard>

        <SectionCard
          title="Ritmo diario · últimos 14 días"
          icon={<Activity size={18} />}
          actions={<span className="text-xs text-gray-500">Suministros llenados por día</span>}
          className="xl:col-span-2"
        >
          <RitmoDiario dias={dias} tecnicos={tecnicos} colores={colores} />
        </SectionCard>
      </div>

      {/* Lo último que se está haciendo */}
      <SectionCard
        title="Lo último que se hizo"
        icon={<Camera size={18} />}
        actions={<span className="text-xs text-gray-500">La foto más reciente de cada suministro</span>}
      >
        <UltimasFotos fotos={recientes} colores={colores} />
      </SectionCard>

      {/* Quién la llenó + distritos */}
      {sheetStructure === 'extended' && tecnicos.length > 0 && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <SectionCard title="Quién la llenó" icon={<Users size={18} />}>
            <Participacion tecnicos={tecnicos} colores={colores} />
          </SectionCard>
          {variosDistritos ? (
            <SectionCard title="Avance por distrito" icon={<Building2 size={18} />} className="xl:col-span-2">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {Object.entries(extendedStats?.byDistrito || {}).map(([distrito, d]) => {
                  const pct = d.total > 0 ? (d.completado / d.total) * 100 : 0;
                  return (
                    <div
                      key={distrito}
                      className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-center"
                    >
                      <Anillo
                        size={92}
                        grosor={9}
                        total={d.total}
                        tramos={[{ valor: d.completado, color: '#22c55e', etiqueta: 'Completados' }]}
                      >
                        <span className="font-mono text-base font-semibold text-gray-900">{pct.toFixed(0)}%</span>
                      </Anillo>
                      <p className="break-words text-xs font-semibold text-gray-900">{distrito}</p>
                      <p className="text-[11px] text-gray-500">
                        {fmt(d.completado)} de {fmt(d.total)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          ) : (
            <SectionCard title="Perfil de cada técnico" icon={<Radar size={18} />} className="xl:col-span-2">
              <PerfilTecnicos tecnicos={tecnicos} dias={dias} colores={colores} />
            </SectionCard>
          )}
        </div>
      )}

      {filteredPoints.length === 0 && (
        <EmptyState
          icon="medidor"
          compact
          title="No hay suministros cargados"
          description="Selecciona una jornada para ver sus suministros."
        />
      )}

      {/* Accesos directos (menor peso visual) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Enlaces rápidos" icon={<Link size={16} />} bodyClassName="p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <a
              href="https://canazachyub.github.io/seacetelcom/"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5 transition-colors hover:border-electric/60 hover:bg-gray-50"
            >
              <ExternalLink className="shrink-0 text-blue-800" size={16} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900 group-hover:text-electric">
                  Seguimiento SEACE
                </p>
                <p className="truncate text-xs text-gray-500">Procesos de contratación</p>
              </div>
            </a>
            <a
              href="https://ingeneriatelcom.com/admin"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5 transition-colors hover:border-electric/60 hover:bg-gray-50"
            >
              <Users className="shrink-0 text-green-700" size={16} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900 group-hover:text-electric">
                  Administrar trabajadores
                </p>
                <p className="truncate text-xs text-gray-500">Gestión de personal</p>
              </div>
            </a>
          </div>
        </SectionCard>

        <SectionCard title="Herramientas IA" icon={<Brain size={16} />} bodyClassName="p-3">
          <div className="grid grid-cols-3 gap-2">
            {[
              {
                href: 'https://gemini.google.com/app',
                label: 'Gemini',
                icon: <Sparkles size={16} />,
                color: 'text-purple-700',
              },
              {
                href: 'https://notebooklm.google.com/',
                label: 'NotebookLM',
                icon: <Brain size={16} />,
                color: 'text-amber-700',
              },
              { href: 'https://chatgpt.com/', label: 'ChatGPT', icon: <Sparkles size={16} />, color: 'text-green-700' },
            ].map((tool) => (
              <a
                key={tool.label}
                href={tool.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 transition-colors hover:border-electric/60 hover:bg-gray-50"
              >
                <span className={tool.color}>{tool.icon}</span>
                <span className="truncate text-sm font-medium text-gray-900 group-hover:text-electric">
                  {tool.label}
                </span>
              </a>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
