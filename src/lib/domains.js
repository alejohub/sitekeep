export function normalizeHost(input) {
  if (typeof input !== 'string' || !input.trim()) throw new Error('Dominio vacío');
  let raw = input.trim();
  if (raw.startsWith('.')) raw = raw.slice(1);
  const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Dominio inválido');
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host.includes('..')) throw new Error('Dominio inválido');
  return host;
}
export function pageHost(url) {
  try { if (!/^https?:\/\//i.test(url)) return null; return normalizeHost(url); } catch { return null; }
}
export function domainMatches(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}
export function applies(cookie, host) {
  try {
    const domain = normalizeHost(cookie.domain);
    return cookie.hostOnly === true ? host === domain : domainMatches(host, domain);
  } catch { return false; }
}
export function isProtected(cookie, whitelist) {
  try {
    const domain = normalizeHost(cookie.domain);
    if (whitelist.some(host => domainMatches(domain, host) || applies(cookie, host))) return true;
    if (cookie.partitionKey) {
      const {topLevelSite, hasCrossSiteAncestor} = cookie.partitionKey;
      if (!topLevelSite || typeof hasCrossSiteAncestor !== 'boolean') return true;
      const top = pageHost(topLevelSite);
      if (!top) return true;
      // A partition uses a schemeful site: retain parent/child relations conservatively.
      if (whitelist.some(host => domainMatches(host, top) || domainMatches(top, host))) return true;
    }
    if (typeof cookie.hostOnly !== 'boolean') return true;
    return false;
  } catch { return true; }
}
