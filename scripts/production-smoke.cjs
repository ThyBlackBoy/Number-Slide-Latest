const assert = require('node:assert/strict');
const fs = require('node:fs');
(async()=>{
 const base=process.env.SMOKE_BASE_URL || 'http://localhost:3100';
 const results=[];
 for(const path of ['/','/leaderboard','/messages','/friends','/profile','/auth/login','/auth/signup']) {
  const r=await fetch(base+path,{signal:AbortSignal.timeout(15000)});
  assert.equal(r.status,200,path); assert.equal(r.headers.get('x-content-type-options'),'nosniff');
  assert.equal(r.headers.get('x-frame-options'),'DENY'); results.push({path,status:r.status});
 }
 for(const board of ['alltime','daily']) {
  const start=performance.now();
  const r=await fetch(`${base}/api/leaderboard?board=${board}`,{signal:AbortSignal.timeout(15000)});
  assert.equal(r.status,200);const rows=await r.json();assert.ok(Array.isArray(rows));assert.ok(rows.length<=100);
  assert.equal(new Set(rows.map(r=>r.user_id)).size,rows.length);
  for(let i=1;i<rows.length;i++)assert.ok(rows[i-1].score>=rows[i].score);
  assert.equal(r.headers.get('set-cookie'),null);assert.match(r.headers.get('cache-control'),/public/);
  results.push({path:`/api/leaderboard?board=${board}`,status:r.status,rows:rows.length,ms:Math.round(performance.now()-start)});
 }
 const bad=await fetch(`${base}/api/leaderboard?offset=-1`);assert.equal(bad.status,400);
 results.push({path:'/api/leaderboard?offset=-1',status:bad.status});
 if(process.env.SMOKE_REPORT_PATH)fs.writeFileSync(process.env.SMOKE_REPORT_PATH,JSON.stringify({base,results},null,2));
 console.log(JSON.stringify(results,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
