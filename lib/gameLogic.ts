export type Grid = (number | null)[][];
export type Dir = 'up' | 'down' | 'left' | 'right';

export interface GameState {
  grid: Grid;
  size: number;
  score: number;
  bestScore: number;
  gameOver: boolean;
  won: boolean;
  undosLeft: number;
  swapsLeft: number;
  deletesLeft: number;
  bombsLeft: number;
  maxTileSeen: number;
  rngState: number;
}

export function boardSizeFor(mode: string): number {
  if (mode === 'hard') return 8;
  if (mode === 'normal') return 6;
  return 4;
}

function emptyGrid(size: number): Grid {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

function clone(grid: Grid): Grid {
  return grid.map((row) => [...row]);
}

function sizeOf(grid: Grid): number {
  return grid.length || 4;
}

export function lagosDate(d = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
}

export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function todaySeed(): number {
  return hashString(`number-slide-${lagosDate()}`);
}

function nextRand(state: number): { value: number; next: number } {
  let a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, next: a >>> 0 };
}

export function maxTile(grid: Grid): number {
  return Math.max(0, ...(grid.flat().filter((v): v is number => v !== null)));
}

function empties(grid: Grid): [number, number][] {
  const size = sizeOf(grid);
  const cells: [number, number][] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] === null) cells.push([r, c]);
    }
  }
  return cells;
}

export function spawnWithRng(grid: Grid, rngState: number): { grid: Grid; rngState: number } {
  const cells = empties(grid);
  if (cells.length === 0) return { grid, rngState };
  const pick = nextRand(rngState);
  const valueRoll = nextRand(pick.next);
  const [r, c] = cells[Math.floor(pick.value * cells.length)];
  const next = clone(grid);
  next[r][c] = valueRoll.value < 0.9 ? 2 : 4;
  return { grid: next, rngState: valueRoll.next };
}

export function initializeGame(mode = 'easy', seed?: number, size?: number): GameState {
  const board = size ?? boardSizeFor(mode);
  const rngState = seed !== undefined ? seed : ((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
  let grid = emptyGrid(board);
  let cursor = rngState;
  const first = spawnWithRng(grid, cursor);
  grid = first.grid;
  cursor = first.rngState;
  const second = spawnWithRng(grid, cursor);
  grid = second.grid;
  cursor = second.rngState;
  const undos = mode === 'easy' ? 5 : mode === 'hard' ? 1 : 3;
  return {
    grid,
    size: board,
    score: 0,
    bestScore: 0,
    gameOver: false,
    won: false,
    undosLeft: undos,
    swapsLeft: 0,
    deletesLeft: 0,
    bombsLeft: 0,
    maxTileSeen: maxTile(grid),
    rngState: cursor,
  };
}

function slide(line: (number | null)[], size: number): { line: (number | null)[]; score: number } {
  const nums = line.filter((v): v is number => v !== null);
  const out: (number | null)[] = [];
  let score = 0;
  for (let i = 0; i < nums.length; i++) {
    if (i + 1 < nums.length && nums[i] === nums[i + 1]) {
      const merged = nums[i] * 2;
      out.push(merged);
      score += merged;
      i++;
    } else {
      out.push(nums[i]);
    }
  }
  while (out.length < size) out.push(null);
  return { line: out, score };
}

export function move(grid: Grid, dir: Dir): { grid: Grid; scoreGained: number; moved: boolean } {
  const size = sizeOf(grid);
  const next = emptyGrid(size);
  let scoreGained = 0;
  let moved = false;

  if (dir === 'left' || dir === 'right') {
    for (let r = 0; r < size; r++) {
      const row = dir === 'right' ? [...grid[r]].reverse() : [...grid[r]];
      const slid = slide(row, size);
      const line = dir === 'right' ? [...slid.line].reverse() : slid.line;
      next[r] = line;
      scoreGained += slid.score;
      if (line.some((v, c) => v !== grid[r][c])) moved = true;
    }
  } else {
    for (let c = 0; c < size; c++) {
      const col: (number | null)[] = [];
      for (let r = 0; r < size; r++) col.push(grid[r][c]);
      const source = dir === 'down' ? [...col].reverse() : col;
      const slid = slide(source, size);
      const line = dir === 'down' ? [...slid.line].reverse() : slid.line;
      for (let r = 0; r < size; r++) next[r][c] = line[r];
      scoreGained += slid.score;
      if (line.some((v, r) => v !== grid[r][c])) moved = true;
    }
  }

  return { grid: next, scoreGained, moved };
}

export function canMove(grid: Grid): boolean {
  const size = sizeOf(grid);
  if (empties(grid).length > 0) return true;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (c + 1 < size && grid[r][c] === grid[r][c + 1]) return true;
      if (r + 1 < size && grid[r][c] === grid[r + 1][c]) return true;
    }
  }
  return false;
}

export function legalMoveCount(grid: Grid): number {
  return (['up', 'down', 'left', 'right'] as Dir[]).reduce(
    (n, dir) => n + (move(grid, dir).moved ? 1 : 0),
    0
  );
}

export function hasWon(grid: Grid): boolean {
  return grid.some((row) => row.some((v) => v !== null && v >= 2048));
}

export function toolGrants(prevMax: number, nextMax: number): {
  swaps: number;
  deletes: number;
  bombs: number;
  undos: number;
  label: string;
} {
  let swaps = 0;
  let deletes = 0;
  let bombs = 0;
  let undos = 0;
  const labels: string[] = [];
  const cross = (tile: number) => prevMax < tile && nextMax >= tile;
  if (cross(64)) {
    swaps += 1;
    labels.push('Swap unlocked');
  }
  if (cross(128)) {
    deletes += 1;
    undos += 1;
    labels.push('Delete unlocked');
    labels.push('+1 Undo');
  }
  if (cross(256)) {
    bombs += 1;
    labels.push('Bomb unlocked');
  }
  if (cross(512)) {
    swaps += 1;
    undos += 1;
    labels.push('+1 Swap');
    labels.push('+1 Undo');
  }
  if (cross(1024)) {
    deletes += 1;
    labels.push('+1 Delete');
  }
  if (cross(2048)) {
    bombs += 1;
    undos += 1;
    labels.push('2048 · keep going');
  }
  return { swaps, deletes, bombs, undos, label: labels.join(' · ') };
}

export function playMove(state: GameState, dir: Dir): {
  state: GameState;
  scoreGained: number;
  moved: boolean;
  grantLabel: string;
} | null {
  const result = move(state.grid, dir);
  if (!result.moved) return null;
  const spawned = spawnWithRng(result.grid, state.rngState);
  const tile = maxTile(spawned.grid);
  const grant = toolGrants(state.maxTileSeen, tile);
  const next: GameState = {
    ...state,
    grid: spawned.grid,
    size: sizeOf(spawned.grid),
    rngState: spawned.rngState,
    score: state.score + result.scoreGained,
    bestScore: Math.max(state.bestScore, state.score + result.scoreGained),
    swapsLeft: state.swapsLeft + grant.swaps,
    deletesLeft: state.deletesLeft + grant.deletes,
    bombsLeft: state.bombsLeft + grant.bombs,
    undosLeft: state.undosLeft + grant.undos,
    maxTileSeen: Math.max(state.maxTileSeen, tile),
    won: state.won || tile >= 2048,
    gameOver: !canMove(spawned.grid),
  };
  return { state: next, scoreGained: result.scoreGained, moved: true, grantLabel: grant.label };
}

function indexToCell(index: number, size: number): [number, number] {
  return [Math.floor(index / size), index % size];
}

export function applySwap(state: GameState, a: number, b: number): GameState | null {
  if (state.swapsLeft <= 0 || a === b) return null;
  const size = sizeOf(state.grid);
  const [r1, c1] = indexToCell(a, size);
  const [r2, c2] = indexToCell(b, size);
  const grid = clone(state.grid);
  const tmp = grid[r1][c1];
  grid[r1][c1] = grid[r2][c2];
  grid[r2][c2] = tmp;
  return {
    ...state,
    grid,
    swapsLeft: state.swapsLeft - 1,
    gameOver: !canMove(grid),
  };
}

export function applyDelete(state: GameState, index: number): GameState | null {
  if (state.deletesLeft <= 0) return null;
  const size = sizeOf(state.grid);
  const [r, c] = indexToCell(index, size);
  const value = state.grid[r][c];
  if (value === null) return null;
  const grid = clone(state.grid);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      if (grid[i][j] === value) grid[i][j] = null;
    }
  }
  let rngState = state.rngState;
  let nextGrid = grid;
  const spawned = spawnWithRng(nextGrid, rngState);
  nextGrid = spawned.grid;
  rngState = spawned.rngState;
  if (empties(nextGrid).length === size * size) {
    const again = spawnWithRng(nextGrid, rngState);
    nextGrid = again.grid;
    rngState = again.rngState;
  }
  return {
    ...state,
    grid: nextGrid,
    rngState,
    deletesLeft: state.deletesLeft - 1,
    gameOver: !canMove(nextGrid),
  };
}

export function applyBomb(state: GameState, index: number): GameState | null {
  if (state.bombsLeft <= 0) return null;
  const size = sizeOf(state.grid);
  const [r, c] = indexToCell(index, size);
  if (state.grid[r][c] === null) return null;
  const grid = clone(state.grid);
  const cells: [number, number][] = [
    [r, c],
    [r - 1, c],
    [r + 1, c],
    [r, c - 1],
    [r, c + 1],
  ];
  for (const [rr, cc] of cells) {
    if (rr >= 0 && rr < size && cc >= 0 && cc < size) grid[rr][cc] = null;
  }
  const spawned = spawnWithRng(grid, state.rngState);
  return {
    ...state,
    grid: spawned.grid,
    rngState: spawned.rngState,
    bombsLeft: state.bombsLeft - 1,
    gameOver: !canMove(spawned.grid),
  };
}