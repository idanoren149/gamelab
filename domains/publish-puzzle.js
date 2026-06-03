#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const QUEUE_FILE = path.join(__dirname, 'puzzles-queue.json');
const GAME_FILE  = path.join(__dirname, 'nodal-domains-v2.html');
const MARKER     = '  // ── Add future puzzles below';

const queue    = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
const approved = queue.filter(p => p.status === 'approved');

if (approved.length === 0) {
  console.log('No approved puzzles. Nothing to publish.');
  process.exit(0);
}

const html = fs.readFileSync(GAME_FILE, 'utf8');

// Extract last published date and day number from existing PUZZLES array
const dateMatches = [...html.matchAll(/date:\s*'(\d{4}-\d{2}-\d{2})'/g)];
const nameMatches = [...html.matchAll(/name:\s*'Day\s*(\d+)'/g)];

let lastDate = '2026-05-26';
let lastDay  = 3;
if (dateMatches.length > 0) lastDate = dateMatches[dateMatches.length - 1][1];
if (nameMatches.length > 0) lastDay  = Math.max(...nameMatches.map(m => parseInt(m[1])));

function nextDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}`;
}

function fmtSolution(sol) {
  const rows = sol.map(row => '      [' + row.join(', ') + '],');
  return '[\n' + rows.join('\n') + '\n    ]';
}

function fmtSeeds(seeds) {
  const lines = Object.entries(seeds).map(([k, v]) => `      '${k}': ${v}`);
  return '{\n' + lines.join(',\n') + ',\n    }';
}

let insertText  = '';
let currentDate = lastDate;
let currentDay  = lastDay;

for (const puzz of approved) {
  currentDate = nextDay(currentDate);
  currentDay++;
  insertText +=
`  {
    id: ${currentDay}, name: 'Day ${currentDay}', difficulty: '${puzz.difficulty}',
    date: '${currentDate}',
    rows: ${puzz.rows}, cols: ${puzz.cols}, target: ${puzz.target},
    solution: ${fmtSolution(puzz.solution)},
    seeds: ${fmtSeeds(puzz.seeds)},
  },\n`;
}

const markerIdx = html.indexOf(MARKER);
if (markerIdx === -1) {
  console.error('ERROR: marker comment not found in nodal-domains-v2.html');
  process.exit(1);
}

const newHtml = html.slice(0, markerIdx) + insertText + html.slice(markerIdx);
fs.writeFileSync(GAME_FILE, newHtml);

for (const puzz of approved) puzz.status = 'published';
fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));

console.log(`Published ${approved.length} puzzle(s): Days ${lastDay + 1}–${currentDay} (${nextDay(lastDate)} to ${currentDate})`);
