# Tahap 1–2: PRD AI, penyimpanan, dan kuota

Implementasi menyiapkan Beta Gratis (1 PRD AI per akun) dan Pro (30 PRD AI per periode Pro). Pembayaran dan pemberian hak Pro **sudah** ditambahkan pada [Tahap 3](./tahap-3-pembayaran.md): periode Pro 30 hari terbentuk hanya setelah pembayaran terverifikasi di server.

## Perilaku

- Generator memerlukan Firebase Auth dan kuota server. Tidak ada bypass login pada localhost.
- DeepSeek harus menghasilkan struktur lengkap, tiga fase, fitur MVP sesuai pilihan, pembukaan pertama, user flow, kriteria penerimaan terstruktur, dan matriks Free/Pro bila relevan. Placeholder dan isi generik yang diketahui ditolak. Pemeriksaan ini bukan jaminan kebenaran isi; relevansi semantik tetap perlu ditinjau dengan ide nyata.
- Tidak ada penggantian diam-diam dengan contoh lokal. Contoh lokal tetap diberi label dan tidak memakai kuota AI.
- JSON/PRD yang tidak valid dicoba ulang otomatis paling banyak sekali, dengan reservasi yang sama dan batas total AI 90 detik. Dua panggilan provider dapat memakai kredit layanan, tetapi hanya satu hasil valid tersimpan yang memakai kuota pengguna.
- Server mereservasi satu slot dalam transaksi sebelum memanggil AI. Setelah PRD valid, hasil dan penambahan `used` disimpan dalam satu transaksi. Hasil yang belum tersimpan tidak dikirim sebagai keberhasilan.
- Kegagalan AI melepas reservasi tanpa penambahan `used`. Jika server mati atau Firestore tidak tersedia, reservasi kedaluwarsa dalam 10 menit. Selama itu UI dapat menampilkan satu slot sedang diproses.
- ID permintaan tersimpan di browser. Retry ID/input yang sama mengambil hasil tersimpan tanpa memanggil AI atau menambah pemakaian. ID yang sama dengan input berbeda ditolak. Lease unik mencegah proses lama mengubah reservasi proses baru.
- **Ambil hasil terakhir** membaca hasil server, termasuk ketika Pro berakhir. Hasil bisa diekspor meski belum menjadi proyek.
- Semua perubahan proyek akun melalui `/api/projects`; server memeriksa UID/masa aktif dalam transaksi. Penyimpanan berulang tidak membuat proyek ganda, checklist bersamaan tidak menimpa perubahan lain.
- Untuk PRD AI baru, server menyimpan hasil terkonfirmasi dalam ledger, bukan isi AI kiriman ulang browser. PRD AI lama tanpa `generationId` tetap bisa dibaca/diekspor, tetapi hasil lama yang belum pernah disimpan perlu disusun kembali untuk menjadi proyek cloud.
- Pro berakhir menjadi read-only: tidak membuat, mengubah, atau menghapus proyek; membaca, mengambil hasil lama, dan ekspor tetap tersedia. Kuota habis pada paket aktif hanya menolak generasi AI, bukan checklist atau membaca/mengekspor.
- Markdown memuat ide/jawaban, tech stack, user flow, izin, desain, arsitektur, fase/fitur/tugas, semua acceptance, model data, risiko, asumsi, keputusan terbuka. Tahap ini tidak menambahkan PDF/DOCX.

## Konfigurasi baru

| Nama | Jenis | Nilai awal |
| --- | --- | --- |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | **Secret Cloudflare server** | JSON lengkap service account dari proyek Firebase yang sama |
| `BETA_FREE_PRD_LIMIT` | Variable biasa | `1` |
| `BETA_PRO_PRD_LIMIT` | Variable biasa | `30` |
| `BETA_FREE_QUOTA_MODE` | Variable biasa | `once` (`monthly` opsional, reset bulan kalender UTC) |

Batas harus bilangan bulat 1–1000. Konfigurasi tidak valid gagal tertutup. Mengubah mode Gratis mengubah periode kuota; jangan menggantinya tanpa keputusan produk. Jangan beri awalan `NEXT_PUBLIC_` pada rahasia server.

Gunakan service account khusus dengan peran `roles/datastore.user` pada proyek Firebase yang sama, bukan Owner/Editor. API Firestore dan database `(default)` harus aktif. `project_id` dalam JSON harus sama dengan `FIREBASE_PROJECT_ID`. Kunci privat hanya masuk secret Worker, bukan `/api/config`, bundle klien, Git, atau percakapan.

Di Cloudflare Dashboard → Workers & Pages → **rencanain** → Settings → Variables and Secrets: tambahkan seluruh JSON sebagai tipe **Secret** bernama `FIREBASE_SERVICE_ACCOUNT_JSON`. Tiga batas di atas sebagai variable biasa. Pertahankan enam pengaturan Firebase dan `DEEPSEEK_MODEL` yang sudah digunakan.

Untuk lokal, konfigurasi di `.dev.vars` yang diabaikan Git. JSON service account satu baris, dibungkus petik tunggal; newline private key tetap `\n` di dalam JSON. `config.example.txt` hanya placeholder.

## Koleksi Firestore

Dibuat otomatis; tidak perlu index baru atau migrasi proyek lama.

| Path | Isi |
| --- | --- |
| `users/{uid}/billing/account` | `package: free`, `createdAt`; untuk Pro nanti `package: pro`, `proStartedAt`, `proExpiresAt` (ISO UTC) |
| `users/{uid}/quota/free-lifetime` | `used`, `reservations` (ID → lease/expiry), `updatedAt` |
| `users/{uid}/quota/free-YYYY-MM` | Alternatif jika mode Gratis `monthly` |
| `users/{uid}/quota/pro-{startMillis}` | Budget periode Pro berdasarkan waktu awal hak aktif |
| `users/{uid}/generations/{requestId}` | Hash input, status pending/completed/failed, periode, lease, waktu, hasil terkonfirmasi |
| `users/{uid}/projects/{projectId}` | PRD/progres lama tetap kompatibel; ID AI baru `ai-{requestId}` |

`draft.answers` disimpan sebagai array objek `{values: [...]}` agar bukan nested arrays yang ditolak Firestore. Pembaca mendukung format lama dan baru.

Billing, kuota, dan generasi hanya diakses server. Rules membolehkan pemilik membaca proyek, menolak write browser, dan menolak semua akses lain. Service account OAuth menggunakan IAM: backend wajib memeriksa UID/kepemilikan setiap route, bukan mengandalkan Rules untuk kredensial server.

Ledger menyimpan isi PRD untuk recovery. Jangan menerapkan TTL pada ledger completed sebelum kebutuhan retensi diputuskan. Reservasi kedaluwarsa dibersihkan saat snapshot/reservasi tanpa cron wajib.

## Penerapan ke Worker yang sudah ada

1. Siapkan secret/variables Worker **rencanain**, lalu jalankan dari folder proyek:

   ```powershell
   npx.cmd tsc --noEmit --incremental false
   npm.cmd run test:planning
   npm.cmd run test:errors
   npm.cmd run test:quota
   npm.cmd run test:server
   npm.cmd run build
   ```

2. Deploy build ke nama yang benar, mempertahankan variables Dashboard:

   ```powershell
   npx.cmd wrangler deploy --config dist/server/wrangler.json --name rencanain --keep-vars
   ```

   Periksa diff sebelum menyetujui prompt. `--keep-vars` mempertahankan variables remote, bukan konfigurasi lain seperti assets/routes/observability. Jangan mengganti nama Worker dengan nama starter.

3. Setelah backend/frontend baru tersedia, terapkan `firestore.rules` melalui Firebase Console → Firestore Database → Rules → Publish. Ini mengganti write SDK lama dengan write server. Reload tab lama. Jangan menyatakan pembatasan paket aman sebelum Rules baru aktif.

4. Login akun uji. Pastikan kuota tersedia. Buat satu PRD nyata, simpan, reload, ekspor. Verifikasi ledger completed dan `used=1`. Generasi kedua Gratis ditolak. Uji provider gagal pada lingkungan uji: `used` tidak bertambah.

5. Pada **proyek Firebase uji terpisah**, siapkan dokumen akun Pro aktif/berakhir. Jangan memberikan Pro dari callback browser. Uji akun lain tidak bisa membaca proyek dan SDK tidak bisa mengubah billing/kuota/proyek. Pengujian Rules nyata/emulator tetap diperlukan sebelum peluncuran.

## Validasi

- `test:planning`: pilihan kebutuhan, kompatibilitas lama, arsitektur, ekspor, desain.
- `test:errors`: error provider, timeout/cancel, pelepasan reservasi, pesan aman, offline, acknowledgment, state tetap saat gagal.
- `test:quota`: optimistic concurrent transactions, slot terakhir, retry, lease fencing, lintas UID, checklist bersamaan, Pro berakhir, codec, ekspor, mode bulanan.
- `test:server`: adapter REST terhadap transport tiruan, OAuth JWT ditandatangani/diverifikasi, konflik, generation/save/task, respons commit hilang, otorisasi/origin/input, konfigurasi gagal tertutup.

Suite tidak memakai kredit AI atau menulis ke Firebase nyata. Kualitas model sebenarnya, transaksi Firestore sebenarnya, dan Rules terpasang belum dapat dinyatakan berhasil hanya dari suite ini.

Referensi: [Firestore REST/OAuth](https://firebase.google.com/docs/firestore/use-rest-api), [Firestore IAM](https://firebase.google.com/docs/firestore/security/iam), [Wrangler deploy](https://developers.cloudflare.com/workers/wrangler/commands/workers/#deploy), [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/).
