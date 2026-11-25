'use strict';
// Lapisan tampilan TAPAK · gaya Spectra CC (Manrope/Inter, ikon garis, kartu, garis tiga warna)
const I = (n, c = '') => `<svg class="ic ${c}" aria-hidden="true"><use href="#i-${n}"></use></svg>`;
const ICO = n => `<span class=ico>${I(n)}</span>`;
const T = (i, t, fn, c = '') => `<button class="tile ${c}" onclick="${fn}">${ICO(i)}<span>${t}</span></button>`;
const FT = { Point: 'pin', LineString: 'route', Polygon: 'polygon' }, NAMA = { Point: 'Titik', LineString: 'Jalur', Polygon: 'Area' };
const re = fn => { const s = $('#sheet'), sc = s.scrollTop; fn(); s.scrollTop = sc };   // render ulang panel tanpa melompat ke atas

// ---------- logo ----------
// Logo pengembang (Spectra CC) hanya dipakai di bagian "Dikembangkan oleh". Logo aplikasi = pin + telapak kaki (lib/mark.js).
// Warna lewat class (style.css: .mk .a-o dst.), bukan atribut style="", agar logo tetap tampil walau CSP diperketat
const ARCS = '<path class="a-o" d="M-90.5 -165.9A189 189 0 1 0 163.8 -94.2"/><path class="a-m" d="M67.5 -112.3A131 131 0 1 0 112.8 66.7"/><path class="a-i" d="M71 0A71 71 0 1 0 0 71"/>';
const MARK = `<svg viewBox="-210 -210 420 420" class="mk" aria-hidden="true" fill="none" stroke-width="32" stroke-linecap="round">${ARCS}<circle class="a-d" r="19" stroke="none"/></svg>`;
const LOGO = `${MARK}<span class="wm"><b>Spectra CC</b><i>Citra Cendekia</i></span>`;
const APPMARK = (c = '') => `<svg viewBox="-125 -125 250 250" class="${c}" aria-hidden="true">${window.TAPAK_MARK || ''}</svg>`;
$$('[data-logo]').forEach(e => e.innerHTML = LOGO);
$('#appmark').innerHTML = window.TAPAK_MARK || '';

// ---------- tema (ikuti sistem / terang / gelap) ----------
function applyTheme(t) {
  const r = document.documentElement; if (t === 'light' || t === 'dark') r.dataset.theme = t; else delete r.dataset.theme;
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = (t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)) ? '#0A1827' : '#17324d'
}
kvg('S').then(s => { if (s && s.theme) applyTheme(s.theme) });

// ---------- sheet & dialog ----------
function sheet(h, c = '', keep) { const s = $('#sheet'), sc = s.scrollTop; s.className = c; s.innerHTML = `<div class=grab></div><button class="icon-btn x" onclick=closeSheet() aria-label=Tutup>${I('close')}</button>${h}`; s.hidden = false; s.scrollTop = keep ? sc : 0 }
function closeSheet() { $('#sheet').hidden = true }
// dialog konfirmasi / isian: resolve true|false (atau teks|null bila ada input)
window.dlg = o => new Promise(res => {
  let el = $('#dlg'); if (!el) { el = document.createElement('div'); el.id = 'dlg'; document.body.appendChild(el) }
  el.innerHTML = `<div class=card role=dialog aria-modal=true><h2>${esc(o.title)}</h2><div class=rule3></div>${o.body ? `<p class=mut>${o.body}</p>` : ''}` +
    (o.input ? `<input id=dlgi type=${o.input.type || 'text'} inputmode=${o.input.inputmode || 'text'} value="${esc(o.input.value ?? '')}" placeholder="${esc(o.input.placeholder || '')}">` : '') +
    `<div class=dlgb>${o.cancel === false ? '' : `<button class="btn btn-o" id=dno>${esc(o.cancel || 'Batal')}</button>`}<button class="btn ${o.danger ? 'btn-d' : 'btn-p'}" id=dyes>${esc(o.ok || 'OK')}</button></div></div>`;
  el.hidden = false; const done = v => { el.hidden = true; el.innerHTML = ''; res(v) };
  $('#dyes').onclick = () => done(o.input ? $('#dlgi').value : true); const n = $('#dno'); if (n) n.onclick = () => done(o.input ? null : false);
  if (o.input) setTimeout(() => { const i = $('#dlgi'); if (i) i.focus() }, 60)
});

// ---------- HUD & jejak ----------
window.cycleCoord = () => { S.coord = { dd: 'dms', dms: 'utm', utm: 'dd' }[S.coord]; saveS(); hud() };
const etaTxt = s => s < 60 ? '< 1 mnt' : s < 5400 ? Math.round(s / 60) + ' mnt' : (s / 3600).toFixed(1) + ' jam';
function hud() {
  const g = $('#gps');
  if (fix && fix.t) {
    const thr = accLim(), bad = fix.acc > (thr === Infinity ? 50 : thr);
    g.className = 'chip ' + (bad ? 'bad' : fix.acc <= Math.min(15, thr) ? 'ok' : 'mid');
    const sub = [];
    if (S.showEle) sub.push('Elv ' + (fix.ele == null ? '–' : fe(fix.ele) + (fix.altAcc > 0 ? ' ±' + fe(fix.altAcc) : '')));
    if (S.showSpd) sub.push(fsp(fix.sp));
    const warn = fix.acc > thr && S.accAct != 'off' ? `<small class=w>Akurasi melebihi batas ${S.maxAcc} m</small>` : '';
    $('#gtxt').innerHTML = `<span>${esc(fmt(fix.lat, fix.lon))}  ±${Math.round(fix.acc)} m</span>${sub.length ? `<small>${esc(sub.join(' · '))}</small>` : ''}${warn}`
  }
  else { g.className = 'chip ' + (fix ? 'mid' : 'bad'); $('#gtxt').textContent = gpsMsg }
  let h = '';
  if (target && fix && fix.t) {
    const b = brg([fix.lat, fix.lon], [target.lat, target.lon]), d = map.distance([fix.lat, fix.lon], [target.lat, target.lon]);
    const extra = []; if (target.ele != null && fix.ele != null) extra.push('Selisih elevasi ' + fdE(target.ele - fix.ele)); if (S.showSpd && fix.sp > .5) extra.push('Tiba ± ' + etaTxt(d / fix.sp));
    h += `<div style="display:flex;gap:8px;align-items:center">${I('target')}<b>${esc(target.name)}</b></div>Jarak ${fd(d)} · Arah ${b.toFixed(0)}° ${card(b)}${extra.length ? '<br>' + esc(extra.join(' · ')) : ''}<div class=row><button class="btn btn-o sm" onclick="target=null;if(tgl)map.removeLayer(tgl);hud()">Batalkan tujuan</button></div>`
  }
  if (pick) h += `${h ? '<hr>' : ''}<div style="display:flex;gap:8px;align-items:center">${I('pin')}<b>${fmt(pick.lat, pick.lng)}</b></div>
  <div class=row><button class="btn btn-o sm" onclick="navigator.clipboard&&navigator.clipboard.writeText('${pick.lat.toFixed(6)}, ${pick.lng.toFixed(6)}');toast('Koordinat disalin')">${I('copy')}Salin</button>
  <button class="btn btn-p sm" onclick="newF('Point',[[pick.lng,pick.lat]])">Tandai</button>
  <button class="btn btn-o sm" onclick="setTarget(pick.lat,pick.lng,'Titik pilihan')">Tuju</button>
  <button class="btn btn-o sm ic-only" onclick="pick=null;map.removeLayer(pm);hud()" aria-label=Tutup>${I('close')}</button></div>`;
  const e = $('#hud'); e.innerHTML = h; e.hidden = !h
}

// panjang jejak berjalan (diingat per jumlah titik agar ringan walau titiknya ribuan)
const _tl = { n: -1, b: -1, v: 0 };
const trkLen = () => { if (_tl.n !== tcoords.length || _tl.b !== tbrk.length) { _tl.n = tcoords.length; _tl.b = tbrk.length; _tl.v = parts(tcoords, tbrk).reduce((s, p) => s + len(p), 0) } return _tl.v };
let tbSt = '';
window.trackUI = function () {
  const b = $('#bt'), t = $('#tbar');
  b.classList.toggle('rec', tracking && !paused); b.classList.toggle('paused', tracking && paused);
  $('#nrect').textContent = tracking ? (paused ? 'Dijeda' : 'Rekaman') : 'Rekam';
  b.querySelector('use').setAttribute('href', tracking && paused ? '#i-pause' : '#i-rec');
  if (!tracking) { t.hidden = true; tbSt = ''; return }
  const st = paused ? 'p' : 'r';
  if (tbSt !== st || !$('#tt')) { tbSt = st; t.className = 'chip'; t.innerHTML = `<i class=rd></i><span id=tt onclick=pTrack()></span><button class=tb onclick="paused?resumeTrack():pauseTrack()" aria-label="${paused ? 'Lanjutkan rekaman' : 'Jeda rekaman'}">${I(paused ? 'play' : 'pause')}</button>` }
  t.classList.toggle('paused', paused); t.classList.toggle('warn', trkWarn && !paused); t.hidden = false;
  const gain = S.showGain ? eleStats(tele) : null;
  $('#tt').innerHTML = `${paused ? 'Dijeda' : 'Merekam'} · ${fd(trkLen())} · ${fdur(trkElapsed())}${gain ? ` · ▲ ${fe(gain.gain)}` : ''}${trkWarn && !paused ? '<small>Akurasi rendah, titik dilewati</small>' : ''}`;
  if ($('#ptrk')) pTrackFill()
};
setInterval(trackUI, 1000);
window.toggleTrack = async function () {
  // izin notifikasi diminta DULU: notifikasi "Sedang tracking" yang dipasang sebelum izin diberikan tidak akan tampil di bilah status
  if (!tracking) { await askNotif(); startTrack(); toast('Rekam jejak dimulai.\nTetap jalan saat layar dikunci atau TAPAK diminimalkan.'); trackUI() }
  else pTrack()
};
const ivLabel = () => S.trkInt == 'all' ? 'semua fix GPS' : S.trkInt == '30' ? 'setiap 30 detik' : S.trkInt == 'custom' ? `setiap ${S.trkCustom} detik` : 'setiap 2 detik';
function pTrackFill() {
  const el = $('#ptrk'); if (!el) return; const d = trkLen(), ms = trkElapsed(), es = eleStats(tele), cell = (k, v) => `<div><small>${k}</small><b>${v}</b></div>`;
  el.innerHTML = cell('Jarak', fd(d)) + cell('Durasi aktif', fdur(ms)) + cell('Rata-rata', ms > 5000 ? fsp(d / (ms / 1e3)) : '–') + cell('Kecepatan kini', paused ? '–' : fsp(fix && fix.sp))
    + cell('Elevasi kini', fix && fix.ele != null ? fe(fix.ele) : '–') + cell('Naik / turun', es ? `${fe(es.gain)} / ${fe(es.loss)}` : '–') + cell('Titik tercatat', tcoords.length) + cell('Akurasi GPS', fix && fix.t ? '±' + Math.round(fix.acc) + ' m' : '–')
}
window.pTrack = () => {
  if (!tracking) return; sheet(`<h3>Rekaman jejak</h3>
 <p class=lead><span class="badge ${paused ? 'warn' : ''}">${I(paused ? 'pause' : 'rec')}${paused ? 'Dijeda · GPS dimatikan sementara' : 'Sedang merekam'}</span></p>
 <div class=row style="margin-top:0">${paused ? `<button class="btn btn-s" style="flex:1" onclick="resumeTrack();pTrack()">${I('play')}Lanjutkan</button>` : `<button class="btn btn-p" style="flex:1" onclick="pauseTrack();pTrack()">${I('pause')}Jeda</button>`}
 <button class="btn btn-o" style="flex:1" onclick="stopSave()">${I('stop')}Berhenti &amp; simpan</button></div>
 <div id=ptrk class=stats></div>
 <div class=row><button class="btn btn-d sm" onclick="discardTrk()">${I('trash')}Buang rekaman</button><button class="btn btn-o sm" onclick="pSet()">${I('sliders')}Interval &amp; akurasi</button></div>
 <p class=lead style="margin-top:12px">Interval pencatatan: ${ivLabel()} · batas akurasi ${S.maxAcc > 0 ? S.maxAcc + ' m' : 'tanpa batas'}. Saat dijeda, titik tidak dicatat dan jarak selama jeda tidak dihitung; setelah dilanjutkan, jejak terputus di titik jeda.</p>`); pTrackFill()
};
async function stopSave() {
  if (!await dlg({ title: 'Berhenti dan simpan?', body: 'Rekaman dihentikan dan disimpan sebagai satu jalur di Data saya.', ok: 'Berhenti & simpan' })) return;
  closeSheet(); const r = await endTrack(); trackUI();
  if (r.coords.length > 1) newF('LineString', r.coords, { name: 'Jejak ' + new Date(r.t0).toLocaleString('id-ID') }, { ele: r.ele, brk: r.brk.length ? r.brk : undefined, trk: { t0: r.t0, t1: r.t1, dur: r.dur } });
  else toast('Jejak terlalu pendek, tidak disimpan')
}
async function discardTrk() {
  if (!await dlg({ title: 'Buang rekaman?', body: 'Seluruh titik rekaman ini akan dihapus dan tidak disimpan.', ok: 'Buang', danger: true })) return;
  closeSheet(); await endTrack(); trackUI(); toast('Rekaman dibuang')
}

// ---------- panel: tambah ----------
window.pDraw = () => sheet(`<h3>Tambah ke peta</h3><div class=grid>
 ${T('locate', 'Tandai lokasi saya', "markHere()", 'pri')}
 ${T('hand', 'Tandai titik di peta', "startMode('point')")}${T('route', 'Gambar jalur', "startMode('line')")}${T('polygon', 'Gambar area', "startMode('polygon')")}
 ${T('ruler', 'Ukur jarak', "startMode('mline')")}${T('contour', 'Ukur luas', "startMode('marea')")}</div>`);
window.pMeasure = pDraw;

// ---------- panel: peta & lapisan ----------
const fmtOff = o => `${Math.abs(o.e).toFixed(0)} m ${o.e >= 0 ? 'ke timur' : 'ke barat'}, ${Math.abs(o.n).toFixed(0)} m ${o.n >= 0 ? 'ke utara' : 'ke selatan'}`;
function pmCard(m) {
  const g = m.geo, off = pmOffset(m), shifted = Math.abs(off.e) > .4 || Math.abs(off.n) > .4, bad = g && (!g.exact || g.rms > 5), hid = !pmVis(m.id);
  const sub = g ? `${esc(g.crs)} · ±${g.rms} m` : 'Diimpor dengan versi lama';
  const info = g ? `<div class=geo><b>Proyeksi:</b> ${esc(g.crs)}<br><b>Galat titik kontrol:</b> ±${g.rms} m dari ${g.n} titik (maks ${g.maxErr} m)<br><b>Resolusi hasil:</b> ${g.res} m per piksel${g.viewports > 1 ? `<br><b>Viewport:</b> ${g.viewports} ditemukan, bingkai peta utama (terluas) dipakai` : ''}${shifted ? `<br><b>Geser manual:</b> ${fmtOff(off)}` : ''}</div>`
    : `<div class=geo>Peta ini diimpor sebelum ada diagnostik georeferensi. Hapus lalu impor ulang agar memakai perhitungan terbaru.</div>`;
  return `<div class="pm ${hid ? 'off' : ''}"><div class=pm-h>${ICO(hid ? 'eyeoff' : 'pdf')}<span><strong>${esc(m.name)}</strong><small>${sub}</small></span>
  <span class="badge ${hid ? 'warn' : 'on'}">${I(hid ? 'eyeoff' : 'eye')}${hid ? 'Tersembunyi' : 'Tampil'}</span></div>
 ${hid ? `<p class="note warn" style="margin-bottom:0"><b>Lapisan ini disembunyikan</b>, jadi tidak tampil di peta. Tekan <b>Tampilkan</b> untuk menampilkannya lagi.</p>` : ''}
 ${bad ? `<p class=note style="margin-bottom:0"><b>Perhatian:</b> ${esc(g.warn || 'titik kontrol georeferensi tidak konsisten')}. Posisi peta mungkin melenceng.</p>` : ''}
 <label>Opasitas <input type=range min=.1 max=1 step=.1 value=${m.op} ${hid ? 'disabled' : ''} oninput="opPM(${m.id},this.value)"></label>
 <div class=row><button class="btn btn-o sm" onclick="closeSheet();map.fitBounds(pmBounds(PM.find(x=>x.id==${m.id})))">${I('search')}Lihat</button>
 <button class="btn ${hid ? 'btn-p' : 'btn-o'} sm" onclick="togglePM(${m.id})">${I(hid ? 'eye' : 'eyeoff')}${hid ? 'Tampilkan' : 'Sembunyikan'}</button>
 <button class="btn btn-o sm" onclick="pNudge(${m.id})">${I('sliders')}Geser</button>
 <button class="btn btn-d sm" onclick="delPM(${m.id})">${I('trash')}Hapus</button></div>
 ${info}<div class=row><button class="btn btn-o sm" onclick="copyGeo(${m.id})">${I('copy')}Salin info georeferensi</button></div></div>`
}
function setAllF(vis, ids) { (ids || F.map(f => f.id)).forEach(id => vis ? HID.f.delete(id) : HID.f.add(id)); saveH(); draw() }
window.pLayers = keep => {
  const nv = F.filter(isVis).length, nh = F.length - nv;
  sheet(`<h3>Peta</h3><h4>Peta dasar (butuh internet)</h4><div class=grid>
 ${Object.entries({ osm: ['road', 'Peta jalan'], topo: ['contour', 'Peta kontur'], sat: ['satellite', 'Citra satelit'], none: ['offline', 'Tanpa peta online'] }).map(([k, [i, v]]) => T(i, v, `setBase('${k}');pLayers(true)`, S.base == k ? 'sel' : '')).join('')}</div>
 <h4>Data lapangan</h4><div class="pm ${F.length && !nv ? 'off' : ''}"><div class=pm-h>${ICO('pin')}<span><strong>${F.length} objek</strong><small>${nv} tampil di peta</small></span>
 ${nh ? `<span class="badge warn">${I('eyeoff')}${nh} tersembunyi</span>` : ''}</div>
 <div class=row><button class="btn btn-o sm" ${F.length && nh ? '' : 'disabled'} onclick="setAllF(true);pLayers(true)">${I('eye')}Tampilkan semua</button>
 <button class="btn btn-o sm" ${nv ? '' : 'disabled'} onclick="setAllF(false);pLayers(true)">${I('eyeoff')}Sembunyikan semua</button>
 <button class="btn btn-o sm" onclick="pListNew()">${I('list')}Kelola…</button></div></div>
 <h4>Peta PDF (tanpa internet)</h4><button class="btn btn-p wide" onclick="$('#pdfin').click()">${I('plus')}Impor peta PDF</button>
 ${PM.length ? PM.map(pmCard).join('') : '<p class=lead style="margin-top:12px">Belum ada peta PDF. Gunakan GeoPDF hasil ekspor ArcMap atau QGIS.</p>'}
 <h4>Cetak &amp; laporan</h4><button class="btn btn-o wide" onclick="pMapExport()">${I('layout')}Ekspor peta berlayout (PDF/PNG/JPEG)</button>`, '', keep === true)
};
let nudgeStep = 5;
window.pNudge = (id, keep) => {
  const m = PM.find(x => x.id == id); if (!m) return; const o = pmOffset(m), sh = Math.abs(o.e) > .4 || Math.abs(o.n) > .4;
  sheet(`<h3>Geser peta PDF</h3><p class=lead>${esc(m.name)}<br>${sh ? 'Geseran kini: ' + fmtOff(o) : 'Belum digeser.'}</p>
 <div class=chips>${[1, 5, 10, 50].map(n => `<button class="${n == nudgeStep ? 'on' : ''}" onclick="nudgeStep=${n};pNudge(${id},1)">${n} m</button>`).join('')}</div>
 <div class=pad><span></span><button class="btn btn-o" onclick="nudgePM(${id},0,nudgeStep)" aria-label=Utara>${I('up')}</button><span></span>
 <button class="btn btn-o" onclick="nudgePM(${id},-nudgeStep,0)" aria-label=Barat>${I('left')}</button><span class=c>geser<br>${nudgeStep} m</span><button class="btn btn-o" onclick="nudgePM(${id},nudgeStep,0)" aria-label=Timur>${I('right')}</button>
 <span></span><button class="btn btn-o" onclick="nudgePM(${id},0,-nudgeStep)" aria-label=Selatan>${I('down')}</button><span></span></div>
 <div class=row style="justify-content:center"><button class="btn btn-o sm" onclick="resetPM(${id})">${I('undo')}Kembalikan</button><button class="btn btn-p sm" onclick="pLayers()">Selesai</button></div>
 <p class=lead style="margin-top:12px">Hanya menggeser gambar peta PDF untuk kalibrasi visual. Koordinat data Anda tidak berubah.</p>`, 'compact')
};

// ---------- panel: daftar data (cari, saring, pilih, sembunyikan, simbol, ekspor) ----------
const LS = { sel: false, ids: new Set(), q: '', t: 'all' };
const symIcon = f => { const sy = symOf(f); return f.type == 'Point' ? `<span class=ico>${shapeSvg(sy.sh, sy.c, 26)}</span>` : `<span class=ico>${I(FT[f.type]).replace('<svg ', `<svg color="${sy.c}" `)}</span>` };
const lsFiltered = () => { const q = LS.q.trim().toLowerCase(); return F.filter(f => (LS.t == 'all' || f.type == LS.t) && (!q || [f.props.name, f.props.desc, ...Object.values(f.props.custom || {})].join(' ').toLowerCase().includes(q))) };
function lsRow(f) {
  const vis = isVis(f), on = LS.ids.has(f.id), c = f.coords[0], d = fix && fix.t ? ` · ${fd(map.distance([fix.lat, fix.lon], [c[1], c[0]]))} dari Anda` : '';
  const e = zOf(f, 0) != null && f.type == 'Point' ? ` · Elv ${fe(zOf(f, 0))}` : '';
  const lead = LS.sel ? `<span class="ck ${on ? 'on' : ''}">${on ? I('check') : ''}</span>` : symIcon(f);
  return `<div class="item ${vis ? '' : 'off'}" onclick="lsTap(${f.id})">${lead}<span><strong>${esc(f.props.name || '(tanpa nama)')}</strong><small>${NAMA[f.type]} · ${f.photos.length} foto${e}${d}${vis ? '' : ' · tersembunyi'}</small></span>
 <button class="icon-btn eye ${vis ? '' : 'dim'}" onclick="event.stopPropagation();toggleF(${f.id})" aria-label="${vis ? 'Sembunyikan di peta' : 'Tampilkan di peta'}">${I(vis ? 'eye' : 'eyeoff')}</button></div>`
}
function lsList() {
  const l = lsFiltered(), dl = $('#dl'); if (!dl) return;
  dl.innerHTML = l.length ? l.slice().reverse().map(lsRow).join('') : `<div class=empty>${ICO('pin')}<br>${F.length ? 'Tidak ada data yang cocok.' : 'Belum ada data.<br>Tekan <b>Tambah</b> untuk memulai.'}</div>`;
  const n = LS.ids.size, dt = $('#dt'); if (dt) dt.innerHTML = LS.sel ?
    `<div class=row><span class="badge on">${n} dipilih</span><button class="btn btn-o sm" onclick="lsAll()">Pilih semua${LS.q || LS.t != 'all' ? ' (hasil)' : ''}</button><button class="btn btn-o sm" onclick="LS.ids.clear();lsList()">Kosongkan</button><button class="btn btn-o sm" onclick="LS.sel=false;LS.ids.clear();lsList()">Selesai</button></div>
   <div class=row><button class="btn btn-o sm" ${n ? '' : 'disabled'} onclick="lsVis(true)">${I('eye')}Tampilkan</button><button class="btn btn-o sm" ${n ? '' : 'disabled'} onclick="lsVis(false)">${I('eyeoff')}Sembunyikan</button>
   <button class="btn btn-o sm" ${n ? '' : 'disabled'} onclick="pSym()">${I('sliders')}Simbol</button><button class="btn btn-p sm" ${n ? '' : 'disabled'} onclick="pExport('sel')">${I('export')}Ekspor</button>
   <button class="btn btn-d sm" ${n ? '' : 'disabled'} onclick="lsDel()">${I('trash')}Hapus</button></div>`
    : `<div class=row><button class="btn btn-o sm" onclick="LS.sel=true;lsList()">${I('check')}Pilih</button><button class="btn btn-o sm" ${l.length ? '' : 'disabled'} onclick="lsVisAll(true)">${I('eye')}Tampilkan semua</button>
   <button class="btn btn-o sm" ${l.length ? '' : 'disabled'} onclick="lsVisAll(false)">${I('eyeoff')}Sembunyikan semua</button></div>`;
  const h = $('#dh'); if (h) h.textContent = `Data saya (${F.length})`
}
window.pList = () => {
  LS.ids = new Set([...LS.ids].filter(i => gf(i)));
  const cnt = t => t == 'all' ? F.length : F.filter(f => f.type == t).length;
  sheet(`<h3 id=dh>Data saya (${F.length})</h3>
 <input id=dq type=search placeholder="Cari nama, keterangan, atau data…" value="${esc(LS.q)}" oninput="LS.q=this.value;lsList()">
 <div class=chips>${[['all', 'Semua'], ['Point', 'Titik'], ['LineString', 'Jalur'], ['Polygon', 'Area']].map(([k, v]) => `<button class="${LS.t == k ? 'on' : ''}" onclick="LS.t='${k}';pList()">${v} ${cnt(k)}</button>`).join('')}</div>
 <div id=dt></div><div id=dl></div>
 <p class=lead style="margin-top:10px">${I('eye')} Ikon mata menyembunyikan objek dari peta tanpa menghapusnya. Objek tersembunyi tetap tersimpan dan tetap bisa diekspor bila dipilih.</p>`); lsList()
};
window.pListNew = () => { LS.sel = false; LS.ids.clear(); LS.q = ''; LS.t = 'all'; pList() };
window.lsTap = id => {
  if (LS.sel) { LS.ids.has(id) ? LS.ids.delete(id) : LS.ids.add(id); lsList(); return }
  const f = gf(id); edit(id); map.fitBounds(L.latLngBounds(f.coords.map(c => [c[1], c[0]])), { maxZoom: 17 })
};
window.lsAll = () => { lsFiltered().forEach(f => LS.ids.add(f.id)); lsList() };
window.lsVis = v => { setAllF(v, [...LS.ids]); lsList() };
window.lsVisAll = v => { setAllF(v, lsFiltered().map(f => f.id)); lsList() };
window.toggleF = id => { const f = gf(id); if (!f) return; isVis(f) ? HID.f.add(id) : HID.f.delete(id); saveH(); draw(); if ($('#dl')) lsList(); else if (cur == id && !$('#sheet').hidden) edit(id) };
window.lsDel = async () => {
  const n = LS.ids.size; if (!n || !await dlg({ title: `Hapus ${n} objek?`, body: 'Objek terpilih beserta foto lampirannya akan dihapus permanen.', ok: 'Hapus', danger: true })) return;
  const ids = new Set(LS.ids); F = F.filter(f => !ids.has(f.id)); ids.forEach(i => HID.f.delete(i)); LS.ids.clear(); saveH(); persist(); draw(); pList()
};

// ---------- panel: ubah simbol (satu atau banyak objek) ----------
let SY = {}, SYIDS = [];
const swatches = (sel, fn) => `<div class=swr>${COLORS.map(([c, n]) => `<button class="swc ${sel == c ? 'on' : ''}" onclick="${fn}('${c}')" aria-label="${n}" title="${n}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="${c}"/></svg></button>`).join('')}</div>`;
const shapeBtns = (sel, fn) => `<div class=swr>${Object.entries(SHAPES).map(([k, n]) => `<button class="shp ${sel == k ? 'on' : ''}" onclick="${fn}('${k}')" aria-label="${n}" title="${n}">${shapeSvg(k, 'var(--head)', 26)}</button>`).join('')}</div>`;
const lineBtns = (sel, fn) => `<div class=chips>${Object.entries(LNSTY).map(([k, [n]]) => `<button class="${sel == k ? 'on' : ''}" onclick="${fn}('${k}')">${n}</button>`).join('')}</div>`;
window.pSym = ids => {
  if (ids) SYIDS = ids; else { SYIDS = [...LS.ids]; SY = {} }
  sheet(`<h3>Ubah simbol (${SYIDS.length} objek)</h3><h4>Warna</h4>${swatches(SY.c, 'syc')}<h4>Bentuk titik</h4>${shapeBtns(SY.sh, 'sysh')}<h4>Gaya jalur &amp; area</h4>${lineBtns(SY.ln, 'syln')}
 <div class=row><button class="btn btn-p" onclick="syApply()">${I('check')}Terapkan</button><button class="btn btn-o" onclick="syReset()">${I('undo')}Kembalikan ke baku</button></div>
 <p class=lead style="margin-top:10px">Warna berlaku untuk semua jenis objek. Bentuk hanya untuk titik, gaya hanya untuk jalur dan area. Bagian yang tidak dipilih dibiarkan seperti semula.</p>`, '', !!ids)
};
window.syc = c => { SY.c = c; pSym(SYIDS) }; window.sysh = s => { SY.sh = s; pSym(SYIDS) }; window.syln = l => { SY.ln = l; pSym(SYIDS) };
window.syApply = () => { if (!Object.keys(SY).length) return toast('Pilih warna, bentuk, atau gaya dulu'); setSym(SYIDS, SY); toast('Simbol diterapkan'); pList() };
window.syReset = () => { setSym(SYIDS, { reset: true }); toast('Simbol dikembalikan ke baku'); pList() };

// ---------- panel: editor objek ----------
window.addAttr = (k = '') => $('#cu').insertAdjacentHTML('beforeend', `<div class=r><input value="${esc(k)}" placeholder="Nama data"><input placeholder="Isi"></div>`);
function profSvg(f) {
  const pts = [], br = new Set(f.brk || []); let d = 0, prev = null;
  f.coords.forEach((c, i) => { if (prev && !br.has(i)) d += map.distance([prev[1], prev[0]], [c[1], c[0]]); prev = c; const e = zOf(f, i); if (e != null) pts.push([d, e]) });
  if (pts.length < 3 || d <= 0) return '';
  const k = Math.ceil(pts.length / 500), p2 = pts.filter((_, i) => i % k == 0 || i == pts.length - 1), mn = Math.min(...p2.map(p => p[1])), mx = Math.max(...p2.map(p => p[1])), r = Math.max(mx - mn, 5), W = 300, H = 80;
  const path = p2.map((p, i) => (i ? 'L' : 'M') + (p[0] / d * W).toFixed(1) + ' ' + (H - 6 - (p[1] - mn) / r * (H - 14)).toFixed(1)).join('');
  return `<div class=prof><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Profil elevasi"><path d="${path}L${W} ${H}L0 ${H}Z" fill="currentColor" opacity=".14"/><path d="${path}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>
 <div class=pl><span>${fe(mn)}</span><span>Profil elevasi · ${fd(d)}</span><span>${fe(mx)}</span></div></div>`
}
window.edSym = patch => { grab(); setSym([cur], patch); edit(cur) };
function edit(id) {
  cur = id; const f = gf(id); if (!f) return; const sy = symOf(f), vis = isVis(f);
  const cu = Object.entries(f.props.custom).map(([k, v]) => `<div class=r><input value="${esc(k)}" placeholder="Nama data"><input value="${esc(v)}" placeholder="Isi"></div>`).join('');
  const ph = f.photos.map((p, i) => `<span class=th><img src="${p.data}" alt="">${p.lat.toFixed(5)}<br>${p.lon.toFixed(5)}<br><a onclick="delPhoto(${i})">hapus</a></span>`).join('');
  const c0 = f.coords[0], es = eleStats(f.ele); let info = '';
  if (f.type == 'Point') { info = zOf(f, 0) != null ? `Elevasi ${fe(zOf(f, 0))}${f.acc != null ? ` · akurasi GPS ±${f.acc} m` : ''}` : (f.acc != null ? `Akurasi GPS ±${f.acc} m` : '') }
  else if (f.type == 'LineString') {
    info = `Panjang ${fd(lenF(f))}`;
    if (f.trk) { const sp = f.trk.dur > 5000 ? lenF(f) / (f.trk.dur / 1e3) : null; info += `<br>Durasi aktif ${fdur(f.trk.dur)}${sp ? ` · rata-rata ${fsp(sp)}` : ''}` }
    if (es) info += `<br>Elevasi ${fe(es.min)} – ${fe(es.max)} · naik ${fe(es.gain)} · turun ${fe(es.loss)}`;
    if (f.brk && f.brk.length) info += `<br>${f.brk.length + 1} segmen (rekaman sempat dijeda)`
  }
  else info = `Luas ${fa(area(f.coords))} · Keliling ${fd(len([...f.coords, f.coords[0]]))}`;
  const symUI = f.type == 'Point' ? `<h4>Simbol</h4>${swatches(f.sym && f.sym.c, 'edC')}${shapeBtns(f.sym && f.sym.sh || 'circle', 'edS')}`
    : `<h4>Simbol</h4>${swatches(f.sym && f.sym.c, 'edC')}${lineBtns(sy.ln, 'edL')}`;
  sheet(`<h3>${NAMA[f.type]}</h3><p class=lead>${info ? info + '<br>' : ''}${fmt(c0[1], c0[0])}${vis ? '' : '<br><span class="badge warn">' + I('eyeoff') + 'Tersembunyi di peta</span>'}</p>
 ${f.type == 'LineString' ? profSvg(f) : ''}
 <input id=en placeholder="Nama / judul" value="${esc(f.props.name)}"><textarea id=ed rows=2 placeholder="Keterangan">${esc(f.props.desc)}</textarea>
 <h4>Data tambahan</h4><div id=cu>${cu}</div><div class=chips>${['Jenis', 'Jumlah', 'Kondisi', 'Pelaku'].map(k => `<button onclick="addAttr('${k}')">${I('plus')}${k}</button>`).join('')}<button onclick="addAttr()">${I('plus')}Lainnya</button></div>
 ${symUI}
 <h4>Foto (otomatis berlokasi)</h4><div>${ph}</div><div class=row><button class="btn btn-o sm" onclick="takePhoto('cam')">${I('camera')}Ambil foto</button><button class="btn btn-o sm" onclick="takePhoto('gal')">${I('image')}Dari galeri</button></div>
 <h4>Aksi</h4><div class=row><button class="btn btn-p" onclick="grab();closeSheet();toast('Tersimpan')">${I('save')}Simpan</button>
 <button class="btn btn-o" onclick="grab();setTarget(${c0[1]},${c0[0]},gf(cur).props.name||'Objek',zOf(gf(cur),0));closeSheet()">${I('target')}Tuju ke sini</button>
 <button class="btn btn-o" onclick="grab();closeSheet();map.fitBounds(L.latLngBounds(gf(cur).coords.map(c=>[c[1],c[0]])),{maxZoom:18})">${I('search')}Lihat di peta</button>
 <button class="btn btn-o" onclick="grab();toggleF(cur)">${I(vis ? 'eyeoff' : 'eye')}${vis ? 'Sembunyikan' : 'Tampilkan'}</button>
 <button class="btn btn-d" onclick=delF()>${I('trash')}Hapus</button></div>`)
}
window.edC = c => edSym({ c }); window.edS = sh => edSym({ sh }); window.edL = ln => edSym({ ln });

// ---------- panel: simpan & bagikan ----------
const EX = { scope: 'all', fmt: 'geojson', photos: true };
const exList = () => EX.scope == 'sel' ? F.filter(f => LS.ids.has(f.id)) : EX.scope == 'vis' ? F.filter(isVis) : F;
window.pExport = scope => {
  if (scope) EX.scope = scope; if (EX.scope == 'sel' && !LS.ids.size) EX.scope = 'all';
  const l = exList(), np = l.reduce((s, f) => s + f.photos.length, 0), nv = F.filter(isVis).length;
  const sc = (k, t, n) => `<button class="${EX.scope == k ? 'on' : ''}" onclick="EX.scope='${k}';pExport()" ${n ? '' : 'disabled'}>${t} (${n})</button>`;
  sheet(`<h3>Simpan &amp; bagikan data</h3><h4>Data yang diekspor</h4>
 <div class=chips>${sc('all', 'Semua', F.length)}${sc('sel', 'Terpilih', LS.ids.size)}${sc('vis', 'Yang tampil', nv)}</div>
 <div class=row style="margin-top:0"><button class="btn btn-o sm" onclick="LS.sel=true;pList()">${I('check')}Pilih data tertentu…</button></div>
 <h4>Format</h4><div class=grid>${[['geojson', 'globe', 'GeoJSON'], ['kmz', 'layers', 'KMZ (Google Earth)'], ['shp', 'db', 'SHP (ArcGIS/QGIS)']].map(([k, i, t]) => T(i, t, `EX.fmt='${k}';pExport()`, EX.fmt == k ? 'sel' : '')).join('')}</div>
 <label class=sw><span>Sertakan foto<small>${EX.fmt == 'geojson' ? 'GeoJSON hanya memuat nama berkas foto' : 'Foto ikut di dalam berkas'}</small></span><input type=checkbox ${EX.photos ? 'checked' : ''} onchange="EX.photos=this.checked"><i></i></label>
 <div class=row><button class="btn btn-p" style="flex:1" ${l.length ? '' : 'disabled'} onclick="exportData(EX.fmt,'save',exList(),EX.photos)">${I('save')}Simpan ke perangkat</button>
 <button class="btn btn-o" style="flex:1" ${l.length ? '' : 'disabled'} onclick="exportData(EX.fmt,'share',exList(),EX.photos)">${I('send')}Bagikan…</button></div>
 <p class=lead style="margin-top:10px">${l.length} objek · ${np} foto akan diekspor. <b>Simpan ke perangkat</b> membuka dialog “Simpan sebagai” Android agar Anda memilih folder; <b>Bagikan</b> membuka menu aplikasi (WhatsApp, Drive, dll). Elevasi, akurasi GPS, dan simbol ikut tercatat sebagai atribut.</p>`, '', true)
};

// ---------- panel: pengaturan ----------
const UI = { cAcc: false };
const PRE_ACC = [10, 20, 32, 50, 0];
const reEle = () => { if (fix && fix.alt != null) fix.ele = eleOf(fix.lat, fix.lon, fix.alt) };
function setS(k, v) {
  if (k == 'maxAcc') { if (v === 'c') { UI.cAcc = true; v = S.maxAcc > 0 ? S.maxAcc : 32 } else UI.cAcc = false }
  S[k] = v; saveS();
  if (k == 'theme') applyTheme(v); if (k == 'lbl') applyLbl(); if (k == 'symSize' || k == 'autoJenis') draw(); if (k == 'eleSrc') reEle();
  hud(); trackUI(); re(pSet)
}
window.setLblSize = v => { S.lblSize = Math.min(24, Math.max(8, Math.round(+v) || 12)); applyLbl(); const e = $('#lsv'); if (e) e.textContent = S.lblSize + ' px'; clearTimeout(setLblSize.t); setLblSize.t = setTimeout(saveS, 400) };
function setNum(k, v, lo, hi) { if (v === '' || !isFinite(+v)) return; S[k] = Math.min(hi, Math.max(lo, Math.round(+v))); saveS(); hud() }
const chp = (k, opts, on) => `<div class=chips>${opts.map(([v, t]) => `<button class="${(on ? on(v) : S[k] === v) ? 'on' : ''}" onclick="setS('${k}',${esc(JSON.stringify(v))})">${t}</button>`).join('')}</div>`;
const sw = (k, t, sub) => `<label class=sw><span>${t}${sub ? `<small>${sub}</small>` : ''}</span><input type=checkbox ${S[k] ? 'checked' : ''} onchange="setS('${k}',this.checked)"><i></i></label>`;
const sel = (k, a) => `<select onchange="setS('${k}',this.value)">${Object.entries(a).map(([v, t]) => `<option value=${v} ${(S[k] || 'auto') == v ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
window.pSet = () => {
  const custAcc = UI.cAcc || !PRE_ACC.includes(S.maxAcc), off = +S.eleOff || 0;
  sheet(`<h3>Pengaturan</h3>
 <h4>Koordinat &amp; satuan</h4>${sel('coord', { dd: 'Derajat desimal (-0.12345, 109.12345)', dms: 'Derajat-menit-detik', utm: 'UTM' })}
 ${sel('unit', { metric: 'Meter / Kilometer / Hektar', imperial: 'Kaki / Mil / Acre', nautical: 'Mil laut' })}${sel('theme', { auto: 'Tema: ikuti sistem', light: 'Tema: terang', dark: 'Tema: gelap' })}
 <h4>Info di layar</h4>${sw('showEle', 'Elevasi', 'Tampil di kotak koordinat kiri atas')}${sw('showSpd', 'Kecepatan &amp; perkiraan tiba', 'Kecepatan GPS; perkiraan tiba saat menuju titik')}${sw('showGain', 'Kenaikan elevasi saat merekam', 'Total naik tampil di bilah rekaman')}
 <h4>Data di peta</h4><p class=mut style="margin:0 0 4px">Label nama titik</p>${chp('lbl', [['show', 'Tampil'], ['auto', 'Hanya saat zoom dekat'], ['hide', 'Sembunyi']])}
 <p class=mut style="margin:6px 0 4px">Ukuran font label <b id=lsv>${+S.lblSize || 12} px</b></p><div class=r style="align-items:center"><input type=range min=8 max=24 step=1 value="${+S.lblSize || 12}" oninput="setLblSize(this.value)" aria-label="Ukuran font label"></div>
 <p class=mut style="margin:6px 0 4px">Ukuran simbol titik</p>${chp('symSize', [['s', 'Kecil'], ['m', 'Sedang'], ['l', 'Besar']])}
 ${sw('autoJenis', 'Warna otomatis menurut data “Jenis”', 'Objek dengan isian Jenis yang sama diberi warna sama, kecuali sudah diberi warna manual')}
 <h4>Rekam jejak</h4><p class=mut style="margin:0 0 4px">Interval pencatatan titik</p>${chp('trkInt', [['2', '2 detik'], ['30', '30 detik'], ['all', 'Semua fix'], ['custom', 'Custom']])}
 ${S.trkInt == 'custom' ? `<div class=r style="align-items:center"><input type=number inputmode=numeric min=1 max=3600 value="${S.trkCustom}" oninput="setNum('trkCustom',this.value,1,3600)"><span class=mut style="white-space:nowrap">detik (1–3600)</span></div>` : ''}
 <p class=lead style="margin:4px 0 0">“Semua fix” mencatat setiap posisi dari GPS (sekitar 1 titik/detik): jejak rapat tetapi berkas dan baterai lebih berat.</p>
 ${S.trkInt != 'all' ? sw('trkMinDist', 'Abaikan titik saat diam', 'Tidak mencatat bila bergeser kurang dari 3 m, agar jejak tidak berantakan saat berhenti') : ''}
 <h4>Akurasi GPS</h4><p class=mut style="margin:0 0 4px">Batas akurasi horizontal</p>
 ${chp('maxAcc', [[10, '10 m'], [20, '20 m'], [32, '32 m'], [50, '50 m'], [0, 'Tanpa batas'], ['c', 'Custom']], v => v === 'c' ? custAcc : (!custAcc && S.maxAcc === v))}
 ${custAcc ? `<div class=r style="align-items:center"><input type=number inputmode=numeric min=1 max=500 value="${S.maxAcc > 0 ? S.maxAcc : ''}" placeholder="meter" oninput="setNum('maxAcc',this.value,1,500)"><span class=mut style="white-space:nowrap">meter</span></div>` : ''}
 <p class=lead style="margin:4px 0 8px">Default 32 m. Saran: 10 m untuk pengukuran lahan atau batas, 32 m untuk patroli dan navigasi, 50 m bila di bawah kanopi lebat. Titik jejak yang melebihi batas dilewati.</p>
 <p class=mut style="margin:0 0 4px">Bila saat menandai titik akurasinya melebihi batas</p>${chp('accAct', [['warn', 'Beri peringatan'], ['block', 'Blokir'], ['off', 'Abaikan']])}
 <h4>Elevasi</h4><p class=mut style="margin:0 0 4px">Sumber elevasi</p>${chp('eleSrc', [['geoid', 'Koreksi geoid (MSL)'], ['raw', 'Mentah dari GPS']])}
 <p class=lead style="margin:4px 0 8px">Android memberi tinggi terhadap elipsoid WGS84, bukan muka laut; selisihnya di Pontianak sekitar 32 m. Koreksi geoid EGM96 dihitung di HP tanpa internet. Ketelitian vertikal GPS HP umumnya 2–3× lebih buruk dari horizontal, jadi anggap elevasi sebagai perkiraan.</p>
 <div class=row style="margin-top:0"><button class="btn btn-o sm" onclick="calibEle()">${I('target')}Kalibrasi dari lokasi ini</button>${off ? `<button class="btn btn-o sm" onclick="resetOff()">${I('undo')}Hapus offset (${off > 0 ? '+' : ''}${off.toFixed(1)} m)</button>` : ''}</div>
 <h4>Default</h4><button class="btn btn-d wide" onclick="resetS()">${I('undo')}Kembalikan semua pengaturan ke default</button>
 <p class=lead style="margin-top:8px">Hanya pengaturan di halaman ini yang dikembalikan. Data lapangan dan peta PDF Anda tidak berubah.</p>`, '', true)
};
window.resetOff = () => { S.eleOff = 0; saveS(); reEle(); hud(); pSet() };
window.calibEle = async () => {
  if (!fix || !fix.t || fix.alt == null) return toast('Belum ada data elevasi dari GPS.\nTunggu GPS mendapat sinyal.');
  const base = fix.ele - (+S.eleOff || 0), v = await dlg({ title: 'Kalibrasi elevasi', body: 'Masukkan elevasi sebenarnya di lokasi Anda sekarang (meter di atas muka laut), misalnya dari titik tinggi di peta atau patok BM. TAPAK menyimpan selisihnya sebagai offset.', input: { type: 'number', inputmode: 'decimal', value: Math.round(fix.ele), placeholder: 'meter' }, ok: 'Terapkan' });
  if (v == null || v === '' || isNaN(+v)) return; S.eleOff = +(+v - base).toFixed(1); saveS(); reEle(); hud(); toast('Offset elevasi ' + (S.eleOff > 0 ? '+' : '') + S.eleOff + ' m diterapkan'); if (!$('#sheet').hidden) pSet()
};
window.resetS = async () => {
  if (!await dlg({ title: 'Kembalikan ke default?', body: 'Semua pengaturan (tampilan, rekam jejak, akurasi GPS, elevasi) kembali ke nilai awal. Data lapangan dan peta PDF tetap aman.', ok: 'Kembalikan', danger: true })) return;
  const b = S.base; S = { ...DEF, base: b }; UI.cAcc = false; saveS(); applyTheme('auto'); applyLbl(); draw(); reEle(); hud(); trackUI(); pSet(); toast('Pengaturan dikembalikan ke default')
};

// ---------- menu lainnya, bantuan, tentang ----------
window.pMenu = () => sheet(`<h3>Lainnya</h3><div class=grid>${T('sliders', 'Pengaturan', 'pSet()')}${T('export', 'Simpan &amp; bagikan data', 'pExport()')}${T('layout', 'Ekspor peta (PDF/PNG/JPEG)', 'pMapExport()')}${T('help', 'Cara pakai', 'pHelp()')}${T('mail', 'Laporkan bug / penyalahgunaan', 'pReport()')}${T('info', 'Tentang TAPAK', 'pAbout()')}</div>
 <p class=foot>TAPAK v${esc(window.APP_VER || '')} · dikembangkan oleh Spectra CC</p>`);
window.pHelp = () => sheet(`<h3>Cara pakai</h3>
 <h4>Peta tanpa sinyal</h4><p>Peta → Impor peta PDF → pilih berkas GeoPDF dari HP. Tombol <b>Sembunyikan/Tampilkan</b> mengatur peta PDF di layar; lapisan yang disembunyikan diberi label <b>Tersembunyi</b> dan tombol lapisan di peta bertitik.</p>
 <h4>Peta PDF terasa melenceng?</h4><p>Buka Peta dan lihat kartu peta PDF: proyeksi dan galat titik kontrol tertera di sana. Bandingkan dengan peta dasar, atur opasitas, lalu pakai <b>Geser</b> bila perlu kalibrasi.</p>
 <h4>Menandai temuan</h4><p>Tambah → Tandai lokasi saya. Isi nama dan data, pilih warna/bentuk simbol, ambil foto, lalu Simpan. Bila akurasi GPS melebihi batas, TAPAK memberi peringatan lebih dulu.</p>
 <h4>Merekam jalur patroli</h4><p>Tekan Rekam. Tombol <b>Jeda</b> di bilah merah (atau di panel Rekaman) menghentikan pencatatan sementara; jarak selama jeda tidak dihitung. Rekaman <b>tetap berjalan</b> saat layar dikunci atau TAPAK diminimalkan, ditandai notifikasi hijau “Sedang tracking” di bilah status (berganti oranye “Track dijeda” saat dijeda, dan hilang saat dihentikan). Izinkan notifikasi bila diminta. Di HP Xiaomi, Oppo, Vivo, atau Samsung, atur Baterai TAPAK ke “Tanpa batasan”.</p>
 <h4>Banyak data di peta</h4><p>Data saya → ikon mata menyembunyikan satu objek; <b>Pilih</b> untuk menyembunyikan, mengubah simbol, mengekspor, atau menghapus beberapa objek sekaligus. Di Pengaturan, label nama bisa disembunyikan dan warna bisa otomatis menurut “Jenis”.</p>
 <h4>Mengukur &amp; menuju titik</h4><p>Tambah → Ukur jarak / Ukur luas. Buka data → Tuju ke sini: jarak, arah, dan selisih elevasi tampil di atas.</p>
 <h4>Menyimpan &amp; mengirim data</h4><p>Lainnya → Simpan &amp; bagikan data: pilih semua atau sebagian objek, format GeoJSON/KMZ/SHP, lalu <b>Simpan ke perangkat</b> atau <b>Bagikan</b>.</p>
 <h4>Ekspor peta (layout cetak)</h4><p>Lainnya → Ekspor peta. Pilih kertas A4/A3/custom (lanskap atau portrait), isi judul, deskripsi, dan nama pembuat, pilih data lapangan, basemap online atau peta PDF, grid koordinat, ukuran font label, lalu simpan sebagai PDF, PNG, atau JPEG. Tanpa sinyal, pakai peta PDF sebagai basemap. Pengaturan layout bisa disimpan sebagai <b>draft</b> dan diubah lagi nanti; draft yang sudah diekspor otomatis dihapus.</p>\n <h4>Melaporkan bug atau penyalahgunaan</h4><p>Lainnya → Laporkan bug / penyalahgunaan. Pilih jenis laporan, tulis deskripsi, centang captcha, lalu kirim. Butuh internet.</p>
 <h4>Ganti format koordinat</h4><p>Ketuk kotak koordinat di kiri atas, atau lewat Pengaturan.</p>`);
window.pAbout = () => sheet(`<div class=about>${APPMARK('appmark')}<h3>TAPAK</h3><p class=tg>Teknologi Akuisisi dan Pencatatan Hutan Kita</p><p class=lead>Every Track Tells a Story.<br>Peta, jejak, dan catatan lapangan untuk perlindungan hutan berbasis masyarakat. Bekerja tanpa internet.</p>
 <div class=byline><small>Dikembangkan oleh</small><span class=logo>${LOGO}</span>
 <p class=sl>Science into Sustainable Solutions.</p><p class=mut style="margin:0">Pontianak, Kalimantan Barat, Indonesia</p></div>
 <p class=foot>Versi ${esc(window.APP_VER || '')} · © 2026 Spectra Citra Cendekia</p></div>`);
// Splash tidak lagi menutup sendiri: pengguna menekan "Jelajahi Peta". Sambutan pertama kali dan permintaan izin
// baru muncul setelah itu, supaya tidak tertutup splash.
// Urutan pertama kali: splash -> persetujuan syarat & privasi -> izin (lokasi, kamera, notifikasi) -> kartu pengenalan fitur (sekali) -> peta.
// Kali berikutnya: splash -> (izin bila ada yang kurang) -> peta.
window.enterApp = () => {
  const sp = $('#splash'); if (sp.classList.contains('off')) return;
  sp.classList.add('off');
  needConsent().then(need => { if (need) setTimeout(() => { $('#consent').hidden = false }, 350); else setTimeout(startFlow, 450) });
};
window.startFlow = () => { window.flowOn = true; if (typeof ensurePerms === 'function') ensurePerms(); else introOnce() };
// kartu pengenalan fitur: hanya sekali seumur pemakaian, dan hanya bila tidak ada kartu lain yang sedang tampil
window.introOnce = () => kvg('seen').then(v => { if (!v && $('#welcome').hidden && $('#consent').hidden && $('#splash').classList.contains('off')) $('#welcome').hidden = false });
window.closeWelcome = () => { $('#welcome').hidden = true; kv.set('seen', 1).catch(() => { }) };
{ const v = $('#appver'); if (v) v.textContent = 'Versi ' + (window.APP_VER || '') }
trackUI(); hud();
