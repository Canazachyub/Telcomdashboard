## CONTEXTO DEL PROYECTO

Estoy trabajando en el proyecto `TelcomDashboard` ubicado en `c:\PROGRAMACION\TelcomDashboard\`.

Este es un dashboard web React + TypeScript + Vite para monitorear el avance de trabajos de campo de TELCOM ENERGY.

### STACK TECNOLÓGICO
- React 18 + TypeScript 5
- Vite 7
- TailwindCSS 4
- React-Leaflet 5 (mapas)
- Zustand 5 (estado global)
- Axios (HTTP)
- jsPDF (reportes)

### APIs CONFIGURADAS
```typescript
// src/config/api.ts
export const API_POINTS = 'https://script.google.com/macros/s/AKfycbzI1qMwld17hq2yVlMGMsSsZVTxSVOU84DbAAslPd6D8sRHiXAY8qqKaTuiPup3eVum/exec';
export const API_ADMIN = 'https://script.google.com/macros/s/AKfycbxoqTqUnl-VqSYAR04i570c6X_OG9WaPsl5s3azylV_XSmiySDOz1-MwjhpiAyA4Zlv/exec';
```

---

## TAREA: ADAPTAR DASHBOARD PARA ESTRUCTURA EXTENDIDA

### OBJETIVO
Modificar el dashboard para:
1. Consumir la nueva API extendida (getAllPointsExtended, getStats, getSheetMetadata)
2. Mostrar TODOS los datos disponibles
3. Implementar filtros avanzados por técnico, distrito, estado, ruta
4. Mejorar reportes PDF con datos completos
5. Agregar gestión de tareas y asignaciones

---

## PASO 1: ACTUALIZAR TIPOS (src/types/point.ts)
```typescript
// Estructura de punto GPS completa
export interface GpsPoint {
  // Identificación
  rowIndex: number;
  structure: 'legacy' | 'extended';
  status: 'pendiente' | 'en_proceso' | 'completado';
  
  // Datos de planificación (Excel)
  numero: number | null;
  tecnico: string | null;
  fecha: string | null;
  suministro: string;
  codigoRuta: string | null;
  clienteNombre: string | null;
  direccion: string | null;
  distrito: string | null;
  sed: string | null;
  marca: string | null;
  modelo: string | null;
  serie: string | null;
  fase: string | null;
  anioFabricacion: number | null;
  hilos: number | null;
  consumoPromedio: number | null;
  equipoPatron: string | null;
  carga: string | null;
  dniCliente: string | null;
  
  // Coordenadas
  latRef: number | null;
  longRef: number | null;
  latReal: number | null;
  longReal: number | null;
  gis: string | null;
  
  // Datos operativos (App)
  estadoTarea: string | null;
  linkCarpeta: string | null;
  gpsReal: string | null;
  ubicacionGeo: string | null;
  lectura: string | null;
  fotoCount: number;
  photoLinks: string | null;
  photoLinksArray: PhotoLink[];
  syncedAt: string | null;
  notas: string | null;
}

export interface PhotoLink {
  url: string;
  fecha: string;
  numero: number;
}

export interface SheetMetadata {
  name: string;
  id: number;
  structure: 'legacy' | 'extended';
  totalRows: number;
  columns: string[];
}

export interface SheetStats {
  sheetName: string;
  structure: 'legacy' | 'extended';
  totals: {
    total: number;
    pendiente: number;
    en_proceso: number;
    completado: number;
    porcentajeAvance: number;
  };
  byTecnico: Record<string, {
    total: number;
    completado: number;
    pendiente: number;
  }>;
  byDistrito: Record<string, {
    total: number;
    completado: number;
  }>;
  lastUpdated: string;
}

// Función helper para obtener estado
export function getPointStatus(point: GpsPoint): 'pendiente' | 'en_proceso' | 'completado' {
  return point.status || 'pendiente';
}

// Función helper para obtener coordenadas (preferir reales sobre referencia)
export function getPointCoordinates(point: GpsPoint): { lat: number; lng: number } | null {
  if (point.latReal && point.longReal) {
    return { lat: point.latReal, lng: point.longReal };
  }
  if (point.latRef && point.longRef) {
    return { lat: point.latRef, lng: point.longRef };
  }
  return null;
}
```

---

## PASO 2: ACTUALIZAR SERVICIO DE PUNTOS (src/services/pointsService.ts)
```typescript
import axios from 'axios';
import { API_POINTS } from '../config/api';
import type { GpsPoint, SheetMetadata, SheetStats } from '../types/point';

const api = axios.create({
  baseURL: API_POINTS,
  timeout: 30000,
});

// Obtener metadata de todas las hojas
export async function getSheetMetadata(): Promise<SheetMetadata[]> {
  const response = await api.get('', {
    params: { action: 'getSheetMetadata' }
  });
  return response.data.data.sheets;
}

// Obtener todos los puntos (estructura extendida)
export async function getAllPointsExtended(sheetName: string): Promise<{
  points: GpsPoint[];
  structure: 'legacy' | 'extended';
  totalCount: number;
}> {
  const response = await api.get('', {
    params: { action: 'getAllPointsExtended', sheetName }
  });
  return response.data.data;
}

// Obtener estadísticas
export async function getSheetStats(sheetName: string): Promise<SheetStats> {
  const response = await api.get('', {
    params: { action: 'getStats', sheetName }
  });
  return response.data.data;
}

// Obtener lista de hojas (compatibilidad)
export async function getSheets(): Promise<{ name: string; id: number }[]> {
  const response = await api.get('', {
    params: { action: 'getSheets' }
  });
  return response.data.data;
}
```

---

## PASO 3: ACTUALIZAR STORE (src/stores/pointsStore.ts)
```typescript
import { create } from 'zustand';
import type { GpsPoint, SheetMetadata, SheetStats } from '../types/point';
import * as pointsService from '../services/pointsService';

interface PointsState {
  // Datos
  points: GpsPoint[];
  sheets: SheetMetadata[];
  stats: SheetStats | null;
  
  // UI State
  selectedSheet: string | null;
  isLoading: boolean;
  error: string | null;
  
  // Filtros
  filters: {
    status: string | null;
    tecnico: string | null;
    distrito: string | null;
    codigoRuta: string | null;
    search: string;
  };
  
  // Actions
  loadSheets: () => Promise<void>;
  selectSheet: (sheetName: string) => Promise<void>;
  loadPoints: () => Promise<void>;
  loadStats: () => Promise<void>;
  setFilter: (key: keyof PointsState['filters'], value: string | null) => void;
  clearFilters: () => void;
  
  // Computed
  filteredPoints: () => GpsPoint[];
  tecnicos: () => string[];
  distritos: () => string[];
  rutas: () => string[];
}

export const usePointsStore = create<PointsState>((set, get) => ({
  points: [],
  sheets: [],
  stats: null,
  selectedSheet: null,
  isLoading: false,
  error: null,
  
  filters: {
    status: null,
    tecnico: null,
    distrito: null,
    codigoRuta: null,
    search: '',
  },
  
  loadSheets: async () => {
    set({ isLoading: true, error: null });
    try {
      const sheets = await pointsService.getSheetMetadata();
      set({ sheets, isLoading: false });
    } catch (error) {
      set({ error: 'Error cargando hojas', isLoading: false });
    }
  },
  
  selectSheet: async (sheetName) => {
    set({ selectedSheet: sheetName, isLoading: true });
    await get().loadPoints();
    await get().loadStats();
    set({ isLoading: false });
  },
  
  loadPoints: async () => {
    const { selectedSheet } = get();
    if (!selectedSheet) return;
    
    try {
      const result = await pointsService.getAllPointsExtended(selectedSheet);
      set({ points: result.points });
    } catch (error) {
      set({ error: 'Error cargando puntos' });
    }
  },
  
  loadStats: async () => {
    const { selectedSheet } = get();
    if (!selectedSheet) return;
    
    try {
      const stats = await pointsService.getSheetStats(selectedSheet);
      set({ stats });
    } catch (error) {
      set({ error: 'Error cargando estadísticas' });
    }
  },
  
  setFilter: (key, value) => {
    set(state => ({
      filters: { ...state.filters, [key]: value }
    }));
  },
  
  clearFilters: () => {
    set({
      filters: {
        status: null,
        tecnico: null,
        distrito: null,
        codigoRuta: null,
        search: '',
      }
    });
  },
  
  filteredPoints: () => {
    const { points, filters } = get();
    
    return points.filter(point => {
      // Filtro por estado
      if (filters.status && point.status !== filters.status) return false;
      
      // Filtro por técnico
      if (filters.tecnico && point.tecnico !== filters.tecnico) return false;
      
      // Filtro por distrito
      if (filters.distrito && point.distrito !== filters.distrito) return false;
      
      // Filtro por ruta
      if (filters.codigoRuta && point.codigoRuta !== filters.codigoRuta) return false;
      
      // Búsqueda general
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const searchableFields = [
          point.suministro,
          point.clienteNombre,
          point.direccion,
          point.serie,
          point.dniCliente,
        ].filter(Boolean).map(f => f!.toLowerCase());
        
        if (!searchableFields.some(f => f.includes(searchLower))) return false;
      }
      
      return true;
    });
  },
  
  // Valores únicos para filtros
  tecnicos: () => {
    const { points } = get();
    return [...new Set(points.map(p => p.tecnico).filter(Boolean))] as string[];
  },
  
  distritos: () => {
    const { points } = get();
    return [...new Set(points.map(p => p.distrito).filter(Boolean))] as string[];
  },
  
  rutas: () => {
    const { points } = get();
    return [...new Set(points.map(p => p.codigoRuta).filter(Boolean))] as string[];
  },
}));
```

---

## PASO 4: CREAR COMPONENTE DE FILTROS (src/components/filters/PointsFilter.tsx)
```typescript
import { usePointsStore } from '../../stores/pointsStore';
import { Filter, X, Search } from 'lucide-react';

export function PointsFilter() {
  const { 
    filters, 
    setFilter, 
    clearFilters,
    tecnicos,
    distritos,
    rutas,
  } = usePointsStore();
  
  const tecnicosList = tecnicos();
  const distritosList = distritos();
  const rutasList = rutas();
  
  const hasActiveFilters = Object.values(filters).some(v => v);
  
  return (
    <div className="bg-white p-4 rounded-lg shadow mb-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-gray-500" />
          <span className="font-medium">Filtros</span>
        </div>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-sm text-red-600 hover:text-red-800 flex items-center gap-1"
          >
            <X className="w-4 h-4" />
            Limpiar filtros
          </button>
        )}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Búsqueda */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar suministro, cliente, DNI..."
            value={filters.search}
            onChange={e => setFilter('search', e.target.value)}
            className="w-full pl-10 pr-3 py-2 border rounded-lg"
          />
        </div>
        
        {/* Estado */}
        <select
          value={filters.status || ''}
          onChange={e => setFilter('status', e.target.value || null)}
          className="w-full px-3 py-2 border rounded-lg"
        >
          <option value="">Todos los estados</option>
          <option value="pendiente">🔴 Pendiente</option>
          <option value="en_proceso">🟡 En proceso</option>
          <option value="completado">🟢 Completado</option>
        </select>
        
        {/* Técnico */}
        {tecnicosList.length > 0 && (
          <select
            value={filters.tecnico || ''}
            onChange={e => setFilter('tecnico', e.target.value || null)}
            className="w-full px-3 py-2 border rounded-lg"
          >
            <option value="">Todos los técnicos</option>
            {tecnicosList.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
        
        {/* Distrito */}
        {distritosList.length > 0 && (
          <select
            value={filters.distrito || ''}
            onChange={e => setFilter('distrito', e.target.value || null)}
            className="w-full px-3 py-2 border rounded-lg"
          >
            <option value="">Todos los distritos</option>
            {distritosList.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        )}
        
        {/* Ruta */}
        {rutasList.length > 0 && (
          <select
            value={filters.codigoRuta || ''}
            onChange={e => setFilter('codigoRuta', e.target.value || null)}
            className="w-full px-3 py-2 border rounded-lg"
          >
            <option value="">Todas las rutas</option>
            {rutasList.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
```

---

## PASO 5: ACTUALIZAR DASHBOARD PAGE (src/pages/DashboardPage.tsx)
```typescript
import { useEffect } from 'react';
import { usePointsStore } from '../stores/pointsStore';
import { 
  Users, 
  MapPin, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  TrendingUp,
  BarChart3
} from 'lucide-react';

export function DashboardPage() {
  const { stats, loadStats, selectedSheet, isLoading } = usePointsStore();
  
  useEffect(() => {
    if (selectedSheet) {
      loadStats();
    }
  }, [selectedSheet]);
  
  if (!selectedSheet) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Selecciona una jornada para ver estadísticas</p>
      </div>
    );
  }
  
  if (isLoading || !stats) {
    return <div className="animate-pulse">Cargando...</div>;
  }
  
  const { totals, byTecnico, byDistrito } = stats;
  
  return (
    <div className="space-y-6">
      {/* Tarjetas principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Puntos"
          value={totals.total}
          icon={MapPin}
          color="blue"
        />
        <StatCard
          title="Completados"
          value={totals.completado}
          icon={CheckCircle}
          color="green"
          subtitle={`${totals.porcentajeAvance}%`}
        />
        <StatCard
          title="En Proceso"
          value={totals.en_proceso}
          icon={Clock}
          color="yellow"
        />
        <StatCard
          title="Pendientes"
          value={totals.pendiente}
          icon={AlertCircle}
          color="red"
        />
      </div>
      
      {/* Barra de progreso */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-medium mb-4">Progreso General</h3>
        <div className="w-full bg-gray-200 rounded-full h-4">
          <div
            className="bg-green-500 h-4 rounded-full transition-all duration-500"
            style={{ width: `${totals.porcentajeAvance}%` }}
          />
        </div>
        <p className="text-sm text-gray-500 mt-2">
          {totals.completado} de {totals.total} puntos completados
        </p>
      </div>
      
      {/* Estadísticas por técnico */}
      {Object.keys(byTecnico).length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <Users className="w-5 h-5" />
            Avance por Técnico
          </h3>
          <div className="space-y-4">
            {Object.entries(byTecnico).map(([tecnico, data]) => (
              <div key={tecnico}>
                <div className="flex justify-between mb-1">
                  <span className="font-medium">{tecnico}</span>
                  <span className="text-sm text-gray-500">
                    {data.completado} / {data.total}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full"
                    style={{ width: `${(data.completado / data.total) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Estadísticas por distrito */}
      {Object.keys(byDistrito).length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Avance por Distrito
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(byDistrito).map(([distrito, data]) => (
              <div key={distrito} className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold text-blue-600">
                  {((data.completado / data.total) * 100).toFixed(0)}%
                </p>
                <p className="text-sm font-medium">{distrito}</p>
                <p className="text-xs text-gray-500">
                  {data.completado} / {data.total}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Componente de tarjeta estadística
function StatCard({ title, value, icon: Icon, color, subtitle }: {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: 'blue' | 'green' | 'yellow' | 'red';
  subtitle?: string;
}) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red: 'bg-red-50 text-red-600',
  };
  
  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-3xl font-bold">{value}</p>
          {subtitle && (
            <p className={`text-sm font-medium ${colors[color]}`}>{subtitle}</p>
          )}
        </div>
        <div className={`p-3 rounded-full ${colors[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}
```

---

## PASO 6: ACTUALIZAR TABLA DE SUMINISTROS (src/pages/SuministrosPage.tsx)

Agregar columnas adicionales y exportación mejorada:
```typescript
// Columnas a mostrar en tabla
const VISIBLE_COLUMNS = [
  { key: 'suministro', label: 'Suministro', width: '120px' },
  { key: 'status', label: 'Estado', width: '100px' },
  { key: 'tecnico', label: 'Técnico', width: '150px' },
  { key: 'clienteNombre', label: 'Cliente', width: '200px' },
  { key: 'direccion', label: 'Dirección', width: '200px' },
  { key: 'distrito', label: 'Distrito', width: '100px' },
  { key: 'marca', label: 'Marca', width: '100px' },
  { key: 'modelo', label: 'Modelo', width: '100px' },
  { key: 'serie', label: 'Serie', width: '120px' },
  { key: 'fotoCount', label: 'Fotos', width: '80px' },
  { key: 'fecha', label: 'Última Sync', width: '150px' },
];

// Función de exportación CSV mejorada
function exportToCSV(points: GpsPoint[]) {
  const headers = [
    'Suministro', 'Estado', 'Técnico', 'Cliente', 'DNI',
    'Dirección', 'Distrito', 'Marca', 'Modelo', 'Serie',
    'Fase', 'Año', 'Consumo Promedio', 'LAT_REF', 'LONG_REF',
    'LAT_REAL', 'LONG_REAL', 'Fotos', 'Última Sync'
  ];
  
  const rows = points.map(p => [
    p.suministro,
    p.status,
    p.tecnico || '',
    p.clienteNombre || '',
    p.dniCliente || '',
    p.direccion || '',
    p.distrito || '',
    p.marca || '',
    p.modelo || '',
    p.serie || '',
    p.fase || '',
    p.anioFabricacion || '',
    p.consumoPromedio || '',
    p.latRef || '',
    p.longRef || '',
    p.latReal || '',
    p.longReal || '',
    p.fotoCount,
    p.syncedAt || '',
  ]);
  
  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(','))
    .join('\n');
  
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `suministros_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
}
```

---

## ARCHIVOS A CREAR/MODIFICAR

1. `src/types/point.ts` - Tipos actualizados
2. `src/services/pointsService.ts` - Nuevas funciones API
3. `src/stores/pointsStore.ts` - Store con filtros
4. `src/components/filters/PointsFilter.tsx` - Nuevo componente
5. `src/pages/DashboardPage.tsx` - Dashboard mejorado
6. `src/pages/SuministrosPage.tsx` - Tabla mejorada
7. `src/pages/MapPage.tsx` - Popups con más información

---

## ORDEN DE IMPLEMENTACIÓN

1. Primero actualizar tipos (point.ts)
2. Luego servicio API (pointsService.ts)
3. Después store (pointsStore.ts)
4. Crear componente filtros (PointsFilter.tsx)
5. Actualizar páginas (Dashboard, Suministros, Map)
6. Probar integración completa
```

---

## 📊 RESUMEN EJECUTIVO

### Para la App Móvil (Code.gs):
- Se agregan **3 nuevas actions** sin modificar las existentes
- Detección automática de estructura legacy/extended
- Respuestas con **todas las columnas** para el dashboard
- Compatibilidad total con app móvil actual

### Para el Dashboard (React):
- Tipos actualizados con **33 campos**
- Store con **filtros avanzados** por técnico, distrito, ruta
- Dashboard con **estadísticas por técnico y distrito**
- Tabla exportable a CSV con todos los campos
- Preparado para **escalar** con nuevas funcionalidades

### Flujo de Datos Final:
```
Excel (33 columnas) → Google Sheets → API Extended → Dashboard (vista completa)
                                    ↓
                              API Legacy → App Móvil (9 columnas)