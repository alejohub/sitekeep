export const SORTS=['visits','cookies','host'];
export const PERIODS=[7,30,90,'all'];
export const DEFAULT_PREFERENCES={sort:'cookies',period:30};
export function validatePreferences(value){
  return {sort:SORTS.includes(value?.sort)?value.sort:DEFAULT_PREFERENCES.sort,
    period:PERIODS.includes(value?.period)?value.period:DEFAULT_PREFERENCES.period};
}
export async function historyPermission(permissions){return permissions.contains({permissions:['history']});}
export function requestHistoryFromGesture(permissions){return permissions.request({permissions:['history']});}
