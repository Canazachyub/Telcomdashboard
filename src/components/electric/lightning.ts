// Genera trazos de rayo "quebrados" en SVG entre dos puntos.
export function boltPath(x1: number, y1: number, x2: number, y2: number, segments = 10, jitter = 18): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  // Normal unitaria para desplazar los vértices hacia los lados
  const nx = -dy / len;
  const ny = dx / len;
  let d = `M${x1.toFixed(1)} ${y1.toFixed(1)}`;
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    // Más desviación en el centro que en los extremos
    const amp = jitter * Math.sin(Math.PI * t) * (Math.random() * 2 - 1);
    d += ` L${(x1 + dx * t + nx * amp).toFixed(1)} ${(y1 + dy * t + ny * amp).toFixed(1)}`;
  }
  return `${d} L${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

/** Rayos radiales que salen de un centro hacia un anillo. */
export function radialBolts(cx: number, cy: number, r0: number, r1: number, count: number, jitter = 14): string[] {
  return Array.from({ length: count }, () => {
    const a = Math.random() * Math.PI * 2;
    const r = r1 * (0.75 + Math.random() * 0.4);
    return boltPath(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 7, jitter);
  });
}
