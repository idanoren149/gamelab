#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, 'puzzles-queue.json');
const TARGET      = parseInt(process.argv[2]) || 30;

const SHAPES = {
  'staircase':      [{o:0,l:6},{o:0,l:6},{o:0,l:4},{o:0,l:4},{o:0,l:2},{o:0,l:2}],
  'diamond':        [{o:2,l:2},{o:1,l:4},{o:0,l:6},{o:0,l:6},{o:1,l:4},{o:2,l:2}],
  'wide-staircase': [{o:0,l:8},{o:0,l:8},{o:0,l:6},{o:0,l:6},{o:0,l:4},{o:0,l:4},{o:0,l:2},{o:0,l:2}],
};

const SHAPE_WEIGHTS = [
  { shape: 'staircase',      weight: 40 },
  { shape: 'diamond',        weight: 40 },
  { shape: 'wide-staircase', weight: 20 },
];

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function pickWeighted(items) {
  const total = items.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const item of items) { r -= item.weight; if (r <= 0) return item.shape; }
  return items[items.length - 1].shape;
}

const validRowsCache = {};
function validRows(n) {
  if (validRowsCache[n]) return validRowsCache[n];
  const half = n / 2;
  const results = [];
  const arr = new Array(n);
  function bt(pos, sum, plusLeft, minusLeft) {
    if (pos === n) { results.push([...arr]); return; }
    if (plusLeft > 0)                  { arr[pos] = 1;  bt(pos+1, sum+1, plusLeft-1, minusLeft); }
    if (minusLeft > 0 && sum-1 >= -1) { arr[pos] = -1; bt(pos+1, sum-1, plusLeft, minusLeft-1); }
  }
  bt(0, 0, half, half);
  validRowsCache[n] = results;
  return results;
}

function colHeights(shape) {
  const maxCol = Math.max(...shape.map(r => r.o + r.l));
  const h = new Array(maxCol).fill(0);
  for (const row of shape) for (let c = row.o; c < row.o + row.l; c++) h[c]++;
  return h;
}

function generateSolution(shape) {
  const heights = colHeights(shape);
  const maxCol  = heights.length;
  const colSums   = new Array(maxCol).fill(0);
  const colFilled = new Array(maxCol).fill(0);
  const grid = {};

  function solve(rowIdx) {
    if (rowIdx === shape.length) return true;
    const { o, l } = shape[rowIdx];
    const rows = [...validRows(l)];
    shuffle(rows);
    for (const row of rows) {
      let ok = true;
      for (let i = 0; i < l && ok; i++) {
        const c = o + i;
        const ns = colSums[c] + row[i];
        if (ns < -1) { ok = false; break; }
        if (colFilled[c] + 1 === heights[c] && ns !== 0) { ok = false; break; }
      }
      if (!ok) continue;
      for (let i = 0; i < l; i++) {
        const c = o + i;
        grid[`${rowIdx},${c}`] = row[i];
        colSums[c] += row[i];
        colFilled[c]++;
      }
      if (solve(rowIdx + 1)) return true;
      for (let i = 0; i < l; i++) {
        const c = o + i;
        delete grid[`${rowIdx},${c}`];
        colSums[c] -= row[i];
        colFilled[c]--;
      }
    }
    return false;
  }
  return solve(0) ? grid : null;
}

function countSolutions(clues, shape, limit = 2) {
  const heights = colHeights(shape);
  const maxCol  = heights.length;
  const cells = [];
  for (let r = 0; r < shape.length; r++) {
    const { o, l } = shape[r];
    for (let c = o; c < o + l; c++) {
      const key = `${r},${c}`;
      cells.push({ r, c, key, fixed: key in clues, fixedVal: clues[key] });
    }
  }
  const colSums   = new Array(maxCol).fill(0);
  const colFilled = new Array(maxCol).fill(0);
  const rowSums   = new Array(shape.length).fill(0);
  const rowFilled = new Array(shape.length).fill(0);
  let count = 0;

  function bt(idx) {
    if (count >= limit) return;
    if (idx === cells.length) { count++; return; }
    const { r, c, fixed, fixedVal } = cells[idx];
    const choices = fixed ? [fixedVal] : [1, -1];
    for (const v of choices) {
      const nr = rowSums[r] + v;
      const nc = colSums[c] + v;
      if (nr < -1) continue;
      if (nc < -1) continue;
      if (rowFilled[r] + 1 === shape[r].l && nr !== 0) continue;
      if (colFilled[c] + 1 === heights[c] && nc !== 0) continue;
      rowSums[r] += v;   rowFilled[r]++;
      colSums[c] += v;   colFilled[c]++;
      bt(idx + 1);
      rowSums[r] -= v;   rowFilled[r]--;
      colSums[c] -= v;   colFilled[c]--;
      if (count >= limit) return;
    }
  }
  bt(0);
  return count;
}

function minimizeClues(solution, shape) {
  const clues = { ...solution };
  const keys  = Object.keys(clues);
  shuffle(keys);
  for (const key of keys) {
    const saved = clues[key];
    delete clues[key];
    if (countSolutions(clues, shape) > 1) clues[key] = saved;
  }
  return clues;
}

function makePuzzle(shapeName) {
  const shape    = SHAPES[shapeName];
  const solution = generateSolution(shape);
  if (!solution) return null;
  const clues    = minimizeClues(solution, shape);
  return { shape: shapeName, clues, solution };
}

// ── Main ──────────────────────────────────────────────────────────────────────
const existing = fs.existsSync(OUTPUT_FILE)
  ? JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'))
  : [];

const pendingCount = existing.filter(p => p.status === 'pending').length;
if (pendingCount >= TARGET) {
  console.log(`Queue already has ${pendingCount} pending puzzles (target: ${TARGET}). Nothing to do.`);
  process.exit(0);
}

const toGenerate = TARGET - pendingCount;
const maxId = existing.reduce((m, p) => Math.max(m, p.id || 0), 0);
let nextId = maxId + 1;
let generated = 0, attempts = 0;

while (generated < toGenerate && attempts < toGenerate * 30) {
  attempts++;
  const shapeName = pickWeighted(SHAPE_WEIGHTS);
  process.stdout.write(`  [${generated+1}/${toGenerate}] ${shapeName}...`);
  const puzz = makePuzzle(shapeName);
  if (!puzz) { process.stdout.write(' FAILED\n'); continue; }
  existing.push({
    id: nextId,
    status: 'pending',
    shape: puzz.shape,
    clues: puzz.clues,
    solution: puzz.solution,
  });
  nextId++;
  process.stdout.write(' done\n');
  generated++;
}

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(existing, null, 2));
console.log(`\nDone. Generated ${generated}/${toGenerate}. Saved to puzzles-queue.json`);
