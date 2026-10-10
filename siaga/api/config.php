<?php
// Pengaturan SIAGA. Untuk XAMPP bawaan, tidak ada yang perlu diubah.
// Nilai bisa ditimpa lewat variabel lingkungan (dipakai saat pengujian).
return [
    'db_driver'      => getenv('SIAGA_DB_DRIVER') ?: 'mysql',   // 'mysql' atau 'sqlite' (sqlite hanya untuk uji)
    'db_host'        => getenv('SIAGA_DB_HOST') ?: '127.0.0.1',
    'db_name'        => getenv('SIAGA_DB_NAME') ?: 'siaga',
    'db_user'        => getenv('SIAGA_DB_USER') ?: 'root',
    'db_pass'        => getenv('SIAGA_DB_PASS') ?: '',
    'db_sqlite'      => getenv('SIAGA_DB_SQLITE') ?: __DIR__ . '/../tests/test.sqlite',

    // Isi token dari @BotFather bila ingin pengingat Telegram (opsional)
    'telegram_token' => getenv('SIAGA_TELEGRAM_TOKEN') ?: '',

    // Matikan setelah semua anggota tim terdaftar
    'allow_register' => true,
];
