<?php
// Pengingat Telegram (opsional). Dijalankan dari terminal / penjadwal, bukan dari browser:
//   php api/cron_reminder.php            kirim pengingat yang jatuh tempo
//   php api/cron_reminder.php --dry      hanya tampilkan pesan, tidak mengirim
// Windows: jadwalkan dengan Task Scheduler tiap 30 menit.  Linux: crontab -e -> */30 * * * * php /path/api/cron_reminder.php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(403); exit('Hanya untuk terminal.'); }
require __DIR__ . '/bootstrap.php';

$dry = in_array('--dry', $argv ?? [], true);
$token = (string) cfg('telegram_token');
if (!$dry && $token === '') { fwrite(STDERR, "Isi telegram_token di api/config.php terlebih dahulu.\n"); exit(1); }

/*
 * Aturan tingkat (selaras dengan label SIAGA di aplikasi):
 *   tingkat 2 = SIAGA 1 : terlambat atau sisa waktu <= 24 jam
 *   tingkat 1 = SIAGA 2 : sisa waktu <= 72 jam dan kepentingan >= 4
 * Satu tingkat dikirim sekali per tugas (tabel reminders).
 */
function tier_for(float $hoursLeft, int $imp): int
{
    if ($hoursLeft <= 24) return 2;
    if ($hoursLeft <= 72 && $imp >= 4) return 1;
    return 0;
}

function send_telegram(string $token, string $chat, string $text): bool
{
    $ch = curl_init("https://api.telegram.org/bot{$token}/sendMessage");
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15,
        CURLOPT_POSTFIELDS => ['chat_id' => $chat, 'text' => $text]]);
    $res = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return $res !== false && $code === 200;
}

$st = db()->query("SELECT t.id, t.judul, t.mata_kuliah, t.deadline, t.kepentingan, u.telegram_chat_id AS chat
                   FROM tasks t JOIN users u ON u.id = t.user_id
                   WHERE t.selesai = 0 AND u.telegram_chat_id IS NOT NULL AND u.telegram_chat_id <> ''");
$sent = 0;
foreach ($st->fetchAll() as $t) {
    $left = (strtotime($t['deadline']) - time()) / 3600;
    $tier = tier_for($left, (int) $t['kepentingan']);
    if ($tier === 0) continue;
    $chk = db()->prepare('SELECT 1 FROM reminders WHERE task_id = ? AND tingkat >= ?');
    $chk->execute([(int) $t['id'], $tier]);
    if ($chk->fetch()) continue;

    $label = $tier === 2 ? 'SIAGA 1' : 'SIAGA 2';
    $when = $left <= 0 ? 'sudah lewat tenggat' : 'sisa ' . ($left < 48 ? round($left) . ' jam' : round($left / 24, 1) . ' hari');
    $msg = "[{$label}] {$t['judul']}" . ($t['mata_kuliah'] ? " ({$t['mata_kuliah']})" : '') . "\nTenggat: {$t['deadline']}, {$when}.";

    if ($dry) { echo $msg . "\n---\n"; continue; }
    if (send_telegram($token, (string) $t['chat'], $msg)) {
        db()->prepare('INSERT INTO reminders (task_id, tingkat, sent_at) VALUES (?,?,?)')->execute([(int) $t['id'], $tier, now_sql()]);
        $sent++;
    } else {
        fwrite(STDERR, "Gagal mengirim untuk tugas #{$t['id']}\n");
    }
}
echo $dry ? "Selesai (dry run).\n" : "Terkirim: {$sent}\n";
