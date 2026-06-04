#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const QUEUE_FILE = path.join(__dirname, 'puzzles-queue.json');
const GAME_FILE  = path.join(__dirname, 'parity.html');
const MARKER     = '  // ── Add future puzzles below';

if (!fs.existsSync(QUEUE_FILE)) { console.error(`ERROR: Queue file not found: ${QUEUE_FILE}`); process.exit(1); }
if (!fs.existsSync(GAME_FILE))  { console.error(`ERROR: Game file not found: ${GAME_FILE}`); process.exit(1); }

function nextDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}`;
}

function fmtObj(obj) {
  const entries = Object.entries(obj).map(([k, v]) => `'${k}': ${v}`).join(', ');
  return `{ ${entries} }`;
}

const queue    = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
const approved = queue.filter(p => p.status === 'approved');

if (approved.length === 0) {
  console.log('No approved puzzles to publish.');
  process.exit(0);
}

for (const p of approved) {
  if (!p.shape || !p.clues || !p.solution) {
    console.error(`ERROR: approved puzzle id ${p.id} is missing shape, clues, or solution`);
    process.exit(1);
  }
}

let html = fs.readFileSync(GAME_FILE, 'utf8');

const dateMatches = [...html.matchAll(/date:\s*'(\d{4}-\d{2}-\d{2})'/g)];
const idMatches   = [...html.matchAll(/\bid:\s*(\d+),/g)];

let lastDate = dateMatches.length > 0 ? dateMatches[dateMatches.length - 1][1] : '2026-05-25';
let lastId   = idMatches.length > 0   ? parseInt(idMatches[idMatches.length - 1][1], 10) : 0;

let insert = '';
for (const p of approved) {
  lastDate = nextDateStr(lastDate);
  lastId++;
  insert += `  {\n`;
  insert += `    id: ${lastId}, name: 'Day ${lastId}',\n`;
  insert += `    date: '${lastDate}',\n`;
  insert += `    shape: '${p.shape}',\n`;
  insert += `    clues:    ${fmtObj(p.clues)},\n`;
  insert += `    solution: ${fmtObj(p.solution)},\n`;
  insert += `  },\n`;
}

const markerIdx = html.indexOf(MARKER);
if (markerIdx === -1) {
  console.error('ERROR: marker not found in parity.html');
  process.exit(1);
}

html = html.slice(0, markerIdx) + insert + html.slice(markerIdx);
fs.writeFileSync(GAME_FILE, html);

for (const p of approved) {
  const entry = queue.find(q => q.id === p.id);
  if (!entry) { console.error(`ERROR: approved puzzle id ${p.id} not found in queue`); process.exit(1); }
  entry.status = 'published';
}
fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));

console.log(`Published ${approved.length} puzzle(s). Last date: ${lastDate}`);
