import { formatNumber } from '@/lib/format';

export interface OwnerShare {
  key: string;
  name: string;
  sharePct: number;
  /** Focus companies get bold text and the bright bar. */
  emphasis: boolean;
}

export function OwnerBars({ owners }: { owners: OwnerShare[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {owners.map((o) => (
        <li key={o.key} className="flex flex-col gap-1">
          <span className="flex justify-between gap-3 text-[13px]">
            <span className={o.emphasis ? 'font-semibold' : ''}>{o.name}</span>
            <span className="num">{formatNumber(o.sharePct, 2)}%</span>
          </span>
          <span className="block h-1.5 rounded-[3px] bg-surface3" aria-hidden="true">
            <span
              className="block h-1.5 rounded-[3px]"
              style={{
                width: `${Math.min(100, o.sharePct)}%`,
                background: o.emphasis ? 'var(--fc)' : 'var(--fa)',
              }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}
