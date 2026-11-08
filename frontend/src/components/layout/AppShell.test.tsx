import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { routes } from '@/routes';
import { useUnitStore } from '@/stores/unit';
import { lastLocation, renderWithProviders } from '@/test/render';

describe('AppShell', () => {
  it('renders navigation, the page title and the disclaimer footer', async () => {
    renderWithProviders(<div />, { routes, route: '/' });
    expect(
      await screen.findByRole('heading', { level: 1, name: /who produces what/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: 'Main' }).length).toBeGreaterThan(0);
    expect(screen.getByText(/not investment advice/i)).toBeInTheDocument();
  });

  it('toggles the theme class on <html> and reflects it with aria-pressed', async () => {
    renderWithProviders(<div />, { routes, route: '/' });
    const [toggle] = await screen.findAllByRole('button', { name: 'Dark mode' });
    if (!toggle) throw new Error('theme toggle missing');
    const before = toggle.getAttribute('aria-pressed');
    await userEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).not.toBe(before);
    expect(document.documentElement.className).toMatch(/t-(dark|light)/);
  });

  it('keeps the unit in the URL', async () => {
    useUnitStore.setState({ unit: 'boe' });
    renderWithProviders(<div />, { routes, route: '/' });
    const [group] = await screen.findAllByRole('group', { name: 'Units' });
    if (!group) throw new Error('unit toggle missing');
    await userEvent.click(within(group).getByRole('button', { name: 'Sm³ o.e.' }));
    expect(lastLocation.current?.search).toBe('?u=sm3');
    expect(useUnitStore.getState().unit).toBe('sm3');
    await userEvent.click(within(group).getByRole('button', { name: 'boe/d' }));
    expect(lastLocation.current?.search).toBe('');
  });
});
