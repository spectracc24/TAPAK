'use strict';
/* TAPAK · mesin ekspor peta (layout kertas -> kanvas -> PNG / JPEG / PDF)
   Berdiri sendiri: tidak membaca data aplikasi, semua masukan lewat argumen (lihat render()).
   Panel pengaturan & penghubung ke data TAPAK ada di mapexport-ui.js. Uji: test/mapexport.test.js.

   Konsep:
   - Semua ukuran layout dalam milimeter KERTAS (dikali u agar proporsional untuk A4, A3, atau ukuran custom),
     lalu diubah ke piksel dengan pxmm = dpi / 25.4. Jadi pratinjau dan hasil akhir identik tata letaknya.
   - Isi peta digambar dalam Web Mercator (sama dengan basemap Leaflet), sehingga garis grid derajat lurus
     dan sejajar bingkai, sedangkan grid UTM digambar sebagai garis yang diproyeksikan ulang lewat proj4. */
(function (root) {
  const R = 6378137, DEG = Math.PI / 180, WORLD = 2 * Math.PI * R, HALF = Math.PI * R;
  const merc = (lon, lat) => [R * lon * DEG, R * Math.log(Math.tan(Math.PI / 4 + lat * DEG / 2))];
  const unmerc = (x, y) => [x / R / DEG, (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) / DEG];   // -> [lon, lat]
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const PAPER = { A4: [210, 297], A3: [297, 420] };
  const NAVY = '#17324D', TEAL = '#168C91', GREEN = '#367A55', MUTED = '#53616B';
  const FH = 'Manrope, Montserrat, system-ui, sans-serif', FB = 'Inter, system-ui, sans-serif';
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  // bentuk simbol titik: sama dengan SHP_SVG di app.js (kotak 24x24)
  const SHAPE_D = {
    circle: 'M4 12a8 8 0 1 0 16 0a8 8 0 1 0 -16 0z', square: 'M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2H6a2 2 0 0 1 -2 -2V6a2 2 0 0 1 2 -2z',
    triangle: 'M12 3.5L21 20H3z', diamond: 'M12 2.5L21.5 12 12 21.5 2.5 12z',
    star: 'M12 2.5l2.9 6.2 6.6.8-4.9 4.6 1.3 6.7-5.9-3.3-5.9 3.3 1.3-6.7L2.5 9.5l6.6-.8z', cross: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z'
  };
  const DASH = { solid: null, dash: [9 / 4, 8 / 4], dot: [.05, 2] };        // kelipatan tebal garis (sama dengan LNSTY di app.js)

  // ---------- utilitas umum ----------
  const fmtInt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fmtDateId = d => `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
  // bulatkan ke atas pada n angka penting (1:12.847 -> 1:13.000)
  const ceilSig = (v, n) => { const p = Math.pow(10, Math.floor(Math.log10(v)) - n + 1); return Math.ceil(v / p - 1e-9) * p };
  function niceScaleN(v) { let r = ceilSig(v, 2); if (r / v > 1.06) r = ceilSig(v, 3); return r }
  // bilangan "bulat" 1-2-5 terdekat (skala log) dari daftar, dipakai untuk interval grid
  const nearestLog = (want, list) => list.reduce((b, s) => Math.abs(Math.log(s / want)) < Math.abs(Math.log(b / want)) ? s : b, list[0]);
  const STEP_DD = [10, 5, 2, 1, .5, .2, .1, .05, .02, .01, .005, .002, .001, .0005, .0002, .0001, .00005, .00002, .00001];
  const STEP_DMS = [10, 5, 2, 1, 30 / 60, 20 / 60, 10 / 60, 5 / 60, 2 / 60, 1 / 60, 30 / 3600, 20 / 3600, 10 / 3600, 5 / 3600, 2 / 3600, 1 / 3600, .5 / 3600];
  const STEP_M = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];

  // ukuran halaman (mm). Custom: cw x ch dalam cm; orientasi menentukan sisi mana yang lebar.
  function pageMm(size, orient, cw, ch) {
    let w, h;
    if (size === 'custom') { w = (+cw || 0) * 10; h = (+ch || 0) * 10 } else { const p = PAPER[size] || PAPER.A4; w = p[0]; h = p[1] }
    const lo = Math.min(w, h), hi = Math.max(w, h);
    return orient === 'portrait' ? [lo, hi] : [hi, lo];
  }
  // dpi efektif: turunkan bila jumlah piksel melebihi batas memori kanvas WebView
  const MAX_PX = 24e6, MAX_SIDE = 16000;
  function effDpi(Wmm, Hmm, dpi) {
    let d = dpi; const px = d => [Math.round(Wmm / 25.4 * d), Math.round(Hmm / 25.4 * d)];
    for (let i = 0; i < 200; i++) { const [w, h] = px(d); if (w * h <= MAX_PX && w <= MAX_SIDE && h <= MAX_SIDE) break; d *= .97 }
    return Math.max(30, Math.floor(d));
  }

  // wilayah tampil: pusat Mercator + meter-Mercator per mm kertas (mpm) + penyebut skala N.
  // Otomatis: muat seluruh `bounds` (+ ruang kosong pad) lalu skala dibulatkan ke atas; custom: skala 1:scaleN di pusat bounds.
  function computeView(b, fwMm, fhMm, scaleMode, scaleN, pad) {
    const [x0, y0] = merc(b.w, b.s), [x1, y1] = merc(b.e, b.n);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, k = Math.cos(unmerc(cx, cy)[1] * DEG);
    let mpm, N;
    if (scaleMode === 'custom' && scaleN > 0) { N = scaleN; mpm = N / 1000 / k }
    else {
      const minM = 250 / k, p = 1 + 2 * (pad || 0), bw = Math.max((x1 - x0) * p, minM), bh = Math.max((y1 - y0) * p, minM);
      mpm = Math.max(bw / fwMm, bh / fhMm); N = niceScaleN(mpm * k * 1000); mpm = N / 1000 / k;
    }
    return { cx, cy, mpm, N, k };
  }

  // ---------- grid ----------
  const hemi = (v, pos, neg) => v < 0 ? neg : pos;
  function fmtDeg(v, step, dms, isLon) {
    const a = Math.abs(v), suf = isLon ? hemi(v, 'BT', 'BB') : hemi(v, 'LU', 'LS');
    if (!dms) { const dec = step >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(step) - 1e-9)); return a.toFixed(dec) + '° ' + suf }
    const t = Math.round(a * 3600 * 10) / 10, d = Math.floor(t / 3600 + 1e-9), m = Math.floor((t - d * 3600) / 60 + 1e-9), s = Math.round((t - d * 3600 - m * 60) * 10) / 10;
    if (step >= 1 - 1e-9) return `${d}° ${suf}`;
    if (step >= 1 / 60 - 1e-9) return `${d}°${String(m).padStart(2, '0')}' ${suf}`;
    return `${d}°${String(m).padStart(2, '0')}'${(step < 1 / 3600 - 1e-9 ? s.toFixed(1) : String(Math.round(s)).padStart(2, '0'))}" ${suf}`;
  }
  const utmZone = lon => clamp(Math.floor((lon + 180) / 6) + 1, 1, 60);
  const utmDef = (z, south) => `+proj=utm +zone=${z}${south ? ' +south' : ''} +datum=WGS84 +units=m +no_defs`;
  // titik potong polilin (piksel) dengan garis horizontal y=v / vertikal x=v
  function crossAt(poly, v, axis) {
    for (let i = 1; i < poly.length; i++) {
      const a = poly[i - 1], b = poly[i], ca = a[axis], cb = b[axis];
      if ((ca - v) * (cb - v) <= 0 && ca !== cb) { const t = (v - ca) / (cb - ca); return a[1 - axis] + t * (b[1 - axis] - a[1 - axis]) }
    }
    return null;
  }

  // ---------- teks ----------
  function fitText(ctx, s, maxW) {
    if (ctx.measureText(s).width <= maxW) return s;
    let t = s; while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t.trimEnd() + '…';
  }
  // bungkus teks per kata (hormati baris baru); maxLines terlampaui -> baris terakhir diberi "…"
  function wrapText(ctx, text, maxW, maxLines) {
    const tk = []; String(text || '').split(/\r?\n/).forEach((p, i) => { if (i) tk.push('\n'); p.split(/\s+/).filter(Boolean).forEach(w => tk.push(w)) });
    const lines = [], fits = s => ctx.measureText(s).width <= maxW; let cur = '', i = 0;
    while (i < tk.length && lines.length < maxLines) {
      const w = tk[i];
      if (w === '\n') { lines.push(cur); cur = ''; i++; continue }
      const t = cur ? cur + ' ' + w : w;
      if (fits(t)) { cur = t; i++; continue }
      if (cur) { lines.push(cur); cur = ''; continue }
      let k = w.length; while (k > 1 && !fits(w.slice(0, k))) k--;            // satu kata lebih panjang dari baris: potong
      lines.push(w.slice(0, k)); tk[i] = w.slice(k); if (!tk[i]) i++;
    }
    if (cur && lines.length < maxLines) { lines.push(cur); cur = '' }
    const trunc = cur !== '' || tk.slice(i).some(t => t !== '\n');
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    if (trunc && lines.length) lines[lines.length - 1] = fitText(ctx, lines[lines.length - 1] + '…', maxW);
    return lines;
  }
  const rrect = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath() };

  function svgToImage(svg) {
    return new Promise(res => {
      const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null);
      im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }

  /* =====================================================================
     render(o): menggambar satu halaman peta ke kanvas.
     o.W, o.H            ukuran kertas (mm)         o.dpi             resolusi (piksel/inci)
     o.title, o.desc, o.author, o.dateText          teks halaman (kosong = tidak ditampilkan)
     o.paperLabel        mis. "A3 lanskap" (untuk keterangan skala)
     o.bounds {w,s,e,n}  wilayah yang harus muat    o.scaleMode 'auto'|'custom', o.scaleN, o.pad
     o.base              null | {tileUrl(z,x,y), max, tileMm, cap}   o.loadTile(url) -> Promise<Image|null>
     o.pdfMaps [{img, bounds:[[s,w],[n,e]], op, name}]
     o.features [{type, coords, parts, color, shape, ln, label}]   (koordinat [lon,lat])
     o.symMm             ukuran simbol titik (mm kertas)   o.showLabels, o.grid 'none'|'dd'|'dms'|'utm'
     o.north, o.scalebar, o.logos {tapak, spectra} (string SVG), o.disclaimer
     o.signal {aborted}, o.onProgress(frac, teks), o.createCanvas(w,h)
     ===================================================================== */
  async function render(o) {
    const W = o.W, H = o.H, dpi = effDpi(W, H, o.dpi || 150), pxmm = dpi / 25.4;
    const Wpx = Math.round(W * pxmm), Hpx = Math.round(H * pxmm), u = clamp(Math.min(W, H) / 210, .45, 4);
    const U = v => v * u * pxmm, P = v => v * pxmm;
    const stop = () => { if (o.signal && o.signal.aborted) throw new Error('aborted') }, prog = (f, t) => o.onProgress && o.onProgress(f, t);
    const cv = (o.createCanvas || ((w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }))(Wpx, Hpx);
    const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const info = { dpi, Wpx, Hpx, scaleN: 0, tiles: { total: 0, ok: 0, failed: 0, z: null }, labelsSkipped: 0, notes: [] };
    if (root.document && document.fonts) { try { await Promise.all(['800 20px Manrope', '600 20px Inter', '500 20px Inter', '400 20px Inter'].map(f => document.fonts.load(f))) } catch (e) { } }
    stop(); prog(.02, 'Menyiapkan layout');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, Wpx, Hpx); ctx.textBaseline = 'top';

    // ----- tata letak halaman (px) -----
    const x0 = U(7), x1 = Wpx - U(7), cw = x1 - x0, hasGrid = o.grid && o.grid !== 'none';
    let y = U(7), tLines = [], tSize = 0, dLines = [];
    if (o.title && o.title.trim()) {
      for (let s = 7.4; s >= 4.2; s -= .4) {
        tSize = U(s); ctx.font = `800 ${tSize}px ${FH}`; tLines = wrapText(ctx, o.title.trim(), cw, 2);
        if (!/…$/.test(tLines[tLines.length - 1] || '') || /…$/.test(o.title.trim())) break;          // muat tanpa dipotong
      }
    }
    const tH = tLines.length * tSize * 1.18;
    if (o.desc && o.desc.trim()) {
      const dSize = U(3.3); ctx.font = `400 ${dSize}px ${FB}`;
      const maxL = clamp(Math.floor((Hpx * .2 - tH) / (dSize * 1.4)), 1, 5); dLines = wrapText(ctx, o.desc.trim(), cw, maxL);
    }
    const dSize = U(3.3), dH = dLines.length * dSize * 1.4;
    let hb = y; if (tLines.length) hb += tH; if (dLines.length) hb += (tLines.length ? U(1.2) : 0) + dH;
    const hasHead = tLines.length || dLines.length; if (hasHead) hb += U(2.2); const ruleY = hb; if (hasHead) hb += U(.9) + U(2.2);

    // kaki halaman: baris info + baris logo/disclaimer
    const logoH = U(6.2), info1 = [];
    if (o.author && o.author.trim()) info1.push(['DIBUAT OLEH', o.author.trim()]);
    if (o.dateText) info1.push(['TANGGAL EKSPOR', o.dateText]);
    let logoW = 0; const logoImgs = {};
    if (o.logos) {
      logoImgs.tapak = o.logos.tapak ? await svgToImage(o.logos.tapak) : null; logoImgs.spectra = o.logos.spectra ? await svgToImage(o.logos.spectra) : null;
      ctx.font = `800 ${U(3.4)}px ${FH}`;
      logoW = (logoImgs.tapak ? logoH * logoImgs.tapak.width / logoImgs.tapak.height + U(1.6) + ctx.measureText('TAPAK').width + U(4) : 0) + (logoImgs.spectra ? logoH * logoImgs.spectra.width / logoImgs.spectra.height + U(1.6) + ctx.measureText('Spectra CC').width : 0);
    }
    const disSize = U(2.15); ctx.font = `400 ${disSize}px ${FB}`;
    const disW = cw - (logoW ? logoW + U(5) : 0), disLines = o.disclaimer ? wrapText(ctx, o.disclaimer, Math.max(disW, U(40)), 3) : [];
    const rowH = Math.max(o.logos ? logoH : 0, disLines.length * disSize * 1.38), infoH = U(8.6);
    const fb = Hpx - U(6.5), footH = infoH + U(2.4) + rowH + U(1.6), fTop = fb - footH;

    // bingkai peta
    const ring = hasGrid ? U(8) : U(1.6), fx = x0 + ring, fy = hb + ring, fw = cw - 2 * ring, fh = fTop - U(2.2) - fy - ring;
    if (fw < U(40) || fh < U(30)) throw new Error('Ukuran kertas terlalu kecil untuk memuat layout peta');
    const fwMm = fw / pxmm, fhMm = fh / pxmm;
    const vw = computeView(o.bounds, fwMm, fhMm, o.scaleMode, +o.scaleN, o.pad == null ? .05 : o.pad);
    info.scaleN = vw.N; info.frame = { w: fwMm, h: fhMm };
    const X = xm => fx + fw / 2 + (xm - vw.cx) / vw.mpm * pxmm, Yc = ym => fy + fh / 2 - (ym - vw.cy) / vw.mpm * pxmm;
    const toPx = (lon, lat) => { const m = merc(lon, lat); return [X(m[0]), Yc(m[1])] };
    const half = { x: fwMm / 2 * vw.mpm, y: fhMm / 2 * vw.mpm };
    const ext = { x0: vw.cx - half.x, x1: vw.cx + half.x, y0: vw.cy - half.y, y1: vw.cy + half.y };   // meter Mercator
    const ll0 = unmerc(ext.x0, ext.y0), ll1 = unmerc(ext.x1, ext.y1);                                     // [lon,lat] kiri-bawah & kanan-atas
    info.extent = { w: ll0[0], s: ll0[1], e: ll1[0], n: ll1[1] };

    // ----- kepala -----
    stop();
    if (hasHead) {
      let ty = U(7); ctx.fillStyle = NAVY; ctx.font = `800 ${tSize}px ${FH}`;
      tLines.forEach(l => { ctx.fillText(l, x0, ty); ty += tSize * 1.18 });
      if (dLines.length) { ty += tLines.length ? U(1.2) : 0; ctx.fillStyle = '#3B4852'; ctx.font = `400 ${dSize}px ${FB}`; dLines.forEach(l => { ctx.fillText(l, x0, ty); ty += dSize * 1.4 }) }
      [NAVY, TEAL, GREEN].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(x0 + cw / 3 * i, ruleY, cw / 3 + 1, U(.9)) });
    }

    // ----- isi peta (dipotong ke bingkai) -----
    ctx.save(); ctx.beginPath(); ctx.rect(fx, fy, fw, fh); ctx.clip(); ctx.fillStyle = '#fff'; ctx.fillRect(fx, fy, fw, fh);
    // basemap online
    if (o.base && o.loadTile) {
      const b = o.base, cap = b.cap || 120; let z = clamp(Math.round(Math.log2(WORLD / 256 / (vw.mpm * (b.tileMm || .2)))), 0, b.max || 19);
      const range = z => { const n = 1 << z, f = v => Math.floor(v); return { n, a: clamp(f((ext.x0 + HALF) / WORLD * n), 0, n - 1), b: clamp(f((ext.x1 + HALF) / WORLD * n), 0, n - 1), c: clamp(f((HALF - ext.y1) / WORLD * n), 0, n - 1), d: clamp(f((HALF - ext.y0) / WORLD * n), 0, n - 1) } };
      let r = range(z); while ((r.b - r.a + 1) * (r.d - r.c + 1) > cap && z > 0) { z--; r = range(z) }
      const list = []; for (let ty = r.c; ty <= r.d; ty++) for (let tx = r.a; tx <= r.b; tx++) list.push([tx, ty]);
      info.tiles.total = list.length; info.tiles.z = z; let done = 0;
      const imgs = new Array(list.length);
      let next = 0; await Promise.all(Array.from({ length: Math.min(6, list.length) }, async () => {
        while (next < list.length && !(o.signal && o.signal.aborted)) {
          const i = next++, [tx, ty] = list[i]; let im = null;
          try { im = await o.loadTile(b.tileUrl(z, tx, ty)) } catch (e) { }
          imgs[i] = im; if (im) info.tiles.ok++; else info.tiles.failed++;
          prog(.05 + .6 * (++done / list.length), `Memuat basemap ${done}/${list.length}`);
        }
      }));
      stop();
      list.forEach(([tx, ty], i) => {
        if (!imgs[i]) return; const n = r.n, xa = tx / n * WORLD - HALF, xb = (tx + 1) / n * WORLD - HALF, ya = HALF - ty / n * WORLD, yb = HALF - (ty + 1) / n * WORLD;
        const l = Math.floor(X(xa)), t = Math.floor(Yc(ya)), rr = Math.ceil(X(xb)), bb = Math.ceil(Yc(yb)); ctx.drawImage(imgs[i], l, t, rr - l, bb - t)
      });
    }
    prog(.7, 'Menggambar peta');
    // peta PDF berreferensi (dasar offline)
    for (const m of (o.pdfMaps || [])) {
      if (!m.img) continue; const a = merc(m.bounds[0][1], m.bounds[0][0]), c = merc(m.bounds[1][1], m.bounds[1][0]);
      const l = X(a[0]), rr = X(c[0]), t = Yc(c[1]), bb = Yc(a[1]); ctx.globalAlpha = m.op == null ? 1 : m.op; ctx.drawImage(m.img, l, t, rr - l, bb - t); ctx.globalAlpha = 1;
    }
    // grid (garis di dalam bingkai; label dikumpulkan lalu digambar di luar bingkai)
    const glab = []; let gridNote = '';
    if (hasGrid) {
      ctx.strokeStyle = 'rgba(23,50,77,.62)'; ctx.lineWidth = Math.max(1, U(.17)); ctx.beginPath();
      const wantN = Math.max(2, fwMm / (46 * u));
      if (o.grid === 'utm' && root.proj4) {
        const lonc = unmerc(vw.cx, vw.cy)[0], latc = unmerc(vw.cx, vw.cy)[1], zone = utmZone(lonc), south = latc < 0, prj = root.proj4(utmDef(zone, south));
        gridNote = `UTM zona ${zone}${south ? 'S' : 'N'}`; info.utm = { zone, south };
        const pts = []; for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) pts.push(prj.forward(unmerc(ext.x0 + (ext.x1 - ext.x0) * i / 4, ext.y0 + (ext.y1 - ext.y0) * j / 4)));
        const E0 = Math.min(...pts.map(p => p[0])), E1 = Math.max(...pts.map(p => p[0])), N0 = Math.min(...pts.map(p => p[1])), N1 = Math.max(...pts.map(p => p[1]));
        const step = nearestLog(vw.N * fwMm / 1000 / wantN, STEP_M), thou = v => fmtInt(v);
        const line = (fixed, isE) => {
          const a = isE ? N0 - step : E0 - step, b = isE ? N1 + step : E1 + step, poly = [];
          for (let k = 0; k <= 16; k++) { const t = a + (b - a) * k / 16, ll = prj.inverse(isE ? [fixed, t] : [t, fixed]); poly.push(toPx(ll[0], ll[1])) }
          poly.forEach((p, k) => k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); return poly;
        };
        for (let E = Math.ceil(E0 / step) * step; E <= E1; E += step) { const p = line(E, true), a = crossAt(p, fy, 1), b = crossAt(p, fy + fh, 1); if (a != null) glab.push({ s: 't', p: a, t: thou(E) + ' mT' }); if (b != null) glab.push({ s: 'b', p: b, t: thou(E) + ' mT' }) }
        for (let N = Math.ceil(N0 / step) * step; N <= N1; N += step) { const p = line(N, false), a = crossAt(p, fx, 0), b = crossAt(p, fx + fw, 0); if (a != null) glab.push({ s: 'l', p: a, t: thou(N) + ' mU' }); if (b != null) glab.push({ s: 'r', p: b, t: thou(N) + ' mU' }) }
        info.gridStep = step;
      } else {
        const dms = o.grid === 'dms', step = nearestLog((ll1[0] - ll0[0]) / wantN, dms ? STEP_DMS : STEP_DD), eps = step * 1e-6;
        for (let k = Math.ceil(ll0[0] / step - 1e-9); k * step <= ll1[0] + eps; k++) { const lon = k * step, xx = toPx(lon, ll0[1])[0]; ctx.moveTo(xx, fy); ctx.lineTo(xx, fy + fh); const t = fmtDeg(lon, step, dms, true); glab.push({ s: 't', p: xx, t }, { s: 'b', p: xx, t }) }
        for (let k = Math.ceil(ll0[1] / step - 1e-9); k * step <= ll1[1] + eps; k++) { const lat = k * step, yy = toPx(ll0[0], lat)[1]; ctx.moveTo(fx, yy); ctx.lineTo(fx + fw, yy); const t = fmtDeg(lat, step, dms, false); glab.push({ s: 'l', p: yy, t }, { s: 'r', p: yy, t }) }
        gridNote = dms ? 'Grid geografis (derajat-menit-detik)' : 'Grid geografis (derajat desimal)'; info.gridStep = step;
      }
      ctx.stroke();
    }
    info.gridNote = gridNote;

    // data lapangan: area, jalur, lalu titik
    const symPx = P(o.symMm || 3.6) * u, lw = U(.55), casing = U(1.1), feats = (o.features || []).filter(f => f.coords && f.coords.length);
    const pxPath = c => { const r = []; let lx = -1e9, ly = -1e9; c.forEach((q, i) => { const p = toPx(q[0], q[1]); if (i == 0 || i == c.length - 1 || Math.abs(p[0] - lx) + Math.abs(p[1] - ly) > .3) { r.push(p); lx = p[0]; ly = p[1] } }); return r };
    const trace = pts => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])) };
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const f of feats) if (f.type === 'Polygon') {
      const pts = pxPath(f.coords); trace(pts); ctx.closePath(); ctx.fillStyle = f.color; ctx.globalAlpha = .22; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = casing; ctx.setLineDash([]); ctx.stroke();
      const d = DASH[f.ln]; ctx.strokeStyle = f.color; ctx.lineWidth = lw; ctx.setLineDash(d ? d.map(v => v * lw) : []); ctx.stroke(); ctx.setLineDash([]);
    }
    for (const f of feats) if (f.type === 'LineString') {
      const ps = (f.parts && f.parts.length ? f.parts : [f.coords]).map(pxPath);
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = casing; ctx.setLineDash([]); ps.forEach(p => { trace(p); ctx.stroke() });
      const d = DASH[f.ln]; ctx.strokeStyle = f.color; ctx.lineWidth = lw; ctx.setLineDash(d ? d.map(v => v * lw) : []); ps.forEach(p => { trace(p); ctx.stroke() }); ctx.setLineDash([]);
    }
    const sp = {}; for (const k in SHAPE_D) sp[k] = new Path2D(SHAPE_D[k]);
    const placed = [], pointPx = [];
    for (const f of feats) if (f.type === 'Point') {
      const [px, py] = toPx(f.coords[0][0], f.coords[0][1]); if (px < fx - symPx || px > fx + fw + symPx || py < fy - symPx || py > fy + fh + symPx) continue;
      const k = symPx / 24; ctx.save(); ctx.translate(px, py); ctx.scale(k, k); ctx.translate(-12, -12); ctx.lineJoin = 'round';
      const path = sp[f.shape] || sp.circle; ctx.strokeStyle = 'rgba(23,50,77,.7)'; ctx.lineWidth = 3.6; ctx.stroke(path); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.2; ctx.stroke(path); ctx.fillStyle = f.color; ctx.fill(path); ctx.restore();
      placed.push([px - symPx / 2, py - symPx / 2, symPx, symPx]); pointPx.push([f, px, py]);
    }
    // label (hindari tumpang tindih; yang tidak muat dihitung dan dilaporkan)
    if (o.showLabels) {
      const ls = U(2.7), pad = U(.5); ctx.font = `600 ${ls}px ${FB}`; ctx.textBaseline = 'middle';
      const lab = f => (f.label || '').trim(), hit = (a, b) => a[0] < b[0] + b[2] - .5 && a[0] + a[2] > b[0] + .5 && a[1] < b[1] + b[3] - .5 && a[1] + a[3] > b[1] + .5;   // toleransi 0,5 px: sentuhan tepi bukan tumpang tindih
      const inside = r => r[0] >= fx && r[1] >= fy && r[0] + r[2] <= fx + fw && r[1] + r[3] <= fy + fh;
      const todo = [];
      for (const [f, px, py] of pointPx) if (lab(f)) todo.push({ t: fitText(ctx, lab(f), U(60)), c: [[px + symPx / 2 + pad, py, 'l'], [px - symPx / 2 - pad, py, 'r'], [px, py - symPx / 2 - ls * .8, 'c'], [px, py + symPx / 2 + ls * .8, 'c']] });
      for (const f of feats) if (f.type !== 'Point' && lab(f)) {
        let a;
        if (f.type === 'Polygon') { const q = pxPath(f.coords); let sx = 0, sy = 0; q.forEach(p => { sx += p[0]; sy += p[1] }); a = [sx / q.length, sy / q.length] }
        else { const q = (f.parts && f.parts.length ? f.parts.reduce((m, p) => p.length > m.length ? p : m, f.parts[0]) : f.coords), pp = pxPath(q), seg = []; let tot = 0; for (let i = 1; i < pp.length; i++) { const d = Math.hypot(pp[i][0] - pp[i - 1][0], pp[i][1] - pp[i - 1][1]); seg.push(d); tot += d } let acc = 0, i = 0; while (i < seg.length - 1 && acc + seg[i] < tot / 2) { acc += seg[i]; i++ } const t = seg[i] ? (tot / 2 - acc) / seg[i] : 0; a = pp.length > 1 ? [pp[i][0] + (pp[i + 1][0] - pp[i][0]) * t, pp[i][1] + (pp[i + 1][1] - pp[i][1]) * t] : pp[0] }
        todo.push({ t: fitText(ctx, lab(f), U(60)), c: [[a[0], a[1] - ls * .9, 'c'], [a[0], a[1] + ls * .9, 'c'], [a[0], a[1], 'c']] });
      }
      ctx.lineJoin = 'round';
      for (const L of todo) {
        const w = ctx.measureText(L.t).width, h = ls * 1.25; let ok = false;
        for (const [cx, cy, al] of L.c) {
          const rx = al === 'l' ? cx : al === 'r' ? cx - w : cx - w / 2, r = [rx - pad, cy - h / 2, w + 2 * pad, h];
          if (!inside(r) || placed.some(p => hit(r, p))) continue;
          ctx.textAlign = al === 'c' ? 'center' : al === 'l' ? 'left' : 'right'; ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = U(.8); ctx.strokeText(L.t, cx, cy); ctx.fillStyle = NAVY; ctx.fillText(L.t, cx, cy);
          placed.push(r); ok = true; break;
        }
        if (!ok) info.labelsSkipped++;
      }
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    }

    // arah utara & skala (kartu putih di dalam bingkai)
    const card = (x, y, w, h) => { rrect(ctx, x, y, w, h, U(1.2)); ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fill(); ctx.strokeStyle = 'rgba(23,50,77,.35)'; ctx.lineWidth = Math.max(1, U(.2)); ctx.stroke() };
    if (o.north !== false) {
      const w = U(11), h = U(15.5), x = fx + fw - w - U(2.5), yy = fy + U(2.5), cx = x + w / 2; card(x, yy, w, h);
      ctx.fillStyle = NAVY; ctx.font = `800 ${U(4)}px ${FH}`; ctx.textAlign = 'center'; ctx.fillText('U', cx, yy + U(1.2)); ctx.textAlign = 'left';
      const tip = yy + U(6.4), base = yy + h - U(1.8), hw = U(2.7), notch = base - U(2.8);
      ctx.beginPath(); ctx.moveTo(cx, tip); ctx.lineTo(cx - hw, base); ctx.lineTo(cx, notch); ctx.closePath(); ctx.fillStyle = NAVY; ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx, tip); ctx.lineTo(cx + hw, base); ctx.lineTo(cx, notch); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = NAVY; ctx.lineWidth = Math.max(1, U(.3)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, tip); ctx.lineTo(cx - hw, base); ctx.lineTo(cx, notch); ctx.lineTo(cx + hw, base); ctx.closePath(); ctx.stroke();
    }
    if (o.scalebar !== false) {
      const gm = vw.N / 1000, target = 50 * u * gm, mag = Math.pow(10, Math.floor(Math.log10(target)));        // gm = meter tanah per mm kertas
      const nice = [5, 2, 1].map(m => m * mag).find(v => v <= target) || mag, barMm = nice / gm, barPx = P(barMm);
      const nseg = nice / mag === 5 ? 5 : 4, lab = v => v >= 1000 ? +(v / 1000).toFixed(2) + ' km' : +v.toFixed(1) + ' m';
      const text = `Skala 1:${fmtInt(vw.N)}`; ctx.font = `700 ${U(2.8)}px ${FB}`; const tw = ctx.measureText(text).width;
      const w = Math.max(barPx + U(14), tw + U(5)), h = U(12.2), x = fx + U(2.5), yy = fy + fh - h - U(2.5); card(x, yy, w, h);
      ctx.fillStyle = NAVY; ctx.fillText(text, x + U(2.5), yy + U(1.8));
      const bx = x + U(3), by = yy + U(6), bh = U(1.5), sw = barPx / nseg;
      for (let i = 0; i < nseg; i++) { ctx.fillStyle = i % 2 ? '#fff' : NAVY; ctx.fillRect(bx + sw * i, by, sw, bh) }
      ctx.strokeStyle = NAVY; ctx.lineWidth = Math.max(1, U(.25)); ctx.strokeRect(bx, by, barPx, bh);
      ctx.font = `500 ${U(2.3)}px ${FB}`; ctx.textAlign = 'center'; ctx.fillStyle = NAVY;
      const marks = nseg === 4 ? [0, 2, 4] : [0, 5]; marks.forEach(i => ctx.fillText(i === 0 ? '0' : lab(nice * i / nseg), bx + sw * i, by + bh + U(.7))); ctx.textAlign = 'left';
      info.scaleBar = { meters: nice, mm: barMm };
    }
    ctx.restore();

    // ----- bingkai & label grid (di luar bingkai) -----
    ctx.strokeStyle = NAVY; ctx.lineWidth = Math.max(1.2, U(.45)); ctx.strokeRect(fx, fy, fw, fh);
    if (hasGrid) {
      ctx.lineWidth = Math.max(1, U(.18)); ctx.strokeRect(fx - ring + U(.8), fy - ring + U(.8), fw + 2 * ring - U(1.6), fh + 2 * ring - U(1.6));
      const gs = U(2.5); ctx.font = `500 ${gs}px ${FB}`; ctx.fillStyle = NAVY; ctx.strokeStyle = NAVY; ctx.lineWidth = Math.max(1, U(.2)); ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      const tk = U(1.2), lastEnd = { t: -1e9, b: -1e9, l: -1e9, r: -1e9 };
      glab.sort((a, b) => a.p - b.p);
      for (const g of glab) {
        const w = ctx.measureText(g.t).width, lo = g.p - w / 2; if (lo < lastEnd[g.s] + U(1.5)) continue;
        if (g.s === 't' || g.s === 'b') {
          if (g.p < fx + U(2) || g.p > fx + fw - U(2)) continue; const edge = g.s === 't' ? fy : fy + fh, dir = g.s === 't' ? -1 : 1;
          ctx.beginPath(); ctx.moveTo(g.p, edge); ctx.lineTo(g.p, edge + dir * tk); ctx.stroke(); ctx.fillText(g.t, g.p, edge + dir * (tk + gs * .75)); lastEnd[g.s] = g.p + w / 2
        } else {
          if (g.p < fy + U(2) || g.p > fy + fh - U(2)) continue; const edge = g.s === 'l' ? fx : fx + fw, dir = g.s === 'l' ? -1 : 1;
          ctx.beginPath(); ctx.moveTo(edge, g.p); ctx.lineTo(edge + dir * tk, g.p); ctx.stroke();
          ctx.save(); ctx.translate(edge + dir * (tk + gs * .75), g.p); ctx.rotate(-Math.PI / 2); ctx.fillText(g.t, 0, 0); ctx.restore(); lastEnd[g.s] = g.p + w / 2
        }
      }
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    }

    // ----- kaki halaman -----
    stop();
    const crs = o.grid === 'utm' && info.utm ? `WGS 84 · UTM zona ${info.utm.zone}${info.utm.south ? 'S' : 'N'}` : hasGrid ? 'WGS 84 · koordinat geografis' : 'WGS 84 · Web Mercator';
    info1.push(['SKALA' + (o.paperLabel ? ' (KERTAS ' + o.paperLabel.toUpperCase() + ')' : ''), `1:${fmtInt(vw.N)}`]); info1.push(['SISTEM KOORDINAT', crs]);
    ctx.fillStyle = '#C7D5DD'; ctx.fillRect(x0, fTop, cw, Math.max(1, U(.25)));
    const colW = cw / info1.length;
    info1.forEach(([cap, val], i) => {
      const cx = x0 + colW * i + (i ? U(2) : 0), mw = colW - U(3);
      ctx.fillStyle = MUTED; ctx.font = `600 ${U(1.9)}px ${FB}`; ctx.fillText(fitText(ctx, cap, mw), cx, fTop + U(1.8));
      ctx.fillStyle = NAVY; ctx.font = `600 ${U(3)}px ${FB}`; ctx.fillText(fitText(ctx, val, mw), cx, fTop + U(1.8) + U(3.3));
    });
    const ry = fTop + infoH + U(1.2); let lx = x0;
    if (o.logos) {
      const drawLogo = (im, text) => { if (!im) return; const lh = logoH, lw2 = lh * im.width / im.height; ctx.drawImage(im, lx, ry, lw2, lh); lx += lw2 + U(1.6); ctx.fillStyle = NAVY; ctx.font = `800 ${U(3.4)}px ${FH}`; ctx.textBaseline = 'middle'; ctx.fillText(text, lx, ry + lh / 2); lx += ctx.measureText(text).width; ctx.textBaseline = 'top' };
      drawLogo(logoImgs.tapak, 'TAPAK'); if (logoImgs.tapak && logoImgs.spectra) lx += U(4); drawLogo(logoImgs.spectra, 'Spectra CC');
    }
    if (disLines.length) {
      ctx.fillStyle = MUTED; ctx.font = `400 ${disSize}px ${FB}`; const dx = o.logos ? lx + U(5) : x0, mx = x1 - dx; ctx.textAlign = o.logos ? 'right' : 'left';
      let yy = ry + Math.max(0, (rowH - disLines.length * disSize * 1.38) / 2);
      disLines.forEach(l => { ctx.fillText(fitText(ctx, l, mx), o.logos ? x1 : dx, yy); yy += disSize * 1.38 }); ctx.textAlign = 'left';
    }
    ctx.strokeStyle = NAVY; ctx.lineWidth = Math.max(1, U(.25)); ctx.strokeRect(U(3.5), U(3.5), Wpx - U(7), Hpx - U(7));
    prog(1, 'Selesai');
    return { canvas: cv, info };
  }

  // ---------- keluaran berkas ----------
  const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0 };
  // sisipkan chunk pHYs (resolusi cetak) pada PNG agar terbuka dengan ukuran kertas yang benar di GIS/Photoshop/Word
  function pngWithDpi(u8, dpi) {
    const ppm = Math.round(dpi / 0.0254), chunk = new Uint8Array(21), dv = new DataView(chunk.buffer);
    dv.setUint32(0, 9); chunk.set([0x70, 0x48, 0x59, 0x73], 4); dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1; dv.setUint32(17, crc32(chunk.subarray(4, 17)));
    const at = 33; if (u8.length < at || u8[12] !== 0x49) return u8;     // IHDR harus di awal
    const out = new Uint8Array(u8.length + 21); out.set(u8.subarray(0, at)); out.set(chunk, at); out.set(u8.subarray(at), at + 21); return out;
  }
  // set kepadatan piksel di header JFIF (atau tambahkan APP0 bila tidak ada)
  function jpegWithDpi(u8, dpi) {
    const d = Math.round(dpi);
    if (u8[0] === 0xFF && u8[1] === 0xD8 && u8[2] === 0xFF && u8[3] === 0xE0 && u8[6] === 0x4A && u8[7] === 0x46) { const o = u8.slice(); o[13] = 1; o[14] = d >> 8; o[15] = d & 255; o[16] = d >> 8; o[17] = d & 255; return o }
    const app = new Uint8Array([0xFF, 0xE0, 0, 16, 0x4A, 0x46, 0x49, 0x46, 0, 1, 1, 1, d >> 8, d & 255, d >> 8, d & 255, 0, 0]), o = new Uint8Array(u8.length + app.length);
    o.set(u8.subarray(0, 2)); o.set(app, 2); o.set(u8.subarray(2), 2 + app.length); return o;
  }
  const pdfStr = s => '<FEFF' + Array.from(String(s || '')).map(ch => { const c = ch.codePointAt(0); if (c > 0xFFFF) { const v = c - 0x10000; return [0xD800 + (v >> 10), 0xDC00 + (v & 1023)] } return [c] }).flat().map(c => c.toString(16).padStart(4, '0')).join('').toUpperCase() + '>';
  // PDF satu halaman berisi satu gambar JPEG penuh; ukuran halaman = ukuran kertas sebenarnya (poin 1/72 inci)
  function buildPdf(jpeg, wPx, hPx, wMm, hMm, meta) {
    meta = meta || {}; const enc = new TextEncoder(), pt = v => (v * 72 / 25.4).toFixed(2), d = meta.date || new Date(), p2 = n => String(n).padStart(2, '0');
    const cd = `D:${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`;
    const content = `q ${pt(wMm)} 0 0 ${pt(hMm)} 0 0 cm /Im0 Do Q`, parts = [], offs = []; let pos = 0;
    const add = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); pos += b.length };
    const obj = (n, body, stream) => { offs[n] = pos; add(`${n} 0 obj\n${body}`); if (stream) { add('\nstream\n'); add(stream); add('\nendstream') } add('\nendobj\n') };
    add('%PDF-1.4\n'); add(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>'); obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pt(wMm)} ${pt(hMm)}] /Resources << /XObject << /Im0 4 0 R >> /ProcSet [/PDF /ImageC] >> /Contents 5 0 R >>`);
    obj(4, `<< /Type /XObject /Subtype /Image /Width ${wPx} /Height ${hPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg);
    obj(5, `<< /Length ${content.length} >>`, content);
    obj(6, `<< /Title ${pdfStr(meta.title)} /Author ${pdfStr(meta.author)} /Creator ${pdfStr('TAPAK · Spectra CC')} /Producer ${pdfStr('TAPAK')} /CreationDate (${cd}) >>`);
    const xr = pos; add(`xref\n0 7\n0000000000 65535 f \n`); for (let i = 1; i <= 6; i++) add(String(offs[i]).padStart(10, '0') + ' 00000 n \n');
    add(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xr}\n%%EOF\n`);
    return new Blob(parts, { type: 'application/pdf' });
  }
  const toBlob = (cv, type, q) => new Promise((res, rej) => { try { cv.toBlob(b => b ? res(b) : rej(new Error('Gagal membuat gambar (memori tidak cukup). Turunkan resolusi.')), type, q) } catch (e) { rej(e) } });
  // canvas -> Blob berkas akhir. fmt: 'png' | 'jpg' | 'pdf'
  async function encode(cv, fmt, o) {
    o = o || {};
    if (fmt === 'png') { const u8 = new Uint8Array(await (await toBlob(cv, 'image/png')).arrayBuffer()); return { blob: new Blob([pngWithDpi(u8, o.dpi || 150)], { type: 'image/png' }), ext: 'png' } }
    const u8 = new Uint8Array(await (await toBlob(cv, 'image/jpeg', .92)).arrayBuffer());
    if (fmt === 'jpg') return { blob: new Blob([jpegWithDpi(u8, o.dpi || 150)], { type: 'image/jpeg' }), ext: 'jpg' };
    return { blob: buildPdf(u8, cv.width, cv.height, o.W, o.H, { title: o.title, author: o.author }), ext: 'pdf' };
  }

  const API = { render, encode, pageMm, effDpi, computeView, merc, unmerc, fmtDeg, fmtInt, fmtDateId, ceilSig, niceScaleN, nearestLog, wrapText, fitText, crossAt, utmZone, utmDef, pngWithDpi, jpegWithDpi, buildPdf, crc32, STEP_DD, STEP_DMS, STEP_M, SHAPE_D };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.MapExport = API;
})(typeof window !== 'undefined' ? window : globalThis);
