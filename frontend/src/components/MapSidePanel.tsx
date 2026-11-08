import { useEffect } from 'react';
import { Link } from 'react-router';
import { formatMonth, formatMonthName, formatMonthShort, formatNumber } from '@/lib/format';
import { addMonths } from '@/lib/dates';
import { FieldStatusChip } from './Chips';
import { DeltaBadge } from './DeltaBadge';
import { Icon } from './Icon';
import { MiniStackedArea } from './MiniStackedArea';
import { OwnerBars } from './OwnerBars';
import { Skeleton } from './Skeleton';

export interface MapPanelField {
  id: number;
  name: string;
  status: string;
  mainArea: string;
  operatorName: string | null;
  /** 'Mainly oil', 'Gas and condensate', ... */
  productKind: string;
  discoveryYear?: number | null;
  areaKm2?: number | null;
  latest: { month: string; value: number; momPct: number | null; yoyPct: number | null } | null;
  /** Up to 36 months, oldest first, any consistent unit (shape only). */
  history?: { month: string; oil: number; gas: number; nglCond: number }[];
  owners?: { groupId: string; name: string; sharePct: number }[];
}

interface MapSidePanelProps {
  field: MapPanelField | null;
  /** Group ids that get emphasis in the owner bars. */
  focusCompanies: string[];
  onClose: () => void;
  unitLabel: string;
  format: (value: number) => string;
  detailHref: (id: number) => string;
  className?: string;
}

/**
 * Details for the field picked on the map. Announces changes politely, closes on Esc;
 * the map page returns focus to the marker or list row that opened it.
 */
export function MapSidePanel({
  field,
  focusCompanies,
  onClose,
  unitLabel,
  format,
  detailHref,
  className,
}: MapSidePanelProps) {
  useEffect(() => {
    if (!field) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [field, onClose]);

  return (
    <section
      className={`card flex flex-col ${className ?? ''}`}
      aria-live="polite"
      aria-label="Selected field"
    >
      {field ? (
        <PanelBody
          field={field}
          focusCompanies={focusCompanies}
          onClose={onClose}
          unitLabel={unitLabel}
          format={format}
          detailHref={detailHref}
        />
      ) : (
        <div className="flex flex-col gap-2 p-[18px]">
          <h2 className="m-0 text-h2">Pick a field</h2>
          <p className="m-0 text-[13px] text-muted">
            Click a circle on the map or a row in the list to see who owns the field and how much it
            produces.
          </p>
        </div>
      )}
    </section>
  );
}

function PanelBody({
  field,
  focusCompanies,
  onClose,
  unitLabel,
  format,
  detailHref,
}: Omit<MapSidePanelProps, 'field' | 'className'> & { field: MapPanelField }) {
  const facts = [
    field.mainArea,
    field.discoveryYear ? `discovered ${field.discoveryYear}` : null,
    field.areaKm2 ? `${formatNumber(field.areaKm2, 0)} km²` : null,
  ].filter(Boolean);
  const latest = field.latest;
  const history = field.history;

  return (
    <>
      <div className="flex flex-col gap-2.5 border-b border-line px-[18px] pb-3.5 pt-[18px]">
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="m-0 text-[20px] font-semibold tracking-[-0.01em]">{field.name}</h2>
            <span className="lbl">{facts.join(' · ')}</span>
          </div>
          <div className="flex items-center gap-2">
            <FieldStatusChip status={field.status} />
            <button
              type="button"
              className="ibtn h-9 w-9 max-nav:h-11 max-nav:w-11"
              aria-label="Close field panel"
              onClick={onClose}
            >
              <Icon name="close" />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {field.operatorName ? (
            <span className="chip">Operator · {field.operatorName}</span>
          ) : null}
          <span className="chip">{field.productKind}</span>
        </div>
      </div>

      {latest ? (
        <div className="grid grid-cols-3 gap-3 border-b border-line px-[18px] py-3.5">
          <div>
            <div className="lbl">{formatMonth(latest.month)}</div>
            <div className="num text-[20px] font-semibold">{format(latest.value)}</div>
            <div className="lbl text-[11px]">{unitLabel}</div>
          </div>
          <div>
            <div className="lbl">vs {formatMonthName(addMonths(latest.month, -1))}</div>
            <div className="mt-1">
              {latest.momPct === null ? (
                <span className="lbl">n/a</span>
              ) : (
                <DeltaBadge value={latest.momPct} />
              )}
            </div>
          </div>
          <div>
            <div className="lbl">vs {formatMonthShort(addMonths(latest.month, -12))}</div>
            <div className="mt-1">
              {latest.yoyPct === null ? (
                <span className="lbl">n/a</span>
              ) : (
                <DeltaBadge value={latest.yoyPct} />
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="m-0 border-b border-line px-[18px] py-3.5 text-[13px] text-muted">
          No recent production reported for this field.
        </p>
      )}

      <div className="flex flex-col gap-2 border-b border-line px-[18px] py-3.5">
        <div className="flex justify-between gap-2">
          <span className="cap">Last 36 months</span>
          <span className="lbl flex gap-2.5">
            <span className="flex items-center gap-1">
              <span className="dot bg-oil" />
              Oil
            </span>
            <span className="flex items-center gap-1">
              <span className="dot bg-gas" />
              Gas
            </span>
            <span className="flex items-center gap-1">
              <span className="dot bg-cond" />
              NGL + cond.
            </span>
          </span>
        </div>
        {history === undefined ? (
          <Skeleton height={90} />
        ) : history.length > 1 ? (
          <>
            <MiniStackedArea
              label={`${field.name} oil, gas and NGL plus condensate production over the last ${history.length} months`}
              series={[
                { key: 'oil', values: history.map((h) => h.oil), color: 'var(--oil)' },
                { key: 'gas', values: history.map((h) => h.gas), color: 'var(--gas)' },
                { key: 'cnd', values: history.map((h) => h.nglCond), color: 'var(--cnd)' },
              ]}
            />
            <div className="lbl flex justify-between text-[11px]">
              <span>{formatMonth(history[0]?.month ?? '')}</span>
              <span>{formatMonth(history[history.length - 1]?.month ?? '')}</span>
            </div>
          </>
        ) : (
          <p className="lbl m-0">No production history in this period.</p>
        )}
      </div>

      <div className="flex flex-col gap-2.5 px-[18px] py-3.5">
        <span className="cap">Who owns it</span>
        {field.owners === undefined ? (
          <>
            <Skeleton height={10} width="80%" />
            <Skeleton height={10} width="60%" />
          </>
        ) : (
          <OwnerBars
            owners={field.owners.map((o) => ({
              key: o.groupId,
              name: o.name,
              sharePct: o.sharePct,
              emphasis: focusCompanies.includes(o.groupId),
            }))}
          />
        )}
        <Link to={detailHref(field.id)} className="btn btn-primary mt-1.5 min-h-[40px]">
          Open field detail
        </Link>
      </div>
    </>
  );
}
