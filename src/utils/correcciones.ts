// Correcciones de suministro confirmadas por el supervisor (p. ej. «g» → 10010743192).
// Mientras el servidor no tenga la acción «corregirSuministro», se guardan en este
// navegador y se pueden exportar a Excel para corregir la hoja a mano.
import * as XLSX from 'xlsx';

export interface Correccion {
  jornada: string;
  original: string;
  corregido: string;
  /** Jornada de donde salió el código sugerido (null = la misma) */
  origenSugerencia: string | null;
  tecnico: string;
  lat: number | null;
  lng: number | null;
  distancia: number | null;
  fecha: string; // ISO
}

const KEY = 'telcom.correcciones.v1';

function leerTodo(): Correccion[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Correccion[]) : [];
  } catch {
    return [];
  }
}

function guardarTodo(lista: Correccion[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(lista));
  } catch {
    /* almacenamiento no disponible: la corrección vale solo para esta sesión */
  }
}

/** Mismo registro: mismo código escrito y misma posición de la foto */
const mismo = (c: Correccion, jornada: string, original: string, lat: number | null, lng: number | null) =>
  c.jornada === jornada && c.original === original && c.lat === lat && c.lng === lng;

export const correccionesDe = (jornada: string) => leerTodo().filter((c) => c.jornada === jornada);

export function confirmarCorreccion(c: Correccion) {
  guardarTodo([...leerTodo().filter((x) => !mismo(x, c.jornada, c.original, c.lat, c.lng)), c]);
}

export function quitarCorreccion(jornada: string, original: string, lat: number | null, lng: number | null) {
  guardarTodo(leerTodo().filter((x) => !mismo(x, jornada, original, lat, lng)));
}

export function buscarCorreccion(lista: Correccion[], original: string, lat: number | null, lng: number | null) {
  return lista.find((c) => c.original === original && c.lat === lat && c.lng === lng) || null;
}

export function exportarCorrecciones(jornada: string) {
  const data = correccionesDe(jornada).map((c) => ({
    Jornada: c.jornada,
    'Suministro escrito': c.original,
    'Suministro correcto': c.corregido,
    'Sugerido desde': c.origenSugerencia || c.jornada,
    Técnico: c.tecnico,
    'Lat foto': c.lat,
    'Long foto': c.lng,
    'Distancia (m)': c.distancia != null ? Math.round(c.distancia) : '',
    'Confirmado el': new Date(c.fecha).toLocaleString('es-PE'),
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [{ wch: 24 }, { wch: 18 }, { wch: 18 }, { wch: 24 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Correcciones');
  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Correcciones_suministro_${jornada.replace(/[^\w-]+/g, '_')}_${fecha}.xlsx`);
}
