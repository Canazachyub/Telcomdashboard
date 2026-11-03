// Selección sobre el mapa, al estilo de un juego de estrategia:
// arrastrar = seleccionar, Shift = sumar, Alt = quitar, Espacio + arrastrar = mover el mapa.
// Forma «caja» (recuadro) o «lazo» (se dibuja el contorno a mano, para áreas irregulares).
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { Rectangle as LRectangle, Polygon as LPolygon, LatLngBounds, type LeafletMouseEvent } from 'leaflet';
import { dentroDePoligono } from './mapaHojas';

export type ModoSeleccion = 'nuevo' | 'agregar' | 'quitar';
export type FormaSeleccion = 'caja' | 'lazo';

export default function SeleccionCaja({
  activo,
  forma = 'caja',
  onSeleccion,
}: {
  activo: boolean;
  forma?: FormaSeleccion;
  /** Trazo terminado: prueba si una coordenada [lat, lng] quedó dentro y cómo combinarlo con la selección */
  onSeleccion: (contiene: (c: [number, number]) => boolean, modo: ModoSeleccion) => void;
}) {
  const map = useMap();
  const cb = useRef(onSeleccion);
  useEffect(() => {
    cb.current = onSeleccion;
  }, [onSeleccion]);

  useEffect(() => {
    if (!activo) return;
    const cont = map.getContainer();
    map.dragging.disable();
    map.boxZoom.disable();
    map.doubleClickZoom.disable();
    cont.style.cursor = 'crosshair';

    let inicio: LeafletMouseEvent | null = null;
    let caja: LRectangle | null = null;
    let lazo: LPolygon | null = null;
    let trazo: [number, number][] = [];
    let espacio = false;

    const modoDe = (e: MouseEvent): ModoSeleccion =>
      e.altKey ? 'quitar' : e.shiftKey || e.ctrlKey ? 'agregar' : 'nuevo';
    const color = (m: ModoSeleccion) => (m === 'quitar' ? '#f43f5e' : m === 'agregar' ? '#22c55e' : '#00d4ff');
    const estilo = (m: ModoSeleccion) => ({
      color: color(m),
      fillColor: color(m),
      weight: 1.5,
      dashArray: '5 4',
      fillOpacity: 0.12,
      interactive: false,
    });
    const limpiar = () => {
      caja?.remove();
      lazo?.remove();
      caja = null;
      lazo = null;
      trazo = [];
      inicio = null;
    };

    const down = (e: LeafletMouseEvent) => {
      if (espacio || e.originalEvent.button !== 0) return;
      // Un clic sobre un marcador lo maneja el propio marcador
      if ((e.originalEvent.target as HTMLElement).closest('.leaflet-marker-icon')) return;
      e.originalEvent.preventDefault(); // que el arrastre no seleccione texto de la página
      inicio = e;
      trazo = [[e.latlng.lat, e.latlng.lng]];
    };
    const move = (e: LeafletMouseEvent) => {
      if (!inicio) return;
      const dx = Math.abs(e.containerPoint.x - inicio.containerPoint.x);
      const dy = Math.abs(e.containerPoint.y - inicio.containerPoint.y);
      if (!caja && !lazo && dx + dy < 6) return;
      const m = modoDe(e.originalEvent);
      if (forma === 'lazo') {
        trazo.push([e.latlng.lat, e.latlng.lng]);
        if (!lazo) lazo = new LPolygon(trazo, estilo(m)).addTo(map);
        else {
          lazo.setLatLngs(trazo);
          lazo.setStyle({ color: color(m), fillColor: color(m) });
        }
        return;
      }
      const b = new LatLngBounds(inicio.latlng, e.latlng);
      if (!caja) caja = new LRectangle(b, estilo(m)).addTo(map);
      else {
        caja.setBounds(b);
        caja.setStyle({ color: color(m), fillColor: color(m) });
      }
    };
    const up = (e: LeafletMouseEvent) => {
      const modo = modoDe(e.originalEvent);
      if (inicio && caja) {
        const b = caja.getBounds();
        cb.current((c) => b.contains(c), modo);
      } else if (inicio && lazo && trazo.length >= 3) {
        const poli = [...trazo];
        cb.current((c) => dentroDePoligono(c, poli), modo);
      }
      limpiar();
    };
    const keydown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !espacio && !(e.target as HTMLElement)?.closest('input,textarea')) {
        espacio = true;
        map.dragging.enable();
        cont.style.cursor = 'grab';
        e.preventDefault();
      }
    };
    const keyup = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        espacio = false;
        map.dragging.disable();
        cont.style.cursor = 'crosshair';
      }
    };

    map.on('mousedown', down);
    map.on('mousemove', move);
    map.on('mouseup', up);
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    return () => {
      map.off('mousedown', down);
      map.off('mousemove', move);
      map.off('mouseup', up);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      limpiar();
      map.dragging.enable();
      map.boxZoom.enable();
      map.doubleClickZoom.enable();
      cont.style.cursor = '';
    };
  }, [activo, forma, map]);

  return null;
}

/** Da acceso a la instancia del mapa desde fuera del MapContainer (p. ej. lo que se ve en pantalla). */
export function MapaRef({ onMapa }: { onMapa: (m: ReturnType<typeof useMap>) => void }) {
  const map = useMap();
  const cb = useRef(onMapa);
  useEffect(() => {
    cb.current(map);
    // Si el encabezado cambia de alto (botones que pasan a otra fila), el mapa se reajusta
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  return null;
}
