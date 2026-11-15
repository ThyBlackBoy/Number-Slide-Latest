const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');

test('polling skips hidden tabs, prevents overlap, backs off and stops on cleanup', async () => {
  let effect, cleanup, callback, delay;
  const listeners = {};
  const document = { visibilityState: 'hidden', addEventListener: (k,v) => listeners[k]=v, removeEventListener: k => delete listeners[k] };
  const window = { addEventListener: (k,v) => listeners[k]=v, removeEventListener: k => delete listeners[k] };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/useVisiblePolling.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {
    exports, require: () => ({useRef: value => ({current:value}), useEffect: fn => effect=fn}), document, window,
    navigator: {onLine:true}, setTimeout: (fn, ms) => {callback=fn;delay=ms;return 1;}, clearTimeout: () => {callback=undefined;}, Math,
  });
  let calls=0, release;
  exports.useVisiblePolling(() => { calls++; return new Promise(resolve => release=resolve); }, 1000);
  cleanup=effect(); assert.equal(calls,0);
  document.visibilityState='visible'; listeners.visibilitychange(); listeners.online(); assert.equal(calls,1);
  release(); await new Promise(setImmediate); assert.ok(delay>=1000 && delay<1100);
  callback(); assert.equal(calls,2); cleanup(); release(); await new Promise(setImmediate);
  assert.equal(callback,undefined); assert.deepEqual(Object.keys(listeners),[]);
});

test('failed requests use bounded exponential backoff', async () => {
  let effect, callback, delay;
  const exports = {};
  const host = {addEventListener(){}, removeEventListener(){}, visibilityState:'visible'};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/useVisiblePolling.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {
    exports, require: () => ({useRef:value=>({current:value}),useEffect:fn=>effect=fn}), document:host,window:host,navigator:{onLine:true},
    setTimeout:(fn,ms)=>{callback=fn;delay=ms;return 1;},clearTimeout(){},Math,
  });
  exports.useVisiblePolling(async()=>{throw Error('offline');},1000);
  const cleanup=effect(); await new Promise(setImmediate); assert.ok(delay>=2000);
  for(let i=0;i<8;i++){callback();await new Promise(setImmediate);}
  assert.ok(delay>=16000 && delay<16100); cleanup();
});
