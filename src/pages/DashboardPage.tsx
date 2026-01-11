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
} from 'lucide-react';
import { getStatusLabel } from '../types/point';

export default function DashboardPage() {
  const { stats, filteredPoints, selectedSheet, isLoading, lastUpdated, refreshPoints } = usePointsStore();
  const extendedStats = useExtendedStats();
  const sheetStructure = useSheetStructure();

  const statsCards = [
    {
      title: 'Total Puntos',
      value: stats.total,
      icon: <MapPin className="text-blue-500" size={24} />,
      color: 'bg-blue-50 border-blue-200',
    },
    {
      title: 'Completados',
      value: stats.completados,
      icon: <CheckCircle className="text-green-500" size={24} />,
      color: 'bg-green-50 border-green-200',
    },
    {
      title: 'En Proceso',
      value: stats.enProceso,
      icon: <Clock className="text-yellow-500" size={24} />,
      color: 'bg-yellow-50 border-yellow-200',
    },
    {
      title: 'Pendientes',
      value: stats.pendientes,
      icon: <AlertCircle className="text-red-500" size={24} />,
      color: 'bg-red-50 border-red-200',
    },
  ];

  // Contar total de fotos
  const totalPhotos = filteredPoints.reduce((acc, p) => acc + p.photoCount, 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 flex items-center gap-2 flex-wrap">
            {selectedSheet ? `Jornada: ${selectedSheet}` : 'Selecciona una jornada'}
            {sheetStructure === 'extended' ? (
              <span className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                <Database size={12} />
                33 Columnas
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                <Zap size={12} />
                Legacy
              </span>
            )}
          </p>
          {lastUpdated && (
            <p className="text-xs text-gray-400 mt-1">
              Actualizado: {new Date(lastUpdated).toLocaleString('es-PE')}
            </p>
          )}
        </div>
        <button
          onClick={() => refreshPoints()}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          {isLoading ? 'Cargando...' : 'Actualizar'}
        </button>
      </div>

      {/* Enlaces Rapidos Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Enlaces Rapidos */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Link className="text-primary-600" size={20} />
            <h2 className="text-lg font-semibold text-gray-900">Enlaces Rapidos</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <a
              href="https://canazachyub.github.io/seacetelcom/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors group"
            >
              <div className="p-2 bg-blue-500 rounded-lg">
                <ExternalLink className="text-white" size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 group-hover:text-blue-700">SEACE Seguimiento</p>
                <p className="text-xs text-gray-500 truncate">Seguimiento de procesos</p>
              </div>
            </a>
            <a
              href="http://localhost:3001/admin/empleados"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg transition-colors group"
            >
              <div className="p-2 bg-green-500 rounded-lg">
                <Users className="text-white" size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 group-hover:text-green-700">Administrar Trabajadores</p>
                <p className="text-xs text-gray-500 truncate">Gestion de empleados</p>
              </div>
            </a>
          </div>
        </div>

        {/* Seccion IA */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="text-purple-600" size={20} />
            <h2 className="text-lg font-semibold text-gray-900">Herramientas IA</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <a
              href="https://gemini.google.com/app"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-2 p-4 bg-gradient-to-br from-blue-50 to-purple-50 hover:from-blue-100 hover:to-purple-100 border border-purple-200 rounded-lg transition-colors group"
            >
              <div className="p-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg">
                <Sparkles className="text-white" size={18} />
              </div>
              <p className="font-medium text-gray-900 group-hover:text-purple-700 text-sm">Gemini</p>
            </a>
            <a
              href="https://notebooklm.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-2 p-4 bg-gradient-to-br from-orange-50 to-yellow-50 hover:from-orange-100 hover:to-yellow-100 border border-orange-200 rounded-lg transition-colors group"
            >
              <div className="p-2 bg-gradient-to-r from-orange-500 to-yellow-500 rounded-lg">
                <Brain className="text-white" size={18} />
              </div>
              <p className="font-medium text-gray-900 group-hover:text-orange-700 text-sm">NotebookLM</p>
            </a>
            <a
              href="https://chatgpt.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-2 p-4 bg-gradient-to-br from-green-50 to-teal-50 hover:from-green-100 hover:to-teal-100 border border-green-200 rounded-lg transition-colors group"
            >
              <div className="p-2 bg-gradient-to-r from-green-600 to-teal-500 rounded-lg">
                <Sparkles className="text-white" size={18} />
              </div>
              <p className="font-medium text-gray-900 group-hover:text-green-700 text-sm">ChatGPT</p>
            </a>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsCards.map((card) => (
          <div
            key={card.title}
            className={`${card.color} border rounded-xl p-5 transition-shadow hover:shadow-md`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{card.title}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{card.value}</p>
              </div>
              <div className="p-3 bg-white rounded-lg shadow-sm">{card.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Progress & Photos Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Progress Bar */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="text-primary-600" size={20} />
            <h2 className="text-lg font-semibold text-gray-900">Progreso General</h2>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600">Avance</span>
                <span className="font-medium text-gray-900">{stats.porcentaje}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div
                  className="bg-gradient-to-r from-primary-500 to-primary-600 h-4 rounded-full transition-all duration-500"
                  style={{ width: `${stats.porcentaje}%` }}
                ></div>
              </div>
            </div>

            {/* Breakdown */}
            <div className="grid grid-cols-3 gap-4 mt-6">
              <div className="text-center">
                <div className="w-3 h-3 bg-green-500 rounded-full mx-auto mb-1"></div>
                <p className="text-xs text-gray-500">Completados</p>
                <p className="text-lg font-bold text-gray-900">{stats.completados}</p>
              </div>
              <div className="text-center">
                <div className="w-3 h-3 bg-yellow-500 rounded-full mx-auto mb-1"></div>
                <p className="text-xs text-gray-500">En Proceso</p>
                <p className="text-lg font-bold text-gray-900">{stats.enProceso}</p>
              </div>
              <div className="text-center">
                <div className="w-3 h-3 bg-red-500 rounded-full mx-auto mb-1"></div>
                <p className="text-xs text-gray-500">Pendientes</p>
                <p className="text-lg font-bold text-gray-900">{stats.pendientes}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Photos Summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Camera className="text-primary-600" size={20} />
            <h2 className="text-lg font-semibold text-gray-900">Resumen de Fotos</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <span className="text-gray-600">Total de fotos sincronizadas</span>
              <span className="text-2xl font-bold text-primary-600">{totalPhotos}</span>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <span className="text-gray-600">Puntos con foto</span>
              <span className="text-2xl font-bold text-green-600">
                {filteredPoints.filter(p => p.hasPhoto).length}
              </span>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <span className="text-gray-600">Puntos sin foto</span>
              <span className="text-2xl font-bold text-red-600">
                {filteredPoints.filter(p => !p.hasPhoto).length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats by Tecnico (Extended only) */}
      {sheetStructure === 'extended' && extendedStats?.byTecnico && Object.keys(extendedStats.byTecnico).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="text-primary-600" size={20} />
            <h2 className="text-lg font-semibold text-gray-900">Avance por Tecnico</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(extendedStats.byTecnico).map(([tecnico, stats]) => {
              const porcentaje = stats.total > 0 ? ((stats.completado / stats.total) * 100).toFixed(1) : '0';
              return (
                <div key={tecnico} className="border border-gray-100 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-gray-900 truncate" title={tecnico}>
                      {tecnico}
                    </h3>
                    <span className="text-sm font-bold text-primary-600">{porcentaje}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                    <div
                      className="bg-primary-500 h-2 rounded-full"
                      style={{ width: `${porcentaje}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{stats.completado} completados</span>
                    <span>{stats.total} total</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stats by Distrito (Extended only) */}
      {sheetStructure === 'extended' && extendedStats?.byDistrito && Object.keys(extendedStats.byDistrito).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="text-primary-600" size={20} />
            <h2 className="text-lg font-semibold text-gray-900">Avance por Distrito</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(extendedStats.byDistrito).map(([distrito, stats]) => {
              const porcentaje = stats.total > 0 ? ((stats.completado / stats.total) * 100).toFixed(1) : '0';
              return (
                <div key={distrito} className="border border-gray-100 rounded-lg p-4">
                  <h3 className="font-medium text-gray-900 mb-2 truncate" title={distrito}>
                    {distrito}
                  </h3>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full"
                        style={{ width: `${porcentaje}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-medium text-gray-600">{porcentaje}%</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {stats.completado} / {stats.total}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Points Table */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Ultimos Puntos Actualizados
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                  Suministro
                </th>
                {sheetStructure === 'extended' && (
                  <>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                      Tecnico
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                      Cliente
                    </th>
                  </>
                )}
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                  Estado
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                  Fotos
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                  Coordenadas
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredPoints.slice(0, 10).map((point, index) => (
                <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium text-gray-900">
                    {point.suministro}
                  </td>
                  {sheetStructure === 'extended' && (
                    <>
                      <td className="py-3 px-4 text-gray-600">
                        {point.tecnico || '-'}
                      </td>
                      <td className="py-3 px-4 text-gray-600 max-w-[150px] truncate" title={point.clienteNombre || ''}>
                        {point.clienteNombre || '-'}
                      </td>
                    </>
                  )}
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        point.status === 'completado'
                          ? 'bg-green-100 text-green-800'
                          : point.status === 'en_proceso'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {getStatusLabel(point.status)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-600">{point.photoCount}</td>
                  <td className="py-3 px-4 text-gray-600 text-sm">
                    {point.latReal && point.longReal
                      ? `${point.latReal.toFixed(6)}, ${point.longReal.toFixed(6)}`
                      : point.latRef && point.longRef
                      ? `${point.latRef.toFixed(6)}, ${point.longRef.toFixed(6)}`
                      : 'Sin coordenadas'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredPoints.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No hay puntos cargados. Selecciona una jornada para comenzar.
          </div>
        )}
      </div>
    </div>
  );
}
