const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const m = new Module(__filename);
m._compile(ts.transpileModule(fs.readFileSync('lib/gameLogic.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, __filename);
const g = m.exports;
test('equal tiles merge once and preserve the input', () => {
 const grid = [[2,2,2,2],[null,null,null,null],[null,null,null,null],[null,null,null,null]];
 const before = JSON.stringify(grid); const r = g.move(grid,'left');
 assert.deepEqual(r.grid[0],[4,4,null,null]); assert.equal(r.scoreGained,8); assert.equal(JSON.stringify(grid),before);
});
test('all board sizes support seeded repeatable play', () => {
 for(const mode of ['easy','normal','hard']) {
  let a=g.initializeGame(mode,42), b=g.initializeGame(mode,42);
  for(let i=0;i<200;i++) { const dir=['left','up','right','down'][i%4]; a=g.playMove(a,dir)?.state||a; b=g.playMove(b,dir)?.state||b; }
  assert.deepEqual(a,b); assert.equal(a.grid.length,g.boardSizeFor(mode)); assert.ok(a.score>=0);
 }
});
test('blocked board has no legal move',()=>{const grid=[[2,4],[4,2]];assert.equal(g.canMove(grid),false);assert.equal(g.legalMoveCount(grid),0);});
test('Lagos date crosses midnight at 23:00 UTC',()=>{assert.equal(g.lagosDate(new Date('2026-11-12T23:01:00Z')),'2026-11-13');});
test('reward thresholds are granted only on first crossing',()=>{assert.equal(g.toolGrants(64,64).swaps,0);assert.equal(g.toolGrants(32,64).swaps,1);});
