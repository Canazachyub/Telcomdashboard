// Selección por recuadro sobre el mapa, al estilo de un juego de estrategia:
// arrastrar = seleccionar, Shift = sumar, Alt = quitar, Espacio + arrastrar = mover el mapa.
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { Rectangle as LRectangle, LatLngBounds, type LeafletMouseEvent } from 'leaflet';

export type ModoSeleccion = 'nuevo' | 'agregar' | 'quitar';

export default function SeleccionCaja({
  activo,
  onSeleccion,
}: {
  activo: boolean;
  /** Recuadro terminado: sus límites y cómo combinarlo con la selección actual */
  onSeleccion: (bounds: LatLngBounds, modo: ModoSeleccion) => void;
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
    let espacio = false;

    const modoDe = (e: MouseEvent): ModoSeleccion =>
      e.altKey ? 'quitar' : e.shiftKey || e.ctrlKey ? 'agregar' : 'nuevo';
    const color = (m: ModoSeleccion) => (m === 'quitar' ? '#f43f5e' : m === 'agregar' ? '#22c55e' : '#00d4ff');

    const down = (e: LeafletMouseEvent) => {
      if (espacio || e.originalEvent.button !== 0) return;
      // Un clic sobre un marcador lo maneja el propio marcador
      if ((e.originalEvent.target as HTMLElement).closest('.leaflet-marker-icon')) return;
      inicio = e;
    };
    const move = (e: LeafletMouseEvent) => {
      if (!inicio) return;
      const dx = Math.abs(e.containerPoint.x - inicio.containerPoint.x);
      const dy = Math.abs(e.containerPoint.y - inicio.containerPoint.y);
      if (!caja && dx + dy < 6) return;
      const b = new LatLngBounds(inicio.latlng, e.latlng);
      const m = modoDe(e.originalEvent);
      if (!caja) {
        caja = new LRectangle(b, {
          color: color(m),
          weight: 1.5,
          dashArray: '5 4',
          fillOpacity: 0.12,
          interactive: false,
        });
        caja.addTo(map);
      } else {
        caja.setBounds(b);
        caja.setStyle({ color: color(m), fillColor: color(m) });
      }
    };
    const up = (e: LeafletMouseEvent) => {
      if (inicio && caja) cb.current(caja.getBounds(), modoDe(e.originalEvent));
      caja?.remove();
      caja = null;
      inicio = null;
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
      caja?.remove();
      map.dragging.enable();
      map.boxZoom.enable();
      map.doubleClickZoom.enable();
      cont.style.cursor = '';
    };
  }, [activo, map]);

  return null;
}
