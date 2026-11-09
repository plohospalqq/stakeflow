import { DATA_SOURCE } from '@/api/mode';
import { useI18n } from '@/i18n/useI18n';
import { LogoMark } from './Logo';

/** Which numbers are real in this build, and where every number comes from. */
function DataNote() {
  const { m } = useI18n();
  if (DATA_SOURCE === 'mocks') {
    return (
      <>
        <strong className="font-semibold text-warn-ink">{m.footer.mockLabel}</strong>{' '}
        {m.footer.mockText}
      </>
    );
  }
  if (DATA_SOURCE === 'static') {
    return (
      <>
        {m.footer.staticLive}{' '}
        <strong className="font-semibold text-ink">{m.footer.sampleLabel}</strong>{' '}
        {m.footer.staticSample}
      </>
    );
  }
  return <>{m.footer.live}</>;
}

export function Footer() {
  const { m } = useI18n();
  const [before, after] = m.footer.licence.split('{licence}');
  return (
    <footer className="mx-auto mt-auto w-[min(1320px,calc(100%-32px))] border-t border-line pb-8 pt-6 text-[12.5px] text-muted">
      <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-3">
        <p className="m-0 flex max-w-[720px] gap-3">
          <LogoMark size={20} />
          <span>
            <strong className="font-semibold text-ink">{m.footer.notAdvice}</strong> {before}
            <a
              className="underline underline-offset-2 hover:text-ink"
              href="https://data.norge.no/nlod/en/2.0"
            >
              {m.footer.licenceName}
            </a>
            {after}
          </span>
        </p>
        <div className="flex max-w-[520px] flex-col gap-2">
          <p className="m-0">
            <DataNote />
          </p>
          <p className="m-0">
            <strong className="font-semibold text-ink">{m.footer.sourcesLabel}</strong>{' '}
            {m.footer.sources} {m.footer.shares}
          </p>
        </div>
      </div>
    </footer>
  );
}
