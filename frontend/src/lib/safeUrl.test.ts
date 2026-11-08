import { describe, expect, it } from 'vitest';

import { safeExternalUrl } from './safeUrl';

describe('safeExternalUrl', () => {
  it('keeps https links to known hosts', () => {
    const url = 'https://factpages.sodir.no/field/pageview/all/43506';
    expect(safeExternalUrl(url)).toBe(url);
  });

  it.each([
    ['javascript:alert(1)'],
    ['JaVaScRiPt:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['http://factpages.sodir.no/field/1'],
    ['https://factpages.sodir.no.evil.example/field/1'],
    ['https://evil.example/?u=https://factpages.sodir.no'],
    ['//factpages.sodir.no/field/1'],
    ['not a url'],
    [''],
  ])('drops %s', (raw) => {
    expect(safeExternalUrl(raw)).toBeNull();
  });

  it('treats missing values as no link', () => {
    expect(safeExternalUrl(null)).toBeNull();
    expect(safeExternalUrl(undefined)).toBeNull();
  });
});
