// ==========================================
// Marcador GPS - Rastreo por Fotos
// ==========================================

import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import type { GPSEntity } from '../../types/gps';
import { formatRelativeTime } from '../../services/gpsService';
import { User, Phone, Clock, MapPin, ExternalLink, Camera } from 'lucide-react';

interface GPSMarkerProps {
  entity: GPSEntity;
  onClick?: (entity: GPSEntity) => void;
}

// Crear icono personalizado para el marcador
function createIcon(entity: GPSEntity): L.DivIcon {
  const isOnline = entity.estado === 'online';

  // Colores según estado
  const bgColor = entity.color;
  const borderColor = isOnline ? '#22c55e' : '#9ca3af';

  // Inicial del nombre
  const initial = entity.nombre.charAt(0).toUpperCase();

  const html = `
    <div style="
      background-color: ${bgColor};
      border: 3px solid ${borderColor};
      border-radius: 50%;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      color: white;
      font-weight: bold;
      font-size: 16px;
      font-family: system-ui, sans-serif;
    ">
      ${initial}
    </div>
  `;

  return L.divIcon({
    html,
    className: 'custom-gps-marker',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });
}

export default function GPSMarker({ entity, onClick }: GPSMarkerProps) {
  // No mostrar si no tiene coordenadas válidas
  if (!entity.latitud || !entity.longitud || (entity.latitud === 0 && entity.longitud === 0)) {
    return null;
  }

  const icon = createIcon(entity);
  const isOnline = entity.estado === 'online';

  return (
    <Marker
      position={[entity.latitud, entity.longitud]}
      icon={icon}
      eventHandlers={{
        click: () => onClick?.(entity),
      }}
    >
      <Popup className="gps-popup" minWidth={260}>
        <div className="p-2">
          {/* Header */}
          <div className="flex items-center gap-3 mb-3 pb-2 border-b border-gray-200">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ backgroundColor: entity.color }}
            >
              <User size={20} className="text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">{entity.nombre}</h3>
              <span
                className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                  isOnline
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isOnline ? 'bg-green-500' : 'bg-gray-400'
                  }`}
                />
                {isOnline ? 'Activo' : 'Inactivo'}
              </span>
            </div>
          </div>

          {/* Info */}
          <div className="space-y-2 text-sm">
            {entity.extra?.telefono && (
              <div className="flex items-center gap-2 text-gray-600">
                <Phone size={14} />
                <span>{entity.extra.telefono}</span>
              </div>
            )}

            <div className="flex items-center gap-2 text-gray-600">
              <MapPin size={14} />
              <span>{entity.latitud.toFixed(6)}, {entity.longitud.toFixed(6)}</span>
            </div>

            <div className="flex items-center gap-2 text-gray-600">
              <Clock size={14} />
              <span>Última foto: {formatRelativeTime(entity.ultimaActualizacion)}</span>
            </div>
          </div>

          {/* View Photo Button */}
          {entity.extra?.foto_url && (
            <a
              href={entity.extra.foto_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 w-full py-2 px-4 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <Camera size={16} />
              Ver Última Foto
              <ExternalLink size={14} />
            </a>
          )}
        </div>
      </Popup>
    </Marker>
  );
}
