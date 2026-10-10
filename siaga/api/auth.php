<?php
// Autentikasi: ?action=register | login | logout | me
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

$action = $_GET['action'] ?? 'me';

function user_json(array $u): array
{
    return ['id' => (int) $u['id'], 'nama' => $u['nama'], 'email' => $u['email'], 'telegram' => $u['telegram_chat_id'] ?? null];
}

if ($action === 'me') {
    $id = current_user_id();
    if (!$id) out(['user' => null]);
    $st = db()->prepare('SELECT id, nama, email, telegram_chat_id FROM users WHERE id = ?');
    $st->execute([$id]);
    $u = $st->fetch();
    out(['user' => $u ? user_json($u) : null]);
}

if ($action === 'logout') {
    $_SESSION = [];
    session_destroy();
    out(['ok' => true]);
}

$b = body();

if ($action === 'register') {
    if (!cfg('allow_register')) fail('Pendaftaran ditutup.', 403);
    $nama = trim((string) ($b['nama'] ?? ''));
    $email = strtolower(trim((string) ($b['email'] ?? '')));
    $pass = (string) ($b['password'] ?? '');
    if ($nama === '' || mb_strlen($nama) > 100) fail('Nama wajib diisi (maksimal 100 karakter).');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 120) fail('Format email tidak valid.');
    if (strlen($pass) < 6) fail('Kata sandi minimal 6 karakter.');
    $st = db()->prepare('SELECT id FROM users WHERE email = ?');
    $st->execute([$email]);
    if ($st->fetch()) fail('Email sudah terdaftar. Silakan masuk.', 409);
    $st = db()->prepare('INSERT INTO users (nama, email, password_hash, created_at) VALUES (?, ?, ?, ?)');
    $st->execute([$nama, $email, password_hash($pass, PASSWORD_DEFAULT), now_sql()]);
    session_regenerate_id(true);
    $_SESSION['uid'] = (int) db()->lastInsertId();
    out(['user' => ['id' => $_SESSION['uid'], 'nama' => $nama, 'email' => $email, 'telegram' => null]], 201);
}

if ($action === 'login') {
    $email = strtolower(trim((string) ($b['email'] ?? '')));
    $pass = (string) ($b['password'] ?? '');
    $st = db()->prepare('SELECT id, nama, email, password_hash, telegram_chat_id FROM users WHERE email = ?');
    $st->execute([$email]);
    $u = $st->fetch();
    if (!$u || !password_verify($pass, $u['password_hash'])) {
        usleep(300000); // memperlambat tebak-tebakan kata sandi
        fail('Email atau kata sandi salah.', 401);
    }
    session_regenerate_id(true);
    $_SESSION['uid'] = (int) $u['id'];
    out(['user' => user_json($u)]);
}

if ($action === 'telegram') {
    $uid = require_login();
    $chat = trim((string) ($b['chat_id'] ?? ''));
    if ($chat !== '' && !preg_match('/^-?\d{4,20}$/', $chat)) fail('ID obrolan Telegram harus berupa angka.');
    $st = db()->prepare('UPDATE users SET telegram_chat_id = ? WHERE id = ?');
    $st->execute([$chat === '' ? null : $chat, $uid]);
    out(['ok' => true, 'telegram' => $chat === '' ? null : $chat]);
}

fail('Aksi tidak dikenal.', 404);
