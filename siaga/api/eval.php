<?php
// Evaluasi: GET daftar + ringkasan | POST {type: sus|spearman, label, answers|rho|n} | DELETE ?id=
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

$uid = require_login();
$method = $_SERVER['REQUEST_METHOD'];

function sus_score(array $a): ?float
{
    if (count($a) !== 10) return null;
    $s = 0;
    foreach (array_values($a) as $i => $x) {
        if (!is_numeric($x) || $x < 1 || $x > 5) return null;
        $s += ($i % 2 === 0) ? ((int) $x - 1) : (5 - (int) $x);
    }
    return $s * 2.5;
}

if ($method === 'GET') {
    $st = db()->prepare('SELECT id, type, label, payload, score, created_at FROM evaluations WHERE user_id = ? ORDER BY id ASC');
    $st->execute([$uid]);
    $rows = $st->fetchAll();
    $sus = []; $rho = [];
    foreach ($rows as $r) {
        if ($r['type'] === 'sus') $sus[] = (float) $r['score'];
        if ($r['type'] === 'spearman') $rho[] = (float) $r['score'];
    }
    $avg = fn(array $x) => $x ? round(array_sum($x) / count($x), 2) : null;
    out([
        'items' => array_map(fn($r) => [
            'id' => (int) $r['id'], 'type' => $r['type'], 'label' => $r['label'],
            'payload' => json_decode($r['payload'], true), 'score' => (float) $r['score'], 'created_at' => $r['created_at'],
        ], $rows),
        'summary' => ['sus_n' => count($sus), 'sus_mean' => $avg($sus), 'rho_n' => count($rho), 'rho_mean' => $avg($rho)],
    ]);
}

if ($method === 'POST') {
    $b = body();
    $type = (string) ($b['type'] ?? '');
    $label = trim((string) ($b['label'] ?? ''));
    if (mb_strlen($label) > 80) fail('Label maksimal 80 karakter.');
    if ($type === 'sus') {
        $answers = $b['answers'] ?? [];
        $score = is_array($answers) ? sus_score($answers) : null;
        if ($score === null) fail('SUS membutuhkan 10 jawaban bernilai 1 sampai 5.');
        $payload = ['answers' => array_map('intval', array_values($answers))];
    } elseif ($type === 'spearman') {
        $rho = (float) ($b['rho'] ?? 2);
        $n = (int) ($b['n'] ?? 0);
        if ($rho < -1 || $rho > 1 || $n < 3) fail('Nilai ρ harus antara -1 dan 1 dengan minimal 3 tugas.');
        $score = round($rho, 4);
        $payload = ['n' => $n];
    } else {
        fail('Jenis evaluasi tidak dikenal.');
    }
    db()->prepare('INSERT INTO evaluations (user_id, type, label, payload, score, created_at) VALUES (?,?,?,?,?,?)')
        ->execute([$uid, $type, $label, json_encode($payload), $score, now_sql()]);
    out(['ok' => true, 'score' => $score], 201);
}

if ($method === 'DELETE') {
    $st = db()->prepare('DELETE FROM evaluations WHERE id = ? AND user_id = ?');
    $st->execute([(int) ($_GET['id'] ?? 0), $uid]);
    if ($st->rowCount() === 0) fail('Data tidak ditemukan.', 404);
    out(['ok' => true]);
}

fail('Metode tidak didukung.', 405);
