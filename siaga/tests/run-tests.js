/*
 * Menjalankan uji fungsi dan simulasi pembanding di terminal:
 *   node tests/run-tests.js
 * Hasilnya bisa dilampirkan sebagai bukti pengujian di proposal (Bab 3.5).
 */
const S = require('../engine/engine.js');

const now = Date.now();
const p = n => String(n).padStart(2, '0');
const iso = h => { const d = new Date(now + h * 36e5); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const tasks = [
  { id: 1, dur: 4, diff: 3, imp: 4, deadline: iso(20), done: false },
  { id: 2, dur: 2, diff: 4, imp: 3, deadline: iso(46), done: false },
  { id: 3, dur: 6, diff: 4, imp: 5, deadline: iso(96), done: false },
  { id: 4, dur: 3, diff: 2, imp: 2, deadline: iso(72), done: false },
  { id: 5, dur: 2, diff: 1, imp: 2, deadline: iso(144), done: false },
  { id: 6, dur: 8, diff: 5, imp: 5, deadline: iso(120), done: false }
];
const free = [5, 4, 4, 4, 4, 4, 5];

console.log('=== UJI FUNGSI ===');
const res = S.runTests(S.DEFAULT_W, free, now, tasks);
res.forEach(r => console.log((r.pass ? 'LOLOS ' : 'GAGAL ') + r.name + '  |  ' + r.got));
const passed = res.filter(r => r.pass).length;
console.log(`\n${passed} dari ${res.length} uji lolos\n`);

console.log('=== SIMULASI PEMBANDING (bobot bawaan, 200 skenario, seed 2026) ===');
const sim = S.simulate({ n: 200, seed: 2026 }, S.DEFAULT_W);
Object.values(sim.results).forEach(r => {
  console.log(r.label.padEnd(30), 'tugas terlewat', r.missedPct.toFixed(1).padStart(5) + '%',
    '| bobot kepentingan hilang', r.lossImpPct.toFixed(1).padStart(5) + '%',
    '| skenario tanpa terlewat', r.perfectPct.toFixed(0).padStart(3) + '%');
});

process.exit(passed === res.length ? 0 : 1);
