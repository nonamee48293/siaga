<?php
// Bagian bersama semua endpoint: koneksi, sesi, bantuan JSON, dan pemeriksaan login.
declare(strict_types=1);

$GLOBALS['SIAGA_CONFIG'] = require __DIR__ . '/config.php';

if (PHP_SAPI !== 'cli') {
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store');
    session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax', 'path' => '/']);
    session_start();

    // Perlindungan CSRF sederhana: permintaan yang mengubah data harus membawa header ini.
    // Cookie SameSite=Lax sudah mencegah pengiriman lintas situs; header ini lapisan kedua.
    if ($_SERVER['REQUEST_METHOD'] !== 'GET' && ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'siaga') {
        fail('Permintaan tidak valid.', 400);
    }
}

set_exception_handler(function (Throwable $e) {
    error_log('[SIAGA] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    if (PHP_SAPI === 'cli') { fwrite(STDERR, $e->getMessage() . "\n"); exit(1); }
    fail('Terjadi kesalahan di server. Periksa koneksi basis data dan log PHP.', 500);
});

function cfg(string $key)
{
    return $GLOBALS['SIAGA_CONFIG'][$key] ?? null;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo) return $pdo;
    $opts = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC];
    if (cfg('db_driver') === 'sqlite') {
        $pdo = new PDO('sqlite:' . cfg('db_sqlite'), null, null, $opts);
        $pdo->exec('PRAGMA foreign_keys = ON');
    } else {
        $dsn = 'mysql:host=' . cfg('db_host') . ';dbname=' . cfg('db_name') . ';charset=utf8mb4';
        $pdo = new PDO($dsn, cfg('db_user'), cfg('db_pass'), $opts + [PDO::ATTR_EMULATE_PREPARES => false]);
    }
    return $pdo;
}

function body(): array
{
    $d = json_decode((string) file_get_contents('php://input'), true);
    return is_array($d) ? $d : [];
}

function out($data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
    exit;
}

function fail(string $msg, int $code = 400): void
{
    out(['error' => $msg], $code);
}

function current_user_id(): ?int
{
    return isset($_SESSION['uid']) ? (int) $_SESSION['uid'] : null;
}

function require_login(): int
{
    $id = current_user_id();
    if (!$id) fail('Silakan masuk terlebih dahulu.', 401);
    return $id;
}

function now_sql(): string
{
    return date('Y-m-d H:i:s');
}

// "2026-10-09T23:59" (front-end) <-> "2026-10-09 23:59:00" (basis data)
function dt_to_sql(string $s): ?string
{
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/', $s, $m)) return null;
    if (!checkdate((int) $m[2], (int) $m[3], (int) $m[1])) return null;
    if ((int) $m[4] > 23 || (int) $m[5] > 59) return null;
    return "$m[1]-$m[2]-$m[3] $m[4]:$m[5]:00";
}

function dt_to_js(string $s): string
{
    return substr(str_replace(' ', 'T', $s), 0, 16);
}

// ---- AHP sisi server (sama dengan engine/engine.js, dipakai untuk menghitung CR) ----
function ahp_ratio(float $p): float
{
    return $p >= 0 ? $p + 1 : 1 / (1 - $p);
}

function ahp_cr(array $pairs): float
{
    $pairIdx = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
    $n = 4;
    $m = array_fill(0, $n, array_fill(0, $n, 1.0));
    foreach ($pairIdx as $k => [$i, $j]) {
        $v = ahp_ratio((float) $pairs[$k]);
        $m[$i][$j] = $v;
        $m[$j][$i] = 1 / $v;
    }
    $gm = [];
    foreach ($m as $row) $gm[] = pow(array_product($row), 1 / $n);
    $s = array_sum($gm);
    $w = array_map(fn($x) => $x / $s, $gm);
    $lmax = 0.0;
    for ($i = 0; $i < $n; $i++) {
        $aw = 0.0;
        for ($j = 0; $j < $n; $j++) $aw += $m[$i][$j] * $w[$j];
        $lmax += $aw / $w[$i];
    }
    $lmax /= $n;
    $ci = ($lmax - $n) / ($n - 1);
    return $ci / 0.90; // RI untuk n = 4
}
