import { useEffect, useState } from 'react';

const DIAS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const pad = (n: number) => String(n).padStart(2, '0');

/** Reloj de panel de mando (estilo Terran): fecha militar, hora grande con brillo y segundos en ámbar. */
export default function TerranClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const tick = now.getSeconds() % 2 === 0;

  return (
    <div
      className="terran-clock relative hidden select-none items-center gap-3 px-4 py-1.5 md:flex"
      aria-label={now.toLocaleString('es-PE')}
      role="timer"
    >
      {/* Barras laterales tipo indicador */}
      <span className="flex flex-col gap-[3px]" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-[3px] w-3 rounded-sm ${
              (now.getSeconds() + i) % 4 === 0 ? 'bg-electric shadow-[0_0_6px_#00d4ff]' : 'bg-electric/25'
            }`}
          />
        ))}
      </span>

      <div className="leading-none">
        <p className="font-display text-[9px] font-semibold tracking-[0.28em] text-energy">
          {DIAS[now.getDay()]} · {pad(now.getDate())} {MESES[now.getMonth()]} {now.getFullYear()}
        </p>
        <p className="mt-1 flex items-baseline font-display text-[22px] font-bold tracking-[0.08em] text-electric [text-shadow:0_0_12px_rgba(0,212,255,0.55)]">
          {pad(now.getHours())}
          <span className={`mx-0.5 transition-opacity ${tick ? 'opacity-100' : 'opacity-25'}`}>:</span>
          {pad(now.getMinutes())}
          <span className="ml-1.5 text-[13px] text-energy [text-shadow:0_0_10px_rgba(251,191,36,0.5)]">
            {pad(now.getSeconds())}
          </span>
        </p>
      </div>

      <p className="self-end pb-0.5 font-mono text-[9px] leading-tight text-gray-400">
        LIMA
        <br />
        UTC−05
      </p>
    </div>
  );
}
