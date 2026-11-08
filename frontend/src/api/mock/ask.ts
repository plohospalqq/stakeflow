/**
 * Canned answers for the Ask preview. The real feature will turn a question into
 * read-only SQL over the marts; until then a few questions have hand-written answers with
 * sample numbers, and anything else gets an honest "not yet" reply.
 */
import type { AskAnswer, AskTable } from '../types';

export const ASK_TABLES: AskTable[] = [
  {
    name: 'marts.fct_field_production_monthly',
    description: 'Oil, gas, NGL and condensate per field per month (Sodir, net)',
  },
  {
    name: 'marts.fct_company_production_monthly',
    description: 'Production net to each company, field by field, day-weighted shares',
  },
  {
    name: 'marts.fct_field_ownership',
    description: 'Who owns what share of each field, and from when to when',
  },
  { name: 'marts.dim_field', description: 'Name, operator, area, status, discovery year' },
  { name: 'marts.dim_company', description: 'Companies, legal entities and their group' },
];

export const GOOD_FIRST_QUESTIONS = [
  'Which Aker BP fields grew the most compared with a year ago?',
  'Who owns the most of Johan Castberg?',
  'Top 10 gas fields in 2025',
  "How has Vår Energi's oil share changed?",
  'Which fields are declining fastest?',
];

type Canned = Omit<AskAnswer, 'question' | 'matched'> & { keywords: string[] };

const CANNED: Canned[] = [
  {
    keywords: ['aker', 'grew'],
    steps: [
      {
        label: 'Understood question',
        detail: 'Aker BP, net production by field, Jul–Aug 2026 vs Jul–Aug 2025',
      },
      { label: 'Found 3 tables', detail: 'fct_company_production_monthly, dim_field, dim_company' },
      { label: 'Ran query', detail: '38 ms · 6 rows' },
      { label: 'Sanity check', detail: 'Field rows add up to the company total' },
    ],
    answer:
      'Valhall grew the most (+6.1 kboe/d, +21%), followed by Skarv (+2.4). Johan Sverdrup fell the most (−34.9, −15%) as the field comes off plateau, so Aker BP’s net production is down on a year ago overall.',
    sql: `SELECT f.name AS field,
       SUM(CASE WHEN p.month BETWEEN DATE '2026-07-01' AND DATE '2026-08-01'
                THEN p.oe_sm3 END) * 6.2898 / 62 / 1000 AS jul_aug_2026_kboe_d,
       SUM(CASE WHEN p.month BETWEEN DATE '2025-07-01' AND DATE '2025-08-01'
                THEN p.oe_sm3 END) * 6.2898 / 62 / 1000 AS jul_aug_2025_kboe_d
FROM marts.fct_company_production_monthly p
JOIN marts.dim_field f ON f.field_id = p.field_id
JOIN marts.dim_company c ON c.company_id = p.company_id
WHERE c.group_name = 'Aker BP'
GROUP BY f.name
ORDER BY jul_aug_2026_kboe_d - jul_aug_2025_kboe_d DESC
LIMIT 6;`,
    durationMs: 38,
    columns: ['Field', 'Jul–Aug 2026, kboe/d', 'Jul–Aug 2025, kboe/d', 'Change'],
    rows: [
      ['Valhall', 35.1, 29.0, 6.1],
      ['Skarv', 28.2, 25.8, 2.4],
      ['Alvheim', 30.1, 29.5, 0.6],
      ['Ivar Aasen', 11.9, 13.1, -1.2],
      ['Edvard Grieg', 15.9, 23.7, -7.8],
      ['Johan Sverdrup', 195.2, 230.1, -34.9],
    ],
    chart: [
      { label: 'Valhall', value: 35.1, previous: 29.0 },
      { label: 'Skarv', value: 28.2, previous: 25.8 },
      { label: 'Alvheim', value: 30.1, previous: 29.5 },
      { label: 'Ivar Aasen', value: 11.9, previous: 13.1 },
      { label: 'Edvard Grieg', value: 15.9, previous: 23.7 },
      { label: 'Johan Sverdrup', value: 195.2, previous: 230.1 },
    ],
    chartUnit: 'kboe/d',
    chartLegend: { current: 'Jul–Aug 2026', previous: 'Jul–Aug 2025' },
    followUps: [
      'Why did Johan Sverdrup decline?',
      'Show the same for Vår Energi',
      'Plot Valhall monthly since 2023',
    ],
  },
  {
    keywords: ['castberg', 'owns'],
    steps: [
      { label: 'Understood question', detail: 'Current owners of Johan Castberg' },
      { label: 'Found 2 tables', detail: 'fct_field_ownership, dim_company' },
      { label: 'Ran query', detail: '12 ms · 3 rows' },
      { label: 'Sanity check', detail: 'Shares add up to 100%' },
    ],
    answer:
      'Equinor (NCS only) owns the most of Johan Castberg with 46.3%, then Vår Energi with 30.0% and Petoro (the state’s direct interest) with 23.7%. Equinor is also the operator.',
    sql: `SELECT c.group_name AS owner, o.share_pct
FROM marts.fct_field_ownership o
JOIN marts.dim_field f ON f.field_id = o.field_id
JOIN marts.dim_company c ON c.company_id = o.company_id
WHERE f.name = 'JOHAN CASTBERG' AND o.is_current
ORDER BY o.share_pct DESC;`,
    durationMs: 12,
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
    followUps: [
      'How much does Vår Energi get from Johan Castberg?',
      'When did Johan Castberg start producing?',
    ],
  },
  {
    keywords: ['gas', 'top'],
    steps: [
      { label: 'Understood question', detail: 'Fields ranked by 2025 gas output' },
      { label: 'Found 2 tables', detail: 'fct_field_production_monthly, dim_field' },
      { label: 'Ran query', detail: '24 ms · 10 rows' },
      { label: 'Sanity check', detail: 'Gas converted at 1,000 Sm³ gas = 1 Sm³ o.e.' },
    ],
    answer:
      'Troll is in a league of its own: it produced more gas in 2025 than the next five fields together. Oseberg, Snøhvit, Ormen Lange and Åsgard follow.',
    sql: `SELECT f.name AS field, SUM(p.gas_sm3) / 1e9 AS gas_bn_sm3
FROM marts.fct_field_production_monthly p
JOIN marts.dim_field f ON f.field_id = p.field_id
WHERE p.month BETWEEN DATE '2025-01-01' AND DATE '2025-12-01'
GROUP BY f.name
ORDER BY gas_bn_sm3 DESC
LIMIT 10;`,
    durationMs: 24,
    columns: ['Field', 'Gas 2025, bn Sm³'],
    rows: [
      ['Troll', 36.1],
      ['Oseberg', 7.4],
      ['Snøhvit', 6.1],
      ['Ormen Lange', 5.9],
      ['Åsgard', 4.6],
      ['Aasta Hansteen', 4.4],
      ['Gullfaks Sør', 3.9],
      ['Visund', 3.6],
      ['Skarv', 3.4],
      ['Halten Øst', 2.1],
    ],
    chart: [
      { label: 'Troll', value: 36.1, previous: null },
      { label: 'Oseberg', value: 7.4, previous: null },
      { label: 'Snøhvit', value: 6.1, previous: null },
      { label: 'Ormen Lange', value: 5.9, previous: null },
      { label: 'Åsgard', value: 4.6, previous: null },
      { label: 'Aasta Hansteen', value: 4.4, previous: null },
      { label: 'Gullfaks Sør', value: 3.9, previous: null },
      { label: 'Visund', value: 3.6, previous: null },
      { label: 'Skarv', value: 3.4, previous: null },
      { label: 'Halten Øst', value: 2.1, previous: null },
    ],
    chartUnit: 'bn Sm³',
    chartLegend: { current: '2025', previous: null },
    followUps: ['Who owns Troll?', 'How has Troll gas changed since 2020?'],
  },
  {
    keywords: ['vår', 'oil share'],
    steps: [
      { label: 'Understood question', detail: 'Vår Energi oil share of net production, by year' },
      { label: 'Found 2 tables', detail: 'fct_company_production_monthly, dim_company' },
      { label: 'Ran query', detail: '19 ms · 6 rows' },
      { label: 'Sanity check', detail: 'Oil + gas + NGL/condensate = 100% each year' },
    ],
    answer:
      'Vår Energi has become more oil-weighted: oil was 54% of its net production in 2021 and 67% in 2026 so far, mainly as Balder X and Johan Castberg came on stream.',
    sql: `SELECT EXTRACT(year FROM p.month) AS year,
       SUM(p.oil_sm3) / SUM(p.oe_sm3) * 100 AS oil_share_pct
FROM marts.fct_company_production_monthly p
JOIN marts.dim_company c ON c.company_id = p.company_id
WHERE c.group_name = 'Vår Energi' AND p.month >= DATE '2021-01-01'
GROUP BY 1
ORDER BY 1;`,
    durationMs: 19,
    columns: ['Year', 'Oil share, %'],
    rows: [
      ['2021', 54.2],
      ['2022', 55.0],
      ['2023', 56.8],
      ['2024', 58.9],
      ['2025', 64.1],
      ['2026', 67.2],
    ],
    chart: [
      { label: '2021', value: 54.2, previous: null },
      { label: '2022', value: 55.0, previous: null },
      { label: '2023', value: 56.8, previous: null },
      { label: '2024', value: 58.9, previous: null },
      { label: '2025', value: 64.1, previous: null },
      { label: '2026', value: 67.2, previous: null },
    ],
    chartUnit: '%',
    chartLegend: { current: 'Oil share', previous: null },
    followUps: ['Which Vår Energi fields are mostly gas?', 'Compare with Aker BP'],
  },
  {
    keywords: ['declin', 'fastest'],
    steps: [
      {
        label: 'Understood question',
        detail: 'Fields with the largest drop vs a year ago (min. 10 kboe/d)',
      },
      { label: 'Found 2 tables', detail: 'fct_field_production_monthly, dim_field' },
      { label: 'Ran query', detail: '27 ms · 5 rows' },
      { label: 'Sanity check', detail: 'Excludes fields that were shut in for maintenance' },
    ],
    answer:
      'Ormen Lange, Edvard Grieg and Valhall show the steepest year-on-year declines among fields above 10 kboe/d. Johan Sverdrup is falling faster in volume (−110 kboe/d) but less in percent.',
    sql: `WITH latest AS (SELECT MAX(month) AS m FROM marts.fct_field_production_monthly)
SELECT f.name AS field,
       (now.boe_per_day / ago.boe_per_day - 1) * 100 AS change_pct
FROM marts.fct_field_production_monthly now
JOIN marts.fct_field_production_monthly ago
  ON ago.field_id = now.field_id AND ago.month = now.month - INTERVAL 12 MONTH
JOIN marts.dim_field f ON f.field_id = now.field_id, latest
WHERE now.month = latest.m AND ago.boe_per_day > 10000
ORDER BY change_pct
LIMIT 5;`,
    durationMs: 27,
    columns: ['Field', 'Change vs a year ago, %'],
    rows: [
      ['Ormen Lange', -29.4],
      ['Edvard Grieg', -33.0],
      ['Valhall', -17.8],
      ['Gullfaks Sør', -17.0],
      ['Johan Sverdrup', -15.2],
    ],
    chart: [
      { label: 'Edvard Grieg', value: 33.0, previous: null },
      { label: 'Ormen Lange', value: 29.4, previous: null },
      { label: 'Valhall', value: 17.8, previous: null },
      { label: 'Gullfaks Sør', value: 17.0, previous: null },
      { label: 'Johan Sverdrup', value: 15.2, previous: null },
    ],
    chartUnit: '% decline',
    chartLegend: { current: 'Decline vs a year ago', previous: null },
    followUps: ['Why is Edvard Grieg declining?', 'Show the forecast for Ormen Lange'],
  },
];

function normalise(text: string): string {
  return text.toLocaleLowerCase('nb-NO').replace(/[’']/g, '');
}

export function answerQuestion(question: string): AskAnswer {
  const q = normalise(question);
  const match = CANNED.find((c) => c.keywords.every((k) => q.includes(normalise(k))));
  if (match) {
    const { keywords: _keywords, ...answer } = match;
    return { ...answer, question, matched: true };
  }
  return {
    question,
    matched: false,
    steps: [
      { label: 'Understood question', detail: 'Not one the preview can answer yet' },
      { label: 'No query run', detail: 'Nothing was looked up' },
    ],
    answer:
      'This preview only answers a few example questions with sample numbers. Try one of the suggestions; free-form questions arrive when the backend can turn them into read-only SQL.',
    sql: '',
    durationMs: 0,
    columns: [],
    rows: [],
    chart: [],
    chartUnit: '',
    chartLegend: { current: '', previous: null },
    followUps: GOOD_FIRST_QUESTIONS.slice(0, 3),
  };
}
