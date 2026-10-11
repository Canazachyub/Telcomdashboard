import { useEffect, useState } from 'react';
import { brandAsset } from '../../config/brand';
import { radialBolts } from './lightning';

/**
 * Isotipo que cada cierto tiempo "se electrifica": chispazos alrededor,
 * parpadeo y brillo. También se dispara al pasar el mouse o al hacer clic.
 */
export default function ElectricLogo({ size = 56, onClick }: { size?: number; onClick?: () => void }) {
  const [zap, setZap] = useState(false);
  const [bolts, setBolts] = useState<string[]>([]);

  const fire = () => setZap(true);

  // Descargas periódicas (cada 6-10 s)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        fire();
        schedule();
      }, 6000 + Math.random() * 4000);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  // Animación de la descarga (~700 ms)
  useEffect(() => {
    if (!zap) return;
    const id = setInterval(() => setBolts(radialBolts(50, 50, 30, 50, 4, 7)), 70);
    const end = setTimeout(() => {
      setZap(false);
      setBolts([]);
    }, 700);
    return () => {
      clearInterval(id);
      clearTimeout(end);
    };
  }, [zap]);

  return (
    <button
      type="button"
      onMouseEnter={fire}
      onClick={() => {
        fire();
        onClick?.();
      }}
      className="relative shrink-0 rounded-full outline-none"
      style={{ width: size, height: size }}
      aria-label="TELCOM"
    >
      <img
        src={brandAsset('isotipo.webp')}
        alt="TELCOM"
        draggable={false}
        className={`h-full w-full drop-shadow-[0_0_18px_rgba(0,212,255,0.35)] ${zap ? 'logo-zap' : ''}`}
      />
      <svg
        className="pointer-events-none absolute -inset-1/2 h-[200%] w-[200%]"
        viewBox="0 0 100 100"
        aria-hidden="true"
      >
        <g stroke="#bff6ff" fill="none" strokeWidth={0.9} strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 2px #00d4ff)' }}>
          {bolts.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
      </svg>
    </button>
  );
}
