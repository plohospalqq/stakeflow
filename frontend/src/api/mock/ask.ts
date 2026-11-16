/**
 * Canned answers for the Ask preview. The real feature will turn a question into read-only
 * SQL over the marts; until then a few example questions have pre-computed answers.
 *
 * The SQL shown is real: it runs as-is against the marts schema, and the rows, timings and
 * numbers below are its actual output for Sodir data through Aug 2026. Anything else gets an
 * honest "not yet" reply. Every follow-up offered is a question the preview can answer.
 */
import { DICTS } from '@/i18n/dicts';
import { fill, pluralize } from '@/i18n/text';
import { LANGS, type Lang } from '@/i18n/types';
import { useLangStore } from '@/stores/language';
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

/** The prepared examples, in the order they are offered. Their words live in the dictionaries. */
export const EXAMPLE_IDS = [
  'akerYear',
  'castbergOwners',
  'gasTop',
  'varOilShare',
  'decline',
] as const;
export type ExampleId = (typeof EXAMPLE_IDS)[number];

/** The example questions in a language (the reader's by default). */
export function exampleQuestions(lang: Lang = useLangStore.getState().lang): string[] {
  return EXAMPLE_IDS.map((id) => DICTS[lang].ask.examples[id].question);
}

/** English, for tests and anything that needs a fixed wording. */
export const GOOD_FIRST_QUESTIONS = exampleQuestions('en');

/** The numbers of an example: SQL, rows and chart. Question, steps and answer are translated. */
type Canned = Pick<
  AskAnswer,
  | 'sql'
  | 'durationMs'
  | 'columns'
  | 'rows'
  | 'chart'
  | 'chartUnit'
  | 'chartLegend'
  | 'chartType'
  | 'truncated'
> & {
  id: ExampleId;
  /** English words that pick this example out of a free-text question. */
  keywords: string[];
  /** The marts tables the SQL reads, as the "found tables" step lists them. */
  tables: string[];
};

const CANNED: Canned[] = [
  {
    id: 'akerYear',
    keywords: ['aker', 'year ago'],
    tables: ['fct_company_field_production_monthly', 'dim_field'],
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
    chartType: 'bar',
    truncated: false,
  },
  {
    id: 'castbergOwners',
    keywords: ['castberg', 'owns'],
    tables: ['fct_field_ownership', 'dim_field', 'dim_company_group'],
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
    chartType: 'bar',
    truncated: false,
  },
  {
    id: 'gasTop',
    keywords: ['gas', 'top'],
    tables: ['fct_field_production_monthly', 'dim_field'],
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
    chartType: 'bar',
    truncated: false,
  },
  {
    id: 'varOilShare',
    keywords: ['vår', 'oil share'],
    tables: ['fct_group_production_monthly'],
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
    chartType: 'line',
    truncated: false,
  },
  {
    id: 'decline',
    keywords: ['declin', 'fastest'],
    tables: ['fct_field_production_monthly', 'dim_field'],
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
    chartType: 'bar',
    truncated: false,
  },
];

function normalise(text: string): string {
  return text.toLocaleLowerCase('nb-NO').replace(/[’']/g, '').trim();
}

/** An example question in any language, word for word, or the English keywords in free text. */
function findCanned(question: string): Canned | undefined {
  const q = normalise(question);
  const asked = (c: Canned) =>
    LANGS.some((lang) => normalise(DICTS[lang].ask.examples[c.id].question) === q);
  return (
    CANNED.find(asked) ?? CANNED.find((c) => c.keywords.every((k) => q.includes(normalise(k))))
  );
}

/** Suggestions must never lead to a dead end, so they come only from answerable questions. */
function followUpsFor(current: Canned | undefined, lang: Lang): string[] {
  return CANNED.filter((c) => c !== current)
    .slice(0, 3)
    .map((c) => DICTS[lang].ask.examples[c.id].question);
}

/**
 * A prepared answer in the reader's language; `preview` says why one is shown instead of the
 * model's. The numbers are the same in every language: only the words around them change.
 */
export function answerQuestion(
  question: string,
  preview: AskPreviewReason,
  lang: Lang = useLangStore.getState().lang,
): AskReply {
  const words = DICTS[lang].ask;
  const match = findCanned(question);
  if (match) {
    const { id, keywords: _keywords, tables, ...numbers } = match;
    const text = words.examples[id];
    return {
      ...numbers,
      question,
      steps: [
        { label: words.stepUnderstood, detail: text.understood },
        {
          label: pluralize(lang, words.stepFound, tables.length),
          detail: tables.join(', '),
        },
        {
          label: words.stepRan,
          detail: fill(words.stepRanDetail, {
            ms: numbers.durationMs,
            rows: pluralize(lang, words.resultRows, numbers.rows.length),
          }),
        },
        { label: words.stepCheck, detail: text.check },
      ],
      answer: text.answer,
      matched: true,
      followUps: followUpsFor(match, lang),
      preview,
    };
  }
  return {
    question,
    matched: false,
    preview,
    steps: [
      { label: words.stepUnderstood, detail: words.notYet.understood },
      { label: words.notYet.step, detail: words.notYet.detail },
    ],
    answer: words.notYet.answer,
    sql: '',
    durationMs: 0,
    columns: [],
    rows: [],
    chart: [],
    chartUnit: '',
    chartLegend: { current: '', previous: null },
    chartType: 'none',
    truncated: false,
    followUps: followUpsFor(undefined, lang),
  };
}
