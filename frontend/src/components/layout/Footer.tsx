import { SAMPLE_PARTS_TEXT, USE_MOCKS } from '@/api/mode';

export function Footer() {
  return (
    <footer className="mt-auto flex flex-wrap justify-between gap-x-6 gap-y-2 border-t border-line px-4 py-[18px] text-[12px] text-muted nav:px-8">
      <p className="m-0 max-w-[720px]">
        <strong className="font-semibold text-ink">
          Not investment advice. Based on public data.
        </strong>{' '}
        Production and licences: Norwegian Offshore Directorate (Sodir), under the{' '}
        <a className="underline underline-offset-2" href="https://data.norge.no/nlod/en/2.0">
          Norwegian Licence for Open Government Data (NLOD)
        </a>
        . Company figures cover the Norwegian shelf only.
      </p>
      <p className="m-0 max-w-[560px]">
        {USE_MOCKS ? (
          <>
            <strong className="font-semibold text-warn">Mock mode:</strong> every number on this
            site is sample data.
          </>
        ) : (
          <>
            Live: production, ownership and reported quarters.{' '}
            <strong className="font-semibold text-ink">Sample data:</strong> {SAMPLE_PARTS_TEXT}.
          </>
        )}
      </p>
    </footer>
  );
}
