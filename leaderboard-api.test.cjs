const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
function route(fetch) {
 const exports = {};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/leaderboard/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{
  exports,require:()=>({NextResponse:{json:(data,options={})=>({data,status:options.status||200,headers:options.headers||{}})}}),
  process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-key'}},fetch,AbortSignal,
 });
 return query=>exports.GET({nextUrl:new URL(`https://game.test/api/leaderboard?${query}`)});
}
test('invalid leaderboard queries are rejected without database requests',async()=>{
 const get=route(()=>{throw Error('No request expected');});
 for(const query of ['board=private','offset=-1','offset=NaN','offset=1.5','offset=100001','offset=1e3']) assert.equal((await get(query)).status,400);
});
test('public leaderboard request is canonical and does not forward user credentials',async()=>{
 let calls=0;
 const get=route(async(url,options)=>{
  calls++;assert.equal(url,'https://example.supabase.co/rest/v1/rpc/leaderboard_page');
  assert.equal(options.headers.Authorization,'Bearer public-key');assert.equal(options.headers.Cookie,undefined);
  assert.equal(options.body,JSON.stringify({board:'alltime',page_offset:100}));assert.equal(options.next.revalidate,10);
  assert.ok(options.signal);
  return {ok:true,json:async()=>[{user_id:'public-player',score:100}]};
 });
 const response=await get('board=alltime&offset=000100');
 assert.equal(calls,1);assert.equal(response.status,200);assert.equal(response.data[0].score,100);
 assert.match(response.headers['Cache-Control'],/public, s-maxage=10/);
});
test('database failure returns an uncached 503 and no internal error details',async()=>{
 for(const fetch of [async()=>({ok:false}),async()=>{throw Error('private connection information');}]) {
  const response=await route(fetch)('');
  assert.equal(response.status,503);assert.equal(response.headers['Cache-Control'],'no-store');
  assert.equal(response.data.error,'Leaderboard temporarily unavailable');
 }
});


test('simultaneous readers share one upstream request and failures can retry',async()=>{
 let calls=0,release;
 const get=route(async()=>{calls++;await new Promise(resolve=>release=resolve);return {ok:true,json:async()=>[]};});
 const requests=Array.from({length:20},()=>get('board=alltime'));
 await Promise.resolve();assert.equal(calls,1);release();const results=await Promise.all(requests);
 assert.ok(results.every(r=>r.status===200));
 let tries=0;
 const retry=route(async()=>{tries++;return {ok:tries>1,json:async()=>[]};});
 assert.equal((await retry('')).status,503);assert.equal((await retry('')).status,200);assert.equal(tries,2);
});
