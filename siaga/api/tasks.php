<?php
// Tugas: GET daftar | POST tambah (atau {tasks:[...]} untuk banyak) | PUT ubah | DELETE ?id=
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

$uid = require_login();
$method = $_SERVER['REQUEST_METHOD'];

function row_to_json(array $r): array
{
    return [
        'id' => (int) $r['id'],
        'course' => $r['mata_kuliah'],
        'title' => $r['judul'],
        'deadline' => dt_to_js($r['deadline']),
        'dur' => (float) $r['durasi_jam'],
        'diff' => (int) $r['kesulitan'],
        'imp' => (int) $r['kepentingan'],
        'ci' => (int) $r['warna'],
        'done' => (bool) $r['selesai'],
    ];
}

// Memvalidasi satu tugas; mengembalikan [data, pesanKesalahan]
function clean_task(array $b): array
{
    $course = trim((string) ($b['course'] ?? ''));
    $title = trim((string) ($b['title'] ?? ''));
    $deadline = dt_to_sql((string) ($b['deadline'] ?? ''));
    $dur = (float) ($b['dur'] ?? 0);
    $diff = (int) ($b['diff'] ?? 0);
    $imp = (int) ($b['imp'] ?? 0);
    if ($title === '' || mb_strlen($title) > 150) return [null, 'Nama tugas wajib diisi (maksimal 150 karakter).'];
    if (mb_strlen($course) > 100) return [null, 'Nama mata kuliah maksimal 100 karakter.'];
    if ($deadline === null) return [null, 'Format tenggat tidak valid.'];
    if ($dur < 0.5 || $dur > 40) return [null, 'Durasi harus antara 0,5 dan 40 jam.'];
    if ($diff < 1 || $diff > 5 || $imp < 1 || $imp > 5) return [null, 'Kesulitan dan kepentingan harus 1 sampai 5.'];
    $ci = (int) ($b['ci'] ?? 1);
    return [[$course, $title, $deadline, round($dur * 2) / 2, $diff, $imp, ($ci >= 1 && $ci <= 6) ? $ci : 1], null];
}

function fetch_task(int $id, int $uid): ?array
{
    $st = db()->prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?');
    $st->execute([$id, $uid]);
    $r = $st->fetch();
    return $r ? row_to_json($r) : null;
}

if ($method === 'GET') {
    $st = db()->prepare('SELECT * FROM tasks WHERE user_id = ? ORDER BY deadline ASC, id ASC');
    $st->execute([$uid]);
    out(['tasks' => array_map('row_to_json', $st->fetchAll())]);
}

if ($method === 'POST') {
    $b = body();
    $list = isset($b['tasks']) && is_array($b['tasks']) ? $b['tasks'] : [$b];
    if (count($list) > 100) fail('Maksimal 100 tugas per permintaan.');
    $ins = db()->prepare('INSERT INTO tasks (user_id, mata_kuliah, judul, deadline, durasi_jam, kesulitan, kepentingan, warna, selesai, created_at) VALUES (?,?,?,?,?,?,?,?,0,?)');
    $created = [];
    db()->beginTransaction();
    foreach ($list as $item) {
        [$d, $err] = clean_task(is_array($item) ? $item : []);
        if ($err) { db()->rollBack(); fail($err); }
        $ins->execute(array_merge([$uid], $d, [now_sql()]));
        $created[] = fetch_task((int) db()->lastInsertId(), $uid);
    }
    db()->commit();
    out(isset($b['tasks']) ? ['tasks' => $created] : ['task' => $created[0]], 201);
}

if ($method === 'PUT') {
    $b = body();
    $id = (int) ($b['id'] ?? 0);
    if (!fetch_task($id, $uid)) fail('Tugas tidak ditemukan.', 404);
    if (array_keys($b) === ['id', 'done'] || (isset($b['done']) && !isset($b['title']))) {
        $st = db()->prepare('UPDATE tasks SET selesai = ? WHERE id = ? AND user_id = ?');
        $st->execute([!empty($b['done']) ? 1 : 0, $id, $uid]);
    } else {
        [$d, $err] = clean_task($b);
        if ($err) fail($err);
        $st = db()->prepare('UPDATE tasks SET mata_kuliah=?, judul=?, deadline=?, durasi_jam=?, kesulitan=?, kepentingan=?, warna=? WHERE id=? AND user_id=?');
        $st->execute(array_merge($d, [$id, $uid]));
    }
    out(['task' => fetch_task($id, $uid)]);
}

if ($method === 'DELETE') {
    $id = (int) ($_GET['id'] ?? 0);
    $st = db()->prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?');
    $st->execute([$id, $uid]);
    if ($st->rowCount() === 0) fail('Tugas tidak ditemukan.', 404);
    out(['ok' => true]);
}

fail('Metode tidak didukung.', 405);
