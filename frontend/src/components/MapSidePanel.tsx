import { useEffect } from 'react';
import { Link } from 'react-router';
import { useCompanyName } from '@/hooks/useCompanyName';
import { useI18n } from '@/i18n/useI18n';
import { addMonths } from '@/lib/dates';
import { formatMonth, formatMonthName, formatMonthShort, formatNumber } from '@/lib/format';
import { CountUp } from './CountUp';
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
  /** Localised product kind, e.g. 'Mainly oil'. */
  productKind: string;
  /** Colour of the dominant product, for the eyebrow; null for mixed fields. */
  productColor: string | null;
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
 * Details for the field picked on the map, as a floating glass card. Announces changes
 * politely and closes on Esc; the map page returns focus to the marker or list row that
 * opened it.
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
  const { m } = useI18n();
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
      className={`glass flex flex-col rounded-[24px] ${className ?? ''}`}
      aria-live="polite"
      aria-label={m.map.panel}
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
        <div className="flex flex-col gap-2 p-5">
          <h2 className="display m-0 text-h2 font-semibold">{m.map.pick}</h2>
          <p className="m-0 text-[14px] text-muted">{m.map.pickText}</p>
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
  const { m, t } = useI18n();
  const name = useCompanyName();
  const facts = [
    field.mainArea,
    field.discoveryYear ? t(m.map.discovered, { year: field.discoveryYear }) : null,
    field.areaKm2 ? `${formatNumber(field.areaKm2, 0)} km²` : null,
  ].filter(Boolean);
  const latest = field.latest;
  const history = field.history;

  return (
    <>
      <div className="flex flex-col gap-1 px-5 pb-3 pt-5">
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span
              className="text-[12px] font-semibold uppercase tracking-[0.06em]"
              style={{
                color: field.productColor
                  ? `color-mix(in srgb, ${field.productColor} 70%, var(--tx))`
                  : 'var(--mu)',
              }}
            >
              {field.productKind}
            </span>
            <h2 className="display m-0 break-words text-[30px] font-bold leading-[1.05] tracking-[-0.035em]">
              {field.name}
            </h2>
            <span className="lbl">{facts.join(' · ')}</span>
          </div>
          <button
            type="button"
            className="ibtn h-9 w-9 flex-none bg-[color-mix(in_srgb,var(--tx)_8%,transparent)] max-nav:h-11 max-nav:w-11"
            aria-label={m.map.closePanel}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <FieldStatusChip status={field.status} />
          {field.operatorName ? (
            <span className="chip">{t(m.common.operatorNamed, { name: field.operatorName })}</span>
          ) : null}
        </div>
      </div>

      {latest ? (
        <div className="flex flex-col gap-2 px-5 pb-4">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <CountUp
              value={latest.value}
              format={format}
              duration={900}
              className="display num text-[52px] font-extrabold leading-none tracking-[-0.05em]"
            />
            <span className="text-[15px] font-semibold text-muted">{unitLabel}</span>
          </span>
          <span className="lbl">{formatMonth(latest.month)}</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
            <span className="flex items-center gap-1.5">
              {latest.momPct === null ? (
                m.common.notAvailable
              ) : (
                <DeltaBadge value={latest.momPct} />
              )}
              {t(m.common.vsMonth, { month: formatMonthName(addMonths(latest.month, -1)) })}
            </span>
            <span className="flex items-center gap-1.5">
              {latest.yoyPct === null ? (
                m.common.notAvailable
              ) : (
                <DeltaBadge value={latest.yoyPct} />
              )}
              {t(m.common.vsMonth, { month: formatMonthShort(addMonths(latest.month, -12)) })}
            </span>
          </div>
        </div>
      ) : (
        <p className="m-0 px-5 pb-4 text-[14px] text-muted">{m.map.noRecent}</p>
      )}

      <div className="flex flex-col gap-2 border-t border-line px-5 py-3.5">
        <div className="flex flex-wrap justify-between gap-2">
          <span className="cap">{m.map.last36}</span>
          <span className="lbl flex gap-2.5 text-[12px]">
            <span className="flex items-center gap-1">
              <span className="dot bg-oil" />
              {m.products.oil}
            </span>
            <span className="flex items-center gap-1">
              <span className="dot bg-gas" />
              {m.products.gas}
            </span>
            <span className="flex items-center gap-1">
              <span className="dot bg-cond" />
              {m.products.nglCondShort}
            </span>
          </span>
        </div>
        {history === undefined ? (
          <Skeleton height={80} />
        ) : history.length > 1 ? (
          <>
            <MiniStackedArea
              height={80}
              label={t(m.map.historyAria, { field: field.name, n: history.length })}
              series={[
                { key: 'oil', values: history.map((h) => h.oil), color: 'var(--oil)' },
                { key: 'gas', values: history.map((h) => h.gas), color: 'var(--gas)' },
                { key: 'cnd', values: history.map((h) => h.nglCond), color: 'var(--cnd)' },
              ]}
            />
            <div className="lbl flex justify-between text-[11.5px]">
              <span>{formatMonth(history[0]?.month ?? '')}</span>
              <span>{formatMonth(history[history.length - 1]?.month ?? '')}</span>
            </div>
          </>
        ) : (
          <p className="lbl m-0">{m.map.noHistory}</p>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-line px-5 pb-5 pt-3.5">
        <span className="cap">{m.map.owners}</span>
        {field.owners === undefined ? (
          <>
            <Skeleton height={10} width="80%" />
            <Skeleton height={10} width="60%" />
          </>
        ) : (
          <OwnerBars
            owners={field.owners.map((o) => ({
              key: o.groupId,
              name: name(o.groupId, o.name),
              sharePct: o.sharePct,
              emphasis: focusCompanies.includes(o.groupId),
            }))}
          />
        )}
        <Link to={detailHref(field.id)} className="btn btn-primary mt-1">
          {m.map.openDetail}
        </Link>
      </div>
    </>
  );
}
