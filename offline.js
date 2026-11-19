/* =====================================================================
 *  Nursery App - CATAT TANPA SINYAL (mode offline) v5.5
 *  Berjalan di pembungkus (GitHub Pages), BUKAN di Apps Script.
 *  - 4 formulir: Sirkulasi bibit & lapangan, Absen tim, Workshop (termasuk polybag mati), Cek mingguan gudang.
 *  - Data disimpan di HP (IndexedDB) dengan kode unik (UID), lalu dikirim lewat aplikasi yang sedang login saat online.
 *  - Pembungkus TIDAK pernah memegang token sesi; semua pemeriksaan (stok, hak petugas, dll.) tetap di server.
 *  - Pilihan (jenis bibit, leader, anggota tim, daftar alat) = salinan terakhir saat online (dikirim aplikasi).
 * ===================================================================== */
(function () {
  'use strict';
  var KUNCI_OPSI = 'nursery_off_opsi_v1';
  var UKURAN = ['10 x 15 cm', '12 x 20 cm', '15 x 20 cm', '17 x 25 cm', '20 x 30 cm', '25 x 30 cm', '30 x 40 cm'];
  var KEG = { masuk: ['Bibit masuk', 'Pembelian, sapihan, bantuan'], keluar: ['Bibit keluar', 'Penanaman, penyulaman, disumbangkan'], afkir: ['Mati / afkir', 'Bibit siap tanam yang mati'], perawatan: ['Perawatan lapangan', 'Pemupukan, penebasan, dll.'] };
  var SUB_DEF = { masuk: ['Pembelian', 'Hasil sapihan', 'Bantuan / hibah'], keluar: ['Penanaman', 'Penyulaman', 'Disumbangkan'], afkir: ['Layu', 'Hama', 'Penyakit', 'Rusak fisik', 'Lainnya'], perawatan: ['Pemupukan', 'Penebasan', 'Pendangiran', 'Penyemprotan'] };
  var WS = [['Top Soil', 'Pengisian top soil'], ['Penanaman Polybag', 'Penanaman ke polybag'], ['Pakan Maggot', 'Beri makan maggot'], ['Panen Kompos', 'Panen kompos'], ['Panen Telur BSF', 'Panen telur BSF'], ['Polybag Mati', 'Bibit polybag mati']];
  var ST_TIM = [['Hadir', ''], ['Sakit', 'r'], ['Izin', 'r'], ['Cuti', 'b'], ['Alpha', 'h'], ['Libur ganti hari', 'b']];
  var CK_ST = { Alat: [['Baik', 'Lengkap & baik', ''], ['Rusak', 'Ada rusak', 'r'], ['Hilang', 'Ada hilang', 'h']], Bahan: [['Cukup', 'Cukup', ''], ['Menipis', 'Menipis / perlu beli', 'r'], ['Habis', 'Habis', 'h']] };
  var FORM_FN = { sirkulasi: 'addKegiatan', workshop: 'addOperasional', absen: 'saveAbsenTim', cek: 'saveCekOffline' };
  var FN_FORM = { addKegiatan: 'sirkulasi', addOperasional: 'workshop', saveAbsenTim: 'absen', saveCekOffline: 'cek' };

  var H = { kirim: function () { return false; }, bukaApp: function () {}, appMuncul: function () { return false; } };   // diisi index.html
  var EL = {}, F = null, VIEW = 'home', ANT = [], terbuka = false, tYakin = null;
  var SY = { akun: '', sedang: null, timer: null, baru: 0, jeda: null };

  /* ---------------- util ---------------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return Number(n || 0).toLocaleString('id-ID'); }
  function ymd(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function tambahHari(s, n) { var d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); }
  var BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  function tglPendek(s) { var p = String(s || '').split('-'); return p.length === 3 ? Number(p[2]) + ' ' + BLN[Number(p[1]) - 1] : s; }
  function waktu(ms) { var d = new Date(ms), j = pad(d.getHours()) + '.' + pad(d.getMinutes()); return ymd(d) === ymd() ? j : d.getDate() + ' ' + BLN[d.getMonth()] + ' ' + j; }
  function angka(v) { return Number(String(v == null ? '' : v).replace(',', '.')); }
  function bulat(v) { var n = angka(v); return n > 0 && Math.floor(n) === n; }
  function buatUid() {
    var a = new Uint8Array(8), h = '';
    try { crypto.getRandomValues(a); } catch (e) { for (var i = 0; i < 8; i++) a[i] = Math.floor(Math.random() * 256); }
    for (var k = 0; k < 8; k++) h += ('0' + a[k].toString(16)).slice(-2);
    return 'o' + Date.now().toString(36) + h;
  }
  function online() { return navigator.onLine !== false; }
  function opsi() { try { return JSON.parse(localStorage.getItem(KUNCI_OPSI) || 'null'); } catch (e) { return null; } }
  function salin(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------------- penyimpanan antrian (IndexedDB) ---------------- */
  var _db = null;
  function idb() {
    return new Promise(function (res, rej) {
      if (_db) return res(_db);
      var r = indexedDB.open('nursery-offline', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('antrian', { keyPath: 'uid' }); };
      r.onsuccess = function () { _db = r.result; res(_db); };
      r.onerror = function () { rej(r.error || new Error('Penyimpanan HP tidak bisa dibuka.')); };
    });
  }
  function tx(mode, fn) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction('antrian', mode), st = t.objectStore('antrian'), out = fn(st);
        t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); };
        t.onerror = function () { rej(t.error); }; t.onabort = function () { rej(t.error || new Error('Penyimpanan HP penuh.')); };
      });
    });
  }
  function muatAntrian() { return tx('readonly', function (st) { return st.getAll(); }).then(function (l) { ANT = (l || []).sort(function (a, b) { return a.dibuat - b.dibuat; }); return ANT; }); }
  function simpanItem(it) { return tx('readwrite', function (st) { st.put(it); }).then(muatAntrian); }
  function hapusItem(uid) { return tx('readwrite', function (st) { st.delete(uid); }).then(muatAntrian); }
  function cari(uid) { for (var i = 0; i < ANT.length; i++) if (ANT[i].uid === uid) return ANT[i]; return null; }

  /** Bersihkan riwayat: yang terkirim > 7 hari dihapus, maks. 30 riwayat; status "mengirim" yang tertinggal dikembalikan. */
  function rapikan() {
    var batas = Date.now() - 7 * 86400000, ok = ANT.filter(function (x) { return x.status === 'terkirim'; }).sort(function (a, b) { return b.selesai - a.selesai; }), kerja = [];
    ok.forEach(function (x, i) { if (i >= 30 || (x.selesai || 0) < batas) kerja.push(hapusItem(x.uid)); });
    ANT.forEach(function (x) { if (x.status === 'mengirim') { x.status = 'menunggu'; kerja.push(simpanItem(x)); } });
    return Promise.all(kerja).then(muatAntrian);
  }

  /* ---------------- stok perkiraan di HP (stok terakhir +/- antrian yang belum terkirim) ---------------- */
  function stokLokal(jenis) {
    var o = opsi() || {}, n = Number((o.stok || {})[jenis] || 0);
    ANT.forEach(function (x) {
      if (x.status === 'terkirim' || x.fn !== 'addKegiatan' || (F && F.uidEdit === x.uid)) return;
      (x.args.items || []).forEach(function (i) { if (i.jenis === jenis) n += x.args.jenis === 'masuk' ? Number(i.jumlah) : -Number(i.jumlah); });
    });
    return n;
  }
  function sisaPolybag(jenis) {
    var o = opsi() || {}, n = 0;
    (o.persiapan || []).forEach(function (p) { if (p.jenis === jenis) n = p.jumlah; });
    ANT.forEach(function (x) {
      if (x.status === 'terkirim' || x.fn !== 'addOperasional' || (F && F.uidEdit === x.uid)) return;
      if (x.args.jenis === 'Polybag Mati' && x.args.jenisBibit === jenis) n -= Number(x.args.jumlah);
      if (x.args.jenis === 'Penanaman Polybag') (x.args.items || []).forEach(function (i) { if (i.jenis === jenis) n += Number(i.jumlah); });
    });
    return n;
  }
  function persiapanList() {
    var o = opsi() || {}, ada = {}, out = [];
    (o.persiapan || []).forEach(function (p) { ada[p.jenis] = 1; out.push(p.jenis); });
    ANT.forEach(function (x) { if (x.status !== 'terkirim' && x.fn === 'addOperasional' && x.args.jenis === 'Penanaman Polybag') (x.args.items || []).forEach(function (i) { if (!ada[i.jenis]) { ada[i.jenis] = 1; out.push(i.jenis); } }); });
    return out.map(function (j) { return { jenis: j, sisa: sisaPolybag(j) }; }).filter(function (p) { return p.sisa > 0 || (F && F.jenisBibit === p.jenis); });
  }
  function semuaJenis() {
    var o = opsi() || {}, g = o.groups || {}, l = [];
    Object.keys(g).forEach(function (k) { l = l.concat(g[k]); });
    return l.concat(o.extras || []);
  }

  /* ---------------- tampilan dasar ---------------- */
  function pasang() {
    if (EL.root) return;
    var d = document.createElement('div'); d.id = 'off'; d.hidden = true;
    d.innerHTML = '<div class="o-top"><b>Catat tanpa sinyal</b><span id="offAkun"></span></div><div id="offBan" class="o-ban off"></div><div class="o-isi" id="offIsi"></div><div class="o-toast" id="offToast" hidden></div>';
    document.body.appendChild(d);
    EL.root = d; EL.isi = d.querySelector('#offIsi'); EL.ban = d.querySelector('#offBan'); EL.akun = d.querySelector('#offAkun'); EL.toast = d.querySelector('#offToast');
    d.addEventListener('click', klik);
    d.addEventListener('input', ubah); d.addEventListener('change', ubah);
  }
  var tToast = null;
  function toast(m) { EL.toast.textContent = m; EL.toast.hidden = false; clearTimeout(tToast); tToast = setTimeout(function () { EL.toast.hidden = true; }, 3200); }

  function hitung() {
    var a = SY.akun, n = { menunggu: 0, ditolak: 0, lain: 0, mengirim: 0 };
    ANT.forEach(function (x) {
      if (x.status === 'terkirim') return;
      if (a && x.akun !== a) { n.lain++; return; }
      if (x.status === 'ditolak') n.ditolak++; else if (x.status === 'mengirim') n.mengirim++; else n.menunggu++;
    });
    return n;
  }
  function banner() {
    if (!EL.ban) return;
    var n = hitung(), sisa = n.menunggu + n.mengirim, h = '', c = 'off';
    if (!online()) h = 'Tanpa sinyal · ' + (sisa ? sisa + ' data menunggu dikirim' : 'data disimpan di HP sampai ada sinyal');
    else if (!SY.akun) { c = 'kirim'; h = 'Ada sinyal · ' + (sisa ? 'buka aplikasi & masuk untuk mengirim ' + sisa + ' data' : 'aplikasi bisa dibuka'); }
    else if (sisa) { c = 'kirim'; h = 'Mengirim data… (' + sisa + ' tersisa)'; }
    else { c = 'ok'; h = 'Online · ' + (n.ditolak ? n.ditolak + ' data perlu diperbaiki' : 'semua data terkirim'); }
    if (online()) h += ' <button data-a="app">Buka aplikasi</button>';
    EL.ban.className = 'o-ban ' + c; EL.ban.innerHTML = h;
    var o = opsi(); EL.akun.textContent = o && o.akun ? o.akun.nama : '';
  }
  function render() {
    if (!EL.root || EL.root.hidden) return;
    banner();
    if (VIEW === 'home') return renderHome();
    if (VIEW === 'sirkulasi') return renderSirkulasi();
    if (VIEW === 'workshop') return renderWorkshop();
    if (VIEW === 'absen') return renderAbsen();
    if (VIEW === 'cek') return renderCek();
  }

  /* ---------------- beranda: 4 formulir + antrian ---------------- */
  function renderHome() {
    var o = opsi(), adaOpsi = !!(o && o.akun), absenOk = adaOpsi && o.absen && o.absen.length, h = '<div class="o-wrap">';
    if (!adaOpsi) h += '<div class="o-warn"><b>Belum ada salinan data di HP ini.</b><br>Buka Nursery App sekali saat ada sinyal dan masuk dengan akun Anda. Setelah itu formulir di bawah bisa dipakai tanpa sinyal.</div>';
    h += '<span class="o-h">CATAT TANPA SINYAL</span><div class="o-grid">' +
      tile('sirkulasi', '🌱', 'Sirkulasi bibit', 'Masuk · keluar · afkir · perawatan', adaOpsi) +
      tile('absen', '🧑‍🤝‍🧑', 'Absen tim', absenOk ? 'Status + lembur' : 'Khusus petugas absen', absenOk) +
      tile('workshop', '🪴', 'Workshop', 'Termasuk polybag mati', adaOpsi) +
      tile('cek', '🧰', 'Cek mingguan', 'Alat & bahan gudang', adaOpsi) + '</div>';
    if (adaOpsi) h += '<p class="o-note">Pilihan diambil dari salinan terakhir saat online (' + waktu(o.waktu) + '). Stok yang tampil adalah perkiraan; pemeriksaan akhir tetap di server saat data terkirim.</p>';
    var aktif = ANT.filter(function (x) { return x.status !== 'terkirim'; }), riw = ANT.filter(function (x) { return x.status === 'terkirim'; }).sort(function (a, b) { return b.selesai - a.selesai; });
    h += '<div class="o-card"><b>' + (aktif.length ? 'Menunggu dikirim (' + aktif.length + ')' : 'Tidak ada data yang menunggu') + '</b>' + aktif.map(qHtml).join('') + '</div>';
    if (riw.length) h += '<details class="o-card o-det"><summary>Riwayat terkirim (' + riw.length + ') <span>▾</span></summary>' + riw.slice(0, 30).map(qHtml).join('') + '</details>';
    h += '<p class="o-note">Data offline tersimpan di HP sampai terkirim. Setiap data punya kode unik, jadi tidak tercatat dobel walau terkirim dua kali. Menu lain (dashboard, laporan, riwayat) tetap butuh sinyal.</p></div>';
    EL.isi.innerHTML = h;
  }
  function tile(v, ico, t, d, ok) { return '<button class="o-tile" data-a="form" data-v="' + v + '"' + (ok ? '' : ' aria-disabled="true"') + '><i>' + ico + '</i><b>' + t + '</b><small>' + d + '</small></button>'; }
  function qHtml(x) {
    var st = { menunggu: ['Menunggu', 'c-tunggu'], mengirim: ['Mengirim…', 'c-kirim'], terkirim: ['Terkirim', 'c-ok'], ditolak: ['Ditolak', 'c-tolak'] }[x.status] || ['?', 'c-lain'];
    var lain = SY.akun && x.akun !== SY.akun && x.status !== 'terkirim';
    if (lain) st = ['Akun lain', 'c-lain'];
    var h = '<div class="o-q"><div class="o-qr"><div><b>' + esc(x.judul) + '</b><small>' + esc(x.ket) + ' · ' + waktu(x.dibuat) + (x.akunNama ? ' · ' + esc(x.akunNama) : '') + '</small></div><span class="o-chip ' + st[1] + '">' + st[0] + '</span></div>';
    if (lain) h += '<div class="o-pesan" style="color:#44505c">Dicatat oleh ' + esc(x.akunNama) + '. Terkirim saat ' + esc(x.akunNama) + ' masuk ke aplikasi di HP ini.</div>';
    if (x.pesan) h += '<div class="o-pesan' + (x.status === 'terkirim' ? ' ok' : '') + '">' + esc(x.pesan) + '</div>';
    if (x.status === 'ditolak') h += '<div class="o-aksi"><button class="o-mini" data-a="ubah" data-u="' + x.uid + '">Perbaiki</button><button class="o-mini" data-a="ulang" data-u="' + x.uid + '">Kirim ulang</button><button class="o-mini hapus" data-a="hapus" data-u="' + x.uid + '">Hapus</button></div>';
    else if (x.status === 'menunggu') h += '<div class="o-aksi"><button class="o-mini" data-a="ubah" data-u="' + x.uid + '">Ubah</button><button class="o-mini hapus" data-a="hapus" data-u="' + x.uid + '">Hapus</button></div>';
    return h + '</div>';
  }

  /* ---------------- pembantu formulir ---------------- */
  function fh(judul) { return '<div class="o-fh"><button class="o-back" data-a="kembali">← Kembali</button><h2>' + esc(judul) + '</h2></div>'; }
  function lbl(t, wajib, opsional) { return '<label class="o-lbl">' + t + (wajib ? ' <em>*</em>' : '') + (opsional ? ' <span>(opsional)</span>' : '') + '</label>'; }
  function inp(path, t, o) {
    o = o || {}; var v = ambil(path);
    return '<div>' + lbl(t, o.req, o.ops) + '<input class="o-fld' + (F.err && F.err[path] ? ' err' : '') + '" data-f="' + path + '" value="' + esc(v == null ? '' : v) + '"' + (o.type ? ' type="' + o.type + '"' : '') + (o.max ? ' max="' + o.max + '"' : '') + (o.min ? ' min="' + o.min + '"' : '') +
      (o.num ? ' inputmode="decimal"' : '') + ' placeholder="' + esc(o.ph || '') + '" autocomplete="off"></div>';
  }
  function txa(path, t, ph) { return '<div>' + lbl(t, false, true) + '<textarea class="o-fld" data-f="' + path + '" rows="2" placeholder="' + esc(ph || '') + '">' + esc(ambil(path) || '') + '</textarea></div>'; }
  function chips(path, list, multi) {
    var v = ambil(path);
    return '<div class="o-chips">' + list.map(function (x) {
      var val = Array.isArray(x) ? x[0] : x, t = Array.isArray(x) ? x[1] : x, on = multi ? (v || []).indexOf(val) > -1 : v === val;
      return '<button type="button" class="o-c' + (on ? ' on' : '') + '" data-a="' + (multi ? 'multi' : 'pilih') + '" data-f="' + path + '" data-v="' + esc(val) + '">' + esc(t) + '</button>';
    }).join('') + '</div>';
  }
  function tglFld(path, minHari) { return inp(path, 'Tanggal', { type: 'date', req: true, max: ymd(), min: minHari ? tambahHari(ymd(), -minHari) : '' }); }
  function jenisOpts(v, stok) {
    var o = opsi() || {}, g = o.groups || {}, h = '<option value="">-- Pilih jenis bibit --</option>', lab = function (p) { return esc(p) + (stok ? ' — stok ±' + fmt(stokLokal(p)) : ''); };
    Object.keys(g).forEach(function (k) { h += '<optgroup label="' + esc(k) + '">' + g[k].map(function (p) { return '<option value="' + esc(p) + '"' + (p === v ? ' selected' : '') + '>' + lab(p) + '</option>'; }).join('') + '</optgroup>'; });
    if ((o.extras || []).length) h += '<optgroup label="Jenis lain (tersimpan)">' + o.extras.map(function (p) { return '<option value="' + esc(p) + '"' + (p === v ? ' selected' : '') + '>' + lab(p) + '</option>'; }).join('') + '</optgroup>';
    return h + '<option value="__lain"' + (v === '__lain' ? ' selected' : '') + '>Jenis lain (ketik manual)…</option>';
  }
  function itemsHtml(stok) {
    var tot = 0, h = '<div>' + lbl('Jenis bibit &amp; jumlah', true) + '<div style="display:flex;flex-direction:column;gap:8px">';
    F.items.forEach(function (it, i) {
      tot += angka(it.jumlah) || 0;
      var j = it.jenis === '__lain' ? String(it.lain || '').trim() : it.jenis, s = stok && j ? stokLokal(j) : null;
      h += '<div class="o-it"><div><select class="o-fld' + (F.err && F.err['items|' + i + '|jenis'] ? ' err' : '') + '" data-f="items|' + i + '|jenis" data-r="1">' + jenisOpts(it.jenis, stok) + '</select>' +
        (it.jenis === '__lain' ? '<input class="o-fld" style="margin-top:6px" data-f="items|' + i + '|lain" value="' + esc(it.lain || '') + '" placeholder="Ketik nama jenis bibit">' : '') +
        '<div class="o-hint w" id="oh-' + i + '">' + hintStok(i) + '</div></div>' +
        '<input class="o-fld' + (F.err && F.err['items|' + i + '|jumlah'] ? ' err' : '') + '" data-f="items|' + i + '|jumlah" type="number" inputmode="numeric" min="1" step="1" placeholder="Jumlah" value="' + esc(it.jumlah || '') + '">' +
        '<button type="button" class="o-x" data-a="hapusBaris" data-i="' + i + '" aria-label="Hapus baris">✕</button></div>';
    });
    return h + '</div><button type="button" class="o-mini" style="margin-top:8px" data-a="tambahBaris">+ Tambah jenis bibit</button><div class="o-tot" style="margin-top:8px"><span>Total</span><span id="oh-tot">' + fmt(tot) + ' batang</span></div></div>';
  }
  /** Peringatan stok satu baris (hanya untuk bibit keluar / afkir). */
  function hintStok(i) {
    var it = F.items[i]; if (!it || F.jenis === 'masuk' || VIEW !== 'sirkulasi') return '';
    var j = it.jenis === '__lain' ? String(it.lain || '').trim() : it.jenis; if (!j) return '';
    var s = stokLokal(j); return angka(it.jumlah) > s ? 'Melebihi stok perkiraan (±' + fmt(s) + '). Server akan menolak bila stok tidak cukup.' : '';
  }
  function hintPolybag() {
    var p = null; persiapanList().forEach(function (x) { if (x.jenis === F.jenisBibit) p = x; });
    var n = angka(F.jumlah); if (!p || !(n > 0)) return ['', false];
    return n > p.sisa ? ['Melebihi sisa ' + p.jenis + ' di polybag (±' + fmt(p.sisa) + ').', true] : ['Sisa ' + p.jenis + ' setelah disimpan: ±' + fmt(p.sisa - n) + ' batang.', false];
  }
  /** Perbarui teks kecil tanpa menggambar ulang formulir (agar ketukan tombol Simpan tidak hilang). */
  function segarkanKecil(f) {
    var m;
    if ((m = /^items\|(\d+)\|/.exec(f))) {
      var e = document.getElementById('oh-' + m[1]); if (e) e.textContent = hintStok(Number(m[1]));
      var t = document.getElementById('oh-tot'); if (t) { var tot = 0; F.items.forEach(function (x) { tot += angka(x.jumlah) || 0; }); t.textContent = fmt(tot) + ' batang'; }
    }
    if (f === 'jumlah' && F.jenis === 'Polybag Mati') { var hp = hintPolybag(), el = document.getElementById('oh-pm'); if (el) { el.textContent = hp[0]; el.className = 'o-hint' + (hp[1] ? ' w' : ''); } }
    if ((m = /^rows\|(\d+)\|lembur$/.exec(f))) { var c = document.getElementById('olb-' + m[1]), r = F.rows[Number(m[1])]; if (c) c.textContent = angka(r.lembur) ? 'Lembur ' + String(r.lembur).replace('.', ',') + ' jam' : '+ Lembur'; }
  }
  function fotoHtml(maks, wajib) {
    return '<div>' + lbl('Foto', wajib, !wajib) + '<div class="o-foto">' + F.files.map(function (p, i) { return '<div class="o-ph" style="background-image:url(data:' + p.mime + ';base64,' + p.data + ')"><button type="button" data-a="hapusFoto" data-i="' + i + '" aria-label="Hapus foto">✕</button></div>'; }).join('') +
      (F.files.length < maks ? '<label class="o-add">📷<span>Tambah foto</span><input type="file" accept="image/*" multiple data-foto="' + maks + '"></label>' : '') + '</div><div class="o-hint">Maks. ' + maks + ' foto, dikompres otomatis.</div></div>';
  }
  function simpanBtn() { return '<div class="o-err" id="offErr"></div><button class="o-btn" data-a="simpan">Simpan di HP</button>'; }

  function ambil(path) { var p = path.split('|'), o = F; for (var i = 0; i < p.length; i++) { if (o == null) return ''; o = o[p[i]]; } return o; }
  function taruh(path, v) { var p = path.split('|'), o = F; for (var i = 0; i < p.length - 1; i++) o = o[p[i]]; o[p[p.length - 1]] = v; }

  /* ---------------- 1. Sirkulasi bibit & lapangan ---------------- */
  function baruSirkulasi() { return { jenis: '', sub: '', tanggal: ymd(), lokasi: '', area: '', leader: '', tim: '', luas: '', sumber: '', asal: '', bedeng: '', penerima: '', catatan: '', items: [{ jenis: '', lain: '', jumlah: '' }], files: [] }; }
  function renderSirkulasi() {
    var o = opsi() || {}, K = o.kegiatan || SUB_DEF, k = F.jenis, s = F.sub, h = '<div class="o-wrap">' + fh('Sirkulasi bibit & lapangan') + '<div class="o-card"><b>1. Pilih kegiatan</b>' + chips('jenis', Object.keys(KEG).map(function (x) { return [x, KEG[x][0]]; })) + '</div>';
    if (k) {
      h += '<div class="o-card"><b>2. ' + (k === 'masuk' ? 'Jenis bibit masuk' : k === 'keluar' ? 'Bibit keluar karena' : k === 'afkir' ? 'Penyebab' : 'Jenis perawatan') + '</b>' + chips('sub', K[k] || SUB_DEF[k]) + '</div><div class="o-card"><b>3. Isi data</b>' + tglFld('tanggal');
      if (k === 'masuk') h += inp('sumber', s === 'Pembelian' ? 'Dibeli dari (pemasok)' : s === 'Hasil sapihan' ? 'Asal persemaian / bedeng semai' : 'Sumber bantuan (instansi / pemberi)', { req: true }) + inp('asal', 'Sumber benih / asal bibit', { ops: true }) + inp('bedeng', 'Bedeng tujuan', { ops: true, ph: 'Contoh: B-01' });
      if (k === 'keluar' || k === 'perawatan') {
        h += inp('lokasi', 'Lokasi', { req: true, ph: 'Contoh: Pit 3 Timur Blok R-12' });
        if (k === 'perawatan') h += inp('area', 'Area perawatan', { req: true, ph: 'Contoh: Blok D-4, Reklamasi 2023' });
        if (s === 'Disumbangkan') h += inp('penerima', 'Penerima bibit', { req: true });
        h += '<div>' + lbl('Leader', true) + '<select class="o-fld' + (F.err && F.err.leader ? ' err' : '') + '" data-f="leader"><option value="">-- Pilih leader --</option>' + (o.leaders || []).map(function (n) { return '<option' + (n === F.leader ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '</select></div>';
        h += inp('tim', 'Nama tim', { req: true, ph: 'Contoh: Tim Reklamasi A' });
        if (s === 'Penanaman' || s === 'Penyulaman' || k === 'perawatan') h += inp('luas', (k === 'perawatan' ? 'Luas area yang dirawat' : s === 'Penyulaman' ? 'Luas area penyulaman' : 'Luas area penanaman') + ' (ha)', { req: s !== 'Penyulaman', ops: s === 'Penyulaman', num: true, ph: '0' });
      }
      if (k === 'afkir') h += inp('bedeng', 'Bedeng', { ops: true, ph: 'Contoh: B-01' });
      if (k !== 'perawatan') h += itemsHtml(k !== 'masuk');
      h += txa('catatan', 'Catatan', 'Contoh: kondisi bibit, cuaca, kendala di lapangan') + fotoHtml(4, false) + simpanBtn() + '</div>';
    }
    EL.isi.innerHTML = h + '</div>';
  }
  function cekSirkulasi() {
    var e = {}, k = F.jenis, s = F.sub, t = function (x) { return String(F[x] || '').trim(); };
    if (!k) return 'Pilih kegiatan dulu.';
    if (!t('tanggal')) e.tanggal = 1; else if (t('tanggal') > ymd()) return 'Tanggal tidak boleh melebihi hari ini.';
    if (k === 'masuk' && !t('sumber')) e.sumber = 1;
    if (k === 'keluar' || k === 'perawatan') { if (!t('lokasi')) e.lokasi = 1; if (!t('leader')) e.leader = 1; if (!t('tim')) e.tim = 1; }
    if ((s === 'Penanaman' || k === 'perawatan') && !(angka(F.luas) > 0)) e.luas = 1;
    if (F.luas !== '' && F.luas != null && !(angka(F.luas) >= 0)) e.luas = 1;
    if (k === 'perawatan' && !t('area')) e.area = 1;
    if (s === 'Disumbangkan' && !t('penerima')) e.penerima = 1;
    if (k !== 'perawatan') F.items.forEach(function (it, i) { var j = it.jenis === '__lain' ? String(it.lain || '').trim() : it.jenis; if (!j) e['items|' + i + '|jenis'] = 1; if (!bulat(it.jumlah)) e['items|' + i + '|jumlah'] = 1; });
    F.err = e; return Object.keys(e).length ? 'Lengkapi kolom yang ditandai merah.' : '';
  }
  function argsSirkulasi() {
    var k = F.jenis, items = k === 'perawatan' ? [] : F.items.map(function (it) { return { jenis: it.jenis === '__lain' ? String(it.lain).trim() : it.jenis, jumlah: Number(it.jumlah) }; });
    return { jenis: k, sub: F.sub, tanggal: F.tanggal, lokasi: F.lokasi, area: F.area, leader: F.leader, tim: F.tim, luas: F.luas, sumber: F.sumber, asal: F.asal, bedeng: F.bedeng, penerima: F.penerima, catatan: F.catatan, items: items, files: F.files };
  }
  function judulSirkulasi(a) {
    var tot = 0; (a.items || []).forEach(function (i) { tot += Number(i.jumlah) || 0; });
    var it = (a.items || []).map(function (i) { return i.jenis + ' ' + fmt(i.jumlah); }).join(', ');
    return [KEG[a.jenis][0] + ' · ' + a.sub, [it || a.area, a.lokasi || a.sumber || a.bedeng, tglPendek(a.tanggal)].filter(Boolean).join(' · ')];
  }

  /* ---------------- 2. Workshop ---------------- */
  function baruWorkshop() { return { jenis: '', tanggal: ymd(), ukuran: UKURAN[2], ukuranLain: '', jumlah: '', items: [{ jenis: '', lain: '', jumlah: '' }], sumber: [{ nama: '', lain: '', kg: '' }], berat: '', jenisBibit: '', bedengan: '', penyebab: [], keterangan: '', files: [] }; }
  function renderWorkshop() {
    var o = opsi() || {}, j = F.jenis, h = '<div class="o-wrap">' + fh('Workshop nursery') + '<div class="o-card"><b>1. Pilih kegiatan</b>' + chips('jenis', WS) + '</div>';
    if (j) {
      h += '<div class="o-card"><b>2. Isi data</b>' + tglFld('tanggal');
      if (j === 'Top Soil') {
        h += '<div>' + lbl('Ukuran polybag', true) + '<select class="o-fld" data-f="ukuran" data-r="1">' + UKURAN.map(function (u) { return '<option' + (u === F.ukuran ? ' selected' : '') + '>' + u + '</option>'; }).join('') + '<option value="__lain"' + (F.ukuran === '__lain' ? ' selected' : '') + '>Lainnya (ketik manual)…</option></select></div>';
        if (F.ukuran === '__lain') h += inp('ukuranLain', 'Ukuran polybag (manual)', { req: true, ph: 'Contoh: 14 x 22 cm' });
        h += inp('jumlah', 'Jumlah polybag terisi', { req: true, type: 'number', num: true, min: 1, ph: 'Contoh: 500' });
      } else if (j === 'Penanaman Polybag') {
        h += itemsHtml(false) + '<div class="o-info">Bibit ini masuk <b>Bibit dalam persiapan</b>, belum dihitung stok siap tanam.</div>';
      } else if (j === 'Pakan Maggot') {
        var L = (o.sumber && o.sumber.length ? o.sumber : ['Kantin / mess', 'Sisa sayur & buah pasar', 'Serasah / sisa tanaman nursery']);
        h += '<div>' + lbl('Sumber sampah &amp; berat (kg)', true) + '<div style="display:flex;flex-direction:column;gap:8px">' + F.sumber.map(function (x, i) {
          return '<div class="o-it" style="grid-template-columns:minmax(0,1fr) 100px 44px"><div><select class="o-fld" data-f="sumber|' + i + '|nama" data-r="1"><option value="">-- Pilih sumber --</option>' + L.map(function (n) { return '<option' + (n === x.nama ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '<option value="__lain"' + (x.nama === '__lain' ? ' selected' : '') + '>Lainnya (tulis)…</option></select>' +
            (x.nama === '__lain' ? '<input class="o-fld" style="margin-top:6px" data-f="sumber|' + i + '|lain" value="' + esc(x.lain || '') + '" placeholder="Tulis sumber sampah">' : '') + '</div>' +
            '<input class="o-fld" data-f="sumber|' + i + '|kg" inputmode="decimal" placeholder="kg" value="' + esc(x.kg || '') + '"><button type="button" class="o-x" data-a="hapusSumber" data-i="' + i + '">✕</button></div>';
        }).join('') + '</div><button type="button" class="o-mini" style="margin-top:8px" data-a="tambahSumber">+ Tambah sumber</button></div>';
      } else if (j === 'Panen Kompos' || j === 'Panen Telur BSF') {
        h += inp('berat', j === 'Panen Kompos' ? 'Berat kompos (kg)' : 'Berat telur BSF (gram)', { req: true, num: true, ph: j === 'Panen Kompos' ? 'Contoh: 80' : 'Contoh: 35,5' });
      } else if (j === 'Polybag Mati') {
        var P = persiapanList();
        h += '<div class="o-info">Khusus bibit di polybag/bedengan yang <b>belum siap tanam</b>. Bibit siap tanam yang mati dicatat di Sirkulasi › Mati/afkir.</div>' +
          (P.length ? '<div>' + lbl('Jenis bibit (sisa di polybag)', true) + chips('jenisBibit', P.map(function (p) { return [p.jenis, p.jenis + ' · sisa ±' + fmt(p.sisa)]; })) + '</div>' : '<div class="o-warn">Belum ada bibit dalam persiapan pada salinan terakhir. Catat dulu "Penanaman ke polybag".</div>') +
          '<div class="o-row2">' + inp('jumlah', 'Jumlah mati (batang)', { req: true, type: 'number', num: true, min: 1 }) + inp('bedengan', 'Bedengan', { ops: true, ph: 'mis. B-03' }) + '</div>' +
          (function () { var hp = hintPolybag(); return '<div id="oh-pm" class="o-hint' + (hp[1] ? ' w' : '') + '">' + esc(hp[0]) + '</div>'; })() +
          '<div>' + lbl('Penyebab (boleh lebih dari satu)', true) + chips('penyebab', o.sebab || ['Kekeringan', 'Hama / ulat', 'Busuk akar', 'Rusak / terinjak', 'Lainnya'], true) + '</div>';
      }
      h += txa('keterangan', j === 'Polybag Mati' && F.penyebab.indexOf('Lainnya') > -1 ? 'Keterangan (wajib: tulis penyebab lainnya)' : 'Keterangan') + fotoHtml(3, j === 'Pakan Maggot') + simpanBtn() + '</div>';
    }
    EL.isi.innerHTML = h + '</div>';
  }
  function cekWorkshop() {
    var j = F.jenis, e = {};
    if (!j) return 'Pilih kegiatan workshop dulu.';
    if (!F.tanggal) e.tanggal = 1; else if (F.tanggal > ymd()) return 'Tanggal tidak boleh melebihi hari ini.';
    if (j === 'Top Soil') { if (F.ukuran === '__lain' && !String(F.ukuranLain).trim()) e.ukuranLain = 1; if (!bulat(F.jumlah)) e.jumlah = 1; }
    if (j === 'Penanaman Polybag') F.items.forEach(function (it, i) { var n = it.jenis === '__lain' ? String(it.lain || '').trim() : it.jenis; if (!n) e['items|' + i + '|jenis'] = 1; if (!bulat(it.jumlah)) e['items|' + i + '|jumlah'] = 1; });
    if (j === 'Pakan Maggot') {
      if (!F.sumber.length) return 'Isi minimal satu sumber sampah.';
      var seen = {}, dobel = '';
      F.sumber.forEach(function (x) { var n = x.nama === '__lain' ? String(x.lain || '').trim() : x.nama; if (!n || !(angka(x.kg) > 0)) e.sumber = 1; if (n && seen[n.toLowerCase()]) dobel = n; seen[String(n).toLowerCase()] = 1; });
      if (e.sumber) return 'Lengkapi nama sumber dan berat (kg) lebih dari 0.';
      if (dobel) return 'Sumber "' + dobel + '" dipilih dua kali.';
      if (!F.files.length) return 'Foto wajib untuk kegiatan beri makan maggot (1-3 foto).';
    }
    if ((j === 'Panen Kompos' || j === 'Panen Telur BSF') && !(angka(F.berat) > 0)) e.berat = 1;
    if (j === 'Polybag Mati') {
      if (!F.jenisBibit) return 'Pilih jenis bibit yang mati.';
      if (!bulat(F.jumlah)) e.jumlah = 1;
      if (!F.penyebab.length) return 'Pilih minimal satu penyebab.';
      if (F.penyebab.indexOf('Lainnya') > -1 && !String(F.keterangan).trim()) return 'Tulis penyebab lainnya di kolom keterangan.';
    }
    F.err = e; return Object.keys(e).length ? 'Lengkapi kolom yang ditandai merah.' : '';
  }
  function argsWorkshop() {
    var j = F.jenis, p = { tanggal: F.tanggal, jenis: j, keterangan: String(F.keterangan || '').trim(), files: F.files };
    if (j === 'Top Soil') { p.ukuran = F.ukuran === '__lain' ? String(F.ukuranLain).trim() : F.ukuran; p.jumlah = Number(F.jumlah); }
    else if (j === 'Penanaman Polybag') p.items = F.items.map(function (it) { return { jenis: it.jenis === '__lain' ? String(it.lain).trim() : it.jenis, jumlah: Number(it.jumlah) }; });
    else if (j === 'Pakan Maggot') p.sumber = F.sumber.map(function (x) { return { nama: x.nama === '__lain' ? String(x.lain).trim() : x.nama, kg: x.kg }; });
    else if (j === 'Polybag Mati') { p.jenisBibit = F.jenisBibit; p.jumlah = Number(F.jumlah); p.bedengan = F.bedengan; p.penyebab = F.penyebab.slice(); }
    else p.berat = F.berat;
    return p;
  }
  function judulWorkshop(a) {
    var d = a.jenis === 'Top Soil' ? fmt(a.jumlah) + ' polybag ' + a.ukuran : a.jenis === 'Penanaman Polybag' ? (a.items || []).map(function (i) { return i.jenis + ' ' + fmt(i.jumlah); }).join(', ') :
      a.jenis === 'Pakan Maggot' ? (a.sumber || []).map(function (s) { return s.nama + ' ' + s.kg + ' kg'; }).join(', ') : a.jenis === 'Polybag Mati' ? a.jenisBibit + ' ' + fmt(a.jumlah) + (a.bedengan ? ' · ' + a.bedengan : '') :
      a.berat + (a.jenis === 'Panen Kompos' ? ' kg' : ' gram');
    return ['Workshop · ' + (a.jenis === 'Polybag Mati' ? 'Polybag mati' : a.jenis), d + ' · ' + tglPendek(a.tanggal)];
  }

  /* ---------------- 3. Absen tim ---------------- */
  function libur(t) { var o = opsi() || {}; return new Date(t + 'T12:00:00').getDay() === 0 || (o.libur || []).indexOf(t) > -1; }
  function baruAbsen(gid) {
    var o = opsi() || {}, G = o.absen || [], g = G.filter(function (x) { return x.id === gid; })[0] || G[0];
    return { grup: g ? g.id : '', tanggal: ymd(), rows: g ? g.anggota.map(function (a) { return { nama: a.nama, tim: a.tim, saldo: a.saldo, status: '', lembur: 0, lemburKet: '', buka: false }; }) : [] };
  }
  function renderAbsen() {
    var o = opsi() || {}, G = o.absen || [], g = G.filter(function (x) { return x.id === F.grup; })[0], admin = o.akun && o.akun.admin, n = F.rows.filter(function (r) { return r.status; }).length;
    var h = '<div class="o-wrap">' + fh('Absen tim') + '<div class="o-card">' + (G.length > 1 ? '<div>' + lbl('Kelompok') + chips('grup', G.map(function (x) { return [x.id, x.label]; })) + '</div>' : '<b>' + esc(g ? g.label : '') + '</b>') +
      inp('tanggal', 'Tanggal', { type: 'date', req: true, max: ymd(), min: admin ? '' : tambahHari(ymd(), -2) }) +
      '<div class="o-hint">' + (libur(F.tanggal) ? '<b>Hari libur</b>: masuk = +1 saldo ganti hari. ' : 'Hari kerja biasa. ') + n + ' dari ' + F.rows.length + ' sudah dipilih.</div>' +
      '<button type="button" class="o-mini" data-a="semuaHadir">Tandai semua hadir</button></div><div class="o-card">';
    if (!F.rows.length) h += '<div class="o-warn">Belum ada anggota di kelompok ini pada salinan terakhir.</div>';
    F.rows.forEach(function (r, i) {
      h += '<div class="o-ab"><div><b>' + esc(r.nama) + '</b><br><small>' + esc(r.tim || '') + (r.saldo != null ? ' · saldo ganti hari ' + r.saldo : '') + '</small></div><div class="o-chips">' +
        ST_TIM.map(function (s) { return '<button type="button" class="o-c' + (r.status === s[0] ? ' on ' + s[1] : '') + '" data-a="status" data-i="' + i + '" data-v="' + s[0] + '">' + s[0] + '</button>'; }).join('') +
        (r.status === 'Hadir' ? '<button type="button" id="olb-' + i + '" class="o-c' + (r.lembur || r.buka ? ' on r' : '') + '" data-a="lembur" data-i="' + i + '">' + (r.lembur ? 'Lembur ' + String(r.lembur).replace('.', ',') + ' jam' : '+ Lembur') + '</button>' : '') + '</div>';
      if (r.status === 'Hadir' && (r.buka || r.lembur)) h += '<div class="o-lb"><input class="o-fld" data-f="rows|' + i + '|lembur" inputmode="decimal" placeholder="Jam" value="' + esc(r.lembur || '') + '"><input class="o-fld" data-f="rows|' + i + '|lemburKet" placeholder="Pekerjaan lembur" value="' + esc(r.lemburKet || '') + '"></div>';
      h += '</div>';
    });
    h += '</div><div class="o-info">Anggota yang hari itu sudah absen mandiri (dengan bukti) dilewati server, tidak ditimpa. Lembur: jam kelipatan 0,5 dan tulis pekerjaannya.</div>' + simpanBtn() + '</div>';
    EL.isi.innerHTML = h;
  }
  function cekAbsen() {
    var o = opsi() || {}, admin = o.akun && o.akun.admin;
    if (!F.grup) return 'Anda belum ditunjuk sebagai petugas absen.';
    if (!F.tanggal || F.tanggal > ymd()) return 'Tanggal tidak boleh melebihi hari ini.';
    if (!admin && F.tanggal < tambahHari(ymd(), -2)) return 'Petugas hanya bisa mengisi sampai 2 hari ke belakang.';
    var isi = F.rows.filter(function (r) { return r.status; });
    if (!isi.length) return 'Pilih status kehadiran minimal untuk satu anggota.';
    for (var i = 0; i < isi.length; i++) {
      var r = isi[i], j = angka(r.lembur) || 0;
      if (r.status === 'Libur ganti hari' && libur(F.tanggal)) return F.tanggal + ' hari libur: tidak perlu "Libur ganti hari" untuk ' + r.nama + '.';
      if (j && (j < 0 || j > 12 || Math.round(j * 2) !== j * 2)) return 'Jam lembur ' + r.nama + ' harus 0,5-12 jam (kelipatan 0,5).';
      if (j && !String(r.lemburKet || '').trim()) return 'Tulis pekerjaan lembur ' + r.nama + '.';
    }
    return '';
  }
  function argsAbsen() {
    return { grup: F.grup, tanggal: F.tanggal, rows: F.rows.filter(function (r) { return r.status; }).map(function (r) { var j = r.status === 'Hadir' ? angka(r.lembur) || 0 : 0; return { nama: r.nama, status: r.status, lembur: j, lemburKet: j ? String(r.lemburKet || '').trim() : '' }; }) };
  }
  function judulAbsen(a) {
    var o = opsi() || {}, g = (o.absen || []).filter(function (x) { return x.id === a.grup; })[0], c = {};
    a.rows.forEach(function (r) { c[r.status] = (c[r.status] || 0) + 1; });
    var lb = a.rows.filter(function (r) { return r.lembur; }).length;
    return ['Absen tim · ' + (g ? g.label : a.grup), a.rows.length + ' orang (' + Object.keys(c).map(function (k) { return c[k] + ' ' + k.toLowerCase(); }).join(', ') + ')' + (lb ? ', ' + lb + ' lembur' : '') + ' · ' + tglPendek(a.tanggal)];
  }

  /* ---------------- 4. Cek mingguan gudang ---------------- */
  function baruCek() { var o = opsi() || {}; return { tanggal: ymd(), semuaAman: false, catatan: '', cek: (o.cek || []).map(function (c) { return { nama: c.nama, jenis: c.jenis, satuan: c.satuan, stok: c.stok, status: '', rusak: '', hilang: '', ket: '', catat: false }; }) }; }
  function renderCek() {
    var n = F.cek.filter(function (c) { return c.status; }).length, tot = F.cek.length, pc = tot ? Math.round((F.semuaAman ? tot : n) / tot * 100) : 0;
    var h = '<div class="o-wrap">' + fh('Cek mingguan gudang') + '<div class="o-card">' + inp('tanggal', 'Tanggal pengecekan (minggu yang sama = satu data)', { type: 'date', req: true, max: ymd() }) +
      '<div><b style="font-size:14px">' + (F.semuaAman ? 'Semua barang tercek (yang belum dipilih = aman)' : n + ' dari ' + tot + ' barang sudah dicek') + '</b><div class="o-bar" style="margin-top:6px"><i style="width:' + pc + '%"></i></div></div>' +
      '<button type="button" class="o-btn' + (F.semuaAman ? ' o2' : '') + '" data-a="semuaAman">' + (F.semuaAman ? '✓ Semua aman (ketuk untuk batal)' : 'Semua aman') + '</button>' +
      '<p class="o-note">"Semua aman" menandai barang yang <b>belum dicek</b> menjadi Lengkap &amp; baik (alat) / Cukup (bahan) di server. Yang ditandai rusak/menipis tidak berubah, dan cek orang lain minggu ini tidak ditimpa.</p></div>';
    ['Alat', 'Bahan'].forEach(function (jn) {
      var idx = []; F.cek.forEach(function (c, i) { if (c.jenis === jn) idx.push(i); });
      h += '<div class="o-card"><b>' + (jn === 'Alat' ? 'Peralatan' : 'Bahan') + '</b>' + (idx.length ? '' : '<div class="o-note">Belum ada data.</div>');
      idx.forEach(function (i) {
        var c = F.cek[i];
        h += '<div class="o-ab"><div><b>' + esc(c.nama) + '</b><br><small>tercatat ' + fmt(c.stok) + ' ' + esc(c.satuan) + '</small></div><div class="o-chips">' +
          CK_ST[jn].map(function (s) { var on = c.status === s[0], auto = !c.status && F.semuaAman && s[2] === ''; return '<button type="button" class="o-c' + (on ? ' on ' + s[2] : auto ? ' auto' : '') + '" data-a="cekSt" data-i="' + i + '" data-v="' + s[0] + '">' + s[1] + '</button>'; }).join('') +
          '<button type="button" class="o-c" style="border-style:dashed" data-a="cekCatat" data-i="' + i + '">' + (c.ket ? 'Catatan ✓' : '+ Catatan') + '</button></div>';
        if (c.status === 'Rusak') h += '<div class="o-lb"><input class="o-fld' + (F.err && F.err['cek|' + i + '|rusak'] ? ' err' : '') + '" data-f="cek|' + i + '|rusak" type="number" inputmode="numeric" min="1" placeholder="Jml" value="' + esc(c.rusak) + '"><span class="o-hint" style="align-self:center">' + esc(c.satuan) + ' rusak</span></div>';
        if (c.status === 'Hilang') h += '<div class="o-lb"><input class="o-fld' + (F.err && F.err['cek|' + i + '|hilang'] ? ' err' : '') + '" data-f="cek|' + i + '|hilang" type="number" inputmode="numeric" min="1" placeholder="Jml" value="' + esc(c.hilang) + '"><span class="o-hint" style="align-self:center">' + esc(c.satuan) + ' hilang</span></div>';
        if (c.catat || c.ket || (c.status && c.status !== 'Baik' && c.status !== 'Cukup')) h += '<input class="o-fld" data-f="cek|' + i + '|ket" maxlength="200" placeholder="Catatan, mis. minta belikan lagi" value="' + esc(c.ket) + '">';
        h += '</div>';
      });
      h += '</div>';
    });
    h += '<div class="o-card">' + txa('catatan', 'Catatan minggu ini', 'mis. Mohon dibelikan polybag 15x20 sebelum penanaman') + '</div>' + simpanBtn() + '</div>';
    EL.isi.innerHTML = h;
  }
  function cekCek() {
    var e = {}, isi = F.cek.filter(function (c) { return c.status; });
    if (!F.tanggal || F.tanggal > ymd()) return 'Tanggal pengecekan tidak boleh melebihi hari ini.';
    if (!isi.length && !F.semuaAman && !String(F.catatan || '').trim()) return 'Pilih status minimal satu barang, atau ketuk "Semua aman".';
    F.cek.forEach(function (c, i) {
      if (c.status === 'Rusak' && !(bulat(c.rusak) && angka(c.rusak) <= c.stok)) e['cek|' + i + '|rusak'] = 1;
      if (c.status === 'Hilang' && !(bulat(c.hilang) && angka(c.hilang) <= c.stok)) e['cek|' + i + '|hilang'] = 1;
    });
    F.err = e; return Object.keys(e).length ? 'Isi jumlah rusak/hilang (1 sampai jumlah tercatat).' : '';
  }
  function argsCek() {
    return { tanggal: F.tanggal, semuaAman: !!F.semuaAman, catatan: String(F.catatan || '').trim(),
      items: F.cek.filter(function (c) { return c.status; }).map(function (c) { return { nama: c.nama, status: c.status, rusak: c.status === 'Rusak' ? Number(c.rusak) : 0, hilang: c.status === 'Hilang' ? Number(c.hilang) : 0, ket: String(c.ket || '').trim() }; }) };
  }
  function judulCek(a) {
    var m = a.items.filter(function (c) { return c.status !== 'Baik' && c.status !== 'Cukup'; }).length;
    return ['Cek mingguan gudang', a.items.length + ' barang dicek' + (m ? ' (' + m + ' perlu tindakan)' : '') + (a.semuaAman ? ' + semua aman' : '') + (a.catatan ? ' + catatan' : '') + ' · ' + tglPendek(a.tanggal)];
  }

  /* ---------------- buka formulir (baru / ubah) ---------------- */
  function bukaForm(v, item) {
    if (v === 'sirkulasi') { F = baruSirkulasi(); if (item) { var a = salin(item.args), J = semuaJenis(); Object.keys(F).forEach(function (k) { if (a[k] != null && k !== 'items') F[k] = a[k]; }); F.items = (a.items && a.items.length ? a.items : [{ jenis: '', jumlah: '' }]).map(function (x) { return J.indexOf(x.jenis) > -1 ? { jenis: x.jenis, lain: '', jumlah: x.jumlah } : { jenis: '__lain', lain: x.jenis, jumlah: x.jumlah }; }); } }
    else if (v === 'workshop') {
      F = baruWorkshop();
      if (item) {
        var w = salin(item.args), J2 = semuaJenis(), Ls = (opsi() || {}).sumber || [];
        ['jenis', 'tanggal', 'jumlah', 'berat', 'jenisBibit', 'bedengan', 'keterangan', 'files'].forEach(function (k) { if (w[k] != null) F[k] = w[k]; });
        if (w.penyebab) F.penyebab = w.penyebab;
        if (w.ukuran) { if (UKURAN.indexOf(w.ukuran) > -1) F.ukuran = w.ukuran; else { F.ukuran = '__lain'; F.ukuranLain = w.ukuran; } }
        if (w.items) F.items = w.items.map(function (x) { return J2.indexOf(x.jenis) > -1 ? { jenis: x.jenis, lain: '', jumlah: x.jumlah } : { jenis: '__lain', lain: x.jenis, jumlah: x.jumlah }; });
        if (w.sumber) F.sumber = w.sumber.map(function (x) { return Ls.indexOf(x.nama) > -1 ? { nama: x.nama, lain: '', kg: x.kg } : { nama: '__lain', lain: x.nama, kg: x.kg }; });
      }
    }
    else if (v === 'absen') {
      F = baruAbsen(item && item.args.grup);
      if (item) {
        F.tanggal = item.args.tanggal; var ada = {};
        F.rows.forEach(function (r) { ada[r.nama.toLowerCase()] = r; });
        item.args.rows.forEach(function (x) { var r = ada[String(x.nama).toLowerCase()]; if (!r) { r = { nama: x.nama, tim: '', saldo: null }; F.rows.push(r); } r.status = x.status; r.lembur = x.lembur || 0; r.lemburKet = x.lemburKet || ''; });
      }
    }
    else if (v === 'cek') {
      F = baruCek();
      if (item) {
        var c = item.args, ada2 = {}; F.tanggal = c.tanggal; F.semuaAman = !!c.semuaAman; F.catatan = c.catatan || '';
        F.cek.forEach(function (r) { ada2[r.nama] = r; });
        c.items.forEach(function (x) { var r = ada2[x.nama]; if (!r) return; r.status = x.status; r.rusak = x.rusak || ''; r.hilang = x.hilang || ''; r.ket = x.ket || ''; });
      }
    }
    F.uidEdit = item ? item.uid : ''; F.kotor = false; F.err = {}; VIEW = v; render(); EL.isi.scrollTop = 0;
  }

  /* ---------------- simpan ke antrian ---------------- */
  function simpan(btn) {
    var v = VIEW, pesan = v === 'sirkulasi' ? cekSirkulasi() : v === 'workshop' ? cekWorkshop() : v === 'absen' ? cekAbsen() : cekCek();
    if (pesan) { render(); var e = document.getElementById('offErr'); if (e) { e.textContent = pesan; } var x = EL.isi.querySelector('.err') || e; if (x && x.scrollIntoView) x.scrollIntoView({ block: 'center' }); return; }
    var o = opsi() || {}, args = v === 'sirkulasi' ? argsSirkulasi() : v === 'workshop' ? argsWorkshop() : v === 'absen' ? argsAbsen() : argsCek();
    var jd = v === 'sirkulasi' ? judulSirkulasi(args) : v === 'workshop' ? judulWorkshop(args) : v === 'absen' ? judulAbsen(args) : judulCek(args);
    var lama = F.uidEdit ? cari(F.uidEdit) : null;
    if (!lama && !(o.akun && o.akun.id)) { var er = document.getElementById('offErr'); if (er) er.textContent = 'Salinan data akun tidak ada (sudah keluar). Buka aplikasi saat ada sinyal dan masuk lagi.'; return; }
    var it = { uid: lama ? lama.uid : buatUid(), fn: FORM_FN[v], args: args, akun: lama ? lama.akun : String(o.akun.id), akunNama: lama ? lama.akunNama : o.akun.nama, judul: jd[0], ket: jd[1], dibuat: lama ? lama.dibuat : Date.now(), diubah: Date.now(), status: 'menunggu', pesan: '' };
    if (btn) btn.disabled = true;
    simpanItem(it).then(function () {
      F = null; VIEW = 'home'; render(); EL.isi.scrollTop = 0;
      toast(lama ? 'Perubahan disimpan · menunggu dikirim' : 'Tersimpan di HP · menunggu dikirim');
      statusKeApp(); kirimBerikut();
    }, function (e) { if (btn) btn.disabled = false; var el = document.getElementById('offErr'); if (el) el.textContent = 'Gagal menyimpan di HP: ' + ((e && e.message) || e) + '. Memori HP mungkin penuh; hapus beberapa foto lalu coba lagi.'; });
  }

  /* ---------------- foto: dikompres seperti di aplikasi (maks. 1280 px, JPEG) ---------------- */
  function kompres(file) {
    return new Promise(function (res, rej) {
      if (!/^image\//.test(file.type || 'image/')) return rej(new Error('File "' + file.name + '" bukan gambar.'));
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        try {
          var sc = Math.min(1, 1280 / Math.max(img.width, img.height)), w = Math.round(img.width * sc), h = Math.round(img.height * sc), c = document.createElement('canvas');
          c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url);
          var d = c.toDataURL('image/jpeg', 0.78); res({ name: String(file.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg', mime: 'image/jpeg', data: d.slice(d.indexOf(',') + 1) });
        } catch (e) { rej(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('Gambar "' + file.name + '" tidak bisa dibaca.')); };
      img.src = url;
    });
  }
  function tambahFoto(el) {
    var maks = Number(el.getAttribute('data-foto')) || 3, files = Array.prototype.slice.call(el.files || [], 0, maks - F.files.length), urut = Promise.resolve();
    files.forEach(function (f) { urut = urut.then(function () { return kompres(f).then(function (p) { F.files.push(p); F.kotor = true; }, function (e) { toast(e.message); }); }); });
    urut.then(render);
  }

  /* ---------------- interaksi ---------------- */
  function yakin(btn, teks, lakukan) {
    if (btn.getAttribute('data-yakin') === '1') { clearTimeout(tYakin); return lakukan(); }
    btn.setAttribute('data-yakin', '1'); btn.textContent = teks; btn.classList.add('yakin');
    clearTimeout(tYakin); tYakin = setTimeout(function () { if (btn.isConnected) { btn.removeAttribute('data-yakin'); btn.classList.remove('yakin'); btn.textContent = btn.getAttribute('data-a') === 'kembali' ? '← Kembali' : 'Hapus'; } }, 3500);
  }
  function klik(e) {
    var b = e.target.closest('[data-a]'); if (!b || !EL.root.contains(b)) return;
    var a = b.getAttribute('data-a'), i = Number(b.getAttribute('data-i')), v = b.getAttribute('data-v'), f = b.getAttribute('data-f');
    if (a === 'app') return H.bukaApp();
    if (a === 'form') return bukaForm(v);
    if (a === 'kembali') { if (F && F.kotor) return yakin(b, 'Keluar tanpa simpan?', function () { F = null; VIEW = 'home'; render(); }); F = null; VIEW = 'home'; return render(); }
    if (a === 'simpan') return simpan(b);
    if (a === 'ubah') { var it = cari(b.getAttribute('data-u')); if (it) bukaForm(FN_FORM[it.fn], it); return; }
    if (a === 'hapus') { var u = b.getAttribute('data-u'); return yakin(b, 'Ketuk lagi untuk hapus', function () { hapusItem(u).then(function () { render(); statusKeApp(); toast('Data dihapus dari HP.'); }); }); }
    if (a === 'ulang') { var x = cari(b.getAttribute('data-u')); if (x) { x.status = 'menunggu'; x.pesan = ''; simpanItem(x).then(function () { render(); statusKeApp(); kirimBerikut(); if (!SY.akun) toast(online() ? 'Akan dikirim setelah aplikasi terbuka & Anda masuk.' : 'Akan dikirim saat ada sinyal.'); }); } return; }
    if (!F) return;
    F.kotor = true;
    if (a === 'pilih') {
      if (f === 'jenis' && VIEW === 'sirkulasi' && F.jenis !== v) { var K = (opsi() || {}).kegiatan || SUB_DEF; F.sub = (K[v] || SUB_DEF[v])[0]; }
      if (f === 'grup' && F.grup !== v) { var t = F.tanggal; F = baruAbsen(v); F.tanggal = t; F.kotor = true; }
      else taruh(f, v);
      return render();
    }
    if (a === 'multi') { var arr = ambil(f) || [], k = arr.indexOf(v); if (k > -1) arr.splice(k, 1); else arr.push(v); taruh(f, arr); return render(); }
    if (a === 'tambahBaris') { F.items.push({ jenis: '', lain: '', jumlah: '' }); return render(); }
    if (a === 'hapusBaris') { if (F.items.length <= 1) return toast('Minimal satu baris.'); F.items.splice(i, 1); return render(); }
    if (a === 'tambahSumber') { if (F.sumber.length < 8) F.sumber.push({ nama: '', lain: '', kg: '' }); return render(); }
    if (a === 'hapusSumber') { if (F.sumber.length <= 1) return toast('Minimal satu sumber.'); F.sumber.splice(i, 1); return render(); }
    if (a === 'hapusFoto') { F.files.splice(i, 1); return render(); }
    if (a === 'status') { var r = F.rows[i]; r.status = r.status === v ? '' : v; if (r.status !== 'Hadir') { r.lembur = 0; r.lemburKet = ''; r.buka = false; } return render(); }
    if (a === 'lembur') { var r2 = F.rows[i]; if (r2.lembur || r2.buka) { r2.lembur = 0; r2.lemburKet = ''; r2.buka = false; } else { r2.buka = true; r2.lembur = 2; } return render(); }
    if (a === 'semuaHadir') { F.rows.forEach(function (r) { if (!r.status) r.status = 'Hadir'; }); return render(); }
    if (a === 'semuaAman') { F.semuaAman = !F.semuaAman; return render(); }
    if (a === 'cekSt') { var c = F.cek[i]; c.status = c.status === v ? '' : v; if (c.status !== 'Rusak') c.rusak = ''; if (c.status !== 'Hilang') c.hilang = ''; if ((c.status === 'Rusak' || c.status === 'Hilang') && !c[c.status.toLowerCase()]) c[c.status.toLowerCase()] = 1; return render(); }
    if (a === 'cekCatat') { F.cek[i].catat = true; render(); var el = EL.isi.querySelector('[data-f="cek|' + i + '|ket"]'); if (el) el.focus(); return; }
  }
  function ubah(e) {
    var t = e.target;
    if (t.hasAttribute('data-foto')) { if (e.type === 'change') tambahFoto(t); return; }
    var f = t.getAttribute('data-f'); if (!f || !F) return;
    taruh(f, t.value); F.kotor = true;
    if (F.err && F.err[f]) { delete F.err[f]; t.classList.remove('err'); }
    if (t.tagName === 'SELECT' && t.getAttribute('data-r') === '1' && e.type === 'change') render();   // pilihan yang mengubah tampilan (jenis lain, ukuran lain)
    else segarkanKecil(f);
  }

  /* ---------------- pengiriman lewat aplikasi (satu per satu) ---------------- */
  function statusKeApp() {
    var n = hitung(), baru = SY.baru;
    if (SY.akun && !n.menunggu && !n.mengirim) SY.baru = 0;
    H.kirim({ type: 'es-antrian', menunggu: n.menunggu + n.mengirim, ditolak: n.ditolak, lain: n.lain, terkirimBaru: (!n.menunggu && !n.mengirim) ? baru : 0 });
    banner();
  }
  function kirimBerikut() {
    if (SY.sedang || !SY.akun || SY.jeda || !online()) return;
    var it = ANT.filter(function (x) { return x.status === 'menunggu' && x.akun === SY.akun; })[0];
    if (!it) { statusKeApp(); return; }
    it.status = 'mengirim'; SY.sedang = it.uid;
    simpanItem(it).then(function () {
      render(); statusKeApp();
      if (!H.kirim({ type: 'es-kirim', item: { uid: it.uid, fn: it.fn, args: it.args, dibuat: it.dibuat, akun: it.akun } })) return gagalSementara(it.uid);
      clearTimeout(SY.timer); SY.timer = setTimeout(function () { gagalSementara(it.uid); }, 100000);   // tidak ada jawaban: coba lagi nanti
    });
  }
  function gagalSementara(uid) {
    if (SY.sedang !== uid) return; SY.sedang = null; clearTimeout(SY.timer);
    var it = cari(uid); if (it) { it.status = 'menunggu'; simpanItem(it).then(function () { render(); statusKeApp(); }); }
    jeda(30000);
  }
  function jeda(ms) { clearTimeout(SY.jeda); SY.jeda = setTimeout(function () { SY.jeda = null; kirimBerikut(); }, ms); }
  function hasil(m) {
    if (!m || m.uid !== SY.sedang) return;
    SY.sedang = null; clearTimeout(SY.timer);
    var it = cari(m.uid); if (!it) return kirimBerikut();
    if (m.ok) {
      it.status = 'terkirim'; it.selesai = Date.now(); SY.baru++;
      var cat = [m.dobel ? 'Sudah tercatat sebelumnya (tidak dicatat dobel)' : 'Tersimpan di server' + (m.ringkas ? ': ' + m.ringkas : '')];
      if (m.lewati && m.lewati.length) cat.push('Dilewati (sudah absen mandiri): ' + m.lewati.join(', '));
      if (m.gagal && m.gagal.length) cat.push('Dilewati: ' + m.gagal.join('; '));
      it.pesan = cat.join(' · ');
      if (it.args && it.args.files && it.args.files.length) { it.foto = it.args.files.length; it.args.files = []; }   // hemat memori HP
    } else if (m.sementara) { it.status = 'menunggu'; it.pesan = ''; jeda(m.sesi ? 600000 : 30000); }
    else if (m.lain) { it.status = 'menunggu'; }
    else { it.status = 'ditolak'; it.pesan = m.pesan || 'Ditolak server.'; }
    simpanItem(it).then(function () { render(); statusKeApp(); kirimBerikut(); });
  }

  /* ---------------- API untuk index.html ---------------- */
  window.OFFLINE = {
    init: function (h) {
      H = h; pasang();
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}   // minta browser tidak menghapus data offline
      return muatAntrian().then(rapikan).then(function () { render(); }, function () {});
    },
    buka: function () { pasang(); EL.root.hidden = false; terbuka = true; muatAntrian().then(render, render); },
    tutup: function () { if (F && F.kotor && VIEW !== 'home') { toast('Simpan atau kembali dulu dari formulir.'); return false; } EL.root.hidden = true; terbuka = false; F = null; VIEW = 'home'; return true; },
    terbuka: function () { return terbuka; },
    diForm: function () { return terbuka && VIEW !== 'home'; },
    opsi: function (o) { if (o && o.akun) { try { localStorage.setItem(KUNCI_OPSI, JSON.stringify(o)); } catch (e) {} if (terbuka && VIEW === 'home') render(); } },
    siap: function (akun) { SY.akun = akun && akun.id ? String(akun.id) : ''; SY.jeda = null; muatAntrian().then(function () { render(); statusKeApp(); kirimBerikut(); }); },
    keluar: function (hapus) { SY.akun = ''; SY.sedang = null; if (hapus) { try { localStorage.removeItem(KUNCI_OPSI); } catch (e) {} } render(); },
    hasil: hasil,
    jaringan: function () { banner(); if (online()) { SY.jeda = null; kirimBerikut(); } },
    jumlah: function () { var n = 0; ANT.forEach(function (x) { if (x.status !== 'terkirim') n++; }); return n; },
    adaOpsi: function () { var o = opsi(); return !!(o && o.akun); }
  };
})();
