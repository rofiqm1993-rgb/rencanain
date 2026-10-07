# Tahap 3: pembayaran Pro 30 Hari (Midtrans Snap)

Menambahkan alur bayar yang belum ada pada Tahap 1-2: **pembuatan transaksi Snap di server**, **webhook
bertanda tangan**, dan **pemberian hak Pro di Firestore hanya setelah pembayaran terverifikasi**.
Praktiknya mengikuti integrasi Midtrans yang sudah teruji pada proyek lain (tanda tangan sha512,
jumlah wajib cocok, idempoten, refund mencabut akses).

## Perilaku

- `POST /api/transaction` (wajib login dan origin sama) membuat pesanan `RN-<uid>-<waktu>-<acak>` lalu
  meminta token Snap. Harga dan masa aktif **selalu** dari server, tidak pernah dari browser.
- `POST /api/webhook/midtrans` menerima notifikasi Midtrans tanpa autentikasi. Keamanannya bertumpu
  pada tiga hal: tanda tangan, jumlah, dan catatan pesanan. Urutan penolakannya:
  1. Kredensial lingkungan terpilih belum lengkap atau format kunci tidak cocok -> `503 midtrans-config`.
  2. Tanda tangan sha512(`order_id + status_code + gross_amount + Server Key`) tidak cocok -> `401`,
     dibandingkan dengan perbandingan waktu tetap (timing safe) buatan sendiri.
  3. Pesanan tidak ada di `orders/{order_id}` -> `400 order-unknown`.
  4. Merchant/lingkungan pesanan tidak cocok -> `403 merchant-mismatch`.
  5. Jumlah tidak sama dengan harga pesanan -> `403 amount-mismatch` (membayar Rp 1.000 tidak membuka Pro).
- Status -> akibat: `settlement` dan `capture` (fraud accept, status code 200) **membuka**;
  `capture` challenge dan `pending` **tidak mengubah apa pun**; `deny`/`expire` tidak membuka hak;
  `cancel`/`refund`/`chargeback` **mencabut** Pro bila pesanannya sudah dibayar.
- Idempoten: notifikasi yang dikirim ulang tidak menambah masa aktif maupun kuota, karena keputusan
  diambil dari status pesanan di dalam **satu transaksi Firestore** (baca pesanan lalu tulis hak akses).
- Perpanjangan **menambah dari tanggal berakhir** yang masih berjalan (bukan menghitung ulang dari hari
  pembayaran) dan membuka **periode kuota Pro baru** (`pro-{waktu aktivasi}` -> 30 PRD).
- Pencabutan hanya berlaku bila pesanan yang di-refund adalah pesanan Pro yang sedang berlaku
  (`lastOrderId`). Refund pesanan lama tidak mencabut hak yang sedang aktif; kasus itu ditandai
  `reviewNeeded` pada pesanan untuk diperiksa manusia.
- Pesanan yang gagal membuat token Snap ditandai `failed`, tidak dibiarkan menggantung `pending`.

## Konfigurasi

| Nama | Jenis | Nilai | Catatan |
| --- | --- | --- | --- |
| `MIDTRANS_SERVER_KEY` | **Secret Cloudflare** | Server Key Production | Dipakai hanya saat Production. Jangan tempel di `vars` atau chat. |
| `MIDTRANS_CLIENT_KEY` | Secret Cloudflare | Client Key Production | Dicocokkan dengan mode, tetap berada di server pada alur redirect saat ini. |
| `MIDTRANS_MERCHANT_ID` | Secret Cloudflare | Merchant ID Production | Dicocokkan dengan pesanan dan notifikasi. |
| `MIDTRANS_SANDBOX_SERVER_KEY` | **Secret Cloudflare** | Server Key Sandbox | Wajib berawalan `SB-Mid-server-`; jangan gunakan key Sandbox yang pernah terekspos. |
| `MIDTRANS_SANDBOX_CLIENT_KEY` | Secret Cloudflare | Client Key Sandbox | Wajib berawalan `SB-Mid-client-`. |
| `MIDTRANS_SANDBOX_MERCHANT_ID` | Secret Cloudflare | Merchant ID Sandbox | Harus milik merchant Sandbox yang sama. |
| `MIDTRANS_SANDBOX_TEST_UID` | Variable biasa | UID akun Firebase khusus pengujian | **Wajib** bila Sandbox memakai Firebase produksi `rencanain-c2aae`; hanya UID ini yang boleh membuat transaksi dan memperoleh Pro dari Sandbox. |
| `MIDTRANS_SANDBOX` | Variable biasa | `1` saat uji, kosong saat produksi | Memilih ketiga binding Sandbox dan alamat Snap Sandbox. Tidak pernah memakai key Production sebagai cadangan. Selama aktif di Worker utama, pembayaran Production berhenti sementara. |
| `MIDTRANS_PRO_PRICE` | Variable biasa | `49000` | Rupiah, bilangan bulat 1.000-100.000.000. **Nilai 49000 masih usulan** - ubah bila harga final berbeda |
| `MIDTRANS_PRO_DAYS` | Variable biasa | `30` | 1-365 hari |

Harga bukan rahasia: `/api/config` memuat `payments: { ready, keyPresent, mode, price, days }` supaya
kesiapan bisa diperiksa dari luar **tanpa menebak** dan tanpa membuka kunci. `ready` hanya benar bila
ketiga binding untuk mode terpilih tersedia, format Server/Client Key cocok, dan Firebase server siap.
Pada Firebase produksi `rencanain-c2aae`, mode Sandbox hanya siap bila `MIDTRANS_SANDBOX_TEST_UID`
terisi UID akun uji yang sah. Checkout dan notifikasi untuk UID lain ditolak. Akun uji tetap dapat
memperoleh Pro di Firestore produksi setelah pembayaran simulasi, jadi gunakan akun khusus pengujian
dan cabut haknya melalui refund/cancel Sandbox setelah tes. Worker/Firebase staging terpisah lebih
aman untuk pengujian berikutnya, tetapi tidak wajib untuk satu pengujian terbatas ini.

## Koleksi Firestore baru

| Path | Isi |
| --- | --- |
| `orders/{order_id}` | `uid`, `amount`, `days`, `status` (`pending`/`paid`/`failed`/`revoked`), jejak Midtrans (`midtransStatus`, `paymentType`, `fraudStatus`, `transactionId`), `createdAt`, `updatedAt`, `redirectUrl`, `expiresAt` |

`users/{uid}/billing/account` tetap seperti Tahap 1-2; webhook hanya mengisi `package`, `proStartedAt`,
`proExpiresAt`, `proDays`, `lastOrderId`, dan `lastPayment`. Koleksi `orders` hanya diakses server;
Rules sudah menolak semua akses browser lewat `match /{document=**} { allow read, write: if false; }`.

## Rilis (urutan mengikat)

1. Jalankan dari **Windows** (WSL tidak bisa memuat `workerd` versi Windows), satu per satu:
   `npm.cmd run test:billing`, lalu `npm.cmd run lint`, lalu `npm.cmd run test:quota`, lalu
   `npm.cmd run test:server`, lalu `npx.cmd tsc --noEmit --incremental false`, lalu `npm.cmd run build`.
2. Pasang variables/secrets di Cloudflare -> Workers dan Pages -> **rencanain** -> Settings.
3. `npx.cmd wrangler deploy --config dist/server/wrangler.json --name rencanain --keep-vars`.
   **Deploy = produksi; butuh izin Mas.**
4. Setelah deploy, periksa `GET /api/config`: `payments.ready` harus `true` dan `payments.mode` sesuai.
   Bila `keyPresent: false`, kunci belum terbaca (belum deploy ulang atau salah nama variabel).
5. Isi **Payment Notification URL** di dashboard Midtrans -> Settings -> Configuration, **terpisah untuk
   sandbox dan produksi**: `https://<domain-rencanain>/api/webhook/midtrans`.
6. Uji tanpa uang sementara di Worker `rencanain`: set tiga Secret `MIDTRANS_SANDBOX_*`,
   `MIDTRANS_SANDBOX=1`, `MIDTRANS_SANDBOX_TEST_UID=<UID akun uji>`, dan `MIDTRANS_PRO_PRICE=49000`;
   pasang Payment Notification URL **Sandbox** ke domain Worker utama.
   Pastikan `/api/config` melaporkan `mode: sandbox` dan `ready: true`, lalu lakukan pembayaran
   simulator sampai `settlement` dan periksa `users/{uid}/billing/account` serta kuota. Uji juga
   `cancel` dan `refund` pada pesanan yang telah dibayar. Setelah selesai, kosongkan/ubah
   `MIDTRANS_SANDBOX` menjadi `0`, deploy, dan pastikan `/api/config` kembali `mode: production`.
7. Untuk menjalankan uji di lokal, `.dev.vars` juga perlu `FIREBASE_SERVICE_ACCOUNT_JSON` (peran
   `roles/datastore.user`); tanpa itu server lokal tidak bisa mencatat pesanan dan mengaktifkan Pro.

## Yang BELUM terbukti

- Penerimaan notifikasi **nyata** dari Midtrans (uji otomatis memakai tanda tangan yang dihitung
  sendiri, jadi membuktikan kode kita, bukan koneksi dashboard).
- Kunci Midtrans produksi di `.dev.vars` **sudah diuji sah**: uji auth menjawab HTTP 200 dengan
  `Transaction doesn't exist`, artinya kunci dikenali Midtrans (kunci lama yang tersimpan sebelumnya
  ditolak `401 Unknown Merchant server_key/id`). Yang belum diperiksa: (a) kunci yang tersimpan sebagai
  Secret di Cloudflare, (b) penerimaan notifikasi nyata dari dashboard, (c) transaksi produksi sungguhan
  beserta refund-nya.
- Transaksi produksi dengan uang sungguhan, termasuk pencairan dana (H+1) dan tarif QRIS 0,7 persen.
