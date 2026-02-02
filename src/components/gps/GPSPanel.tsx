// ==========================================
// Panel Lateral de GPS - Rastreo por Fotos
// ==========================================

import { useState } from 'react';
import {
  Users, Search, Filter, RefreshCw, ChevronDown, ChevronUp,
  MapPin, Clock, Camera, Eye, EyeOff, ExternalLink
} from 'lucide-react';
import type { GPSEntity, GPSStats, GPSFilters } from '../../types/gps';
import { formatRelativeTime } from '../../services/gpsService';

interface GPSPanelProps {
  entities: GPSEntity[];
  stats: GPSStats;
  filters: GPSFilters;
  lastUpdated: string | null;
  isLoading: boolean;
  onFilterChange: (key: keyof GPSFilters, value: boolean | string) => void;
  onRefresh: () => void;
  onEntityClick: (entity: GPSEntity) => void;
  selectedEntity: GPSEntity | null;
}

export default function GPSPanel({
  entities,
  stats,
  filters,
  lastUpdated,
  isLoading,
  onFilterChange,
  onRefresh,
  onEntityClick,
  selectedEntity,
}: GPSPanelProps) {
  const [showFilters, setShowFilters] = useState(false);

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-800">Rastreo por Fotos</h2>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className={`p-2 rounded-lg hover:bg-gray-200 transition-colors ${
              isLoading ? 'animate-spin text-blue-600' : 'text-gray-600'
            }`}
            title="Actualizar"
          >
            <RefreshCw size={18} />
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-green-50 rounded-lg p-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-xs text-green-700">Activos (2h)</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-lg font-bold text-green-700">{stats.personalOnline}</span>
            </div>
          </div>

          <div className="bg-gray-100 rounded-lg p-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
              <span className="text-xs text-gray-600">Inactivos</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-lg font-bold text-gray-700">{stats.personalOffline}</span>
            </div>
          </div>
        </div>

        <div className="mt-2 text-center">
          <span className="text-sm text-gray-500">
            {stats.totalPersonal} técnicos registrados
          </span>
        </div>

        {/* Last Updated */}
        {lastUpdated && (
          <p className="text-xs text-gray-500 mt-2 text-center">
            Actualizado: {formatRelativeTime(lastUpdated)}
          </p>
        )}
      </div>

      {/* Info Banner */}
      <div className="px-4 py-2 bg-blue-50 border-b border-blue-100">
        <p className="text-xs text-blue-700 flex items-center gap-1">
          <Camera size={12} />
          Ubicación basada en última foto sincronizada
        </p>
      </div>

      {/* Search & Filters */}
      <div className="p-3 border-b border-gray-200">
        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar técnico..."
            value={filters.search}
            onChange={(e) => onFilterChange('search', e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Filter Toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 mt-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <Filter size={14} />
          <span>Filtros</span>
          {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {/* Filter Options */}
        {showFilters && (
          <div className="mt-2 space-y-2 p-2 bg-gray-50 rounded-lg">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.onlyOnline}
                onChange={(e) => onFilterChange('onlyOnline', e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500"
              />
              {filters.onlyOnline ? <Eye size={14} /> : <EyeOff size={14} />}
              <span className="text-sm">Solo activos (últimas 2h)</span>
            </label>
          </div>
        )}
      </div>

      {/* Entity List */}
      <div className="flex-1 overflow-y-auto">
        {entities.length > 0 ? (
          <div className="p-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Users size={12} />
              Técnicos ({entities.length})
            </h3>
            <div className="space-y-2">
              {entities.map((entity) => (
                <TecnicoCard
                  key={entity.id}
                  entity={entity}
                  isSelected={selectedEntity?.id === entity.id}
                  onClick={() => onEntityClick(entity)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 p-6">
            <Camera size={48} className="mb-4 opacity-50" />
            <p className="text-center">No hay técnicos con ubicación</p>
            <p className="text-sm text-center mt-1">
              Los técnicos aparecerán aquí cuando sincronicen fotos desde la app
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// Tecnico Card Component
// ==========================================

interface TecnicoCardProps {
  entity: GPSEntity;
  isSelected: boolean;
  onClick: () => void;
}

function TecnicoCard({ entity, isSelected, onClick }: TecnicoCardProps) {
  const isOnline = entity.estado === 'online';

  return (
    <div
      onClick={onClick}
      className={`rounded-lg transition-all cursor-pointer ${
        isSelected
          ? 'bg-blue-50 border-2 border-blue-500'
          : 'bg-gray-50 border border-gray-200 hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      <div className="p-3">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
              isOnline ? '' : 'opacity-60'
            }`}
            style={{ backgroundColor: entity.color }}
          >
            {entity.nombre.charAt(0).toUpperCase()}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900 truncate">{entity.nombre}</span>
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  isOnline ? 'bg-green-500' : 'bg-gray-400'
                }`}
              />
            </div>

            <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
              <Clock size={10} />
              {formatRelativeTime(entity.ultimaActualizacion)}
            </div>
          </div>

          {/* View Photo */}
          {entity.extra?.foto_url && (
            <a
              href={entity.extra.foto_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg"
              title="Ver última foto"
            >
              <ExternalLink size={16} />
            </a>
          )}
        </div>

        {/* Location Info */}
        {isSelected && (
          <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <MapPin size={10} />
              <span>{entity.latitud.toFixed(5)}, {entity.longitud.toFixed(5)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
