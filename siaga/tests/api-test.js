/*
 * Uji otomatis API PHP tanpa MySQL: menjalankan server bawaan PHP dengan basis data SQLite sementara.
 *   node tests/api-test.js
 * Perlu: php (CLI, dengan pdo_sqlite) dan Node 18+.
 */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const S = require('../engine/engine.js');

const ROOT = path.resolve(__dirname, '..');
const DB = path.join(os.tmpdir(), 'siaga-test-' + process.pid + '.sqlite');
const PORT = 8099;
const BASE = `http://127.0.0.1:${PORT}`;
const ENV = Object.assign({}, process.env, { SIAGA_DB_DRIVER: 'sqlite', SIAGA_DB_SQLITE: DB });

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'LOLOS ' : 'GAGAL ') + name + (cond ? '' : '  <- ' + extra)); };

function makeClient() {
  let cookie = '';
  return async function call(method, url, body, headers = { 'X-Requested-With': 'siaga' }) {
    const r = await fetch(BASE + url, {
      method, headers: Object.assign({ 'Content-Type': 'application/json', Cookie: cookie }, headers),
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    let json = null; try { json = await r.json(); } catch (e) { /* bukan JSON */ }
    return { status: r.status, json };
  };
}

(async () => {
  const init = spawnSync('php', ['-r', `$p=new PDO('sqlite:${DB}');$p->exec(file_get_contents('${ROOT}/tests/schema.sqlite.sql'));`], { encoding: 'utf8' });
  if (init.status !== 0) { console.error(init.stderr); process.exit(2); }
  const srv = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', ROOT], { env: ENV, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { try { await fetch(BASE + '/api/auth.php'); break; } catch (e) { await new Promise(r => setTimeout(r, 100)); } }

  try {
    const a = makeClient(), b = makeClient();

    let r = await a('GET', '/api/tasks.php');
    ok('Tanpa login: daftar tugas ditolak (401)', r.status === 401, r.status);

    r = await a('POST', '/api/auth.php?action=register', { nama: 'Faisal', email: 'a@siaga.test', password: '123456' }, {});
    ok('Tanpa header CSRF: ditolak (400)', r.status === 400, r.status);

    r = await a('POST', '/api/auth.php?action=register', { nama: 'Faisal', email: 'salah', password: '123456' });
    ok('Email tidak valid ditolak', r.status === 400, JSON.stringify(r));
    r = await a('POST', '/api/auth.php?action=register', { nama: 'Faisal', email: 'a@siaga.test', password: '123' });
    ok('Kata sandi pendek ditolak', r.status === 400, JSON.stringify(r));
    r = await a('POST', '/api/auth.php?action=register', { nama: 'Faisal', email: 'a@siaga.test', password: '123456' });
    ok('Daftar berhasil dan langsung masuk', r.status === 201 && r.json.user.email === 'a@siaga.test', JSON.stringify(r));
    r = await b('POST', '/api/auth.php?action=register', { nama: 'Lain', email: 'a@siaga.test', password: '123456' });
    ok('Email ganda ditolak (409)', r.status === 409, r.status);
    r = await b('POST', '/api/auth.php?action=login', { email: 'a@siaga.test', password: 'salahsalah' });
    ok('Login dengan sandi salah ditolak (401)', r.status === 401, r.status);
    r = await b('POST', '/api/auth.php?action=register', { nama: 'Pengguna B', email: 'b@siaga.test', password: 'abcdef' });
    ok('Pengguna kedua terdaftar', r.status === 201);
    r = await a('GET', '/api/auth.php?action=me');
    ok('me mengembalikan pengguna yang masuk', r.json.user && r.json.user.nama === 'Faisal');

    // tugas
    const t1 = { course: 'Basis Data', title: 'Rancangan ERD', deadline: '2026-10-12T23:59', dur: 6, diff: 4, imp: 5, ci: 3 };
    r = await a('POST', '/api/tasks.php', t1);
    ok('Tambah tugas', r.status === 201 && r.json.task.id > 0 && r.json.task.deadline === '2026-10-12T23:59' && r.json.task.dur === 6, JSON.stringify(r));
    const id1 = r.json.task.id;
    r = await a('POST', '/api/tasks.php', Object.assign({}, t1, { title: '' }));
    ok('Tugas tanpa judul ditolak', r.status === 400);
    r = await a('POST', '/api/tasks.php', Object.assign({}, t1, { dur: 99 }));
    ok('Durasi di luar batas ditolak', r.status === 400);
    r = await a('POST', '/api/tasks.php', Object.assign({}, t1, { imp: 9 }));
    ok('Kepentingan di luar 1-5 ditolak', r.status === 400);
    r = await a('POST', '/api/tasks.php', Object.assign({}, t1, { deadline: '2026-02-31T10:00' }));
    ok('Tanggal tidak ada (31 Februari) ditolak', r.status === 400);
    r = await a('POST', '/api/tasks.php', { tasks: [Object.assign({}, t1, { title: 'A' }), Object.assign({}, t1, { title: 'B' })] });
    ok('Tambah banyak tugas sekaligus', r.status === 201 && r.json.tasks.length === 2);
    r = await a('GET', '/api/tasks.php');
    ok('Daftar tugas berisi 3 tugas', r.json.tasks.length === 3, JSON.stringify(r.json));

    r = await a('PUT', '/api/tasks.php', { id: id1, done: true });
    ok('Tandai selesai', r.json.task.done === true);
    r = await a('PUT', '/api/tasks.php', Object.assign({}, t1, { id: id1, title: 'ERD revisi', dur: 5.5 }));
    ok('Ubah tugas', r.json.task.title === 'ERD revisi' && r.json.task.dur === 5.5 && r.json.task.done === true, JSON.stringify(r.json));

    // isolasi antar pengguna
    r = await b('GET', '/api/tasks.php');
    ok('Pengguna B tidak melihat tugas pengguna A', r.json.tasks.length === 0);
    r = await b('DELETE', `/api/tasks.php?id=${id1}`);
    ok('Pengguna B tidak bisa menghapus tugas A (404)', r.status === 404);
    r = await b('PUT', '/api/tasks.php', { id: id1, done: false });
    ok('Pengguna B tidak bisa mengubah tugas A (404)', r.status === 404);
    r = await a('DELETE', `/api/tasks.php?id=${id1}`);
    ok('Pemilik bisa menghapus tugasnya', r.status === 200);

    // pengaturan
    r = await a('GET', '/api/settings.php');
    ok('Pengaturan awal: 7 nilai jam luang, belum ada bobot', r.json.free.length === 7 && r.json.weights === null);
    r = await a('POST', '/api/settings.php', { free: [5, 3, 3, 3, 3, 3, 5] });
    ok('Simpan jam luang', r.json.free[1] === 3);
    r = await a('POST', '/api/settings.php', { free: [5, 3, 3] });
    ok('Jam luang harus 7 nilai', r.status === 400);
    r = await a('POST', '/api/settings.php', { weights: { time: 3, imp: 2, diff: 1, dur: 1 } });
    ok('Bobot di luar 0-1 ditolak', r.status === 400);
    r = await a('POST', '/api/settings.php', { weights: { time: 0.5, imp: 0.3, diff: 0.1, dur: 0.1 } });
    ok('Simpan bobot', Math.abs(r.json.weights.time - 0.5) < 1e-9);
    r = await a('GET', '/api/settings.php');
    ok('Jam luang tetap setelah bobot disimpan', r.json.free[1] === 3 && r.json.weights.imp === 0.3);

    // AHP: CR di PHP harus sama dengan CR di JavaScript
    const cases = [[0, 0, 0, 0, 0, 0], [1, 2, 3, 1, 2, 1], [8, -8, 8, 8, -8, 8], [3, -2, 5, 1, -4, 2]];
    for (const pairs of cases) {
      r = await a('POST', '/api/ahp.php', { label: 'R' + pairs.join(''), pairs });
      const js = S.ahp(S.matrixFromPairs(pairs)).cr;
      ok(`CR PHP = CR JavaScript untuk [${pairs}]`, r.status === 201 && Math.abs(r.json.response.cr - js) < 1e-3, `php=${r.json && r.json.response && r.json.response.cr} js=${js}`);
    }
    r = await a('POST', '/api/ahp.php', { label: 'X', pairs: [1, 2, 3] });
    ok('AHP: jumlah jawaban salah ditolak', r.status === 400);
    r = await a('POST', '/api/ahp.php', { label: 'X', pairs: [9, 0, 0, 0, 0, 0] });
    ok('AHP: nilai di luar -8..8 ditolak', r.status === 400);
    r = await a('GET', '/api/ahp.php');
    ok('AHP: 4 respons tersimpan', r.json.responses.length === 4);
    const rid = r.json.responses[0].id;
    r = await b('DELETE', `/api/ahp.php?id=${rid}`);
    ok('AHP: pengguna lain tidak bisa menghapus respons', r.status === 404);
    r = await a('POST', '/api/ahp.php?action=apply', { weights: { time: 0.47, imp: 0.28, diff: 0.16, dur: 0.09 }, cr: 0.011, n: 8 });
    ok('AHP: terapkan bobot', r.status === 201);
    r = await a('GET', '/api/settings.php');
    ok('Bobot aktif berubah menjadi bobot AHP', r.json.weights.time === 0.47);
    r = await a('GET', '/api/ahp.php');
    ok('Riwayat bobot tercatat', r.json.history.length === 1 && Math.abs(r.json.history[0].jumlah_responden - 8) < 1e-9);

    // evaluasi
    r = await a('POST', '/api/eval.php', { type: 'sus', label: 'R1', answers: [5, 1, 5, 1, 5, 1, 5, 1, 5, 1] });
    ok('SUS jawaban terbaik = 100', r.status === 201 && r.json.score === 100, JSON.stringify(r.json));
    r = await a('POST', '/api/eval.php', { type: 'sus', label: 'R2', answers: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3] });
    ok('SUS jawaban netral = 50', r.json.score === 50);
    r = await a('POST', '/api/eval.php', { type: 'sus', answers: [1, 2, 3] });
    ok('SUS dengan jawaban kurang ditolak', r.status === 400);
    r = await a('POST', '/api/eval.php', { type: 'spearman', label: 'M1', rho: 0.86, n: 6 });
    ok('Simpan Spearman', r.status === 201);
    r = await a('POST', '/api/eval.php', { type: 'spearman', rho: 1.5, n: 6 });
    ok('Spearman di luar -1..1 ditolak', r.status === 400);
    r = await a('GET', '/api/eval.php');
    ok('Ringkasan evaluasi: rata-rata SUS 75, rata-rata ρ 0,86', r.json.summary.sus_n === 2 && r.json.summary.sus_mean === 75 && r.json.summary.rho_mean === 0.86, JSON.stringify(r.json.summary));

    // Telegram dan pengingat (dry run)
    r = await a('POST', '/api/auth.php?action=telegram', { chat_id: 'abc' });
    ok('ID Telegram non-angka ditolak', r.status === 400);
    r = await a('POST', '/api/auth.php?action=telegram', { chat_id: '123456789' });
    ok('Simpan ID Telegram', r.status === 200);
    const soon = new Date(Date.now() + 10 * 36e5), p = n => String(n).padStart(2, '0');
    const dl = `${soon.getFullYear()}-${p(soon.getMonth() + 1)}-${p(soon.getDate())}T${p(soon.getHours())}:${p(soon.getMinutes())}`;
    await a('POST', '/api/tasks.php', { course: 'Kalkulus', title: 'Kuis turunan', deadline: dl, dur: 2, diff: 3, imp: 3 });
    const cron = spawnSync('php', [path.join(ROOT, 'api/cron_reminder.php'), '--dry'], { env: ENV, encoding: 'utf8' });
    ok('Pengingat: tugas 10 jam lagi memicu SIAGA 1', /\[SIAGA 1\] Kuis turunan/.test(cron.stdout), cron.stdout + cron.stderr);
    ok('Pengingat: tugas bertenggat jauh tidak memicu pesan', !/Rancangan|\] A|\] B/.test(cron.stdout), cron.stdout);

    r = await a('POST', '/api/auth.php?action=logout', {});
    r = await a('GET', '/api/tasks.php');
    ok('Setelah keluar, akses ditolak lagi (401)', r.status === 401);
  } catch (e) {
    fail++; console.log('GAGAL pengecualian: ' + e.stack);
  } finally {
    srv.kill(); try { fs.unlinkSync(DB); } catch (e) { /* abaikan */ }
  }
  console.log(`\n${pass} lolos, ${fail} gagal`);
  process.exit(fail ? 1 : 0);
})();
