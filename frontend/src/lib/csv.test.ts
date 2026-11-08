import { describe, expect, it } from 'vitest';
import { rowsToCsv, toCsv } from './csv';

describe('csv', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(toCsv(['a', 'b'], [['x,y', 'say "hi"']])).toBe('a,b\r\n"x,y","say ""hi"""');
  });

  it('writes numbers raw and nulls empty', () => {
    expect(toCsv(['n', 'm'], [[1234.5, null]])).toBe('n,m\r\n1234.5,');
  });

  it('neutralises spreadsheet formulas in text cells', () => {
    expect(toCsv(['f'], [['=SUM(A1)']])).toBe("f\r\n'=SUM(A1)");
    expect(toCsv(['n'], [[-3]])).toBe('n\r\n-3');
  });

  it('maps typed rows through columns', () => {
    const csv = rowsToCsv(
      [
        { header: 'Field', value: (r: { name: string; v: number }) => r.name },
        { header: 'Value', value: (r) => r.v },
      ],
      [{ name: 'Troll', v: 799.2 }],
    );
    expect(csv).toBe('Field,Value\r\nTroll,799.2');
  });
});
