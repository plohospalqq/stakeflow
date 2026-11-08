import { Link } from 'react-router';
import { Page } from '@/components/layout/Page';

export default function NotFound() {
  return (
    <Page label="Not found" title="This page does not exist">
      <section className="card flex flex-col items-start gap-3 p-5">
        <p className="m-0 text-muted">The link may be old, or the field or company id is wrong.</p>
        <Link to="/" className="btn">
          Back to the overview
        </Link>
      </section>
    </Page>
  );
}
