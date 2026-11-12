// SOLO DESARROLLO (`npm run dev`): respuestas SIMULADAS de los formatos 1A / 2A sobre los datos
// reales de la jornada, para probar pantallas y PDF sin formularios de la app. Se carga con
// import() dinámico detrás de `import.meta.env.DEV`; producción nunca lo usa. Los PDF que salen
// de aquí dicen «PROTOTIPO: respuestas simuladas» en el pie.
import type { GpsPointExtended } from '../types/point';
import { REPORT_CONFIG } from '../config/report';
import {
  PREGUNTAS_1A,
  ITEMS_2A,
  ID_OTRAS,
  ID_CONFORME_2A,
  parseFecha,
  fmtFecha,
  fmtHora,
  esConforme,
  numerar,
  itemsIncumplidos,
  type Evidencia,
  type Resp,
  type Supervisada,
} from '../utils/pdfFormatos';

/** Hash estable para simular siempre igual. */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Evidencia inventada para ver las páginas 2+ del 1A / 2A: solo algunos ítems en NO llevan foto
 * (fotos reales del mismo suministro), uno lleva una foto «no encontrada» y otros quedan sin foto,
 * como pasa en la app (las fotos de evidencia son opcionales).
 */
function evidenciaSimulada(s: Supervisada) {
  const fotos = s.punto.photoLinks ?? [];
  const items = itemsIncumplidos(s);
  if (!fotos.length || !items.length) return;
  const evidencias: Evidencia[] = [];
  items.forEach((it, k) => {
    if (k % 2 === 1) return; // sin evidencia fotográfica
    const lista =
      k === 2
        ? [{ timestamp: '01/01/2026 00:00:00' }] // timestamp que no está en la hoja
        : fotos
            .slice(k === 0 ? 0 : k % fotos.length, k === 0 ? 2 : (k % fotos.length) + 1)
            .map((f) => ({ url: f.url, timestamp: f.fecha }));
    evidencias.push({ pregunta: it.pregunta, texto: it.texto, fotos: lista });
  });
  s.evidencias = evidencias;
}

/** Construye las supervisiones (reales + respuestas simuladas) y numera SP / SC. */
export function simular(puntos: GpsPointExtended[], anio = 2026): Supervisada[] {
  const out: Supervisada[] = [];
  let i = 0;
  for (const p of puntos) {
    if (!p.photoLinks?.length) continue;
    const fotos = p.photoLinks;
    const f0 = parseFecha(fotos[0]?.fecha) ?? parseFecha(p.fechaSupervision) ?? parseFecha(p.syncedAt);
    const notas = (p.notas || '').toUpperCase();
    const noEjecuto = /NO EJECUT/.test(notas);
    const h = hash(String(p.suministro));
    const tipo: '1A' | '2A' = i % 10 === 4 ? '2A' : '1A';
    i++;
    const resp: Record<string, Resp> = Object.fromEntries(PREGUNTAS_1A.map((q) => [q.id, 'SI' as Resp]));
    let observacion = '';
    if (noEjecuto) {
      for (const k of ['sticker_ubicado', 'sticker_llenado', 'sticker_plumon', 'sticker_color', 'fecha_concordante'])
        resp[k] = 'NO';
      observacion = `${REPORT_CONFIG.contratista} NO EJECUTÓ EL CONTRASTE EN LA FECHA PROGRAMADA.`;
    } else if (h % 17 === 0) {
      resp.precinto_bornera = 'NO';
      observacion = 'Medidor sin precinto de bornera. Sticker y caja conformes.';
    } else if (h % 23 === 0) {
      resp.sticker_llenado = 'NO';
      observacion = 'Sticker con borrones, fecha poco legible.';
    }
    const resp2A: Record<string, Resp> = Object.fromEntries(
      ITEMS_2A.map((q) => [q.id, (q.id === ID_OTRAS ? 'NO' : 'SI') as Resp]),
    );
    if (tipo === '2A') {
      Object.keys(resp).forEach((k) => (resp[k] = 'SI'));
      observacion = '';
      if (h % 2 === 0) {
        resp2A[ITEMS_2A.find((q) => q.texto.includes('plumón'))!.id] = 'NO';
        resp2A[ITEMS_2A.find((q) => q.texto.includes('FOTOCHEK'))!.id] = 'NO';
        observacion = 'Sticker llenado con lapicero, no con plumón indeleble. Técnico sin fotocheck.';
      }
    }
    const fechaProg = parseFecha(p.fecha);
    const base = { tipo, resp, resp2A };
    const conforme = esConforme(base);
    if (tipo === '2A') {
      resp2A[ID_CONFORME_2A] = conforme ? 'SI' : 'NO';
      resp2A[ID_OTRAS] = conforme ? 'NO' : 'SI';
    }
    out.push({
      punto: p,
      muestra: p.numero ?? i,
      tipo,
      fecha: f0,
      fechaTxt: fmtFecha(f0),
      horaTxt: fmtHora(f0),
      tecnico: p.odtNombre || p.photoLinks.find((x) => x.odtNombre)?.odtNombre || '—',
      resp,
      resp2A,
      usuario: h % 3 === 0 ? 'N.A.' : 'SI',
      avisado: h % 2 === 0,
      fechaSticker: noEjecuto ? '—' : fmtFecha(fechaProg ?? f0),
      lectura: p.lectura != null && p.lectura !== '' ? String(p.lectura) : '—',
      conforme,
      observacion,
      simulado: true,
      reporte: '',
      fotosFaltan: Math.max(0, (tipo === '1A' ? 3 : 4) - fotos.length),
      sinFormulario: false,
    });
    evidenciaSimulada(out[out.length - 1]);
  }
  return numerar(out, anio);
}
