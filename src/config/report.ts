// Configuracion centralizada de textos de reportes (PDF / pantallas).
// Cambiar aqui el contratista o el codigo de proyecto en lugar de editar cada archivo.

export const REPORT_CONFIG = {
  /** Nombre del contratista que aparece en las observaciones estandar */
  contratista: 'MALCOM',
  /** Codigo de proyecto usado en los reportes de OBSERVADOS */
  proyectoObservados: 'P227',
  /** Texto que se imprime cuando un suministro no tiene observacion registrada */
  sinObservacion: 'SIN OBSERVACIÓN',
};

/** Observacion estandar: contraste ejecutado (texto exacto enviado por la app movil) */
export const OBSERVACION_EJECUTADO = `CONTRATISTA ${REPORT_CONFIG.contratista} EJECUTO EL CONTRASTE EN LA FECHA PROGRAMADA`;

/** Observacion estandar: contraste NO ejecutado (texto exacto enviado por la app movil) */
export const OBSERVACION_NO_EJECUTADO = `CONTRATISTA ${REPORT_CONFIG.contratista} NO EJECUTA EL CONTRASTE EN LA FECHA PROGRAMADA`;

/** Titulo de supervision de reportes de programacion */
export function supervisionProgramacionTitle(sheetName: string): string {
  return `SUPERVISION DE PROGRAMACION - ${sheetName}`;
}

/** Titulo de supervision de reportes OBSERVADOS */
export function supervisionObservadosTitle(semana: string | null | undefined): string {
  const proyecto = REPORT_CONFIG.proyectoObservados ? ` - ${REPORT_CONFIG.proyectoObservados}` : '';
  return `SUPERVISION DE SUMINISTROS OBSERVADOS${proyecto} - SEMANA ${semana || '?'}`;
}
