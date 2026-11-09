import { useReveal } from '@/hooks/useMotion';
import { formatNumber } from '@/lib/format';

export interface OwnerShare {
  key: string;
  name: string;
  sharePct: number;
  /** Focus companies get bold text and the bright bar. */
  emphasis: boolean;
}

/** Owner shares as bars that grow when they come into view; complete at rest. */
export function OwnerBars({ owners }: { owners: OwnerShare[] }) {
  const [ref, reveal] = useReveal<HTMLUListElement>();
  return (
    <ul ref={ref} data-reveal={reveal} className="m-0 flex list-none flex-col gap-3 p-0">
      {owners.map((o, i) => (
        <li key={o.key} className="flex flex-col gap-1.5">
          {/* Names wrap, never truncate: "Equinor (NCS only)" must always be readable. */}
          <span className="flex justify-between gap-3 text-[14px]">
            <span className={`min-w-0 break-words ${o.emphasis ? 'font-semibold' : ''}`}>
              {o.name}
            </span>
            <span className="num flex-none">{formatNumber(o.sharePct, 2)}%</span>
          </span>
          <span className="block h-1.5 overflow-hidden rounded-full bg-surface3" aria-hidden="true">
            <span
              className="grow-x block h-1.5 origin-left rounded-full"
              style={{
                width: `${Math.min(100, o.sharePct)}%`,
                background: o.emphasis ? 'var(--fc)' : 'var(--fa)',
                '--i': i,
              }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}
