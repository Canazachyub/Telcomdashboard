import { useState, useMemo, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, FeatureGroup } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import { Icon, DivIcon, LatLngBounds, LatLng } from 'leaflet';
import type { FeatureGroup as FeatureGroupType } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import { usePointsStore, useFilters, useTecnicos, useDistritos, useSheetStructure, useIsTecnico } from '../stores/pointsStore';
import { MAP_CONFIG } from '../config/api';
import { getPointStatus, getStatusColor, getStatusLabel } from '../types/point';
import type { GpsPoint, GpsPointExtended, PhotoLink } from '../types/point';
import {
  ExternalLink, Camera, MapPin, Filter, X, ChevronLeft, ChevronRight,
  Maximize2, Search, Users, Building2, RotateCcw, Target, UserPlus, Pencil
} from 'lucide-react';
import { getDriveThumbnailUrl, getDriveViewUrl, extractDriveFileId } from '../utils/driveUtils';
import { getTecnicos, assignTecnico } from '../services/tecnicoService';
import type { User } from '../types/user';

// Fix para los iconos de Leaflet en Vite
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// @ts-ignore
delete Icon.Default.prototype._getIconUrl;
Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

// Componente para controlar el mapa (centrar, zoom)
function MapController({
  points,
  autoFit,
  onAutoFitDone
}: {
  points: (GpsPoint | GpsPointExtended)[];
  autoFit: boolean;
  onAutoFitDone: () => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (autoFit && points.length > 0) {
      const validPoints = points.filter(
        (p) => (p.latReal && p.longReal) || (p.latRef && p.longRef)
      );

      if (validPoints.length > 0) {
        const bounds = new LatLngBounds([]);
        validPoints.forEach((p) => {
          const lat = p.latReal || p.latRef;
          const lng = p.longReal || p.longRef;
          if (lat && lng) {
            bounds.extend([lat, lng]);
          }
        });

        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
        }
      }
      onAutoFitDone();
    }
  }, [autoFit, points, map, onAutoFitDone]);

  return null;
}

// Crear marcador personalizado con color y tamaño configurable
function createCustomIcon(
  status: 'pendiente' | 'en_proceso' | 'completado',
  isHighlighted: boolean = false
) {
  const color = getStatusColor(status);
  const size = isHighlighted ? 32 : 24;
  const borderWidth = isHighlighted ? 4 : 3;

  return new DivIcon({
    html: `
      <div style="
        background-color: ${color};
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        border: ${borderWidth}px solid ${isHighlighted ? '#2563eb' : 'white'};
        box-shadow: 0 2px 8px rgba(0,0,0,${isHighlighted ? 0.5 : 0.3});
        ${isHighlighted ? 'animation: pulse 1s infinite;' : ''}
      "></div>
    `,
    className: 'custom-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Componente de imagen con fallback
function DriveImage({
  photo,
  onClick
}: {
  photo: PhotoLink;
  onClick: () => void;
}) {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const thumbnailUrl = getDriveThumbnailUrl(photo.url, 'w400');
  const viewUrl = getDriveViewUrl(photo.url);

  return (
    <div
      className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden cursor-pointer group"
      onClick={onClick}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      )}

      {!error ? (
        <img
          src={thumbnailUrl}
          alt={`Foto #${photo.numero}`}
          className={`w-full h-full object-cover transition-opacity ${loading ? 'opacity-0' : 'opacity-100'}`}
          onLoad={() => setLoading(false)}
          onError={() => {
            setError(true);
            setLoading(false);
          }}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
          <Camera size={32} />
          <p className="text-xs mt-2">Vista previa no disponible</p>
          <a
            href={viewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 text-xs text-primary-600 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            Abrir en Drive
          </a>
        </div>
      )}

      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all flex items-center justify-center">
        <Maximize2 className="text-white opacity-0 group-hover:opacity-100 transition-opacity" size={24} />
      </div>

      <div className="absolute top-2 left-2 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded">
        #{photo.numero}
      </div>
    </div>
  );
}

// Modal para ver fotos con galería
function PhotoModal({
  point,
  onClose,
}: {
  point: GpsPoint | GpsPointExtended | null;
  onClose: () => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  if (!point) return null;

  const photos = point.photoLinks;

  const handlePrev = () => {
    if (selectedIndex !== null && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  const handleNext = () => {
    if (selectedIndex !== null && selectedIndex < photos.length - 1) {
      setSelectedIndex(selectedIndex + 1);
    }
  };

  if (selectedIndex !== null) {
    const currentPhoto = photos[selectedIndex];
    const fileId = extractDriveFileId(currentPhoto.url);
    const previewUrl = fileId
      ? `https://drive.google.com/file/d/${fileId}/preview`
      : currentPhoto.url;

    return (
      <div className="fixed inset-0 bg-black z-[1000] flex flex-col">
        <div className="flex items-center justify-between p-4 text-white">
          <div>
            <h3 className="font-semibold">Foto #{currentPhoto.numero}</h3>
            <p className="text-sm text-gray-300">{currentPhoto.fecha}</p>
          </div>
          <div className="flex items-center gap-4">
            <a
              href={currentPhoto.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
            >
              <ExternalLink size={16} />
              Abrir original
            </a>
            <button
              onClick={() => setSelectedIndex(null)}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-4 relative">
          {selectedIndex > 0 && (
            <button
              onClick={handlePrev}
              className="absolute left-4 z-10 p-3 bg-white/20 rounded-full hover:bg-white/30 transition-colors"
            >
              <ChevronLeft size={32} className="text-white" />
            </button>
          )}

          <iframe
            src={previewUrl}
            title={`Foto #${currentPhoto.numero}`}
            className="w-full h-full max-w-4xl max-h-[80vh] border-0 rounded-lg bg-gray-900"
            allow="autoplay"
          />

          {selectedIndex < photos.length - 1 && (
            <button
              onClick={handleNext}
              className="absolute right-4 z-10 p-3 bg-white/20 rounded-full hover:bg-white/30 transition-colors"
            >
              <ChevronRight size={32} className="text-white" />
            </button>
          )}
        </div>

        <div className="p-4 text-center text-white">
          {selectedIndex + 1} / {photos.length}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[1000] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">
              Fotos - Suministro {point.suministro}
            </h3>
            <p className="text-sm text-gray-500">{photos.length} foto(s)</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={24} className="text-gray-500" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[calc(90vh-80px)]">
          {photos.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {photos.map((photo, index) => (
                <div key={index} className="space-y-2">
                  <DriveImage
                    photo={photo}
                    onClick={() => setSelectedIndex(index)}
                  />
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-900">
                      Foto #{photo.numero}
                    </p>
                    <p className="text-xs text-gray-500">{photo.fecha}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <Camera size={48} className="mx-auto mb-4 opacity-50" />
              <p>No hay fotos disponibles</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Panel de filtros colapsable
function FilterPanel({
  isOpen,
  onToggle,
  localFilters,
  onLocalFilterChange,
  tecnicos,
  distritos,
  sheetStructure,
  stats,
  onReset,
  searchQuery,
  onSearchChange,
  isTecnico,
}: {
  isOpen: boolean;
  onToggle: () => void;
  localFilters: { status: string; tecnico: string; distrito: string };
  onLocalFilterChange: (key: string, value: string) => void;
  tecnicos: string[];
  distritos: string[];
  sheetStructure: string;
  stats: { total: number; pendientes: number; enProceso: number; completados: number };
  onReset: () => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  isTecnico: boolean;
}) {
  const activeFiltersCount = [
    localFilters.status !== 'todos',
    localFilters.tecnico !== 'Todos',
    localFilters.distrito !== 'Todos',
    searchQuery.length > 0,
  ].filter(Boolean).length;

  return (
    <div className="absolute top-4 right-4 z-[500]">
      {/* Botón toggle */}
      <button
        onClick={onToggle}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg transition-colors ${
          isOpen ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
        }`}
      >
        <Filter size={18} />
        <span className="font-medium">Filtros</span>
        {activeFiltersCount > 0 && (
          <span className={`px-2 py-0.5 text-xs rounded-full ${
            isOpen ? 'bg-white text-blue-600' : 'bg-blue-600 text-white'
          }`}>
            {activeFiltersCount}
          </span>
        )}
      </button>

      {/* Panel de filtros */}
      {isOpen && (
        <div className="absolute top-12 right-0 w-80 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="p-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <span className="font-medium text-gray-700">Filtrar Puntos</span>
            <button
              onClick={onReset}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600"
            >
              <RotateCcw size={12} />
              Limpiar
            </button>
          </div>

          <div className="p-3 space-y-3">
            {/* Búsqueda rápida */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                <Search size={12} className="inline mr-1" />
                Buscar suministro
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Ej: 123456..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Estado con badges visuales */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Estado</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onLocalFilterChange('status', 'todos')}
                  className={`px-3 py-2 text-xs rounded-lg border transition-colors ${
                    localFilters.status === 'todos'
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <span className="block font-medium">Todos</span>
                  <span className="text-gray-500">{stats.total}</span>
                </button>
                <button
                  onClick={() => onLocalFilterChange('status', 'pendiente')}
                  className={`px-3 py-2 text-xs rounded-lg border transition-colors ${
                    localFilters.status === 'pendiente'
                      ? 'bg-red-50 border-red-300 text-red-700'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-1 justify-center">
                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                    <span className="font-medium">Pendiente</span>
                  </div>
                  <span className="text-gray-500">{stats.pendientes}</span>
                </button>
                <button
                  onClick={() => onLocalFilterChange('status', 'en_proceso')}
                  className={`px-3 py-2 text-xs rounded-lg border transition-colors ${
                    localFilters.status === 'en_proceso'
                      ? 'bg-yellow-50 border-yellow-300 text-yellow-700'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-1 justify-center">
                    <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                    <span className="font-medium">En Proceso</span>
                  </div>
                  <span className="text-gray-500">{stats.enProceso}</span>
                </button>
                <button
                  onClick={() => onLocalFilterChange('status', 'completado')}
                  className={`px-3 py-2 text-xs rounded-lg border transition-colors ${
                    localFilters.status === 'completado'
                      ? 'bg-green-50 border-green-300 text-green-700'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-1 justify-center">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="font-medium">Completado</span>
                  </div>
                  <span className="text-gray-500">{stats.completados}</span>
                </button>
              </div>
            </div>

            {/* Filtros extended */}
            {sheetStructure === 'extended' && (
              <>
                {tecnicos.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      <Users size={12} className="inline mr-1" />
                      Tecnico
                      {isTecnico && <span className="ml-1 text-blue-600">(Asignado)</span>}
                    </label>
                    <select
                      value={localFilters.tecnico}
                      onChange={(e) => onLocalFilterChange('tecnico', e.target.value)}
                      disabled={isTecnico}
                      className={`w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 ${
                        isTecnico ? 'bg-gray-100 cursor-not-allowed' : ''
                      }`}
                    >
                      <option value="Todos">Todos los tecnicos</option>
                      {tecnicos.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                )}

                {distritos.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      <Building2 size={12} className="inline mr-1" />
                      Distrito
                    </label>
                    <select
                      value={localFilters.distrito}
                      onChange={(e) => onLocalFilterChange('distrito', e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Todos">Todos los distritos</option>
                      {distritos.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Modal para asignar técnico a los puntos seleccionados
function AssignTecnicoModal({
  isOpen,
  onClose,
  selectedPoints,
  sheetName,
  onAssignComplete,
}: {
  isOpen: boolean;
  onClose: () => void;
  selectedPoints: (GpsPoint | GpsPointExtended)[];
  sheetName: string;
  onAssignComplete: () => void;
}) {
  const [tecnicos, setTecnicos] = useState<User[]>([]);
  const [selectedTecnico, setSelectedTecnico] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingTecnicos, setIsLoadingTecnicos] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadTecnicos();
      setError('');
      setSuccess('');
      setSelectedTecnico('');
    }
  }, [isOpen]);

  const loadTecnicos = async () => {
    setIsLoadingTecnicos(true);
    const result = await getTecnicos();
    if (result.success && result.tecnicos) {
      setTecnicos(result.tecnicos);
    } else {
      setError('Error cargando técnicos');
    }
    setIsLoadingTecnicos(false);
  };

  const handleAssign = async () => {
    if (!selectedTecnico) {
      setError('Selecciona un técnico');
      return;
    }

    setIsLoading(true);
    setError('');

    const suministros = selectedPoints.map(p => p.suministro);
    const result = await assignTecnico(sheetName, suministros, selectedTecnico);

    if (result.success) {
      setSuccess(`Se asignaron ${result.updated} puntos a ${selectedTecnico}`);
      setTimeout(() => {
        onAssignComplete();
        onClose();
      }, 1500);
    } else {
      setError(result.message || 'Error al asignar técnico');
    }

    setIsLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[1000] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-md w-full overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-blue-600 text-white">
          <div className="flex items-center gap-2">
            <UserPlus size={24} />
            <h3 className="text-lg font-semibold">Asignar Técnico</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-blue-700 rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Info de puntos seleccionados */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <span className="font-semibold">{selectedPoints.length}</span> puntos seleccionados para asignar
            </p>
          </div>

          {/* Selector de técnico */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Seleccionar Técnico
            </label>
            {isLoadingTecnicos ? (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              </div>
            ) : tecnicos.length > 0 ? (
              <select
                value={selectedTecnico}
                onChange={(e) => setSelectedTecnico(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">-- Seleccionar técnico --</option>
                {tecnicos.map((tec) => (
                  <option key={tec.id || tec.email} value={tec.nombre}>
                    {tec.nombre} ({tec.email})
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-center py-4 text-gray-500">
                <Users size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">No hay técnicos registrados</p>
                <p className="text-xs mt-1">Agrega usuarios con rol TECNICO</p>
              </div>
            )}
          </div>

          {/* Mensajes de error/éxito */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
              {success}
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleAssign}
              disabled={isLoading || !selectedTecnico || tecnicos.length === 0}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                <>
                  <UserPlus size={18} />
                  Asignar
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MapPage() {
  // Store data
  const {
    filteredPoints,
    stats,
    selectedSheet,
    isLoading,
    setFilter: setStoreFilter,
    resetFilters: resetStoreFilters,
    loadPointsExtended,
  } = usePointsStore();
  const storeFilters = useFilters();
  const tecnicos = useTecnicos();
  const distritos = useDistritos();
  const sheetStructure = useSheetStructure();
  const isTecnico = useIsTecnico();

  // Local state
  const [selectedPoint, setSelectedPoint] = useState<GpsPoint | GpsPointExtended | null>(null);
  const [highlightedPointId, setHighlightedPointId] = useState<string | null>(null);
  const [autoFit, setAutoFit] = useState(true);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Drawing mode state
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [selectedPointsForAssign, setSelectedPointsForAssign] = useState<(GpsPoint | GpsPointExtended)[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const featureGroupRef = useRef<FeatureGroupType | null>(null);

  // Local filters (synced with store)
  const [localFilters, setLocalFilters] = useState({
    status: storeFilters.status,
    tecnico: storeFilters.tecnico,
    distrito: storeFilters.distrito,
  });

  // Sync local filters with store
  useEffect(() => {
    setLocalFilters({
      status: storeFilters.status,
      tecnico: storeFilters.tecnico,
      distrito: storeFilters.distrito,
    });
  }, [storeFilters]);

  // Handle local filter change
  const handleLocalFilterChange = (key: string, value: string) => {
    setLocalFilters(prev => ({ ...prev, [key]: value }));
    setStoreFilter(key as 'status' | 'tecnico' | 'distrito', value);
    setAutoFit(true);
  };

  // Handle search
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setStoreFilter('search', value);
    if (value) {
      setAutoFit(true);
    }
  };

  // Reset all filters
  const handleResetFilters = () => {
    setSearchQuery('');
    // Para TECNICO, mantener su filtro de técnico
    setLocalFilters({
      status: 'todos',
      tecnico: isTecnico ? storeFilters.tecnico : 'Todos',
      distrito: 'Todos'
    });
    resetStoreFilters();
    setAutoFit(true);
  };

  // Compute visible points with coordinates
  const visiblePoints = useMemo(() => {
    return filteredPoints.filter(
      (p) => (p.latReal && p.longReal) || (p.latRef && p.longRef)
    );
  }, [filteredPoints]);

  // Compute stats for visible points
  const visibleStats = useMemo(() => {
    const total = visiblePoints.length;
    const pendientes = visiblePoints.filter(p => getPointStatus(p) === 'pendiente').length;
    const enProceso = visiblePoints.filter(p => getPointStatus(p) === 'en_proceso').length;
    const completados = visiblePoints.filter(p => getPointStatus(p) === 'completado').length;

    return { total, pendientes, enProceso, completados };
  }, [visiblePoints]);

  // Trigger auto-fit
  const handleCenterOnPoints = () => {
    setAutoFit(true);
  };

  // Handle drawing created - find points inside the drawn shape
  const handleDrawCreated = (e: any) => {
    const layer = e.layer;
    const drawnShape = layer.getLatLngs ? layer.getLatLngs()[0] : null;

    if (!drawnShape) return;

    // Find all points inside the drawn polygon/rectangle
    const pointsInside = visiblePoints.filter((point) => {
      const lat = point.latReal || point.latRef;
      const lng = point.longReal || point.longRef;
      if (!lat || !lng) return false;

      // Check if point is inside the polygon
      return isPointInPolygon({ lat, lng }, drawnShape);
    });

    if (pointsInside.length > 0) {
      setSelectedPointsForAssign(pointsInside);
      setShowAssignModal(true);
    }

    // Clear the drawn shape after processing
    if (featureGroupRef.current) {
      featureGroupRef.current.clearLayers();
    }

    setIsDrawingMode(false);
  };

  // Check if a point is inside a polygon using ray casting algorithm
  const isPointInPolygon = (point: { lat: number; lng: number }, polygon: LatLng[]) => {
    let inside = false;
    const x = point.lng;
    const y = point.lat;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lng;
      const yi = polygon[i].lat;
      const xj = polygon[j].lng;
      const yj = polygon[j].lat;

      if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }

    return inside;
  };

  // Toggle drawing mode
  const toggleDrawingMode = () => {
    setIsDrawingMode(!isDrawingMode);
    setSelectedPointsForAssign([]);
  };

  // Handle assignment complete - refresh data
  const handleAssignComplete = () => {
    setSelectedPointsForAssign([]);
    // Refresh points data
    if (selectedSheet) {
      loadPointsExtended(selectedSheet);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col">
      {/* Header del mapa */}
      <div className="bg-white rounded-t-xl border border-gray-200 p-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <MapPin className="text-primary-600" />
            Mapa de Asignaciones
          </h1>
          <p className="text-sm text-gray-500">
            {selectedSheet
              ? `${visiblePoints.length} puntos con coordenadas de ${filteredPoints.length} filtrados`
              : 'Selecciona una jornada'}
          </p>
        </div>

        {/* Stats rápidas */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span className="text-sm font-medium">{visibleStats.pendientes}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <span className="text-sm font-medium">{visibleStats.enProceso}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-sm font-medium">{visibleStats.completados}</span>
            </div>
          </div>

          <button
            onClick={handleCenterOnPoints}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
            title="Centrar en puntos"
          >
            <Target size={16} />
            Centrar
          </button>

          {/* Solo ADMIN y SUPERVISOR pueden asignar técnicos */}
          {!isTecnico && (
            <button
              onClick={toggleDrawingMode}
              className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                isDrawingMode
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-green-50 text-green-700 hover:bg-green-100'
              }`}
              title="Dibujar area para asignar tecnico"
            >
              <Pencil size={16} />
              {isDrawingMode ? 'Dibujando...' : 'Asignar'}
            </button>
          )}
        </div>
      </div>

      {/* Contenedor del mapa */}
      <div className="flex-1 border-x border-b border-gray-200 rounded-b-xl overflow-hidden relative">
        <MapContainer
          center={MAP_CONFIG.defaultCenter}
          zoom={MAP_CONFIG.defaultZoom}
          className="w-full h-full"
        >
          <TileLayer
            attribution={MAP_CONFIG.tileAttribution}
            url={MAP_CONFIG.tileUrl}
          />
          <MapController
            points={visiblePoints}
            autoFit={autoFit}
            onAutoFitDone={() => setAutoFit(false)}
          />

          {/* Drawing controls - Solo rectángulo para mayor velocidad */}
          <FeatureGroup ref={featureGroupRef}>
            {isDrawingMode && (
              <EditControl
                key="draw-control"
                position="topleft"
                onCreated={handleDrawCreated}
                draw={{
                  polyline: false,
                  polygon: {
                    allowIntersection: false,
                    showArea: false,
                    maxPoints: 5,
                    shapeOptions: {
                      color: '#22c55e',
                      weight: 2,
                      fillOpacity: 0.2,
                    },
                  },
                  rectangle: false,
                  circle: false,
                  marker: false,
                  circlemarker: false,
                }}
                edit={{
                  edit: false,
                  remove: false,
                }}
              />
            )}
          </FeatureGroup>

          {visiblePoints.map((point, index) => {
            const lat = point.latReal || point.latRef;
            const lng = point.longReal || point.longRef;
            if (!lat || !lng) return null;

            const status = getPointStatus(point);
            const isHighlighted = highlightedPointId === point.suministro;
            const icon = createCustomIcon(status, isHighlighted);
            const extPoint = point as GpsPointExtended;

            return (
              <Marker
                key={`${point.suministro}-${index}`}
                position={[lat, lng]}
                icon={icon}
                eventHandlers={{
                  click: () => setHighlightedPointId(point.suministro),
                }}
              >
                <Popup>
                  <div className="min-w-[220px]">
                    <h3 className="font-bold text-gray-900 mb-2">
                      {point.suministro}
                    </h3>

                    {extPoint.tecnico && (
                      <p className="text-sm mb-2">
                        <span className="text-gray-500">Tecnico:</span>{' '}
                        <span className="font-medium">{extPoint.tecnico}</span>
                      </p>
                    )}

                    <div className="space-y-1 text-sm">
                      <p>
                        <span className="text-gray-500">Estado:</span>{' '}
                        <span
                          className={`font-medium ${
                            status === 'completado'
                              ? 'text-green-600'
                              : status === 'en_proceso'
                              ? 'text-yellow-600'
                              : 'text-red-600'
                          }`}
                        >
                          {getStatusLabel(status)}
                        </span>
                      </p>
                      <p>
                        <span className="text-gray-500">Fotos:</span>{' '}
                        <span className="font-medium">{point.photoCount}</span>
                      </p>

                      {extPoint.distrito && (
                        <p>
                          <span className="text-gray-500">Distrito:</span>{' '}
                          <span className="font-medium">{extPoint.distrito}</span>
                        </p>
                      )}

                      <p>
                        <span className="text-gray-500">Coordenadas:</span>{' '}
                        <span className="font-mono text-xs">
                          {lat.toFixed(6)}, {lng.toFixed(6)}
                        </span>
                      </p>
                    </div>

                    {point.photoCount > 0 && (
                      <button
                        onClick={() => setSelectedPoint(point)}
                        className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                      >
                        <Camera size={14} />
                        Ver Fotos ({point.photoCount})
                      </button>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* Panel de filtros */}
        <FilterPanel
          isOpen={filterPanelOpen}
          onToggle={() => setFilterPanelOpen(!filterPanelOpen)}
          localFilters={localFilters}
          onLocalFilterChange={handleLocalFilterChange}
          tecnicos={tecnicos}
          distritos={distritos}
          sheetStructure={sheetStructure}
          stats={stats}
          onReset={handleResetFilters}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          isTecnico={isTecnico}
        />

        {/* Leyenda */}
        <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-3 z-[500]">
          <p className="text-xs font-medium text-gray-700 mb-2">Leyenda</p>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span className="text-xs text-gray-600">Pendiente</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <span className="text-xs text-gray-600">En Proceso</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-xs text-gray-600">Completado</span>
            </div>
          </div>
        </div>

        {/* Indicador cuando no hay puntos */}
        {visiblePoints.length === 0 && filteredPoints.length > 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-[400]">
            <div className="text-center p-6 bg-white rounded-xl shadow-lg">
              <MapPin size={48} className="mx-auto mb-4 text-gray-400" />
              <h3 className="font-semibold text-gray-700 mb-2">Sin coordenadas</h3>
              <p className="text-sm text-gray-500 max-w-xs">
                Los {filteredPoints.length} puntos filtrados no tienen coordenadas GPS.
                Verifica que las columnas LAT_REF/LONG_REF esten configuradas.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Modal de fotos */}
      {selectedPoint && (
        <PhotoModal point={selectedPoint} onClose={() => setSelectedPoint(null)} />
      )}

      {/* Modal para asignar técnico */}
      <AssignTecnicoModal
        isOpen={showAssignModal}
        onClose={() => {
          setShowAssignModal(false);
          setSelectedPointsForAssign([]);
        }}
        selectedPoints={selectedPointsForAssign}
        sheetName={selectedSheet || ''}
        onAssignComplete={handleAssignComplete}
      />

      {/* CSS para animación pulse y estilos de dibujo */}
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.8; }
        }

        /* Estilos para la barra de herramientas de dibujo */
        .leaflet-draw-toolbar {
          margin-top: 10px !important;
        }

        .leaflet-draw-toolbar a {
          background-color: white !important;
          border: 1px solid #ccc !important;
          width: 36px !important;
          height: 36px !important;
        }

        .leaflet-draw-toolbar a:hover {
          background-color: #f0f0f0 !important;
        }

        .leaflet-draw-actions {
          background-color: white !important;
          border-radius: 4px !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2) !important;
        }

        .leaflet-draw-actions a {
          background-color: white !important;
          color: #333 !important;
        }

        .leaflet-draw-actions a:hover {
          background-color: #22c55e !important;
          color: white !important;
        }
      `}</style>
    </div>
  );
}
