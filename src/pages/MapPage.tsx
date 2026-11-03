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
import BarraAsignacion from '../components/map/BarraAsignacion';
import SeleccionCaja, { MapaRef, type FormaSeleccion, type ModoSeleccion } from '../components/map/SeleccionCaja';
import SelectorHojasMapa from '../components/map/SelectorHojasMapa';
import AvisoAsignaciones from '../components/map/AvisoAsignaciones';
import RepetidoPopup from '../components/map/RepetidoPopup';
import {
  INFO_CATEGORIA,
  agruparRepetidos,
  copiasResueltas,
  type CategoriaRep,
  type GrupoRep,
} from '../components/map/repetidos';
import {
  COLOR_SIN_ASIGNAR,
  colorDeHoja,
  etiquetaHoja,
  filtrarPuntos,
  paletaTecnicos,
  tecnicoDe,
} from '../components/map/mapaHojas';
import { initialOf } from '../components/map/techUtils';
import OutOfPeruModal from '../components/map/OutOfPeruModal';
import { isInPeru } from '../utils/geo';
import DailyCalendarPanel from '../components/map/DailyCalendarPanel';
import { computeDailyProgress } from '../components/map/dailyProgress';
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, CircleMarker } from 'react-leaflet';
import { Icon, DivIcon, LatLngBounds, type Map as LMap, type LeafletEventHandlerFnMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { usePointsStore, useFilters, useTecnicos, useDistritos, useSheetStructure, useIsTecnico } from '../stores/pointsStore';
import { MAP_CONFIG } from '../config/api';
import { getPointStatus, getStatusColor, getStatusLabel } from '../types/point';
import type { GpsPoint, GpsPointExtended } from '../types/point';
import {
  Camera, MapPin, Filter, X,
  Search, Users, Building2, RotateCcw, Target, Pencil, CalendarDays, History, Copy, MessageCircle, Lasso, Square, Palette, Repeat, Eye, EyeOff
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

// Id y posición estables por punto: claves de React y posiciones que no cambian entre renders,
// para que Leaflet no vuelva a montar ni mover miles de marcadores.
let siguienteId = 0;
const idsPunto = new WeakMap<object, number>();
const idPunto = (p: object) => {
  let id = idsPunto.get(p);
  if (id === undefined) {
    id = ++siguienteId;
    idsPunto.set(p, id);
  }
  return id;
};
const posiciones = new WeakMap<object, [number, number] | null>();
const posicionDe = (p: GpsPoint | GpsPointExtended): [number, number] | null => {
  if (posiciones.has(p)) return posiciones.get(p) ?? null;
  const lat = toNumberOrNull(p.latReal) || toNumberOrNull(p.latRef);
  const lng = toNumberOrNull(p.longReal) || toNumberOrNull(p.longRef);
  const pos: [number, number] | null = lat && lng ? [lat, lng] : null;
  posiciones.set(p, pos);
  return pos;
};

// Manejadores de clic fijos por punto: llaman a la acción vigente del mapa. Así Leaflet no
// desengancha y vuelve a enganchar eventos en miles de marcadores en cada render.
type AccionPunto = (p: GpsPoint | GpsPointExtended) => void;
const accionesMapa: { actual: { click: AccionPunto; dblclick: AccionPunto } } = {
  actual: { click: () => {}, dblclick: () => {} },
};
const manejadores = new WeakMap<object, LeafletEventHandlerFnMap>();
const manejadorDe = (p: GpsPoint | GpsPointExtended) => {
  let h = manejadores.get(p);
  if (!h) {
    h = { click: () => accionesMapa.actual.click(p), dblclick: () => accionesMapa.actual.dblclick(p) };
    manejadores.set(p, h);
  }
  return h;
};

function createCustomIcon(
  status: 'pendiente' | 'en_proceso' | 'completado',
  isHighlighted: boolean = false,
  odtColor?: string | null,
  letter: string = '',
  hechoEnOtra: boolean = false,
  sospechoso: boolean = false,
  hojaColor: string | null = null,
  relleno: string | null = null,
  repColor: string | null = null,
  repPunteado: boolean = false,
  cuenta: number = 0
) {
  // SEGURIDAD: odtColor viene de la app movil y se interpola en HTML;
  // solo se acepta un hex #RRGGBB estricto.
  const hasOdtColor = isValidHexColor(odtColor);
  const key = `${status}|${isHighlighted ? 1 : 0}|${hasOdtColor ? odtColor : ''}|${letter}|${hechoEnOtra ? 1 : 0}|${sospechoso ? 1 : 0}|${hojaColor ?? ''}|${relleno ?? ''}|${repColor ?? ''}|${repPunteado ? 1 : 0}|${cuenta}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  const statusColor = safeHexColor(getStatusColor(status), '#ef4444');
  const size = isHighlighted ? 28 : letter ? 20 : 16;
  // «Colorear por asignado»: relleno = técnico asignado y borde = estado
  const bgColor = relleno ? safeHexColor(relleno, statusColor) : hasOdtColor ? safeHexColor(odtColor, statusColor) : statusColor;
  const ring = isHighlighted
    ? '#00d4ff'
    : sospechoso
    ? '#c084fc'
    : repColor
    ? safeHexColor(repColor, '#2dd4bf')
    : hechoEnOtra
    ? '#fbbf24'
    : hasOdtColor || relleno
    ? statusColor
    : 'rgba(255,255,255,0.85)';
  const grueso = isHighlighted || hechoEnOtra || sospechoso || !!repColor;
  const punteado = !isHighlighted && (repColor ? repPunteado : hechoEnOtra);
  // Jornada adicional: anillo exterior con su color
  const halo = hojaColor ? `0 0 0 ${isHighlighted ? 4 : 3}px ${safeHexColor(hojaColor, '#38bdf8')}` : `0 0 0 ${isHighlighted ? 4 : 2}px ${statusColor}33`;

  const icon = new DivIcon({
    html: `<div class="map-dot${isHighlighted ? ' map-dot--active' : ''}" style="
        width:${size}px;height:${size}px;background:${bgColor};
        border:${grueso ? 3 : 2}px ${punteado ? 'dashed' : 'solid'} ${ring};
        box-shadow:${halo}, 0 2px 6px rgba(0,0,0,.45);
      ">${letter ? `<span class="map-dot__letter">${letter}</span>` : ''}${
        cuenta > 1 ? `<span class="map-dot__cuenta" style="background:${safeHexColor(repColor, '#2dd4bf')}">${cuenta}</span>` : ''
      }</div>`,
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
  const [fotoInicial, setFotoInicial] = useState(0);
  const [highlightedPointId, setHighlightedPointId] = useState<string | null>(null);
  // Un solo globo para todo el mapa (antes había uno por marcador: miles de objetos)
  const [popupPunto, setPopupPunto] = useState<GpsPoint | GpsPointExtended | null>(null);
  const [autoFit, setAutoFit] = useState(true);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Drawing mode state
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<GpsPoint | GpsPointExtended>>(() => new Set());
  const openFicha = useSuministroDrawer((st) => st.open);
  const [showOutOfPeru, setShowOutOfPeru] = useState(false);
  const [showDaily, setShowDaily] = useState(false);
  // Suministros hechos en OTRAS jornadas (para detectar pendientes ya resueltos)
  const { sheets } = usePointsStore();
  const [otras, setOtras] = useState<Map<string, Ocurrencia[]> | null>(null);
  const [otrasProgreso, setOtrasProgreso] = useState<{ hechas: number; total: number } | null>(null);
  const [traer, setTraer] = useState<{ oc: Ocurrencia[]; destino: string } | null>(null);
  // Filtro «Repetidos»: null = ver todo; si no, solo esas categorías
  const [filtroRep, setFiltroRep] = useState<Set<CategoriaRep> | null>(null);
  const [verTodasHojas, setVerTodasHojas] = useState(false);
  // Jornadas cargadas pero ocultas en el mapa (ojito de la leyenda)
  const [ocultas, setOcultas] = useState<Set<string>>(() => new Set());
  const alternarOculta = (h: string) => {
    setOcultas((prev) => {
      const s = new Set(prev);
      if (s.has(h)) s.delete(h);
      else s.add(h);
      return s;
    });
    setAutoFit(true);
  };
  const soloEsta = (h: string, todas: string[]) => {
    setOcultas(new Set(todas.filter((x) => x !== h)));
    setAutoFit(true);
  };
  // Filtro «solo pendientes ya hechos en otra jornada» (tras revisar las demás jornadas)
  const [soloYaHechos, setSoloYaHechos] = useState(false);
  // Estados ocultos con el ojito de la leyenda (pendiente / en_proceso / completado)
  const [estadosOcultos, setEstadosOcultos] = useState<Set<string>>(() => new Set());
  const alternarEstado = (st: string) => {
    setEstadosOcultos((prev) => {
      const s = new Set(prev);
      if (s.has(st)) s.delete(st);
      else s.add(st);
      return s;
    });
  };
  const [showSospechosos, setShowSospechosos] = useState(false);
  const [comp, setComp] = useState<Comparacion | null>(null);
  const [verCorr, setVerCorr] = useState(0); // fuerza releer las correcciones guardadas
  const [dayFilter, setDayFilter] = useState<string | null>(null);

  // Jornadas adicionales en el mapa (se recuerdan en este navegador)
  const [extrasElegidas, setExtrasElegidas] = useState<string[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem('mapa-jornadas-extra') || '[]');
      return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  });
  const [extraDatos, setExtraDatos] = useState<Map<string, GpsPointExtended[]>>(() => new Map());
  const [extraProg, setExtraProg] = useState<{ hechas: number; total: number } | null>(null);
  const [colorPor, setColorPor] = useState<'estado' | 'asignado'>('estado');
  const [forma, setForma] = useState<FormaSeleccion>('caja');
  const [aviso, setAviso] = useState<{ foco: string | null } | null>(null);
  const mapaRef = useRef<LMap | null>(null);
  const colorAntesDeAsignar = useRef<'estado' | 'asignado'>('estado');
  const recargarSilencioso = usePointsStore((st) => st.recargarSilencioso);

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

  // Solo jornadas que existen y no son la principal
  const nombresHojas = useMemo(() => sheets.map((sh) => sh.name), [sheets]);
  const extras = useMemo(
    () => extrasElegidas.filter((h) => h !== selectedSheet && (nombresHojas.length === 0 || nombresHojas.includes(h))),
    [extrasElegidas, selectedSheet, nombresHojas]
  );
  const cambiarExtras = (xs: string[]) => {
    setExtrasElegidas(xs);
    setAutoFit(true);
    try {
      localStorage.setItem('mapa-jornadas-extra', JSON.stringify(xs));
    } catch {
      /* sin almacenamiento: solo dura esta sesión */
    }
  };

  const cargarExtras = useCallback(async (hojas: string[], forzar = false) => {
    if (!hojas.length) return;
    setExtraProg({ hechas: 0, total: hojas.length });
    const res = await cargarJornadas(hojas, (hechas, total) => setExtraProg({ hechas, total }), forzar);
    setExtraDatos((prev) => {
      const m = new Map(prev);
      res.forEach((pts, h) => m.set(h, pts));
      return m;
    });
    setExtraProg(null);
  }, []);

  useEffect(() => {
    const faltan = extras.filter((h) => !extraDatos.has(h));
    if (faltan.length && !extraProg) void Promise.resolve().then(() => cargarExtras(faltan));
  }, [extras, extraDatos, extraProg, cargarExtras]);

  // Puntos de las jornadas adicionales con los mismos filtros que la principal
  const extraPuntos = useMemo(
    () => extras.map((h) => ({ hoja: h, todos: extraDatos.get(h) || [], filtrados: filtrarPuntos(extraDatos.get(h) || [], storeFilters) })),
    [extras, extraDatos, storeFilters]
  );

  // Jornada de cada punto (los objetos de punto son únicos por jornada)
  const hojaDeMapa = useMemo(() => {
    const m = new Map<GpsPoint | GpsPointExtended, string>();
    extraPuntos.forEach(({ hoja, todos }) => todos.forEach((p) => m.set(p, hoja)));
    return m;
  }, [extraPuntos]);
  const hojaDe = useCallback((p: GpsPoint | GpsPointExtended) => hojaDeMapa.get(p) || selectedSheet || '', [hojaDeMapa, selectedSheet]);

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
  const principalOculta = !!selectedSheet && ocultas.has(selectedSheet);
  const visiblePoints = useMemo(() => {
    return [
      ...(principalOculta ? [] : filteredPoints),
      ...extraPuntos.filter((x) => !ocultas.has(x.hoja)).flatMap((x) => x.filtrados),
    ].filter((p) => (p.latReal && p.longReal) || (p.latRef && p.longRef));
  }, [filteredPoints, extraPuntos, ocultas, principalOculta]);

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

  // Trigger auto-fit
  const handleCenterOnPoints = () => {
    setAutoFit(true);
  };

  // Puntos de toda la jornada con coordenadas (para el avance por técnico)
  const allMapPoints = useMemo(
    () =>
      [
        ...(principalOculta ? [] : pointsExtended.length ? pointsExtended : filteredPoints),
        ...extraPuntos.filter((x) => !ocultas.has(x.hoja)).flatMap((x) => x.todos),
      ].filter((p) => (p.latReal && p.longReal) || (p.latRef && p.longRef)),
    [pointsExtended, filteredPoints, extraPuntos, ocultas, principalOculta]
  );

  // Color fijo por técnico asignado (mismo en el mapa, la barra y los avisos)
  const paleta = useMemo(() => paletaTecnicos(allMapPoints), [allMapPoints]);
  const colorDeTecnico = useCallback((n: string) => paleta.get(n.trim()), [paleta]);
  const leyendaAsignados = useMemo(() => {
    const m = new Map<string, number>();
    visiblePoints.forEach((p) => {
      const t = tecnicoDe(p) || 'Sin asignar';
      m.set(t, (m.get(t) || 0) + 1);
    });
    return [...m].sort((a, b) => (a[0] === 'Sin asignar' ? 1 : b[0] === 'Sin asignar' ? -1 : b[1] - a[1]));
  }, [visiblePoints]);
  // Un suministro que está en varias jornadas se junta en un solo punto (ver repetidos.ts)
  const grupos = useMemo(
    () => agruparRepetidos(allMapPoints.map((point) => ({ point, hoja: hojaDe(point) })), nombresHojas),
    [allMapPoints, hojaDe, nombresHojas]
  );
  const grupoDe = useMemo(() => {
    const m = new Map<GpsPoint | GpsPointExtended, GrupoRep>();
    grupos.forEach((g) => m.set(g.repr, g));
    return m;
  }, [grupos]);
  const resueltas = useMemo(() => copiasResueltas(grupos), [grupos]);
  const conteoRep = useMemo(() => {
    const c = new Map<CategoriaRep, number>();
    grupos.forEach((g) => g.categoria !== 'unico' && c.set(g.categoria, (c.get(g.categoria) || 0) + 1));
    return c;
  }, [grupos]);
  const totalRep = [...conteoRep.values()].reduce((a, b) => a + b, 0);

  // Grupos que pasan los filtros: con un estado elegido manda el estado del grupo (un pendiente
  // ya hecho en el periodo cuenta como hecho); si no, basta con que una de sus copias pase.
  // Un suministro pendiente aquí que ya tiene fotos en otra jornada del libro
  const esYaHecho = useCallback(
    (g: GrupoRep) =>
      !!otras && g.entradas.some((e) => e.estado === 'pendiente' && otras.has(normSuministro(e.point.suministro))),
    [otras]
  );
  const gruposPorFiltros = useMemo(() => {
    const vis = new Set<GpsPoint | GpsPointExtended>(visiblePoints);
    const porEstado = storeFilters.status && storeFilters.status !== 'todos';
    return grupos.filter((g) => {
      if (filtroRep && (g.categoria === 'unico' || !filtroRep.has(g.categoria))) return false;
      if (porEstado) return g.estado === storeFilters.status && g.entradas.some((e) => vis.has(e.point));
      return g.entradas.some((e) => vis.has(e.point));
    });
  }, [grupos, visiblePoints, storeFilters.status, filtroRep]);
  const gruposYaHechos = useMemo(() => gruposPorFiltros.filter(esYaHecho), [gruposPorFiltros, esYaHecho]);
  const gruposBase = soloYaHechos && otras ? gruposYaHechos : gruposPorFiltros;
  // Ojito de la leyenda por estado: oculta del mapa sin cambiar los contadores
  const gruposVisibles = useMemo(
    () => (estadosOcultos.size ? gruposBase.filter((g) => !estadosOcultos.has(g.estado)) : gruposBase),
    [gruposBase, estadosOcultos]
  );
  const repVisibles = useMemo(() => gruposVisibles.filter((g) => g.categoria !== 'unico').length, [gruposVisibles]);

  // Avance de lo que se ve, contando suministros (no filas repetidas)
  const visibleStats = useMemo(() => {
    const r = { total: gruposBase.length, pendientes: 0, enProceso: 0, completados: 0 };
    gruposBase.forEach((g) => {
      if (g.estado === 'pendiente') r.pendientes++;
      else if (g.estado === 'en_proceso') r.enProceso++;
      else r.completados++;
    });
    return r;
  }, [gruposBase]);

  const alternarFiltroRep = (c: CategoriaRep | 'todas') => {
    setAutoFit(true);
    setFiltroRep((prev) => {
      if (c === 'todas') return prev ? null : new Set(conteoRep.keys());
      const s = new Set(prev ?? []);
      if (s.has(c)) s.delete(c);
      else s.add(c);
      return s.size ? s : null;
    });
  };

  const itemsAviso = useMemo(
    () =>
      [
        ...(pointsExtended as (GpsPoint | GpsPointExtended)[]).map((point) => ({ point, hoja: selectedSheet || '' })),
        ...extraPuntos.flatMap((x) => x.todos.map((point) => ({ point, hoja: x.hoja }))),
      ].filter((x) => !resueltas.has(x.point)),
    [pointsExtended, extraPuntos, selectedSheet, resueltas]
  );

  // Día de la primera foto de cada punto (para el filtro por día)
  const firstDay = useMemo(() => computeDailyProgress(allMapPoints).firstDay, [allMapPoints]);
  // Con un día elegido se muestran los puntos avanzados ese día y, siempre, los pendientes
  const puntosGrupo = useMemo(() => gruposVisibles.map((g) => g.repr), [gruposVisibles]);
  const dayCount = useMemo(
    () => (dayFilter ? puntosGrupo.filter((p) => firstDay.get(p.suministro) === dayFilter).length : 0),
    [puntosGrupo, dayFilter, firstDay]
  );
  const displayPoints = useMemo(
    () =>
      dayFilter
        ? puntosGrupo.filter(
            (p) => firstDay.get(p.suministro) === dayFilter || getPointStatus(p) === 'pendiente'
          )
        : puntosGrupo,
    [puntosGrupo, dayFilter, firstDay]
  );

  // Al asignar, un punto repetido lleva todas sus copias pendientes (una por jornada);
  // si ya está hecho en el periodo, sus copias pendientes no se asignan.
  const seleccionExpandida = useMemo(
    () =>
      [...seleccion].flatMap((p) => {
        const g = grupoDe.get(p);
        if (!g || g.categoria === 'unico' || g.categoria === 'pend_hecho_reciente') return [p];
        return g.entradas.map((e) => e.point);
      }),
    [seleccion, grupoDe]
  );
  const dayFilterLabel = dayFilter
    ? new Date(`${dayFilter}T12:00:00`).toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' })
    : '';

  const coordsDe = (p: GpsPoint | GpsPointExtended): [number, number] | null => {
    const lat = toNumberOrNull(p.latReal) || toNumberOrNull(p.latRef);
    const lng = toNumberOrNull(p.longReal) || toNumberOrNull(p.longRef);
    return lat && lng ? [lat, lng] : null;
  };

  // Trazo terminado (recuadro o lazo): combina los puntos que quedaron dentro con la selección actual
  const handleSeleccion = (contiene: (c: [number, number]) => boolean, modo: ModoSeleccion) => {
    const dentro = displayPoints.filter((p) => {
      const c = coordsDe(p);
      return !!c && contiene(c);
    });
    setSeleccion((prev) => {
      const s = modo === 'nuevo' ? new Set<GpsPoint | GpsPointExtended>() : new Set(prev);
      dentro.forEach((p) => (modo === 'quitar' ? s.delete(p) : s.add(p)));
      return s;
    });
  };
  const alternarPunto = (p: GpsPoint | GpsPointExtended) =>
    setSeleccion((prev) => {
      const s = new Set(prev);
      if (s.has(p)) s.delete(p);
      else s.add(p);
      return s;
    });

  // Puntos que se ven en pantalla ahora mismo
  const enPantalla = useCallback(() => {
    const b = mapaRef.current?.getBounds();
    return b ? displayPoints.filter((p) => { const c = coordsDe(p); return !!c && b.contains(c); }) : [];
  }, [displayPoints]);
  // Doble clic (como en los juegos de estrategia): suma los iguales que están en pantalla,
  // es decir, mismo estado y mismo técnico asignado
  const seleccionarIguales = (p: GpsPoint | GpsPointExtended) => {
    const st = getPointStatus(p);
    const t = tecnicoDe(p);
    const iguales = enPantalla().filter((x) => getPointStatus(x) === st && tecnicoDe(x) === t);
    setSeleccion((prev) => new Set([...prev, ...iguales]));
  };

  // Activar o salir del modo de asignación (al entrar, el mapa se colorea por asignado)
  const toggleDrawingMode = () => {
    if (!isDrawingMode) {
      colorAntesDeAsignar.current = colorPor;
      setColorPor('asignado');
    } else {
      setColorPor(colorAntesDeAsignar.current);
    }
    setIsDrawingMode(!isDrawingMode);
    setSeleccion(new Set());
  };

  // Ctrl+A: todos los pendientes que se ven en pantalla
  useEffect(() => {
    if (!isDrawingMode) return;
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        const pend = enPantalla().filter((p) => getPointStatus(p) === 'pendiente');
        setSeleccion((prev) => new Set(e.shiftKey ? [...prev, ...pend] : pend));
      } else if (e.key.toLowerCase() === 'l' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setForma((f) => (f === 'lazo' ? 'caja' : 'lazo'));
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isDrawingMode, enPantalla]);


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
    setSoloYaHechos(false);
    setOtrasProgreso(null);
  };
  const hechosEnOtra = (sum: string) => otras?.get(normSuministro(sum)) || null;

  // ── Rendimiento del mapa ──
  // Los marcadores solo se recalculan cuando cambia lo que se dibuja; sus manejadores de eventos
  // son fijos por punto (llaman a la acción actual por una ref) para no re-enganchar miles.
  useEffect(() => {
    accionesMapa.actual = {
      click: (p) => {
        if (isDrawingMode) alternarPunto(p);
        else {
          setHighlightedPointId(p.suministro);
          setPopupPunto(p);
        }
      },
      dblclick: (p) => {
        if (isDrawingMode) seleccionarIguales(p);
      },
    };
  });

  const infoDe = useCallback(
    (point: GpsPoint | GpsPointExtended) => {
      const pos = posicionDe(point);
      const grupo = grupoDe.get(point);
      const repe = grupo && grupo.categoria !== 'unico' ? grupo : null;
      const status = repe ? repe.estado : getPointStatus(point);
      const hoja = hojaDe(point);
      const esPrincipal = hoja === selectedSheet;
      return {
        point,
        pos,
        lat: pos?.[0] ?? 0,
        lng: pos?.[1] ?? 0,
        repe,
        status,
        extPoint: point as GpsPointExtended,
        hoja,
        esPrincipal,
        hojaColor: esPrincipal || repe ? null : colorDeHoja(extras, hoja),
        esSospechoso: sospechososSet.has(point),
      };
    },
    [grupoDe, hojaDe, selectedSheet, extras, sospechososSet]
  );

  const marcadores = useMemo(
    () =>
      displayPoints.map((point) => {
        const { pos, repe, status, extPoint, hoja, esPrincipal, hojaColor, esSospechoso } = infoDe(point);
        if (!pos) return null;
        // Por estado: relleno y letra de quien tomó la foto. Por asignado: los del técnico asignado.
        const asignado = tecnicoDe(point);
        const relleno = colorPor === 'asignado' ? paleta.get(asignado) ?? COLOR_SIN_ASIGNAR : null;
        const letter =
          colorPor === 'asignado' ? initialOf(asignado) : status !== 'pendiente' ? initialOf(extPoint.odtNombre) : '';
        const yaHecho = !repe && esPrincipal && status === 'pendiente' && !!otras?.has(normSuministro(point.suministro));
        const icon = createCustomIcon(
          status,
          highlightedPointId === point.suministro,
          extPoint.odtColor,
          letter,
          yaHecho,
          esSospechoso,
          hojaColor,
          relleno,
          repe ? INFO_CATEGORIA[repe.categoria as Exclude<CategoriaRep, 'unico'>].color : null,
          repe?.categoria === 'pend_hecho_anterior' || repe?.categoria === 'pend_varias',
          repe?.hojas ?? 0
        );
        return (
          <Marker key={`${hoja}-${idPunto(point)}`} position={pos} icon={icon} eventHandlers={manejadorDe(point)} />
        );
      }),
    [displayPoints, infoDe, colorPor, paleta, otras, highlightedPointId]
  );

  // Círculos de la selección: claves estables para no rehacerlos todos al sumar o quitar uno
  const circulosSeleccion = useMemo(
    () =>
      isDrawingMode
        ? [...seleccion].map((p) => {
            const c = posicionDe(p);
            return c ? (
              <CircleMarker
                key={`sel-${idPunto(p)}`}
                center={c}
                radius={15}
                interactive={false}
                pathOptions={{ color: '#00d4ff', weight: 2.5, fillColor: '#00d4ff', fillOpacity: 0.15 }}
              />
            ) : null;
          })
        : null,
    [isDrawingMode, seleccion]
  );

  const popupInfo = popupPunto && !isDrawingMode ? infoDe(popupPunto) : null;
  const popupManejadores = useMemo<LeafletEventHandlerFnMap | undefined>(
    () => (popupPunto ? { remove: () => setPopupPunto((cur) => (cur === popupPunto ? null : cur)) } : undefined),
    [popupPunto]
  );
  const pendientesYaHechos = gruposYaHechos.length;
  const alternarYaHechos = () => {
    setSoloYaHechos((v) => !v);
    setAutoFit(true);
  };

  // Tras asignar: releer solo las jornadas tocadas, sin pantalla de carga (el mapa no se mueve)
  const handleAssignComplete = (hojas: string[]) => {
    setSeleccion(new Set());
    if (selectedSheet && hojas.includes(selectedSheet)) recargarSilencioso();
    const tocadas = hojas.filter((h) => h !== selectedSheet && extras.includes(h));
    if (tocadas.length) cargarExtras(tocadas, true);
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
      <div className="flex flex-col gap-3 rounded-t-2xl border border-gray-200 bg-white p-4">
        <div className="min-w-0 flex-1">
          <p className="brand-kicker">Mapa operativo</p>
          <h1 className="mt-0.5 flex items-center gap-2 text-xl font-bold text-gray-900">
            <MapPin className="text-electric" size={20} />
            Mapa de Asignaciones
          </h1>
          <p className="text-sm text-gray-500">
            {selectedSheet
              ? `${gruposVisibles.length.toLocaleString('es-PE')} suministros con coordenadas${
                  extras.length ? ` en ${extras.length + 1} jornadas` : ` de ${filteredPoints.length.toLocaleString('es-PE')} filtrados`
                }`
              : 'Selecciona una jornada'}
            {totalRep > 0 && (
              <button
                onClick={() => alternarFiltroRep('todas')}
                className={`ml-2 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] ${
                  filtroRep ? 'border-teal-400 text-teal-300' : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
                title="Suministros que aparecen en más de una jornada: se ven como un solo punto con ×N"
              >
                <Repeat size={11} />
                {filtroRep ? `Viendo ${repVisibles} repetidos · quitar filtro` : `${totalRep} repetidos entre jornadas · ver solo esos`}
              </button>
            )}
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

        <div className="flex flex-wrap items-center gap-2">
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
            onClick={otras ? alternarYaHechos : verificarOtras}
            disabled={!!otrasProgreso || !selectedSheet}
            className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors disabled:opacity-60 ${
              soloYaHechos && otras
                ? 'border-amber-400 bg-amber-500 font-semibold text-navy-950'
                : otras
                  ? 'border-energy/60 text-energy hover:border-energy'
                  : 'border-gray-300 text-gray-700 hover:border-electric hover:text-electric'
            }`}
            title={
              otras
                ? soloYaHechos
                  ? 'Volver a ver todos los puntos'
                  : 'Ver en el mapa solo los pendientes que ya tienen fotos en otra jornada'
                : 'Detectar pendientes de esta jornada que ya se hicieron en otra'
            }
          >
            <History size={16} className={otrasProgreso ? 'animate-spin' : ''} />
            {otrasProgreso
              ? `Revisando ${otrasProgreso.hechas}/${otrasProgreso.total}`
              : otras
                ? soloYaHechos
                  ? `Viendo ${pendientesYaHechos} ya hechos · quitar filtro`
                  : `${pendientesYaHechos} ya hechos en otra · ver solo esos`
                : 'Hechos en otras jornadas'}
          </button>

          <button
            onClick={() => {
              if (showDaily) setDayFilter(null);
              setShowDaily((v) => !v);
              setIsDrawingMode(false);
            }}
            className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
              showDaily ? 'border-electric text-electric' : 'border-gray-300 text-gray-700 hover:border-electric hover:text-electric'
            }`}
            title="Avance por día y por técnico"
          >
            <CalendarDays size={16} />
            Avance diario
          </button>

          <SelectorHojasMapa
            hojas={nombresHojas}
            principal={selectedSheet}
            extras={extras}
            onChange={cambiarExtras}
            progreso={extraProg}
          />

          <button
            onClick={() => setColorPor((c) => (c === 'estado' ? 'asignado' : 'estado'))}
            className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
              colorPor === 'asignado' ? 'border-electric text-electric' : 'border-gray-300 text-gray-700 hover:border-electric hover:text-electric'
            }`}
            title="Colorear los puntos por el técnico asignado (zonas de cada uno) o por quién tomó la foto"
          >
            <Palette size={16} />
            {colorPor === 'asignado' ? 'Color: asignado' : 'Color: estado'}
          </button>

          {!isTecnico && (
            <button
              onClick={() => setAviso({ foco: null })}
              className="flex shrink-0 items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 transition-colors hover:border-green-500 hover:text-green-700"
              title="Mandar a cada técnico lo que tiene pendiente (WhatsApp)"
            >
              <MessageCircle size={16} />
              Avisar
            </button>
          )}

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
              title="Seleccionar puntos en el mapa y asignarlos a un técnico"
            >
              <Pencil size={16} />
              {isDrawingMode ? 'Salir de asignar' : 'Asignar área'}
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

          <MapaRef onMapa={(m) => (mapaRef.current = m)} />
          <SeleccionCaja activo={isDrawingMode} forma={forma} onSeleccion={handleSeleccion} />
          {circulosSeleccion}

          {marcadores}

          {popupInfo?.pos &&
            (() => {
              const { point, lat, lng, repe, status, extPoint, hoja, esPrincipal, hojaColor, esSospechoso } = popupInfo;
              return (
                <Popup key={idPunto(point)} position={popupInfo.pos} offset={[0, -6]} eventHandlers={popupManejadores}>
                  {repe ? (
                    <RepetidoPopup
                      grupo={repe}
                      principal={selectedSheet}
                      isTecnico={isTecnico}
                      onFicha={(p, h) => openFicha(p as GpsPointExtended, h)}
                      onFotos={(p, i) => {
                        setFotoInicial(i);
                        setSelectedPoint(p);
                      }}
                      onTraer={(oc, destino) => setTraer({ oc, destino })}
                    />
                  ) : (
                  <div className="min-w-[240px]">
                    <div className="mb-3 flex items-start justify-between gap-3 border-b border-gray-200 pb-2">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-gray-500">Suministro</p>
                        <h3 className="font-mono text-base font-semibold text-gray-900">{point.suministro}</h3>
                        {extras.length > 0 && (
                          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-500" title={hoja}>
                            <span
                              className="inline-block h-2 w-2 rounded-full"
                              style={{ background: hojaColor ?? '#9ca3af' }}
                            />
                            {etiquetaHoja(hoja)}
                            {esPrincipal && ' · principal'}
                          </p>
                        )}
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

                    {/* Las fotos a la vista: se cargan livianas al abrir el globo */}
                    {(point.photoLinks?.length || 0) > 0 && (
                      <div className="mt-3">
                        <PhotoStrip
                          photos={point.photoLinks || []}
                          max={4}
                          size={52}
                          onOpen={(i) => {
                            setFotoInicial(Math.min(i, (point.photoLinks?.length || 1) - 1));
                            setSelectedPoint(point);
                          }}
                        />
                      </div>
                    )}

                    {esSospechoso && (
                      <button
                        onClick={() => setShowSospechosos(true)}
                        className="mt-3 w-full rounded-xl border border-purple-200 bg-purple-50 p-2.5 text-left text-xs text-purple-800 hover:bg-purple-100"
                      >
                        <span className="font-semibold">Suministro posiblemente mal escrito.</span> Ver sugerencia del código correcto →
                      </button>
                    )}
                    {status === 'pendiente' && esPrincipal && (() => {
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
                              onClick={() => setTraer({ oc, destino: selectedSheet || '' })}
                              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                            >
                              <Copy size={13} /> Traer a esta jornada
                            </button>
                          )}
                        </div>
                      );
                    })()}
                    <button
                      onClick={() => openFicha(point, hoja)}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:border-electric hover:text-electric"
                    >
                      Ficha e historial
                    </button>
                    {point.photoCount > 0 && (
                      <button
                        onClick={() => {
                          setFotoInicial(0);
                          setSelectedPoint(point);
                        }}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:brightness-110"
                      >
                        <Camera size={14} />
                        Ver fotos ({point.photoCount})
                      </button>
                    )}
                  </div>
                  )}
                </Popup>
              );
            })()}
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

        {/* Calendario de avance diario */}
        {showDaily && !isDrawingMode && (
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
        {!isDrawingMode && !filterPanelOpen && !showDaily && (
          <TecnicoProgressPanel
            points={allMapPoints}
            activeTecnico={localFilters.tecnico}
            onSelectTecnico={(n) => handleLocalFilterChange('tecnico', n)}
          />
        )}

        {/* Barra de mando para asignar la selección */}
        {isDrawingMode && (
          <>
            <div className="absolute left-1/2 top-3 z-[600] flex -translate-x-1/2 gap-1 rounded-xl border border-gray-200 bg-navy-900/95 p-1 shadow-lg backdrop-blur">
              {([
                ['caja', 'Recuadro', Square],
                ['lazo', 'Lazo', Lasso],
              ] as const).map(([f, label, Ico]) => (
                <button
                  key={f}
                  onClick={() => setForma(f)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
                    forma === f ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                  title={f === 'lazo' ? 'Dibuja el contorno del área a mano (tecla L)' : 'Arrastra un rectángulo (tecla L alterna)'}
                >
                  <Ico size={14} /> {label}
                </button>
              ))}
            </div>
            <BarraAsignacion
              seleccion={seleccionExpandida}
              allPoints={allMapPoints}
              hojaDe={hojaDe}
              colorDe={colorDeTecnico}
              onLimpiar={() => setSeleccion(new Set())}
              onAsignado={handleAssignComplete}
              onAvisar={(n) => setAviso({ foco: n })}
            />
          </>
        )}

        {/* Leyenda */}
        <div
          className={`absolute bottom-4 left-4 z-[500] max-h-[calc(100%-2rem)] w-56 overflow-y-auto rounded-xl border border-gray-200 bg-navy-900/90 p-3 shadow-lg backdrop-blur ${isDrawingMode ? 'hidden' : ''}`}
        >
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Leyenda</p>
          {totalRep > 0 && (
            <div className="mb-2 space-y-1 border-b border-gray-200 pb-2">
              <p className="text-[11px] text-gray-500">Repetidos entre jornadas (clic = filtrar)</p>
              {(Object.keys(INFO_CATEGORIA) as Exclude<CategoriaRep, 'unico'>[]).map((c) => {
                const n = conteoRep.get(c) || 0;
                if (!n) return null;
                const activo = filtroRep?.has(c);
                return (
                  <button
                    key={c}
                    onClick={() => alternarFiltroRep(c)}
                    title={INFO_CATEGORIA[c].desc}
                    className={`flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-xs ${
                      activo ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full bg-gray-500"
                      style={{
                        border: `2px ${c === 'pend_hecho_anterior' || c === 'pend_varias' ? 'dashed' : 'solid'} ${INFO_CATEGORIA[c].color}`,
                      }}
                    />
                    <span className="min-w-0 flex-1">{INFO_CATEGORIA[c].corto}</span>
                    <span className="font-mono text-gray-500">{n}</span>
                  </button>
                );
              })}
            </div>
          )}
          {colorPor === 'asignado' && (
            <div className="mb-2 max-h-48 space-y-1 overflow-y-auto border-b border-gray-200 pb-2">
              {leyendaAsignados.map(([n, c]) => (
                <div key={n} className="flex items-center gap-2 text-xs text-gray-700">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: n === 'Sin asignar' ? COLOR_SIN_ASIGNAR : paleta.get(n) ?? COLOR_SIN_ASIGNAR }}
                  />
                  <span className="min-w-0 flex-1 break-words">{n}</span>
                  <span className="font-mono text-gray-500">{c}</span>
                </div>
              ))}
              <p className="text-[11px] text-gray-500">Relleno = asignado · borde = estado</p>
            </div>
          )}
          {extras.length > 0 && (
            <div className="mb-2 space-y-0.5 border-b border-gray-200 pb-2">
              {(() => {
                const todas = [...(selectedSheet ? [selectedSheet] : []), ...extras];
                const lista = [...(selectedSheet ? [selectedSheet] : []), ...(verTodasHojas ? extras : extras.slice(0, 6))];
                const hayOcultas = todas.some((h) => ocultas.has(h));
                return (
                  <>
                    {lista.map((h) => {
                      const oculta = ocultas.has(h);
                      const principal = h === selectedSheet;
                      return (
                        <div key={h} className="group flex items-center gap-1 text-xs" title={h}>
                          <button
                            onClick={() => alternarOculta(h)}
                            onDoubleClick={() => soloEsta(h, todas)}
                            className={`flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-gray-100 ${
                              oculta ? 'text-gray-400 line-through' : 'text-gray-700'
                            }`}
                            title={`${h}\nClic: ${oculta ? 'mostrar' : 'ocultar'} · doble clic: ver solo esta`}
                          >
                            {principal ? (
                              <span
                                className={`h-3 w-3 shrink-0 rounded-full border-2 border-white/80 bg-gray-500 ${oculta ? 'opacity-30' : ''}`}
                              />
                            ) : (
                              <span
                                className={`h-3 w-3 shrink-0 rounded-full bg-gray-500 ${oculta ? 'opacity-30' : ''}`}
                                style={{ boxShadow: `0 0 0 3px ${colorDeHoja(extras, h)}` }}
                              />
                            )}
                            <span className="break-words">
                              {etiquetaHoja(h)}
                              {principal ? ' (principal)' : ''}
                            </span>
                          </button>
                          <button
                            onClick={() => alternarOculta(h)}
                            className={`shrink-0 rounded p-0.5 hover:bg-gray-100 ${oculta ? 'text-gray-400' : 'text-gray-500 hover:text-electric'}`}
                            title={oculta ? 'Mostrar en el mapa' : 'Ocultar del mapa'}
                            aria-label={oculta ? `Mostrar ${h}` : `Ocultar ${h}`}
                          >
                            {oculta ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                        </div>
                      );
                    })}
                    <div className="flex flex-wrap gap-x-3 pt-0.5">
                      {extras.length > 6 && (
                        <button onClick={() => setVerTodasHojas((v) => !v)} className="text-[11px] text-electric hover:underline">
                          {verTodasHojas ? 'Ver menos' : `y ${extras.length - 6} jornadas más`}
                        </button>
                      )}
                      {hayOcultas && (
                        <button
                          onClick={() => {
                            setOcultas(new Set());
                            setAutoFit(true);
                          }}
                          className="text-[11px] text-electric hover:underline"
                        >
                          Mostrar todas
                        </button>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          )}
          <div className="space-y-0.5">
            {[
              { st: 'pendiente', label: 'Pendiente', color: 'bg-red-500', n: visibleStats.pendientes },
              { st: 'en_proceso', label: 'En proceso', color: 'bg-yellow-500', n: visibleStats.enProceso },
              { st: 'completado', label: 'Completado', color: 'bg-green-500', n: visibleStats.completados },
            ].map((l) => {
              const oculto = estadosOcultos.has(l.st);
              return (
                <div key={l.st} className="flex items-center gap-1 text-xs">
                  <button
                    onClick={() => alternarEstado(l.st)}
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-gray-100 ${
                      oculto ? 'text-gray-400 line-through' : 'text-gray-700'
                    }`}
                    title={oculto ? 'Mostrar en el mapa' : 'Ocultar del mapa'}
                  >
                    <span className={`h-3 w-3 shrink-0 rounded-full border-2 border-white/80 ${l.color} ${oculto ? 'opacity-30' : ''}`} />
                    <span className="flex-1">{l.label}</span>
                    <span className="font-mono text-[11px] text-gray-500">{l.n.toLocaleString('es-PE')}</span>
                  </button>
                  <button
                    onClick={() => alternarEstado(l.st)}
                    className={`shrink-0 rounded p-0.5 hover:bg-gray-100 ${oculto ? 'text-gray-400' : 'text-gray-500 hover:text-electric'}`}
                    title={oculto ? 'Mostrar en el mapa' : 'Ocultar del mapa'}
                    aria-label={oculto ? `Mostrar ${l.label}` : `Ocultar ${l.label}`}
                  >
                    {oculto ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="mt-2 max-w-[180px] border-t border-gray-200 pt-2 text-[11px] leading-snug text-gray-500">
            Con foto, el relleno y la letra indican el técnico que la tomó.
            {malEscritos.length > 0 && (
              <span className="mt-1 flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full border-2 border-purple-400 bg-green-500" /> Suministro posiblemente mal escrito
              </span>
            )}
            {otras && (
              <button
                onClick={alternarYaHechos}
                className={`mt-1 flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-gray-100 ${
                  soloYaHechos ? 'font-semibold text-energy' : ''
                }`}
                title={soloYaHechos ? 'Volver a ver todos' : 'Ver solo estos'}
              >
                <span className="h-3 w-3 shrink-0 rounded-full border-2 border-dashed border-energy bg-red-500" /> Pendiente
                ya hecho en otra jornada ({pendientesYaHechos}){soloYaHechos ? ' · solo estos' : ''}
              </button>
            )}
          </p>
        </div>

        {/* Indicador cuando no hay puntos */}
        {visiblePoints.length === 0 && filteredPoints.length > 0 && ocultas.size === 0 && (
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

      {traer && traer.destino && (
        <TraerRegistroModal
          destino={traer.destino}
          ocurrencias={traer.oc}
          onClose={() => setTraer(null)}
          onDone={() => handleAssignComplete([traer.destino])}
        />
      )}

      {aviso && (
        <AvisoAsignaciones items={itemsAviso} foco={aviso.foco} colorDe={colorDeTecnico} onClose={() => setAviso(null)} />
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
            initialIndex={fotoInicial}
            onClose={() => setSelectedPoint(null)}
          />
        </div>
      )}

      {/* Estilos de marcadores y barra de dibujo (tema oscuro) */}
      <style>{`
        .map-dot { position: relative; border-radius: 9999px; transition: transform .15s ease; display:flex; align-items:center; justify-content:center; }
        .map-dot__cuenta { position:absolute; top:-9px; right:-10px; min-width:14px; height:14px; padding:0 3px; border-radius:7px; font: 700 9px/14px 'Plus Jakarta Sans', sans-serif; color:#0b1220; text-align:center; box-shadow:0 1px 3px rgba(0,0,0,.5); }
        .map-dot__letter { font: 700 10px/1 'Plus Jakarta Sans', sans-serif; color:#fff; text-shadow:0 1px 2px rgba(0,0,0,.6); }
        .map-dot--active .map-dot__letter { font-size: 12px; }
        .custom-marker:hover .map-dot { transform: scale(1.25); }
        .map-dot--active { animation: mapPulse 1.4s ease-in-out infinite; }
        @keyframes mapPulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(0,212,255,.25), 0 2px 6px rgba(0,0,0,.45); }
          50% { box-shadow: 0 0 0 10px rgba(0,212,255,0), 0 2px 6px rgba(0,0,0,.45); }
        }
      `}</style>
    </div>
  );
}
