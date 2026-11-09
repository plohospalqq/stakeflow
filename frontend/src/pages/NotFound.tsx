import { Link } from 'react-router';
import { Page } from '@/components/layout/Page';
import { useI18n } from '@/i18n/useI18n';

export default function NotFound() {
  const { m } = useI18n();
  return (
    <Page label="404" title={m.notFound.title} hideFreshness>
      <section className="card flex flex-col items-start gap-4 p-6">
        <p className="m-0 text-[16px] text-muted">{m.notFound.text}</p>
        <Link to="/" className="btn btn-primary">
          {m.notFound.home}
        </Link>
      </section>
    </Page>
  );
}
