# Teks formulir survei (Google Form)

Pakai ini bila responden tidak bisa memakai `ahp.html` atau aplikasi langsung. Jawaban dari Google Form harus dimasukkan manual ke aplikasi (tab Bobot AHP untuk AHP, tab Evaluasi untuk SUS).

---

## A. Survei bobot (AHP)

**Judul:** Survei singkat: faktor penentu urutan pengerjaan tugas

**Pengantar:** Bayangkan Anda punya beberapa tugas kuliah sekaligus. Untuk tiap pasangan faktor di bawah, pilih faktor mana yang menurut Anda lebih menentukan tugas mana yang dikerjakan lebih dulu. Tidak ada jawaban benar atau salah.

**Definisi faktor (tampilkan di awal):**
- **Tenggat**: seberapa dekat batas waktu pengumpulan
- **Kepentingan**: seberapa besar pengaruh tugas terhadap nilai akhir
- **Kesulitan**: seberapa sulit tugas dikerjakan
- **Durasi**: berapa lama tugas dikerjakan

**Pertanyaan 0 (jawaban singkat):** Nama atau kode responden

**Pertanyaan 1 sampai 6**, tipe *Skala linier* 1 sampai 17 (label kiri dan kanan seperti di bawah, titik tengah 9 = sama penting):

| No | Kiri (nilai 1) | Kanan (nilai 17) |
|---|---|---|
| 1 | Tenggat jauh lebih penting | Kepentingan jauh lebih penting |
| 2 | Tenggat jauh lebih penting | Kesulitan jauh lebih penting |
| 3 | Tenggat jauh lebih penting | Durasi jauh lebih penting |
| 4 | Kepentingan jauh lebih penting | Kesulitan jauh lebih penting |
| 5 | Kepentingan jauh lebih penting | Durasi jauh lebih penting |
| 6 | Kesulitan jauh lebih penting | Durasi jauh lebih penting |

**Cara mengubah jawaban Google Form ke aplikasi:** misalkan jawaban skala adalah `s` (1 sampai 17). Masukkan di formulir responden di aplikasi dengan menggeser slider ke posisi `s − 9`: negatif ke kiri, positif ke kanan. Contoh `s = 5` berarti 4 langkah ke kiri (kiri lebih penting, nilai Saaty 5). Atau, lebih mudah, minta responden memakai `ahp.html`.

---

## B. Kebergunaan (SUS)

**Pengantar:** Setelah mencoba SIAGA selama 5 sampai 10 menit, nyatakan seberapa setuju Anda dengan tiap pernyataan.

**Skala (semua butir):** 1 = sangat tidak setuju, 5 = sangat setuju

1. Saya merasa akan sering menggunakan SIAGA.
2. Saya merasa SIAGA terlalu rumit.
3. Saya merasa SIAGA mudah digunakan.
4. Saya merasa perlu bantuan orang teknis untuk dapat menggunakan SIAGA.
5. Saya merasa fitur-fitur SIAGA terintegrasi dengan baik.
6. Saya merasa ada terlalu banyak ketidakkonsistenan pada SIAGA.
7. Saya membayangkan kebanyakan orang akan cepat belajar menggunakan SIAGA.
8. Saya merasa SIAGA sangat merepotkan untuk digunakan.
9. Saya merasa sangat percaya diri menggunakan SIAGA.
10. Saya perlu belajar banyak hal sebelum dapat menggunakan SIAGA.

**Penilaian:** butir ganjil dikurangi 1, butir genap = 5 dikurangi jawaban, jumlahkan, kalikan 2,5. Hasil 0 sampai 100. Aplikasi menghitungnya otomatis. Di atas 68 dianggap di atas rata-rata.

---

## C. Kesesuaian urutan (Spearman)

Tunjukkan 6 tugas contoh (daftar judulnya saja, tanpa skor atau urutan sistem). Minta responden mengurutkan dari yang harus dikerjakan paling dulu. Masukkan urutannya di tab Evaluasi, bagian Spearman. Gunakan tugas dan waktu yang sama untuk semua responden agar urutan sistemnya sama.
