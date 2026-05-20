export function canonicalizeUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  url.hash = '';

  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith('utm_') || ['fbclid', 'gclid', 'mc_cid', 'mc_eid'].includes(key)) {
      url.searchParams.delete(key);
    }
  }

  url.hostname = url.hostname.replace(/^www\./, '').toLowerCase();
  url.pathname = url.pathname.replace(/\/$/, '') || '/';
  return url.toString();
}

export function domainFromUrl(rawUrl: string) {
  return new URL(rawUrl).hostname.replace(/^www\./, '').toLowerCase();
}
