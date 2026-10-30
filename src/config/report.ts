// Configuracion centralizada de textos de reportes (PDF / pantallas).
// Cambiar aqui el contratista o el codigo de proyecto en lugar de editar cada archivo.

export const REPORT_CONFIG = {
  /** Como se nombra al contratista en las observaciones estandar (generico, sin empresa) */
  contratista: 'LA CONTRATISTA',
  /** Codigo de proyecto usado en los reportes de OBSERVADOS */
  proyectoObservados: 'P227',
  /** Texto que se imprime cuando un suministro no tiene observacion registrada */
  sinObservacion: 'SIN OBSERVACIÓN',
};

/** Observacion estandar: contraste ejecutado */
export const OBSERVACION_EJECUTADO = `${REPORT_CONFIG.contratista} EJECUTO EL CONTRASTE EN LA FECHA PROGRAMADA`;

/** Observacion estandar: contraste NO ejecutado */
export const OBSERVACION_NO_EJECUTADO = `${REPORT_CONFIG.contratista} NO EJECUTA EL CONTRASTE EN LA FECHA PROGRAMADA`;

/**
 * Las hojas guardan el nombre del contratista anterior (y las apps lo siguen enviando):
 * "CONTRATISTA MALCOM EJECUTO...". Se generaliza al leer, sin tocar lo escrito en la hoja.
 */
export function generalizarObservacion(texto: string): string;
export function generalizarObservacion(texto: string | null | undefined): string | null | undefined;
export function generalizarObservacion(texto: string | null | undefined) {
  return texto?.replace(/\b(?:LA\s+)?(?:EMPRESA\s+)?(?:CONTRATISTA\s+)?MALCOL?M\b/gi, REPORT_CONFIG.contratista);
}

/** Titulo de supervision de reportes de programacion */
export function supervisionProgramacionTitle(sheetName: string): string {
  return `SUPERVISION DE PROGRAMACION - ${sheetName}`;
}

/** Titulo de supervision de reportes OBSERVADOS */
export function supervisionObservadosTitle(semana: string | null | undefined): string {
  const proyecto = REPORT_CONFIG.proyectoObservados ? ` - ${REPORT_CONFIG.proyectoObservados}` : '';
  return `SUPERVISION DE SUMINISTROS OBSERVADOS${proyecto} - SEMANA ${semana || '?'}`;
}
