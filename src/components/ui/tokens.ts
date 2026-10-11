import type { Tone } from './components';

/** Estado de un suministro → tono y texto uniformes en todo el sistema. */
export const STATUS_UI: Record<string, { tone: Tone; label: string }> = {
  pendiente: { tone: 'red', label: 'Pendiente' },
  en_proceso: { tone: 'yellow', label: 'En proceso' },
  completado: { tone: 'green', label: 'Completado' },
};

/* ------------------------------------------------------------------ */
/* Clases reutilizables                                                */
/* ------------------------------------------------------------------ */
export const ui = {
  btnPrimary:
    'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_6px_18px_rgb(37_99_235/0.3)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50',
  btnSecondary:
    'inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-electric hover:text-electric disabled:cursor-not-allowed disabled:opacity-50',
  btnSuccess:
    'inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50',
  btnDanger:
    'inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50',
  input:
    'w-full rounded-xl border border-gray-300 bg-navy-900 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-electric focus:ring-4 focus:ring-[rgb(0_212_255/0.12)]',
  th: 'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500',
  td: 'px-4 py-3 text-sm text-gray-700',
  tableWrap: 'overflow-hidden rounded-2xl border border-gray-200 bg-white',
  theadRow: 'border-b border-gray-200 bg-gray-50',
  tbodyRow: 'border-b border-gray-200 last:border-0 transition-colors hover:bg-gray-50',
};
