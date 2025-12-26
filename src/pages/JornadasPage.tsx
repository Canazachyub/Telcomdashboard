import { useState, useEffect, useCallback } from 'react';
import {
  Calendar, Plus, Settings, RefreshCw, BarChart3, Users, Building2,
  CheckCircle2, Clock, AlertCircle, TrendingUp, Eye, ChevronRight,
  X, Loader2, FileSpreadsheet
} from 'lucide-react';
import { usePointsStore } from '../stores/pointsStore';
import { getStats, getSheetMetadata } from '../services/pointsService';
import type { ExtendedStats, SheetMetadata } from '../types/point';

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
      setError('El nombre es requerido');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_POINTS}?action=createSheet&sheetName=${encodeURIComponent(name.trim())}`,
        { method: 'GET' }
      );
      const data = await response.json();

      if (data.success) {
        setName('');
        onCreated();
        onClose();
      } else {
        setError(data.message || 'Error al crear la jornada');
      }
    } catch (err) {
      setError('Error de conexion');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">Nueva Jornada</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre de la Jornada
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Jornada_Enero_2025"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            Crear Jornada
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-blue-600 to-blue-700">
          <div>
            <h3 className="text-lg font-semibold text-white">{stats.sheetName}</h3>
            <p className="text-blue-100 text-sm">Detalle de la jornada</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded text-white">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Resumen general */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-gray-900">{totals.total}</div>
              <div className="text-sm text-gray-500">Total</div>
            </div>
            <div className="bg-green-50 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-green-600">{totals.completado}</div>
              <div className="text-sm text-green-700">Completados</div>
            </div>
            <div className="bg-yellow-50 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-yellow-600">{totals.en_proceso}</div>
              <div className="text-sm text-yellow-700">En Proceso</div>
            </div>
            <div className="bg-red-50 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-red-600">{totals.pendiente}</div>
              <div className="text-sm text-red-700">Pendientes</div>
            </div>
          </div>

          {/* Barra de progreso */}
          <div className="bg-white border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">Progreso General</span>
              <span className="text-2xl font-bold text-blue-600">{totals.porcentajeAvance}%</span>
            </div>
            <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-500"
                style={{ width: `${totals.porcentajeAvance}%` }}
              />
            </div>
          </div>

          {/* Por Tecnico */}
          {tecnicoEntries.length > 0 && (
            <div>
              <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Users size={18} className="text-blue-600" />
                Por Tecnico ({tecnicoEntries.length})
              </h4>
              <div className="bg-white border rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left py-2 px-4 text-sm font-medium text-gray-600">Tecnico</th>
                      <th className="text-center py-2 px-4 text-sm font-medium text-gray-600">Total</th>
                      <th className="text-center py-2 px-4 text-sm font-medium text-gray-600">Completados</th>
                      <th className="text-center py-2 px-4 text-sm font-medium text-gray-600">En Proceso</th>
                      <th className="text-center py-2 px-4 text-sm font-medium text-gray-600">Pendientes</th>
                      <th className="text-center py-2 px-4 text-sm font-medium text-gray-600">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tecnicoEntries.map(([tecnico, data]) => {
                      const pct = data.total > 0 ? ((data.completado / data.total) * 100).toFixed(1) : '0';
                      return (
                        <tr key={tecnico} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="py-2 px-4 font-medium">{tecnico}</td>
                          <td className="py-2 px-4 text-center">{data.total}</td>
                          <td className="py-2 px-4 text-center text-green-600">{data.completado}</td>
                          <td className="py-2 px-4 text-center text-yellow-600">{data.en_proceso}</td>
                          <td className="py-2 px-4 text-center text-red-600">{data.pendiente}</td>
                          <td className="py-2 px-4 text-center">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-green-500"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-sm font-medium w-12">{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Por Distrito */}
          {distritoEntries.length > 0 && (
            <div>
              <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Building2 size={18} className="text-purple-600" />
                Por Distrito ({distritoEntries.length})
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {distritoEntries.map(([distrito, data]) => {
                  const pct = data.total > 0 ? ((data.completado / data.total) * 100).toFixed(0) : '0';
                  return (
                    <div key={distrito} className="bg-gray-50 rounded-lg p-3">
                      <div className="font-medium text-sm text-gray-800 truncate mb-1">{distrito}</div>
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>{data.completado}/{data.total}</span>
                        <span className="font-medium text-purple-600">{pct}%</span>
                      </div>
                      <div className="mt-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cerrar
          </button>
          <button
            onClick={onSelect}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            Seleccionar Jornada
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
            setJornadaStats(prev => ({
              ...prev,
              [sheet.name]: {
                sheetName: sheet.name,
                stats,
                loading: false,
                error: null
              }
            }));
          } catch (err) {
            setJornadaStats(prev => ({
              ...prev,
              [sheet.name]: {
                sheetName: sheet.name,
                stats: null,
                loading: false,
                error: 'Error cargando'
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
    await loadSheets();
    await loadAllStats();
    await loadMetadata();
  };

  const handleJornadaCreated = async () => {
    await loadSheets();
    await loadAllStats();
  };

  const handleSelectJornada = (sheetName: string) => {
    setSelectedSheet(sheetName);
    setSelectedJornada(null);
  };

  // Calcular totales globales
  const globalTotals = Object.values(jornadaStats).reduce(
    (acc, j) => {
      if (j.stats?.totals) {
        acc.total += j.stats.totals.total;
        acc.completado += j.stats.totals.completado;
        acc.en_proceso += j.stats.totals.en_proceso;
        acc.pendiente += j.stats.totals.pendiente;
      }
      return acc;
    },
    { total: 0, completado: 0, en_proceso: 0, pendiente: 0 }
  );
  const globalPorcentaje = globalTotals.total > 0
    ? ((globalTotals.completado / globalTotals.total) * 100).toFixed(1)
    : '0';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="text-blue-600" />
            Jornadas
          </h1>
          <p className="text-gray-500">Gestiona las jornadas de trabajo ({sheets.length} jornadas)</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={18} />
            Nueva Jornada
          </button>
        </div>
      </div>

      {/* Resumen Global */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-6 text-white">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <BarChart3 size={20} />
          Resumen Global de Todas las Jornadas
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white/10 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold">{globalTotals.total}</div>
            <div className="text-blue-100 text-sm">Total Suministros</div>
          </div>
          <div className="bg-white/10 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold">{globalTotals.completado}</div>
            <div className="text-blue-100 text-sm flex items-center justify-center gap-1">
              <CheckCircle2 size={14} /> Completados
            </div>
          </div>
          <div className="bg-white/10 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold">{globalTotals.en_proceso}</div>
            <div className="text-blue-100 text-sm flex items-center justify-center gap-1">
              <Clock size={14} /> En Proceso
            </div>
          </div>
          <div className="bg-white/10 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold">{globalTotals.pendiente}</div>
            <div className="text-blue-100 text-sm flex items-center justify-center gap-1">
              <AlertCircle size={14} /> Pendientes
            </div>
          </div>
          <div className="bg-white/10 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold">{globalPorcentaje}%</div>
            <div className="text-blue-100 text-sm flex items-center justify-center gap-1">
              <TrendingUp size={14} /> Avance Total
            </div>
          </div>
        </div>
      </div>

      {/* Lista de jornadas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sheets.map((sheet) => {
          const jStats = jornadaStats[sheet.name];
          const sheetMeta = metadata.find(m => m.name === sheet.name);
          const stats = jStats?.stats;
          const isActive = selectedSheet === sheet.name;

          return (
            <div
              key={sheet.id}
              className={`bg-white rounded-xl border-2 overflow-hidden transition-all ${
                isActive
                  ? 'border-blue-500 ring-2 ring-blue-100'
                  : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
              }`}
            >
              {/* Header de la tarjeta */}
              <div className={`p-4 ${isActive ? 'bg-blue-50' : 'bg-gray-50'} border-b`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isActive ? 'bg-blue-100' : 'bg-white'}`}>
                      <FileSpreadsheet className={isActive ? 'text-blue-600' : 'text-gray-500'} size={20} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{sheet.name}</h3>
                      <p className="text-xs text-gray-500">
                        {sheetMeta?.structure === 'extended' ? '33 columnas' : '9 columnas'}
                      </p>
                    </div>
                  </div>
                  {isActive && (
                    <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded-full">
                      Activa
                    </span>
                  )}
                </div>
              </div>

              {/* Contenido */}
              <div className="p-4">
                {jStats?.loading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="animate-spin text-gray-400" size={24} />
                  </div>
                ) : jStats?.error ? (
                  <div className="text-center py-6 text-red-500 text-sm">
                    {jStats.error}
                  </div>
                ) : stats ? (
                  <div className="space-y-4">
                    {/* Stats */}
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div>
                        <div className="text-lg font-bold text-gray-900">{stats.totals.total}</div>
                        <div className="text-xs text-gray-500">Total</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-green-600">{stats.totals.completado}</div>
                        <div className="text-xs text-green-600">Comp.</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-yellow-600">{stats.totals.en_proceso}</div>
                        <div className="text-xs text-yellow-600">Proc.</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-red-600">{stats.totals.pendiente}</div>
                        <div className="text-xs text-red-600">Pend.</div>
                      </div>
                    </div>

                    {/* Barra de progreso */}
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-gray-500">Progreso</span>
                        <span className="font-semibold text-blue-600">{stats.totals.porcentajeAvance}%</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500"
                          style={{ width: `${stats.totals.porcentajeAvance}%` }}
                        />
                      </div>
                    </div>

                    {/* Info adicional */}
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Users size={12} />
                        {Object.keys(stats.byTecnico || {}).length} tecnicos
                      </span>
                      <span className="flex items-center gap-1">
                        <Building2 size={12} />
                        {Object.keys(stats.byDistrito || {}).length} distritos
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-400 text-sm">
                    Sin datos
                  </div>
                )}
              </div>

              {/* Footer acciones */}
              <div className="px-4 py-3 bg-gray-50 border-t flex items-center justify-between">
                <button
                  onClick={() => setSelectedJornada(sheet.name)}
                  disabled={!stats}
                  className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1 disabled:text-gray-400"
                >
                  <Eye size={14} />
                  Ver Detalle
                </button>
                <button
                  onClick={() => handleSelectJornada(sheet.name)}
                  className={`text-sm flex items-center gap-1 ${
                    isActive
                      ? 'text-gray-400 cursor-default'
                      : 'text-green-600 hover:text-green-700'
                  }`}
                  disabled={isActive}
                >
                  <Settings size={14} />
                  {isActive ? 'Seleccionada' : 'Seleccionar'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {sheets.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Calendar className="mx-auto text-gray-400 mb-4" size={48} />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No hay jornadas disponibles
          </h3>
          <p className="text-gray-500 mb-4">
            Las jornadas se cargan desde tu Google Sheets
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={18} />
            Crear Primera Jornada
          </button>
        </div>
      )}

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h4 className="font-medium text-blue-800 mb-2">Informacion</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>Las jornadas corresponden a las hojas de tu Google Spreadsheet.</li>
          <li>Cada jornada puede tener una estructura de 9 columnas (legacy) o 33 columnas (extended).</li>
          <li>Las estadisticas se calculan automaticamente basandose en los datos de cada hoja.</li>
          <li>Haz clic en "Ver Detalle" para ver el desglose por tecnico y distrito.</li>
        </ul>
      </div>

      {/* Modals */}
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
