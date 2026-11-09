/**
 * Canned answers for the Ask preview. The real feature will turn a question into read-only
 * SQL over the marts; until then a few example questions have pre-computed answers.
 *
 * The SQL shown is real: it runs as-is against the marts schema, and the rows, timings and
 * numbers below are its actual output for Sodir data through Aug 2026. Anything else gets an
 * honest "not yet" reply. Every follow-up offered is a question the preview can answer.
 */
import type { AskAnswer, AskPreviewReason, AskReply, AskTable } from '../types';

export const ASK_TABLES: AskTable[] = [
  {
    name: 'marts.fct_field_production_monthly',
    description: 'Oil, gas, NGL and condensate per field per month (Sodir, net)',
  },
  {
    name: 'marts.fct_company_field_production_monthly',
    description: 'Production net to each company, field by field, with day-weighted shares',
  },
  {
    name: 'marts.fct_group_production_monthly',
    description: 'Monthly production per company group (Aker BP, Vår Energi, …)',
  },
  {
    name: 'marts.fct_field_ownership',
    description: 'Who owns what share of each field, and from when to when',
  },
  {
    name: 'marts.fct_quarterly_reconciliation',
    description: 'Sodir-attributed vs company-reported production per quarter',
  },
  { name: 'marts.dim_field', description: 'Name, operator, area, status, discovery year' },
  { name: 'marts.dim_company_group', description: 'Company groups and their display names' },
];

export const GOOD_FIRST_QUESTIONS = [
  'Which Aker BP fields changed the most compared with a year ago?',
  'Who owns the most of Johan Castberg?',
  'Top 10 gas fields in 2025',
  "How has Vår Energi's oil share changed?",
  'Which fields are declining fastest?',
];

type Canned = Omit<AskAnswer, 'question' | 'matched' | 'followUps'> & {
  keywords: string[];
};

const CANNED: Canned[] = [
  {
    keywords: ['aker', 'year ago'],
    steps: [
      {
        label: 'Understood question',
        detail: 'Aker BP, net production by field, Jul–Aug 2026 vs Jul–Aug 2025',
      },
      {
        label: 'Found 2 tables',
        detail: 'fct_company_field_production_monthly, dim_field',
      },
      { label: 'Ran query', detail: '5 ms · 6 rows' },
      { label: 'Sanity check', detail: 'Field rows add up to the company total' },
    ],
    answer:
      'Johan Sverdrup fell the most (−36.7 kboe/d net to Aker BP) as the field comes off plateau, followed by Valhall (−8.0) and Alvheim (−5.9). Solveig grew the most (+6.5). Overall, Aker BP’s net production was 373.9 kboe/d in Jul–Aug 2026, down from 424.1 a year earlier (−12%).',
    sql: `WITH by_field AS (
    SELECT f.name AS field,
           SUM(p.oe_sm3) FILTER (WHERE p.month >= DATE '2026-07-01') * 6.2898 / 62 / 1000
               AS jul_aug_2026_kboe_d,
           SUM(p.oe_sm3) FILTER (WHERE p.month < DATE '2026-07-01') * 6.2898 / 62 / 1000
               AS jul_aug_2025_kboe_d
    FROM marts.fct_company_field_production_monthly p
    JOIN marts.dim_field f ON f.field_id = p.field_id
    WHERE p.group_id = 'aker-bp'
      AND p.month IN (DATE '2025-07-01', DATE '2025-08-01',
                      DATE '2026-07-01', DATE '2026-08-01')
    GROUP BY f.name
)
SELECT field, jul_aug_2026_kboe_d, jul_aug_2025_kboe_d,
       jul_aug_2026_kboe_d - jul_aug_2025_kboe_d AS change_kboe_d
FROM by_field
ORDER BY abs(jul_aug_2026_kboe_d - jul_aug_2025_kboe_d) DESC NULLS LAST
LIMIT 6;`,
    durationMs: 5,
    columns: ['Field', 'Jul–Aug 2026, kboe/d', 'Jul–Aug 2025, kboe/d', 'Change'],
    rows: [
      ['Johan Sverdrup', 195.9, 232.6, -36.7],
      ['Valhall', 29.4, 37.4, -8.0],
      ['Solveig', 21.3, 14.8, 6.5],
      ['Alvheim', 32.1, 38.0, -5.9],
      ['Edvard Grieg', 16.4, 21.7, -5.3],
      ['Tambar', 2.6, 6.0, -3.4],
    ],
    chart: [
      { label: 'Johan Sverdrup', value: 195.9, previous: 232.6 },
      { label: 'Valhall', value: 29.4, previous: 37.4 },
      { label: 'Solveig', value: 21.3, previous: 14.8 },
      { label: 'Alvheim', value: 32.1, previous: 38.0 },
      { label: 'Edvard Grieg', value: 16.4, previous: 21.7 },
      { label: 'Tambar', value: 2.6, previous: 6.0 },
    ],
    chartUnit: 'kboe/d',
    chartLegend: { current: 'Jul–Aug 2026', previous: 'Jul–Aug 2025' },
  },
  {
    keywords: ['castberg', 'owns'],
    steps: [
      { label: 'Understood question', detail: 'Current owners of Johan Castberg' },
      { label: 'Found 3 tables', detail: 'fct_field_ownership, dim_field, dim_company_group' },
      { label: 'Ran query', detail: '1 ms · 3 rows' },
      { label: 'Sanity check', detail: 'Shares add up to 100%' },
    ],
    answer:
      'Equinor (NCS only) owns the most of Johan Castberg with 46.3%, then Vår Energi with 30.0% and Petoro (the state’s direct interest) with 23.7%. Equinor is also the operator.',
    sql: `SELECT g.display_name AS owner, SUM(o.share_pct) AS share_pct
FROM marts.fct_field_ownership o
JOIN marts.dim_field f ON f.field_id = o.field_id
JOIN marts.dim_company_group g ON g.group_id = o.group_id
WHERE f.name = 'JOHAN CASTBERG' AND o.is_current
GROUP BY g.display_name
ORDER BY share_pct DESC;`,
    durationMs: 1,
    columns: ['Owner', 'Share, %'],
    rows: [
      ['Equinor (NCS only)', 46.3],
      ['Vår Energi', 30.0],
      ['Petoro (SDFI)', 23.7],
    ],
    chart: [
      { label: 'Equinor (NCS only)', value: 46.3, previous: null },
      { label: 'Vår Energi', value: 30.0, previous: null },
      { label: 'Petoro (SDFI)', value: 23.7, previous: null },
    ],
    chartUnit: '%',
    chartLegend: { current: 'Share today', previous: null },
  },
  {
    keywords: ['gas', 'top'],
    steps: [
      { label: 'Understood question', detail: 'Fields ranked by 2025 gas output' },
      { label: 'Found 2 tables', detail: 'fct_field_production_monthly, dim_field' },
      { label: 'Ran query', detail: '1 ms · 10 rows' },
      { label: 'Sanity check', detail: 'Gas in billion Sm³ of gas, not oil equivalent' },
    ],
    answer:
      'Troll is in a league of its own: 41.0 billion Sm³ of gas in 2025, more than the next five fields together (34.3). Ormen Lange, Oseberg, Aasta Hansteen and Skarv follow.',
    sql: `SELECT f.name AS field, SUM(p.gas_sm3) / 1e9 AS gas_bn_sm3
FROM marts.fct_field_production_monthly p
JOIN marts.dim_field f ON f.field_id = p.field_id
WHERE p.month BETWEEN DATE '2025-01-01' AND DATE '2025-12-01'
GROUP BY f.name
ORDER BY gas_bn_sm3 DESC
LIMIT 10;`,
    durationMs: 1,
    columns: ['Field', 'Gas 2025, bn Sm³'],
    rows: [
      ['Troll', 41.0],
      ['Ormen Lange', 7.7],
      ['Oseberg', 7.6],
      ['Aasta Hansteen', 7.0],
      ['Skarv', 6.2],
      ['Gullfaks Sør', 5.7],
      ['Visund', 5.1],
      ['Åsgard', 4.6],
      ['Snøhvit', 4.1],
      ['Tyrihans', 2.9],
    ],
    chart: [
      { label: 'Troll', value: 41.0, previous: null },
      { label: 'Ormen Lange', value: 7.7, previous: null },
      { label: 'Oseberg', value: 7.6, previous: null },
      { label: 'Aasta Hansteen', value: 7.0, previous: null },
      { label: 'Skarv', value: 6.2, previous: null },
      { label: 'Gullfaks Sør', value: 5.7, previous: null },
      { label: 'Visund', value: 5.1, previous: null },
      { label: 'Åsgard', value: 4.6, previous: null },
      { label: 'Snøhvit', value: 4.1, previous: null },
      { label: 'Tyrihans', value: 2.9, previous: null },
    ],
    chartUnit: 'bn Sm³',
    chartLegend: { current: '2025', previous: null },
  },
  {
    keywords: ['vår', 'oil share'],
    steps: [
      { label: 'Understood question', detail: 'Vår Energi oil share of net production, by year' },
      { label: 'Found 1 table', detail: 'fct_group_production_monthly' },
      { label: 'Ran query', detail: '1 ms · 6 rows' },
      { label: 'Sanity check', detail: 'Oil + gas + NGL/condensate = 100% each year' },
    ],
    answer:
      'Vår Energi has become more oil-weighted: oil was 59% of its net production in 2021 and about 65% in 2025 and 2026 so far (through August). The step up came in 2025, the year Johan Castberg started producing.',
    sql: `SELECT EXTRACT(year FROM month) AS year,
       SUM(oil_sm3) / SUM(oe_sm3) * 100 AS oil_share_pct
FROM marts.fct_group_production_monthly
WHERE group_id = 'var-energi' AND month >= DATE '2021-01-01'
GROUP BY 1
ORDER BY 1;`,
    durationMs: 1,
    columns: ['Year', 'Oil share, %'],
    rows: [
      ['2021', 58.9],
      ['2022', 58.4],
      ['2023', 60.7],
      ['2024', 58.9],
      ['2025', 65.6],
      ['2026', 64.9],
    ],
    chart: [
      { label: '2021', value: 58.9, previous: null },
      { label: '2022', value: 58.4, previous: null },
      { label: '2023', value: 60.7, previous: null },
      { label: '2024', value: 58.9, previous: null },
      { label: '2025', value: 65.6, previous: null },
      { label: '2026', value: 64.9, previous: null },
    ],
    chartUnit: '%',
    chartLegend: { current: 'Oil share', previous: null },
  },
  {
    keywords: ['declin', 'fastest'],
    steps: [
      {
        label: 'Understood question',
        detail: 'Largest drop, Aug 2026 vs Aug 2025, fields above 10 kboe/d a year ago',
      },
      { label: 'Found 2 tables', detail: 'fct_field_production_monthly, dim_field' },
      { label: 'Ran query', detail: '6 ms · 5 rows' },
      {
        label: 'Sanity check',
        detail: 'One month vs one month: maintenance can move a single month',
      },
    ],
    answer:
      'Gina Krog fell the most (−58% in August 2026 vs August 2025), then Kristin, Edvard Grieg, Ormen Lange and Tyrving. Johan Sverdrup is down a smaller 15%, but that is the largest drop in volume: −110 kboe/d.',
    sql: `WITH latest AS (SELECT MAX(month) AS m FROM marts.fct_field_production_monthly)
SELECT f.name AS field,
       (cur.boe_per_day / ago.boe_per_day - 1) * 100 AS change_pct
FROM latest
JOIN marts.fct_field_production_monthly cur ON cur.month = latest.m
JOIN marts.fct_field_production_monthly ago
  ON ago.field_id = cur.field_id
 AND ago.month = (latest.m - INTERVAL '12 months')::date
JOIN marts.dim_field f ON f.field_id = cur.field_id
WHERE ago.boe_per_day > 10000
ORDER BY change_pct
LIMIT 5;`,
    durationMs: 6,
    columns: ['Field', 'Change vs a year ago, %'],
    rows: [
      ['Gina Krog', -58.4],
      ['Kristin', -36.3],
      ['Edvard Grieg', -33.1],
      ['Ormen Lange', -29.4],
      ['Tyrving', -25.5],
    ],
    chart: [
      { label: 'Gina Krog', value: 58.4, previous: null },
      { label: 'Kristin', value: 36.3, previous: null },
      { label: 'Edvard Grieg', value: 33.1, previous: null },
      { label: 'Ormen Lange', value: 29.4, previous: null },
      { label: 'Tyrving', value: 25.5, previous: null },
    ],
    chartUnit: '% decline',
    chartLegend: { current: 'Decline vs a year ago', previous: null },
  },
];

function normalise(text: string): string {
  return text.toLocaleLowerCase('nb-NO').replace(/[’']/g, '');
}

function findCanned(question: string): Canned | undefined {
  const q = normalise(question);
  return CANNED.find((c) => c.keywords.every((k) => q.includes(normalise(k))));
}

/** Suggestions must never lead to a dead end, so they come only from answerable questions. */
function followUpsFor(current: Canned | undefined): string[] {
  return GOOD_FIRST_QUESTIONS.filter((q) => findCanned(q) !== current).slice(0, 3);
}

/** A prepared answer; `preview` says why one is shown instead of the model's. */
export function answerQuestion(question: string, preview: AskPreviewReason): AskReply {
  const match = findCanned(question);
  if (match) {
    const { keywords: _keywords, ...answer } = match;
    return { ...answer, question, matched: true, followUps: followUpsFor(match), preview };
  }
  return {
    question,
    matched: false,
    preview,
    steps: [
      { label: 'Understood question', detail: 'Not one the preview can answer yet' },
      { label: 'No query run', detail: 'Nothing was looked up' },
    ],
    answer:
      'This preview only answers a few example questions. Try one of the suggestions; free-form questions arrive when the backend can turn them into read-only SQL.',
    sql: '',
    durationMs: 0,
    columns: [],
    rows: [],
    chart: [],
    chartUnit: '',
    chartLegend: { current: '', previous: null },
    followUps: followUpsFor(undefined),
  };
}
