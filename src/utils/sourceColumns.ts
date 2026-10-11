import type { GpsPointExtended } from '../types/point';

const v = <T,>(x: T | null | undefined) => (x === undefined ? null : x);

/**
 * Fila con las mismas columnas y orden que la hoja fuente (estructura extendida A–AJ),
 * para exportaciones a Excel que se puedan volver a pegar en una jornada.
 */
export function sourceRow(p: GpsPointExtended): Record<string, unknown> {
  return {
    'Nº': v(p.numero),
    TECNICO: v(p.tecnico),
    Fecha_Contraste: v(p.fecha),
    Suministro: p.suministro,
    Codigo_Ruta: v(p.codigoRuta),
    Cliente_Nombre: v(p.clienteNombre),
    Direccion: v(p.direccion),
    Distrito: v(p.distrito),
    SED: v(p.sed),
    Marca: v(p.marca),
    Modelo: v(p.modelo),
    Serie: v(p.serie),
    Fase: v(p.fase),
    Anio_Fabricacion: v(p.anioFabricacion),
    Hilos: v(p.hilos),
    Consumo_Promedio: v(p.consumoPromedio),
    Equipo_Patron: v(p.equipoPatron),
    Carga: v(p.carga),
    DNI_Cliente: v(p.dniCliente),
    LONGITUD: v(p.longRef),
    LATITUD: v(p.latRef),
    GIS: v(p.gis),
    ESTADO_TAREA: v(p.estadoTarea),
    Link_Carpeta: v(p.linkCarpeta),
    GPS_Real: v(p.gpsReal),
    Ubicacion_Geo: v(p.ubicacionGeo),
    LAT_REAL: v(p.latReal),
    LONG_REAL: v(p.longReal),
    LECTURA: v(p.lectura),
    Foto_Count: v(p.fotoCount ?? p.photoCount),
    Photo_Links: (p.photoLinks || []).map((l) => l.url).filter(Boolean).join(' | ') || null,
    Synced_At: v(p.syncedAt),
    Notas: v(p.notas),
    ODT_ID: v(p.odtId),
    ODT_Nombre: v(p.odtNombre),
    ODT_Color: v(p.odtColor),
  };
}

/** Anchos de columna razonables a partir de los encabezados. */
export const autoCols = (headers: string[]) => headers.map((h) => ({ wch: Math.min(Math.max(h.length + 2, 12), 40) }));
