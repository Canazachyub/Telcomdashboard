import { useEffect, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import type { PhotoLink } from '../types/point';
import { loadImageWithCache } from '../utils/imageCache';

/**
 * Miniatura que se carga solo al aparecer en pantalla. Las fotos de Drive no son
 * públicas, así que se piden por el servidor (misma vía y caché que la galería).
 */
function Thumb({ url, size }: { url: string; size: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [estado, setEstado] = useState<'espera' | 'cargando' | 'ok' | 'error'>('espera');

  useEffect(() => {
    const el = ref.current;
    if (!el || estado !== 'espera') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        setEstado('cargando');
        loadImageWithCache(url).then((d) => {
          setSrc(d);
          setEstado(d ? 'ok' : 'error');
        });
      },
      { rootMargin: '120px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [url, estado]);

  return (
    <div ref={ref} className="flex h-full w-full items-center justify-center" style={{ width: size, height: size }}>
      {estado === 'ok' && src ? (
        <img src={src} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-110" />
      ) : estado === 'error' ? (
        <ImageOff size={16} className="text-gray-400" />
      ) : (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-electric" />
      )}
    </div>
  );
}

/** Fila de miniaturas de fotos; al hacer clic abre la galería en esa foto. */
export default function PhotoStrip({
  photos,
  max = 4,
  size = 56,
  onOpen,
}: {
  photos: PhotoLink[];
  max?: number;
  size?: number;
  onOpen: (index: number) => void;
}) {
  const visibles = photos.slice(0, max);
  const resto = photos.length - visibles.length;
  if (photos.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {visibles.map((p, i) => (
        <button
          key={`${p.url}-${i}`}
          onClick={() => onOpen(i)}
          className="group relative overflow-hidden rounded-lg border border-gray-200 bg-navy-800 hover:border-electric"
          style={{ width: size, height: size }}
          title={[p.fecha, p.odtNombre].filter(Boolean).join(' · ') || 'Ver foto'}
        >
          <Thumb url={p.url} size={size} />
        </button>
      ))}
      {resto > 0 && (
        <button
          onClick={() => onOpen(max)}
          className="flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-xs font-semibold text-gray-700 hover:border-electric"
          style={{ width: size, height: size }}
        >
          +{resto}
        </button>
      )}
    </div>
  );
}
