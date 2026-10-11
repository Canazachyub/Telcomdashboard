// Fondos del login con la frase de la empresa que acompaña a cada uno.
// Los textos son los de la web corporativa (ingeneriatelcom.com).
export interface LoginSlide {
  file: string;
  etiqueta: string;
  texto: string;
}

export const LOGIN_SLIDES: LoginSlide[] = [
  {
    file: 'login-real-1.webp',
    etiqueta: 'Supervisión eléctrica',
    texto: 'Supervisamos en campo la calidad del servicio eléctrico, de la subestación al medidor.',
  },
  {
    file: 'login-real-2.webp',
    etiqueta: 'Obras electromecánicas',
    texto: 'Gestionamos y supervisamos obras civiles y eléctricas con seguridad de principio a fin.',
  },
  {
    file: 'login-real-3.webp',
    etiqueta: 'Tecnología propia',
    texto: 'Aplicaciones de campo y tableros que convierten cada inspección en datos confiables.',
  },
  {
    file: 'hero-energia.webp',
    etiqueta: 'Sur andino',
    texto: 'Instalaciones, mantenimiento y supervisión técnica para la minería del sur andino.',
  },
];
