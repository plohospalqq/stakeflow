/**
 * Just enough SQL tokenising to colour the generated queries. Rendered as React text, so
 * nothing here ever becomes HTML.
 */
export type SqlTokenKind = 'keyword' | 'string' | 'number' | 'comment' | 'text';

export interface SqlToken {
  kind: SqlTokenKind;
  text: string;
}

const KEYWORDS = new Set(
  [
    'select',
    'from',
    'where',
    'join',
    'left',
    'inner',
    'on',
    'and',
    'or',
    'not',
    'group',
    'order',
    'by',
    'limit',
    'as',
    'with',
    'case',
    'when',
    'then',
    'else',
    'end',
    'between',
    'desc',
    'asc',
    'sum',
    'max',
    'min',
    'avg',
    'count',
    'interval',
    'date',
    'extract',
    'year',
    'month',
    'is',
    'null',
    'in',
    'distinct',
  ].map((k) => k.toUpperCase()),
);

// Order matters: comments and strings first so their contents are not split further.
const PATTERN = /(--[^\n]*)|('(?:[^']|'')*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)/g;

export function tokenizeSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let last = 0;
  const push = (kind: SqlTokenKind, text: string) => {
    const prev = tokens[tokens.length - 1];
    if (prev && prev.kind === kind && kind === 'text') prev.text += text;
    else tokens.push({ kind, text });
  };
  for (const m of sql.matchAll(PATTERN)) {
    const index = m.index;
    if (index > last) push('text', sql.slice(last, index));
    const [whole, comment, string, number, word] = m;
    if (comment) push('comment', whole);
    else if (string) push('string', whole);
    else if (number) push('number', whole);
    else if (word && KEYWORDS.has(word.toUpperCase())) push('keyword', whole);
    else push('text', whole);
    last = index + whole.length;
  }
  if (last < sql.length) push('text', sql.slice(last));
  return tokens;
}
