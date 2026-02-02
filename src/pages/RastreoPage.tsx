// ==========================================
// Página de Rastreo GPS en Tiempo Real
// ==========================================

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import { MAP_CONFIG, GPS_UPDATE_CONFIG } from '../config/api';
import { useGPSStore, useEntities, useStats, useFilters, useSelectedEntity, useLastUpdated, useIsLoading } from '../stores/gpsStore';
import GPSMarker from '../components/gps/GPSMarker';
import GPSPanel from '../components/gps/GPSPanel';
import type { GPSEntity, GPSFilters } from '../types/gps';

// Componente para centrar el mapa en una entidad
function MapController({ selectedEntity }: { selectedEntity: GPSEntity | null }) {
  const map = useMap();

  useEffect(() => {
    if (selectedEntity && selectedEntity.latitud && selectedEntity.longitud) {
      map.flyTo([selectedEntity.latitud, selectedEntity.longitud], 16, {
        duration: 1,
      });
    }
  }, [selectedEntity, map]);

  return null;
}

// Componente para ajustar el mapa a todas las entidades
function FitBounds({ entities }: { entities: GPSEntity[] }) {
  const map = useMap();

  useEffect(() => {
    const validEntities = entities.filter(
      (e) => e.latitud && e.longitud && e.latitud !== 0 && e.longitud !== 0
    );

    if (validEntities.length > 0) {
      const bounds = validEntities.map((e) => [e.latitud, e.longitud] as [number, number]);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [entities.length]); // Solo cuando cambia la cantidad

  return null;
}

export default function RastreoPage() {
  const loadTracking = useGPSStore((state) => state.loadTracking);
  const setFilter = useGPSStore((state) => state.setFilter);
  const selectEntity = useGPSStore((state) => state.selectEntity);

  const entities = useEntities();
  const stats = useStats();
  const filters = useFilters();
  const selectedEntity = useSelectedEntity();
  const lastUpdated = useLastUpdated();
  const isLoading = useIsLoading();

  // Referencia para el intervalo de actualización
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cargar datos iniciales y configurar auto-refresh
  useEffect(() => {
    // Carga inicial
    loadTracking();

    // Auto-refresh cada X segundos
    intervalRef.current = setInterval(() => {
      loadTracking();
    }, GPS_UPDATE_CONFIG.mapRefreshInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [loadTracking]);

  // Handler para cambios de filtro
  const handleFilterChange = (key: keyof GPSFilters, value: boolean | string) => {
    setFilter(key, value);
  };

  // Handler para click en entidad (desde panel o marcador)
  const handleEntityClick = (entity: GPSEntity) => {
    selectEntity(entity);
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Mapa */}
      <div className="flex-1 relative">
        <MapContainer
          center={MAP_CONFIG.defaultCenter}
          zoom={MAP_CONFIG.defaultZoom}
          className="w-full h-full"
          zoomControl={true}
        >
          <TileLayer
            attribution={MAP_CONFIG.tileAttribution}
            url={MAP_CONFIG.tileUrl}
          />

          {/* Controladores */}
          <MapController selectedEntity={selectedEntity} />
          <FitBounds entities={entities} />

          {/* Marcadores */}
          {entities.map((entity) => (
            <GPSMarker
              key={entity.id}
              entity={entity}
              onClick={handleEntityClick}
            />
          ))}
        </MapContainer>

        {/* Badge de estado */}
        <div className="absolute top-4 left-4 z-[1000] bg-white rounded-lg shadow-lg px-4 py-2">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-green-500"></span>
              <span className="text-gray-700">
                {stats.personalOnline + stats.vehiculosOnline} Online
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500"></span>
              <span className="text-gray-700">
                {stats.personalOffline + stats.vehiculosOffline} Offline
              </span>
            </div>
          </div>
        </div>

        {/* Indicador de carga */}
        {isLoading && (
          <div className="absolute top-4 right-96 z-[1000] bg-blue-600 text-white rounded-lg shadow-lg px-4 py-2 flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm">Actualizando...</span>
          </div>
        )}
      </div>

      {/* Panel lateral */}
      <GPSPanel
        entities={entities}
        stats={stats}
        filters={filters}
        lastUpdated={lastUpdated}
        isLoading={isLoading}
        onFilterChange={handleFilterChange}
        onRefresh={loadTracking}
        onEntityClick={handleEntityClick}
        selectedEntity={selectedEntity}
      />
    </div>
  );
}
