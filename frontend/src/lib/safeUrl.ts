/**
 * Links inside API data come from third parties (Sodir records, company releases), so they are
 * untrusted. Only https links to hosts we expect are rendered; anything else — `javascript:`,
 * `data:`, plain http, unknown hosts, unparsable strings — becomes null and no <a> is drawn.
 */
const ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  'factpages.sodir.no',
  'sodir.no',
  'www.sodir.no',
  'www.inderes.dk',
  'akerbp.com',
  'www.akerbp.com',
  'varenergi.no',
  'www.varenergi.no',
  'github.com',
]);

export function safeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) return null;
  return url.href;
}
