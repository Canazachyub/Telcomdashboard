import { useState, useEffect, useCallback } from 'react';
import {
  Calendar, Plus, Settings, RefreshCw, BarChart3, Users, Building2,
  CheckCircle2, Clock, AlertCircle, TrendingUp, Eye, ChevronRight,
  X, Loader2, FileSpreadsheet, Layers
} from 'lucide-react';
import { usePointsStore } from '../stores/pointsStore';
import { getStats, getSheetMetadata } from '../services/pointsService';
import type { ExtendedStats, SheetMetadata } from '../types/point';
import { API_POINTS } from '../config/api';
import { isJornadaSheet } from '../utils/sheets';
import { PageHeader, StatCard, SectionCard, EmptyState, Badge, ui } from '../components/ui';

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

interface JornadaStats {
  sheetName: string;
  stats: ExtendedStats | null;
  loading: boolean;
  error: string | null;
}

interface CreateSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

// Modal para crear nueva jornada
function CreateSheetModal({ isOpen, onClose, onCreated }: CreateSheetModalProps) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Escribe un nombre para la jornada');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Mismo patron que el resto de POST: FormData con `payload` (evita preflight CORS)
      const formData = new FormData();
      formData.append('payload', JSON.stringify({ action: 'createSheet', sheetName: name.trim() }));
      const response = await fetch(API_POINTS, {
        method: 'POST',
        body: formData,
        redirect: 'follow'
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();

      if (data.success) {
        setName('');
        onCreated();
        onClose();
      } else {
        setError(data.message || 'No se pudo crear la jornada');
      }
    } catch (err) {
      setError('Error de conexión. Verifica tu internet e inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <p className="brand-kicker">Jornadas</p>
            <h3 className="text-lg font-semibold text-gray-900">Nueva jornada</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Nombre de la jornada
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej.: Jornada_Enero_2025"
              className={ui.input}
            />
            <p className="mt-1.5 text-xs text-gray-500">Se creará una nueva hoja con este nombre en la planilla de Google Sheets.</p>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <button onClick={onClose} className={ui.btnSecondary}>
            Cancelar
          </button>
          <button onClick={handleCreate} disabled={loading} className={ui.btnPrimary}>
            {loading && <Loader2 size={16} className="animate-spin" />}
            Crear jornada
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal de detalle de jornada
interface DetailModalProps {
  isOpen: boolean;
  stats: ExtendedStats | null;
  onClose: () => void;
  onSelect: () => void;
}

function JornadaDetailModal({ isOpen, stats, onClose, onSelect }: DetailModalProps) {
  if (!isOpen || !stats) return null;

  const { totals, byTecnico, byDistrito } = stats;
  const tecnicoEntries = Object.entries(byTecnico || {});
  const distritoEntries = Object.entries(byDistrito || {});

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <p className="brand-kicker">Detalle de la jornada</p>
            <h3 className="truncate text-lg font-semibold text-gray-900">{stats.sheetName}</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {/* Resumen general */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Total" value={fmt(totals.total)} tone="cyan" />
            <StatCard label="Completados" value={fmt(totals.completado)} tone="green" />
            <StatCard label="En proceso" value={fmt(totals.en_proceso)} tone="yellow" />
            <StatCard label="Pendientes" value={fmt(totals.pendiente)} tone="red" />
          </div>

          {/* Barra de progreso */}
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <div className="mb-2 flex items-end justify-between">
              <span className="text-sm font-medium text-gray-700">Progreso general (completados / total)</span>
              <span className="font-mono text-2xl font-semibold text-electric">{totals.porcentajeAvance}%</span>
            </div>
            <ProgressBar value={totals.porcentajeAvance} height="h-3" fill="bg-gradient-to-r from-green-600 to-green-400" />
          </div>

          {/* Por técnico */}
          {tecnicoEntries.length > 0 && (
            <div>
              <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Users size={16} className="text-electric" />
                Por técnico
                <Badge tone="gray">{tecnicoEntries.length}</Badge>
              </h4>
              <div className={ui.tableWrap}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px]">
                    <thead>
                      <tr className={ui.theadRow}>
                        <th className={ui.th}>Técnico</th>
                        <th className={`${ui.th} text-center`}>Total</th>
                        <th className={`${ui.th} text-center`}>Completados</th>
                        <th className={`${ui.th} text-center`}>En proceso</th>
                        <th className={`${ui.th} text-center`}>Pendientes</th>
                        <th className={ui.th}>Avance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tecnicoEntries.map(([tecnico, data]) => {
                        const pct = data.total > 0 ? ((data.completado / data.total) * 100).toFixed(1) : '0';
                        return (
                          <tr key={tecnico} className={ui.tbodyRow}>
                            <td className={`${ui.td} font-medium text-gray-900`}>{tecnico}</td>
                            <td className={`${ui.td} text-center font-mono`}>{fmt(data.total)}</td>
                            <td className={`${ui.td} text-center font-mono text-green-700`}>{fmt(data.completado)}</td>
                            <td className={`${ui.td} text-center font-mono text-yellow-700`}>{fmt(data.en_proceso)}</td>
                            <td className={`${ui.td} text-center font-mono text-red-700`}>{fmt(data.pendiente)}</td>
                            <td className={ui.td}>
                              <div className="flex items-center gap-2">
                                <div className="flex-1">
                                  <ProgressBar value={pct} fill="bg-green-500" />
                                </div>
                                <span className="w-14 text-right font-mono text-xs font-semibold text-gray-900">{pct}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Por distrito */}
          {distritoEntries.length > 0 && (
            <div>
              <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Building2 size={16} className="text-electric" />
                Por distrito
                <Badge tone="gray">{distritoEntries.length}</Badge>
              </h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {distritoEntries.map(([distrito, data]) => {
                  const pct = data.total > 0 ? ((data.completado / data.total) * 100).toFixed(0) : '0';
                  return (
                    <div key={distrito} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <div className="mb-1 truncate text-sm font-medium text-gray-900" title={distrito}>{distrito}</div>
                      <div className="mb-1.5 flex items-center justify-between text-xs text-gray-500">
                        <span>
                          <span className="font-mono text-gray-700">{fmt(data.completado)}</span> de{' '}
                          <span className="font-mono text-gray-700">{fmt(data.total)}</span>
                        </span>
                        <span className="font-mono font-semibold text-purple-700">{pct}%</span>
                      </div>
                      <ProgressBar value={pct} fill="bg-purple-500" height="h-1.5" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-200 px-5 py-4 sm:flex-row sm:justify-end">
          <button onClick={onClose} className={ui.btnSecondary}>
            Cerrar
          </button>
          <button onClick={onSelect} className={ui.btnPrimary}>
            Trabajar con esta jornada
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function JornadasPage() {
  const { sheets, selectedSheet, setSelectedSheet, loadSheets } = usePointsStore();
  const [jornadaStats, setJornadaStats] = useState<Record<string, JornadaStats>>({});
  const [metadata, setMetadata] = useState<SheetMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedJornada, setSelectedJornada] = useState<string | null>(null);

  // Cargar estadisticas de todas las jornadas
  const loadAllStats = useCallback(async () => {
    if (sheets.length === 0) return;

    setLoading(true);

    // Inicializar estado de carga
    const initialStats: Record<string, JornadaStats> = {};
    sheets.forEach(sheet => {
      initialStats[sheet.name] = {
        sheetName: sheet.name,
        stats: null,
        loading: true,
        error: null
      };
    });
    setJornadaStats(initialStats);

    // Cargar stats en paralelo (maximo 3 concurrentes)
    const batchSize = 3;
    for (let i = 0; i < sheets.length; i += batchSize) {
      const batch = sheets.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (sheet) => {
          try {
            const stats = await getStats(sheet.name);
            // getStats devuelve null (no lanza) ante error de red
            const valid = !!stats && stats.success !== false && !!stats.totals;
            setJornadaStats(prev => ({
              ...prev,
              [sheet.name]: {
                sheetName: sheet.name,
                stats: valid ? stats : null,
                loading: false,
                error: valid ? null : 'No se pudieron cargar las estadísticas'
              }
            }));
          } catch (err) {
            setJornadaStats(prev => ({
              ...prev,
              [sheet.name]: {
                sheetName: sheet.name,
                stats: null,
                loading: false,
                error: 'Error al cargar los datos'
              }
            }));
          }
        })
      );
    }

    setLoading(false);
  }, [sheets]);

  // Cargar metadata
  const loadMetadata = useCallback(async () => {
    const response = await getSheetMetadata();
    if (response?.success) {
      setMetadata(response.sheets);
    }
  }, []);

  useEffect(() => {
    loadAllStats();
    loadMetadata();
  }, [loadAllStats, loadMetadata]);

  const handleRefresh = async () => {
    // loadSheets actualiza `sheets`; el efecto de arriba recarga stats y metadata
    // (evita la doble carga con un closure viejo de `sheets`)
    await loadSheets();
  };

  const handleJornadaCreated = async () => {
    await loadSheets();
  };

  const handleSelectJornada = (sheetName: string) => {
    setSelectedSheet(sheetName);
    setSelectedJornada(null);
  };

  // Calcular totales globales: suma de TODAS las jornadas reales actualmente listadas
  // (excluye hojas de sistema y entradas obsoletas de hojas que ya no existen)
  const globalTotals = sheets
    .filter(sheet => isJornadaSheet(sheet.name))
    .reduce(
      (acc, sheet) => {
        const totals = jornadaStats[sheet.name]?.stats?.totals;
        if (totals) {
          acc.total += Number(totals.total) || 0;
          acc.completado += Number(totals.completado) || 0;
          acc.en_proceso += Number(totals.en_proceso) || 0;
          acc.pendiente += Number(totals.pendiente) || 0;
          acc.jornadasConDatos++;
        }
        return acc;
      },
      { total: 0, completado: 0, en_proceso: 0, pendiente: 0, jornadasConDatos: 0 }
    );
  const globalPorcentaje = globalTotals.total > 0
    ? ((globalTotals.completado / globalTotals.total) * 100).toFixed(1)
    : '0';

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <PageHeader
        kicker="Planificación"
        title="Jornadas"
        icon={<Calendar size={24} />}
        subtitle={`Gestiona las jornadas de trabajo · ${sheets.length} ${sheets.length === 1 ? 'jornada' : 'jornadas'}`}
        actions={
          <>
            <button onClick={handleRefresh} disabled={loading} className={ui.btnSecondary}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Actualizar
            </button>
            <button onClick={() => setShowCreateModal(true)} className={ui.btnPrimary}>
              <Plus size={16} />
              Nueva jornada
            </button>
          </>
        }
      />

      {/* Resumen global */}
      <SectionCard
        title="Resumen de todas las jornadas"
        icon={<BarChart3 size={18} />}
        className="hud-corners"
        actions={
          <span className="text-xs text-gray-500">
            <span className="font-mono text-gray-700">{globalTotals.jornadasConDatos}</span> de{' '}
            <span className="font-mono text-gray-700">{sheets.length}</span> jornadas con datos
          </span>
        }
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Total de suministros" value={fmt(globalTotals.total)} tone="cyan" icon={<Layers size={18} />} />
          <StatCard label="Completados" value={fmt(globalTotals.completado)} tone="green" icon={<CheckCircle2 size={18} />} />
          <StatCard label="En proceso" value={fmt(globalTotals.en_proceso)} tone="yellow" icon={<Clock size={18} />} />
          <StatCard label="Pendientes" value={fmt(globalTotals.pendiente)} tone="red" icon={<AlertCircle size={18} />} />
          <StatCard label="Avance total" value={`${globalPorcentaje}%`} tone="blue" icon={<TrendingUp size={18} />} />
        </div>
      </SectionCard>

      {/* Lista de jornadas */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sheets.map((sheet) => {
          const jStats = jornadaStats[sheet.name];
          const sheetMeta = metadata.find(m => m.name === sheet.name);
          const stats = jStats?.stats;
          const isActive = selectedSheet === sheet.name;

          return (
            <div
              key={sheet.id}
              className={`flex flex-col overflow-hidden rounded-2xl border bg-white transition-colors ${
                isActive
                  ? 'border-electric shadow-[0_0_0_1px_rgb(0_212_255/0.35),0_10px_30px_rgb(0_212_255/0.08)]'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {/* Cabecera de la tarjeta */}
              <div className="border-b border-gray-200 px-4 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`shrink-0 rounded-xl border p-2 ${isActive ? 'border-cyan-400/40 bg-cyan-400/10 text-electric' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
                      <FileSpreadsheet size={18} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-gray-900" title={sheet.name}>{sheet.name}</h3>
                      <p className="text-xs text-gray-500">
                        {sheetMeta?.structure === 'extended' ? 'Estructura completa' : 'Estructura simple'}
                      </p>
                    </div>
                  </div>
                  {isActive && (
                    <Badge tone="cyan" dot>
                      Activa
                    </Badge>
                  )}
                </div>
              </div>

              {/* Contenido */}
              <div className="flex-1 p-4">
                {jStats?.loading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="animate-spin text-gray-400" size={24} />
                  </div>
                ) : jStats?.error ? (
                  <div className="py-6 text-center text-sm text-red-700">
                    {jStats.error}
                  </div>
                ) : stats ? (
                  <div className="space-y-4">
                    {/* Indicadores */}
                    <div className="grid grid-cols-4 gap-1.5 text-center">
                      {[
                        { label: 'Total', value: stats.totals.total, text: 'text-gray-900' },
                        { label: 'Completados', value: stats.totals.completado, text: 'text-green-700' },
                        { label: 'En proceso', value: stats.totals.en_proceso, text: 'text-yellow-700' },
                        { label: 'Pendientes', value: stats.totals.pendiente, text: 'text-red-700' },
                      ].map((item) => (
                        <div key={item.label} className="rounded-lg border border-gray-200 bg-gray-50 px-1 py-2">
                          <div className={`font-mono text-base font-semibold ${item.text}`}>{fmt(item.value)}</div>
                          <div className="mt-0.5 truncate text-[10px] text-gray-500" title={item.label}>{item.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Barra de progreso */}
                    <div>
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <span className="text-gray-500">Avance</span>
                        <span className="font-mono font-semibold text-electric">{stats.totals.porcentajeAvance}%</span>
                      </div>
                      <ProgressBar value={stats.totals.porcentajeAvance} fill="bg-gradient-to-r from-blue-600 to-green-500" />
                    </div>

                    {/* Info adicional */}
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Users size={12} />
                        <span className="font-mono text-gray-700">{Object.keys(stats.byTecnico || {}).length}</span> técnicos
                      </span>
                      <span className="flex items-center gap-1">
                        <Building2 size={12} />
                        <span className="font-mono text-gray-700">{Object.keys(stats.byDistrito || {}).length}</span> distritos
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="py-6 text-center text-sm text-gray-400">
                    Sin datos registrados
                  </div>
                )}
              </div>

              {/* Acciones */}
              <div className="flex items-center justify-between border-t border-gray-200 px-4 py-2.5">
                <button
                  onClick={() => setSelectedJornada(sheet.name)}
                  disabled={!stats}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-blue-800 transition hover:text-electric disabled:cursor-not-allowed disabled:text-gray-400"
                >
                  <Eye size={14} />
                  Ver detalle
                </button>
                <button
                  onClick={() => handleSelectJornada(sheet.name)}
                  className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium transition ${
                    isActive
                      ? 'cursor-default text-gray-400'
                      : 'text-green-700 hover:text-electric'
                  }`}
                  disabled={isActive}
                >
                  <Settings size={14} />
                  {isActive ? 'En uso' : 'Usar esta jornada'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {sheets.length === 0 && (
        <SectionCard>
          <EmptyState
            icon="reporte"
            title="No hay jornadas disponibles"
            description="Las jornadas se cargan desde la planilla de Google Sheets. Crea la primera para empezar."
            action={
              <button onClick={() => setShowCreateModal(true)} className={ui.btnPrimary}>
                <Plus size={16} />
                Crear primera jornada
              </button>
            }
          />
        </SectionCard>
      )}

      {/* Nota informativa */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <p className="font-medium">¿Cómo funcionan las jornadas?</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-blue-800/90">
          <li>Cada jornada es una hoja de la planilla de Google Sheets.</li>
          <li>El avance se calcula automáticamente con los datos de cada hoja.</li>
          <li>Usa «Ver detalle» para ver el avance por técnico y por distrito.</li>
        </ul>
      </div>

      {/* Modales */}
      <CreateSheetModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleJornadaCreated}
      />

      <JornadaDetailModal
        isOpen={!!selectedJornada}
        stats={selectedJornada ? jornadaStats[selectedJornada]?.stats ?? null : null}
        onClose={() => setSelectedJornada(null)}
        onSelect={() => {
          if (selectedJornada) {
            handleSelectJornada(selectedJornada);
          }
        }}
      />
    </div>
  );
}
