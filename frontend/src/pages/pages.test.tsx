import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { routes } from '@/routes';
import { lastLocation, renderWithProviders } from '@/test/render';

describe('Company detail', () => {
  it('shows real reconciliation apart from the sample nowcast', async () => {
    renderWithProviders(<div />, { routes, route: '/companies/aker-bp' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Aker BP' })).toBeInTheDocument();
    const recon = screen.getByRole('region', { name: /public data vs reported/i });
    expect(within(recon).queryByText('Sample data')).toBeNull();
    const nowcast = screen.getByRole('region', { name: /nowcast vs reported/i });
    expect(within(nowcast).getByText('Sample data')).toBeInTheDocument();
  });

  it('recomputes the revenue estimate from the sliders and resets to forward prices', async () => {
    renderWithProviders(<div />, { routes, route: '/companies/aker-bp' });
    const brent = await screen.findByRole('slider', { name: 'Brent oil price' });
    const card = screen.getByRole('region', { name: /revenue estimate/i });
    const reset = within(card).getByRole('button', { name: 'Reset to forward prices' });
    expect(reset).toBeDisabled();
    // The headline total is the first dollar amount in the card; the split and maths follow.
    const total = () => within(card).getAllByText(/^\$[\d.,]+ (bn|m)$/)[0]?.textContent;
    const before = total();

    fireEvent.change(brent, { target: { value: '100' } });
    expect(total()).not.toBe(before);
    expect(within(card).getByText(/× \$100\.0 ×/)).toBeInTheDocument();
    expect(reset).toBeEnabled();

    await userEvent.click(reset);
    expect(total()).toBe(before);
  });

  it('never shortens Equinor to anything but "Equinor (NCS only)"', async () => {
    renderWithProviders(<div />, { routes, route: '/companies/equinor' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Equinor (NCS only)' }),
    ).toBeInTheDocument();
    const switcher = screen.getByRole('navigation', { name: 'Company' });
    expect(within(switcher).getByRole('link', { name: 'Equinor (NCS only)' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('says so when the company does not exist', async () => {
    renderWithProviders(<div />, { routes, route: '/companies/nope' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Company not found' }),
    ).toBeInTheDocument();
  });
});

describe('Track record', () => {
  it('lists reported quarters and filters by company through the URL', async () => {
    renderWithProviders(<div />, { routes, route: '/track-record' });
    const table = await screen.findByRole('table', {
      name: /sodir-attributed vs company-reported/i,
    });
    expect((await within(table).findAllByText('Aker BP')).length).toBeGreaterThan(0);
    expect(within(table).getAllByText('Vår Energi').length).toBeGreaterThan(0);

    const filter = screen.getByRole('group', { name: 'Company' });
    await userEvent.click(within(filter).getByRole('button', { name: 'Vår Energi' }));
    expect(lastLocation.current?.search).toContain('co=var-energi');
    expect(within(table).queryByText('Aker BP')).toBeNull();
  });

  it('marks the model section and the log as sample data', async () => {
    renderWithProviders(<div />, { routes, route: '/track-record?co=aker-bp' });
    const log = await screen.findByRole('table', { name: /prediction log/i });
    expect((await within(log).findAllByText('Open')).length).toBeGreaterThan(0);
    const logSection = screen.getByRole('region', { name: /prediction log/i });
    expect(within(logSection).getByText('Sample data')).toBeInTheDocument();
    expect(screen.queryByText(/24 ?h(ours)? before/i)).toBeNull();
  });
});
