import {normalizeHost, applies} from './domains.js';
const encoder = new TextEncoder();
export function estimateBytes(cookie) { return encoder.encode(JSON.stringify(cookie)).byteLength; }
export function identity(cookie) {
  const p = cookie.partitionKey;
  return JSON.stringify([cookie.storeId, cookie.name, cookie.domain, cookie.path, cookie.value,
    cookie.hostOnly, cookie.secure, cookie.httpOnly, cookie.sameSite, cookie.session,
    cookie.expirationDate ?? null, p ? [p.topLevelSite, p.hasCrossSiteAncestor] : null]);
}
export function sameRemovalGroup(a, b) {
  const partition = c => JSON.stringify(c.partitionKey ? [c.partitionKey.topLevelSite, c.partitionKey.hasCrossSiteAncestor] : null);
  return a.name === b.name && a.storeId === b.storeId && partition(a) === partition(b);
}
export function inRemovalPartition(cookie, target) {
  if (cookie.name !== target.name || cookie.storeId !== target.storeId) return false;
  // Chromium's deletion filter may include unpartitioned cookies even when a
  // partitionKey is supplied. Treat them as collateral; other partitions differ.
  return !cookie.partitionKey || sameRemovalGroup(cookie, target);
}
export function inRemovalScope(cookie, target, details) {
  if(!inRemovalPartition(cookie,target))return false;
  try {
    const url = new URL(details.url), path = cookie.path;
    const pathMatches = url.pathname === path || (url.pathname.startsWith(path) && (path.endsWith('/') || url.pathname[path.length] === '/'));
    const host = url.hostname;
    const loopback = host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' || /^127\./.test(host);
    return applies(cookie, host) && pathMatches && (!cookie.secure || url.protocol === 'https:' || loopback);
  } catch { return true; } // Unknown selector fields must not defeat protection.
}
export function removalDetails(cookie) {
  const host = normalizeHost(cookie.domain);
  if (typeof cookie.path !== 'string' || !cookie.path.startsWith('/')) throw new Error('Path inválido');
  const url = `${cookie.secure ? 'https' : 'http'}://${host}${cookie.path}`, parsed = new URL(url);
  if (parsed.hostname !== host || parsed.pathname !== cookie.path || parsed.search || parsed.hash) throw new Error('URL ambigua');
  const details = {url, name: cookie.name, storeId: cookie.storeId};
  if (cookie.partitionKey) {
    if (!cookie.partitionKey.topLevelSite || typeof cookie.partitionKey.hasCrossSiteAncestor !== 'boolean') throw new Error('Partición ambigua');
    details.partitionKey = {...cookie.partitionKey};
  }
  return details;
}
export function metadata(cookie) {
  const {value, ...rest} = cookie;
  return {...rest, approximateBytes: estimateBytes(cookie)};
}
