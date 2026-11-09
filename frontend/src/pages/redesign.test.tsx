import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { routes } from '@/routes';
import { useModeStore } from '@/stores/mode';
import { renderWithProviders } from '@/test/render';

afterEach(() => {
  act(() => useModeStore.setState({ mode: 'simple' }));
});

describe('Landing (keynote)', () => {
  it('tells the story from the shelf summary: facts, race, honest track record', async () => {
    renderWithProviders(<div />, { routes, route: '/' });
    expect(await screen.findByRole('heading', { name: /three companies/i })).toBeInTheDocument();
    // Three plain-language facts, the homes one with its assumption spelled out.
    expect(await screen.findByText(/homes could be heated for a year/i)).toBeInTheDocument();
    expect(screen.getByText(/12,000 kWh of heat per home/)).toBeInTheDocument();
    // The race keeps Equinor's scope label whole.
    const race = screen.getByRole('heading', { name: /three companies/i }).closest('section');
    if (!race) throw new Error('race section missing');
    expect(
      await within(race).findByRole('link', { name: 'Equinor (NCS only)' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /an honest track record/i })).toBeInTheDocument();
  });
});

describe('Simple words and Expert', () => {
  it('explains the company in plain words, with plain units, only in Simple words', async () => {
    renderWithProviders(<div />, { routes, route: '/companies/aker-bp' });
    expect(await screen.findByRole('heading', { name: 'What it means' })).toBeInTheDocument();
    expect(screen.getAllByText('k barrels/day').length).toBeGreaterThan(0);
    expect(screen.queryByText('kboe/d')).toBeNull();

    act(() => useModeStore.setState({ mode: 'expert' }));
    expect(screen.queryByRole('heading', { name: 'What it means' })).toBeNull();
    expect(screen.getAllByText('kboe/d').length).toBeGreaterThan(0);
  });

  it('opens glossary definitions in both modes', async () => {
    renderWithProviders(<div />, { routes, route: '/fields/26376286' });
    const term = (await screen.findAllByRole('button', { name: 'decline' }))[0];
    if (!term) throw new Error('glossary term missing');
    await userEvent.click(term);
    expect(screen.getByRole('note')).toHaveTextContent(/pressure in the rock falls/i);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('note')).toBeNull();
  });
});
