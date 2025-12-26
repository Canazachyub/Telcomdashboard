declare module 'react-leaflet-draw' {
  import { FC } from 'react';

  interface EditControlProps {
    position?: 'topleft' | 'topright' | 'bottomleft' | 'bottomright';
    onCreated?: (e: any) => void;
    onEdited?: (e: any) => void;
    onDeleted?: (e: any) => void;
    onMounted?: (e: any) => void;
    onEditStart?: (e: any) => void;
    onEditStop?: (e: any) => void;
    onDeleteStart?: (e: any) => void;
    onDeleteStop?: (e: any) => void;
    onDrawStart?: (e: any) => void;
    onDrawStop?: (e: any) => void;
    onDrawVertex?: (e: any) => void;
    draw?: {
      polyline?: boolean | object;
      polygon?: boolean | object;
      rectangle?: boolean | object;
      circle?: boolean | object;
      marker?: boolean | object;
      circlemarker?: boolean | object;
    };
    edit?: {
      edit?: boolean;
      remove?: boolean;
      featureGroup?: any;
    };
  }

  export const EditControl: FC<EditControlProps>;
}
