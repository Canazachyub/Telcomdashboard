import { useState, useEffect, useCallback } from 'react';
import {
  X, ChevronLeft, ChevronRight, ExternalLink, Camera,
  Maximize2, Grid, Image as ImageIcon
} from 'lucide-react';
import type { PhotoLink } from '../types/point';
import { getDriveThumbnailUrl, getDriveImageUrl } from '../utils/driveUtils';

interface PhotoGalleryModalProps {
  photos: PhotoLink[];
  suministro: string;
  initialIndex?: number;
  onClose: () => void;
}

// Componente de imagen con loading y fallback
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
  const thumbnailUrl = getDriveThumbnailUrl(photo.url, 'w200');

  return (
    <div
      onClick={onClick}
      className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer transition-all ${
        isSelected
          ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-900'
          : 'hover:ring-2 hover:ring-white/50'
      }`}
    >
      {loading && (
        <div className="absolute inset-0 bg-gray-700 flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-white/30 border-t-white"></div>
        </div>
      )}
      {!error ? (
        <img
          src={thumbnailUrl}
          alt={`Foto #${photo.numero}`}
          className={`w-full h-full object-cover transition-opacity ${loading ? 'opacity-0' : 'opacity-100'}`}
          onLoad={() => setLoading(false)}
          onError={() => {
            setError(true);
            setLoading(false);
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-gray-700 flex flex-col items-center justify-center text-gray-400">
          <Camera size={24} />
        </div>
      )}
      <div className="absolute bottom-1 left-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
        #{photo.numero}
      </div>
      {photo.lectura && (
        <div className="absolute top-1 right-1 bg-green-600/90 text-white text-xs px-1.5 py-0.5 rounded">
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

  // Si no hay fotos, mostrar mensaje y cerrar
  if (!photos || photos.length === 0) {
    return (
      <div className="fixed inset-0 z-[1000] bg-black/95 flex items-center justify-center">
        <div className="bg-gray-900 rounded-xl p-8 text-center max-w-md">
          <Camera size={64} className="mx-auto text-gray-500 mb-4" />
          <h3 className="text-white text-xl font-semibold mb-2">Sin fotos disponibles</h3>
          <p className="text-gray-400 mb-6">No hay fotos registradas para el suministro {suministro}</p>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  const currentPhoto = photos[currentIndex];

  // Guard adicional por si currentPhoto es undefined
  if (!currentPhoto || !currentPhoto.url) {
    return (
      <div className="fixed inset-0 z-[1000] bg-black/95 flex items-center justify-center">
        <div className="bg-gray-900 rounded-xl p-8 text-center max-w-md">
          <Camera size={64} className="mx-auto text-gray-500 mb-4" />
          <h3 className="text-white text-xl font-semibold mb-2">Error al cargar foto</h3>
          <p className="text-gray-400 mb-6">La foto seleccionada no tiene URL válida</p>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

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
    window.open(currentPhoto.url, '_blank');
  };

  // URLs para intentar cargar la imagen (en orden de prioridad)
  // 1. Thumbnail grande (más confiable)
  // 2. lh3.googleusercontent.com (mejor calidad pero menos confiable)
  const thumbnailUrl = getDriveThumbnailUrl(currentPhoto.url, 'w2000');
  const lh3Url = getDriveImageUrl(currentPhoto.url);

  // Estado para manejar el fallback de URLs
  const [currentImageUrl, setCurrentImageUrl] = useState(thumbnailUrl);
  const [urlAttempt, setUrlAttempt] = useState(0);

  // Reset cuando cambia la foto
  useEffect(() => {
    setCurrentImageUrl(getDriveThumbnailUrl(currentPhoto.url, 'w2000'));
    setUrlAttempt(0);
    setLoading(true);
    setError(false);
  }, [currentPhoto.url]);

  const handleImageError = () => {
    if (urlAttempt === 0) {
      // Primer intento falló (thumbnail), intentar con lh3
      setUrlAttempt(1);
      setCurrentImageUrl(lh3Url);
      setLoading(true);
    } else {
      // Todos los intentos fallaron
      setError(true);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black/95 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/50 border-b border-white/10">
        <div className="flex items-center gap-4">
          <h3 className="text-white font-semibold text-lg">
            Fotos - {suministro}
          </h3>
          <span className="text-gray-400 text-sm">
            {currentIndex + 1} / {photos.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle view mode */}
          <button
            onClick={() => setViewMode(viewMode === 'single' ? 'grid' : 'single')}
            className={`p-2 rounded-lg transition-colors ${
              viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'
            }`}
            title={viewMode === 'single' ? 'Ver cuadrícula' : 'Ver individual'}
          >
            {viewMode === 'single' ? <Grid size={20} /> : <ImageIcon size={20} />}
          </button>

          {/* Open in Drive */}
          <button
            onClick={openInDrive}
            className="flex items-center gap-2 px-3 py-2 text-sm text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
          >
            <ExternalLink size={16} />
            Abrir en Drive
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={24} />
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
                  className="absolute left-4 z-10 p-3 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
                >
                  <ChevronLeft size={32} className="text-white" />
                </button>
              )}

              {/* Image container */}
              <div className="relative w-full h-full flex items-center justify-center">
                {loading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-white/30 border-t-white"></div>
                  </div>
                )}

                {!error ? (
                  <img
                    src={currentImageUrl}
                    alt={`Foto #${currentPhoto.numero}`}
                    className={`max-w-full max-h-[75vh] object-contain rounded-lg bg-gray-900 transition-opacity ${loading ? 'opacity-0' : 'opacity-100'}`}
                    onLoad={() => setLoading(false)}
                    onError={handleImageError}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-gray-400">
                    <Camera size={64} className="mb-4" />
                    <p className="text-lg mb-2">No se pudo cargar la imagen</p>
                    <button
                      onClick={openInDrive}
                      className="text-blue-400 hover:text-blue-300 underline"
                    >
                      Abrir en Google Drive
                    </button>
                  </div>
                )}
              </div>

              {currentIndex < photos.length - 1 && (
                <button
                  onClick={handleNext}
                  className="absolute right-4 z-10 p-3 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
                >
                  <ChevronRight size={32} className="text-white" />
                </button>
              )}
            </div>

            {/* Sidebar with thumbnails and info */}
            <div className="w-72 bg-gray-900 border-l border-white/10 flex flex-col">
              {/* Photo info */}
              <div className="p-4 border-b border-white/10">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Foto #</span>
                    <span className="text-white font-medium">{currentPhoto.numero}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Fecha</span>
                    <span className="text-white">{currentPhoto.fecha || '-'}</span>
                  </div>
                  {currentPhoto.lectura && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Lectura</span>
                      <span className="text-green-400 font-medium">{currentPhoto.lectura}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Thumbnails */}
              <div className="flex-1 p-4 overflow-y-auto">
                <p className="text-gray-400 text-sm mb-3">Todas las fotos ({photos.length})</p>
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
                  className="group relative aspect-square rounded-xl overflow-hidden cursor-pointer bg-gray-800 hover:ring-2 hover:ring-blue-500 transition-all"
                >
                  <PhotoThumbnail
                    photo={photo}
                    isSelected={false}
                    onClick={() => handleSelectPhoto(index)}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <Maximize2 className="text-white opacity-0 group-hover:opacity-100 transition-opacity" size={32} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-black/50 border-t border-white/10 flex items-center justify-center gap-4 text-gray-400 text-sm">
        <span>Usa las flechas del teclado para navegar</span>
        <span className="text-gray-600">|</span>
        <span>ESC para cerrar</span>
      </div>
    </div>
  );
}
