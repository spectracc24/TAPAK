'use strict';
// Panel "Ekspor peta" (layout kertas): pengaturan, pratinjau, dan penghubung ke data TAPAK.
// Mesin render ada di mapexport.js. Memakai global dari app.js/ui.js: F, PM, S, HID, LS, symOf, parts, pmBounds, fd, fa, fe, zOf,
// eleStats, lenF, area, map, kv, out, stamp, toast, dlg, esc, I, ICO, ARCS.
const MXB = {
  osm: { name: 'Peta jalan', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', max: 19, tileMm: .2, attr: '© kontributor OpenStreetMap' },
  topo: { name: 'Peta kontur', url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png', max: 17, tileMm: .2, attr: 'Peta: © kontributor OpenStreetMap, SRTM | Tampilan: © OpenTopoMap (CC-BY-SA)' },
  sat: { name: 'Citra satelit', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', max: 19, tileMm: .14, attr: 'Citra: Esri, Maxar, Earthstar Geographics, dan komunitas pengguna GIS' }
};
const MXD = {   // nilai baku; yang bertanda * disimpan antar sesi
  size: 'A4', orient: 'landscape', cw: 30, ch: 20, dpi: 150, fmt: 'pdf',           // *
  author: '', title: '', desc: '', showDate: true,                                  // author *
  ext: 'data', scaleMode: 'auto', scaleN: 25000,                                    // scaleMode *
  base: 'osm', grid: 'dd', labels: true, lblName: true, lblEle: false, lblMeas: false, north: true, scalebar: true, logos: true,   // *
};
const MX_KEEP = ['size', 'orient', 'cw', 'ch', 'dpi', 'fmt', 'author', 'showDate', 'scaleMode', 'grid', 'labels', 'lblName', 'lblEle', 'lblMeas', 'north', 'scalebar', 'logos'];
let MX = null, MXIDS = new Set(), MXPDF = new Set(), mxQ = '', mxTok = 0, mxTimer = 0, mxAbort = null, mxBusy = false;
const mxTiles = new Map(), mxPdfImg = new Map();

// ---------- sumber gambar ----------
function mxLoadTile(url) {
  if (mxTiles.has(url)) return Promise.resolve(mxTiles.get(url));
  const once = () => new Promise(res => {
    const im = new Image(), t = setTimeout(() => { im.src = ''; res(null) }, 15000);
    im.crossOrigin = 'anonymous'; im.onload = () => { clearTimeout(t); res(im) }; im.onerror = () => { clearTimeout(t); res(null) }; im.src = url;
  });
  return once().then(im => im || once()).then(im => { if (im) { if (mxTiles.size > 400) mxTiles.delete(mxTiles.keys().next().value); mxTiles.set(url, im) } return im });
}
async function mxPdfImage(m) {
  if (mxPdfImg.has(m.id)) return mxPdfImg.get(m.id);
  const im = new Image(); im.src = m.img; try { await im.decode() } catch (e) { return null } mxPdfImg.set(m.id, im); return im;
}
function mxLogos() {
  const tap = (window.TAPAK_MARK || '').replace(/var\(--mk-pin\)/g, '#0E4233').replace(/var\(--mk-ft\)/g, '#FFFFFF');
  const arcs = ARCS.replace('class="a-o"', 'stroke="#17324D"').replace('class="a-m"', 'stroke="#168C91"').replace('class="a-i"', 'stroke="#367A55"');
  return {
    tapak: tap ? `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="448" viewBox="-85 -112 170 224">${tap}</svg>` : null,
    spectra: `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="420" viewBox="-210 -210 420 420" fill="none" stroke-width="32" stroke-linecap="round">${arcs}<circle r="19" fill="#17324D" stroke="none"/></svg>`
  };
}

// ---------- data -> masukan mesin ----------
const mxFeats = () => F.filter(f => MXIDS.has(f.id));
function mxLabel(f) {
  const a = [];
  if (MX.lblName && f.props.name) a.push(f.props.name);
  if (MX.lblEle) { if (f.type == 'Point' && zOf(f, 0) != null) a.push('Elv ' + fe(zOf(f, 0))); else if (f.type == 'LineString') { const st = eleStats(f.ele); if (st) a.push('Elv ' + fe(st.min) + '–' + fe(st.max)) } }
  if (MX.lblMeas) { if (f.type == 'LineString') a.push(fd(lenF(f))); else if (f.type == 'Polygon') a.push(fa(area(f.coords))) }
  return a.join(' · ');
}
function mxBounds() {
  const fl = mxFeats(), pm = PM.filter(m => MXPDF.has(m.id));
  if (MX.ext == 'data' && fl.length) { let w = 1e9, s = 1e9, e = -1e9, n = -1e9; fl.forEach(f => f.coords.forEach(c => { w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]) })); return { w, s, e, n } }
  if (MX.ext == 'pdf' && pm.length) { let w = 1e9, s = 1e9, e = -1e9, n = -1e9; pm.forEach(m => { const b = pmBounds(m); w = Math.min(w, b[0][1]); s = Math.min(s, b[0][0]); e = Math.max(e, b[1][1]); n = Math.max(n, b[1][0]) }); return { w, s, e, n } }
  const b = map.getBounds(); return { w: b.getWest(), s: b.getSouth(), e: b.getEast(), n: b.getNorth() };
}
const mxPaper = () => MapExport.pageMm(MX.size, MX.orient, MX.cw, MX.ch);
const mxPaperLabel = () => (MX.size == 'custom' ? `${MX.cw} × ${MX.ch} cm` : MX.size + ' ' + (MX.orient == 'portrait' ? 'portrait' : 'lanskap'));
function mxDisclaimer() {
  const t = ['Sumber data: hasil pengukuran lapangan dengan aplikasi TAPAK (Spectra Citra Cendekia). Ketelitian posisi mengikuti GPS perangkat.'];
  const b = MXB[MX.base]; if (b) t.push('Basemap: ' + b.attr + '.');
  const p = PM.filter(m => MXPDF.has(m.id)).map(m => m.name.replace(/\.pdf$/i, '')); if (p.length) t.push('Peta PDF: ' + p.join(', ') + '.');
  return t.join(' ');
}
async function mxOpts(dpi, signal, onProgress) {
  const [W, H] = mxPaper(), b = MXB[MX.base], pdfMaps = [];
  for (const m of PM.filter(m => MXPDF.has(m.id))) pdfMaps.push({ img: await mxPdfImage(m), bounds: pmBounds(m), op: m.op, name: m.name });
  return {
    W, H, dpi, title: MX.title, desc: MX.desc, author: MX.author, dateText: MX.showDate ? MapExport.fmtDateId(new Date()) : '', paperLabel: mxPaperLabel(),
    bounds: mxBounds(), scaleMode: MX.scaleMode, scaleN: +MX.scaleN, pad: MX.ext == 'view' ? 0 : .06,
    base: b ? { tileUrl: (z, x, y) => b.url.replace('{z}', z).replace('{x}', x).replace('{y}', y), max: b.max, tileMm: b.tileMm, cap: 120 } : null, loadTile: mxLoadTile,
    pdfMaps, features: mxFeats().map(f => { const sy = symOf(f); return { type: f.type, coords: f.coords, parts: f.type == 'LineString' ? parts(f.coords, f.brk) : null, color: sy.c, shape: sy.sh, ln: sy.ln, label: MX.labels ? mxLabel(f) : '' } }),
    symMm: { s: 2.8, m: 3.6, l: 4.6 }[S.symSize] || 3.6, showLabels: MX.labels, grid: MX.grid, north: MX.north, scalebar: MX.scalebar, logos: MX.logos ? mxLogos() : null, disclaimer: mxDisclaimer(), signal, onProgress
  };
}

// ---------- pratinjau ----------
function mxPreview() {
  clearTimeout(mxTimer); mxTimer = setTimeout(async () => {
    if (!MX || $('#mx').hidden || mxBusy) return; const tok = ++mxTok; if (mxAbort) mxAbort.aborted = true; const sig = mxAbort = { aborted: false };
    const box = $('#mxpv'), st = $('#mxst'); st.textContent = 'Memuat pratinjau…';
    try {
      const [W, H] = mxPaper(); if (!(W >= 100 && H >= 100)) { st.textContent = 'Ukuran kertas minimal 10 × 10 cm'; return }
      const r = await MapExport.render(await mxOpts(1000 / (Math.max(W, H) / 25.4), sig, (f, t) => { if (tok == mxTok) st.textContent = t }));
      if (tok != mxTok) return; r.canvas.className = 'mxcv'; box.replaceChildren(r.canvas);
      const i = r.info, w = [];
      if (i.tiles.failed) w.push(`Basemap online gagal dimuat (${i.tiles.failed} dari ${i.tiles.total} kotak). Periksa sinyal.`);
      if (i.labelsSkipped) w.push(`${i.labelsSkipped} label tidak muat dan dilewati.`);
      st.innerHTML = `Skala <b>1:${MapExport.fmtInt(i.scaleN)}</b> · ${esc(mxPaperLabel())}${w.length ? '<br><span class=mxw>' + esc(w.join(' ')) + '</span>' : ''}`;
    } catch (e) { if (e && e.message != 'aborted') { console.error(e); if (tok == mxTok) st.textContent = 'Pratinjau gagal: ' + (e.message || e) } }
  }, 600);
}

// ---------- panel ----------
const mxChip = (k, v, t) => `<button data-k="${k}" data-v="${esc(v)}">${t}</button>`;
const mxSw = (k, t, sub) => `<label class=sw><span>${t}${sub ? `<small>${sub}</small>` : ''}</span><input type=checkbox data-ck="${k}"><i></i></label>`;
function mxBuild() {
  const nPdf = PM.length, off = typeof navigator.onLine == 'boolean' && !navigator.onLine;
  $('#mx').innerHTML = `<div class=mxh><button class="icon-btn" onclick="mxClose()" aria-label=Tutup>${I('close')}</button><h3>Ekspor peta</h3></div>
 <div class=mxb>
  <div id=mxpv class=mxpv><span class=mut>Memuat pratinjau…</span></div><p id=mxst class="lead mxst"></p>
  <h4>Judul &amp; keterangan</h4>
  <input data-in=title placeholder="Judul peta" maxlength=120><textarea data-in=desc rows=3 placeholder="Deskripsi peta (opsional)" maxlength=600></textarea>
  <input data-in=author placeholder="Dibuat oleh (nama pembuat)" maxlength=80>
  ${mxSw('showDate', 'Tanggal ekspor', 'Tanggal hari ini dicantumkan di kaki peta')}
  <h4>Kertas</h4><div class=chips>${mxChip('size', 'A4', 'A4')}${mxChip('size', 'A3', 'A3')}${mxChip('size', 'custom', 'Custom (cm)')}</div>
  <div class=chips>${mxChip('orient', 'landscape', 'Lanskap')}${mxChip('orient', 'portrait', 'Portrait')}</div>
  <div class=r data-when="size=custom"><input data-in=cw type=number inputmode=decimal min=10 max=200 step=any placeholder="Lebar cm"><input data-in=ch type=number inputmode=decimal min=10 max=200 step=any placeholder="Tinggi cm"></div>
  <p class="lead mxdpi" data-when="size=custom">Ukuran 10–200 cm. Lanskap = sisi terpanjang jadi lebar.</p>
  <p class=mut style="margin:8px 0 4px">Resolusi</p><div class=chips>${[100, 150, 200, 300].map(d => mxChip('dpi', d, d + ' dpi')).join('')}</div><p id=mxpx class=lead></p>
  <h4>Area &amp; skala</h4><div class=chips>${mxChip('ext', 'data', 'Sesuaikan ke data')}${mxChip('ext', 'view', 'Tampilan peta saat ini')}${nPdf ? mxChip('ext', 'pdf', 'Area peta PDF') : ''}</div>
  <div class=chips>${mxChip('scaleMode', 'auto', 'Skala otomatis')}${mxChip('scaleMode', 'custom', 'Skala tetap')}</div>
  <div class=r data-when="scaleMode=custom" style="align-items:center"><span class=mut>1 :</span><input data-in=scaleN type=number inputmode=numeric min=100 max=50000000 placeholder="25000"></div>
  <h4>Data lapangan</h4><p id=mxsum class=lead></p>
  <div class=chips>${[['all', 'Semua'], ['vis', 'Yang tampil'], ['sel', 'Terpilih di Data saya'], ['none', 'Kosongkan']].map(([k, t]) => `<button data-act="f${k}">${t}</button>`).join('')}</div>
  <div class=chips>${[['Point', 'Titik'], ['LineString', 'Jalur'], ['Polygon', 'Area']].map(([k, t]) => `<button data-act="t${k}">${t}</button>`).join('')}</div>
  <input type=search id=mxq placeholder="Cari data…"><div id=mxl class=mxl></div>
  <h4>Basemap</h4><div class=chips>${Object.entries(MXB).map(([k, b]) => mxChip('base', k, b.name)).join('')}${mxChip('base', 'none', 'Tanpa basemap online')}</div>
  <p class=lead>${off ? '<b>Perangkat tampak offline.</b> ' : ''}Basemap online butuh internet saat ekspor. Tanpa sinyal, pakai peta PDF di bawah.</p>
  ${nPdf ? `<p class=mut style="margin:6px 0 2px">Peta PDF (offline)</p>${PM.map(m => `<label class=sw><span>${esc(m.name)}<small>${esc(m.geo ? m.geo.crs : '')}</small></span><input type=checkbox data-pm="${m.id}"><i></i></label>`).join('')}` : '<p class=lead>Belum ada peta PDF yang diimpor.</p>'}
  <h4>Isi peta</h4>
  ${mxSw('labels', 'Label data lapangan', 'Teks di samping titik, jalur, dan area')}
  <div class=chips data-when-ck=labels>${[['lblName', 'Nama'], ['lblEle', 'Elevasi'], ['lblMeas', 'Panjang / luas']].map(([k, t]) => `<button data-tg="${k}">${t}</button>`).join('')}</div>
  <p class=mut style="margin:8px 0 4px">Grid koordinat</p><div class=chips>${mxChip('grid', 'dd', 'Derajat desimal')}${mxChip('grid', 'dms', 'Derajat-menit-detik')}${mxChip('grid', 'utm', 'UTM')}${mxChip('grid', 'none', 'Tanpa grid')}</div>
  ${mxSw('north', 'Arah utara')}${mxSw('scalebar', 'Skala & batang skala')}${mxSw('logos', 'Logo TAPAK dan Spectra CC', 'Kecil, di kaki peta bersama keterangan sumber')}
  <h4>Format berkas</h4><div class=chips>${mxChip('fmt', 'pdf', 'PDF')}${mxChip('fmt', 'png', 'PNG')}${mxChip('fmt', 'jpg', 'JPEG')}</div>
  <p class=lead>PDF dan gambar berukuran kertas sebenarnya (A4, A3, atau custom), siap cetak. Skala berlaku pada ukuran kertas asli.</p>
 </div>
 <div class=mxf><div id=mxprog class=mxprog hidden></div><div class=row style="margin:0"><button class="btn btn-p" style="flex:1" data-act=save>${I('save')}Simpan ke perangkat</button><button class="btn btn-o" style="flex:1" data-act=share>${I('send')}Bagikan…</button></div></div>`;
  mxSync();
}
function mxSync() {
  const m = $('#mx'); if (!m) return;
  m.querySelectorAll('[data-k]').forEach(b => b.classList.toggle('on', String(MX[b.dataset.k]) === b.dataset.v));
  m.querySelectorAll('[data-tg]').forEach(b => b.classList.toggle('on', !!MX[b.dataset.tg]));
  m.querySelectorAll('[data-ck]').forEach(c => { c.checked = !!MX[c.dataset.ck] });
  m.querySelectorAll('[data-pm]').forEach(c => { c.checked = MXPDF.has(+c.dataset.pm) });
  m.querySelectorAll('[data-when]').forEach(e => { const [k, v] = e.dataset.when.split('='); e.hidden = String(MX[k]) !== v });
  m.querySelectorAll('[data-when-ck]').forEach(e => { e.hidden = !MX[e.dataset.whenCk] });
  const [W, H] = mxPaper(), d = MapExport.effDpi(W, H, MX.dpi), px = $('#mxpx');
  if (px) px.textContent = W >= 100 && H >= 100 ? `Ukuran ${(W / 10).toFixed(1)} × ${(H / 10).toFixed(1)} cm · ${Math.round(W / 25.4 * d)} × ${Math.round(H / 25.4 * d)} piksel` + (d < MX.dpi ? ` · resolusi diturunkan ke ${d} dpi agar muat di memori` : '') : 'Ukuran minimal 10 × 10 cm';
  mxList();
}
function mxList() {
  const q = mxQ.trim().toLowerCase(), l = F.filter(f => !q || [f.props.name, f.props.desc].join(' ').toLowerCase().includes(q)), el = $('#mxl'); if (!el) return;
  $('#mxsum').textContent = `${MXIDS.size} dari ${F.length} objek dimasukkan ke peta.`;
  el.innerHTML = l.length ? l.slice().reverse().map(f => { const on = MXIDS.has(f.id); return `<div class=item data-f="${f.id}"><span class="ck ${on ? 'on' : ''}">${on ? I('check') : ''}</span><span><strong>${esc(f.props.name || '(tanpa nama)')}</strong><small>${NAMA[f.type]}${isVis(f) ? '' : ' · tersembunyi'}</small></span></div>` }).join('') : `<div class=empty>${F.length ? 'Tidak ada yang cocok.' : 'Belum ada data lapangan.'}</div>`;
}
function mxSave() { const o = {}; MX_KEEP.forEach(k => o[k] = MX[k]); kv.set('MX', o).catch(() => { }) }

window.pMapExport = async () => {
  closeSheet(); const sv = await kvg('MX') || {};
  MX = { ...MXD, grid: { dd: 'dd', dms: 'dms', utm: 'utm' }[S.coord] || 'dd', base: MXB[S.base] ? S.base : 'none', ...sv };
  if (typeof navigator.onLine == 'boolean' && !navigator.onLine && PM.length) MX.base = 'none';
  MXIDS = new Set((F.some(isVis) ? F.filter(isVis) : F).map(f => f.id)); MXPDF = new Set(PM.filter(m => pmVis(m.id)).map(m => m.id)); mxQ = '';
  let el = $('#mx'); if (!el) { el = document.createElement('div'); el.id = 'mx'; document.body.appendChild(el); mxWire(el) }
  mxBuild(); el.querySelectorAll('[data-in]').forEach(i => { i.value = MX[i.dataset.in] ?? '' }); el.hidden = false; el.querySelector('.mxb').scrollTop = 0; mxPreview();
};
window.mxClose = () => { $('#mx').hidden = true; if (mxAbort) mxAbort.aborted = true; mxTok++; mxTiles.clear() };
function mxWire(el) {
  el.addEventListener('click', e => {
    const t = e.target.closest('[data-k],[data-tg],[data-act],[data-f]'); if (!t) return;
    if (t.dataset.k) { const k = t.dataset.k, v = t.dataset.v; MX[k] = ['dpi'].includes(k) ? +v : v; if (k == 'ext' || k == 'size' || k == 'orient') { /* area/ukuran berubah -> pratinjau */ } mxSave(); mxSync(); mxPreview() }
    else if (t.dataset.tg) { MX[t.dataset.tg] = !MX[t.dataset.tg]; mxSave(); mxSync(); mxPreview() }
    else if (t.dataset.f) { const id = +t.dataset.f; MXIDS.has(id) ? MXIDS.delete(id) : MXIDS.add(id); mxList(); mxPreview() }
    else if (t.dataset.act) {
      const a = t.dataset.act;
      if (a == 'fall') MXIDS = new Set(F.map(f => f.id)); else if (a == 'fvis') MXIDS = new Set(F.filter(isVis).map(f => f.id)); else if (a == 'fnone') MXIDS.clear();
      else if (a == 'fsel') { if (!LS.ids.size) return toast('Belum ada data yang dipilih di Data saya'); MXIDS = new Set([...LS.ids].filter(i => gf(i))) }
      else if (a[0] == 't') { const ty = a.slice(1), ids = F.filter(f => f.type == ty).map(f => f.id), all = ids.every(i => MXIDS.has(i)); ids.forEach(i => all ? MXIDS.delete(i) : MXIDS.add(i)) }
      else return mxExport(a);
      mxList(); mxPreview()
    }
  });
  el.addEventListener('input', e => {
    const t = e.target;
    if (t.id == 'mxq') { mxQ = t.value; mxList(); return }
    if (t.dataset.in) { MX[t.dataset.in] = t.type == 'number' ? t.value : t.value; if (['author', 'cw', 'ch', 'scaleN'].includes(t.dataset.in)) mxSave(); mxSync(); mxPreview() }
  });
  el.addEventListener('change', e => {
    const t = e.target; if (t.dataset.ck) { MX[t.dataset.ck] = t.checked; mxSave(); mxSync(); mxPreview() } else if (t.dataset.pm) { t.checked ? MXPDF.add(+t.dataset.pm) : MXPDF.delete(+t.dataset.pm); mxSync(); mxPreview() }
  });
}

// ---------- ekspor ----------
async function mxExport(how) {
  if (mxBusy) return; const [W, H] = mxPaper();
  if (!(W >= 100 && H >= 100 && W <= 2000 && H <= 2000)) return toast('Ukuran kertas custom harus 10–200 cm');
  if (MX.scaleMode == 'custom' && !(+MX.scaleN >= 100)) return toast('Isi skala tetap, mis. 25000');
  if (!MXIDS.size && !MXPDF.size && !MXB[MX.base]) return toast('Pilih minimal satu data, peta PDF, atau basemap');
  mxBusy = true; if (mxAbort) mxAbort.aborted = true; clearTimeout(mxTimer);
  const pr = $('#mxprog'), btns = $('#mx').querySelectorAll('[data-act=save],[data-act=share]'); pr.hidden = false; btns.forEach(b => b.disabled = true);
  let cv = null;
  try {
    const dpi = MX.dpi, o = await mxOpts(dpi, null, (f, t) => { pr.innerHTML = `<i style="width:${Math.round(f * 100)}%"></i><span>${esc(t)}</span>` });
    const r = await MapExport.render(o); cv = r.canvas;
    if (r.info.tiles.failed && !await dlg({ title: 'Basemap tidak lengkap', body: `${r.info.tiles.failed} dari ${r.info.tiles.total} kotak basemap online gagal dimuat (sinyal lemah atau offline), sehingga bagian peta akan kosong. Tetap simpan?`, ok: 'Tetap simpan', cancel: 'Batal' })) return;
    pr.innerHTML = '<span>Menyusun berkas…</span>';
    const e = await MapExport.encode(cv, MX.fmt, { dpi: r.info.dpi, W, H, title: MX.title || 'Peta TAPAK', author: MX.author });
    const slug = (MX.title || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
    if (await out(`peta_${slug ? slug + '_' : ''}${stamp()}.${e.ext}`, e.blob, how) && r.info.labelsSkipped) toast(r.info.labelsSkipped + ' label tidak muat dan dilewati. Perbesar kertas atau kurangi data bila perlu.')
  } catch (e) { console.error(e); toast('Ekspor peta gagal: ' + (e.message || e)) }
  finally { if (cv) { cv.width = cv.height = 0 } mxBusy = false; pr.hidden = true; btns.forEach(b => b.disabled = false); mxPreview() }
}
