const fs=require('node:fs');
(async()=>{
 const base=process.env.LOAD_BASE_URL||'http://localhost:3100';
 const total=200,concurrency=20;
 for(const board of ['daily','alltime']) {const r=await fetch(`${base}/api/leaderboard?board=${board}`);if(!r.ok)throw Error('Warmup failed');await r.arrayBuffer();}
 let next=0,errors=0;const times=[];const started=performance.now();
 await Promise.all(Array.from({length:concurrency},async()=>{
  while(next<total){const i=next++;const start=performance.now();
   try {const r=await fetch(`${base}/api/leaderboard?board=${i%2?'daily':'alltime'}`,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('HTTP '+r.status);const rows=await r.json();if(!Array.isArray(rows)||rows.length>100)throw Error('Invalid data');}
   catch{errors++;} times.push(performance.now()-start);
  }
 }));
 times.sort((a,b)=>a-b);const seconds=(performance.now()-started)/1000;
 const report={scope:'Local production build; warm read-only leaderboard API; not complete user sessions or a maximum-capacity test',requests:total,concurrency,errors,seconds:Number(seconds.toFixed(2)),requestsPerSecond:Number((total/seconds).toFixed(1)),p50Ms:Math.round(times[Math.floor(total*.50)]),p95Ms:Math.round(times[Math.floor(total*.95)]),maxMs:Math.round(times.at(-1))};
 if(process.env.LOAD_REPORT_PATH)fs.writeFileSync(process.env.LOAD_REPORT_PATH,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(errors)process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1;});
