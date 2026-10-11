import { useEffect, useState } from 'react';
import { brandAsset } from '../config/brand';
import { LOGIN_SLIDES, type LoginSlide } from '../config/loginSlides';

const INTERVAL_MS = 7000;

interface Props {
  onSlideChange?: (slide: LoginSlide) => void;
}

export default function LoginBackground({ onSlideChange }: Props) {
  const [slides, setSlides] = useState<LoginSlide[]>([]);
  const [active, setActive] = useState(0);

  // Precargar y quedarse solo con las imágenes disponibles
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      LOGIN_SLIDES.map(
        (slide) =>
          new Promise<LoginSlide | null>((resolve) => {
            const img = new Image();
            img.onload = () => resolve(slide);
            img.onerror = () => resolve(null);
            img.src = brandAsset(slide.file);
          }),
      ),
    ).then((ok) => {
      if (!cancelled) setSlides(ok.filter((s): s is LoginSlide => s !== null));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // La frase cambia a mitad del fundido de la imagen para que ambas vayan juntas
  useEffect(() => {
    if (!slides[active]) return;
    const t = setTimeout(() => onSlideChange?.(slides[active]), active === 0 ? 0 : 800);
    return () => clearTimeout(t);
  }, [slides, active, onSlideChange]);

  useEffect(() => {
    if (slides.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => setActive((i) => (i + 1) % slides.length), INTERVAL_MS);
    return () => clearInterval(id);
  }, [slides.length]);

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {slides.map((slide, i) => {
        const url = brandAsset(slide.file);
        return (
          <div
            key={slide.file}
            className={`absolute inset-0 transition-opacity duration-[1600ms] ease-in-out ${
              i === active ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {/* Re-montar al activarse reinicia el acercamiento lento */}
            <div
              key={i === active ? `on-${active}` : 'off'}
              className="absolute inset-0 bg-cover bg-center motion-safe:animate-[kenBurns_9s_ease-out_forwards]"
              style={{ backgroundImage: `url(${url})` }}
            />
          </div>
        );
      })}

      {/* Indicadores */}
      {slides.length > 1 && (
        <div className="absolute bottom-6 left-6 z-10 flex gap-2 lg:left-12">
          {slides.map((s, i) => (
            <span
              key={s.file}
              className={`h-1 rounded-full transition-all duration-500 ${i === active ? 'w-8 bg-electric' : 'w-3 bg-white/30'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
