<?php
// Pengaturan pengguna: jam luang per hari (indeks 0 = Minggu) dan bobot aktif.
// GET -> {free, weights}   POST {free?, weights?} -> {free, weights}
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

$uid = require_login();
$DEFAULT_FREE = [5, 4, 4, 4, 4, 4, 5];

function load_settings(int $uid): array
{
    $st = db()->prepare('SELECT free_json, weights_json FROM settings WHERE user_id = ?');
    $st->execute([$uid]);
    $r = $st->fetch();
    global $DEFAULT_FREE;
    $free = $r && $r['free_json'] ? json_decode($r['free_json'], true) : null;
    $w = $r && $r['weights_json'] ? json_decode($r['weights_json'], true) : null;
    return [
        'free' => (is_array($free) && count($free) === 7) ? $free : $DEFAULT_FREE,
        'weights' => is_array($w) ? $w : null,
    ];
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') out(load_settings($uid));

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $b = body();
    $cur = load_settings($uid);
    $free = $cur['free'];
    $weights = $cur['weights'];

    if (isset($b['free'])) {
        if (!is_array($b['free']) || count($b['free']) !== 7) fail('Jam luang harus 7 nilai (Minggu sampai Sabtu).');
        $free = [];
        foreach ($b['free'] as $v) {
            $v = (float) $v;
            if ($v < 0 || $v > 16) fail('Jam luang per hari harus antara 0 dan 16.');
            $free[] = round($v * 2) / 2;
        }
    }
    if (array_key_exists('weights', $b)) {
        if ($b['weights'] === null) {
            $weights = null;
        } else {
            $w = [];
            foreach (['time', 'imp', 'diff', 'dur'] as $k) {
                $v = (float) ($b['weights'][$k] ?? -1);
                if ($v < 0 || $v > 1) fail('Bobot harus antara 0 dan 1.');
                $w[$k] = $v;
            }
            $sum = array_sum($w);
            if ($sum <= 0) fail('Jumlah bobot harus lebih dari 0.');
            foreach ($w as $k => $v) $w[$k] = round($v / $sum, 4);
            $weights = $w;
        }
    }

    $fj = json_encode($free);
    $wj = $weights === null ? null : json_encode($weights);
    $st = db()->prepare('SELECT 1 FROM settings WHERE user_id = ?');
    $st->execute([$uid]);
    if ($st->fetch()) {
        db()->prepare('UPDATE settings SET free_json = ?, weights_json = ? WHERE user_id = ?')->execute([$fj, $wj, $uid]);
    } else {
        db()->prepare('INSERT INTO settings (user_id, free_json, weights_json) VALUES (?,?,?)')->execute([$uid, $fj, $wj]);
    }
    out(['free' => $free, 'weights' => $weights]);
}

fail('Metode tidak didukung.', 405);
