# IELTS Check Product Spec

## Tujuan Produk
Membangun platform persiapan IELTS yang adaptif, interaktif, dan berbasis AI. Fokusnya bukan hanya latihan soal, tetapi juga rekomendasi latihan, analisis kelemahan, progress study plan, subscription, referral, dan simulasi test yang lebih nyata.

## Prinsip Utama
- Daily Practice tetap meniru suasana IELTS computer-based test.
- Practice Page dibuat lebih interaktif, fun, dan personal.
- Study Plan menjadi pusat progress, score analysis, dan rekomendasi.
- Dashboard menjadi ringkasan performa dan next action.
- Developer Console dipakai untuk manage problem set, tanggal, tipe soal, dan aset.

## Area Produk

### 1) Level System
- Tambahkan level kesulitan untuk soal dan practice.
- Contoh level:
  - Level 1: easy, gampang selesai, UI bagus untuk pemula.
  - Level 2: medium.
  - Level 3: advanced.
- Level harus mempengaruhi:
  - panjang soal
  - kompleksitas soal
  - skor target
  - saran latihan dari AI

### 2) AI Review dan Suggestion
- Setelah user selesai mengerjakan soal, AI memberi review.
- AI menilai:
  - jawaban benar/salah
  - area lemah
  - tipe soal yang harus diperbaiki
  - tips perbaikan
- Jika user sering salah di tipe tertentu, AI harus menyarankan latihan tipe itu.
- Setelah user membaik, AI update rekomendasi.

### 3) Practice Page
- Practice Page dibagi menjadi 4 module utama:
  - Listening
  - Reading
  - Writing
  - Speaking
- Practice Page fokus pada tipe soal tertentu, bukan sekadar test umum.
- Practice Page harus menerima suggestion dari Study Plan dan AI analysis.
- Contoh flow:
  - user lemah di Not Given
  - system menyarankan latihan Not Given
  - user latihan
  - AI review hasil
  - system update progress dan suggestion berikutnya
- Practice Page harus lebih interactive dan responsive dibanding Daily Practice.

### 4) Daily Practice
- Daily Practice tetap mirip IELTS computer test.
- UI tidak boleh disamakan dengan Practice Page.
- Daily Practice dipakai untuk simulasi test harian yang lebih real.
- Elemen per module boleh punya warna berbeda, tetapi layout utama tetap konsisten dengan site design.

### 5) Listening Question Types
Type yang perlu didukung:
- Multiple Choice
- Matching
- Plan / Map / Diagram Labelling
- Form / Note / Table / Flow Chart / Summary Completion
- Sentence Completion
- Short-answer Questions

### 6) Reading Question Types
Type yang perlu didukung:
- Matching Headings
- Matching Paragraph Information
- Matching Features
- Matching Sentence Endings
- True / False / Not Given atau Yes / No / Not Given
- Multiple Choice
- List of Options
- Choose a Title
- Short Answers
- Sentence Completion
- Summary Completion
- Table Completion
- Flow Chart Completion
- Completion Diagrams

### 7) Speaking System
- Pakai avatar atau animasi orang agar terasa seperti conversation nyata.
- Pertanyaan harus bisa berubah-ubah.
- Simulasi harus terasa seperti native speaker / examiner.
- Audio user harus direkam dari awal sampai akhir.
- Audio ditranscribe.
- AI menganalisis transcript dan memberi:
  - kekuatan
  - kelemahan
  - highlight pada transcript
  - saran jawaban yang lebih baik
  - target band suggestion

### 8) Subscription
- User dapat free access 1 week untuk practice set.
- Setelah 1 week, practice set terkunci.
- Subscription model:
  - per bulan
  - per tahun
- Tambahkan kode referral.
- Tambahkan rules:
  - member English Check dapat free access
  - mahasiswa dapat diskon
  - referral bisa memberi diskon sampai gratis berdasarkan jumlah user yang daftar dari kode referral

### 9) Sign Up and Account Flow
- Sign up akun harus diarahkan ke flow yang relevan dengan IELTS test.
- User bisa menyimpan target, progress, dan akses subscription.
- Account harus mendukung:
  - plan
  - progress
  - streak
  - completion percentage
  - referral status
  - subscription status

### 10) Study Plan and Progress
- Study plan per bulan harus pakai color progress.
- Setiap bulan menampilkan completion percentage.
- Cursor pada bulan menampilkan summary progress seperti 02/30.
- Progress bulan harus sinkron ke:
  - user streak
  - completion percentage
  - score analysis
- Dari Study Plan, AI harus memberi suggestion ke Practice Page.

### 11) Dashboard Recommendation
- Dashboard harus menampilkan rekomendasi berdasarkan kelemahan user.
- Contoh:
  - jika user salah di Not Given, maka dashboard menyarankan latihan Not Given.
  - jika user performa bagus di satu tipe soal, dashboard dapat menyarankan next step yang lebih sulit.
- Dashboard juga harus menampilkan progress singkat dan hasil terkini.

### 12) Developer Console
Developer harus support:
- tambah problem set per tanggal
  - contoh: 26 April 2026
- manage set:
  - add
  - edit
  - update
  - delete
- upload foto / asset pendukung
- setiap question harus punya type yang jelas
- question bank harus berbasis tipe soal yang akan dipakai di practice
- data problem set perlu mendukung AI evaluation

### 13) AI Evaluation Setelah Soal
- Setiap selesai soal, user mendapatkan AI review.
- Review harus bisa menilai tiap pertanyaan.
- Untuk speaking, review harus berbasis transcript.
- Untuk reading/listening, review harus menampilkan:
  - jawaban benar/salah
  - alasan singkat
  - suggestion tipe soal yang harus diulang

## Data yang Perlu Disimpan
- User profile
- Subscription status
- Referral code dan referral count
- Study plan per bulan
- Streak dan completion
- Problem set per tanggal
- Question type per item
- User answers
- AI review result
- Transcript speaking
- Progress per module

## Recommended Phase

### Phase 1
- Rapikan data model problem set
- Tambah set problem per tanggal di Developer
- Tambah manage set full CRUD
- Tambah upload foto
- Tambah question types yang jelas

### Phase 2
- Tambah AI review dan recommendation engine
- Tambah dashboard suggestion based on weakness
- Tambah study plan progress integration

### Phase 3
- Bangun Practice Page yang lebih interaktif
- Tambah level system
- Tambah tailored practice per tipe soal

### Phase 4
- Tambah speaking avatar, audio record, dan transcript analysis
- Tambah video real-person explanation

### Phase 5
- Tambah subscription, referral, discount, dan access control

## Open Questions
- Apakah level system mulai dari Level 1 sampai Level 5 atau cukup 3 level?
- Apakah referral discount dihitung per orang atau per milestone?
- Apakah student discount perlu verifikasi manual atau otomatis?
- Apakah AI review akan pakai rule-based dulu atau langsung LLM?
- Apakah practice set free 1 week berlaku per user baru saja atau juga untuk reactivation?

## Success Criteria
- User bisa melihat rekomendasi latihan yang relevan.
- User bisa latihan sesuai tipe soal yang lemah.
- Developer bisa manage question bank dengan tanggal dan type.
- Study Plan menunjukkan progress yang jelas dan sinkron.
- Subscription dan referral bisa mengatur akses user secara fleksibel.
