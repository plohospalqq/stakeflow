import type { MouseEvent } from 'react';
import { Skeleton } from '@/components/Skeleton';
import { oilShareColor } from '@/lib/mapScale';

export interface FieldListRow {
  id: number;
  name: string;
  operatorName: string | null;
  /** Latest month in the display unit. */
  value: number;
  oilShare: number;
}

interface FieldListProps {
  rows: FieldListRow[];
  loading: boolean;
  selectedId: number | null;
  onSelect: (id: number, opener: HTMLElement) => void;
  format: (value: number) => string;
  unitLabel: string;
  /** e.g. "38 fields owned by Aker BP" */
  summary: string;
}

/**
 * The keyboard and screen-reader way into the map: every field on the map is a button
 * here, largest first. Picking one opens the side panel and flies the map to it.
 */
export function FieldList({
  rows,
  loading,
  selectedId,
  onSelect,
  format,
  unitLabel,
  summary,
}: FieldListProps) {
  return (
    <section className="card flex min-w-0 flex-col p-2" aria-labelledby="fl-map-h">
      <div className="flex items-baseline justify-between gap-2 px-2.5 py-2">
        <h2 id="fl-map-h" className="m-0 text-[13px] font-semibold">
          Fields by production
        </h2>
        <span className="lbl">{unitLabel}</span>
      </div>
      <p className="lbl m-0 px-2.5 pb-1.5">{summary}</p>
      <div className="max-h-[440px] overflow-y-auto">
        {loading ? (
          <div className="flex flex-col gap-2 p-2.5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={14} />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="m-0 px-2.5 py-4 text-[13px] text-muted">No field matches.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {rows.map((r) => {
              const on = r.id === selectedId;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    data-field-id={r.id}
                    aria-pressed={on}
                    onClick={(e: MouseEvent<HTMLButtonElement>) => onSelect(r.id, e.currentTarget)}
                    className={`flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] max-nav:min-h-[44px] ${
                      on ? 'bg-surface3 font-semibold' : 'hover:bg-surface2'
                    }`}
                  >
                    <span
                      className="h-2.5 w-2.5 flex-none rounded-full"
                      style={{ background: oilShareColor(r.oilShare) }}
                      aria-hidden="true"
                    />
                    {/* Operator under the name: company names wrap, never truncate. */}
                    <span className="flex min-w-0 flex-1 flex-col py-1">
                      <span>{r.name}</span>
                      {r.operatorName ? (
                        <span className="lbl font-normal">{r.operatorName}</span>
                      ) : null}
                    </span>
                    <span className="num w-14 flex-none text-right">{format(r.value)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
