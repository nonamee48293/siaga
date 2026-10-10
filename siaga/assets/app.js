/* SIAGA - logika antarmuka. Mesin ada di engine/engine.js, data di assets/store.js. */
(function () {
  'use strict';
  const S = window.SIAGA, Store = window.Store, Ahp = window.AhpUI;
  const $ = id => document.getElementById(id);
  const esc = Ahp.esc;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const DIFF_L = ['', 'Sangat mudah', 'Mudah', 'Sedang', 'Sulit', 'Sangat sulit'];
  const IMP_L = ['', 'Sangat rendah', 'Rendah', 'Cukup', 'Tinggi', 'Menentukan kelulusan'];
  const COMP = [
    { k: 'time', label: 'Tenggat', c: 'var(--c-time)' },
    { k: 'imp', label: 'Kepentingan', c: 'var(--c-imp)' },
    { k: 'diff', label: 'Kesulitan', c: 'var(--c-diff)' },
    { k: 'dur', label: 'Durasi', c: 'var(--c-dur)' }
  ];
  const PRESETS = {
    default: S.DEFAULT_W,
    deadline: { time: 0.55, imp: 0.20, diff: 0.15, dur: 0.10 },
    value: { time: 0.20, imp: 0.50, diff: 0.20, dur: 0.10 }
  };
  const SUS_Q = [
    'Saya merasa akan sering menggunakan SIAGA.',
    'Saya merasa SIAGA terlalu rumit.',
    'Saya merasa SIAGA mudah digunakan.',
    'Saya merasa perlu bantuan orang teknis untuk dapat menggunakan SIAGA.',
    'Saya merasa fitur-fitur SIAGA terintegrasi dengan baik.',
    'Saya merasa ada terlalu banyak ketidakkonsistenan pada SIAGA.',
    'Saya membayangkan kebanyakan orang akan cepat belajar menggunakan SIAGA.',
    'Saya merasa SIAGA sangat merepotkan untuk digunakan.',
    'Saya merasa sangat percaya diri menggunakan SIAGA.',
    'Saya perlu belajar banyak hal sebelum dapat menggunakan SIAGA.'
  ];

  const st = {
    tasks: [], free: [5, 4, 4, 4, 4, 4, 5], w: Object.assign({}, S.DEFAULT_W), wTrial: false,
    ahp: [], hist: [], evals: { items: [], summary: {} },
    offset: 0, tab: 'queue', editing: null, manual: {}, tier: {}, sample: false, sim: null, simMeta: null, sweep: null
  };
  const REAL_NOW = Date.now();
  const nowMs = () => REAL_NOW + st.offset * 36e5;

  /* ---------- bantuan format ---------- */
  const pad = n => String(n).padStart(2, '0');
  const toInput = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const fmtH = n => String(Math.round(n * 10) / 10).replace('.', ',');
  const f1 = x => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
  const f2 = x => x.toFixed(2).replace('.', ',');
  const f3 = x => x.toFixed(3).replace('.', ',');
  const fmtDT = ms => new Date(ms).toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const fmtDur = h => h < 1 ? `${Math.max(1, Math.round(h * 60))} menit` : h < 48 ? `${Math.round(h)} jam` : `${Math.floor(h / 24)} hari ${Math.round(h % 24)} jam`;
  const fmtLeft = h => h <= 0 ? `Terlambat ${fmtDur(-h)}` : `${fmtDur(h)} lagi`;
  const pips = n => `<span class="pips" aria-hidden="true">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;
  const when = s => { const d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? '' : d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };

  function toast(msg, bad) {
    const el = document.createElement('div'); el.className = 'toast' + (bad ? ' bad' : ''); el.textContent = msg;
    const box = $('toasts'); box.appendChild(el);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => el.remove(), bad ? 7000 : 4500);
  }
  const fail = e => { console.error(e); toast((e && e.message) || 'Terjadi kesalahan.', true); };

  function csv(name, rows) {
    const body = rows.map(r => r.map(c => { const s = String(c == null ? '' : c); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* Tingkat SIAGA 1-4 dari skor 0-100 */
  function level(t) {
    return t >= 75 ? { n: 1, l: 'SIAGA 1', tone: 'var(--s1)', cls: 's1' }
      : t >= 55 ? { n: 2, l: 'SIAGA 2', tone: 'var(--s2)', cls: 's2' }
      : t >= 35 ? { n: 3, l: 'SIAGA 3', tone: 'var(--s3)', cls: 's3' }
      : { n: 4, l: 'SIAGA 4', tone: 'var(--s4)', cls: 's4' };
  }

  function sampleTasks() {
    const at = h => { const d = new Date(REAL_NOW + h * 36e5); d.setMinutes(0, 0, 0); return toInput(d.getTime()); };
    return [
      { course: 'Algoritma dan Pemrograman', title: 'Laporan praktikum modul 5', deadline: at(20), dur: 4, diff: 3, imp: 4, ci: 1 },
      { course: 'Kalkulus I', title: 'Kuis daring bab turunan', deadline: at(46), dur: 2, diff: 4, imp: 3, ci: 2 },
      { course: 'Basis Data', title: 'Rancangan ERD proyek kelompok', deadline: at(96), dur: 6, diff: 4, imp: 5, ci: 3 },
      { course: 'Bahasa Inggris', title: 'Esai 300 kata', deadline: at(72), dur: 3, diff: 2, imp: 2, ci: 4 },
      { course: 'Pendidikan Pancasila', title: 'Resume bab 3', deadline: at(144), dur: 2, diff: 1, imp: 2, ci: 5 },
      { course: 'Struktur Data', title: 'UTS take-home', deadline: at(120), dur: 8, diff: 5, imp: 5, ci: 6 }
    ];
  }

  /* ---------- muat data ---------- */
  function applyWeights(w, hist) {
    st.wTrial = false;
    st.w = w ? S.normW(w) : Object.assign({}, S.DEFAULT_W);
    st.wFromAhp = !!(w && hist && hist.length);
  }
  async function loadAll() {
    const [tasks, settings, ahp, evals] = await Promise.all([Store.tasks(), Store.settings(), Store.ahp(), Store.evals()]);
    st.tasks = tasks; st.free = settings.free; st.ahp = ahp.responses; st.hist = ahp.history; st.evals = evals;
    applyWeights(settings.weights, ahp.history);
  }
  async function reloadTasks() { st.tasks = await Store.tasks(); }

  async function addSamples() {
    const have = new Set(st.tasks.map(t => t.title));
    const list = sampleTasks().filter(t => !have.has(t.title));
    if (!list.length) { toast('Tugas contoh sudah dimuat.'); return; }
    await Store.addTasks(list); await reloadTasks(); st.sample = true; renderAll();
    toast(`${list.length} tugas contoh ditambahkan.`);
  }

  /* ---------- waktu ---------- */
  function renderTime() {
    const off = st.offset, d = Math.floor(off / 24), h = off % 24;
    $('tm-read').innerHTML = `${esc(fmtDT(nowMs()))}<small>${off === 0 ? 'Waktu nyata. Geser untuk melompat ke depan.' : `Simulasi: +${d} hari ${h} jam dari sekarang`}</small>`;
    $('t-slider').value = off;
  }

  /* ---------- prioritas ---------- */
  function explain(r) {
    const t = r.task;
    if (r.overdue) return `Tenggat sudah lewat ${fmtDur(-r.left)}. Selesaikan sekarang atau minta perpanjangan.`;
    const parts = [
      { pts: r.pts.time, txt: `sisa waktu ${fmtDur(r.left)} (urgensi ${Math.round(r.urgency * 100)}%)` },
      { pts: r.pts.imp, txt: `kepentingan ${t.imp} dari 5` },
      { pts: r.pts.diff, txt: `kesulitan ${t.diff} dari 5` },
      { pts: r.pts.dur, txt: `durasi ${fmtH(t.dur)} jam` }
    ].sort((a, b) => b.pts - a.pts);
    return `Dorongan terbesar: ${parts[0].txt}, lalu ${parts[1].txt}.`;
  }

  function card(r, base) {
    const t = r.task, lv = level(r.total), left = r.left;
    const dl = r.overdue || left <= 24 ? 's1' : left <= 72 ? 's2' : '';
    let delta = '';
    if (st.offset > 0 && base[t.id]) {
      const dd = base[t.id] - r.rank;
      if (dd > 0) delta = `<span class="chip delta s4" title="Naik dibanding waktu sekarang">▲ ${dd}</span>`;
      else if (dd < 0) delta = `<span class="chip delta s1" title="Turun dibanding waktu sekarang">▼ ${-dd}</span>`;
    }
    const bar = COMP.map(c => `<i style="width:${r.pts[c.k].toFixed(2)}%;background:${c.c}" title="${c.label} ${r.pts[c.k].toFixed(1)} poin"></i>`).join('');
    const leg = COMP.map(c => `<span><s style="background:${c.c}"></s>${c.label} <b class="mono">${Math.round(r.pts[c.k])}</b></span>`).join('');
    return `<article class="card ${r.rank === 1 ? 'first' : ''}" data-id="${t.id}" style="--tone:${lv.tone}">
      <div class="lhs"><div class="rank">#${r.rank}</div>
        <div class="ring" style="--p:${Math.round(r.total)};--tone:${lv.tone}" role="img" aria-label="Skor ${Math.round(r.total)} dari 100"><span>${Math.round(r.total)}</span></div>
        <div class="lvl">${lv.l}</div></div>
      <div class="body">
        <div class="crs">${esc(t.course || 'Tanpa mata kuliah')}${delta}</div>
        <div class="ttl">${esc(t.title)}</div>
        <div class="chips">
          <span class="chip ${dl}">${esc(fmtDT(new Date(t.deadline).getTime()))} · ${esc(fmtLeft(left))}</span>
          <span class="chip">Durasi ${fmtH(t.dur)} j</span>
          <span class="chip">Sulit ${pips(t.diff)}</span>
          <span class="chip">Penting ${pips(t.imp)}</span>
        </div>
        <div class="bar" role="img" aria-label="Rincian skor">${bar}</div>
        <div class="legend">${leg}</div>
        <p class="why">${esc(explain(r))}</p>
        <div class="acts">
          <button class="btn sm" data-act="done" data-id="${t.id}" type="button">Selesai</button>
          <button class="btn sm" data-act="edit" data-id="${t.id}" type="button">Ubah</button>
          <button class="btn sm danger" data-act="del" data-id="${t.id}" type="button">Hapus</button>
        </div></div></article>`;
  }

  function renderQueue() {
    const rows = S.rankTasks(st.tasks, nowMs(), st.w);
    const base = {}; if (st.offset > 0) S.rankTasks(st.tasks, REAL_NOW, st.w).forEach(r => { base[r.task.id] = r.rank; });
    const q = $('queue'), first = {};
    q.querySelectorAll('[data-id]').forEach(el => { first[el.dataset.id] = el.getBoundingClientRect().top; });
    q.innerHTML = rows.length ? rows.map(r => card(r, base)).join('')
      : '<div class="empty"><p>Belum ada tugas aktif. Tambahkan tugas di panel kanan, atau muat beberapa tugas contoh.</p><button class="btn primary" type="button" data-act="sample">Muat tugas contoh</button></div>';
    if (!reduce) q.querySelectorAll('[data-id]').forEach(el => {
      const prev = first[el.dataset.id]; if (prev == null) return;
      const dy = prev - el.getBoundingClientRect().top;
      if (Math.abs(dy) > 1) el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 460, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
    const crit = rows.filter(r => r.overdue || r.left <= 24).length;
    const need = rows.reduce((a, r) => a + r.task.dur, 0);
    const cap = S.buildPlan(rows, nowMs(), st.free).days.reduce((a, d) => a + d.cap, 0);
    $('summary').innerHTML = `<span><b>${rows.length}</b> tugas aktif</span><span><b>${crit}</b> SIAGA 1 (kurang dari 24 jam)</span><span>Beban <b>${fmtH(need)} j</b> dari <b>${fmtH(cap)} j</b> luang 7 hari</span>`;
    $('seed-note').hidden = !st.sample;
    const done = st.tasks.filter(t => t.done);
    $('done-box').innerHTML = done.length ? `<details class="done"><summary>Selesai (${done.length})</summary>${done.map(t => `<div class="done-item"><span>${esc(t.title)}</span><button class="btn sm" data-act="undo" data-id="${t.id}" type="button">Buka lagi</button></div>`).join('')}</details>` : '';
    $('courses').innerHTML = [...new Set(st.tasks.map(t => t.course).filter(Boolean))].map(c => `<option value="${esc(c)}">`).join('');
  }

  /* ---------- rencana ---------- */
  function buildFree() {
    const order = [1, 2, 3, 4, 5, 6, 0];
    $('free-grid').innerHTML = order.map(d => `<label for="free-${d}">${DAYS[d]}<input type="number" id="free-${d}" min="0" max="16" step="0.5" value="${st.free[d]}"></label>`).join('');
    order.forEach(d => $('free-' + d).addEventListener('change', async e => {
      const v = Math.min(16, Math.max(0, Number(e.target.value) || 0));
      const next = st.free.slice(); next[d] = v;
      try { const r = await Store.saveSettings({ free: next }); st.free = r.free; renderAll(); } catch (err) { fail(err); }
    }));
  }
  function renderPlan() {
    const rows = S.rankTasks(st.tasks, nowMs(), st.w);
    const plan = S.buildPlan(rows, nowMs(), st.free);
    const byId = {}; st.tasks.forEach(t => { byId[t.id] = t; });
    const used = plan.days.reduce((a, d) => a + d.used, 0), cap = plan.days.reduce((a, d) => a + d.cap, 0);
    $('plan-sum').innerHTML = `<span>Terjadwal <b>${fmtH(used)} j</b> dari <b>${fmtH(cap)} j</b> jam luang</span><span><b>${plan.issues.length}</b> tugas belum muat</span>`;
    $('days').innerHTML = plan.days.map((d, i) => {
      const blocks = d.blocks.map(b => { const t = byId[b.id]; return `<div class="blk" style="--tc:var(--p${t.ci || 1});--h:${b.hours}"><b>${esc(t.title)}</b><span>${esc(t.course)} · ${fmtH(b.hours)} j</span></div>`; }).join('');
      const pct = d.cap > 0 ? Math.min(100, d.used / d.cap * 100) : 0;
      return `<div class="day ${i === 0 ? 'today' : ''}"><h3>${DAYS[d.date.getDay()]} ${d.date.getDate()}<small>${i === 0 ? 'Hari ini' : d.date.toLocaleDateString('id-ID', { month: 'short' })}</small></h3>
        <div class="cap"><i style="width:${pct}%"></i></div><div class="capt">${fmtH(d.used)} / ${fmtH(d.cap)} j</div>
        ${blocks || `<div class="free-day">${d.cap === 0 ? 'Libur' : 'Belum ada tugas'}</div>`}</div>`;
    }).join('');
    $('plan-issues').innerHTML = plan.issues.map(is => {
      const t = byId[is.id];
      if (is.beyond) return `<div class="issue soft">${esc(t.title)}: ${fmtH(is.rem)} jam belum dapat slot dalam 7 hari ini. Tenggatnya masih jauh, jadwalkan di minggu berikutnya.</div>`;
      return `<div class="issue">${esc(t.title)}: kurang ${fmtH(is.rem)} jam sebelum tenggat. Tambah jam luang atau minta perpanjangan.</div>`;
    }).join('');
  }

  /* ---------- pengingat ---------- */
  const tierOf = r => (r.overdue || r.left <= 24) ? 2 : (r.left <= 72 && r.task.imp >= 4) ? 1 : 0;
  function renderReminders() {
    const rows = S.rankTasks(st.tasks, nowMs(), st.w), items = [];
    rows.forEach(r => {
      const tr = tierOf(r), prev = st.tier[r.task.id];
      if (prev !== undefined && tr > prev) toast(`${tr === 2 ? 'SIAGA 1' : 'SIAGA 2'}: ${r.task.title} (${fmtLeft(r.left)})`);
      st.tier[r.task.id] = tr;
      if (tr > 0) items.push({ r, tr });
    });
    items.sort((a, b) => b.tr - a.tr || a.r.left - b.r.left);
    $('reminders').innerHTML = items.length
      ? items.map(({ r, tr }) => `<div class="rem-item"><span class="tag ${tr === 2 ? 't1' : 't2'}">${tr === 2 ? 'SIAGA 1' : 'SIAGA 2'}</span><div><b>${esc(r.task.title)}</b><span class="muted">${esc(fmtLeft(r.left))} · skor ${Math.round(r.total)}</span></div></div>`).join('')
      : '<div class="rem-item"><div class="muted">Belum ada pengingat. Geser mesin waktu ke depan untuk melihat pengingat muncul.</div></div>';
  }

  /* ---------- bobot AHP ---------- */
  function weightBarsHtml(w) {
    const n = S.normW(w);
    return COMP.map(c => `<div class="wbar"><span>${c.label}</span><div class="track"><i style="width:${(n[c.k] * 100).toFixed(1)}%;background:${c.c}"></i></div><output>${f1(n[c.k] * 100)}%</output></div>`).join('');
  }
  function weightSource() {
    if (st.wTrial) return 'Percobaan sementara. Tidak disimpan dan kembali ke bobot tersimpan saat halaman dimuat ulang.';
    if (st.wFromAhp && st.hist.length) { const h = st.hist[0]; return `Hasil AHP dari ${h.jumlah_responden} responden, CR ${f3(Number(h.cr))}.`; }
    return 'Bobot bawaan 0,35 / 0,30 / 0,20 / 0,15. Belum dikalibrasi, jadi bukan hasil penelitian.';
  }
  function ahpAggregate() {
    let rs = st.ahp.map(r => Object.assign({}, r, { cr: S.ahp(S.matrixFromPairs(r.pairs)).cr }));
    if ($('ahp-only-ok').checked) rs = rs.filter(r => r.cr < 0.1);
    if (!rs.length) return null;
    const agg = S.aggregateMatrices(rs.map(r => S.matrixFromPairs(r.pairs)));
    return { n: rs.length, agg, res: S.ahp(agg) };
  }
  function renderAhp() {
    $('ahp-active').innerHTML = `<div class="wbars">${weightBarsHtml(st.w)}</div><p class="small muted" style="margin-top:8px">${esc(weightSource())}</p>` +
      (st.wFromAhp || st.wTrial ? '<button class="btn sm" type="button" id="ahp-default" style="margin-top:8px">Kembalikan bobot bawaan</button>' : '');
    const d = $('ahp-default'); if (d) d.addEventListener('click', async () => { try { await Store.saveSettings({ weights: null }); await loadAll(); renderAll(); toast('Bobot bawaan dipulihkan.'); } catch (e) { fail(e); } });

    const rows = st.ahp.map(r => {
      const cr = S.ahp(S.matrixFromPairs(r.pairs)).cr, ok = cr < 0.1;
      return `<tr><td>${esc(r.label)}</td><td class="num">${r.pairs.map(p => (p > 0 ? '+' : '') + p).join(' ')}</td><td class="num">${f3(cr)}</td><td class="${ok ? 'pass' : 'fail'}">${ok ? 'Konsisten' : 'Tidak konsisten'}</td><td><button class="btn sm danger" type="button" data-ahp-del="${r.id}">Hapus</button></td></tr>`;
    }).join('');
    $('ahp-rows').innerHTML = rows || '<tr><td colspan="5" class="muted">Belum ada responden. Isi formulir di atas atau impor kode dari ahp.html.</td></tr>';

    const a = ahpAggregate();
    if (!a) { $('ahp-agg').innerHTML = '<p class="small muted">Hasil gabungan muncul setelah ada responden yang konsisten.</p>'; return; }
    const names = S.CRITERIA.map(k => S.CRITERIA_LABEL[k]);
    const mat = `<div class="tablewrap"><table class="mat"><thead><tr><th></th>${names.map(n => `<th>${n}</th>`).join('')}</tr></thead><tbody>${a.agg.map((row, i) => `<tr><th>${names[i]}</th>${row.map(v => `<td>${f2(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    const weights = S.weightsObj(a.res.w);
    const warn = a.n < 5 ? `<div class="issue soft">Hanya ${a.n} responden. Semakin sedikit responden, semakin lemah klaim bobotnya. Tulis jumlahnya apa adanya di proposal.</div>` : '';
    const crCls = a.res.consistent ? 'crbox' : 'crbox bad';
    $('ahp-agg').innerHTML = `<h3 style="font-size:15px;margin-top:6px">Matriks gabungan (${a.n} dari ${st.ahp.length} responden)</h3>${mat}
      <div class="wbars">${weightBarsHtml(weights)}</div>
      <div class="${crCls}">CR gabungan ${f3(a.res.cr)}: ${a.res.consistent ? 'konsisten.' : 'belum konsisten (batas 0,1).'}</div>${warn}
      <div class="row-btn"><button class="btn primary" type="button" id="ahp-apply">Terapkan sebagai bobot aktif</button></div>`;
    $('ahp-apply').addEventListener('click', async () => {
      try {
        await Store.applyAhp(weights, Math.round(a.res.cr * 1e4) / 1e4, a.n);
        await loadAll(); renderAll(); toast('Bobot AHP diterapkan.');
      } catch (e) { fail(e); }
    });
  }

  /* ---------- pembanding ---------- */
  function bestIdx(vals, hi) { const b = hi ? Math.max(...vals) : Math.min(...vals); return vals.map(v => Math.abs(v - b) < 0.05); }
  function renderSim() {
    if (!st.sim) { $('sim-out').innerHTML = ''; return; }
    const keys = Object.keys(st.sim.results), R = keys.map(k => st.sim.results[k]);
    const bm = bestIdx(R.map(r => r.missedPct), false), bl = bestIdx(R.map(r => r.lossImpPct), false), bp = bestIdx(R.map(r => r.perfectPct), true);
    const maxM = Math.max(...R.map(r => r.missedPct), 1), maxL = Math.max(...R.map(r => r.lossImpPct), 1);
    const rows = keys.map((k, i) => {
      const r = R[i], cls = k === 'siaga' ? 'siaga' : '';
      return `<tr><td><b>${esc(r.label)}</b></td>
        <td class="num ${bm[i] ? 'best' : ''}">${f1(r.missedPct)}%<span class="cmp-bar"><i class="${cls}" style="width:${r.missedPct / maxM * 100}%"></i></span></td>
        <td class="num ${bl[i] ? 'best' : ''}">${f1(r.lossImpPct)}%<span class="cmp-bar"><i class="${cls}" style="width:${r.lossImpPct / maxL * 100}%"></i></span></td>
        <td class="num ${bp[i] ? 'best' : ''}">${Math.round(r.perfectPct)}%</td></tr>`;
    }).join('');
    const sg = st.sim.results.siaga, d = (a, b) => { const x = a - b; return Math.abs(x) < 0.05 ? 'sama' : (x > 0 ? '+' : '−') + f1(Math.abs(x)) + ' poin'; };
    const vs = ['edf', 'imp', 'fifo'].map(k => { const o = st.sim.results[k]; return `<li>Dibanding <b>${esc(o.label)}</b>: tugas terlewat ${d(sg.missedPct, o.missedPct)}, bobot kepentingan hilang ${d(sg.lossImpPct, o.lossImpPct)}.</li>`; }).join('');
    $('sim-out').innerHTML = `<div class="tablewrap"><table><thead><tr><th>Metode</th><th>Tugas terlewat</th><th>Bobot kepentingan hilang</th><th>Skenario tanpa terlewat</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="verdict"><b>Selisih SIAGA</b> (${st.simMeta.n} skenario, seed ${st.simMeta.seed}, bobot ${esc(S.CRITERIA.map(k => f2(st.simMeta.w[k])).join(' / '))}). Tanda − berarti SIAGA lebih rendah, yaitu lebih baik untuk kedua ukuran kerugian.<ul style="margin:8px 0 0;padding-left:18px">${vs}</ul>
      <p class="small muted" style="margin-top:8px">Tenggat terdekat (EDF) dikenal optimal untuk menghindari keterlambatan selama semua tugas masih mungkin selesai tepat waktu, sehingga sulit dikalahkan pada ukuran tugas terlewat. Nilai tambah SIAGA ada pada pertimbangan kepentingan dan kesulitan, penjelasan keputusan, dan rencana harian. Laporkan angka di atas apa adanya.</p></div>`;
  }
  function runSim() {
    const n = Number($('sim-n').value), seed = Math.max(1, Math.floor(Number($('sim-seed').value) || 2026));
    st.sim = S.simulate({ n, seed }, st.w); st.simMeta = { n, seed, w: Object.assign({}, st.w) };
    renderSim();
  }
  function runSweep() {
    const n = Number($('sim-n').value), seed = Math.max(1, Math.floor(Number($('sim-seed').value) || 2026));
    const list = [['Bawaan', S.DEFAULT_W], ['Fokus tenggat', PRESETS.deadline], ['Fokus kepentingan', PRESETS.value]];
    if (st.wFromAhp) list.push(['Bobot AHP aktif', st.w]);
    const rows = list.map(([name, w]) => { const r = S.simulate({ n, seed }, w).results; return { name, w, siaga: r.siaga, edf: r.edf }; });
    st.sweep = { n, seed, rows };
    $('sweep-out').innerHTML = `<h3 style="font-size:16px">Sensitivitas bobot (${n} skenario, seed ${seed})</h3>
      <div class="tablewrap"><table><thead><tr><th>Bobot (tenggat / kepentingan / kesulitan / durasi)</th><th>SIAGA terlewat</th><th>SIAGA bobot hilang</th><th>EDF terlewat</th><th>EDF bobot hilang</th></tr></thead><tbody>${rows.map(r => `<tr><td><b>${esc(r.name)}</b><br><span class="small muted mono">${S.CRITERIA.map(k => f2(S.normW(r.w)[k])).join(' / ')}</span></td><td class="num">${f1(r.siaga.missedPct)}%</td><td class="num">${f1(r.siaga.lossImpPct)}%</td><td class="num">${f1(r.edf.missedPct)}%</td><td class="num">${f1(r.edf.lossImpPct)}%</td></tr>`).join('')}</tbody></table></div>
      <p class="small muted">Bobot yang menaikkan tenggat cenderung menurunkan kerugian bobot kepentingan, tetapi mengubah jumlah tugas terlewat. Pilih dan jelaskan pertukaran ini di proposal.</p>`;
  }

  /* ---------- evaluasi ---------- */
  function susVerdict(s) {
    return s >= 80.3 ? 'Sangat baik (kelas A)' : s >= 68 ? 'Di atas rata-rata' : s >= 51 ? 'Di bawah rata-rata' : 'Buruk';
  }
  function buildSusForm() {
    $('sus-form').innerHTML = '<p class="small muted">1 = sangat tidak setuju, 5 = sangat setuju.</p>' + SUS_Q.map((q, i) =>
      `<div class="sus-q"><span>${i + 1}. ${esc(q)}</span><span class="likert" role="radiogroup" aria-label="Butir ${i + 1}">${[1, 2, 3, 4, 5].map(v => `<label><input type="radio" name="susq${i}" value="${v}"><span>${v}</span></label>`).join('')}</span></div>`).join('');
    $('sus-form').addEventListener('change', updateSusLive);
  }
  function susAnswers() {
    const a = SUS_Q.map((_, i) => { const el = document.querySelector(`input[name="susq${i}"]:checked`); return el ? Number(el.value) : 0; });
    return a;
  }
  function updateSusLive() {
    const a = susAnswers(), left = a.filter(x => !x).length;
    $('sus-live').textContent = left ? `Masih ${left} butir belum dijawab.` : `Skor SUS ${f1(S.susScore(a))} dari 100. ${susVerdict(S.susScore(a))}.`;
  }
  function spRows() { return S.rankTasks(st.tasks, REAL_NOW, st.w); }
  function renderSp() {
    const rows = spRows(), n = rows.length;
    $('sp-body').innerHTML = rows.length ? rows.map(r => {
      const cur = st.manual[r.task.id] || '';
      const opts = ['<option value="">-</option>'].concat(Array.from({ length: n }, (_, i) => `<option value="${i + 1}" ${String(cur) === String(i + 1) ? 'selected' : ''}>${i + 1}</option>`)).join('');
      return `<tr><td>${esc(r.task.title)}</td><td class="num">#${r.rank}</td><td><select class="mini" data-man="${r.task.id}" aria-label="Urutan responden untuk ${esc(r.task.title)}">${opts}</select></td></tr>`;
    }).join('') : '<tr><td colspan="3" class="muted">Belum ada tugas aktif.</td></tr>';
    updateSpResult();
  }
  function spState() {
    const rows = spRows(), n = rows.length;
    if (n < 3) return { msg: 'Perlu minimal 3 tugas aktif.' };
    const man = rows.map(r => Number(st.manual[r.task.id]) || 0);
    if (man.some(x => !x)) return { msg: 'Isi urutan responden untuk semua tugas.' };
    if (new Set(man).size !== n) return { msg: 'Urutan responden harus unik, tanpa angka yang sama.', bad: true };
    return { rho: S.spearman(rows.map(r => r.rank), man), n };
  }
  function updateSpResult() {
    const s = spState();
    $('sp-result').innerHTML = s.rho === undefined ? `<span class="${s.bad ? 'fail' : 'muted'}">${s.msg}</span>`
      : `<span class="rho">ρ = ${f2(s.rho)}</span><span class="muted">${s.rho >= 0.8 ? 'Sangat selaras dengan penilaian responden.' : s.rho >= 0.6 ? 'Cukup selaras.' : 'Kurang selaras. Pertimbangkan kalibrasi bobot.'}</span>`;
  }
  function renderEval() {
    const sm = st.evals.summary || {};
    $('eval-sum').innerHTML = `<span>SUS: <b>${sm.sus_n || 0}</b> responden${sm.sus_mean != null ? `, rata-rata <b>${f1(sm.sus_mean)}</b> (${susVerdict(sm.sus_mean)})` : ''}</span><span>Spearman: <b>${sm.rho_n || 0}</b> responden${sm.rho_mean != null ? `, rata-rata ρ <b>${f2(sm.rho_mean)}</b>` : ''}</span>`;
    $('eval-rows').innerHTML = st.evals.items.length ? st.evals.items.slice().reverse().map(e =>
      `<tr><td>${e.type === 'sus' ? 'SUS' : 'Spearman'}</td><td>${esc(e.label || '-')}</td><td class="num">${e.type === 'sus' ? f1(e.score) + ' · ' + susVerdict(e.score) : 'ρ ' + f2(e.score) + ' (n=' + ((e.payload && e.payload.n) || '?') + ')'}</td><td class="num">${esc(when(e.created_at))}</td><td><button class="btn sm danger" type="button" data-eval-del="${e.id}">Hapus</button></td></tr>`).join('')
      : '<tr><td colspan="5" class="muted">Belum ada data evaluasi.</td></tr>';
    renderSp();
  }

  /* ---------- uji ---------- */
  function renderLab() {
    $('w-bars').innerHTML = weightBarsHtml(st.w);
    const w = S.normW(st.w), c = x => f2(x);
    $('formula').textContent =
`Skor = 100 × ( ${c(w.time)} × Urgensi
             + ${c(w.imp)} × Kepentingan
             + ${c(w.diff)} × Kesulitan
             + ${c(w.dur)} × Durasi )

Urgensi     = 1 − min(sisa jam, ${S.URGENCY_WINDOW_H}) ÷ ${S.URGENCY_WINDOW_H}
Kepentingan = (tingkat − 1) ÷ 4
Kesulitan   = (tingkat − 1) ÷ 4
Durasi      = min(1, durasi ÷ 10 jam)
Terlambat   → skor 100

SIAGA 1 ≥ 75 · SIAGA 2 ≥ 55 · SIAGA 3 ≥ 35 · SIAGA 4 < 35`;
    renderTests();
  }
  function renderTests() {
    const res = S.runTests(st.w, st.free, nowMs(), st.tasks);
    $('tests').innerHTML = res.map(t => `<tr><td>${esc(t.name)}</td><td class="num">${esc(t.got)}</td><td class="${t.pass ? 'pass' : 'fail'}">${t.pass ? 'Lolos' : 'Gagal'}</td></tr>`).join('') +
      `<tr><td colspan="3" class="muted">${res.filter(t => t.pass).length} dari ${res.length} kasus lolos</td></tr>`;
  }

  /* ---------- form tugas ---------- */
  function draft() {
    return { id: -1, course: $('f-course').value.trim(), title: $('f-title').value.trim(), deadline: $('f-deadline').value, dur: Number($('f-dur').value), diff: Number($('f-diff').value), imp: Number($('f-imp').value) };
  }
  function renderPreview() {
    $('o-diff').textContent = DIFF_L[$('f-diff').value]; $('o-imp').textContent = IMP_L[$('f-imp').value];
    const d = draft();
    if (!d.deadline || !(d.dur > 0)) { $('f-preview').textContent = 'Isi tenggat dan durasi untuk melihat perkiraan skor.'; return; }
    const sc = S.scoreTask(d, nowMs(), st.w), lv = level(sc.total);
    const others = S.rankTasks(st.tasks.filter(t => t.id !== st.editing), nowMs(), st.w);
    const pos = others.filter(r => r.total > sc.total).length + 1;
    $('f-preview').innerHTML = `Perkiraan skor <b class="mono">${Math.round(sc.total)}</b> (${lv.l}). Akan berada di urutan <b class="mono">#${pos}</b> dari ${others.length + 1}.`;
  }
  const defaultDeadline = () => { const d = new Date(REAL_NOW + 72 * 36e5); d.setHours(23, 59, 0, 0); return toInput(d.getTime()); };
  function resetForm() {
    st.editing = null; $('f-course').value = ''; $('f-title').value = ''; $('f-deadline').value = defaultDeadline();
    $('f-dur').value = 3; $('f-diff').value = 3; $('f-imp').value = 3; $('f-err').textContent = '';
    $('f-submit').textContent = 'Simpan tugas'; $('f-cancel').hidden = true; renderPreview();
  }

  /* ---------- render semua ---------- */
  function renderAll() { renderTime(); renderQueue(); renderPlan(); renderReminders(); renderAhp(); renderEval(); renderLab(); renderPreview(); }

  function setTab(t) {
    st.tab = t;
    document.querySelectorAll('[role=tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    document.querySelectorAll('[role=tabpanel]').forEach(p => { p.hidden = p.dataset.panel !== t; });
  }

  /* ---------- pemasangan peristiwa ---------- */
  let ahpForm = null;
  function wire() {
    document.querySelectorAll('[role=tab]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
    $('t-slider').addEventListener('input', e => { st.offset = Number(e.target.value); renderAll(); });
    $('t-day').addEventListener('click', () => { st.offset = Math.min(168, st.offset + 24); renderAll(); });
    $('t-reset').addEventListener('click', () => { st.offset = 0; renderAll(); });

    ['f-course', 'f-title', 'f-deadline', 'f-dur', 'f-diff', 'f-imp'].forEach(id => $(id).addEventListener('input', renderPreview));
    $('f-cancel').addEventListener('click', resetForm);
    $('f-sample').addEventListener('click', () => addSamples().catch(fail));
    $('task-form').addEventListener('submit', async e => {
      e.preventDefault();
      const d = draft(), err = [];
      if (!d.title) err.push('Nama tugas wajib diisi.');
      if (!d.deadline) err.push('Tenggat wajib diisi.');
      if (!(d.dur >= 0.5)) err.push('Durasi minimal 0,5 jam.');
      if (err.length) { $('f-err').textContent = err.join(' '); return; }
      try {
        const body = { course: d.course, title: d.title, deadline: d.deadline, dur: d.dur, diff: d.diff, imp: d.imp };
        if (st.editing != null) { const old = st.tasks.find(x => x.id === st.editing); await Store.updateTask(Object.assign({ id: st.editing, ci: old ? old.ci : 1 }, body)); }
        else await Store.addTasks([Object.assign({ ci: (st.tasks.length % 6) + 1 }, body)]);
        st.sample = false; await reloadTasks(); resetForm(); renderAll();
      } catch (ex) { $('f-err').textContent = ex.message; }
    });

    $('panel-queue').addEventListener('click', async e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'sample') { addSamples().catch(fail); return; }
      const id = Number(b.dataset.id), t = st.tasks.find(x => x.id === id); if (!t) return;
      try {
        if (b.dataset.act === 'edit') {
          st.editing = id; $('f-course').value = t.course; $('f-title').value = t.title; $('f-deadline').value = t.deadline;
          $('f-dur').value = t.dur; $('f-diff').value = t.diff; $('f-imp').value = t.imp;
          $('f-submit').textContent = 'Perbarui tugas'; $('f-cancel').hidden = false; renderPreview();
          $('f-title').focus(); $('task-form').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
          return;
        }
        if (b.dataset.act === 'done') await Store.setDone(id, true);
        else if (b.dataset.act === 'undo') await Store.setDone(id, false);
        else if (b.dataset.act === 'del') await Store.delTask(id);
        st.sample = false; await reloadTasks(); renderAll();
      } catch (ex) { fail(ex); }
    });

    /* AHP */
    ahpForm = Ahp.build($('ahp-form'));
    $('ahp-save').addEventListener('click', async () => {
      const label = $('ahp-label').value.trim();
      if (!label) { $('ahp-err').textContent = 'Isi nama atau kode responden dahulu.'; $('ahp-label').focus(); return; }
      $('ahp-err').textContent = '';
      try {
        await Store.addAhp(label, ahpForm.get());
        const a = await Store.ahp(); st.ahp = a.responses; st.hist = a.history;
        $('ahp-label').value = ''; ahpForm.reset(); renderAhp(); toast('Responden disimpan.');
      } catch (e) { $('ahp-err').textContent = e.message; }
    });
    $('ahp-import').addEventListener('click', async () => {
      const lines = $('ahp-codes').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (!lines.length) { $('ahp-import-msg').textContent = 'Tempel kode dahulu.'; return; }
      let ok = 0, bad = 0;
      for (const ln of lines) {
        const d = Ahp.decode(ln);
        if (!d) { bad++; continue; }
        try { await Store.addAhp(d.label, d.pairs); ok++; } catch (e) { bad++; }
      }
      const a = await Store.ahp(); st.ahp = a.responses; st.hist = a.history;
      $('ahp-import-msg').textContent = `${ok} kode diimpor${bad ? `, ${bad} tidak valid` : ''}.`;
      if (ok) $('ahp-codes').value = '';
      renderAhp();
    });
    $('ahp-only-ok').addEventListener('change', renderAhp);
    $('ahp-rows').addEventListener('click', async e => {
      const b = e.target.closest('[data-ahp-del]'); if (!b) return;
      try { await Store.delAhp(Number(b.dataset.ahpDel)); const a = await Store.ahp(); st.ahp = a.responses; st.hist = a.history; renderAhp(); } catch (ex) { fail(ex); }
    });
    $('ahp-csv').addEventListener('click', () => {
      csv('siaga-ahp-responden.csv', [['Responden', 'Tenggat-Kepentingan', 'Tenggat-Kesulitan', 'Tenggat-Durasi', 'Kepentingan-Kesulitan', 'Kepentingan-Durasi', 'Kesulitan-Durasi', 'CR']]
        .concat(st.ahp.map(r => [r.label].concat(r.pairs, [f3(S.ahp(S.matrixFromPairs(r.pairs)).cr)]))));
    });

    /* pembanding */
    $('sim-run').addEventListener('click', runSim);
    $('sim-sweep').addEventListener('click', runSweep);
    $('sim-csv').addEventListener('click', () => {
      if (!st.sim) { toast('Jalankan simulasi dahulu.', true); return; }
      csv('siaga-simulasi.csv', [['Metode', 'Tugas terlewat (%)', 'Bobot kepentingan hilang (%)', 'Skenario tanpa terlewat (%)', 'Skenario', 'Seed']]
        .concat(Object.values(st.sim.results).map(r => [r.label, f1(r.missedPct), f1(r.lossImpPct), Math.round(r.perfectPct), st.simMeta.n, st.simMeta.seed])));
    });

    /* evaluasi */
    buildSusForm();
    $('sus-save').addEventListener('click', async () => {
      const label = $('sus-label').value.trim(), a = susAnswers();
      if (!label) { $('sus-err').textContent = 'Isi nama atau kode responden dahulu.'; return; }
      if (a.some(x => !x)) { $('sus-err').textContent = 'Jawab semua 10 butir.'; return; }
      $('sus-err').textContent = '';
      try {
        await Store.addEval({ type: 'sus', label, answers: a });
        st.evals = await Store.evals();
        document.querySelectorAll('#sus-form input:checked').forEach(i => { i.checked = false; });
        $('sus-label').value = ''; updateSusLive(); renderEval(); toast('SUS disimpan.');
      } catch (e) { $('sus-err').textContent = e.message; }
    });
    $('sp-body').addEventListener('change', e => { const s = e.target.closest('[data-man]'); if (!s) return; st.manual[s.dataset.man] = s.value; updateSpResult(); });
    $('sp-save').addEventListener('click', async () => {
      const label = $('sp-label').value.trim(), s = spState();
      if (!label) { $('sp-err').textContent = 'Isi nama atau kode responden dahulu.'; return; }
      if (s.rho === undefined) { $('sp-err').textContent = s.msg; return; }
      $('sp-err').textContent = '';
      try {
        await Store.addEval({ type: 'spearman', label, rho: s.rho, n: s.n });
        st.evals = await Store.evals(); st.manual = {}; $('sp-label').value = ''; renderEval(); toast('Nilai ρ disimpan.');
      } catch (e) { $('sp-err').textContent = e.message; }
    });
    $('eval-rows').addEventListener('click', async e => {
      const b = e.target.closest('[data-eval-del]'); if (!b) return;
      try { await Store.delEval(Number(b.dataset.evalDel)); st.evals = await Store.evals(); renderEval(); } catch (ex) { fail(ex); }
    });
    $('eval-csv').addEventListener('click', () => {
      csv('siaga-evaluasi.csv', [['Jenis', 'Responden', 'Nilai', 'Keterangan', 'Waktu']].concat(st.evals.items.map(e =>
        [e.type === 'sus' ? 'SUS' : 'Spearman', e.label, e.type === 'sus' ? f1(e.score) : f2(e.score), e.type === 'sus' ? susVerdict(e.score) : 'n=' + ((e.payload && e.payload.n) || ''), e.created_at])));
    });

    /* uji */
    $('run-tests').addEventListener('click', () => { renderTests(); toast('Pengujian dijalankan ulang.'); });
    document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
      st.w = Object.assign({}, PRESETS[b.dataset.preset]); st.wTrial = true; st.wFromAhp = false; renderAll();
    }));

    /* akun */
    $('logout').addEventListener('click', async () => { try { await Store.logout(); location.reload(); } catch (e) { fail(e); } });
    $('tg-save').addEventListener('click', async () => {
      try { const t = await Store.setTelegram($('tg-id').value.trim()); toast(t ? 'ID Telegram disimpan.' : 'ID Telegram dihapus.'); } catch (e) { fail(e); }
    });
  }

  /* ---------- masuk / daftar ---------- */
  function showAuth() {
    $('auth').hidden = false; $('app').hidden = true;
    let register = false;
    const sync = () => {
      $('auth-title').textContent = register ? 'Buat akun' : 'Masuk';
      $('auth-nama-wrap').hidden = !register;
      $('auth-submit').textContent = register ? 'Daftar' : 'Masuk';
      $('auth-switch').textContent = register ? 'Sudah punya akun' : 'Buat akun baru';
      $('a-pass').autocomplete = register ? 'new-password' : 'current-password';
      $('auth-err').textContent = '';
    };
    $('auth-switch').addEventListener('click', () => { register = !register; sync(); });
    $('auth-form').addEventListener('submit', async e => {
      e.preventDefault();
      try {
        if (register) await Store.register($('a-nama').value.trim(), $('a-email').value.trim(), $('a-pass').value);
        else await Store.login($('a-email').value.trim(), $('a-pass').value);
        await start();
      } catch (ex) { $('auth-err').textContent = ex.message; }
    });
    sync();
  }

  /* ---------- mulai ---------- */
  async function start() {
    $('auth').hidden = true; $('app').hidden = false;
    const api = Store.mode === 'api';
    $('mode-badge').classList.toggle('local', !api);
    $('mode-text').textContent = api ? 'Mode server · MySQL' : 'Mode lokal · data di peramban ini';
    $('user-name').textContent = api && Store.user ? Store.user.nama : '';
    $('logout').hidden = !api;
    $('tg-box').hidden = !api;
    if (api && Store.user && Store.user.telegram) $('tg-id').value = Store.user.telegram;
    if (Store.warn) { $('warn').hidden = false; $('warn').textContent = Store.warn; }
    await loadAll();
    if (Store.firstRun && !st.tasks.length) { try { await Store.addTasks(sampleTasks()); await reloadTasks(); st.sample = true; } catch (e) { /* abaikan */ } }
    if (!start.wired) { buildFree(); wire(); resetForm(); start.wired = true; }
    renderAll();
  }

  (async function boot() {
    try {
      await Store.init();
      if (Store.mode === 'api' && !Store.user) { showAuth(); return; }
      await start();
    } catch (e) { fail(e); }
  })();
})();
