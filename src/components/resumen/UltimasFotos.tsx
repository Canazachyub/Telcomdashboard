// Muro con lo último que se hizo: la foto más reciente de cada suministro.
import { useState } from 'react';
import { Images } from 'lucide-react';
import { Thumb } from '../PhotoStrip';
import PhotoGalleryModal from '../PhotoGalleryModal';
import { useSuministroDrawer } from '../../stores/suministroDrawerStore';
import { getPointStatus, type PhotoLink } from '../../types/point';
import { STATUS_UI } from '../ui';
import type { FotoReciente } from '../../utils/resumenJornadas';

const corto = (n: string) => n.replace(/^P\d+-[A-Z]+-[A-Z-]+?-\s*(?=SEM)/, '').trim() || n;

/** "hace 5 min", "hace 2 h", "ayer 16:37", "10 oct 17:22". */
function hace(d: Date) {
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  const hora = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const hoy = new Date();
  if (d.toDateString() === hoy.toDateString()) return `hoy ${hora}`;
  const ayer = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1);
  if (d.toDateString() === ayer.toDateString()) return `ayer ${hora}`;
  return `${d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })} ${hora}`;
}

export default function UltimasFotos({
  fotos,
  colores = {},
  mostrarJornada = false,
  paso = 8,
}: {
  fotos: FotoReciente[];
  colores?: Record<string, string>;
  mostrarJornada?: boolean;
  paso?: number;
}) {
  const [visibles, setVisibles] = useState(paso);
  const [galeria, setGaleria] = useState<{ suministro: string; photos: PhotoLink[]; i: number } | null>(null);
  const openFicha = useSuministroDrawer((s) => s.open);

  if (fotos.length === 0) {
    return <p className="py-6 text-center text-sm text-gray-500">Todavía no hay fotos en esta jornada.</p>;
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-8">
        {fotos.slice(0, visibles).map((f) => {
          const quien = (f.foto.odtNombre || f.point.odtNombre || f.point.tecnico || 'Sin perfil ODT').trim();
          const color = colores[quien] || f.foto.odtColor || f.point.odtColor || '#64748b';
          const st = STATUS_UI[getPointStatus(f.point)];
          const fotosPunto = f.point.photoLinks || [];
          return (
            <div
              key={`${f.jornada}-${f.point.suministro}`}
              className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50"
            >
              <button
                onClick={() =>
                  setGaleria({
                    suministro: f.point.suministro,
                    photos: fotosPunto,
                    i: Math.max(0, fotosPunto.indexOf(f.foto)),
                  })
                }
                className="group relative block aspect-square w-full overflow-hidden bg-navy-800"
                title="Ver las fotos"
              >
                <Thumb url={f.foto.url} />
                <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
                  {hace(f.fecha)}
                </span>
                {f.total > 1 && (
                  <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] text-white">
                    <Images size={11} /> {f.total}
                  </span>
                )}
                <span className="absolute bottom-0 left-0 right-0 h-1" style={{ background: color }} />
              </button>
              <button
                onClick={() => openFicha(f.point, f.jornada)}
                className="block w-full px-2.5 py-2 text-left hover:bg-gray-100"
                title="Ver ficha del suministro"
              >
                <p className="font-mono text-xs font-semibold text-electric">{f.point.suministro}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-600">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                  <span className="min-w-0 flex-1 break-words">{quien}</span>
                  {st && (
                    <span
                      className={
                        st.tone === 'green'
                          ? 'text-green-700'
                          : st.tone === 'yellow'
                            ? 'text-yellow-700'
                            : 'text-red-700'
                      }
                    >
                      {st.label}
                    </span>
                  )}
                </p>
                {mostrarJornada && <p className="mt-0.5 break-words text-[11px] text-gray-500">{corto(f.jornada)}</p>}
              </button>
            </div>
          );
        })}
      </div>
      {visibles < fotos.length && (
        <div className="mt-3 text-center">
          <button
            onClick={() => setVisibles((v) => v + paso)}
            className="rounded-lg border border-gray-300 px-4 py-1.5 text-xs font-medium text-gray-700 transition hover:border-electric hover:text-electric"
          >
            Ver más ({fotos.length - visibles} más)
          </button>
        </div>
      )}
      {galeria && (
        <PhotoGalleryModal
          photos={galeria.photos}
          suministro={galeria.suministro}
          initialIndex={galeria.i}
          onClose={() => setGaleria(null)}
        />
      )}
    </>
  );
}
