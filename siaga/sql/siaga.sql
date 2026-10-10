-- SIAGA - skema basis data (MySQL / MariaDB, XAMPP)
-- Cara pakai: phpMyAdmin -> tab "Import" -> pilih file ini -> Kirim.

CREATE DATABASE IF NOT EXISTS siaga CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE siaga;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(100) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  telegram_chat_id VARCHAR(40) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  mata_kuliah VARCHAR(100) NOT NULL DEFAULT '',
  judul VARCHAR(150) NOT NULL,
  deadline DATETIME NOT NULL,
  durasi_jam DECIMAL(4,1) NOT NULL,
  kesulitan TINYINT NOT NULL,
  kepentingan TINYINT NOT NULL,
  warna TINYINT NOT NULL DEFAULT 1,
  selesai TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tasks_user (user_id, selesai, deadline),
  CONSTRAINT fk_tasks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Jam luang per hari dan bobot aktif milik tiap pengguna (disimpan sebagai JSON)
CREATE TABLE IF NOT EXISTS settings (
  user_id INT PRIMARY KEY,
  free_json VARCHAR(100) NULL,
  weights_json VARCHAR(200) NULL,
  CONSTRAINT fk_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Jawaban perbandingan berpasangan AHP, satu baris per responden
CREATE TABLE IF NOT EXISTS ahp_responses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  label VARCHAR(80) NOT NULL,
  pairs_json VARCHAR(100) NOT NULL,
  cr DECIMAL(8,4) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ahp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Riwayat bobot yang pernah diterapkan (bukti untuk laporan)
CREATE TABLE IF NOT EXISTS ahp_weights (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  w_tenggat DECIMAL(6,4) NOT NULL,
  w_kepentingan DECIMAL(6,4) NOT NULL,
  w_kesulitan DECIMAL(6,4) NOT NULL,
  w_durasi DECIMAL(6,4) NOT NULL,
  cr DECIMAL(8,4) NOT NULL,
  jumlah_responden INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_aw_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Hasil evaluasi: SUS (kebergunaan) dan Spearman (kesesuaian urutan)
CREATE TABLE IF NOT EXISTS evaluations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type VARCHAR(12) NOT NULL,
  label VARCHAR(80) NOT NULL DEFAULT '',
  payload VARCHAR(500) NOT NULL,
  score DECIMAL(8,3) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_eval_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Pengingat yang sudah terkirim, supaya satu tingkat tidak dikirim dua kali
CREATE TABLE IF NOT EXISTS reminders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  tingkat TINYINT NOT NULL,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_reminder (task_id, tingkat),
  CONSTRAINT fk_rem_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB;
