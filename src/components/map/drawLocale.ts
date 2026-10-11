import L from 'leaflet';
import 'leaflet-draw';

// Textos de la herramienta de dibujo (leaflet-draw) en español.
const dl = L.drawLocal;
if (dl) {
  dl.draw.toolbar.actions = { title: 'Cancelar el dibujo', text: 'Cancelar' };
  dl.draw.toolbar.finish = { title: 'Terminar el dibujo', text: 'Terminar' };
  dl.draw.toolbar.undo = { title: 'Borrar el último punto', text: 'Borrar último punto' };
  dl.draw.toolbar.buttons.polygon = 'Dibujar un área (polígono)';
  dl.draw.toolbar.buttons.rectangle = 'Dibujar un área (rectángulo)';
  dl.draw.handlers.polygon.tooltip = {
    start: 'Haz clic para empezar a delimitar el área.',
    cont: 'Haz clic para agregar otro vértice.',
    end: 'Haz clic en el primer punto para cerrar el área.',
  };
  dl.draw.handlers.rectangle.tooltip = { start: 'Haz clic y arrastra para dibujar el rectángulo.' };
  dl.draw.handlers.simpleshape.tooltip = { end: 'Suelta el mouse para terminar.' };
}
