'use strict';
// ============================================================
// Manajer izin TAPAK
// - Memeriksa izin Android (lokasi presisi, kamera) setiap aplikasi DIBUKA
//   dan setiap kali KEMBALI ke layar depan (resume).
// - Jika ada yang belum diberikan, tampil dialog penjelasan + tombol "Berikan izin"
//   yang memunculkan permintaan resmi Android.
// - Jika sudah ditolak permanen (Android tidak lagi menampilkan dialog), pengguna
//   diberi petunjuk membuka Pengaturan. Begitu kembali ke TAPAK, izin dicek ulang
//   otomatis dan dialog menutup sendiri bila sudah diizinkan.
// - Fitur yang butuh izin (rekam jejak, kamera) juga meminta izin saat dipakai.
// ============================================================

// true  = tombol "Nanti saja" disembunyikan (pengguna HARUS memberi izin untuk lanjut)
// false = pengguna boleh menunda, tetapi dialog muncul lagi setiap kali app dibuka/kembali aktif
const PERM_STRICT = false;

const PERMS = [
  { id: 'location', ic: 'pin', nama: 'Lokasi presisi (GPS)', plugin: 'Geolocation', key: 'location',
    guna: 'Menampilkan posisi Anda, merekam jejak patroli, dan memberi koordinat pada temuan.' },
  { id: 'camera', ic: 'camera', nama: 'Kamera', plugin: 'Camera', key: 'camera',
    guna: 'Mengambil foto temuan langsung di lapangan.' },
  // Android 13+: tanpa izin ini penanda "sedang merekam" tidak tampil di bilah status saat TAPAK diminimalkan.
  // soft = disarankan, tidak membuat dialog izin muncul sendiri setiap aplikasi dibuka.
  { id: 'notif', ic: 'info', nama: 'Notifikasi', plugin: 'LocalNotifications', key: 'display', soft: true,
    guna: 'Menampilkan penanda “sedang merekam” atau “dijeda” di bilah status saat TAPAK diminimalkan.' }
];

const HINT_SETTINGS = 'Izin masih ditolak. Android berhenti menampilkan permintaan setelah beberapa kali ditolak. ' +
  'Buka <b>Pengaturan HP → Aplikasi → TAPAK → Izin</b>, pilih “Izinkan” ' +
  '(untuk Lokasi: aktifkan juga “Gunakan lokasi presisi”), lalu kembali ke TAPAK.';

let permBusy = false, lastEnd = 0, lastCheck = 0;

// 'ok' = diizinkan, 'no' = belum/ditolak, 'na' = tidak bisa dicek (tidak memblokir)
async function permStatus() {
  const out = {}, cache = {};
  for (const p of PERMS) {
    if (!native) { out[p.id] = 'ok'; continue; }
    const pl = plug(p.plugin);
    if (!pl || !pl.checkPermissions) { out[p.id] = 'na'; continue; }
    try {
      cache[p.plugin] = cache[p.plugin] || await pl.checkPermissions();
      out[p.id] = cache[p.plugin][p.key] === 'granted' ? 'ok' : 'no';
    } catch (e) { out[p.id] = 'na'; }
  }
  return out;
}
// tanpa ids: hanya izin wajib (soft tidak ikut), supaya dialog tidak muncul terus bila notifikasi sengaja ditolak
const missingOf = (st, ids) => PERMS.filter(p => (ids ? ids.includes(p.id) : !p.soft) && st[p.id] === 'no').map(p => p.id);

async function permRequest(ids) {
  const by = {};
  PERMS.filter(p => ids.includes(p.id)).forEach(p => (by[p.plugin] = by[p.plugin] || []).push(p.key));
  permBusy = true;
  try {
    for (const [n, keys] of Object.entries(by)) {
      const pl = plug(n);
      if (!pl || !pl.requestPermissions) continue;
      try { await pl.requestPermissions({ permissions: keys }); } catch (e) { console.warn('izin', n, e); }
    }
  } finally { permBusy = false; lastEnd = Date.now(); }
}

// ---------- tampilan ----------
function permEl() {
  let el = document.getElementById('perm');
  if (!el) { el = document.createElement('div'); el.id = 'perm'; el.hidden = true; document.body.appendChild(el); }
  return el;
}
function hidePerm() { permEl().hidden = true; }
function showPerm(st, hint) {
  const el = permEl();
  el.innerHTML = '<div class="card"><p class="eyebrow">Izin aplikasi</p><h2>Izin diperlukan</h2><div class="rule3"></div>' +
    '<p class="mut">TAPAK membutuhkan izin berikut agar fitur patroli berfungsi. Data Anda tetap tersimpan di HP ini.</p>' +
    PERMS.map(p => `<div class="pitem">${ICO(p.ic)}<span><b>${p.nama}</b><br><small>${p.guna}</small></span>` +
      `<i class="pb ${st[p.id] === 'no' ? 'no' : 'ok'}">${st[p.id] === 'no' ? (p.soft ? 'Disarankan' : 'Belum') : 'Diizinkan'}</i></div>`).join('') +
    `<div class="pitem">${ICO('image')}<span><b>Foto &amp; galeri</b><br><small>Memakai pemilih foto bawaan Android, tanpa izin tambahan. ` +
    'Hanya foto yang Anda pilih yang dibaca.</small></span><i class="pb ok">Otomatis</i></div>' +
    (hint ? `<p class="phint">${hint}</p>` : '') +
    '<button class="btn btn-p wide" id="pgo">Berikan izin</button>' +
    (PERM_STRICT ? '' : '<button class="pskip" id="pskip">Nanti saja</button>') + '</div>';
  el.hidden = false;
  document.getElementById('pgo').addEventListener('click', grantClick);
  const sk = document.getElementById('pskip');
  if (sk) sk.addEventListener('click', () => { hidePerm(); introOnce(); });
}

// ---------- alur ----------
function onPermOk(st) {
  if (st.location === 'ok' && typeof startGPS === 'function') startGPS();
  // rekaman jejak sudah berjalan tetapi pemantau latar belakang belum aktif (izin baru diberikan)
  if (st.location === 'ok' && tracking && typeof bgStart === 'function') bgStart();
}

async function grantClick() {
  if (permBusy) return;
  const miss = missingOf(await permStatus(), PERMS.map(p => p.id));   // dialog meminta semua, termasuk yang disarankan
  if (miss.length) await permRequest(miss);
  const st = await permStatus();
  if (!missingOf(st).length) { hidePerm(); onPermOk(st); if (!missingOf(st, PERMS.map(p => p.id)).length) toast('Semua izin sudah diberikan'); introOnce(); }
  else showPerm(st, HINT_SETTINGS);
}

async function ensurePerms() {
  if (permBusy) return;
  if (!window.flowOn) return;      // izin baru diminta setelah splash dan persetujuan syarat & privasi selesai
  if (!native) { introOnce(); return }
  lastCheck = Date.now();
  const st = await permStatus();
  if (!missingOf(st).length) { hidePerm(); onPermOk(st); introOnce(); }
  else showPerm(st);
}

// Dipanggil fitur yang butuh izin. block=true: batal bila izin tetap ditolak.
window.needPerm = async function (ids, block = true) {
  if (!native) return true;
  let st = await permStatus(), miss = missingOf(st, ids);
  if (!miss.length) return true;
  await permRequest(miss);
  st = await permStatus(); miss = missingOf(st, ids);
  if (!miss.length) { onPermOk(st); return true; }
  if (!block) return true;
  showPerm(st, HINT_SETTINGS);
  return false;
};

// Cek ulang setiap kembali ke aplikasi (abaikan bunyi event saat dialog sistem Android tampil)
function recheck() {
  if (document.visibilityState === 'hidden' || permBusy) return;
  const now = Date.now();
  if (now - lastEnd < 1500 || now - lastCheck < 800) return;
  ensurePerms();
}
document.addEventListener('visibilitychange', recheck);
document.addEventListener('resume', recheck);
window.addEventListener('focus', recheck);

// ---------- pasang ke fitur ----------
window.takePhoto = async function (inputId) {          // 'cam' | 'gal'
  if (inputId === 'cam' && !(await needPerm(['camera']))) return;
  document.getElementById(inputId).click();
};
{
  const tt = window.toggleTrack;                       // mulai rekam jejak butuh lokasi
  window.toggleTrack = async function () {
    if (!tracking && !(await needPerm(['location']))) return;
    tt();
  };
  const lc = window.locate;                            // tombol ◎
  window.locate = function () { if (!fix) needPerm(['location']); lc(); };
}

// Saat aplikasi dibuka: izin diminta setelah pengguna menekan "Jelajahi Peta" di splash (enterApp di ui.js),
// atau setelah sambutan pertama kali ditutup (closeWelcome di atas). Tidak lagi memakai timer otomatis,
// karena splash kini tidak menutup sendiri dan dialog izin akan tertutup olehnya.
