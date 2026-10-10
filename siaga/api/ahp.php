<?php
// AHP: GET daftar respons + riwayat bobot | POST tambah respons | DELETE ?id= | POST ?action=apply
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

$uid = require_login();
$method = $_SERVER['REQUEST_METHOD'];

function resp_json(array $r): array
{
    return [
        'id' => (int) $r['id'],
        'label' => $r['label'],
        'pairs' => json_decode($r['pairs_json'], true),
        'cr' => (float) $r['cr'],
        'created_at' => $r['created_at'],
    ];
}

function clean_pairs($p): ?array
{
    if (!is_array($p) || count($p) !== 6) return null;
    $out = [];
    foreach ($p as $v) {
        if (!is_numeric($v) || $v < -8 || $v > 8) return null;
        $out[] = (int) round((float) $v);
    }
    return $out;
}

if ($method === 'GET') {
    $st = db()->prepare('SELECT * FROM ahp_responses WHERE user_id = ? ORDER BY id ASC');
    $st->execute([$uid]);
    $resp = array_map('resp_json', $st->fetchAll());
    $st = db()->prepare('SELECT * FROM ahp_weights WHERE user_id = ? ORDER BY id DESC LIMIT 10');
    $st->execute([$uid]);
    out(['responses' => $resp, 'history' => $st->fetchAll()]);
}

if ($method === 'POST' && ($_GET['action'] ?? '') === 'apply') {
    $b = body();
    $w = $b['weights'] ?? [];
    $vals = [];
    foreach (['time', 'imp', 'diff', 'dur'] as $k) {
        $v = (float) ($w[$k] ?? -1);
        if ($v < 0 || $v > 1) fail('Bobot tidak valid.');
        $vals[$k] = $v;
    }
    $cr = (float) ($b['cr'] ?? 0);
    $n = max(0, (int) ($b['n'] ?? 0));
    db()->prepare('INSERT INTO ahp_weights (user_id, w_tenggat, w_kepentingan, w_kesulitan, w_durasi, cr, jumlah_responden, created_at) VALUES (?,?,?,?,?,?,?,?)')
        ->execute([$uid, $vals['time'], $vals['imp'], $vals['diff'], $vals['dur'], $cr, $n, now_sql()]);
    // simpan juga sebagai bobot aktif pengguna
    $wj = json_encode($vals);
    $st = db()->prepare('SELECT 1 FROM settings WHERE user_id = ?');
    $st->execute([$uid]);
    if ($st->fetch()) db()->prepare('UPDATE settings SET weights_json = ? WHERE user_id = ?')->execute([$wj, $uid]);
    else db()->prepare('INSERT INTO settings (user_id, free_json, weights_json) VALUES (?,?,?)')->execute([$uid, null, $wj]);
    out(['ok' => true, 'weights' => $vals], 201);
}

if ($method === 'POST') {
    $b = body();
    $label = trim((string) ($b['label'] ?? ''));
    if ($label === '' || mb_strlen($label) > 80) fail('Nama atau kode responden wajib diisi (maksimal 80 karakter).');
    $pairs = clean_pairs($b['pairs'] ?? null);
    if ($pairs === null) fail('Jawaban harus 6 angka antara -8 dan 8.');
    $cr = round(ahp_cr($pairs), 4);
    db()->prepare('INSERT INTO ahp_responses (user_id, label, pairs_json, cr, created_at) VALUES (?,?,?,?,?)')
        ->execute([$uid, $label, json_encode($pairs), $cr, now_sql()]);
    $id = (int) db()->lastInsertId();
    $st = db()->prepare('SELECT * FROM ahp_responses WHERE id = ?');
    $st->execute([$id]);
    out(['response' => resp_json($st->fetch())], 201);
}

if ($method === 'DELETE') {
    $st = db()->prepare('DELETE FROM ahp_responses WHERE id = ? AND user_id = ?');
    $st->execute([(int) ($_GET['id'] ?? 0), $uid]);
    if ($st->rowCount() === 0) fail('Respons tidak ditemukan.', 404);
    out(['ok' => true]);
}

fail('Metode tidak didukung.', 405);
