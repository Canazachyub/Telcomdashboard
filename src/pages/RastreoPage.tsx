// ==========================================
// Página de Rastreo GPS en Tiempo Real
// ==========================================

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IdCard, List } from 'lucide-react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import { MAP_CONFIG, GPS_UPDATE_CONFIG } from '../config/api';
import { useGPSStore, useEntities, useStats, useFilters, useSelectedEntity, useLastUpdated, useIsLoading } from '../stores/gpsStore';
import GPSMarker from '../components/gps/GPSMarker';
import GPSPanel from '../components/gps/GPSPanel';
import type { GPSEntity, GPSFilters } from '../types/gps';
import { CapaRegistrados, ListaRegistrados } from '../components/gps/Registrados';
import { getCredenciales, prefillDesde, type TecnicoRegistrado } from '../services/credencialesService';

/** Lleva el mapa al lugar donde se registró un técnico. */
function VolarA({ destino }: { destino: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (destino) map.flyTo(destino, 16, { duration: 1 });
  }, [destino, map]);
  return null;
}

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

  // Técnicos registrados en la app (credencial: correo, foto, lugar de registro)
  const navigate = useNavigate();
  const [registrados, setRegistrados] = useState<TecnicoRegistrado[]>([]);
  const [verRegistrados, setVerRegistrados] = useState(true);
  const [listaAbierta, setListaAbierta] = useState(false);
  const [avisoRegistrados, setAvisoRegistrados] = useState<string | null>(null);
  const [volarA, setVolarA] = useState<[number, number] | null>(null);

  useEffect(() => {
    let vivo = true;
    getCredenciales()
      .then((r) => {
        if (!vivo) return;
        setRegistrados(r.tecnicos);
        setAvisoRegistrados(
          r.success ? null : r.sinInstalar ? 'Falta instalar «getCredenciales» en el Apps Script' : r.message || 'No se pudo cargar'
        );
      })
      .catch((e) => vivo && setAvisoRegistrados(`Sin conexión: ${(e as Error).message}`));
    return () => {
      vivo = false;
    };
  }, []);

  const crearUsuario = (t: TecnicoRegistrado) => navigate('/usuarios', { state: { prefill: prefillDesde(t) } });
  const conUbicacion = registrados.filter((t) => t.lat != null && t.lng != null).length;

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

  const totalOnline = stats.personalOnline + stats.vehiculosOnline;
  const totalOffline = stats.personalOffline + stats.vehiculosOffline;

  return (
    <div className="flex h-[calc(100vh-112px)] min-h-[520px] overflow-hidden rounded-2xl border border-gray-200 bg-navy-950">
      {/* Mapa */}
      <div className="relative min-w-0 flex-1">
        <MapContainer
          center={MAP_CONFIG.defaultCenter}
          zoom={MAP_CONFIG.defaultZoom}
          className="h-full w-full"
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

          {/* Lugar donde cada técnico se registró en la app */}
          {verRegistrados && <CapaRegistrados tecnicos={registrados} onCrearUsuario={crearUsuario} />}
          <VolarA destino={volarA} />
        </MapContainer>

        {/* Técnicos registrados en la app (debajo del badge de estado) */}
        <div className="absolute left-16 top-16 z-[1000] flex flex-wrap items-center gap-2">
          <button
            onClick={() => setVerRegistrados((v) => !v)}
            title="Mostrar en el mapa dónde se registró cada técnico (marcador cuadrado con su foto)"
            className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm shadow-lg shadow-black/40 backdrop-blur-md ${
              verRegistrados ? 'border-cyan-400/60 bg-navy-900/85 text-electric' : 'border-line-strong bg-navy-900/85 text-gray-700'
            }`}
          >
            <IdCard size={15} />
            Registros de la app
            <span className="font-mono font-semibold">{conUbicacion}</span>
          </button>
          <button
            onClick={() => setListaAbierta(true)}
            className="flex items-center gap-2 rounded-xl border border-line-strong bg-navy-900/85 px-3 py-1.5 text-sm text-gray-700 shadow-lg shadow-black/40 backdrop-blur-md"
          >
            <List size={15} /> Lista ({registrados.length})
          </button>
          {avisoRegistrados && (
            <span className="rounded-xl border border-amber-300/50 bg-navy-900/85 px-3 py-1.5 text-xs text-amber-700">
              {avisoRegistrados}
            </span>
          )}
        </div>

        {/* Badge de estado (a la derecha del control de zoom) */}
        <div className="absolute left-16 top-4 z-[1000] rounded-xl border border-line-strong bg-navy-900/85 px-4 py-2 shadow-lg shadow-black/40 backdrop-blur-md">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2" title="Con foto sincronizada en las últimas 2 h">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgb(34_197_94/0.8)]"></span>
              <span className="text-gray-700">
                <span className="font-mono font-semibold text-gray-900">{totalOnline.toLocaleString('es-PE')}</span> activos
              </span>
            </div>
            <span className="h-4 w-px bg-gray-300" />
            <div className="flex items-center gap-2" title="Sin fotos sincronizadas en las últimas 2 h">
              <span className="h-2.5 w-2.5 rounded-full bg-gray-400"></span>
              <span className="text-gray-700">
                <span className="font-mono font-semibold text-gray-900">{totalOffline.toLocaleString('es-PE')}</span> inactivos
              </span>
            </div>
          </div>
        </div>

        {/* Indicador de carga (esquina superior derecha del mapa, junto al panel) */}
        {isLoading && (
          <div className="absolute right-4 top-4 z-[1000] flex items-center gap-2 rounded-xl border border-cyan-400/40 bg-navy-900/85 px-4 py-2 text-electric shadow-lg shadow-black/40 backdrop-blur-md">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-electric border-t-transparent"></div>
            <span className="text-sm">Actualizando…</span>
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

      {listaAbierta && (
        <ListaRegistrados
          tecnicos={registrados}
          onCerrar={() => setListaAbierta(false)}
          onCrearUsuario={crearUsuario}
          onVerEnMapa={(t) => {
            setListaAbierta(false);
            setVerRegistrados(true);
            setVolarA([t.lat as number, t.lng as number]);
          }}
        />
      )}
    </div>
  );
}
