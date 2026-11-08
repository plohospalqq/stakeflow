import { describe, expect, it } from 'vitest';
import { tokenizeSql } from './sql';

describe('tokenizeSql', () => {
  it('keeps every character, in order', () => {
    const sql = "SELECT f.name, SUM(p.oe_sm3) / 1e6\nFROM t -- note\nWHERE f.name = 'TROLL';";
    expect(
      tokenizeSql(sql)
        .map((t) => t.text)
        .join(''),
    ).toBe(sql);
  });

  it('classifies keywords, strings, numbers and comments', () => {
    const tokens = tokenizeSql("select x FROM t WHERE y = 'a -- b' AND z > 10 -- done");
    const of = (kind: string) => tokens.filter((t) => t.kind === kind).map((t) => t.text);
    expect(of('keyword')).toEqual(['select', 'FROM', 'WHERE', 'AND']);
    expect(of('string')).toEqual(["'a -- b'"]);
    expect(of('number')).toEqual(['10']);
    expect(of('comment')).toEqual(['-- done']);
  });

  it('does not treat keywords inside identifiers as keywords', () => {
    const tokens = tokenizeSql('SELECT order_total FROM orders');
    expect(tokens.filter((t) => t.kind === 'keyword').map((t) => t.text)).toEqual([
      'SELECT',
      'FROM',
    ]);
  });
});
