import { useSuministroDrawer } from '../stores/suministroDrawerStore';
import { parseFecha } from '../components/map/dailyProgress';
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
  ListChecks,
} from 'lucide-react';
import { getStatusLabel } from '../types/point';
import { useMemo } from 'react';
import { formatCoords } from '../utils/format';
import { PageHeader, StatCard, SectionCard, EmptyState, Badge, STATUS_UI, ui } from '../components/ui';

/** Formatea un número con separador de miles (solo presentación). */
const fmt = (n: number | string | undefined | null) => {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString('es-PE') : String(n ?? '-');
};

/** Barra de progreso visual (solo presentación). */
function ProgressBar({ value, fill = 'bg-electric', height = 'h-2' }: { value: number | string; fill?: string; height?: string }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className={`w-full overflow-hidden rounded-full bg-gray-200 ${height}`}>
      <div className={`${height} rounded-full ${fill} transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function DashboardPage() {
  const { stats, filteredPoints, pointsExtended, selectedSheet, isLoading, lastUpdated, refreshPoints } = usePointsStore();
  const extendedStats = useExtendedStats();
  const sheetStructure = useSheetStructure();

  // Contar total de fotos
  const totalPhotos = filteredPoints.reduce((acc, p) => acc + (Number(p.photoCount) || 0), 0);

  // Avance por tecnico calculado localmente: cantidad REAL de suministros asignados
  // a cada tecnico (columna B) en la jornada, no los conteos agregados del API.
  const avancePorTecnico = useMemo(() => {
    const map: Record<string, { total: number; completado: number; en_proceso: number; pendiente: number }> = {};
    pointsExtended.forEach((p) => {
      // Técnico asignado (columna B) o, si no hay, quien lo trabajó desde su dispositivo
      const fotografo = (p.odtNombre || p.photoLinks?.find((l) => l.odtNombre)?.odtNombre || '').trim();
      const tecnico = (p.tecnico || '').trim() || fotografo || 'Sin asignar';
      if (!map[tecnico]) map[tecnico] = { total: 0, completado: 0, en_proceso: 0, pendiente: 0 };
      map[tecnico].total++;
      if (p.status === 'completado') map[tecnico].completado++;
      else if (p.status === 'en_proceso') map[tecnico].en_proceso++;
      else map[tecnico].pendiente++;
    });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [pointsExtended]);

  // Últimos suministros trabajados: los que tienen foto, ordenados por la foto más reciente
  const openFicha = useSuministroDrawer((st) => st.open);
  const ultimos = useMemo(() => {
    const fechaDe = (p: (typeof filteredPoints)[number]) => {
      const ds = (p.photoLinks || []).map((l) => parseFecha(l.fecha)?.getTime() ?? 0);
      const d = Math.max(0, ...ds, parseFecha(p.fechaSupervision)?.getTime() ?? 0, parseFecha(p.syncedAt)?.getTime() ?? 0);
      return d;
    };
    return filteredPoints
      .filter((p) => (p.photoCount || p.photoLinks?.length || 0) > 0)
      .map((p) => ({ p, t: fechaDe(p) }))
      .sort((a, b) => b.t - a.t)
      .slice(0, 10)
      .map((x) => x.p);
  }, [filteredPoints]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-electric"></div>
      </div>
    );
  }

  const conFoto = filteredPoints.filter(p => p.hasPhoto).length;
  const sinFoto = filteredPoints.filter(p => !p.hasPhoto).length;

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

      {/* Progreso y fotos */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Progreso general" icon={<TrendingUp size={18} />} className="hud-corners">
          <div className="space-y-5">
            <div>
              <div className="mb-2 flex items-end justify-between">
                <span className="text-sm text-gray-500">Avance de la jornada (completados / total)</span>
                <span className="font-mono text-2xl font-semibold text-electric">{stats.porcentaje}%</span>
              </div>
              <ProgressBar value={stats.porcentaje} height="h-3" fill="bg-gradient-to-r from-blue-600 to-electric" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Completados', value: stats.completados, dot: 'bg-green-500', text: 'text-green-700' },
                { label: 'En proceso', value: stats.enProceso, dot: 'bg-yellow-500', text: 'text-yellow-700' },
                { label: 'Pendientes', value: stats.pendientes, dot: 'bg-red-500', text: 'text-red-700' },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-center">
                  <p className="flex items-center justify-center gap-1.5 text-xs text-gray-500">
                    <span className={`h-2 w-2 rounded-full ${item.dot}`} />
                    {item.label}
                  </p>
                  <p className={`mt-1 font-mono text-lg font-semibold ${item.text}`}>{fmt(item.value)}</p>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Resumen de fotos" icon={<Camera size={18} />}>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <span className="text-sm text-gray-600">Fotos sincronizadas</span>
              <span className="font-mono text-2xl font-semibold text-electric">{fmt(totalPhotos)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <span className="text-sm text-gray-600">Suministros con foto</span>
              <span className="font-mono text-2xl font-semibold text-green-700">{fmt(conFoto)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <span className="text-sm text-gray-600">Suministros sin foto</span>
              <span className="font-mono text-2xl font-semibold text-red-700">{fmt(sinFoto)}</span>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Avance por técnico (solo estructura completa) */}
      {sheetStructure === 'extended' && avancePorTecnico.length > 0 && (
        <SectionCard
          title="Avance por técnico"
          icon={<Users size={18} />}
          actions={<span className="text-xs text-gray-500">{avancePorTecnico.length} técnicos</span>}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {avancePorTecnico.map(([tecnico, stats]) => {
              const porcentaje = stats.total > 0 ? ((stats.completado / stats.total) * 100).toFixed(1) : '0';
              return (
                <div key={tecnico} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-400/40 bg-cyan-400/10 font-mono text-sm font-bold text-electric">
                      {tecnico.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold text-gray-900" title={tecnico}>
                        {tecnico}
                      </h3>
                      <p className="text-xs text-gray-500">
                        <span className="font-mono text-gray-700">{fmt(stats.completado)}</span> de{' '}
                        <span className="font-mono text-gray-700">{fmt(stats.total)}</span> completados
                      </p>
                    </div>
                    <span className="font-mono text-sm font-semibold text-electric">{porcentaje}%</span>
                  </div>
                  <ProgressBar value={porcentaje} fill="bg-blue-600" />
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* Avance por distrito (solo estructura completa) */}
      {sheetStructure === 'extended' && extendedStats?.byDistrito && Object.keys(extendedStats.byDistrito).length > 0 && (
        <SectionCard title="Avance por distrito" icon={<Building2 size={18} />}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(extendedStats.byDistrito).map(([distrito, stats]) => {
              const porcentaje = stats.total > 0 ? ((stats.completado / stats.total) * 100).toFixed(1) : '0';
              return (
                <div key={distrito} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="truncate text-sm font-semibold text-gray-900" title={distrito}>
                      {distrito}
                    </h3>
                    <span className="font-mono text-sm font-semibold text-green-700">{porcentaje}%</span>
                  </div>
                  <ProgressBar value={porcentaje} fill="bg-green-500" />
                  <p className="mt-2 text-xs text-gray-500">
                    <span className="font-mono text-gray-700">{fmt(stats.completado)}</span> de{' '}
                    <span className="font-mono text-gray-700">{fmt(stats.total)}</span> completados
                  </p>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* Últimos puntos */}
      <SectionCard
        title="Últimos suministros actualizados"
        icon={<ListChecks size={18} />}
        actions={filteredPoints.length > 0 ? <span className="text-xs text-gray-500">Se muestran hasta 10</span> : undefined}
        bodyClassName="p-0"
      >
        {filteredPoints.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className={ui.theadRow}>
                  <th className={ui.th}>Suministro</th>
                  {sheetStructure === 'extended' && (
                    <>
                      <th className={ui.th}>Técnico</th>
                      <th className={ui.th}>Cliente</th>
                    </>
                  )}
                  <th className={ui.th}>Estado</th>
                  <th className={ui.th}>Fotos</th>
                  <th className={ui.th}>Coordenadas</th>
                </tr>
              </thead>
              <tbody>
                {ultimos.map((point, index) => (
                  <tr
                    key={`${point.suministro}-${index}`}
                    className={`${ui.tbodyRow} cursor-pointer`}
                    onClick={() => openFicha(point, selectedSheet)}
                    title="Ver ficha del suministro"
                  >
                    <td className={`${ui.td} font-mono font-medium text-electric`}>{point.suministro}</td>
                    {sheetStructure === 'extended' && (
                      <>
                        <td className={ui.td}>
                          {point.tecnico || point.odtNombre || '—'}
                          {!point.tecnico && point.odtNombre && (
                            <span className="ml-1 text-[10px] text-gray-400">(dispositivo)</span>
                          )}
                        </td>
                        <td className={`${ui.td} max-w-[180px] truncate`} title={point.clienteNombre || ''}>
                          {point.clienteNombre || '—'}
                        </td>
                      </>
                    )}
                    <td className={ui.td}>
                      <Badge tone={STATUS_UI[point.status]?.tone ?? 'red'} dot>
                        {getStatusLabel(point.status)}
                      </Badge>
                    </td>
                    <td className={`${ui.td} font-mono`}>{point.photoCount}</td>
                    <td className={`${ui.td} font-mono text-xs`}>
                      {formatCoords(point.latReal, point.longReal)
                        ?? formatCoords(point.latRef, point.longRef)
                        ?? 'Sin coordenadas'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
      </SectionCard>

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
                <p className="truncate text-sm font-medium text-gray-900 group-hover:text-electric">Seguimiento SEACE</p>
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
                <p className="truncate text-sm font-medium text-gray-900 group-hover:text-electric">Administrar trabajadores</p>
                <p className="truncate text-xs text-gray-500">Gestión de personal</p>
              </div>
            </a>
          </div>
        </SectionCard>

        <SectionCard title="Herramientas IA" icon={<Brain size={16} />} bodyClassName="p-3">
          <div className="grid grid-cols-3 gap-2">
            {[
              { href: 'https://gemini.google.com/app', label: 'Gemini', icon: <Sparkles size={16} />, color: 'text-purple-700' },
              { href: 'https://notebooklm.google.com/', label: 'NotebookLM', icon: <Brain size={16} />, color: 'text-amber-700' },
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
                <span className="truncate text-sm font-medium text-gray-900 group-hover:text-electric">{tool.label}</span>
              </a>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
