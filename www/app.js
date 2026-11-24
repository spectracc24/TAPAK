'use strict';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const C = window.Capacitor, native = C && C.isNativePlatform && C.isNativePlatform();
const plug = n => C && ((C.Plugins && C.Plugins[n]) || (C.registerPlugin && C.registerPlugin(n)));
// ---------- penyimpanan (IndexedDB) ----------
const dbp = new Promise((r, j) => { const q = indexedDB.open('pm', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv'); q.onsuccess = () => r(q.result); q.onerror = () => j(q.error) });
const kv = {
  get: async k => { const d = await dbp; return new Promise((r, j) => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => r(q.result); q.onerror = () => j(q.error) }) },
  set: async (k, v) => { const d = await dbp; return new Promise((r, j) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => r(); t.onerror = t.onabort = () => j(t.error || new Error('Transaksi dibatalkan')) }) }
};
const kvg = k => kv.get(k).catch(e => { console.error('baca gagal', k, e) });

// ---------- pengaturan & nilai baku (tombol "Kembalikan ke default" memakai DEF) ----------
const DEF = {
  coord: 'dd', unit: 'metric', theme: 'auto',
  showEle: true, showSpd: false, showGain: false,      // info tambahan di layar
  lbl: 'show', symSize: 'm', autoJenis: false,          // tampilan data lapangan
  trkInt: '2', trkCustom: 10, trkMinDist: true,         // rekam jejak: '2' | '30' | 'all' | 'custom'
  maxAcc: 32, accAct: 'warn',                         // batas akurasi horizontal (m, 0 = tanpa batas); warn | block | off
  eleSrc: 'geoid', eleOff: 0
};                        // elevasi: geoid (MSL) | raw ; offset kalibrasi (m)
let F = [], PM = [], S = { ...DEF, base: 'osm' }, HID = { f: new Set(), pm: new Set() }, mode = null, draft = [], fix = null, target = null, cur = null, pick = null, hdg = null;
let tracking = false, paused = false, tcoords = [], tele = [], tbrk = [], tline, tcase, pausedMs = 0, pauseAt = 0, needBrk = false, lastRecT = 0, trkWarn = false;
let saveWarned = false, t0 = 0, bgP = null, trkSaved = 0;
const persist = () => kv.set('F', F).then(() => { saveWarned = false }).catch(e => { console.error('simpan gagal', e); if (!saveWarned) { saveWarned = true; toast('⚠ Data GAGAL tersimpan (penyimpanan penuh?). Ekspor data Anda sekarang.') } });
const saveS = () => kv.set('S', S).catch(e => console.error('simpan pengaturan gagal', e));
const saveH = () => kv.set('H', { f: [...HID.f], pm: [...HID.pm] }).catch(() => { });
const toast = t => { const e = $('#toast'); e.textContent = t; e.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => e.style.display = 'none', 2800) };

// ---------- peta ----------
const map = L.map('map', { zoomControl: false, attributionControl: false }).setView([-0.03, 109.33], 12);
map.createPane('pdf').style.zIndex = 250;
L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
const bases = {
  osm: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }),
  topo: L.tileLayer('https://tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17 }),
  sat: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 })
};
let baseL = null;
function setBase(k) { if (baseL) map.removeLayer(baseL); baseL = bases[k] || null; if (baseL) baseL.addTo(map).bringToBack(); S.base = k; saveS() }
const FL = L.layerGroup().addTo(map), DG = L.layerGroup().addTo(map), GL = L.layerGroup().addTo(map);

// ---------- simbol (bentuk + warna) ----------
const SHAPES = { circle: 'Lingkaran', square: 'Persegi', triangle: 'Segitiga', diamond: 'Belah ketupat', star: 'Bintang', cross: 'Tambah' };
const COLORS = [['#168C91', 'Teal'], ['#D64545', 'Merah'], ['#E8871E', 'Oranye'], ['#E3B505', 'Kuning'], ['#367A55', 'Hijau'], ['#2F6FB5', 'Biru'], ['#7B4FA3', 'Ungu'], ['#343F46', 'Hitam']];
const LNSTY = { solid: ['Tegas', null], dash: ['Putus-putus', '9 8'], dot: ['Titik-titik', '1 8'] };
const SHP_SVG = {
  circle: '<circle cx="12" cy="12" r="8"/>', square: '<rect x="4" y="4" width="16" height="16" rx="2"/>', triangle: '<path d="M12 3.5L21 20H3z"/>',
  diamond: '<path d="M12 2.5L21.5 12 12 21.5 2.5 12z"/>', star: '<path d="M12 2.5l2.9 6.2 6.6.8-4.9 4.6 1.3 6.7-5.9-3.3-5.9 3.3 1.3-6.7L2.5 9.5l6.6-.8z"/>', cross: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>'
};
const shapeSvg = (sh, c, px) => `<svg viewBox="0 0 24 24" width="${px}" height="${px}" aria-hidden="true"><g fill="${c}" stroke="#fff" stroke-width="2.4" stroke-linejoin="round" style="paint-order:stroke">${SHP_SVG[sh] || SHP_SVG.circle}</g></svg>`;
const hashStr = s => { let h = 0; for (let i = 0; i < s.length; i++)h = (h * 31 + s.charCodeAt(i)) >>> 0; return h };
function symOf(f) {
  const s = f.sym || {}; let c = s.c;
  if (!c && S.autoJenis) { const j = ((f.props.custom || {}).Jenis || '').trim().toLowerCase(); if (j) c = COLORS[hashStr(j) % COLORS.length][0] }
  return { sh: s.sh || 'circle', c: c || COLORS[0][0], ln: s.ln || 'solid' }
}
const symPx = () => ({ s: 20, m: 26, l: 34 })[S.symSize] || 26;
const isVis = f => !HID.f.has(f.id);
const parts = (c, brk) => { if (!brk || !brk.length) return [c]; const r = []; let s = 0; for (const b of brk) { r.push(c.slice(s, b)); s = b } r.push(c.slice(s)); return r.filter(p => p.length) };
const ll2 = p => p.map(c => [c[1], c[0]]);
const llParts = (c, brk) => { const p = parts(c, brk).map(ll2); return p.length > 1 ? p : (p[0] || []) };
function draw() {
  FL.clearLayers(); F.filter(isVis).forEach(f => {
    const sy = symOf(f), ll = ll2(f.coords); let l;
    if (f.type == 'Point') {
      const px = symPx();
      l = L.marker(ll[0], { icon: L.divIcon({ className: 'sym', html: shapeSvg(sy.sh, sy.c, px), iconSize: [px, px], iconAnchor: [px / 2, px / 2] }), keyboard: false });
      if (f.props.name) l.bindTooltip(esc(f.props.name), { permanent: true, direction: 'right', offset: [px / 2 - 4, 0], className: 'lt' })
    }
    else {
      const g = llParts(f.coords, f.brk), dash = (LNSTY[sy.ln] || LNSTY.solid)[1], st = { color: sy.c, weight: 4, dashArray: dash, lineCap: dash && sy.ln == 'dot' ? 'round' : undefined };
      (f.type == 'LineString' ? L.polyline : L.polygon)(g, { color: '#fff', weight: 8, opacity: .9, fill: false, interactive: false }).addTo(FL);
      l = f.type == 'LineString' ? L.polyline(g, st) : L.polygon(g, { ...st, fillOpacity: .2 })
    }
    l.on('click', e => { L.DomEvent.stopPropagation(e); edit(f.id) }); l.addTo(FL)
  }); updFab()
}
function applyLbl() { const off = S.lbl == 'hide' || (S.lbl == 'auto' && map.getZoom() < 15); $('#map').classList.toggle('lbl-off', off) }
map.on('zoomend', applyLbl);
// penanda pada tombol lapisan bila ada data/peta PDF yang disembunyikan
function updFab() { const b = $('#fab-layers'); if (b) b.classList.toggle('dot', HID.pm.size > 0 || F.some(f => !isVis(f))) }

// ---------- format koordinat, satuan, elevasi ----------
const dms = (v, p, n) => { const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = ((a - d) * 60 - m) * 60; return `${d}°${m}'${s.toFixed(1)}"${v < 0 ? n : p}` };
function fmt(lat, lon) {
  if (S.coord == 'dms') return dms(lat, 'N', 'S') + ' ' + dms(lon, 'E', 'W');
  if (S.coord == 'utm') { const z = Math.floor((lon + 180) / 6) + 1, p = proj4(`+proj=utm +zone=${z}${lat < 0 ? ' +south' : ''} +datum=WGS84 +units=m +no_defs`, [lon, lat]); return `UTM ${z}${lat < 0 ? 'S' : 'N'} ${p[0].toFixed(0)}E ${p[1].toFixed(0)}N` }
  return lat.toFixed(6) + ', ' + lon.toFixed(6)
}
function fd(m) {
  if (S.unit == 'imperial') { const f = m * 3.28084; return f < 5280 ? f.toFixed(0) + ' ft' : (f / 5280).toFixed(2) + ' mi' }
  if (S.unit == 'nautical') return (m / 1852).toFixed(2) + ' nm'; return m < 1000 ? m.toFixed(0) + ' m' : (m / 1000).toFixed(2) + ' km'
}
function fa(a) {
  if (S.unit == 'imperial') { const ac = a / 4046.856; return ac < 640 ? ac.toFixed(2) + ' acre' : (ac / 640).toFixed(2) + ' mi²' }
  return a < 1e4 ? a.toFixed(0) + ' m²' : a < 1e6 ? (a / 1e4).toFixed(2) + ' ha' : (a / 1e6).toFixed(2) + ' km²'
}
const fe = m => m == null || isNaN(m) ? '–' : S.unit == 'imperial' ? Math.round(m * 3.28084) + ' ft' : Math.round(m) + ' m';
const fdE = m => (m > 0 ? '+' : m < 0 ? '−' : '') + fe(Math.abs(m));   // selisih elevasi bertanda
function fsp(ms) { if (ms == null || isNaN(ms)) return '–'; if (S.unit == 'imperial') return (ms * 2.23694).toFixed(1) + ' mph'; if (S.unit == 'nautical') return (ms * 1.94384).toFixed(1) + ' kn'; return (ms * 3.6).toFixed(1) + ' km/j' }
const fdur = ms => { const s = Math.max(0, Math.floor(ms / 1e3)), p = n => String(n).padStart(2, '0'); return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}` };
const len = c => c.reduce((s, p, i) => i ? s + map.distance([c[i - 1][1], c[i - 1][0]], [p[1], p[0]]) : 0, 0);
const lenF = f => parts(f.coords, f.brk).reduce((s, p) => s + len(p), 0);
function area(c) { let a = 0; const R = 6378137, r = Math.PI / 180; for (let i = 0; i < c.length; i++) { const p = c[i], q = c[(i + 1) % c.length]; a += (q[0] - p[0]) * r * (2 + Math.sin(p[1] * r) + Math.sin(q[1] * r)) } return Math.abs(a * R * R / 2) }
function brg(a, b) { const r = Math.PI / 180, dl = (b[1] - a[1]) * r, y = Math.sin(dl) * Math.cos(b[0] * r), x = Math.cos(a[0] * r) * Math.sin(b[0] * r) - Math.sin(a[0] * r) * Math.cos(b[0] * r) * Math.cos(dl); return (Math.atan2(y, x) / r + 360) % 360 }
const card = d => ['U', 'TL', 'T', 'TG', 'S', 'BD', 'B', 'BL'][Math.round(d / 45) % 8];
// statistik elevasi: naik/turun dihitung dengan ambang 3 m agar derau GPS tidak menggelembungkan angka
function eleStats(el) {
  const v = (el || []).filter(x => x != null && !isNaN(x)); if (v.length < 1) return null;
  let min = Infinity, max = -Infinity, gain = 0, loss = 0, ref = v[0];
  for (const x of v) { if (x < min) min = x; if (x > max) max = x; if (x - ref >= 3) { gain += x - ref; ref = x } else if (ref - x >= 3) { loss += ref - x; ref = x } }
  return { min, max, gain, loss, n: v.length }
}
// tinggi elipsoid WGS84 (bawaan Android) -> elevasi di atas muka laut (EGM96) + offset kalibrasi pengguna
function eleOf(lat, lon, alt) {
  if (alt == null || isNaN(alt)) return null; let e = alt;
  if (S.eleSrc == 'geoid' && window.EGM96) { try { e = alt - EGM96.meanSeaLevel(lat, lon) } catch (x) { } }
  return e + (+S.eleOff || 0)
}

// ---------- akurasi GPS ----------
const accLim = () => S.maxAcc > 0 ? S.maxAcc : Infinity;
const accBad = () => !!(fix && fix.t && fix.acc > accLim());
// true = boleh lanjut memakai posisi GPS saat ini (untuk menandai titik dsb.)
async function gpsGuard() {
  if (!fix || !fix.t) { if (window.needPerm) needPerm(['location']); toast('GPS belum siap'); return false }
  if (!accBad() || S.accAct == 'off') return true;
  const m = `Akurasi GPS saat ini ±${Math.round(fix.acc)} m, lebih buruk dari batas ${S.maxAcc} m. Posisi bisa meleset dari lokasi sebenarnya.`;
  if (S.accAct == 'block') { toast(m + '\nTunggu sinyal membaik, atau ubah batas di Lainnya → Pengaturan.'); return false }
  return dlg({ title: 'Akurasi GPS rendah', body: esc(m), ok: 'Tetap pakai', cancel: 'Tunggu dulu' })
}

// ---------- GPS, kompas, HUD ----------
let gpsMsg = 'Mencari GPS… (pergi ke tempat terbuka)', gpsOn = false;
const applyFix = (lat, lon, acc, hd, sp, alt, altAcc, ts) => { fix = { lat, lon, acc, hd, sp, alt, altAcc, ele: eleOf(lat, lon, alt), ts: ts || Date.now(), t: Date.now() }; kv.set('last', fix).catch(() => { }); onFix() };
let gpsWatch = null, gpsRetry = 0;
function watchGPS(G, cb) {
  // Capacitor 8: 'timeout' berlaku untuk watchPosition dan 'interval' bawaannya = timeout -> atur eksplisit,
  // lalu pasang ulang watch bila berhenti karena galat agar GPS tidak mati diam-diam.
  gpsWatch = G.watchPosition({ enableHighAccuracy: true, timeout: 120000, maximumAge: 0, interval: 2000, minimumUpdateInterval: 1000 }, (p, e) => {
    if (p) { gpsRetry = 0; cb(p); return }
    if (e && !fix) { gpsMsg = 'GPS belum mendapat sinyal. Pastikan Lokasi HP aktif & berada di area terbuka.'; hud() }
    if (e && gpsRetry < 30) { gpsRetry++; const old = gpsWatch; gpsWatch = null; Promise.resolve(old).then(id => id != null && G.clearWatch({ id })).catch(() => { }); setTimeout(() => { if (!gpsWatch) watchGPS(G, cb) }, 3000) }
  });
  gpsWatch.catch(() => { gpsWatch = null; gpsOn = false })
}
async function startGPS() {
  const G = plug('Geolocation');
  const cb = p => { if (p) { const c = p.coords; applyFix(c.latitude, c.longitude, c.accuracy, c.heading, c.speed, c.altitude, c.altitudeAccuracy, p.timestamp) } };
  if (G && native) {
    if (gpsOn) return;
    let st; try { st = await G.checkPermissions() } catch (e) { st = { location: 'granted' } }
    if (st.location !== 'granted' && st.coarseLocation !== 'granted') { gpsMsg = 'Izin lokasi belum diberikan.'; hud(); return }
    if (st.location !== 'granted') { gpsMsg = 'Lokasi hanya "perkiraan". Aktifkan "Gunakan lokasi presisi" di Pengaturan > Aplikasi > TAPAK > Izin.'; hud() }
    gpsOn = true;
    G.getCurrentPosition({ enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 }).then(cb).catch(() => { });
    watchGPS(G, cb)
  } else if (navigator.geolocation && !gpsOn) { gpsOn = true; navigator.geolocation.watchPosition(cb, () => { }, { enableHighAccuracy: true }) }
}
let gm, gc, tgl;
function onFix() {
  const ll = [fix.lat, fix.lon];
  if (!gm) { gm = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 3, fillColor: '#17324D', fillOpacity: 1 }).addTo(GL); gc = L.circle(ll, { radius: fix.acc, weight: 1, color: '#168C91', fillColor: '#168C91', fillOpacity: .12 }).addTo(GL) }
  else { gm.setLatLng(ll); gc.setLatLng(ll).setRadius(fix.acc) }
  if (tracking && !paused) recTrack();
  if (fix.hd != null && fix.sp > 1) setHdg(fix.hd);
  if (target) { if (tgl) map.removeLayer(tgl); tgl = L.polyline([ll, [target.lat, target.lon]], { color: '#168C91', weight: 3, dashArray: '6 8' }).addTo(map) }
  hud(); if (window.trackUI) trackUI()
}
function hud() { } // diganti oleh ui.js
function setTarget(lat, lon, name, ele) { target = { lat, lon, name, ele: ele ?? null }; hud(); if (fix) onFix() }
function setHdg(h) { hdg = h; $('#ar').style.transform = `rotate(${h}deg)`; $('#hd').textContent = Math.round(h) + '° ' + card(h) }
addEventListener('deviceorientationabsolute', e => { if (e.alpha != null) setHdg((360 - e.alpha) % 360) }, true);
function locate() { if (fix) map.setView([fix.lat, fix.lon], Math.max(map.getZoom(), 16)); else toast('GPS belum mendapat sinyal') }
let pm; function setPick(ll) { pick = ll; if (pm) map.removeLayer(pm); pm = L.circleMarker(ll, { radius: 7, color: '#17324D', weight: 3, fillColor: '#fff', fillOpacity: 1 }).addTo(map); hud() }

// ---------- track (tetap merekam saat layar dikunci / aplikasi diminimalkan; bisa dijeda) ----------
// Android menghentikan GPS WebView begitu aplikasi di latar belakang. Maka saat merekam, TAPAK menjalankan
// layanan latar depan (foreground service) lewat plugin @capacitor-community/background-geolocation,
// dengan notifikasi permanen. Saat DIJEDA, GPS dimatikan (hemat baterai) dan diganti notifikasi "dijeda".
// Titik juga disimpan ke IndexedDB berkala agar jejak selamat bila aplikasi tertutup.
const BG = () => native && plug('BackgroundGeolocation'), LN = () => native && plug('LocalNotifications');
const trkIvMs = () => S.trkInt == 'all' ? 0 : S.trkInt == '30' ? 30000 : S.trkInt == 'custom' ? Math.max(1, +S.trkCustom || 2) * 1000 : 2000;
function bgStart() {
  const B = BG(); if (!B) { if (native) toast('Rekam latar belakang tidak tersedia di build ini'); return }
  if (bgP || paused) return;
  bgP = B.addWatcher({ backgroundTitle: 'TAPAK sedang merekam jejak', backgroundMessage: 'Ketuk untuk membuka TAPAK · Spectra CC', requestPermissions: false, stale: false, distanceFilter: 0 }, (l, e) => {
    if (e) { if (e.code === 'NOT_AUTHORIZED') { toast('Izin lokasi diperlukan agar rekaman tetap jalan di latar belakang'); bgStop() } return }
    if (l) applyFix(l.latitude, l.longitude, l.accuracy, l.bearing, l.speed, l.altitude, l.altitudeAccuracy, l.time)
  }).catch(err => { bgP = null; console.error('bg watcher', err); toast('Rekam di latar belakang gagal aktif. Biarkan TAPAK tetap terbuka.') })
}
async function bgStop() { const B = BG(), p = bgP; bgP = null; if (!B || !p) return; try { const id = await p; if (id != null) await B.removeWatcher({ id }) } catch (e) { console.error('bg stop', e) } }
// notifikasi "dijeda" (selama jeda tidak ada layanan latar depan, jadi penanda ini yang mengingatkan pengguna)
async function pauseNote(on) {
  const L_ = LN(); if (!L_) return; try {
    if (on) await L_.schedule({ notifications: [{ id: 7001, title: 'TAPAK · rekaman DIJEDA', body: 'Ketuk untuk membuka TAPAK lalu lanjutkan atau hentikan rekaman.', ongoing: true, autoCancel: false, smallIcon: 'ic_stat_tapak' }] });
    else await L_.cancel({ notifications: [{ id: 7001 }] })
  } catch (e) { console.warn('notifikasi jeda', e) }
}
// Android 13+: tanpa izin notifikasi, penanda "sedang merekam" tidak tampil di bilah status
async function askNotif() { if (window.needPerm) await needPerm(['notif'], false) }
function trkLL() { return llParts(tcoords, tbrk) }
function saveTrk(force) { const n = Date.now(); if (!force && n - trkSaved < 8000) return; trkSaved = n; kv.set('trk', { t0, coords: tcoords, ele: tele, brk: tbrk, paused, pausedMs, pauseAt, needBrk, lastRecT }).catch(() => { }) }
function recTrack() {
  if (!fix || !fix.t) return;
  if (fix.acc > accLim()) { if (!trkWarn) { trkWarn = true; if (window.trackUI) trackUI() } return }
  if (trkWarn) { trkWarn = false }
  const now = fix.ts || Date.now(), iv = trkIvMs();
  if (lastRecT && iv && now - lastRecT < iv - 150) return;          // belum waktunya mencatat
  if (lastRecT && !iv && now - lastRecT < 400) return;            // "semua fix": buang duplikat dari dua pemantau GPS
  const l = tcoords[tcoords.length - 1];
  if (l && S.trkMinDist && S.trkInt !== 'all' && map.distance([l[1], l[0]], [fix.lat, fix.lon]) < 3) return; // diam di tempat
  if (needBrk && tcoords.length) { tbrk.push(tcoords.length) } needBrk = false;
  tcoords.push([fix.lon, fix.lat]); tele.push(fix.ele == null ? null : +fix.ele.toFixed(1)); lastRecT = now;
  const g = trkLL(); tline.setLatLngs(g); if (tcase) tcase.setLatLngs(g); saveTrk()
}
function startTrack(st) {
  st = st || {}; tracking = true; tcoords = st.coords || []; tele = st.ele || tcoords.map(() => null); tbrk = st.brk || []; t0 = st.t0 || Date.now();
  paused = !!st.paused; pausedMs = st.pausedMs || 0; pauseAt = st.pauseAt || 0; needBrk = !!st.needBrk; lastRecT = st.lastRecT || 0; trkWarn = false;
  // dilanjutkan setelah aplikasi sempat tertutup lama: jangan hubungkan titik lama ke titik baru dengan garis lurus
  if (st.coords && !paused && lastRecT && Date.now() - lastRecT > 12e4) needBrk = true;
  if (tline) map.removeLayer(tline); if (tcase) map.removeLayer(tcase);
  const g = trkLL(); tcase = L.polyline(g, { color: '#fff', weight: 9, opacity: .9, interactive: false }).addTo(map);
  tline = L.polyline(g, { color: paused ? '#C98A00' : '#367A55', weight: 5 }).addTo(map); saveTrk(true);
  if (paused) pauseNote(true); else bgStart()
}
function pauseTrack() { if (!tracking || paused) return; paused = true; pauseAt = Date.now(); tline.setStyle({ color: '#C98A00' }); bgStop(); pauseNote(true); saveTrk(true); if (window.trackUI) trackUI(); toast('Rekaman dijeda. GPS dimatikan sementara.') }
function resumeTrack() {
  if (!tracking || !paused) return; pausedMs += Date.now() - pauseAt; paused = false; pauseAt = 0; needBrk = tcoords.length > 0; lastRecT = 0;
  tline.setStyle({ color: '#367A55' }); pauseNote(false); bgStart(); saveTrk(true); if (window.trackUI) trackUI(); toast('Rekaman dilanjutkan')
}
const trkElapsed = () => (paused ? pauseAt : Date.now()) - t0 - pausedMs;
async function endTrack() {
  const t1 = Date.now(), dur = trkElapsed(), res = { coords: tcoords, ele: tele, brk: tbrk, t0, t1, dur };
  tracking = false; paused = false; if (tline) { map.removeLayer(tline); tline = null } if (tcase) { map.removeLayer(tcase); tcase = null }
  tcoords = []; tele = []; tbrk = []; await bgStop(); pauseNote(false); trkSaved = 0; kv.set('trk', null).catch(() => { }); return res
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && tracking) saveTrk(true) });

// ---------- menggambar & mengukur ----------
function startMode(m) { closeSheet(); mode = m; draft = []; DG.clearLayers(); $('#dbar').hidden = false; $('#dinfo').textContent = m == 'point' ? 'Ketuk peta untuk menaruh titik' : 'Ketuk peta untuk menambah vertex' }
function measText() {
  if (draft.length < 2) return 'Ketuk peta untuk menambah vertex';
  if (mode == 'polygon' || mode == 'marea') return draft.length > 2 ? `Luas ${fa(area(draft))} • Keliling ${fd(len([...draft, draft[0]]))}` : `Panjang ${fd(len(draft))}`; return `Panjang ${fd(len(draft))}`
}
function redrawDraft() {
  DG.clearLayers(); const ll = draft.map(c => [c[1], c[0]]); ll.forEach(p => L.circleMarker(p, { radius: 5, color: '#17324D', weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(DG));
  if (ll.length > 1) ((mode == 'polygon' || mode == 'marea') && ll.length > 2 ? L.polygon : L.polyline)(ll, { color: '#168C91', weight: 3, dashArray: '6 8' }).addTo(DG);
  $('#dinfo').textContent = measText()
}
const undo = () => { draft.pop(); redrawDraft() };
function cancel() { mode = null; draft = []; DG.clearLayers(); $('#dbar').hidden = true }
function finish() {
  const m = mode, d = draft.slice();
  if (m == 'line' || m == 'polygon') { if (d.length < (m == 'line' ? 2 : 3)) return toast('Vertex kurang'); cancel(); newF(m == 'line' ? 'LineString' : 'Polygon', d) } else cancel()
}
map.on('click', e => {
  const p = [e.latlng.lng, e.latlng.lat];
  if (mode == 'point') { cancel(); newF('Point', [p]); return }
  if (mode) { draft.push(p); redrawDraft(); return }
  setPick(e.latlng)
});
// extra: {ele:[..], acc, brk:[..], trk:{t0,t1,dur}} untuk objek dari GPS / rekaman jejak
function newF(type, coords, props, extra) { const f = { id: Date.now(), type, coords, props: { name: '', desc: '', custom: {}, ...props }, photos: [], ...(extra || {}) }; F.push(f); persist(); draw(); edit(f.id) }
// tandai posisi GPS saat ini (dengan elevasi & akurasi), setelah pemeriksaan batas akurasi
async function markHere() {
  if (!await gpsGuard()) return; closeSheet();
  newF('Point', [[fix.lon, fix.lat]], null, { ele: [fix.ele == null ? null : +fix.ele.toFixed(1)], acc: +fix.acc.toFixed(1) })
}
const gf = id => F.find(f => f.id == id);
// ---------- editor atribut & foto ----------
function grab() {
  const f = gf(cur); if (!f || !$('#en')) return; f.props.name = $('#en').value; f.props.desc = $('#ed').value; const c = {};
  document.querySelectorAll('#cu .r').forEach(r => { const k = r.children[0].value.trim(); if (k) c[k] = r.children[1].value }); f.props.custom = c; persist(); draw()
}
async function delF() { if (!await dlg({ title: 'Hapus objek ini?', body: 'Objek beserta foto lampirannya akan dihapus permanen.', ok: 'Hapus', danger: true })) return; F = F.filter(f => f.id != cur); HID.f.delete(cur); saveH(); persist(); draw(); closeSheet() }
function delPhoto(i) { grab(); gf(cur).photos.splice(i, 1); persist(); edit(cur) }
function setSym(ids, patch) { ids.forEach(id => { const f = gf(id); if (!f) return; f.sym = { ...(f.sym || {}), ...patch }; if (patch.reset) delete f.sym }); persist(); draw() }
function readGPS(url) {
  try {
    const g = piexif.load(url).GPS, h = piexif.GPSHelper; if (g[piexif.GPSIFD.GPSLatitude] && g[piexif.GPSIFD.GPSLongitude])
      return [h.dmsRationalToDeg(g[piexif.GPSIFD.GPSLatitude], g[piexif.GPSIFD.GPSLatitudeRef]), h.dmsRationalToDeg(g[piexif.GPSIFD.GPSLongitude], g[piexif.GPSIFD.GPSLongitudeRef])]
  } catch (e) { } return null
}
function writeGPS(url, lat, lon) {
  try {
    let ex; try { ex = piexif.load(url) } catch (e) { ex = { '0th': {}, Exif: {}, GPS: {} } } const G = piexif.GPSIFD, g = {};
    g[G.GPSLatitudeRef] = lat < 0 ? 'S' : 'N'; g[G.GPSLatitude] = piexif.GPSHelper.degToDmsRational(Math.abs(lat));
    g[G.GPSLongitudeRef] = lon < 0 ? 'W' : 'E'; g[G.GPSLongitude] = piexif.GPSHelper.degToDmsRational(Math.abs(lon)); ex.GPS = g; return piexif.insert(piexif.dump(ex), url)
  } catch (e) { return url }
}
async function addPhoto(inp) {
  const file = inp.files[0]; inp.value = ''; if (!file) return; grab(); const f = gf(cur);
  const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file) });
  let pos = readGPS(url), src = 'exif';
  if (!pos) { if (fix && Date.now() - fix.t < 12e4) { pos = [fix.lat, fix.lon]; src = 'gps' } else { pos = [f.coords[0][1], f.coords[0][0]]; src = 'objek' } }
  const img = new Image(); img.src = url; await img.decode(); const k = Math.min(1, 1600 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
  cv.width = img.width * k; cv.height = img.height * k; cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  const data = writeGPS(cv.toDataURL('image/jpeg', .85), pos[0], pos[1]), id = Date.now();
  f.photos.push({ id, name: `foto_${id}.jpg`, data, lat: pos[0], lon: pos[1], src, time: new Date().toISOString() }); persist(); edit(cur); toast('Foto tersimpan + geotag (' + src + ')')
}
// ---------- GeoPDF (georeferensi & warp: lihat georef.js, diuji di test/georef.test.js) ----------
const MAX_PDF = 100 * 1048576, isPDF = b => new TextDecoder('latin1').decode(new Uint8Array(b, 0, Math.min(1024, b.byteLength))).includes('%PDF-');
const PL = {};
// batas tampil = batas dasar + geseran manual (dx,dy dalam meter Mercator)
const pmBounds = m => { const a = Georef.merc(m.bounds[0][1], m.bounds[0][0]), b = Georef.merc(m.bounds[1][1], m.bounds[1][0]), dx = m.dx || 0, dy = m.dy || 0, s = Georef.unmerc(a[0] + dx, a[1] + dy), n = Georef.unmerc(b[0] + dx, b[1] + dy); return [[s[1], s[0]], [n[1], n[0]]] };
async function importPDF(file) {
  if (!file) return; if (file.size > MAX_PDF) return toast('Berkas terlalu besar (maksimal ' + MAX_PDF / 1048576 + ' MB)'); toast('Memproses PDF… (bisa beberapa detik)');
  try {
    const buf = await file.arrayBuffer(); if (!isPDF(buf)) throw 'Berkas ini bukan PDF';
    const pdfjsLib = window.pdfjsLib || await window.pdfjsReady;   // PDF.js dimuat sebagai modul ES (lihat index.html)
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.mjs';
    const pdf = await pdfjsLib.getDocument({ data: buf.slice(0), isEvalSupported: false, enableXfa: false, wasmUrl: 'lib/wasm/' }).promise, page = await pdf.getPage(1);

    // pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
    // const pdf = await pdfjsLib.getDocument({ data: buf.slice(0), isEvalSupported: false, enableXfa: false }).promise, page = await pdf.getPage(1);
    const info = await Georef.parse(new Uint8Array(buf), page.ref && page.ref.num);
    if (!info.chosen) throw 'PDF tidak punya georeferensi terbaca. Butuh GeoPDF: ArcMap centang "Export Map Georeference Information", QGIS centang "Create Geospatial PDF".';
    const model = Georef.buildModel(info.chosen), v1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: Math.min(4, 3600 / Math.max(v1.width, v1.height)) }), cv = document.createElement('canvas');
    cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
    const cx = cv.getContext('2d', { willReadFrequently: true }); await page.render({ canvasContext: cx, viewport: vp, background: '#ffffff' }).promise;
    const src = cx.getImageData(0, 0, cv.width, cv.height), o = Georef.warp({ data: src.data, w: cv.width, h: cv.height }, vp.transform, model);
    const oc = document.createElement('canvas'); oc.width = o.W; oc.height = o.H; oc.getContext('2d').putImageData(new ImageData(o.data, o.W, o.H), 0, 0);
    const v = info.chosen, geo = {
      crs: model.crs.label, exact: model.exact, rms: +model.rms.toFixed(2), maxErr: +model.maxErr.toFixed(2), n: model.n, warn: model.warn, res: +o.ps.toFixed(2),
      viewports: info.viewports.length, chosen: { name: v.name, bbox: v.bbox, gcs: { type: v.gcs.type, epsg: v.gcs.epsg, wkt: v.gcs.wkt && v.gcs.wkt.slice(0, 600) }, gpts: v.gpts, lpts: v.lpts }
    };
    const m = { id: Date.now(), name: file.name, bounds: o.bounds, img: oc.toDataURL('image/webp', .85), op: 1, dx: 0, dy: 0, geo };
    PM.push(m); try { await kv.set('PM', PM) } catch (e) { PM.pop(); throw 'Penyimpanan tidak cukup untuk peta ini' }
    showPM(m); map.fitBounds(pmBounds(m));
    toast(model.warn ? 'Peta PDF dimuat, tetapi: ' + model.warn : model.rms > 5 ? 'Peta PDF dimuat. Peringatan: titik kontrol georeferensi tidak konsisten (galat ' + model.rms.toFixed(0) + ' m)' : 'Peta PDF dimuat · ' + model.crs.label + ' · galat ±' + model.rms.toFixed(1) + ' m');
    pLayers()
  } catch (e) { toast('Gagal: ' + (e.message || e)); console.error(e) }
}
function showPM(m) { PL[m.id] = L.imageOverlay(m.img, pmBounds(m), { pane: 'pdf', opacity: m.op }); if (!HID.pm.has(m.id)) PL[m.id].addTo(map) }
const pmVis = id => !HID.pm.has(id);
function togglePM(id) { const l = PL[id]; if (!l) return; if (pmVis(id)) { HID.pm.add(id); map.removeLayer(l) } else { HID.pm.delete(id); l.addTo(map) } saveH(); updFab(); if (window.pLayers) pLayers(true) }
function opPM(id, v) { PL[id].setOpacity(+v); PM.find(m => m.id == id).op = +v; kv.set('PM', PM) }
// geser manual (kalibrasi): east/north dalam meter di tanah
function nudgePM(id, east, north) {
  const m = PM.find(x => x.id == id); if (!m) return; const lat = (m.bounds[0][0] + m.bounds[1][0]) / 2, k = 1 / Math.cos(lat * Math.PI / 180);
  m.dx = (m.dx || 0) + east * k; m.dy = (m.dy || 0) + north * k; PL[id].setBounds(pmBounds(m)); kv.set('PM', PM).catch(() => { }); if (window.pNudge) pNudge(id, true)
}
function resetPM(id) { const m = PM.find(x => x.id == id); if (!m) return; m.dx = 0; m.dy = 0; PL[id].setBounds(pmBounds(m)); kv.set('PM', PM).catch(() => { }); if (window.pNudge) pNudge(id, true) }
function pmOffset(m) { const lat = (m.bounds[0][0] + m.bounds[1][0]) / 2, c = Math.cos(lat * Math.PI / 180); return { e: (m.dx || 0) * c, n: (m.dy || 0) * c } }
function copyGeo(id) {
  const m = PM.find(x => x.id == id); if (!m) return; const t = JSON.stringify({ app: 'TAPAK ' + (window.APP_VER || ''), file: m.name, bounds: m.bounds, offsetM: pmOffset(m), geo: m.geo || null }, null, 1);
  (navigator.clipboard && navigator.clipboard.writeText(t).then(() => toast('Info georeferensi disalin')).catch(() => toast('Gagal menyalin'))) || toast('Penyalinan tidak didukung')
}
async function delPM(id) { if (!await dlg({ title: 'Hapus peta PDF?', body: 'Peta ini akan dihapus dari TAPAK. Data lapangan Anda tidak terpengaruh.', ok: 'Hapus', danger: true })) return; if (PL[id]) { map.removeLayer(PL[id]); delete PL[id] } PM = PM.filter(m => m.id != id); HID.pm.delete(id); saveH(); await kv.set('PM', PM); updFab(); pLayers(true) }
// ---------- ekspor: simpan ke perangkat / bagikan, semua atau sebagian data ----------
const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}` };
async function purgeExports() {
  if (!native) return; try {
    const Filesystem = plug('Filesystem'), r = await Filesystem.readdir({ path: '', directory: 'CACHE' });
    for (const f of r.files || []) { const nm = f.name || f; if (/^patroli.*\.(geojson|kmz|zip)$/.test(nm)) await Filesystem.deleteFile({ path: nm, directory: 'CACHE' }).catch(() => { }) }
  } catch (e) { }
}
const MIME = { geojson: 'application/geo+json', kmz: 'application/vnd.google-earth.kmz', zip: 'application/zip' };
// how: 'save' = simpan ke perangkat (dialog "Simpan sebagai" Android), 'share' = menu Bagikan
async function out(name, blob, how) {
  if (!native) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); toast('Berkas diunduh: ' + name); return true }
  const b64 = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(blob) });
  const Filesystem = plug('Filesystem'), w = await Filesystem.writeFile({ path: name, data: b64, directory: 'CACHE' });
  if (how == 'share') { await plug('Share').share({ title: name, url: w.uri }); return true }
  const FS = plug('FileSaver');
  if (FS) {
    try { await FS.save({ path: w.uri, name, mime: MIME[name.split('.').pop()] || 'application/octet-stream' }); toast('Tersimpan ✓\n' + name); return true }
    catch (e) { if (e && e.code === 'CANCELLED') { toast('Penyimpanan dibatalkan'); return false } console.warn('FileSaver gagal', e) }
  }
  // cadangan bila pemilih berkas tidak tersedia: folder Dokumen/TAPAK
  try { await Filesystem.writeFile({ path: 'TAPAK/' + name, data: b64, directory: 'DOCUMENTS', recursive: true }); toast('Tersimpan di Dokumen/TAPAK\n' + name); return true } catch (e) { console.warn('Documents gagal', e) }
  toast('Gagal menyimpan ke perangkat. Pakai "Bagikan" lalu pilih Files atau Drive.'); return false
}
const zOf = (f, i) => f.ele && f.ele[i] != null ? f.ele[i] : null;
function geom(f, z) {
  const all = f.coords.map((p, i) => z && zOf(f, i) != null ? [p[0], p[1], zOf(f, i)] : [p[0], p[1]]);
  if (f.type == 'Point') return { type: 'Point', coordinates: all[0] };
  if (f.type == 'Polygon') return { type: 'Polygon', coordinates: [[...all, all[0]]] };
  const ps = parts(all, f.brk); return ps.length > 1 ? { type: 'MultiLineString', coordinates: ps } : { type: 'LineString', coordinates: all }
}
function featProps(f, trunc, photos) {
  const p = { nama: f.props.name, deskripsi: f.props.desc };
  for (const [k, v] of Object.entries(f.props.custom)) p[trunc ? k.slice(0, 10) : k] = v;
  const sy = symOf(f); p.simbol = f.type == 'Point' ? sy.sh : f.type == 'LineString' ? sy.ln : 'area'; p.warna = sy.c;
  if (f.type == 'Point') { if (zOf(f, 0) != null) p.elevasi = +zOf(f, 0).toFixed(1); if (f.acc != null) p.akurasi = f.acc }
  else if (f.type == 'LineString') { p.panjang_m = +lenF(f).toFixed(1); const st = eleStats(f.ele); if (st) { p.naik_m = +st.gain.toFixed(1); p.turun_m = +st.loss.toFixed(1) } if (f.trk) p.durasi_s = Math.round(f.trk.dur / 1000) }
  else { p.luas_m2 = +area(f.coords).toFixed(1); p.kel_m = +len([...f.coords, f.coords[0]]).toFixed(1) }
  p.foto = photos ? f.photos.map(x => x.name).join(';') : ''; return p
}
const gj = (list, o) => ({ type: 'FeatureCollection', features: list.map(f => ({ type: 'Feature', properties: featProps(f, o.trunc, o.photos), geometry: geom(f, o.z) })) });
const kmlC = (hex, a = 'ff') => a + hex.slice(5, 7) + hex.slice(3, 5) + hex.slice(1, 3);
async function exportData(fmt, how, list, photos) {
  if (!list.length) return toast('Tidak ada data yang dipilih untuk diekspor');
  const base = 'patroli_' + stamp();
  try {
    if (fmt == 'geojson') return await out(base + '.geojson', new Blob([JSON.stringify({ ...gj(list, { photos, z: true }), generator: 'TAPAK - Spectra CC (Spectra Citra Cendekia)' }, null, 1)], { type: 'application/geo+json' }), how);
    if (fmt == 'kmz') {
      const z = new JSZip(); let k = '<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Patroli</name><description>Dibuat dengan TAPAK · Spectra CC (Spectra Citra Cendekia)</description>';
      list.forEach(f => {
        const sy = symOf(f), co = f.coords.map((c, i) => c[0] + ',' + c[1] + ',' + (zOf(f, i) ?? 0)), ring = [...co, co[0]].join(' ');
        const ln = (p) => `<LineString><coordinates>${p.join(' ')}</coordinates></LineString>`;
        let g; if (f.type == 'Point') g = `<Point><coordinates>${co[0]}</coordinates></Point>`;
        else if (f.type == 'Polygon') g = `<Polygon><outerBoundaryIs><LinearRing><coordinates>${ring}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
        else { const ps = parts(co, f.brk); g = ps.length > 1 ? `<MultiGeometry>${ps.map(ln).join('')}</MultiGeometry>` : ln(co) }
        const stl = f.type == 'Point' ? `<Style><IconStyle><color>${kmlC(sy.c)}</color><scale>1.1</scale><Icon><href>https://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle></Style>`
          : `<Style><LineStyle><color>${kmlC(sy.c)}</color><width>3</width></LineStyle><PolyStyle><color>${kmlC(sy.c, '55')}</color></PolyStyle></Style>`;
        const ex = { ...f.props.custom }; if (zOf(f, 0) != null && f.type == 'Point') ex.Elevasi = zOf(f, 0).toFixed(1) + ' m'; if (f.acc != null) ex['Akurasi GPS'] = '±' + f.acc + ' m'; ex.Simbol = f.type == 'Point' ? SHAPES[sy.sh] : LNSTY[sy.ln][0];
        const ed = Object.entries(ex).map(([a, b]) => `<Data name="${esc(a)}"><value>${esc(b)}</value></Data>`).join('');
        const im = photos ? f.photos.map(p => { z.file('files/' + p.name, p.data.split(',')[1], { base64: true }); return `<img src="files/${p.name}" width="400"/>` }).join('') : '';
        k += `<Placemark><name>${esc(f.props.name || f.type)}</name><description><![CDATA[${esc(f.props.desc || '').replace(/\n/g, '<br/>')}<br/>${im}]]></description>${stl}<ExtendedData>${ed}</ExtendedData>${g}</Placemark>`
      });
      z.file('doc.kml', k + '</Document></kml>'); return await out(base + '.kmz', await z.generateAsync({ type: 'blob' }), how)
    }
    if (fmt == 'shp') {
      if (!window.shpwrite) return toast('Modul SHP tidak termuat');
      // shp-write 0.4.3 menggabungkan SEMUA jalur menjadi satu record multi-part (atribut tetap satu baris per jalur, jadi tidak sinkron).
      // Titik & area ditulis lewat zip() biasa; jalur ditulis lewat write() tingkat rendah: satu record per jalur,
      // jejak yang pernah dijeda menjadi satu record multi-part.
      const all = gj(list, { trunc: true, photos }), isL = f => /LineString/.test(f.geometry.type), lines = all.features.filter(isL), rest = { type: 'FeatureCollection', features: all.features.filter(f => !isL(f)) };
      const b64 = await shpwrite.zip(rest, { folder: 'patroli', types: { point: 'titik', polygon: 'poligon' } }), z = await JSZip.loadAsync(b64, { base64: true });
      if (lines.length) await new Promise((res, rej) => {
        try {
          shpwrite.write(lines.map(f => f.properties), 'POLYLINE', lines.map(f => f.geometry.type == 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates), (err, files) => {
            if (err) return rej(err); const d = z.folder('patroli'); for (const e of ['shp', 'shx', 'dbf']) d.file('garis.' + e, files[e].buffer, { binary: true }); d.file('garis.prj', files.prj); res()
          })
        } catch (e) { rej(e) }
      });
      if (photos) list.forEach(f => f.photos.forEach(p => z.file('patroli/foto/' + p.name, p.data.split(',')[1], { base64: true })));
      return await out(base + '_shp.zip', await z.generateAsync({ type: 'blob' }), how)
    }
  } catch (e) { console.error(e); toast('Ekspor gagal: ' + (e.message || e)) }
}
// ---------- start ----------
(async () => {
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist() } catch (e) { } purgeExports();
  S = { ...DEF, base: 'osm', ...(await kvg('S') || {}) }; F = await kvg('F') || [];
  const h = await kvg('H'); if (h) { const ids = new Set(F.map(f => f.id)); HID.f = new Set((h.f || []).filter(i => ids.has(i))); HID.pm = new Set(h.pm || []) }
  const last = await kvg('last'); if (last) { fix = { ...last, t: 0 }; map.setView([last.lat, last.lon], 14); gpsMsg = 'Posisi terakhir diketahui; menunggu GPS…' } PM = await kvg('PM') || []; setBase(S.base); draw(); PM.forEach(showPM); applyLbl(); updFab(); startGPS(); hud();
  const tk = await kvg('trk'); if (tk && tk.coords && tk.coords.length) { startTrack(tk); if (window.trackUI) trackUI(); toast(tk.paused ? 'Rekaman jejak yang dijeda dipulihkan (' + tk.coords.length + ' titik)' : 'Rekaman jejak sebelumnya dilanjutkan (' + tk.coords.length + ' titik)') }
})();
