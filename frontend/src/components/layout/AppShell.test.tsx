import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { routes } from '@/routes';
import { useModeStore } from '@/stores/mode';
import { useUnitStore } from '@/stores/unit';
import { lastLocation, renderWithProviders } from '@/test/render';

afterEach(() => useModeStore.setState({ mode: 'simple' }));

describe('AppShell', () => {
  it('renders navigation, the landing title and the disclaimer footer', async () => {
    renderWithProviders(<div />, { routes, route: '/' });
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /million barrels of oil equivalent a day/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: 'Main' }).length).toBeGreaterThan(0);
    expect(screen.getByText('Not investment advice. Based on public data.')).toBeInTheDocument();
    // Tests run on mocks, so the footer says every number is sample data.
    expect(screen.getByText(/every number on this site is sample data/i)).toBeInTheDocument();
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

  it('keeps the unit in the URL, with plain labels in Simple words', async () => {
    useUnitStore.setState({ unit: 'boe' });
    renderWithProviders(<div />, { routes, route: '/' });
    const [group] = await screen.findAllByRole('group', { name: 'Units' });
    if (!group) throw new Error('unit toggle missing');
    await userEvent.click(within(group).getByRole('button', { name: 'm³' }));
    expect(lastLocation.current?.search).toBe('?u=sm3');
    expect(useUnitStore.getState().unit).toBe('sm3');
    await userEvent.click(within(group).getByRole('button', { name: 'Barrels' }));
    expect(lastLocation.current?.search).toBe('');
  });

  it('switches to Expert and back, and remembers the choice', async () => {
    renderWithProviders(<div />, { routes, route: '/' });
    const [group] = await screen.findAllByRole('group', { name: 'Words' });
    if (!group) throw new Error('mode switch missing');
    await userEvent.click(within(group).getByRole('button', { name: 'Expert' }));
    expect(useModeStore.getState().mode).toBe('expert');
    expect(window.localStorage.getItem('stakeflow-mode')).toBe('expert');
    const [units] = screen.getAllByRole('group', { name: 'Units' });
    expect(
      within(units ?? document.body).getByRole('button', { name: 'Sm³ o.e.' }),
    ).toBeInTheDocument();
  });
});
