import { useEffect, useState } from 'react';
import { brandAsset } from '../../config/brand';
import { boltPath, radialBolts } from './lightning';

/**
 * Intro de arranque al abrir el login (inspirada en los arranques de StarCraft):
 * pantalla negra → línea de encendido → chispazos → el isotipo se materializa
 * con descargas → aparece la marca → destello y se revela el login.
 * Se reproduce una vez por sesión; un clic o una tecla la saltan.
 */
const DURATION_MS = 4200;

type Phase = 'power' | 'arc' | 'logo' | 'brand' | 'out';

export default function ElectricIntro({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>('power');
  const [bolts, setBolts] = useState<string[]>([]);
  const [ring, setRing] = useState<string[]>([]);

  // Línea de tiempo
  useEffect(() => {
    const t = [
      setTimeout(() => setPhase('arc'), 450),
      setTimeout(() => setPhase('logo'), 1250),
      setTimeout(() => setPhase('brand'), 2300),
      setTimeout(() => setPhase('out'), 3500),
      setTimeout(onDone, DURATION_MS),
    ];
    return () => t.forEach(clearTimeout);
  }, [onDone]);

  // Chispazos: se regeneran muy rápido para dar parpadeo eléctrico
  useEffect(() => {
    if (phase === 'power' || phase === 'out') return;
    const tick = () => {
      if (phase === 'arc') {
        // Arcos que cruzan la pantalla hacia el centro
        setBolts(
          Array.from({ length: 3 }, () => {
            const side = Math.random() < 0.5 ? -1 : 1;
            return boltPath(500 + side * (380 + Math.random() * 120), 200 + Math.random() * 200, 500, 300, 14, 40);
          }),
        );
      } else {
        setBolts(phase === "logo" ? radialBolts(500, 300, 70, 150, 6, 16) : radialBolts(500, 300, 70, 118, 3, 12));
      }
      setRing(
        Array.from({ length: 2 }, () => {
          const a = Math.random() * Math.PI * 2;
          const b = a + 0.6 + Math.random() * 0.9;
          return boltPath(500 + Math.cos(a) * 92, 300 + Math.sin(a) * 92, 500 + Math.cos(b) * 92, 300 + Math.sin(b) * 92, 6, 10);
        }),
      );
    };
    tick();
    const id = setInterval(tick, 90);
    return () => clearInterval(id);
  }, [phase]);

  // Saltar con clic o tecla
  useEffect(() => {
    const skip = () => onDone();
    window.addEventListener('keydown', skip);
    return () => window.removeEventListener('keydown', skip);
  }, [onDone]);

  const showLogo = phase === 'logo' || phase === 'brand' || phase === 'out';

  return (
    <div
      onClick={onDone}
      className={`fixed inset-0 z-[2000] flex cursor-pointer items-center justify-center overflow-hidden bg-[#02060e] transition-opacity duration-700 ${
        phase === 'out' ? 'opacity-0' : 'opacity-100'
      }`}
      role="presentation"
    >
      {/* Línea de encendido tipo monitor */}
      <div
        className={`absolute left-1/2 top-1/2 h-[2px] -translate-x-1/2 -translate-y-1/2 bg-electric shadow-[0_0_24px_6px_rgba(0,212,255,0.7)] transition-all ease-out ${
          phase === 'power' ? 'w-[70vw] opacity-100 duration-[450ms]' : 'w-0 opacity-0 duration-300'
        }`}
      />

      {/* Retícula y barrido */}
      <div className="intro-scan pointer-events-none absolute inset-0 opacity-40" />

      <svg className="absolute" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid meet" style={{ width: "min(100vw, 166.67vh)", height: "min(60vw, 100vh)", left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}>
        <defs>
          <filter id="bolt-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g filter="url(#bolt-glow)" stroke="#bff6ff" fill="none" strokeLinecap="round" strokeLinejoin="round">
          {bolts.map((d, i) => (
            <path key={`b${i}`} d={d} strokeWidth={i === 0 ? 2.2 : 1.3} opacity={i === 0 ? 1 : 0.7} />
          ))}
          {showLogo &&
            ring.map((d, i) => <path key={`r${i}`} d={d} strokeWidth={1.4} stroke="#00d4ff" />)}
        </g>
        {showLogo && (
          <circle
            cx="500"
            cy="300"
            r="92"
            fill="none"
            stroke="#00d4ff"
            strokeWidth="1.5"
            strokeDasharray="578"
            className="intro-ring"
            filter="url(#bolt-glow)"
          />
        )}
      </svg>

      {/* Isotipo: centrado exacto, igual que el anillo y los rayos del SVG */}
      <img
        src={brandAsset('isotipo.webp')}
        alt=""
        draggable={false}
        className={`absolute left-1/2 top-1/2 h-[min(26vmin,170px)] w-[min(26vmin,170px)] -translate-x-1/2 -translate-y-1/2 ${
          showLogo ? 'intro-logo' : 'opacity-0'
        }`}
      />

      {/* Marca: debajo del anillo, sin tocarlo */}
      <div
        className={`absolute left-1/2 top-[calc(50%+min(34vmin,230px))] w-full -translate-x-1/2 px-6 text-center transition-all duration-700 ${
          phase === 'brand' || phase === 'out' ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
        }`}
      >
        <p className="intro-wordmark font-display text-3xl font-bold tracking-[0.35em] text-white sm:text-4xl">
          TELCOM
        </p>
        <p className="mt-3 font-display text-[10px] tracking-[0.4em] text-electric sm:text-xs">
          INGENIERÍA TELCOM E.I.R.L.
        </p>
      </div>

      {/* Destello al encender el logo */}
      <div
        className={`pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(191,246,255,0.35),rgba(0,212,255,0.08)_25%,transparent_45%)] ${
          phase === 'logo' ? 'intro-flash' : 'opacity-0'
        }`}
      />

      <p className="absolute bottom-6 right-6 font-mono text-[10px] tracking-widest text-gray-400">
        CLIC PARA OMITIR
      </p>
    </div>
  );
}
