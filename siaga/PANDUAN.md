# SIAGA: panduan pemasangan, pemakaian, dan penulisan

**SIAGA** (Sistem Informasi Akademik dengan Prioritas dan Penjadwalan) menentukan tugas mana yang dikerjakan dulu, kapan, berapa jam, dan kenapa. Nama "siaga" juga dipakai sebagai tingkat prioritas: SIAGA 1 (paling mendesak) sampai SIAGA 4.

Baca bagian 1 sampai 3 dulu. Bagian 6 dan 7 wajib dibaca sebelum menulis hasil di proposal.

---

## 1. Isi paket

```
siaga/
├─ index.html              aplikasi utama (6 tab)
├─ ahp.html                formulir survei bobot untuk responden (berdiri sendiri, tanpa server)
├─ engine/engine.js        mesin: skor SAW, penjadwal, AHP, Spearman, SUS, simulasi, uji fungsi
├─ assets/                 style.css, store.js (data), ahp-ui.js, app.js (antarmuka)
├─ api/                    PHP: auth, tasks, settings, ahp, eval, cron_reminder, config
├─ sql/siaga.sql           skema MySQL
├─ tests/                  run-tests.js, api-test.js, schema.sqlite.sql (hanya untuk uji)
├─ docs/                   FORMULIR.md (teks survei), hasil-uji-engine.txt (lampiran)
└─ PANDUAN.md              file ini
```

Aplikasi punya dua mode, dipilih otomatis:

| Mode | Kapan aktif | Data disimpan di | Cocok untuk |
|---|---|---|---|
| **Lokal** | `index.html` dibuka langsung dari folder, atau server PHP/MySQL belum siap | peramban masing-masing | demo cepat, rekam video, hosting statis |
| **Server** | dibuka lewat `http://localhost/siaga/` dengan MySQL siap | MySQL, per akun | arsitektur penuh untuk proposal |

Badge di pojok kanan atas menunjukkan mode yang sedang berjalan.

## 2. Menjalankan

### A. Mode lokal (1 menit)
1. Ekstrak zip.
2. Klik dua kali `index.html`. Selesai.

### B. Mode server dengan XAMPP (15 menit)
1. Pasang **XAMPP** (PHP 8.0 atau lebih baru). Buka XAMPP Control Panel, jalankan **Apache** dan **MySQL**.
2. Salin folder `siaga` ke `C:\xampp\htdocs\` (Mac/Linux: `/opt/lampp/htdocs/`).
3. Buka `http://localhost/phpmyadmin` → tab **Import** → pilih `sql/siaga.sql` → **Import**. Database `siaga` dan 7 tabel terbentuk.
4. Buka `http://localhost/siaga/`. Klik **Buat akun baru**, daftar, lalu mulai.
5. Bila badge masih "Mode lokal" dan muncul peringatan kuning, artinya server PHP terdeteksi tetapi basis data belum siap. Periksa langkah 3 dan isi `api/config.php` (bawaan XAMPP: pengguna `root`, kata sandi kosong).

**Jujur soal pengujian:** API PHP saya uji penuh dengan SQLite sementara (50 uji), dan antarmuka diuji di browser pada dua mode. Skema `sql/siaga.sql` memakai sintaks MySQL dan **belum saya jalankan di MySQL sungguhan** karena tidak tersedia di lingkungan saya. Bila impor gagal, kirim pesan galatnya dan saya perbaiki.

### C. Hosting demo
- **Statis (mode lokal):** buka app.netlify.com/drop, seret **seluruh folder** `siaga`. Dapat tautan publik. Pengguna lain punya data masing-masing di peramban mereka.
- **Dengan PHP/MySQL:** layanan gratis seperti InfinityFree. Unggah folder, buat database, impor `sql/siaga.sql`, ubah `api/config.php`. Sebelum dipublikasikan: ubah `allow_register` menjadi `false` setelah semua anggota tim terdaftar, dan hapus folder `tests/`.

## 3. Alur demo untuk juri dan video (sekitar 90 detik)

1. **Prioritas:** tunjukkan 6 tugas, skor, tingkat SIAGA, dan kalimat alasan ("Dorongan terbesar: …").
2. **Mesin waktu:** geser slider ke +48 jam. Skor naik, urutan bergeser dengan animasi, tugas menjadi SIAGA 1, pengingat muncul. Ini adegan paling kuat.
3. **Rencana harian:** ubah satu jam luang. Tugas dibagi ke slot 7 hari dan peringatan muncul bila jam tidak cukup.
4. **Bobot AHP:** tunjukkan responden, CR, dan bobot hasil gabungan.
5. **Pembanding:** tunjukkan tabel SIAGA dibanding metode lain.
6. **Tambah tugas:** isi form, lihat perkiraan skor dan urutan sebelum disimpan.

Rekam layar: Win+G (Windows) atau Cmd+Shift+5 (Mac).

## 4. Pengumpulan data (kerjakan hari ini, ini yang paling lama)

Semua angka di proposal harus berasal dari orang sungguhan. Data contoh di aplikasi hanya untuk demo.

**a. Bobot AHP (target 5 sampai 10 responden: mahasiswa senior atau dosen)**
1. Kirim file `ahp.html` (atau tautan hostingnya) ke responden. Mereka mengisi 6 perbandingan dan menyalin kode `SIAGA1.…`.
2. Responden mengirim kode lewat chat. Di aplikasi: tab **Bobot AHP** → tempel kode (satu per baris) → **Impor**.
3. Periksa kolom CR. Responden dengan CR ≥ 0,1 diabaikan secara bawaan. Tulis di proposal berapa responden yang dipakai dan berapa yang dikeluarkan.
4. Klik **Terapkan sebagai bobot aktif**. Bobot dan jumlah responden tercatat sebagai riwayat.
5. Tanpa perangkat bersama? Pakai Google Form: teksnya ada di `docs/FORMULIR.md`.

**b. Kebergunaan SUS (target 20 sampai 30 pengguna)**
Pengguna mencoba aplikasi 5 sampai 10 menit (tambah tugas, lihat urutan, geser mesin waktu), lalu mengisi 10 butir. Isi di tab **Evaluasi**, atau lewat Google Form lalu masukkan manual. Skor di atas 68 dianggap di atas rata-rata.

**c. Kesesuaian urutan (Spearman, 20 sampai 30 pengguna)**
Pakai 6 tugas contoh yang sama untuk semua responden. Responden mengurutkan menurut penilaiannya tanpa melihat urutan sistem, lalu isi di tab **Evaluasi**. Aplikasi menghitung ρ.

Unduh CSV tersedia di tiap tab untuk lampiran.

## 5. Algoritma dan arsitektur (bahan Bab 2 dan 3)

### Rumus skor (SAW, Simple Additive Weighting)

```
Skor = 100 × ( w₁·Urgensi + w₂·Kepentingan + w₃·Kesulitan + w₄·Durasi )

Urgensi     = 1 − min(sisa jam, 168) ÷ 168     naik otomatis saat tenggat mendekat
Kepentingan = (tingkat − 1) ÷ 4
Kesulitan   = (tingkat − 1) ÷ 4
Durasi      = min(1, durasi ÷ 10 jam)
Tugas terlambat → skor 100
```

Tingkat: SIAGA 1 ≥ 75, SIAGA 2 ≥ 55, SIAGA 3 ≥ 35, SIAGA 4 < 35.

> **Perubahan dari penjelasan saya sebelumnya.** Di percakapan awal saya menulis faktor "tekanan waktu = durasi ÷ jam luang". Mesin yang ada di kode memakai **urgensi** di atas, sedangkan beban terhadap jam luang ditangani penjadwal harian. **Tulis rumus yang ada di kode**, bukan versi lama.

### Pembobotan: AHP
Penilai membandingkan 4 faktor secara berpasangan (skala Saaty 1 sampai 9, 6 pertanyaan). Dari matriks perbandingan dihitung bobot dan rasio konsistensi `CR = CI ÷ RI` dengan `CI = (λmax − n) ÷ (n − 1)` dan RI = 0,90 untuk n = 4. Bobot diterima bila CR < 0,1. Banyak responden digabung dengan rata-rata geometrik tiap elemen matriks. Bobot bawaan 0,35 / 0,30 / 0,20 / 0,15 hanyalah nilai awal sebelum ada data responden.

### Penjadwal harian: greedy dengan perbaikan
Tugas diurutkan menurut skor. Tiap tugas mengisi slot paling awal yang masih kosong, maksimal 3 jam per sesi, dan tidak melewati tenggat. Bila ada tugas yang kekurangan jam, tugas itu dimajukan lalu dihitung ulang. Urutan tenggat terdekat juga dicoba sebagai kandidat, dan rencana dengan kekurangan jam paling sedikit dipilih.

### Arsitektur

```
Peramban (index.html, assets/app.js)
   │  engine/engine.js: skor, penjadwal, AHP, simulasi   ← logika dijalankan di sisi klien
   │  fetch JSON (header X-Requested-With)
   ▼
PHP (api/)  auth · tasks · settings · ahp · eval        ← sesi, validasi, CRUD
   ▼
MySQL: users · tasks · settings · ahp_responses · ahp_weights · evaluations · reminders
   ▲
cron_reminder.php → Telegram                             ← pengingat opsional
```

Kebijakan keamanan yang sudah ada: kata sandi di-hash (`password_hash`), kueri berparameter, cookie sesi HttpOnly + SameSite, header CSRF, data tugas dan AHP dibatasi per pengguna (diuji; pengguna lain mendapat 404). Evaluasi dan pengaturan memakai pembatasan yang sama di kueri, tetapi tidak diuji terpisah. Belum ada: pembatasan percobaan masuk yang ketat, HTTPS (tergantung hosting), dan verifikasi email.

### Tabel kebaruan
Isi dengan kolom karya terdahulu dari jurnal aslinya. Kolom SIAGA yang bisa dipertanggungjawabkan oleh kode: platform web, skor 4 parameter berbobot AHP, prioritas berubah mengikuti waktu, penjelasan alasan tiap keputusan, rencana kerja harian otomatis, simulasi pembanding, dan evaluasi SUS dan Spearman. Jangan mengisi kolom karya lain dengan dugaan.

## 6. Hasil simulasi yang jujur (wajib dibaca)

Saya jalankan 200 skenario acak (seed 2026) dengan bobot bawaan. Hasil lengkap ada di `docs/hasil-uji-engine.txt`.

| Metode | Tugas terlewat | Bobot kepentingan hilang | Skenario tanpa terlewat |
|---|---|---|---|
| SIAGA (bobot bawaan) | 13,3% | 8,7% | 47% |
| Tenggat terdekat saja (EDF) | **8,5%** | 8,6% | **70%** |
| Kepentingan tertinggi saja | 15,6% | 9,6% | 38% |
| Urutan masuk (FIFO) | 15,3% | 15,6% | 41% |

Dengan bobot digeser ke tenggat (0,55 / 0,20 / 0,15 / 0,10): SIAGA 10,3% terlewat dan 7,3% bobot hilang, lebih rendah dari EDF pada bobot hilang (8,6%) tetapi masih lebih banyak tugas terlewat.

**Yang bisa Anda klaim:**
- SIAGA lebih baik dari urutan masuk (FIFO) dan dari "kepentingan saja" pada kedua ukuran.
- Pilihan bobot menentukan pertukaran antara jumlah tugas terlewat dan bobot kepentingan yang hilang. Bobot AHP dari responden nyata adalah cara yang sah untuk memilihnya.
- SIAGA memberi penjelasan alasan dan rencana harian, yang tidak dimiliki metode pembanding.

**Yang tidak boleh Anda klaim:** bahwa SIAGA mengalahkan "tenggat terdekat saja" dalam jumlah tugas terlewat. Pada 30 skenario pertama hasilnya sempat terlihat menguntungkan, tetapi itu kebetulan. Pada 200 sampai 500 skenario dan beberapa seed, EDF konsisten lebih baik pada ukuran itu. EDF memang dikenal optimal untuk menghindari keterlambatan, jadi tidak perlu dikalahkan. Nilai tambah SIAGA ada di tempat lain.

Setelah bobot AHP dari responden diterapkan, jalankan ulang tab **Pembanding** dan laporkan angka yang keluar, apa pun hasilnya.

## 7. Batasan yang perlu ditulis di proposal
- Simulasi memakai skenario acak dan model sederhana (kapasitas harian tetap, pekerjaan bisa dipecah). Ini bukan perilaku mahasiswa sungguhan.
- Bobot AHP dari beberapa responden belum representatif secara statistik. Tulis jumlahnya.
- SUS dan Spearman bergantung pada sampel Anda. Tulis jumlah dan cara pemilihan responden.
- Rencana harian menghitung kapasitas satu hari penuh, termasuk jam yang sudah lewat hari ini.
- Pengingat di halaman hanya tampil saat halaman terbuka. Pengingat Telegram butuh `cron_reminder.php` dijalankan terjadwal.

## 8. Pengingat Telegram (opsional, hanya mode server)
1. Di Telegram, cari **@BotFather**, kirim `/newbot`, ikuti langkahnya, salin **token**.
2. Kirim satu pesan apa saja ke bot Anda, lalu buka `https://api.telegram.org/bot<TOKEN>/getUpdates`. Cari angka `"chat":{"id":…}`.
3. Tempel token di `api/config.php` (`telegram_token`). Di aplikasi, kolom **ID obrolan Telegram** → **Simpan ID**.
4. Uji tanpa mengirim: `php api/cron_reminder.php --dry` (Windows: `C:\xampp\php\php.exe C:\xampp\htdocs\siaga\api\cron_reminder.php --dry`).
5. Jadwalkan tiap 30 menit dengan **Task Scheduler** (Windows) atau `crontab` (Linux).

Aturan: sisa waktu ≤ 24 jam atau terlambat menjadi SIAGA 1. Sisa ≤ 72 jam dan kepentingan ≥ 4 menjadi SIAGA 2. Tiap tingkat dikirim sekali per tugas. Fitur ini diuji hanya dalam mode `--dry`. Pengiriman nyata ke Telegram belum saya uji karena butuh token Anda.

## 9. Menjalankan uji otomatis
Perlu Node 18+ dan PHP CLI.
```
node tests/run-tests.js      17 uji fungsi + simulasi 200 skenario
node tests/api-test.js       50 uji API (SQLite sementara, tidak menyentuh MySQL Anda)
```
Lampirkan keluaran `run-tests.js` sebagai bukti black-box di Bab 3.5.

## 10. Daftar kerja sampai 10 Oktober

**Kamis 8 Okt (hari ini)**
- [ ] Jalankan aplikasi (mode lokal) dan coba semua tab
- [ ] Kirim `ahp.html` ke 5 sampai 10 responden, minta kode jawaban
- [ ] Pasang XAMPP dan jalankan mode server bila arsitektur penuh ingin didemokan
- [ ] Rekam video demo (alur bagian 3)

**Jumat 9 Okt**
- [ ] Impor kode AHP, terapkan bobot, jalankan simulasi, catat hasil apa adanya
- [ ] Minta 20 sampai 30 orang mencoba, isi SUS dan Spearman
- [ ] Revisi proposal: rumusan masalah, tujuan, rumus (versi urgensi), arsitektur, hasil
- [ ] Ekspor CSV dan tangkapan layar untuk lampiran

**Sabtu 10 Okt**
- [ ] Final proposal, PPT, tautan demo, Instagram
- [ ] Cadangan waktu

Cek pedoman PKM-KC 2026 untuk format, batas halaman, dan komponen anggaran. Hal itu tidak bisa saya pastikan dari sini.
