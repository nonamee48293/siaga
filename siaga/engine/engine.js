/*
 * SIAGA - Mesin skoring dan penjadwalan (murni logika, tanpa DOM).
 * Dipakai oleh index.html, ahp.html, dan diuji di Node (lihat tests/run-tests.js).
 *
 * Isi:
 *   1. Skoring SAW + tekanan waktu dinamis
 *   2. Pengurutan dan penjadwal harian (greedy + perbaikan EDF)
 *   3. AHP (bobot dari perbandingan berpasangan) dan agregasi respons
 *   4. Spearman, SUS
 *   5. Simulasi pembanding (SIAGA vs metode lain)
 *   6. Uji fungsi (black-box)
 */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* 1. SKORING                                                          */
  /* ------------------------------------------------------------------ */
  const CRITERIA = ['time', 'imp', 'diff', 'dur'];
  const CRITERIA_LABEL = { time: 'Tenggat', imp: 'Kepentingan', diff: 'Kesulitan', dur: 'Durasi' };
  const DEFAULT_W = { time: 0.35, imp: 0.30, diff: 0.20, dur: 0.15 };

  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

  function normW(w) {
    const s = (w.time + w.imp + w.diff + w.dur) || 1;
    return { time: w.time / s, imp: w.imp / s, diff: w.diff / s, dur: w.dur / s };
  }

  /* Jam luang rata-rata per hari dari 7 nilai (indeks = Date.getDay(), 0 = Minggu). Dipakai untuk info beban, bukan untuk skor. */
  function avgFreeOf(free) {
    const a = free.reduce((x, y) => x + y, 0) / free.length;
    return Math.max(a, 0.1);
  }

  /* Jendela urgensi: tugas yang tenggatnya lebih dari 7 hari lagi dianggap belum mendesak (urgensi 0) */
  const URGENCY_WINDOW_H = 168;

  /*
   * Skor 0-100 (metode SAW, Simple Additive Weighting):
   *   skor = 100 x ( w1*Urgensi + w2*Kepentingan + w3*Kesulitan + w4*Durasi )
   *   Urgensi     = 1 - min(sisa_jam, 168) / 168      (naik otomatis saat tenggat mendekat)
   *   Kepentingan = (tingkat-1)/4
   *   Kesulitan   = (tingkat-1)/4
   *   Durasi      = min(1, durasi/10)
   *   Tugas terlambat -> skor 100
   * Beban kerja terhadap jam luang tidak masuk skor, tetapi ditangani penjadwal harian (buildPlan).
   * task.deadline boleh string tanggal-waktu lokal atau angka milidetik.
   * Keluaran menyertakan "pressure" (= urgensi) agar kompatibel dengan tampilan.
   */
  function scoreTask(task, nowMs, w) {
    const wn = normW(w);
    const left = (new Date(task.deadline).getTime() - nowMs) / 36e5;
    const overdue = left <= 0;
    const urgency = overdue ? 1 : clamp(1 - left / URGENCY_WINDOW_H);
    const n = { time: urgency, imp: (task.imp - 1) / 4, diff: (task.diff - 1) / 4, dur: clamp(task.dur / 10) };
    const pts = { time: wn.time * n.time * 100, imp: wn.imp * n.imp * 100, diff: wn.diff * n.diff * 100, dur: wn.dur * n.dur * 100 };
    const sum = pts.time + pts.imp + pts.diff + pts.dur;
    return { total: overdue ? 100 : sum, pts, n, left, overdue, urgency, pressure: urgency };
  }

  /* ------------------------------------------------------------------ */
  /* 2. PENGURUTAN DAN PENJADWAL                                         */
  /* ------------------------------------------------------------------ */
  function rankTasks(tasks, nowMs, w) {
    const rows = tasks.filter(t => !t.done).map(t => Object.assign({ task: t }, scoreTask(t, nowMs, w)));
    rows.sort((a, b) =>
      (b.total - a.total) ||
      (new Date(a.task.deadline) - new Date(b.task.deadline)) ||
      (b.task.imp - a.task.imp) ||
      (a.task.id - b.task.id));
    rows.forEach((r, i) => { r.rank = i + 1; });
    return rows;
  }

  function runPlan(ranked, nowMs, freeByDow, maxSession, horizon) {
    const start = new Date(nowMs); start.setHours(0, 0, 0, 0);
    const days = [];
    for (let i = 0; i < horizon; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const cap = freeByDow[d.getDay()];
      days.push({ date: d, cap, left: cap, blocks: [] });
    }
    const endMs = days[horizon - 1].date.getTime() + 864e5;
    const issues = [];
    for (const r of ranked) {
      let rem = r.task.dur;
      const dl = new Date(r.task.deadline).getTime();
      let progress = true;
      while (rem > 1e-9 && progress) {
        progress = false;
        for (let i = 0; i < days.length; i++) {
          const day = days[i];
          if (rem <= 1e-9) break;
          if (day.date.getTime() > dl && !(r.overdue && i === 0)) break;
          const give = Math.min(rem, day.left, maxSession);
          if (give > 1e-9) {
            const ex = day.blocks.find(b => b.id === r.task.id);
            if (ex) ex.hours += give; else day.blocks.push({ id: r.task.id, hours: give });
            day.left -= give; rem -= give; progress = true;
          }
        }
      }
      if (rem > 1e-9) issues.push({ id: r.task.id, rem, beyond: dl >= endMs, overdue: r.overdue });
    }
    days.forEach(d => { d.used = d.cap - d.left; });
    return { days, issues };
  }

  /*
   * Penjadwal harian:
   *  - tugas berskor tertinggi mendapat slot paling awal (greedy)
   *  - satu sesi maksimal maxSession jam, slot tidak melewati tenggat
   *  - langkah perbaikan: tugas yang kekurangan jam dimajukan, lalu urutan EDF
   *    (tenggat terdekat) dicoba sebagai kandidat; dipilih rencana dengan
   *    kekurangan jam paling sedikit.
   */
  function buildPlan(ranked, nowMs, freeByDow, maxSession = 3, horizon = 7) {
    const shortOf = p => p.issues.filter(x => !x.beyond && !x.overdue).reduce((a, x) => a + x.rem, 0);
    let order = ranked.slice(), best = null, bestShort = Infinity;
    for (let it = 0; it <= ranked.length * 2; it++) {
      const p = runPlan(order, nowMs, freeByDow, maxSession, horizon);
      const real = p.issues.filter(x => !x.beyond && !x.overdue);
      const short = shortOf(p);
      if (short < bestShort) { best = p; bestShort = short; }
      if (!real.length) break;
      const id = real[0].id;
      order = order.filter(r => r.task.id === id).concat(order.filter(r => r.task.id !== id));
    }
    const edf = ranked.slice().sort((a, b) => new Date(a.task.deadline) - new Date(b.task.deadline) || a.rank - b.rank);
    const pe = runPlan(edf, nowMs, freeByDow, maxSession, horizon);
    if (shortOf(pe) < bestShort) { best = pe; bestShort = shortOf(pe); }
    return best || runPlan(order, nowMs, freeByDow, maxSession, horizon);
  }

  /* ------------------------------------------------------------------ */
  /* 3. AHP                                                              */
  /* ------------------------------------------------------------------ */
  const RI = { 1: 0, 2: 0, 3: 0.58, 4: 0.90, 5: 1.12 };
  /* urutan 6 pasangan untuk 4 kriteria: (0,1) (0,2) (0,3) (1,2) (1,3) (2,3) */
  const PAIRS = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];

  /* Slider -8..8 -> nilai Saaty: 0 = 1 (sama penting), +p = p+1 (kiri lebih penting), -p = 1/(|p|+1) */
  function pairToRatio(p) { return p >= 0 ? p + 1 : 1 / (1 - p); }

  function matrixFromPairs(pairs) {
    const n = 4;
    const m = Array.from({ length: n }, () => Array(n).fill(1));
    PAIRS.forEach(([i, j], k) => {
      const v = pairToRatio(Number(pairs[k]) || 0);
      m[i][j] = v; m[j][i] = 1 / v;
    });
    return m;
  }

  /* Bobot dengan metode rata-rata geometrik baris, plus uji konsistensi (CR < 0,1 dianggap konsisten) */
  function ahp(m) {
    const n = m.length;
    const gm = m.map(r => Math.pow(r.reduce((a, b) => a * b, 1), 1 / n));
    const s = gm.reduce((a, b) => a + b, 0);
    const w = gm.map(x => x / s);
    const aw = m.map(r => r.reduce((a, v, j) => a + v * w[j], 0));
    const lmax = aw.reduce((a, v, i) => a + v / w[i], 0) / n;
    const ci = n > 1 ? (lmax - n) / (n - 1) : 0;
    const ri = RI[n] || 0;
    const cr = ri ? ci / ri : 0;
    return { w, lmax, ci, cr, consistent: cr < 0.1 };
  }

  function weightsObj(wArr) { return { time: wArr[0], imp: wArr[1], diff: wArr[2], dur: wArr[3] }; }

  /* Agregasi banyak responden: rata-rata geometrik tiap elemen matriks */
  function aggregateMatrices(mats) {
    const n = 4, k = mats.length;
    const out = Array.from({ length: n }, () => Array(n).fill(1));
    if (!k) return out;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      out[i][j] = Math.pow(mats.reduce((a, m) => a * m[i][j], 1), 1 / k);
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* 4. SPEARMAN DAN SUS                                                 */
  /* ------------------------------------------------------------------ */
  function spearman(sys, man) {
    const n = sys.length;
    if (n < 3) return null;
    let d2 = 0;
    for (let i = 0; i < n; i++) d2 += (sys[i] - man[i]) ** 2;
    return 1 - (6 * d2) / (n * (n * n - 1));
  }

  /* SUS: 10 jawaban skala 1-5. Butir ganjil: (x-1), butir genap: (5-x). Jumlah x 2,5 */
  function susScore(a) {
    if (!Array.isArray(a) || a.length !== 10 || a.some(x => !(x >= 1 && x <= 5))) return null;
    let s = 0;
    a.forEach((x, i) => { s += (i % 2 === 0) ? (x - 1) : (5 - x); });
    return s * 2.5;
  }

  /* ------------------------------------------------------------------ */
  /* 5. SIMULASI PEMBANDING                                              */
  /* ------------------------------------------------------------------ */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const BASE_MS = Date.UTC(2026, 0, 5, 0, 0, 0);
  const DAY_MS = 864e5;

  /* Skenario acak: 5-10 tugas, rilis hari 0-6, tenggat 1-7 hari setelah rilis, kapasitas 2,5-4 jam/hari */
  function makeScenario(rand) {
    const n = 5 + Math.floor(rand() * 6);
    const cap = [2.5, 3, 3.5, 4][Math.floor(rand() * 4)];
    const tasks = [];
    for (let i = 0; i < n; i++) {
      const release = Math.floor(rand() * 7);
      const window = 1 + Math.floor(rand() * 7);
      tasks.push({
        id: i + 1, release, dlDay: release + window,
        dur: 1 + Math.floor(rand() * 11) / 2,          /* 1 - 6 jam, kelipatan 0,5 */
        diff: 1 + Math.floor(rand() * 5),
        imp: 1 + Math.floor(rand() * 5)
      });
    }
    return { tasks, cap };
  }

  const METHODS = {
    siaga: { label: 'SIAGA (skor 4 parameter)' },
    edf:   { label: 'Tenggat terdekat saja' },
    imp:   { label: 'Kepentingan tertinggi saja' },
    fifo:  { label: 'Urutan masuk (FIFO)' }
  };

  function runScenario(sc, method, w) {
    const H = 20;
    const st = sc.tasks.map(t => ({ id: t.id, release: t.release, dlDay: t.dlDay, dur: t.dur, diff: t.diff, imp: t.imp, rem: t.dur, deadline: BASE_MS + (t.dlDay + 1) * DAY_MS }));
    for (let day = 0; day < H; day++) {
      let budget = sc.cap;
      const avail = st.filter(t => t.release <= day && t.rem > 1e-9 && day <= t.dlDay);
      let order;
      if (method === 'siaga') {
        const now = BASE_MS + day * DAY_MS;
        order = avail.map(t => ({ t, s: scoreTask(t, now, w).total }))
          .sort((a, b) => b.s - a.s || a.t.dlDay - b.t.dlDay || a.t.id - b.t.id).map(x => x.t);
      } else if (method === 'edf') {
        order = avail.slice().sort((a, b) => a.dlDay - b.dlDay || a.id - b.id);
      } else if (method === 'imp') {
        order = avail.slice().sort((a, b) => b.imp - a.imp || a.dlDay - b.dlDay || a.id - b.id);
      } else {
        order = avail.slice().sort((a, b) => a.release - b.release || a.id - b.id);
      }
      for (const t of order) {
        if (budget <= 1e-9) break;
        const g = Math.min(t.rem, budget);
        t.rem -= g; budget -= g;
      }
    }
    const missed = st.filter(t => t.rem > 1e-9);
    return {
      missed: missed.length,
      total: st.length,
      lossImp: missed.reduce((a, t) => a + t.imp, 0),
      totalImp: st.reduce((a, t) => a + t.imp, 0),
      lateHours: missed.reduce((a, t) => a + t.rem, 0)
    };
  }

  /* Jalankan N skenario dengan seed tetap supaya hasil bisa diulang dan dilaporkan */
  function simulate(opts, w) {
    const N = (opts && opts.n) || 30, seed = (opts && opts.seed) || 2026;
    const rand = mulberry32(seed);
    const scs = Array.from({ length: N }, () => makeScenario(rand));
    const out = {};
    Object.keys(METHODS).forEach(m => {
      let missed = 0, total = 0, lossImp = 0, totalImp = 0, lateHours = 0, perfect = 0;
      scs.forEach(sc => {
        const r = runScenario(sc, m, w);
        missed += r.missed; total += r.total; lossImp += r.lossImp; totalImp += r.totalImp; lateHours += r.lateHours;
        if (r.missed === 0) perfect++;
      });
      out[m] = {
        label: METHODS[m].label,
        missedPct: total ? missed / total * 100 : 0,
        lossImpPct: totalImp ? lossImp / totalImp * 100 : 0,
        lateHoursAvg: lateHours / N,
        perfectPct: perfect / N * 100
      };
    });
    return { n: N, seed, results: out };
  }

  /* ------------------------------------------------------------------ */
  /* 6. UJI FUNGSI (black-box)                                           */
  /* ------------------------------------------------------------------ */
  const f1 = x => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');

  function runTests(w, free, nowMs, tasks) {
    const iso = h => {
      const d = new Date(nowMs + h * 36e5), p = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    };
    const B = (o = {}) => Object.assign({ id: 1, dur: 3, diff: 3, imp: 3, done: false, deadline: iso(72) }, o);
    const s = (t, at = nowMs) => scoreTask(t, at, w).total;
    const out = [];
    const cmp = (name, a, b, label) => out.push({ name, got: `${f1(a)} > ${f1(b)} (${label})`, pass: a > b });

    cmp('Tenggat lebih dekat menaikkan skor', s(B({ deadline: iso(24) })), s(B({ deadline: iso(72) })), '24 jam vs 72 jam');
    cmp('Kepentingan lebih tinggi menaikkan skor', s(B({ imp: 5 })), s(B({ imp: 2 })), 'level 5 vs 2');
    cmp('Kesulitan lebih tinggi menaikkan skor', s(B({ diff: 5 })), s(B({ diff: 1 })), 'level 5 vs 1');
    cmp('Durasi lebih panjang menaikkan skor', s(B({ dur: 8 })), s(B({ dur: 2 })), '8 jam vs 2 jam');
    cmp('Prioritas dinamis: skor naik saat waktu maju', s(B(), nowMs + 24 * 36e5), s(B(), nowMs), '+24 jam vs sekarang');

    const od = rankTasks([B({ id: 2, deadline: iso(-3) }), B({ id: 3, imp: 5, diff: 5, dur: 10, deadline: iso(5) })], nowMs, w);
    out.push({ name: 'Tugas terlambat bernilai 100 dan berperingkat 1', got: `skor ${f1(od[0].total)}, tugas #${od[0].task.id}`, pass: od[0].total === 100 && od[0].task.id === 2 });

    const lo = s(B({ dur: 0.5, diff: 1, imp: 1, deadline: iso(720) })), hi = s(B({ dur: 40, diff: 5, imp: 5, deadline: iso(1) }));
    out.push({ name: 'Skor selalu di rentang 0 sampai 100', got: `terendah ${f1(lo)}, tertinggi ${f1(hi)}`, pass: lo >= 0 && hi <= 100 });

    const r1 = rankTasks(tasks, nowMs, w).map(r => r.task.id).join(',');
    const r2 = rankTasks(tasks.slice().reverse(), nowMs, w).map(r => r.task.id).join(',');
    out.push({ name: 'Urutan tidak bergantung urutan input', got: `[${r1}] sama dengan [${r2}]`, pass: r1 === r2 });

    const wd = rankTasks([B({ id: 7 }), B({ id: 8, done: true })], nowMs, w);
    out.push({ name: 'Tugas selesai tidak masuk antrean', got: `${wd.length} tugas aktif dari 2`, pass: wd.length === 1 });

    const plan = buildPlan(rankTasks(tasks, nowMs, w), nowMs, free);
    const capOk = plan.days.every(d => d.blocks.reduce((a, b) => a + b.hours, 0) <= d.cap + 1e-9);
    out.push({ name: 'Rencana harian tidak melebihi jam luang', got: capOk ? 'semua hari dalam kapasitas' : 'ada hari melebihi kapasitas', pass: capOk });

    const urg = B({ id: 11, dur: 3, diff: 1, imp: 1, deadline: iso(20) }), big = B({ id: 12, dur: 8, diff: 5, imp: 5, deadline: iso(120) });
    const p2 = buildPlan(rankTasks([big, urg], nowMs, w), nowMs, free);
    const urgH = p2.days.reduce((a, d) => a + d.blocks.filter(b => b.id === 11).reduce((x, b) => x + b.hours, 0), 0);
    out.push({ name: 'Tugas bertenggat mepet tetap kebagian slot', got: `${f1(urgH)} dari 3,0 jam terjadwal`, pass: Math.abs(urgH - 3) < 1e-9 });

    const dlOk = plan.days.every(d => d.blocks.every(b => {
      const t = tasks.find(x => x.id === b.id);
      return t && (d.date.getTime() <= new Date(t.deadline).getTime() || new Date(t.deadline).getTime() < nowMs);
    }));
    out.push({ name: 'Slot tidak ditempatkan setelah tenggat', got: dlOk ? 'semua slot sebelum tenggat' : 'ada slot setelah tenggat', pass: dlOk });

    const eq = ahp(matrixFromPairs([0, 0, 0, 0, 0, 0]));
    out.push({ name: 'AHP: semua perbandingan sama menghasilkan bobot 25% dan CR 0', got: `bobot ${f1(eq.w[0] * 100)}%, CR ${eq.cr.toFixed(3).replace('.', ',')}`, pass: Math.abs(eq.w[0] - 0.25) < 1e-9 && Math.abs(eq.cr) < 1e-9 });

    const cons = ahp(matrixFromPairs([1, 2, 3, 1, 2, 1]));
    const sumW = cons.w.reduce((a, b) => a + b, 0);
    out.push({ name: 'AHP: bobot berjumlah 1 dan urutan sesuai input', got: `jumlah ${sumW.toFixed(3).replace('.', ',')}, CR ${cons.cr.toFixed(3).replace('.', ',')}`, pass: Math.abs(sumW - 1) < 1e-9 && cons.w[0] > cons.w[1] && cons.w[1] > cons.w[2] && cons.w[2] > cons.w[3] });

    const incons = ahp(matrixFromPairs([8, -8, 8, 8, -8, 8]));
    out.push({ name: 'AHP: jawaban saling bertentangan terdeteksi (CR ≥ 0,1)', got: `CR ${incons.cr.toFixed(3).replace('.', ',')}`, pass: incons.cr >= 0.1 });

    const sp1 = spearman([1, 2, 3, 4], [1, 2, 3, 4]), sp2 = spearman([1, 2, 3, 4], [4, 3, 2, 1]);
    out.push({ name: 'Spearman: urutan sama = 1, urutan terbalik = -1', got: `${sp1.toFixed(2).replace('.', ',')} dan ${sp2.toFixed(2).replace('.', ',')}`, pass: sp1 === 1 && sp2 === -1 });

    const sus = susScore([5, 1, 5, 1, 5, 1, 5, 1, 5, 1]), sus0 = susScore([1, 5, 1, 5, 1, 5, 1, 5, 1, 5]);
    out.push({ name: 'SUS: jawaban terbaik = 100, terburuk = 0', got: `${sus} dan ${sus0}`, pass: sus === 100 && sus0 === 0 });
    return out;
  }

  const API = {
    CRITERIA, CRITERIA_LABEL, DEFAULT_W, PAIRS, METHODS, URGENCY_WINDOW_H,
    clamp, normW, avgFreeOf, scoreTask, rankTasks, buildPlan,
    pairToRatio, matrixFromPairs, ahp, weightsObj, aggregateMatrices,
    spearman, susScore, mulberry32, makeScenario, runScenario, simulate, runTests, f1
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.SIAGA = API;
})(typeof window !== 'undefined' ? window : globalThis);
