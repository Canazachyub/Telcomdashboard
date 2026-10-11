// ==========================================
// Marcador GPS - Rastreo por Fotos
// ==========================================

import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import type { GPSEntity } from '../../types/gps';
import { formatRelativeTime } from '../../services/gpsService';
import { User, Phone, Clock, MapPin, ExternalLink, Camera } from 'lucide-react';
import { escapeHtml, safeHexColor } from '../../utils/html';

interface GPSMarkerProps {
  entity: GPSEntity;
  onClick?: (entity: GPSEntity) => void;
}

// Crear icono personalizado para el marcador
function createIcon(entity: GPSEntity): L.DivIcon {
  const isOnline = entity.estado === 'online';

  // Colores según estado.
  // SEGURIDAD: color y nombre vienen del registro ODT de la app movil y se
  // interpolan en HTML: validar el color y escapar el texto.
  const bgColor = safeHexColor(entity.color, '#6b7280');
  const borderColor = isOnline ? '#22c55e' : '#9ca3af';

  // Inicial del nombre (escapada)
  const initial = escapeHtml((entity.nombre || '?').charAt(0).toUpperCase());

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
      box-shadow: 0 2px 10px rgba(0,0,0,0.55);
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
        <div className="p-1">
          {/* Header */}
          <p className="brand-kicker">Técnico en campo</p>
          <div className="mb-3 mt-1.5 flex items-center gap-3 border-b border-gray-200 pb-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: safeHexColor(entity.color, '#6b7280') }}
            >
              <User size={20} className="text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-semibold text-gray-900">{entity.nombre}</h3>
              <span
                className={`mt-0.5 inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                  isOnline
                    ? 'border-green-200 bg-green-50 text-green-800'
                    : 'border-gray-200 bg-gray-100 text-gray-600'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isOnline ? 'bg-green-500' : 'bg-gray-400'
                  }`}
                />
                {isOnline ? 'Activo (últimas 2 h)' : 'Inactivo'}
              </span>
            </div>
          </div>

          {/* Info */}
          <div className="space-y-2 text-sm">
            {entity.extra?.telefono && (
              <div className="flex items-center gap-2 text-gray-600">
                <Phone size={14} className="text-electric" />
                <span className="font-mono">{entity.extra.telefono}</span>
              </div>
            )}

            <div className="flex items-center gap-2 text-gray-600">
              <MapPin size={14} className="text-electric" />
              <span className="font-mono text-xs">{entity.latitud.toFixed(6)}, {entity.longitud.toFixed(6)}</span>
            </div>

            <div className="flex items-center gap-2 text-gray-600">
              <Clock size={14} className="text-electric" />
              <span>Última foto: {formatRelativeTime(entity.ultimaActualizacion)}</span>
            </div>
          </div>

          {/* View Photo Button */}
          {entity.extra?.foto_url && (
            <a
              href={entity.extra.foto_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold !text-white transition hover:brightness-110"
            >
              <Camera size={16} />
              Ver última foto
              <ExternalLink size={14} />
            </a>
          )}
        </div>
      </Popup>
    </Marker>
  );
}
