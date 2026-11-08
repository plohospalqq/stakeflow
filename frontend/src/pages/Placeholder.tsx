import { Page } from '@/components/layout/Page';

/** Stand-in while a screen is being built in a later phase. */
export default function Placeholder({ label, title }: { label: string; title: string }) {
  return (
    <Page label={label} title={title}>
      <section className="card p-5">
        <p className="m-0 text-muted">This screen arrives in a later build phase.</p>
      </section>
    </Page>
  );
}
