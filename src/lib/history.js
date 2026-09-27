import {pageHost, normalizeHost, domainMatches} from './domains.js';

export const HISTORY_PERIODS = [7, 30, 90, 'all'];
const DAY = 86400000;

export function historyWindow(period = 30, now = Date.now()) {
  if (!HISTORY_PERIODS.includes(period)) throw new Error('Periodo de historial inválido');
  return {startTime: period === 'all' ? 0 : Math.max(0, now - period * DAY), endTime: now};
}

// Site rows include visits to that host and its descendants.
// No www stripping, substring matching or guessed registrable domains.
export function visitsForDomain(byHostname, domain) {
  const normalized = normalizeHost(domain);
  let total = 0;
  for (const [host, count] of Object.entries(byHostname)) {
    if (domainMatches(host, normalized)) total += count;
  }
  return total;
}

export function aggregateVisits(records, window) {
  const byHostname = Object.create(null), seen = new Set();
  let missingTimes = 0;
  for (const {url, visits} of records) {
    const host = pageHost(url);
    if (!host) continue;
    for (const visit of visits) {
      if (['auto_subframe', 'manual_subframe'].includes(visit.transition)) continue;
      if (!Number.isFinite(visit.visitTime)) { missingTimes++; continue; }
      if (visit.visitTime < window.startTime || visit.visitTime > window.endTime) continue;
      if (visit.visitId !== undefined) {
        if (seen.has(visit.visitId)) continue;
        seen.add(visit.visitId);
      }
      byHostname[host] = (byHostname[host] || 0) + 1;
    }
  }
  return {byHostname, missingTimes};
}

export function sortByVisits(rows, byHostname) {
  return rows.map(row => ({...row, visits: visitsForDomain(byHostname, row.host)}))
    .sort((a, b) => b.visits - a.visits || a.host.localeCompare(b.host));
}

function checkAbort(signal) {
  if (signal?.aborted) throw new DOMException('Consulta cancelada', 'AbortError');
}

export async function collectHistory(history, domains, period = 30, options = {}) {
  if (!history?.search || !history?.getVisits) throw new Error('History API no disponible');
  const window = historyWindow(period, options.now ?? Date.now());
  const maxResults = options.maxResults ?? 100000;
  const concurrency = options.concurrency ?? 6;
  if (!Number.isInteger(maxResults) || maxResults < 1 || !Number.isInteger(concurrency) || concurrency < 1) throw new Error('Límites inválidos');
  const normalizedDomains = [...new Set(domains.map(normalizeHost))];
  checkAbort(options.signal);
  if (!normalizedDomains.length) return {...aggregateVisits([], window), window, truncated: false};
  // One global search, then getVisits only for unique URLs relevant to site rows.
  // HistoryItem.visitCount is lifetime data and cannot count visits in a date window.
  const items = await history.search({text: '', ...window, maxResults});
  checkAbort(options.signal);
  const urls = [...new Set(items.filter(item => {
    const host = pageHost(item.url);
    return host && normalizedDomains.some(domain => domainMatches(host, domain));
  }).map(item => item.url))];
  const byHostname = Object.create(null);
  let next = 0, missingTimes = 0, failed = false;
  // Visit IDs are global within this query. Keep only IDs transiently for deduplication.
  const seen = new Set();
  const workers = Array.from({length: Math.min(concurrency, urls.length)}, async () => {
    while (next < urls.length && !failed) {
      checkAbort(options.signal);
      const url = urls[next++];
      try {
        const visits = await history.getVisits({url});
        checkAbort(options.signal);
        const unique = visits.filter(visit => {
          if (visit.visitId === undefined) return true;
          if (seen.has(visit.visitId)) return false;
          seen.add(visit.visitId);
          return true;
        });
        const result = aggregateVisits([{url, visits: unique}], window);
        missingTimes += result.missingTimes;
        for (const [host, count] of Object.entries(result.byHostname)) byHostname[host] = (byHostname[host] || 0) + count;
      } catch (error) { failed = true; throw error; }
    }
  });
  const results = await Promise.allSettled(workers);
  checkAbort(options.signal);
  if (results.some(result => result.status === 'rejected')) throw new Error('No se pudo leer el historial completo');
  return {byHostname, window, truncated: items.length >= maxResults, missingTimes};
}

export function createHistoryCache(history, options = {}) {
  const entries = new Map();
  return {
    get(domains, period = 30) {
      const key = JSON.stringify([period, [...new Set(domains.map(normalizeHost))].sort()]);
      if (!entries.has(key)) {
        const controller = new AbortController();
        const entry = {controller};
        entry.promise = collectHistory(history, domains, period, {...options, signal: controller.signal})
          .catch(error => { if (entries.get(key) === entry) entries.delete(key); throw error; });
        entries.set(key, entry);
      }
      return entries.get(key).promise;
    },
    clear() {
      for (const entry of entries.values()) entry.controller.abort();
      entries.clear();
    }
  };
}
