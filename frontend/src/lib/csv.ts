/** CSV export for tables. RFC 4180 quoting; numbers are written raw (no thousands separators). */

export type CsvValue = string | number | null | undefined;

function escapeCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'number' ? String(value) : value;
  // Leading =, +, - or @ would run as a formula in spreadsheet apps.
  const safe = /^[=+\-@]/.test(text) && typeof value === 'string' ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: string[], rows: CsvValue[][]): string {
  return [header, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n');
}

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => CsvValue;
}

export function rowsToCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  return toCsv(
    columns.map((c) => c.header),
    rows.map((row) => columns.map((c) => c.value(row))),
  );
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
