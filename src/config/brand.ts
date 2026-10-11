// Recursos de marca servidos desde public/brand (respeta el base path de GitHub Pages).
export const brandAsset = (file: string) => `${import.meta.env.BASE_URL}brand/${file}`;
