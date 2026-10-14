import { parseFecha } from './map/dailyProgress';
import { safeHexColor } from '../utils/html';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, ChevronLeft, ChevronRight, ExternalLink, Camera,
  Maximize2, Grid, Image as ImageIcon
} from 'lucide-react';
import type { PhotoLink } from '../types/point';
import { loadImageWithCache, loadThumbWithCache, imageCache } from '../utils/imageCache';

interface PhotoGalleryModalProps {
  photos: PhotoLink[];
  suministro: string;
  initialIndex?: number;
  onClose: () => void;
}

// Componente de miniatura con lazy loading y cache
function PhotoThumbnail({
  photo,
  isSelected,
  onClick,
}: {
  photo: PhotoLink;
  isSelected: boolean;
  onClick: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [imageData, setImageData] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Lazy loading con IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' } // Precargar un poco antes de que sea visible
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Cargar imagen solo cuando es visible
  useEffect(() => {
    if (!isVisible || !photo.url) return;

    let cancelled = false;

    // Verificar cache primero (instantáneo)
    if (imageCache.has(photo.url)) {
      setImageData(imageCache.get(photo.url)!);
      setLoading(false);
      return;
    }

    async function loadImage() {
      // Miniatura liviana: pocos KB en vez de la foto original
      const data = await loadThumbWithCache(photo.url);
      if (cancelled) return;
      if (data) {
        setImageData(data);
      } else {
        setError(true);
      }
      setLoading(false);
    }

    loadImage();
    return () => { cancelled = true; };
  }, [isVisible, photo.url]);

  return (
    <div
      ref={containerRef}
      onClick={onClick}
      className={`relative aspect-square cursor-pointer overflow-hidden rounded-xl border bg-navy-950 transition-all ${
        isSelected
          ? 'border-electric shadow-[0_0_0_2px_rgb(0_212_255/0.45)]'
          : 'border-line hover:border-line-strong'
      }`}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-navy-800">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-line-strong border-t-electric"></div>
        </div>
      )}
      {!error && imageData ? (
        <img
          src={imageData}
          alt={`Foto #${photo.numero}`}
          className={`w-full h-full object-cover transition-opacity ${loading ? 'opacity-0' : 'opacity-100'}`}
        />
      ) : !loading ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-navy-800 text-gray-400" title="No se pudo cargar la miniatura">
          <Camera size={22} />
        </div>
      ) : null}
      <div className="absolute bottom-1 left-1 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-white">
        #{photo.numero}
      </div>
      {photo.lectura && (
        <div
          className="absolute right-1 top-1 max-w-[85%] truncate rounded-md bg-green-600/90 px-1.5 py-0.5 font-mono text-[11px] text-white"
          title={String(photo.lectura)}
        >
          {photo.lectura}
        </div>
      )}
    </div>
  );
}

export default function PhotoGalleryModal({
  photos,
  suministro,
  initialIndex = 0,
  onClose,
}: PhotoGalleryModalProps) {
  // Validar que initialIndex este en rango
  const safeInitialIndex = Math.max(0, Math.min(initialIndex, photos.length - 1));
  const [currentIndex, setCurrentIndex] = useState(safeInitialIndex >= 0 ? safeInitialIndex : 0);
  const [viewMode, setViewMode] = useState<'single' | 'grid'>('single');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const currentPhoto = photos[currentIndex] as PhotoLink | undefined;
  const fotoUrl = currentPhoto?.url || '';

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setLoading(true);
      setError(false);
    } else if (e.key === 'ArrowRight' && currentIndex < photos.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setLoading(true);
      setError(false);
    }
  }, [currentIndex, photos.length, onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setLoading(true);
      setError(false);
    }
  };

  const handleNext = () => {
    if (currentIndex < photos.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setLoading(true);
      setError(false);
    }
  };

  const handleSelectPhoto = (index: number) => {
    setCurrentIndex(index);
    setViewMode('single');
    setLoading(true);
    setError(false);
  };

  const openInDrive = () => {
    window.open(fotoUrl, '_blank');
  };

  // Estado para la imagen cargada desde el backend (evita CORS)
  const [mainImageData, setMainImageData] = useState<string | null>(null);
  // Vista previa (miniatura) mientras llega la foto completa
  const [previa, setPrevia] = useState<{ url: string; data: string | null } | null>(null);
  const preview = previa?.url === fotoUrl ? previa.data : null;

  useEffect(() => {
    let cancelled = false;
    if (!fotoUrl || imageCache.has(fotoUrl)) return;
    loadThumbWithCache(fotoUrl).then((d) => {
      if (!cancelled) setPrevia({ url: fotoUrl, data: d });
    });
    return () => {
      cancelled = true;
    };
  }, [fotoUrl]);

  // Cargar imagen cuando cambia la foto actual (con cache)
  useEffect(() => {
    let cancelled = false;
    setError(false);

    // Verificar cache primero (instantáneo)
    if (imageCache.has(fotoUrl)) {
      setMainImageData(imageCache.get(fotoUrl)!);
      setLoading(false);
      return;
    }

    setLoading(true);
    setMainImageData(null);

    async function loadMainImage() {
      const data = await loadImageWithCache(fotoUrl);
      if (cancelled) return;
      if (data) {
        setMainImageData(data);
      } else {
        setError(true);
      }
      setLoading(false);
    }

    if (fotoUrl) {
      loadMainImage();
    } else {
      setError(true);
      setLoading(false);
    }

    return () => { cancelled = true; };
  }, [fotoUrl]);

  // Precargar las demás fotos (las siguientes primero), así pasar de una a otra es inmediato
  useEffect(() => {
    const preloadIndexes = photos
      .map((_, i) => i)
      .filter((i) => i !== currentIndex)
      .sort((a, b) => Math.abs(a - currentIndex) - Math.abs(b - currentIndex))
      .slice(0, 6);

    preloadIndexes.forEach(index => {
      if (index >= 0 && index < photos.length) {
        const photo = photos[index];
        if (photo?.url && !imageCache.has(photo.url)) {
          // Precargar en segundo plano
          loadImageWithCache(photo.url);
        }
      }
    });
  }, [currentIndex, photos]);

  // Si no hay fotos, mostrar mensaje y cerrar
  if (!photos || photos.length === 0) {
    return (
      <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="mx-4 max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-2xl shadow-black/50">
          <Camera size={56} className="mx-auto mb-4 text-electric" />
          <h3 className="mb-2 text-xl font-semibold text-gray-900">Sin fotos disponibles</h3>
          <p className="mb-6 text-sm text-gray-500">No hay fotos registradas para {suministro}.</p>
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-2 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  // Guard adicional por si currentPhoto es undefined
  if (!currentPhoto || !fotoUrl) {
    return (
      <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="mx-4 max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-2xl shadow-black/50">
          <Camera size={56} className="mx-auto mb-4 text-electric" />
          <h3 className="mb-2 text-xl font-semibold text-gray-900">Error al cargar foto</h3>
          <p className="mb-6 text-sm text-gray-500">La foto seleccionada no tiene un enlace válido.</p>
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-2 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }


  return (
    <div className="fixed inset-0 z-[1000] flex flex-col bg-black/95">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-line bg-navy-950/90 px-4 py-3 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-4">
          <div className="min-w-0">
            <p className="brand-kicker">Galería de fotos</p>
            <h3 className="mt-0.5 truncate text-lg font-semibold text-gray-900" title={suministro}>
              {suministro}
            </h3>
          </div>
          <span className="shrink-0 rounded-md border border-line-strong bg-navy-900 px-2 py-0.5 font-mono text-sm text-gray-700">
            {currentIndex + 1} / {photos.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle view mode */}
          <button
            onClick={() => setViewMode(viewMode === 'single' ? 'grid' : 'single')}
            className={`rounded-lg border p-2 transition-colors ${
              viewMode === 'grid'
                ? 'border-electric bg-cyan-400/10 text-electric'
                : 'border-line-strong text-gray-500 hover:border-electric hover:text-electric'
            }`}
            title={viewMode === 'single' ? 'Ver todas en cuadrícula' : 'Ver foto individual'}
          >
            {viewMode === 'single' ? <Grid size={20} /> : <ImageIcon size={20} />}
          </button>

          {/* Open in Drive */}
          <button
            onClick={openInDrive}
            className="flex items-center gap-2 rounded-lg border border-line-strong px-3 py-2 text-sm text-gray-700 transition-colors hover:border-electric hover:text-electric"
            title="Abrir la foto actual en Google Drive"
          >
            <ExternalLink size={16} />
            <span className="hidden sm:inline">Abrir en Google Drive</span>
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
            title="Cerrar (Esc)"
          >
            <X size={22} />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {viewMode === 'single' ? (
          <>
            {/* Main image area */}
            <div className="flex-1 relative flex items-center justify-center p-4">
              {/* Navigation buttons */}
              {currentIndex > 0 && (
                <button
                  onClick={handlePrev}
                  className="absolute left-4 z-10 rounded-full border border-line-strong bg-navy-900/80 p-3 text-gray-800 backdrop-blur transition-colors hover:border-electric hover:text-electric"
                  title="Foto anterior (←)"
                >
                  <ChevronLeft size={28} />
                </button>
              )}

              {/* Image container */}
              <div className="relative w-full h-full flex items-center justify-center">
                {loading && preview && (
                  <img
                    src={preview}
                    alt=""
                    className="absolute max-h-[75vh] max-w-full scale-[1.01] rounded-xl object-contain opacity-70 blur-[2px]"
                  />
                )}
                {loading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-line-strong border-t-electric"></div>
                    {preview && <span className="rounded bg-black/60 px-2 py-0.5 text-xs text-white">Cargando en alta calidad…</span>}
                  </div>
                )}

                {!error && mainImageData ? (
                  <img
                    src={mainImageData}
                    alt={`Foto #${currentPhoto.numero}`}
                    className={`max-h-[75vh] max-w-full rounded-xl border border-line bg-navy-900 object-contain shadow-2xl shadow-black/60 transition-opacity ${loading ? 'opacity-0' : 'opacity-100'}`}
                  />
                ) : !loading ? (
                  <div className="flex flex-col items-center justify-center text-gray-500">
                    <Camera size={56} className="mb-4 text-gray-400" />
                    <p className="mb-2 text-lg text-gray-800">No se pudo cargar la imagen</p>
                    <button
                      onClick={openInDrive}
                      className="text-sm text-electric underline-offset-4 hover:underline"
                    >
                      Abrir en Google Drive
                    </button>
                  </div>
                ) : null}
              </div>

              {currentIndex < photos.length - 1 && (
                <button
                  onClick={handleNext}
                  className="absolute right-4 z-10 rounded-full border border-line-strong bg-navy-900/80 p-3 text-gray-800 backdrop-blur transition-colors hover:border-electric hover:text-electric"
                  title="Foto siguiente (→)"
                >
                  <ChevronRight size={28} />
                </button>
              )}
            </div>

            {/* Sidebar with thumbnails and info */}
            <div className="flex w-72 flex-col border-l border-line bg-navy-900">
              {/* Photo info */}
              <div className="border-b border-line p-4">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Detalle de la foto</p>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-gray-500">N.º de foto</dt>
                    <dd className="font-mono font-medium text-gray-900">{currentPhoto.numero}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-gray-500">Fecha</dt>
                    <dd className="text-right text-gray-900" title={currentPhoto.fecha || ''}>
                      {(() => {
                        const d = parseFecha(currentPhoto.fecha);
                        if (!d) return currentPhoto.fecha || '—';
                        return (
                          <>
                            <span className="block whitespace-nowrap">
                              {d.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                            <span className="block whitespace-nowrap font-mono text-electric">
                              {d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </>
                        );
                      })()}
                    </dd>
                  </div>
                  {currentPhoto.odtNombre && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-gray-500">Tomada por</dt>
                      <dd className="flex items-center gap-1.5 text-gray-900">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: safeHexColor(currentPhoto.odtColor, '#2a4268') }}
                        />
                        {currentPhoto.odtNombre}
                      </dd>
                    </div>
                  )}
                  {currentPhoto.lectura && (
                    <div className="flex justify-between gap-3">
                      <dt className="shrink-0 text-gray-500">Lectura</dt>
                      <dd className="truncate font-mono font-medium text-green-700" title={String(currentPhoto.lectura)}>{currentPhoto.lectura}</dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Thumbnails */}
              <div className="flex-1 overflow-y-auto p-4">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Todas las fotos <span className="font-mono text-gray-700">({photos.length})</span>
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {photos.map((photo, index) => (
                    <PhotoThumbnail
                      key={index}
                      photo={photo}
                      isSelected={index === currentIndex}
                      onClick={() => handleSelectPhoto(index)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Grid view */
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {photos.map((photo, index) => (
                <div
                  key={index}
                  onClick={() => handleSelectPhoto(index)}
                  className="group relative aspect-square cursor-pointer overflow-hidden rounded-xl bg-navy-800 transition-all hover:shadow-[0_0_0_2px_rgb(0_212_255/0.6)]"
                >
                  <PhotoThumbnail
                    photo={photo}
                    isSelected={false}
                    onClick={() => handleSelectPhoto(index)}
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
                    <Maximize2 className="text-white opacity-0 group-hover:opacity-100 transition-opacity" size={32} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-center gap-4 border-t border-line bg-navy-950/90 px-4 py-2.5 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <kbd className="rounded border border-line-strong bg-navy-900 px-1.5 py-0.5 font-mono text-gray-700">←</kbd>
          <kbd className="rounded border border-line-strong bg-navy-900 px-1.5 py-0.5 font-mono text-gray-700">→</kbd>
          para navegar
        </span>
        <span className="h-3 w-px bg-gray-300" />
        <span className="flex items-center gap-1.5">
          <kbd className="rounded border border-line-strong bg-navy-900 px-1.5 py-0.5 font-mono text-gray-700">Esc</kbd>
          para cerrar
        </span>
      </div>
    </div>
  );
}
