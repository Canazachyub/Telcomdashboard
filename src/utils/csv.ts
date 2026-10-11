// Helper unico para exportaciones CSV:
// - Agrega BOM UTF-8 (Excel reconoce acentos)
// - Neutraliza celdas que empiezan con = + - @ (CSV/formula injection)
// - Escapa comillas, comas y saltos de linea

export type CsvValue = string | number | boolean | null | undefined;

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function toCsvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  let str = String(value);

  // Los numeros reales (p.ej. coordenadas negativas) no se neutralizan
  const isPlainNumber = typeof value === 'number' || /^-?\d+(\.\d+)?$/.test(str);
  if (!isPlainNumber && FORMULA_PREFIX.test(str)) {
    str = `'${str}`;
  }

  if (/[",\n\r;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsv(headers: string[], rows: CsvValue[][]): string {
  const BOM = '﻿';
  const lines = [headers.map(toCsvCell).join(','), ...rows.map((r) => r.map(toCsvCell).join(','))];
  return BOM + lines.join('\r\n');
}

export function downloadCsv(fileName: string, headers: string[], rows: CsvValue[][]): void {
  const csv = buildCsv(headers, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
