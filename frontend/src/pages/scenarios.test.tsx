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
    expect(await within(presets).findByRole('button', { name: 'Oil −30%' })).toHaveAttribute(
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
    renderWithProviders(<div />, { routes, route: '/scenarios?preset=gas-spike&co=equinor' });
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
    vi.spyOn(extras, 'parseScenario').mockRejectedValue(
      new ApiError(503, '/scenarios/parse', 'llm_not_configured'),
    );
    renderWithProviders(<div />, { routes, route: '/scenarios' });
    await userEvent.type(
      await screen.findByLabelText('Describe a scenario in your own words'),
      'oil drops 20%',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Turn into a scenario' }));
    expect(await screen.findByText(/ai is not configured on this server/i)).toBeInTheDocument();
  });

  it('tells a down AI apart from a missing one', async () => {
    vi.spyOn(extras, 'parseScenario').mockRejectedValue(
      new ApiError(503, '/scenarios/parse', 'llm_unavailable'),
    );
    renderWithProviders(<div />, { routes, route: '/scenarios' });
    await userEvent.type(
      await screen.findByLabelText('Describe a scenario in your own words'),
      'oil drops 20%',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Turn into a scenario' }));
    expect(await screen.findByText(/the ai did not answer/i)).toBeInTheDocument();
  });

  it('sends the company and the latest price levels to the parser', async () => {
    const parse = vi.spyOn(extras, 'parseScenario');
    renderWithProviders(<div />, { routes, route: '/scenarios?co=var-energi' });
    await screen.findByText(/modelled change/i);
    await userEvent.type(
      await screen.findByLabelText('Describe a scenario in your own words'),
      'oil at $90',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Turn into a scenario' }));
    await waitFor(() =>
      expect(parse).toHaveBeenCalledWith('oil at $90', {
        companyId: 'var-energi',
        reference: { brentUsd: 68.4, ttfEurMwh: 31.2, eurusd: 1.16 },
      }),
    );
  });

  it('says why there is no result when the server has no model', async () => {
    vi.spyOn(extras, 'runScenario').mockRejectedValue(
      new ApiError(503, '/companies/aker-bp/scenario', null, 'No share prices imported.'),
    );
    renderWithProviders(<div />, { routes, route: '/scenarios' });
    expect(await screen.findByText(/no scenario model on this server yet/i)).toBeInTheDocument();
    expect(screen.getByText('No share prices imported.')).toBeInTheDocument();
  });
});
