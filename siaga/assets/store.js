/*
 * SIAGA - lapisan data.
 * Otomatis memakai server (api/*.php + MySQL) bila tersedia. Bila halaman dibuka langsung dari file
 * atau server PHP/MySQL belum siap, memakai penyimpanan peramban (mode lokal) agar demo tetap jalan.
 */
(function () {
  'use strict';
  const S = window.SIAGA;
  const LS = 'siaga.local.v1';
  const DEFAULT_FREE = [5, 4, 4, 4, 4, 4, 5];
  let mode = 'local', user = null, warn = '';
  let L = null;

  async function http(method, url, body) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 7000);
    try {
      const r = await fetch(url, {
        method, credentials: 'same-origin', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'siaga' },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      let j = null; try { j = await r.json(); } catch (e) { /* bukan JSON */ }
      if (!r.ok) { const e = new Error((j && j.error) || ('Kesalahan server (' + r.status + ')')); e.status = r.status; throw e; }
      if (j === null) throw new Error('Respons server bukan JSON');
      return j;
    } finally { clearTimeout(to); }
  }

  async function detect() {
    if (location.protocol === 'file:') return;
    try {
      const j = await http('GET', 'api/auth.php?action=me');
      mode = 'api'; user = j.user;
    } catch (e) {
      mode = 'local';
      if (e.status === 500) warn = 'Server PHP terdeteksi, tetapi basis data belum siap. Memakai mode lokal. Impor sql/siaga.sql lewat phpMyAdmin untuk mode server.';
    }
  }

  /* ---------- mode lokal ---------- */
  function freshLocal() {
    return { tasks: [], free: DEFAULT_FREE.slice(), weights: null, ahp: [], hist: [], evals: [], nextId: 1, nextAhp: 1, nextEval: 1, firstRun: true };
  }
  function lload() {
    if (L) return L;
    try { const s = JSON.parse(localStorage.getItem(LS)); if (s && Array.isArray(s.tasks)) { L = Object.assign(freshLocal(), s, { firstRun: false }); return L; } } catch (e) { /* kosong */ }
    L = freshLocal(); return L;
  }
  function lsave() { try { localStorage.setItem(LS, JSON.stringify(Object.assign({}, L, { firstRun: false }))); } catch (e) { /* penyimpanan tidak tersedia */ } }
  const clone = x => JSON.parse(JSON.stringify(x));
  const nowSql = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };

  function validTask(t) {
    if (!t.title || !String(t.title).trim()) return 'Nama tugas wajib diisi.';
    if (!t.deadline) return 'Tenggat wajib diisi.';
    if (!(t.dur >= 0.5 && t.dur <= 40)) return 'Durasi harus antara 0,5 dan 40 jam.';
    return '';
  }

  const Store = {
    get mode() { return mode; },
    get user() { return user; },
    get warn() { return warn; },
    get firstRun() { return mode === 'local' && lload().firstRun; },
    async init() { await detect(); if (mode === 'local') lload(); },

    /* akun (hanya mode server) */
    async login(email, password) { const j = await http('POST', 'api/auth.php?action=login', { email, password }); user = j.user; return user; },
    async register(nama, email, password) { const j = await http('POST', 'api/auth.php?action=register', { nama, email, password }); user = j.user; return user; },
    async logout() { await http('POST', 'api/auth.php?action=logout', {}); user = null; },
    async setTelegram(chat) { const j = await http('POST', 'api/auth.php?action=telegram', { chat_id: chat }); if (user) user.telegram = j.telegram; return j.telegram; },

    /* tugas */
    async tasks() {
      if (mode === 'api') return (await http('GET', 'api/tasks.php')).tasks;
      return clone(lload().tasks);
    },
    async addTasks(list) {
      if (mode === 'api') return (await http('POST', 'api/tasks.php', { tasks: list })).tasks;
      const l = lload(), out = [];
      for (const t of list) {
        const err = validTask(t); if (err) throw new Error(err);
        const row = { id: l.nextId++, course: t.course || '', title: String(t.title).trim(), deadline: t.deadline, dur: t.dur, diff: t.diff, imp: t.imp, ci: t.ci || 1, done: false };
        l.tasks.push(row); out.push(clone(row));
      }
      lsave(); return out;
    },
    async updateTask(t) {
      if (mode === 'api') return (await http('PUT', 'api/tasks.php', t)).task;
      const err = validTask(t); if (err) throw new Error(err);
      const row = lload().tasks.find(x => x.id === t.id); if (!row) throw new Error('Tugas tidak ditemukan.');
      Object.assign(row, { course: t.course || '', title: String(t.title).trim(), deadline: t.deadline, dur: t.dur, diff: t.diff, imp: t.imp });
      lsave(); return clone(row);
    },
    async setDone(id, done) {
      if (mode === 'api') return (await http('PUT', 'api/tasks.php', { id, done })).task;
      const row = lload().tasks.find(x => x.id === id); if (row) row.done = done; lsave(); return clone(row);
    },
    async delTask(id) {
      if (mode === 'api') { await http('DELETE', 'api/tasks.php?id=' + id); return; }
      const l = lload(); l.tasks = l.tasks.filter(x => x.id !== id); lsave();
    },

    /* pengaturan: jam luang per hari (0 = Minggu) dan bobot aktif */
    async settings() {
      if (mode === 'api') return await http('GET', 'api/settings.php');
      const l = lload(); return { free: l.free.slice(), weights: l.weights ? Object.assign({}, l.weights) : null };
    },
    async saveSettings(patch) {
      if (mode === 'api') return await http('POST', 'api/settings.php', patch);
      const l = lload();
      if (patch.free) l.free = patch.free.slice();
      if ('weights' in patch) l.weights = patch.weights ? S.normW(patch.weights) : null;
      lsave(); return { free: l.free.slice(), weights: l.weights };
    },

    /* AHP */
    async ahp() {
      if (mode === 'api') return await http('GET', 'api/ahp.php');
      const l = lload(); return { responses: clone(l.ahp), history: clone(l.hist).reverse().slice(0, 10) };
    },
    async addAhp(label, pairs) {
      if (mode === 'api') return (await http('POST', 'api/ahp.php', { label, pairs })).response;
      if (!label || !label.trim()) throw new Error('Nama atau kode responden wajib diisi.');
      const l = lload();
      const row = { id: l.nextAhp++, label: label.trim().slice(0, 80), pairs: pairs.map(v => Math.round(v)), cr: Math.round(S.ahp(S.matrixFromPairs(pairs)).cr * 1e4) / 1e4, created_at: nowSql() };
      l.ahp.push(row); lsave(); return clone(row);
    },
    async delAhp(id) {
      if (mode === 'api') { await http('DELETE', 'api/ahp.php?id=' + id); return; }
      const l = lload(); l.ahp = l.ahp.filter(x => x.id !== id); lsave();
    },
    async applyAhp(weights, cr, n) {
      if (mode === 'api') { await http('POST', 'api/ahp.php?action=apply', { weights, cr, n }); return; }
      const l = lload();
      l.weights = S.normW(weights);
      l.hist.push({ w_tenggat: weights.time, w_kepentingan: weights.imp, w_kesulitan: weights.diff, w_durasi: weights.dur, cr, jumlah_responden: n, created_at: nowSql() });
      lsave();
    },

    /* evaluasi: SUS dan Spearman */
    async evals() {
      if (mode === 'api') return await http('GET', 'api/eval.php');
      const l = lload();
      const sus = l.evals.filter(e => e.type === 'sus').map(e => e.score), rho = l.evals.filter(e => e.type === 'spearman').map(e => e.score);
      const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 100) / 100 : null;
      return { items: clone(l.evals), summary: { sus_n: sus.length, sus_mean: avg(sus), rho_n: rho.length, rho_mean: avg(rho) } };
    },
    async addEval(e) {
      if (mode === 'api') return await http('POST', 'api/eval.php', e);
      const l = lload();
      let score, payload;
      if (e.type === 'sus') { score = S.susScore(e.answers); if (score === null) throw new Error('SUS membutuhkan 10 jawaban.'); payload = { answers: e.answers }; }
      else { if (!(e.rho >= -1 && e.rho <= 1) || e.n < 3) throw new Error('Nilai ρ tidak valid.'); score = Math.round(e.rho * 1e4) / 1e4; payload = { n: e.n }; }
      l.evals.push({ id: l.nextEval++, type: e.type, label: (e.label || '').slice(0, 80), payload, score, created_at: nowSql() });
      lsave(); return { ok: true, score };
    },
    async delEval(id) {
      if (mode === 'api') { await http('DELETE', 'api/eval.php?id=' + id); return; }
      const l = lload(); l.evals = l.evals.filter(x => x.id !== id); lsave();
    },
    resetLocal() { L = freshLocal(); L.firstRun = false; lsave(); }
  };
  window.Store = Store;
})();
