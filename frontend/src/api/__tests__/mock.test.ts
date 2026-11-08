import { describe, expect, it } from 'vitest';
import { groupPeriods, ownershipEvents } from '@/lib/ownership';
import { sm3ToKboed } from '@/lib/units';
import { mockCore } from '../mock/core';
import { createMockExtras } from '../mock/extras';

const SVERDRUP = 26376286;
const extras = createMockExtras(mockCore);

describe('mock core', () => {
  it('is deterministic', async () => {
    const a = await mockCore.fieldProduction(SVERDRUP);
    const b = await mockCore.fieldProduction(SVERDRUP);
    expect(a).toEqual(b);
  });

  it('keeps oil + gas + NGL/condensate equal to total o.e.', async () => {
    for (const p of await mockCore.fieldProduction(SVERDRUP)) {
      expect(p.oilSm3 + p.gasOeSm3 + p.nglCondSm3).toBeCloseTo(p.oeSm3, 3);
    }
  });

  it('builds company production from fields × day-weighted shares', async () => {
    const [production, byField] = await Promise.all([
      mockCore.companyProduction('aker-bp'),
      mockCore.companyFields('aker-bp'),
    ]);
    const last = production[production.length - 1];
    if (!last) throw new Error('no production');
    const sum = byField.filter((r) => r.month === last.month).reduce((s, r) => s + r.oeSm3, 0);
    expect(sum).toBeCloseTo(last.oeSm3, 3);
  });

  it('day-weights the Lundin → Aker BP change of 30 June 2022', async () => {
    const rows = await mockCore.companyFields('aker-bp', {
      start: '2022-05-01',
      end: '2022-07-01',
    });
    const share = (month: string) =>
      rows.find((r) => r.fieldId === SVERDRUP && r.month === month)?.sharePct;
    expect(share('2022-05-01')).toBeCloseTo(11.5733, 4);
    // 29 days at 11.5733% and 1 day at 31.5733%
    expect(share('2022-06-01')).toBeCloseTo((29 * 11.5733 + 31.5733) / 30, 4);
    expect(share('2022-07-01')).toBeCloseTo(31.5733, 4);
  });

  it('turns ownership periods into readable events', async () => {
    const events = ownershipEvents(groupPeriods(await mockCore.fieldOwnership(SVERDRUP)));
    expect(events).toContainEqual({
      date: '2022-06-30',
      groupName: 'Aker BP',
      fromPct: 11.5733,
      toPct: 31.5733,
    });
    expect(events).toContainEqual({
      date: '2022-06-30',
      groupName: 'Lundin',
      fromPct: 20,
      toPct: 0,
    });
  });

  it('labels Equinor as NCS only', async () => {
    const companies = await mockCore.companies({ focus: true });
    expect(companies.map((c) => c.name)).toContain('Equinor (NCS only)');
  });

  it('rejects unknown ids like a 404', async () => {
    await expect(mockCore.field(1)).rejects.toMatchObject({ status: 404 });
  });
});

describe('mock extras', () => {
  it('starts the forecast where the history ends', async () => {
    const [history, forecast] = await Promise.all([
      mockCore.fieldProduction(SVERDRUP),
      extras.fieldForecast(SVERDRUP),
    ]);
    const last = history[history.length - 1];
    expect(forecast.points[0]).toMatchObject({ month: last?.month, p50: last?.oeSm3 });
    for (const p of forecast.points) {
      expect(p.p10).toBeLessThanOrEqual(p.p50);
      expect(p.p90).toBeGreaterThanOrEqual(p.p50);
    }
  });

  it('freezes nowcasts at quarter end and scores them on the trading update', async () => {
    const nowcasts = await extras.nowcasts();
    const aker = nowcasts.find((n) => n.companyId === 'aker-bp');
    expect(aker).toMatchObject({
      quarterStart: '2026-10-01',
      monthsInData: 0,
      reportKind: 'trading update',
    });
    expect(aker?.expectedReportOn).toBe('2027-01-14');
    expect(nowcasts.find((n) => n.companyId === 'var-energi')?.expectedReportOn).toBe('2027-01-12');
  });

  it('logs predictions with real reported values where they exist', async () => {
    const log = await extras.predictionLog();
    const akerQ2 = log.find((p) => p.companyId === 'aker-bp' && p.quarterStart === '2026-04-01');
    expect(akerQ2?.actual).toBe(383.6);
    expect(akerQ2?.madeAt).toBe('2026-06-30T23:59:00Z');
    expect(log.filter((p) => p.status === 'open')).toHaveLength(3);
  });

  it('keeps anomaly hits consistent with the gap and owner shares', async () => {
    const [goliat] = await extras.anomalies();
    const total = goliat?.hits.reduce((s, h) => s + h.kboed, 0) ?? 0;
    expect(total).toBeCloseTo((goliat?.actual ?? 0) - (goliat?.expected ?? 0), 6);
  });

  it('answers a known question and admits when it cannot', async () => {
    expect((await extras.ask('Who owns the most of Johan Castberg?')).matched).toBe(true);
    expect((await extras.ask('What is the meaning of life?')).matched).toBe(false);
  });

  it('keeps sample company rates in a realistic range', async () => {
    const [c] = await mockCore.companies({ focus: true });
    const latest = c?.latest;
    expect(latest && sm3ToKboed(latest.oeSm3, 31)).toBeGreaterThan(100);
  });
});
