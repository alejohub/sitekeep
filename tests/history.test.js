import test from 'node:test';
import assert from 'node:assert/strict';
import {historyWindow,aggregateVisits,visitsForDomain,sortByVisits,collectHistory,createHistoryCache} from '../src/lib/history.js';
import {validatePreferences,historyPermission,requestHistoryFromGesture} from '../src/lib/history-settings.js';

const DAY=86400000,NOW=100*DAY;
const visit=(id,days=1,extra={})=>({visitId:String(id),visitTime:NOW-days*DAY,transition:'link',...extra});
test('visits follow protected-site hostname boundaries',()=>{
  const counts={'reddit.com':1,'www.reddit.com':2,'old.reddit.com':3,'evilreddit.com':40};
  assert.equal(visitsForDomain(counts,'reddit.com'),6);
  assert.equal(visitsForDomain(counts,'old.reddit.com'),3);
  assert.equal(visitsForDomain(counts,'evilreddit.com'),40);
});
test('subframes excluded; reload and synced visits included',()=>{
  const result=aggregateVisits([{url:'https://www.reddit.com/a',visits:[visit(1),visit(2,1,{transition:'reload'}),visit(3,1,{isLocal:false}),visit(4,1,{transition:'auto_subframe'}),visit(5,1,{transition:'manual_subframe'})]}],historyWindow(30,NOW));
  assert.equal(result.byHostname['www.reddit.com'],3);
});
test('periods 7, 30, 90 and all use individual visit times',()=>{
  const records=[{url:'https://a.test',visits:[visit(1,2),visit(2,15),visit(3,60),visit(4,95)]}];
  for(const [period,count] of [[7,1],[30,2],[90,3],['all',4]])assert.equal(aggregateVisits(records,historyWindow(period,NOW)).byHostname['a.test'],count);
});
test('more visited sorts descending, ties and zero alphabetically',()=>{
  const rows=[{host:'z.test',cookies:200},{host:'b.test',cookies:5},{host:'a.test',cookies:1}];
  const sorted=sortByVisits(rows,{'b.test':4,'a.test':4});
  assert.deepEqual(sorted.map(row=>row.host),['a.test','b.test','z.test']);
  assert.deepEqual(sorted.map(row=>row.visits),[4,4,0]);
});
test('history query ignores lifetime visitCount and unrelated URLs',async()=>{
  const queried=[];
  const history={search:async()=>[{url:'https://www.reddit.com/a',visitCount:100},{url:'https://evilreddit.com/b',visitCount:200}],getVisits:async({url})=>{queried.push(url);return [visit(1),visit(2,50)];}};
  const result=await collectHistory(history,['reddit.com'],30,{now:NOW});
  assert.deepEqual(queried,['https://www.reddit.com/a']);
  assert.equal(visitsForDomain(result.byHostname,'reddit.com'),1);
});
test('empty history returns zero visits',async()=>{
  const result=await collectHistory({search:async()=>[],getVisits:async()=>{throw Error('unused');}},['a.test']);
  assert.equal(visitsForDomain(result.byHostname,'a.test'),0);
});
test('permission is optional and denial leaves querying untouched',async()=>{
  let requests=0,searches=0;
  const permissions={contains:async()=>false,request:()=>{requests++;return Promise.resolve(false);}};
  assert.equal(await historyPermission(permissions),false);
  assert.equal(await requestHistoryFromGesture(permissions),false);
  if(await historyPermission(permissions))searches++;
  assert.equal(requests,1);assert.equal(searches,0);
});
test('granted permission and saved preferences validate locally',async()=>{
  const permissions={contains:async()=>true,request:()=>Promise.resolve(true)};
  assert.equal(await historyPermission(permissions),true);
  assert.deepEqual(validatePreferences({sort:'visits',period:90}),{sort:'visits',period:90});
  assert.deepEqual(validatePreferences({sort:'bad',period:13}),{sort:'cookies',period:30});
});
test('cache reuses a period and refreshes after invalidation without storing URLs',async()=>{
  let calls=0;
  const cache=createHistoryCache({search:async()=>{calls++;return [{url:'https://a.test/private?secret=1'}];},getVisits:async()=>[visit(1)]},{now:NOW});
  const first=await cache.get(['a.test'],30);await cache.get(['a.test'],30);assert.equal(calls,1);
  await cache.get(['a.test'],7);assert.equal(calls,2);
  cache.clear();await cache.get(['a.test'],30);assert.equal(calls,3);
  assert.ok(!JSON.stringify(first).includes('secret'));
});
test('missing or failing history API is not presented as zero',async()=>{
  await assert.rejects(collectHistory(undefined,['a.test']));
  await assert.rejects(collectHistory({search:async()=>{throw Error('denied');},getVisits:async()=>[]},['a.test']));
});
