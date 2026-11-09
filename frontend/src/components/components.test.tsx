import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { ChartCard } from './ChartCard';
import { DataTable, type Column } from './DataTable';
import { DeltaBadge } from './DeltaBadge';
import { KpiCard } from './KpiCard';
import { MapSidePanel } from './MapSidePanel';

describe('DeltaBadge', () => {
  it('shows sign and arrow, green when the move is good', () => {
    const { container } = render(<DeltaBadge value={2.1} />);
    expect(screen.getByText('+2.1%')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.firstElementChild?.className).toContain('text-up');
  });

  it('treats a falling error as good news', () => {
    const { container } = render(<DeltaBadge value={-0.5} goodWhen="down" />);
    expect(screen.getByText('−0.5%')).toBeInTheDocument();
    expect(container.firstElementChild?.className).toContain('text-up');
  });

  it('renders tiny changes as flat, without an arrow', () => {
    const { container } = render(<DeltaBadge value={0.01} />);
    expect(screen.getByText('0.0%')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
  });
});

describe('KpiCard', () => {
  it('shows a busy skeleton while the value is null', () => {
    const { container } = renderWithProviders(
      <KpiCard label="Production" value={null} unit="kboe/d" format={String} />,
    );
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('shows value, unit and the sample badge', () => {
    renderWithProviders(
      <KpiCard label="Nowcast" value={381} unit="kboe/d" format={String} sample />,
    );
    // Visible (animated) copy plus a screen-reader copy of the final value.
    expect(screen.getAllByText('381')).toHaveLength(2);
    expect(screen.getByText('kboe/d')).toBeInTheDocument();
    expect(screen.getByText('Sample data')).toBeInTheDocument();
  });
});

interface Row {
  name: string;
  value: number;
}
const columns: Column<Row>[] = [
  { id: 'name', header: 'Field', value: (r) => r.name },
  { id: 'value', header: 'Production', value: (r) => r.value, align: 'right' },
];

describe('DataTable', () => {
  it('sorts by clicking a header and reports it with aria-sort', async () => {
    render(
      <DataTable
        caption="Fields"
        columns={columns}
        rows={[
          { name: 'Troll', value: 799 },
          { name: 'Alvheim', value: 60 },
          { name: 'Johan Sverdrup', value: 618 },
        ]}
        rowKey={(r) => r.name}
      />,
    );
    const header = screen.getByRole('columnheader', { name: /production/i });
    expect(header).toHaveAttribute('aria-sort', 'none');
    await userEvent.click(within(header).getByRole('button'));
    expect(header).toHaveAttribute('aria-sort', 'descending');
    const firstCells = screen
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.firstElementChild?.textContent);
    expect(firstCells).toEqual(['Troll', 'Johan Sverdrup', 'Alvheim']);
    await userEvent.click(within(header).getByRole('button'));
    expect(header).toHaveAttribute('aria-sort', 'ascending');
  });

  it('shows the empty state', () => {
    render(
      <DataTable
        caption="Fields"
        columns={columns}
        rows={[]}
        rowKey={(r) => r.name}
        empty="No fields"
      />,
    );
    expect(screen.getByText('No fields')).toBeInTheDocument();
  });
});

describe('ChartCard', () => {
  it('always shows the legend and the source, and can swap to a table', async () => {
    render(
      <ChartCard
        title="Production"
        subtitle="Monthly · kboe/d"
        legend={[{ label: 'Oil', color: 'var(--oil)' }]}
        source={{ label: 'Sodir', asOf: 'Aug 2026' }}
        table={<table aria-label="Production table" />}
      >
        <div>chart</div>
      </ChartCard>,
    );
    expect(screen.getByText('Oil')).toBeInTheDocument();
    expect(screen.getByText(/Source: Sodir · Aug 2026/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show as table' }));
    expect(screen.getByRole('table', { name: 'Production table' })).toBeInTheDocument();
  });

  it('offers a retry on error', async () => {
    const onRetry = vi.fn();
    render(
      <ChartCard
        title="X"
        subtitle="kboe/d"
        legend={[]}
        source={{ label: 'Sodir' }}
        state="error"
        onRetry={onRetry}
      >
        <div />
      </ChartCard>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('MapSidePanel', () => {
  it('asks to pick a field when nothing is selected', () => {
    renderWithProviders(
      <MapSidePanel
        field={null}
        focusCompanies={[]}
        onClose={() => undefined}
        unitLabel="kboe/d"
        format={String}
        detailHref={(id) => `/fields/${id}`}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Pick a field' })).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <MapSidePanel
        field={{
          id: 1,
          name: 'Troll',
          status: 'Producing',
          mainArea: 'North sea',
          operatorName: 'Equinor (NCS only)',
          productKind: 'Mainly gas',
          productColor: 'var(--gas)',
          latest: null,
          history: [],
          owners: [{ groupId: 'equinor', name: 'Equinor (NCS only)', sharePct: 30.58 }],
        }}
        focusCompanies={['equinor']}
        onClose={onClose}
        unitLabel="kboe/d"
        format={String}
        detailHref={(id) => `/fields/${id}`}
      />,
    );
    expect(screen.getByRole('link', { name: 'Open field detail' })).toHaveAttribute(
      'href',
      '/fields/1',
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });
});
