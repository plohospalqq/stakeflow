import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { extras } from '@/api';
import { ApiError } from '@/api/http';
import { routes } from '@/routes';
import { renderWithProviders } from '@/test/render';

afterEach(() => vi.restoreAllMocks());

describe('Landing scenario teaser', () => {
  it('never passes for a forecast', async () => {
    renderWithProviders(<div />, { routes, route: '/' });
    expect((await screen.findAllByText(/scenario, not a forecast/i)).length).toBeGreaterThan(0);
  });
});

describe('Scenario explorer', () => {
  it('opens on a preset, shows the 80% range, the fit and the notice', async () => {
    renderWithProviders(<div />, { routes, route: '/scenarios' });
    const presets = await screen.findByRole('group', { name: 'Ready-made scenarios' });
    expect(within(presets).getByRole('button', { name: 'Oil −30%' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await screen.findByText(/modelled change −9\.\d%, 80% range/i)).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Oil price (Brent)' })).toHaveValue('-30');
    expect(screen.getByText('0.41')).toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: /scenario, not a forecast/i }),
    ).toBeInTheDocument();
  });

  it('applies a preset from the link and moves the sliders', async () => {
    renderWithProviders(<div />, { routes, route: '/scenarios?preset=gasUp&co=equinor' });
    await waitFor(() =>
      expect(screen.getByRole('slider', { name: 'Gas price (TTF)' })).toHaveValue('50'),
    );
    expect(screen.getByText(/equinor asa's, the whole group/i)).toBeInTheDocument();
  });

  it('turns free text into slider values', async () => {
    renderWithProviders(<div />, { routes, route: '/scenarios' });
    await userEvent.type(
      await screen.findByLabelText('Describe a scenario in your own words'),
      'oil drops 20% over 3 months',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Turn into a scenario' }));
    expect(await screen.findByText(/understood: oil −20%/i)).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Oil price (Brent)' })).toHaveValue('-20');
    expect(screen.getByRole('slider', { name: 'Time horizon' })).toHaveValue('3');
  });

  it('explains a 503 as AI not configured and points to the presets', async () => {
    vi.spyOn(extras, 'parseScenario').mockRejectedValue(new ApiError(503, '/scenarios/parse'));
    renderWithProviders(<div />, { routes, route: '/scenarios' });
    await userEvent.type(
      await screen.findByLabelText('Describe a scenario in your own words'),
      'oil drops 20%',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Turn into a scenario' }));
    expect(await screen.findByText(/ai is not configured on this server/i)).toBeInTheDocument();
  });
});
