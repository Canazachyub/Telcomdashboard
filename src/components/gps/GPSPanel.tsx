// ==========================================
// Panel Lateral de GPS - Rastreo por Fotos
// ==========================================

import { brandAsset } from '../../config/brand';
import { useState } from 'react';
import {
  Users, Search, Filter, RefreshCw, ChevronDown, ChevronUp,
  MapPin, Clock, Camera, Eye, EyeOff, ExternalLink
} from 'lucide-react';
import type { GPSEntity, GPSStats, GPSFilters } from '../../types/gps';
import { formatRelativeTime } from '../../services/gpsService';
import { safeHexColor } from '../../utils/html';

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
    <div className="flex h-full w-80 shrink-0 flex-col border-l border-line-strong bg-navy-900/90 backdrop-blur-md">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <p className="brand-kicker">Seguimiento en campo</p>
            <h2 className="mt-1 text-lg font-semibold text-gray-900">Rastreo por fotos</h2>
          </div>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className={`rounded-lg border border-gray-300 p-2 transition-colors hover:border-electric hover:text-electric ${
              isLoading ? 'text-electric' : 'text-gray-600'
            }`}
            title="Actualizar ubicaciones"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-green-200 bg-green-50 p-2.5">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_6px_rgb(34_197_94/0.8)]"></div>
              <span className="text-[11px] font-medium text-green-800">Activos (últimas 2 h)</span>
            </div>
            <div className="mt-1.5 font-mono text-2xl font-semibold leading-none text-green-700">
              {stats.personalOnline.toLocaleString('es-PE')}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-100 p-2.5">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-gray-400"></div>
              <span className="text-[11px] font-medium text-gray-600">Inactivos</span>
            </div>
            <div className="mt-1.5 font-mono text-2xl font-semibold leading-none text-gray-800">
              {stats.personalOffline.toLocaleString('es-PE')}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-gray-500">
          <span>
            <span className="font-mono text-gray-800">{stats.totalPersonal.toLocaleString('es-PE')}</span> técnicos registrados
          </span>
          {/* Last Updated */}
          {lastUpdated && (
            <span className="flex items-center gap-1" title="Última actualización">
              <Clock size={11} />
              {formatRelativeTime(lastUpdated)}
            </span>
          )}
        </div>
      </div>

      {/* Info Banner */}
      <div className="border-b border-gray-200 bg-cyan-400/5 px-4 py-2">
        <p className="flex items-center gap-1.5 text-xs text-gray-600">
          <Camera size={12} className="text-electric" />
          Ubicación según la última foto sincronizada
        </p>
      </div>

      {/* Search & Filters */}
      <div className="border-b border-gray-200 p-3">
        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar técnico…"
            value={filters.search}
            onChange={(e) => onFilterChange('search', e.target.value)}
            className="w-full rounded-xl border border-gray-300 bg-navy-950 py-2 pl-9 pr-4 text-sm text-gray-900 outline-none transition focus:border-electric focus:ring-4 focus:ring-[rgb(0_212_255/0.12)]"
          />
        </div>

        {/* Filter Toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="mt-2 flex items-center gap-2 text-sm text-gray-600 transition hover:text-electric"
        >
          <Filter size={14} />
          <span>Filtros</span>
          {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {/* Filter Options */}
        {showFilters && (
          <div className="mt-2 space-y-2 rounded-xl border border-gray-200 bg-navy-950 p-2.5">
            <label className="flex cursor-pointer items-center gap-2 text-gray-700">
              <input
                type="checkbox"
                checked={filters.onlyOnline}
                onChange={(e) => onFilterChange('onlyOnline', e.target.checked)}
                className="rounded accent-[#00d4ff]"
              />
              {filters.onlyOnline ? <Eye size={14} className="text-electric" /> : <EyeOff size={14} />}
              <span className="text-sm">Solo activos (últimas 2 h)</span>
            </label>
          </div>
        )}
      </div>

      {/* Entity List */}
      <div className="flex-1 overflow-y-auto">
        {entities.length > 0 ? (
          <div className="p-3">
            <h3 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              <Users size={12} />
              Técnicos <span className="font-mono text-gray-700">({entities.length.toLocaleString('es-PE')})</span>
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
          <div className="flex h-full flex-col items-center justify-center p-6 text-gray-500">
            <img
              src={brandAsset('icon-rastreo.webp')}
              alt=""
              className={`mb-4 h-28 w-28 drop-shadow-[0_10px_24px_rgba(0,212,255,0.25)] ${isLoading ? 'animate-pulse' : ''}`}
            />
            {isLoading ? (
              <>
                <p className="text-center font-medium text-gray-800">Buscando técnicos…</p>
                <p className="mt-1 text-center text-sm">
                  El servidor revisa todas las jornadas; puede tardar hasta un minuto.
                </p>
              </>
            ) : (
              <>
                <p className="text-center font-medium text-gray-800">No hay técnicos con ubicación</p>
                <p className="mt-1 text-center text-sm">
                  Los técnicos aparecerán aquí cuando sincronicen fotos desde la app.
                </p>
              </>
            )}
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
      className={`cursor-pointer rounded-xl border transition-all ${
        isSelected
          ? 'border-electric bg-cyan-400/10 shadow-[0_0_0_1px_rgb(0_212_255/0.4)]'
          : 'border-gray-200 bg-navy-850 hover:border-line-strong hover:bg-navy-800'
      }`}
    >
      <div className="p-3">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 font-bold text-white ${
              isOnline ? 'border-green-500' : 'border-gray-300 opacity-60'
            }`}
            style={{ backgroundColor: safeHexColor(entity.color, '#6b7280') }}
          >
            {(entity.nombre || '?').charAt(0).toUpperCase()}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900 truncate">{entity.nombre}</span>
              <span
                className={`h-2 w-2 flex-shrink-0 rounded-full ${
                  isOnline ? 'bg-green-500' : 'bg-gray-400'
                }`}
                title={isOnline ? 'Activo' : 'Inactivo'}
              />
            </div>

            <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
              <Clock size={10} />
              Última foto: {formatRelativeTime(entity.ultimaActualizacion)}
            </div>
          </div>

          {/* View Photo */}
          {entity.extra?.foto_url && (
            <a
              href={entity.extra.foto_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="rounded-lg p-2 text-electric transition-colors hover:bg-cyan-400/10"
              title="Ver última foto"
            >
              <ExternalLink size={16} />
            </a>
          )}
        </div>

        {/* Location Info */}
        {isSelected && (
          <div className="mt-2 border-t border-gray-200 pt-2 text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <MapPin size={10} className="text-electric" />
              <span className="font-mono">{entity.latitud.toFixed(5)}, {entity.longitud.toFixed(5)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
