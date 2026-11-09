import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { routes } from '@/routes';
import { useLangStore } from '@/stores/language';
import { renderWithProviders } from '@/test/render';

afterEach(() => {
  act(() => useLangStore.getState().setLang('en'));
});

describe('Languages', () => {
  it('switches the whole UI, <html lang> and the Equinor label', async () => {
    renderWithProviders(<div />, { routes, route: '/companies/equinor' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Equinor (NCS only)' }),
    ).toBeInTheDocument();
    const [group] = screen.getAllByRole('group', { name: 'Language' });
    if (!group) throw new Error('language switch missing');
    await userEvent.click(within(group).getByRole('button', { name: 'Українська' }));
    expect(document.documentElement.lang).toBe('uk');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Equinor (лише норвезький шельф)' }),
    ).toBeInTheDocument();
    act(() => useLangStore.getState().setLang('nb'));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Equinor (kun norsk sokkel)' }),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem('stakeflow-lang')).toBe('nb');
  });
});
