# Nursery App – Pembungkus PWA (bisa diinstal di Android, iPhone/iPad, Windows)

Aplikasi Apps Script selalu berjalan di dalam iframe Google, sehingga tidak bisa diinstal langsung.
Folder ini adalah **pembungkus** beralamat tetap (GitHub Pages) yang berisi manifest, service worker,
dan ikon, lalu menampilkan Nursery App di dalamnya. Isi aplikasi tetap diambil langsung dari Apps Script
(tidak pernah di-cache), jadi selalu versi terbaru.

Isi folder: `index.html`, `alamat.js`, `offline.js`, `offline.css`, `manifest.webmanifest`, `sw.js`, `icon-192.png`,
`icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`, `favicon-32.png`, `PANDUAN.md`.

---

## a) Siapkan Apps Script (sekali)
1. Ganti **Code.gs** dan file tampilan (unggah `NurseryApp_index.html` ke Drive, atau tempel `Index.html`).
2. Pilih fungsi **setupSystem** → Jalankan.
3. **Terapkan → Kelola deployment** → ikon pensil **Edit** → Versi: **Versi baru**
   → Jalankan sebagai: **Saya** → Siapa yang memiliki akses: **Siapa saja** → **Terapkan**.
   - JANGAN memilih "Deployment baru": itu membuat link /exec yang berbeda, sehingga pembungkus
     menunjuk ke deployment lama dan membingungkan.
4. Salin **URL aplikasi web** yang berakhiran **/exec**.

## b) Unggah ke GitHub Pages (dari tablet, Chrome)
1. Buka **github.com** → masuk/daftar → tombol **+** (kanan atas) → **New repository**.
2. Repository name: **nurseryapp** → pilih **Public** → **Create repository**.
3. Ketuk **uploading an existing file**. Ekstrak ZIP dulu di HP (aplikasi File → ketuk ZIP → Ekstrak),
   lalu pilih **SEMUA FILE DI DALAM folder** `nurseryapp-pwa` (bukan foldernya) → **Commit changes**.
   - Benar: `index.html` tampil langsung di halaman depan repository.
   - Salah: ada folder `nurseryapp-pwa/` di repository (alamat akan 404).
4. Ketuk file **alamat.js** → ikon pensil (Edit) → cari baris:
   `window.NURSERY_APP_URL = 'https://script.google.com/macros/s/GANTI_DENGAN_ID_DEPLOYMENT/exec';`
   ganti isinya dengan URL /exec Anda → **Commit changes**. (Sejak pembungkus v3 alamat disimpan di `alamat.js`, bukan di `index.html`.)
5. **Settings → Pages** → Source: **Deploy from a branch** → Branch: **main** dan **/(root)** → **Save**.
6. Tunggu 1–3 menit. Alamat aplikasi: **https://NAMA-AKUN.github.io/nurseryapp/**

## c) Isi ALAMAT_APLIKASI
Buka spreadsheet Nursery App → sheet **Config** → baris **ALAMAT_APLIKASI** → kolom Nilai:
`https://NAMA-AKUN.github.io/nurseryapp/`. Alamat ini muncul di menu **Install aplikasi** (dengan tombol Salin).
Tidak perlu deploy ulang.

## d) Instal di perangkat
Selalu buka **alamat GitHub Pages**, bukan link /exec.
- **Android (Chrome):** buka alamat → ketuk banner **Pasang** atau menu **Akun → Install aplikasi → Install sekarang**.
  Bila tidak muncul: menu **⋮** → **Instal aplikasi** / **Tambahkan ke layar utama**.
- **iPhone/iPad (Safari, bukan Chrome):** buka alamat → tombol **Bagikan** (kotak + panah ke atas)
  → **Tambahkan ke Layar Utama** → **Tambah**.
- **Windows (Chrome/Edge):** buka alamat → Chrome: ikon instal di kanan kolom alamat → **Instal**.
  Edge: menu **…** → **Aplikasi** → **Instal situs ini sebagai aplikasi**.

## e) Pemecahan masalah
| Gejala | Penyebab umum | Solusi |
|---|---|---|
| Layar ikon kertas sedih / "Maaf, file tidak dapat dibuka" di dalam aplikasi | Akses deployment bukan **Siapa saja**; Code.gs masih lama (tanpa izin tampil di bingkai); atau APP_URL berisi link /exec dari deployment lain | Kelola deployment → Edit → akses **Siapa saja** → Versi baru. Pastikan Code.gs terbaru. Salin ulang URL /exec dari Kelola deployment ke APP_URL |
| Alamat GitHub menampilkan **404** | Pages belum aktif / belum selesai; atau file berada di dalam folder | Settings → Pages → main + /(root), tunggu beberapa menit. Pastikan `index.html` ada di akar repository |
| Tulisan "Alamat aplikasi belum diatur" | `alamat.js` belum diisi / belum diunggah | Edit `alamat.js`, isi NURSERY_APP_URL dengan link /exec |
| Tombol instal tidak muncul | Membuka link **/exec**, bukan alamat GitHub Pages; atau di iPhone memakai Chrome | Buka `https://NAMA-AKUN.github.io/nurseryapp/`. Di iPhone pakai **Safari** → Bagikan → Tambahkan ke Layar Utama |
| Muncul "Catat tanpa sinyal" | Internet terputus | Catat data di 4 formulir; aplikasi terbuka & data terkirim saat sinyal kembali |
| Formulir offline abu-abu / "Belum ada salinan data" | Belum pernah masuk akun saat online di HP itu, atau sudah Keluar | Buka aplikasi saat ada sinyal, masuk dengan akun, tunggu dasbor tampil |
| Sering diminta masuk ulang di iPhone | Safari membatasi penyimpanan di dalam bingkai | Normal di iOS; masuk ulang seperti biasa |

## f) Memperbarui di kemudian hari
- **Memperbarui Nursery App** (Code.gs / file tampilan): ganti file → **Kelola deployment → Edit → Versi baru**.
  Link /exec tetap sama, jadi pembungkus **tidak perlu diubah**. Pengguna yang sedang membuka aplikasi
  mendapat banner **"Versi baru tersedia – Muat ulang"**.
- **Memperbarui pembungkus** (mis. ganti ikon): unggah file baru ke repository, lalu di `sw.js` naikkan
  `VERSI` (mis. `nurseryapp-pwa-v1` → `nurseryapp-pwa-v2`) → Commit. Aplikasi yang terpasang memperbarui diri otomatis.

## g) Kode QR (versi pembungkus v2)
- Pembungkus meneruskan parameter QR ke aplikasi: `?menu=…&k=…` (formulir tamu) dan `?bibit=…` (profil Kamus Bibit).
  Parameter lain dibuang. Hak akses tetap diperiksa di server (Code.gs), bukan di pembungkus.
- QR yang dicetak dari menu **Kode QR Akses** dan **Kamus Bibit** memakai alamat GitHub Pages ini bila aplikasi dibuka
  dari pembungkus, sehingga hasil pindaian membuka aplikasi lewat pembungkus.
- Setelah mengganti `index.html` dan `sw.js` (VERSI `nurseryapp-pwa-v2`), tutup lalu buka lagi aplikasi yang terpasang
  satu kali agar versi baru aktif.

## h) Mode offline – Catat tanpa sinyal (pembungkus v3)
- 4 formulir bisa dipakai tanpa sinyal: **Sirkulasi bibit & lapangan**, **Absen tim** (khusus petugas absen),
  **Workshop** (termasuk polybag mati), **Cek mingguan gudang**.
- Syarat: dibuka dari **aplikasi yang diinstal / alamat GitHub Pages**, dan sudah **masuk akun sekali saat online** di HP itu.
  Pilihan (jenis bibit, leader, anggota tim, daftar alat & bahan) disalin otomatis setiap kali aplikasi dibuka online.
- Data disimpan di HP. Begitu sinyal kembali, aplikasi terbuka di belakang dan data dikirim **satu per satu lewat akun
  yang sedang masuk** (token sesi tidak pernah disimpan pembungkus). Tiap data punya kode unik: tidak tercatat dobel.
- Data yang ditolak server (mis. melebihi stok / sisa polybag) bertanda merah dengan alasannya → **Perbaiki** → simpan →
  terkirim ulang. Di aplikasi muncul bar **"Data offline: … ditolak"** dengan tombol **Lihat**.
- Absen tim yang dicatat offline memakai tanggal saat dicatat di HP (batas petugas tetap 2 hari ke belakang dari saat
  dicatat, maksimal terkirim 14 hari kemudian).
- Setiap kiriman offline yang berhasil tercatat di sheet **DB_Offline** (otomatis dibuat).
- **Keluar** akun menghapus salinan pilihan dari HP; data yang belum terkirim tetap disimpan dan terkirim saat akun
  pencatatnya masuk lagi di HP itu.
- iPhone/iPad dapat menghapus data aplikasi yang tidak dibuka ±7 hari: kirim data secepatnya begitu ada sinyal.
- Pembaruan pembungkus berikutnya cukup mengganti `index.html`, `offline.js`, `offline.css`, `sw.js` (naikkan `VERSI`);
  `alamat.js` tidak perlu diganti.

## i) Pembungkus v4 (Nursery App v5.6)
- Layar memuat pembungkus kini **sama persis** dengan layar memuat di dalam aplikasi (bibit tumbuh, hijau tua),
  dan baru ditutup setelah aplikasi siap, jadi tidak ada lagi layar kosong/berbeda saat membuka aplikasi.
- Foto yang dicatat tanpa sinyal dikecilkan ke 1280 px (sama dengan aplikasi) agar cepat terkirim.
- Pembaruan cukup mengganti `index.html`, `offline.js`, `sw.js` (VERSI `nurseryapp-pwa-v4`). `alamat.js` tidak diganti.
