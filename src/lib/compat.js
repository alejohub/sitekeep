import {identity} from './cookies.js';
export async function inventory(api) {
  const stores = await api.cookies.getAllCookieStores();
  // Empty partitionKey includes all partitions. No fallback to an incomplete inventory.
  const all = await Promise.all(stores.map(s => api.cookies.getAll({storeId:s.id, partitionKey:{}})));
  return [...new Map(all.flat().map(c => [identity(c),c])).values()];
}
