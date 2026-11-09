import { useId, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useCompanies } from '@/api/hooks';
import { useCompanyName } from '@/hooks/useCompanyName';
import { useI18n } from '@/i18n/useI18n';
import { FOCUS_ORDER } from '@/lib/companies';

/**
 * Focus companies as links (switching company is navigation), the rest in a select.
 * The select only navigates on "Open": changing pages on every arrow key would be
 * hostile to keyboard users.
 */
export function CompanySwitcher({ current }: { current: string }) {
  const { m } = useI18n();
  const name = useCompanyName();
  const navigate = useNavigate();
  const companies = useCompanies(false);
  const selectId = useId();
  const others = (companies.data ?? []).filter((c) => !FOCUS_ORDER.includes(c.id) && c.latest);
  const [picked, setPicked] = useState('');
  const selected = others.some((c) => c.id === picked)
    ? picked
    : others.some((c) => c.id === current)
      ? current
      : '';

  const open = (e: FormEvent) => {
    e.preventDefault();
    if (selected && selected !== current) void navigate(`/companies/${selected}`);
  };

  return (
    <nav aria-label={m.company.switcher} className="flex flex-wrap items-center gap-2">
      <div className="inline-flex max-w-full flex-wrap gap-0.5 rounded-full bg-[color-mix(in_srgb,var(--tx)_7%,transparent)] p-[3px]">
        {FOCUS_ORDER.map((id) => {
          const on = id === current;
          return (
            <Link
              key={id}
              to={`/companies/${id}`}
              aria-current={on ? 'page' : undefined}
              className={`inline-flex min-h-[36px] items-center rounded-full px-3.5 text-[13.5px] font-medium no-underline max-nav:min-h-[44px] ${
                on
                  ? 'bg-surface text-ink shadow-[0_1px_3px_rgba(0,0,0,0.14)] [.t-dark_&]:bg-surface3'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {name(id)}
            </Link>
          );
        })}
      </div>
      <form onSubmit={open} className="flex items-center gap-1.5">
        <label htmlFor={selectId} className="sr-only">
          {m.company.otherCompany}
        </label>
        <select
          id={selectId}
          className="input max-w-[220px] text-[14px] max-nav:min-h-[44px]"
          value={selected}
          onChange={(e) => setPicked(e.target.value)}
          disabled={others.length === 0}
        >
          <option value="">{m.company.otherCompanies}</option>
          {others.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="submit" className="btn" disabled={!selected || selected === current}>
          {m.common.open}
        </button>
      </form>
    </nav>
  );
}
