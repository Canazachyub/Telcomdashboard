// Técnicos registrados en la app de campo: marcadores en el lugar donde se
// registraron (con su foto de credencial) y lista con acceso a «Crear usuario».
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { X, UserPlus, Mail, Phone, MapPin, Camera, Clock } from 'lucide-react';
import { escapeHtml, safeHexColor } from '../../utils/html';
import { fotoSegura, type TecnicoRegistrado } from '../../services/credencialesService';
import { formatRelativeTime } from '../../services/gpsService';
import { ui } from '../ui';

const fecha = (v: string) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v || '—' : d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
};

function icono(t: TecnicoRegistrado): L.DivIcon {
  const color = safeHexColor(t.color, '#6b7280');
  const foto = fotoSegura(t.foto);
  const inicial = escapeHtml((t.nombre || '?').charAt(0).toUpperCase());
  // Cuadrado redondeado (los de Rastreo por fotos son círculos): se distinguen a simple vista
  const html = `
    <div style="width:44px;height:44px;border-radius:12px;border:3px solid ${color};background:${color};
      overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;
      color:#fff;font:700 16px system-ui,sans-serif">
      ${foto ? `<img src="${foto}" style="width:100%;height:100%;object-fit:cover" alt="">` : inicial}
    </div>`;
  return L.divIcon({ html, className: 'registro-app-marker', iconSize: [44, 44], iconAnchor: [22, 22], popupAnchor: [0, -22] });
}

function Ficha({ t, onCrearUsuario }: { t: TecnicoRegistrado; onCrearUsuario: (t: TecnicoRegistrado) => void }) {
  const foto = fotoSegura(t.foto);
  return (
    <div className="flex gap-3">
      {foto ? (
        <img src={foto} alt={`Credencial de ${t.nombre}`} className="h-20 w-20 shrink-0 rounded-xl object-cover" />
      ) : (
        <div
          className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl text-2xl font-bold text-white"
          style={{ background: safeHexColor(t.color, '#6b7280') }}
        >
          {(t.nombre || '?').charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-1 text-xs text-gray-600">
        <p className="text-sm font-semibold text-gray-900">{t.nombre || 'Sin nombre'}</p>
        <p className="font-mono text-[11px] text-gray-500">ODT {t.id}</p>
        {t.correo ? (
          <p className="flex items-center gap-1.5 break-all">
            <Mail size={12} /> {t.correo}
          </p>
        ) : (
          <p className="text-amber-700">Aún no envió correo ni foto (app anterior)</p>
        )}
        {t.telefono && (
          <p className="flex items-center gap-1.5">
            <Phone size={12} /> {t.telefono}
          </p>
        )}
        {(t.ubicacion || t.lat != null) && (
          <p className="flex items-center gap-1.5">
            <MapPin size={12} /> Se registró en {t.ubicacion || `${t.lat?.toFixed(5)}, ${t.lng?.toFixed(5)}`}
            {t.precision != null && <span className="text-gray-400"> (±{Math.round(t.precision)} m)</span>}
          </p>
        )}
        <p className="flex items-center gap-1.5">
          <Camera size={12} /> {t.fotosCount} fotos · registro {fecha(t.fechaRegistro)}
        </p>
        {t.ultimaActividad && (
          <p className="flex items-center gap-1.5">
            <Clock size={12} /> Última actividad {formatRelativeTime(t.ultimaActividad)}
          </p>
        )}
        <button
          onClick={() => onCrearUsuario(t)}
          disabled={!t.correo}
          title={t.correo ? 'Abrir «Nuevo usuario» con estos datos' : 'Necesita el correo para crear el usuario'}
          className={`${ui.btnPrimary} mt-1.5 px-3 py-1.5 text-xs`}
        >
          <UserPlus size={13} /> Crear usuario
        </button>
      </div>
    </div>
  );
}

/** Marcadores en el lugar de registro (solo los que enviaron ubicación). */
export function CapaRegistrados({
  tecnicos,
  onCrearUsuario,
}: {
  tecnicos: TecnicoRegistrado[];
  onCrearUsuario: (t: TecnicoRegistrado) => void;
}) {
  return (
    <>
      {tecnicos
        .filter((t) => t.lat != null && t.lng != null)
        .map((t) => (
          <Marker key={`reg-${t.id}`} position={[t.lat as number, t.lng as number]} icon={icono(t)}>
            <Popup minWidth={280}>
              <Ficha t={t} onCrearUsuario={onCrearUsuario} />
            </Popup>
          </Marker>
        ))}
    </>
  );
}

/** Lista de todos los registrados (con o sin ubicación). */
export function ListaRegistrados({
  tecnicos,
  onCerrar,
  onCrearUsuario,
  onVerEnMapa,
}: {
  tecnicos: TecnicoRegistrado[];
  onCerrar: () => void;
  onCrearUsuario: (t: TecnicoRegistrado) => void;
  onVerEnMapa: (t: TecnicoRegistrado) => void;
}) {
  const orden = [...tecnicos].sort((a, b) => String(b.fechaRegistro).localeCompare(String(a.fechaRegistro)));
  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onCerrar}>
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 p-5">
          <div>
            <p className="brand-kicker">App de campo</p>
            <h3 className="mt-1 text-lg font-semibold text-gray-900">{tecnicos.length} técnicos registrados</h3>
            <p className="mt-1 text-sm text-gray-500">
              Datos que cada técnico dejó al instalar la app. Usa «Crear usuario» para darle acceso al dashboard con su correo.
            </p>
          </div>
          <button onClick={onCerrar} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {orden.length === 0 && (
            <p className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">Todavía no hay técnicos registrados.</p>
          )}
          {orden.map((t) => (
            <div key={t.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <Ficha t={t} onCrearUsuario={onCrearUsuario} />
              {t.lat != null && (
                <button onClick={() => onVerEnMapa(t)} className={`${ui.btnSecondary} mt-2 px-3 py-1.5 text-xs`}>
                  <MapPin size={13} /> Ver dónde se registró
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
