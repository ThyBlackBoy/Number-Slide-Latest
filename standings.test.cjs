const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const exportsForTest = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/standings.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exportsForTest});
const publish = exportsForTest.publishStanding;
const input = {userId:'untrusted-client-id',score:1000,tile:64,mode:'hard'};

test('score publish uses one RPC and sends neither user ID nor client date',async()=>{
 let calls=0;
 const result=await publish({rpc:async(name,args)=>{
  calls++; assert.equal(name,'publish_score');
  assert.equal(JSON.stringify(args),JSON.stringify({new_score:1000,new_tile:64,game_mode:'hard'}));
  return {data:{saved:true,standing:{todayPlace:301,allTimePlace:401,todayTop:false,allTimeTop:false},percent:33},error:null};
 }},input);
 assert.equal(calls,1); assert.equal(result.saved,true); assert.equal(result.standing.allTimePlace,401);
});

test('failed or thrown requests never acknowledge a saved score',async()=>{
 for(const rpc of [async()=>({error:Error('offline')}),async()=>{throw Error('timeout');},async()=>({data:{saved:true}})]) {
  assert.equal((await publish({rpc},input)).saved,false);
 }
});

test('invalid scores and non-power-of-two tiles make no requests',async()=>{
 const client={rpc:()=>{throw Error('should not call');}};
 for(const patch of [{score:0},{score:NaN},{score:2147483648},{score:1.2},{tile:3},{tile:0},{tile:2147483648}])
  assert.equal((await publish(client,{...input,...patch})).saved,false);
});

test('special game modes normalize to the valid normal score mode',async()=>{
 for(const mode of ['daily','duel','classic']) {
  await publish({rpc:async(name,args)=>{assert.equal(args.game_mode,'normal');return {error:Error('test')};}},{...input,mode});
 }
});
