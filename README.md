# Rencanain

Ruang kerja dari ide → kuesioner lima langkah → tech stack → PRD, diagram fase/fitur, dan checklist. Mode demo menyimpan proyek di browser. Akun Firebase menyimpan proyek di `users/{uid}/projects/{projectId}`.

Panduan kuota server, koleksi baru, service account, Rules, dan deployment: [Tahap 1–2](./docs/tahap-1-2.md). Batas awal Beta Gratis 1 PRD AI per akun; Pro 30 PRD per periode Pro 30 hari. Pembayaran Pro lewat Midtrans Snap beserta webhook bertanda tangan ada di [Tahap 3](./docs/tahap-3-pembayaran.md).

## Menjalankan Rencanain

1. Salin `config.example.txt` sebagai `.dev.vars` dan isi konfigurasi Firebase serta kunci DeepSeek di server. File ini diabaikan Git. Jangan menaruh kunci DeepSeek di variabel `NEXT_PUBLIC_` atau `VITE_`.
2. Aktifkan Firebase Authentication: Google dan Email/Password. Buat Firestore dan publikasikan isi `firestore.rules` melalui Console.
3. Jalankan `npm run dev -- --host 127.0.0.1 --port 4174`. Untuk login Google, buka `http://localhost:4174/`; `localhost` sudah termasuk authorized domains proyek. Jika memakai `127.0.0.1`, tambahkan domain tersebut di Firebase Authentication settings.
4. Setelah mengubah `.dev.vars`, restart server. `/api/config` mengirim konfigurasi Firebase publik, model, indikator ketersediaan AI, serta ringkasan kesiapan pembayaran tanpa nilai kunci.

Generator AI dipanggil lewat `POST /api/generate` setelah pengguna selesai mengisi kuesioner, memilih stack yang selaras, dan menekan **Susun dengan DeepSeek**. Tidak ada panggilan AI berbayar hanya karena pengguna berpindah halaman. Contoh lokal dipilih terpisah dan selalu diberi label.

Pembayaran Pro: `POST /api/transaction` membuat pesanan Snap dengan harga dari `MIDTRANS_PRO_PRICE` (harga dan masa aktif tidak pernah dari browser); `POST /api/webhook/midtrans` memverifikasi tanda tangan sha512, merchant, lingkungan, dan jumlah, lalu mengaktifkan Pro secara idempoten. Masa aktif menambah dari tanggal berakhir saat memperpanjang, dan hak Pro dari pesanan aktif dicabut otomatis saat `cancel`, `refund`, atau `chargeback`. Kesiapan kunci Sandbox/Production diperiksa lewat `payments` pada `/api/config`; lihat [Tahap 3](./docs/tahap-3-pembayaran.md) sebelum mengatur Secret Cloudflare.

Endpoint memvalidasi input/origin dan Firebase ID token di semua lingkungan. Kuota permanen memakai transaksi Firestore; rate guard tambahan 5 percobaan per 10 menit dalam memori Worker bukan sumber kuota. Timeout AI 90 detik. PRD yang tidak lengkap ditolak tanpa memakai kuota; normalisasi hanya menyelaraskan struktur deterministik. Demo menggunakan contoh lokal.

## Pengecekan

```sh
npx tsc --noEmit --incremental false
npm run test:planning
npm run test:errors
npm run test:quota
npm run test:server
npm run test:billing
npm run build
```

Tes perencanaan memeriksa fitur wajib di MVP, pembukaan yang tidak diduplikasi, normalisasi struktur, ID tugas unik, konflik stack, dan isi ekspor Markdown.

Tes kegagalan memakai layanan tiruan: timeout, koneksi putus, kuota AI, respons tidak valid, pembatalan, izin Firestore, penyimpanan tertunda, dan data lokal rusak. Tidak memakai kredit API atau mengubah akun/data Firebase asli.

Pesan kegagalan ditampilkan melalui toast dan peringatan yang tetap di halaman. Pemuatan proyek memiliki batas 15 detik dan tombol Coba lagi; kegagalan tidak dianggap daftar kosong. Generator memiliki batas 90 detik di server dan 105 detik pada permintaan browser. Hasil PRD sebelumnya tetap tersedia jika penyusunan ulang gagal.

Penulisan proyek melalui API server menunggu konfirmasi transaksi. Setelah 15 detik aplikasi menampilkan status tertunda; batas permintaan proyek 60 detik. Jika respons terputus, retry ID deterministik mengambil proyek yang sama tanpa duplikat. Status checklist berubah setelah konfirmasi; perubahan bersamaan digabungkan dalam transaksi.

Saat browser offline, permintaan cloud baru ditolak dengan pesan yang ramah. Draft lokal, contoh lokal, dan ekspor PRD tetap dapat dipakai. Data yang tidak dapat dibaca tidak dihapus secara otomatis. Halaman error aplikasi menyediakan tombol coba lagi tanpa menghapus penyimpanan.

Tes manual akun: masuk → susun PRD → Simpan proyek → centang tugas → muat ulang. Pastikan proyek dan progres tetap terlihat di akun yang sama; akun lain tidak boleh membaca proyek tersebut. Mode demo dan akun Firebase memiliki penyimpanan terpisah; proyek demo tidak diunggah otomatis.

Draft/pilihan stack tersimpan lokal. PRD AI terkonfirmasi sudah tersimpan pada ledger generasi bersama pemakaian kuota; **Simpan proyek** menambahkan hasil itu ke daftar proyek. UI memperlihatkan paket, kuota tersedia/terpakai/direservasi, masa aktif, dan kondisi read-only setelah Pro berakhir.

`.dev.vars` hanya untuk preview lokal. Untuk deployment, isi binding runtime yang sama pada hosting dan tambahkan domain hosting di Firebase authorized domains. Tech stack yang dipilih pengguna mendeskripsikan aplikasinya, bukan mengubah hosting atau layanan Rencanain.

## Catatan starter

A clean full-stack starter running on [vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`
- Portable: Windows, macOS, or Linux; no Bash required
- Managed Linux: managed Linux runtime with Bash, `flock`, `curl`, `sha256sum`, and GNU `timeout`
- Git is required only for publishing

## Sites Lifecycle

The Sites initializer copies the shared starter and selects managed-linux only when `SITES_MANAGED_LINUX_CONTAINER=1`; otherwise it selects portable. It saves the selection only in ignored `.sites-runtime/execution-profile.json`. Both profiles copy/configure first, then use the plugin's separate `install-dependencies.mjs` step to measure installation independently. Edit source under `app/` and follow the Sites skill for installation, preview, builds, and publishing.

Run `node <plugin-root>/scripts/configure-execution-profile.mjs` only when the profile is unknown for the current checkout and environment. Profile changes do not alter tracked source or require reinstalling otherwise-valid dependencies; restart an existing preview to use the new selection. Do not commit or upload `.sites-runtime/`.

This starter does not use `wrangler.jsonc`.

`install:ci` runs `npm ci` once against the shared lockfile, disables parent-workspace discovery, and includes required dev/optional dependencies despite production/omit settings. Sharp defaults to prebuilt binaries unless explicitly configured otherwise. Do not overlap installers.

- **Portable:** Preserve host HOME, npm cache, registry, proxy, temporary paths, retry/concurrency settings, and lifecycle-script policy. Use `--prefer-offline --no-audit --no-fund`.
- **Managed Linux:** Use the existing project-local HOME/cache/tmp setup and Linux install lock, tarball preflight, and timeout. Restore the image-seeded npm cache only when its lockfile hash matches; retain network fallback. Builds keep their existing timeout. These helpers are not invoked by the portable profile.

`scripts/sites-env.mjs` preserves the caller's HOME, npm cache, proxy, XDG, and temporary-directory configuration while defaulting Wrangler and Miniflare state to the checkout. If npm reports an unwritable cache, select a writable path with `npm_config_cache` for that install. The `dev` and `start` scripts also keep Wrangler logs inside the checkout. Generated `.sites-runtime/` and `.wrangler/` directories are disposable and ignored by Git.

On portable, `npm run dev` uses `vinext dev` with HMR, starting at port 5173. Vinext records the running server in ignored `.vinext/` state, rejects an ordinary duplicate launch, and recovers stale state after a stopped process; exactly simultaneous starts can race. Pass `--port <port>` or `--hostname <host>` after `npm run dev --` when needed; keep portable previews on loopback.

For browser QA on managed Linux, use `sites-preview start`. The project's dev script runs Vite and accepts the supervisor's `--host 0.0.0.0 --port 4173 --strictPort` arguments. The internal browser uses `http://terminal.local:4173/`; it is not a user-facing URL. The supervisor owns the preview lifecycle. The ignored local profile survives the supervisor's cleared process environment.

The portable profile simulates ChatGPT sign-in only for loopback development requests. Visit `/signin-with-chatgpt?return_to=/` to sign in as `local_seedy` (`seedy@sites.test`, display name `Seedy`) and `/signout-with-chatgpt?return_to=/` to sign out. The development cookie preserves that identity across server restarts. Mock auth is disabled in the managed-linux profile and is not included in production builds; hosted authentication remains dispatch-owned.

The Worker uses `vinext/server/fetch-handler`, including Vinext's config-aware image handling. After building, `npm start` runs that Worker locally through Wrangler on `127.0.0.1`, sharing `.wrangler/state` with dev preview and local D1 migrations; it does not deploy the site or simulate sign-in. Use the URL printed by the server. Pass `npm start -- --port <port>` to select a different built-preview port.

Local previews use Miniflare's placeholder `Request.cf` metadata without a network lookup. Set `CLOUDFLARE_CF_FETCH_ENABLED=true` to opt into fetching preview metadata; this setting does not change hosted request metadata.

Local tool usage metrics are disabled by default. Set `WRANGLER_SEND_METRICS=true` to opt in.

## Included Shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` starts intentionally empty
- `@cloudflare/workers-types` provides Worker types; `cloudflare-env.d.ts` declares optional `DB`/`BUCKET` bindings—update these declarations if binding names change
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Use it as the durable user key; use email and name for display or contact purposes.

SIWC-authenticated workspace sites may also receive `oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty `name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by `oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use the returned `userId` as the stable user key for user-owned records; do not use email as a durable identifier.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send anonymous visitors through Sign in with ChatGPT.
- In a Server Component, start sign-in with `<a href={chatGPTSignInPath(returnTo)} target="_top">`. The auth helper module is server-only; do not import it into a Client Component.
- Do not use `fetch`, XHR, a client-side router, or a framework link that can prefetch the sign-in route. SIWC must start as a top-level navigation.
- Never request the AuthAPI authorization endpoint directly. The dispatch-owned `/signin-with-chatgpt` route must start the SIWC flow.
- Use `chatGPTSignOutPath(returnTo)` for browser sign-out links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the OAuth cookies, and identity header injection. Do not implement app routes for those reserved paths. Routes that do not import and call the helper remain anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the Sites hosting platform's access policy controls for workspace-wide restrictions, or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write actions tied to the current ChatGPT user. Leave public content anonymous.

## Local D1 migrations

For a D1-backed local preview, generate SQL with `npm run db:generate`. Build once through the Sites skill's build entrypoint (or `npm run build` for standalone use) to generate `dist/server/wrangler.json`, rebuilding if bindings change. From the project root, apply each pending migration in order:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_example.sql
```

Replace the filename with the pending migration and `DB` with your D1 binding name if different. Use `.wrangler/state`, not `.wrangler/state/v3`; Wrangler adds the versioned directories. Do not replay migrations already applied locally. This updates only the preview database; publishing applies production migrations separately.

## Diagnostic Commands

- `npm run install:ci`: perform the one locked dependency install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build the deployable Sites artifact
- `npm run start`: preview the built Worker locally with D1/R2 support
- `npm run db:generate`: generate Drizzle migrations after schema changes

When using the Sites plugin, follow its skill instructions for installation, builds, and publishing. These npm commands remain available for standalone use.

The portable build runs Vinext directly without a host `timeout` command. The managed-linux build uses `scripts/build-verified.sh` and its existing `SITES_BUILD_TIMEOUT` setting.

## Sistem desain Rencanain

Panduan visual ada di [design.md](./design.md): latar charcoal `#1C1C1D`, panel biru muda `#BFEAFF`, aksen `#2789D8` dan `#50B0FF`, font Inter dan JetBrains Mono lokal, spacing berbasis 8px, padding kartu 24px, serta radius kontrol/kartu 8px. Panel terang memakai teks gelap agar terbaca. Tema terang tetap tersedia sebagai alternatif.

`components/visual-motion.tsx` menangani GSAP dan ScrollTrigger dengan cleanup serta dukungan reduced motion. `components/entry-guide.tsx` berisi accordion panduan dan carousel contoh tampilan; contoh tersebut tidak disimpan sebagai proyek pengguna. Font dan lisensinya ada di `public/fonts`.

Untuk perubahan UI berikutnya, periksa halaman masuk, kuesioner, tech stack, tab PRD/diagram/tugas, navigasi ponsel, dan pergantian tema. Integrasi DeepSeek, Firebase Auth, dan repository/rules Firestore berada di luar lingkup perubahan visual ini.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
