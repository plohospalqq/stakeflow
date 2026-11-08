import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useMemo, useState, type ReactNode } from 'react';
import { Skeleton } from './Skeleton';

export interface Column<T> {
  id: string;
  header: ReactNode;
  /** Plain-text header for CSV export when `header` is not a string. */
  headerText?: string;
  /** Raw value: used for sorting and CSV. */
  value: (row: T) => string | number | null;
  /** Rendered cell; defaults to the raw value. */
  cell?: (row: T) => ReactNode;
  /** Numbers are right-aligned. */
  align?: 'left' | 'right';
  sortable?: boolean;
  width?: number | string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  /** Read by screen readers; describes what the table lists. */
  caption: string;
  rowKey: (row: T) => string;
  initialSort?: { id: string; desc: boolean };
  /** Mouse convenience only: keyboard users use the link inside the row. */
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  dense?: boolean;
  loading?: boolean;
  /** Enables a vertical scroll area with a sticky header. */
  maxHeight?: number;
  rowClassName?: (row: T) => string | undefined;
}

export function DataTable<T>({
  columns,
  rows,
  caption,
  rowKey,
  initialSort,
  onRowClick,
  empty = 'Nothing to show.',
  dense = false,
  loading = false,
  maxHeight,
  rowClassName,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSort ? [initialSort] : []);

  const columnDefs = useMemo<ColumnDef<T, string | number | undefined>[]>(
    () =>
      columns.map((c) => ({
        id: c.id,
        accessorFn: (row: T) => c.value(row) ?? undefined,
        header: () => c.header,
        cell: (ctx) => (c.cell ? c.cell(ctx.row.original) : ctx.getValue()),
        enableSorting: c.sortable !== false,
        sortDescFirst: c.align === 'right',
        sortUndefined: 'last',
      })),
    [columns],
  );

  const table = useReactTable({
    data: rows,
    columns: columnDefs,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: rowKey,
  });

  const pad = dense ? 'px-3 py-1.5' : 'px-3 py-2.5';
  const alignOf = (id: string) =>
    columns.find((c) => c.id === id)?.align === 'right' ? 'text-right' : 'text-left';
  const widthOf = (id: string) => columns.find((c) => c.id === id)?.width;

  return (
    <div
      // relative: makes this the containing block of sr-only (absolute) text in cells,
      // otherwise that text escapes the scroll clip and widens the whole page.
      className="relative overflow-x-auto"
      style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}
      // Scrollable regions must be reachable by keyboard.
      tabIndex={maxHeight ? 0 : undefined}
      role={maxHeight ? 'region' : undefined}
      aria-label={maxHeight ? caption : undefined}
    >
      <table className="w-full border-collapse text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                const canSort = header.column.getCanSort();
                const content = flexRender(header.column.columnDef.header, header.getContext());
                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={
                      canSort
                        ? sorted === 'asc'
                          ? 'ascending'
                          : sorted === 'desc'
                            ? 'descending'
                            : 'none'
                        : undefined
                    }
                    className={`sticky top-0 z-[1] whitespace-nowrap border-b border-line bg-surface text-[12px] font-medium ${alignOf(header.column.id)} ${
                      sorted ? 'text-ink' : 'text-muted'
                    } ${canSort ? 'px-1.5 py-1' : pad}`}
                    style={{ width: widthOf(header.column.id) }}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={`inline-flex min-h-[32px] w-full items-center gap-1 rounded-md px-1.5 hover:text-ink ${
                          alignOf(header.column.id) === 'text-right' ? 'justify-end' : ''
                        }`}
                      >
                        {content}
                        <span aria-hidden="true" className="w-2.5 text-[11px]">
                          {sorted === 'asc' ? '↑' : sorted === 'desc' ? '↓' : ''}
                        </span>
                      </button>
                    ) : (
                      content
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 5 }, (_, i) => (
                <tr key={i} aria-hidden="true">
                  {columns.map((c) => (
                    <td key={c.id} className={`${pad} border-b border-line`}>
                      <Skeleton height={10} width={c.align === 'right' ? '60%' : '80%'} />
                    </td>
                  ))}
                </tr>
              ))
            : null}
          {!loading && rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={`${pad} py-6 text-center text-muted`}>
                {empty}
              </td>
            </tr>
          ) : null}
          {!loading
            ? table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={`hover:bg-surface2 [&:last-child>td]:border-b-0 ${onRowClick ? 'cursor-pointer' : ''} ${rowClassName?.(row.original) ?? ''}`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={`${pad} whitespace-nowrap border-b border-line ${alignOf(cell.column.id)} ${
                        columns.find((c) => c.id === cell.column.id)?.align === 'right' ? 'num' : ''
                      }`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            : null}
        </tbody>
      </table>
    </div>
  );
}
