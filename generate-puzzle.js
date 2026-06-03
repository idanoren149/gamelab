#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const QUEUE_FILE = path.join(__dirname, 'puzzles-queue.json');
const TARGET     = parseInt(process.argv[2]) || 30;
const DIRS       = [[-1,0],[1,0],[0,-1],[0,1]];

const DIFF_PRESETS = {
  Easy:   { rows: 4, cols: 4, targetMin: 3, targetMax: 5 },
  Medium: { rows: 5, cols: 5, targetMin: 4, targetMax: 7 },
  Hard:   { rows: 5, cols: 6, targetMin: 5, targetMax: 9 },
};
const DIFF_CYCLE = ['Easy', 'Medium', 'Medium', 'Hard'];

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

function countDomains(g, rows, cols) {
  const vis = Array.from({length: rows}, () => new Array(cols).fill(false));
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (g[r][c] === -1 || vis[r][c]) continue;
      n++;
      const color = g[r][c], q = [[r, c]];
      vis[r][c] = true;
      while (q.length) {
        const [cr, cc] = q.shift();
        for (const [dr, dc] of DIRS) {
          const nr = cr+dr, nc = cc+dc;
          if (nr>=0 && nr<rows && nc>=0 && nc<cols && g[nr][nc]===color && !vis[nr][nc]) {
            vis[nr][nc] = true; q.push([nr, nc]);
          }
        }
      }
    }
  }
  return n;
}

function generateSolution(rows, cols, target) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const cells = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) cells.push([r, c]);
    shuffle(cells);
    const seeds = cells.slice(0, target);

    const region = Array.from({length: rows}, () => new Array(cols).fill(-1));
    const frontier = [];
    for (let i = 0; i < seeds.length; i++) {
      region[seeds[i][0]][seeds[i][1]] = i;
      frontier.push([seeds[i][0], seeds[i][1]]);
    }
    while (frontier.length) {
      const idx = Math.floor(Math.random() * frontier.length);
      const [r, c] = frontier.splice(idx, 1)[0];
      for (const [dr, dc] of DIRS) {
        const nr = r+dr, nc = c+dc;
        if (nr>=0 && nr<rows && nc>=0 && nc<cols && region[nr][nc]===-1) {
          region[nr][nc] = region[r][c]; frontier.push([nr, nc]);
        }
      }
    }

    const adj = Array.from({length: target}, () => new Set());
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        for (const [dr, dc] of [[0,1],[1,0]]) {
          const nr = r+dr, nc = c+dc;
          if (nr<rows && nc<cols && region[r][c]!==region[nr][nc]) {
            const a = region[r][c], b = region[nr][nc];
            adj[a].add(b); adj[b].add(a);
          }
        }

    const rCol = new Array(target).fill(-1);
    let ok = true;
    for (let s = 0; s < target && ok; s++) {
      if (rCol[s] !== -1) continue;
      rCol[s] = 0; const q = [s];
      while (q.length && ok) {
        const node = q.shift();
        for (const nb of adj[node]) {
          if (rCol[nb] === -1) { rCol[nb] = 1 - rCol[node]; q.push(nb); }
          else if (rCol[nb] === rCol[node]) ok = false;
        }
      }
    }
    if (!ok) continue;

    const sol = Array.from({length: rows}, () => new Array(cols).fill(0));
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) sol[r][c] = rCol[region[r][c]];
    if (countDomains(sol, rows, cols) !== target) continue;
    return sol;
  }
  return null;
}

function pickSeeds(sol, rows, cols) {
  const vis = Array.from({length: rows}, () => new Array(cols).fill(false));
  const seeds = {};
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (vis[r][c]) continue;
      const color = sol[r][c], domain = [], q = [[r, c]];
      vis[r][c] = true;
      while (q.length) {
        const [cr, cc] = q.shift(); domain.push([cr, cc]);
        for (const [dr, dc] of DIRS) {
          const nr = cr+dr, nc = cc+dc;
          if (nr>=0 && nr<rows && nc>=0 && nc<cols && sol[nr][nc]===color && !vis[nr][nc]) {
            vis[nr][nc] = true; q.push([nr, nc]);
          }
        }
      }
      const pick = domain[Math.floor(Math.random() * domain.length)];
      seeds[`${pick[0]},${pick[1]}`] = color;
    }
  }
  return seeds;
}

function makePuzzle(difficulty) {
  const p = DIFF_PRESETS[difficulty];
  const target = p.targetMin + Math.floor(Math.random() * (p.targetMax - p.targetMin + 1));
  const sol = generateSolution(p.rows, p.cols, target);
  if (!sol) return null;
  const seeds = pickSeeds(sol, p.rows, p.cols);
  return { rows: p.rows, cols: p.cols, target, difficulty, solution: sol, seeds };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const queue  = fs.existsSync(QUEUE_FILE) ? JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')) : [];
const active = queue.filter(p => p.status === 'pending' || p.status === 'approved').length;
const needed = Math.max(0, TARGET - active);

if (needed === 0) {
  console.log(`Queue already has ${active} active puzzles. Nothing to do.`);
  process.exit(0);
}

console.log(`Generating ${needed} puzzles (${active} active, target ${TARGET})...`);
const maxId      = queue.reduce((m, p) => Math.max(m, p.id || 0), 0);
let nextId       = maxId + 1;
const cycleStart = queue.length % DIFF_CYCLE.length;
let generated = 0, attempts = 0;

while (generated < needed && attempts < needed * 15) {
  attempts++;
  const diff = DIFF_CYCLE[(cycleStart + generated) % DIFF_CYCLE.length];
  const puzz = makePuzzle(diff);
  if (!puzz) continue;
  queue.push({
    id: nextId++, difficulty: puzz.difficulty, status: 'pending',
    rows: puzz.rows, cols: puzz.cols, target: puzz.target,
    solution: puzz.solution, seeds: puzz.seeds,
  });
  generated++;
  process.stdout.write(`  [${generated}/${needed}] ${diff} ${puzz.rows}x${puzz.cols} target=${puzz.target}\n`);
}

fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
console.log(`Done. Generated ${generated}/${needed}.`);
