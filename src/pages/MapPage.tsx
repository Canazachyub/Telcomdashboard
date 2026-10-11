import { useSuministroDrawer } from '../stores/suministroDrawerStore';
import TraerRegistroModal from '../components/map/TraerRegistroModal';
import SospechososModal from '../components/map/SospechososModal';
import { CompararCapa, CompararPanel, type Comparacion } from '../components/map/CompararCorreccion';
import { confirmarCorreccion, correccionesDe, exportarCorrecciones, quitarCorreccion } from '../utils/correcciones';
import { detectarSospechosos, esMalEscrito, posFoto } from '../utils/suministroCheck';
import PhotoStrip from '../components/PhotoStrip';
import { cargarJornadas, normSuministro, ocurrenciaDe, primeCache, puntosEnCache, type Ocurrencia } from '../services/suministroHistory';
import { brandAsset } from '../config/brand';
import TecnicoProgressPanel from '../components/map/TecnicoProgressPanel';
import AssignAreaPanel from '../components/map/AssignAreaPanel';
import { initialOf } from '../components/map/techUtils';
import OutOfPeruModal from '../components/map/OutOfPeruModal';
import { isInPeru } from '../utils/geo';
import DailyCalendarPanel from '../components/map/DailyCalendarPanel';
import { computeDailyProgress } from '../components/map/dailyProgress';
import { useState, useMemo, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, FeatureGroup } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import { Icon, DivIcon, LatLngBounds, LatLng } from 'leaflet';
import type { FeatureGroup as FeatureGroupType } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import '../components/map/drawLocale';
import { usePointsStore, useFilters, useTecnicos, useDistritos, useSheetStructure, useIsTecnico } from '../stores/pointsStore';
import { MAP_CONFIG } from '../config/api';
import { getPointStatus, getStatusColor, getStatusLabel } from '../types/point';
import type { GpsPoint, GpsPointExtended } from '../types/point';
import {
  Camera, MapPin, Filter, X,
  Search, Users, Building2, RotateCcw, Target, Pencil, CalendarDays, History, Copy
} from 'lucide-react';
import PhotoGalleryModal from '../components/PhotoGalleryModal';
import { safeHexColor, isValidHexColor } from '../utils/html';
import { toNumberOrNull } from '../utils/format';

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
        // Ignorar coordenadas fuera de Perú (signo invertido, 0,0, etc.) para no alejar el mapa
        const enPeru = validPoints.filter((p) => isInPeru(p.latReal || p.latRef, p.longReal || p.longRef));
        (enPeru.length > 0 ? enPeru : validPoints).forEach((p) => {
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
// Si odtColor está disponible, lo usa para el color interior con borde de estado.
// Los íconos se guardan en caché: con miles de puntos, recrearlos en cada render era lento.
const iconCache = new Map<string, DivIcon>();

function createCustomIcon(
  status: 'pendiente' | 'en_proceso' | 'completado',
  isHighlighted: boolean = false,
  odtColor?: string | null,
  letter: string = '',
  hechoEnOtra: boolean = false,
  sospechoso: boolean = false
) {
  // SEGURIDAD: odtColor viene de la app movil y se interpola en HTML;
  // solo se acepta un hex #RRGGBB estricto.
  const hasOdtColor = isValidHexColor(odtColor);
  const key = `${status}|${isHighlighted ? 1 : 0}|${hasOdtColor ? odtColor : ''}|${letter}|${hechoEnOtra ? 1 : 0}|${sospechoso ? 1 : 0}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  const statusColor = safeHexColor(getStatusColor(status), '#ef4444');
  const size = isHighlighted ? 28 : letter ? 20 : 16;
  const bgColor = hasOdtColor ? safeHexColor(odtColor, statusColor) : statusColor;
  const ring = isHighlighted ? '#00d4ff' : sospechoso ? '#c084fc' : hechoEnOtra ? '#fbbf24' : hasOdtColor ? statusColor : 'rgba(255,255,255,0.85)';

  const icon = new DivIcon({
    html: `<div class="map-dot${isHighlighted ? ' map-dot--active' : ''}" style="
        width:${size}px;height:${size}px;background:${bgColor};
        border:${isHighlighted || hechoEnOtra || sospechoso ? 3 : 2}px ${hechoEnOtra && !isHighlighted ? 'dashed' : 'solid'} ${ring};
        box-shadow:0 0 0 ${isHighlighted ? 4 : 2}px ${statusColor}33, 0 2px 6px rgba(0,0,0,.45);
      ">${letter ? `<span class="map-dot__letter">${letter}</span>` : ''}</div>`,
    className: 'custom-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  iconCache.set(key, icon);
  return icon;
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
    pointsExtended,
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
  const openFicha = useSuministroDrawer((st) => st.open);
  const [showOutOfPeru, setShowOutOfPeru] = useState(false);
  const [showDaily, setShowDaily] = useState(false);
  // Suministros hechos en OTRAS jornadas (para detectar pendientes ya resueltos)
  const { sheets } = usePointsStore();
  const [otras, setOtras] = useState<Map<string, Ocurrencia[]> | null>(null);
  const [otrasProgreso, setOtrasProgreso] = useState<{ hechas: number; total: number } | null>(null);
  const [traer, setTraer] = useState<Ocurrencia[] | null>(null);
  const [showSospechosos, setShowSospechosos] = useState(false);
  const [comp, setComp] = useState<Comparacion | null>(null);
  const [verCorr, setVerCorr] = useState(0); // fuerza releer las correcciones guardadas
  const [dayFilter, setDayFilter] = useState<string | null>(null);
  const [drawnLayer, setDrawnLayer] = useState<{ remove: () => void } | null>(null);
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

  // Suministros posiblemente mal escritos por el técnico (letras, largo raro, no existen en la lista)
  const sospechosos = useMemo(() => {
    // Si ya se revisaron otras jornadas, sus listas también sirven como candidatos
    const externos = otras
      ? sheets
          .map((sh) => sh.name)
          .filter((n) => n !== selectedSheet)
          .flatMap((n) => (puntosEnCache(n) || []).map((point) => ({ jornada: n, point })))
      : [];
    return detectarSospechosos(filteredPoints, externos);
  }, [filteredPoints, otras, sheets, selectedSheet]);
  const malEscritos = useMemo(() => sospechosos.filter(esMalEscrito), [sospechosos]);
  const fueraDeLista = sospechosos.length - malEscritos.length;
  const correcciones = useMemo(
    () => (selectedSheet && verCorr >= 0 ? correccionesDe(selectedSheet) : []),
    [selectedSheet, verCorr]
  );
  const volverALista = () => {
    setComp(null);
    setShowSospechosos(true);
  };
  const confirmarComp = () => {
    if (!comp || !selectedSheet) return;
    const sg = comp.item.sugerencias[comp.indice];
    const pos = posFoto(comp.item.point);
    const pt = comp.item.point as GpsPointExtended;
    confirmarCorreccion({
      jornada: selectedSheet,
      original: String(pt.suministro),
      corregido: String(sg.point.suministro),
      origenSugerencia: sg.jornada,
      tecnico: pt.odtNombre || pt.tecnico || '',
      lat: pos?.[0] ?? null,
      lng: pos?.[1] ?? null,
      distancia: sg.distancia,
      fecha: new Date().toISOString(),
    });
    setVerCorr((v) => v + 1);
    volverALista();
  };
  // Solo los errores de digitación se marcan en el mapa; los códigos válidos fuera de la lista no
  const sospechososSet = useMemo(() => new Set(malEscritos.map((x) => x.point)), [malEscritos]);

  const fueraDePeru = useMemo(
    () => visiblePoints.filter((p) => !isInPeru(p.latReal || p.latRef, p.longReal || p.longRef)).length,
    [visiblePoints]
  );

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

    setIsDrawingMode(false);
    if (pointsInside.length > 0) {
      // El área queda dibujada mientras el panel de asignación está abierto
      setDrawnLayer(layer);
      setSelectedPointsForAssign(pointsInside);
      setShowAssignModal(true);
    } else if (featureGroupRef.current) {
      featureGroupRef.current.clearLayers();
    }
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

  const closeAssignPanel = () => {
    setShowAssignModal(false);
    setSelectedPointsForAssign([]);
    drawnLayer?.remove();
    setDrawnLayer(null);
    featureGroupRef.current?.clearLayers();
  };

  // Puntos de toda la jornada con coordenadas (para el avance por técnico)
  const allMapPoints = useMemo(
    () => (pointsExtended.length ? pointsExtended : filteredPoints).filter(
      (p) => (p.latReal && p.longReal) || (p.latRef && p.longRef)
    ),
    [pointsExtended, filteredPoints]
  );

  // Día de la primera foto de cada punto (para el filtro por día)
  const firstDay = useMemo(() => computeDailyProgress(allMapPoints).firstDay, [allMapPoints]);
  // Con un día elegido se muestran los puntos avanzados ese día y, siempre, los pendientes
  const dayCount = useMemo(
    () => (dayFilter ? visiblePoints.filter((p) => firstDay.get(p.suministro) === dayFilter).length : 0),
    [visiblePoints, dayFilter, firstDay]
  );
  const displayPoints = useMemo(
    () =>
      dayFilter
        ? visiblePoints.filter(
            (p) => firstDay.get(p.suministro) === dayFilter || getPointStatus(p) === 'pendiente'
          )
        : visiblePoints,
    [visiblePoints, dayFilter, firstDay]
  );
  const dayFilterLabel = dayFilter
    ? new Date(`${dayFilter}T12:00:00`).toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' })
    : '';

  // Revisa las demás jornadas y guarda, por suministro, dónde ya tiene fotos
  const verificarOtras = async () => {
    if (otrasProgreso) return;
    if (selectedSheet && pointsExtended.length) primeCache(selectedSheet, pointsExtended);
    const nombres = sheets.map((sh) => sh.name).filter((n) => n !== selectedSheet);
    setOtrasProgreso({ hechas: 0, total: nombres.length });
    const res = await cargarJornadas(nombres, (hechas, total) => setOtrasProgreso({ hechas, total }));
    const idx = new Map<string, Ocurrencia[]>();
    res.forEach((pts, jornada) =>
      pts.forEach((pt) => {
        if (getPointStatus(pt) === 'pendiente' || !(pt.photoLinks?.length)) return;
        const k = normSuministro(pt.suministro);
        const arr = idx.get(k) || [];
        arr.push(ocurrenciaDe(jornada, pt));
        idx.set(k, arr);
      })
    );
    idx.forEach((arr) => arr.sort((a, b) => (b.ultimaFoto?.getTime() ?? 0) - (a.ultimaFoto?.getTime() ?? 0)));
    setOtras(idx);
    setOtrasProgreso(null);
  };
  const hechosEnOtra = (sum: string) => otras?.get(normSuministro(sum)) || null;
  const pendientesYaHechos = useMemo(
    () => (otras ? visiblePoints.filter((pt) => getPointStatus(pt) === 'pendiente' && otras.has(normSuministro(pt.suministro))).length : 0),
    [otras, visiblePoints]
  );

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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-112px)] min-h-[520px] flex-col">
      {/* Header del mapa */}
      <div className="flex flex-col gap-3 rounded-t-2xl border border-gray-200 bg-white p-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 flex-1">
          <p className="brand-kicker">Mapa operativo</p>
          <h1 className="mt-0.5 flex items-center gap-2 text-xl font-bold text-gray-900">
            <MapPin className="text-electric" size={20} />
            Mapa de Asignaciones
          </h1>
          <p className="text-sm text-gray-500">
            {selectedSheet
              ? `${visiblePoints.length.toLocaleString('es-PE')} puntos con coordenadas de ${filteredPoints.length.toLocaleString('es-PE')} filtrados`
              : 'Selecciona una jornada'}
            {dayFilter && (
              <button
                onClick={() => {
                  setDayFilter(null);
                  setAutoFit(true);
                }}
                className="ml-2 inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-800 hover:bg-blue-100"
                title="Quitar filtro por día"
              >
                Avance del {dayFilterLabel}: {dayCount} puntos (+ pendientes) <X size={11} />
              </button>
            )}
            {malEscritos.length > 0 && (
              <button
                onClick={() => setShowSospechosos(true)}
                className="ml-2 inline-flex items-center rounded-md border border-purple-200 bg-purple-50 px-1.5 py-0.5 text-[11px] text-purple-800 hover:bg-purple-100"
                title="Suministros con letras o con un largo distinto al habitual"
              >
                {malEscritos.length} suministro{malEscritos.length === 1 ? '' : 's'} mal escrito{malEscritos.length === 1 ? '' : 's'} · revisar
              </button>
            )}
            {fueraDeLista > 0 && (
              <button
                onClick={() => setShowSospechosos(true)}
                className="ml-2 inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-700 hover:bg-gray-100"
                title="Códigos válidos fotografiados que no están en la lista de esta jornada"
              >
                {fueraDeLista} fuera de la lista
              </button>
            )}
            {fueraDePeru > 0 && (
              <button
                onClick={() => setShowOutOfPeru(true)}
                className="ml-2 inline-flex items-center rounded-md border border-yellow-200 bg-yellow-50 px-1.5 py-0.5 text-[11px] text-yellow-800 hover:bg-yellow-100"
                title="Ver y exportar los puntos con coordenadas fuera de Perú"
              >
                {fueraDePeru} con coordenadas fuera de Perú · revisar
              </button>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap xl:justify-end">
          {/* Stats rápidas */}
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1">
            {[
              { label: 'Pendiente', value: visibleStats.pendientes, color: 'bg-red-500' },
              { label: 'En proceso', value: visibleStats.enProceso, color: 'bg-yellow-500' },
              { label: 'Completado', value: visibleStats.completados, color: 'bg-green-500' },
            ].map((st) => (
              <div key={st.label} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${st.color}`} />
                <span className="hidden text-xs text-gray-500 sm:inline">{st.label}</span>
                <span className="font-mono text-sm font-semibold text-gray-900">{st.value.toLocaleString('es-PE')}</span>
              </div>
            ))}
          </div>

          {visibleStats.total > 0 && (
            <div className="hidden w-32 shrink-0 2xl:block">
              <div className="flex justify-between text-[11px] text-gray-500">
                <span>Avance</span>
                <span className="font-mono text-gray-700">
                  {((visibleStats.completados / visibleStats.total) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-green-500 to-electric"
                  style={{ width: `${(visibleStats.completados / visibleStats.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          <button
            onClick={verificarOtras}
            disabled={!!otrasProgreso || !selectedSheet}
            className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors disabled:opacity-60 ${
              otras ? 'border-energy/60 text-energy' : 'border-gray-300 text-gray-700 hover:border-electric hover:text-electric'
            }`}
            title="Detectar pendientes de esta jornada que ya se hicieron en otra"
          >
            <History size={16} className={otrasProgreso ? 'animate-spin' : ''} />
            {otrasProgreso
              ? `Revisando ${otrasProgreso.hechas}/${otrasProgreso.total}`
              : otras
              ? `${pendientesYaHechos} ya hechos en otra`
              : 'Hechos en otras jornadas'}
          </button>

          <button
            onClick={() => {
              if (showDaily) setDayFilter(null);
              setShowDaily((v) => !v);
              setShowAssignModal(false);
            }}
            className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
              showDaily ? 'border-electric text-electric' : 'border-gray-300 text-gray-700 hover:border-electric hover:text-electric'
            }`}
            title="Avance por día y por técnico"
          >
            <CalendarDays size={16} />
            Avance diario
          </button>

          <button
            onClick={handleCenterOnPoints}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 transition-colors hover:border-electric hover:text-electric"
            title="Centrar en puntos"
          >
            <Target size={16} />
            Centrar
          </button>

          {/* Solo ADMIN y SUPERVISOR pueden asignar técnicos */}
          {!isTecnico && (
            <button
              onClick={toggleDrawingMode}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                isDrawingMode
                  ? 'bg-green-500 text-white shadow-[0_0_0_3px_rgb(16_185_129/0.25)]'
                  : 'bg-blue-600 text-white hover:brightness-110'
              }`}
              title="Dibujar area para asignar tecnico"
            >
              <Pencil size={16} />
              {isDrawingMode ? 'Dibujando…' : 'Asignar área'}
            </button>
          )}
        </div>
      </div>

      {/* Contenedor del mapa */}
      <div className="hud-corners relative flex-1 overflow-hidden rounded-b-2xl border-x border-b border-gray-200">
        {comp && (
          <CompararPanel
            comp={comp}
            onConfirmar={confirmarComp}
            onSiguiente={() =>
              comp.indice + 1 < comp.item.sugerencias.length ? setComp({ ...comp, indice: comp.indice + 1 }) : volverALista()
            }
            onVolver={volverALista}
            onCerrar={() => setComp(null)}
          />
        )}
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
            points={displayPoints}
            autoFit={autoFit}
            onAutoFitDone={() => setAutoFit(false)}
          />
          {comp && <CompararCapa comp={comp} />}

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
                    shapeOptions: {
                      color: '#00d4ff',
                      weight: 2,
                      dashArray: '6 6',
                      fillColor: '#2563eb',
                      fillOpacity: 0.15,
                    },
                  },
                  rectangle: {
                    shapeOptions: {
                      color: '#00d4ff',
                      weight: 2,
                      dashArray: '6 6',
                      fillColor: '#2563eb',
                      fillOpacity: 0.15,
                    },
                  },
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

          {displayPoints.map((point, index) => {
            const lat = toNumberOrNull(point.latReal) || toNumberOrNull(point.latRef);
            const lng = toNumberOrNull(point.longReal) || toNumberOrNull(point.longRef);
            if (!lat || !lng) return null;

            const status = getPointStatus(point);
            const isHighlighted = highlightedPointId === point.suministro;
            const extPoint = point as GpsPointExtended;
            // Usar color ODT si está disponible (técnico que tomó la foto)
            // Letra del técnico que tomó la foto (solo si el punto ya tiene foto)
            const letter = status !== 'pendiente' ? initialOf(extPoint.odtNombre) : '';
            const yaHecho = status === 'pendiente' && !!hechosEnOtra(point.suministro);
            const esSospechoso = sospechososSet.has(point);
            const icon = createCustomIcon(status, isHighlighted, extPoint.odtColor, letter, yaHecho, esSospechoso);

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
                  <div className="min-w-[240px]">
                    <div className="mb-3 flex items-start justify-between gap-3 border-b border-gray-200 pb-2">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-gray-500">Suministro</p>
                        <h3 className="font-mono text-base font-semibold text-gray-900">{point.suministro}</h3>
                      </div>
                      <span
                        className={`mt-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                          status === 'completado'
                            ? 'bg-green-100 text-green-800'
                            : status === 'en_proceso'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {getStatusLabel(status)}
                      </span>
                    </div>

                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
                      {extPoint.tecnico && (
                        <>
                          <dt className="text-gray-500">Técnico</dt>
                          <dd className="font-medium text-gray-900">{extPoint.tecnico}</dd>
                        </>
                      )}
                      {extPoint.codigoRuta && (
                        <>
                          <dt className="text-gray-500">Código ruta</dt>
                          <dd className="font-mono text-gray-900">{extPoint.codigoRuta}</dd>
                        </>
                      )}
                      {extPoint.serie && (
                        <>
                          <dt className="text-gray-500">Serie</dt>
                          <dd className="font-mono text-gray-900">{extPoint.serie}</dd>
                        </>
                      )}
                      {extPoint.distrito && (
                        <>
                          <dt className="text-gray-500">Distrito</dt>
                          <dd className="text-gray-900">{extPoint.distrito}</dd>
                        </>
                      )}
                      <dt className="text-gray-500">Fotos</dt>
                      <dd className="text-gray-900">{point.photoCount}</dd>
                      {extPoint.odtNombre && (
                        <>
                          <dt className="text-gray-500">Fotógrafo</dt>
                          <dd className="flex items-center gap-1.5 text-gray-900">
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: safeHexColor(extPoint.odtColor, '#888888') }}
                            />
                            {extPoint.odtNombre}
                          </dd>
                        </>
                      )}
                      <dt className="text-gray-500">Coordenadas</dt>
                      <dd className="font-mono text-xs text-gray-700">
                        {lat.toFixed(6)}, {lng.toFixed(6)}
                      </dd>
                    </dl>

                    {esSospechoso && (
                      <button
                        onClick={() => setShowSospechosos(true)}
                        className="mt-3 w-full rounded-xl border border-purple-200 bg-purple-50 p-2.5 text-left text-xs text-purple-800 hover:bg-purple-100"
                      >
                        <span className="font-semibold">Suministro posiblemente mal escrito.</span> Ver sugerencia del código correcto →
                      </button>
                    )}
                    {status === 'pendiente' && (() => {
                      const oc = hechosEnOtra(point.suministro);
                      if (!otras) {
                        return (
                          <button
                            onClick={verificarOtras}
                            disabled={!!otrasProgreso}
                            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-energy/60 px-3 py-2 text-xs text-energy hover:bg-amber-50"
                          >
                            <History size={13} />
                            {otrasProgreso ? `Revisando jornadas ${otrasProgreso.hechas}/${otrasProgreso.total}…` : '¿Ya se hizo en otra jornada? Verificar'}
                          </button>
                        );
                      }
                      if (!oc) {
                        return <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">No tiene fotos en otras jornadas.</p>;
                      }
                      const o = oc[0];
                      return (
                        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs">
                          <p className="font-semibold text-amber-800">
                            Ya se hizo en {oc.length === 1 ? 'otra jornada' : `${oc.length} jornadas`}
                          </p>
                          <p className="mt-0.5 truncate text-gray-700" title={o.jornada}>
                            {o.jornada}
                          </p>
                          <p className="text-gray-600">
                            {o.ultimaFoto?.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) || '—'} ·{' '}
                            {o.trabajadores.join(', ') || '—'} · {o.fotos} fotos
                            {o.lectura != null && o.lectura !== '' && ` · lectura ${o.lectura}`}
                          </p>
                          <div className="mt-2">
                            <PhotoStrip photos={o.point.photoLinks || []} max={4} size={40} onOpen={() => openFicha(o.point, o.jornada)} />
                          </div>
                          {!isTecnico && (
                            <button
                              onClick={() => setTraer(oc)}
                              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                            >
                              <Copy size={13} /> Traer a esta jornada
                            </button>
                          )}
                        </div>
                      );
                    })()}
                    <button
                      onClick={() => openFicha(point, selectedSheet)}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:border-electric hover:text-electric"
                    >
                      Ficha e historial
                    </button>
                    {point.photoCount > 0 && (
                      <button
                        onClick={() => setSelectedPoint(point)}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:brightness-110"
                      >
                        <Camera size={14} />
                        Ver fotos ({point.photoCount})
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

        {/* Ayuda mientras se dibuja */}
        {isDrawingMode && (
          <div className="absolute left-1/2 top-4 z-[600] -translate-x-1/2 rounded-xl border border-electric/40 bg-navy-900/95 px-4 py-2.5 text-center text-sm text-gray-800 shadow-xl backdrop-blur">
            Dibuja un <b>polígono</b> o <b>rectángulo</b> (botones de la izquierda) alrededor de los puntos a asignar
          </div>
        )}

        {/* Calendario de avance diario */}
        {showDaily && !showAssignModal && (
          <DailyCalendarPanel
            points={allMapPoints}
            sheetName={selectedSheet || ''}
            selectedDay={dayFilter}
            onSelectDay={(k) => {
              setDayFilter(k);
              setAutoFit(true);
            }}
            onClose={() => {
              // Al cerrar el calendario se quita el filtro por día
              setShowDaily(false);
              setDayFilter(null);
              setAutoFit(true);
            }}
          />
        )}

        {/* Avance por técnico (clic = filtrar) */}
        {!showAssignModal && !filterPanelOpen && !showDaily && (
          <TecnicoProgressPanel
            points={allMapPoints}
            activeTecnico={localFilters.tecnico}
            onSelectTecnico={(n) => handleLocalFilterChange('tecnico', n)}
          />
        )}

        {/* Panel de asignación del área dibujada */}
        {showAssignModal && (
          <AssignAreaPanel
            areaPoints={selectedPointsForAssign}
            allPoints={allMapPoints}
            sheetName={selectedSheet || ''}
            onClose={closeAssignPanel}
            onAssignComplete={handleAssignComplete}
          />
        )}

        {/* Leyenda */}
        <div className="absolute bottom-4 left-4 z-[500] rounded-xl border border-gray-200 bg-navy-900/90 p-3 shadow-lg backdrop-blur">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Leyenda</p>
          <div className="space-y-1.5">
            {[
              { label: 'Pendiente', color: 'bg-red-500' },
              { label: 'En proceso', color: 'bg-yellow-500' },
              { label: 'Completado', color: 'bg-green-500' },
            ].map((l) => (
              <div key={l.label} className="flex items-center gap-2">
                <span className={`h-3 w-3 rounded-full border-2 border-white/80 ${l.color}`} />
                <span className="text-xs text-gray-700">{l.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 max-w-[180px] border-t border-gray-200 pt-2 text-[11px] leading-snug text-gray-500">
            Con foto, el relleno y la letra indican el técnico que la tomó.
            {malEscritos.length > 0 && (
              <span className="mt-1 flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full border-2 border-purple-400 bg-green-500" /> Suministro posiblemente mal escrito
              </span>
            )}
            {otras && (
              <span className="mt-1 flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full border-2 border-dashed border-energy bg-red-500" /> Pendiente ya hecho en otra jornada
              </span>
            )}
          </p>
        </div>

        {/* Indicador cuando no hay puntos */}
        {visiblePoints.length === 0 && filteredPoints.length > 0 && (
          <div className="absolute inset-0 z-[400] flex items-center justify-center bg-navy-950/70 backdrop-blur-sm">
            <div className="max-w-sm rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-2xl">
              <img src={brandAsset('icon-mapa.webp')} alt="" className="mx-auto mb-3 h-28 w-28" />
              <h3 className="mb-2 font-semibold text-gray-900">Sin coordenadas</h3>
              <p className="text-sm text-gray-500">
                Los {filteredPoints.length} puntos filtrados no tienen coordenadas GPS.
                Verifica que las columnas LAT_REF/LONG_REF esten configuradas.
              </p>
            </div>
          </div>
        )}
      </div>

      {showSospechosos && (
        <SospechososModal
          jornada={selectedSheet || ''}
          items={sospechosos}
          puntos={filteredPoints as GpsPointExtended[]}
          onClose={() => setShowSospechosos(false)}
          onVerEnMapa={(sum) => {
            setShowSospechosos(false);
            setHighlightedPointId(sum);
            handleSearchChange(sum);
          }}
          onFicha={(pt) => openFicha(pt, selectedSheet)}
          onComparar={(item, indice) => {
            setShowSospechosos(false);
            setComp({ item, indice });
          }}
          correcciones={correcciones}
          onDeshacer={(c) => {
            quitarCorreccion(c.jornada, c.original, c.lat, c.lng);
            setVerCorr((v) => v + 1);
          }}
          onExportar={() => selectedSheet && exportarCorrecciones(selectedSheet)}
          onCorregido={(c) => {
            quitarCorreccion(c.jornada, c.original, c.lat, c.lng);
            setVerCorr((v) => v + 1);
            if (selectedSheet) loadPointsExtended(selectedSheet);
          }}
        />
      )}

      {traer && selectedSheet && (
        <TraerRegistroModal
          destino={selectedSheet}
          ocurrencias={traer}
          onClose={() => setTraer(null)}
          onDone={() => loadPointsExtended(selectedSheet)}
        />
      )}

      {showOutOfPeru && (
        <OutOfPeruModal points={visiblePoints} sheetName={selectedSheet || ''} onClose={() => setShowOutOfPeru(false)} />
      )}

      {/* Modal de fotos */}
      {selectedPoint && (
        <div className="fixed inset-0 z-[1200]">
          <PhotoGalleryModal
            photos={selectedPoint.photoLinks || []}
            suministro={String(selectedPoint.suministro)}
            onClose={() => setSelectedPoint(null)}
          />
        </div>
      )}

      {/* Estilos de marcadores y barra de dibujo (tema oscuro) */}
      <style>{`
        .map-dot { border-radius: 9999px; transition: transform .15s ease; display:flex; align-items:center; justify-content:center; }
        .map-dot__letter { font: 700 10px/1 'Plus Jakarta Sans', sans-serif; color:#fff; text-shadow:0 1px 2px rgba(0,0,0,.6); }
        .map-dot--active .map-dot__letter { font-size: 12px; }
        .custom-marker:hover .map-dot { transform: scale(1.25); }
        .map-dot--active { animation: mapPulse 1.4s ease-in-out infinite; }
        @keyframes mapPulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(0,212,255,.25), 0 2px 6px rgba(0,0,0,.45); }
          50% { box-shadow: 0 0 0 10px rgba(0,212,255,0), 0 2px 6px rgba(0,0,0,.45); }
        }
        .leaflet-draw-toolbar { margin-top: 10px !important; }
        .leaflet-draw-toolbar { border: 0 !important; box-shadow: 0 0 0 2px rgba(0,212,255,.6), 0 8px 20px rgba(0,0,0,.45) !important; border-radius: 10px !important; overflow: hidden; }
        .leaflet-draw-toolbar a {
          background-color: #eef3fa !important;
          border-bottom: 1px solid #c5d0e2 !important;
          width: 40px !important;
          height: 40px !important;
          background-position-y: 9px !important;
        }
        .leaflet-draw-toolbar a:hover { background-color: #bff6ff !important; }
        .leaflet-draw-actions {
          border-radius: 8px !important;
          overflow: hidden;
          box-shadow: 0 8px 24px rgba(0,0,0,.4) !important;
        }
        .leaflet-draw-actions a {
          background-color: #0d1b31 !important;
          color: #c5d0e2 !important;
          border-color: #1f3454 !important;
        }
        .leaflet-draw-actions a:hover { background-color: #10b981 !important; color: #fff !important; }
        .leaflet-draw-tooltip { background: #0a1628; border-color: #2a4268; color: #eef3fa; }
        .leaflet-draw-tooltip:before { border-right-color: #0a1628; }
      `}</style>
    </div>
  );
}
