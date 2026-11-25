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
    if (root.document && document.fonts) { try { await Promise.all(['800 20px Manrope', '700 20px Manrope', 'italic 400 20px Inter', '700 20px Inter', '600 20px Inter', '500 20px Inter', '400 20px Inter'].map(f => document.fonts.load(f))) } catch (e) { } }
    stop(); prog(.02, 'Menyiapkan layout');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, Wpx, Hpx); ctx.textBaseline = 'top';

    // ----- tata letak halaman (px) -----
    // Struktur: bingkai halaman > judul (12 pt) + deskripsi (10 pt) > kanvas peta (grid, utara, skala) > kotak kaki 4 kolom
    // (info | legenda | analisis | sumber + produksi). Ukuran font dalam pt untuk A4, diskalakan dengan u untuk ukuran lain.
    const PT = 25.4 / 72, bpt = p => U(p * PT), hasGrid = o.grid && o.grid !== 'none';
    const x0 = U(5.5), x1 = Wpx - U(5.5), cw = x1 - x0, headTop = U(5.5), dateText = o.dateText || fmtDateId(new Date());
    let tLines = [], tSize = bpt(12), dLines = [];
    if (o.title && o.title.trim()) {
      for (let s = 12; s >= 8; s -= .5) {
        tSize = bpt(s); ctx.font = `700 ${tSize}px ${FH}`; tLines = wrapText(ctx, o.title.trim(), cw, 2);
        if (!/…$/.test(tLines[tLines.length - 1] || '') || /…$/.test(o.title.trim())) break;          // muat tanpa dipotong
      }
    }
    const tH = tLines.length * tSize * 1.25, dSize = bpt(10), dLh = dSize * 1.35;
    if (o.desc && o.desc.trim()) { ctx.font = `italic 400 ${dSize}px ${FB}`; dLines = wrapText(ctx, o.desc.trim(), cw, clamp(Math.floor((Hpx * .12 - tH) / dLh), 1, 4)) }
    const dH = dLines.length * dLh, hasHead = tLines.length || dLines.length;
    const hb = headTop + tH + dH + (hasHead ? U(2.5) : 0);

    // sistem koordinat (zona UTM ditentukan dari titik tengah data, tidak bergantung ukuran bingkai)
    const mA = merc(o.bounds.w, o.bounds.s), mB = merc(o.bounds.e, o.bounds.n), cll = unmerc((mA[0] + mB[0]) / 2, (mA[1] + mB[1]) / 2);
    const crs = o.grid === 'utm' ? `WGS 84 · UTM zona ${utmZone(cll[0])}${cll[1] < 0 ? 'S' : 'N'}` : hasGrid ? 'WGS 84 · koordinat geografis' : 'WGS 84 · Web Mercator';

    // kaki halaman: semua teks 10 pt (A4). Tinggi kaki mengikuti isi; teks yang kepanjangan menambah baris, lalu dipotong dengan "…"
    const fs = bpt(10), flh = fs * 1.32, fpad = U(1.8), fMaxH = Hpx * .27, fb = Hpx - U(5.5);
    const fr = Wpx >= Hpx ? [.31, .20, .19, .30] : [.31, .21, .17, .31], colW = fr.map(f => cw * f), colX = [];
    colW.reduce((a, w, i) => (colX[i] = a, a + w), x0);
    const inW = i => colW[i] - 2 * fpad, maxLn = Math.max(2, Math.floor((fMaxH - 2 * fpad) / flh));
    const wrapAll = (arr, w, perItem, budget) => {
      const out = []; let cut = false;
      for (let i = 0; i < arr.length; i++) {
        if (out.length >= budget) { cut = true; break }
        out.push(...wrapText(ctx, arr[i], w, Math.min(perItem, budget - out.length)));
      }
      if (cut && out.length) out[out.length - 1] = fitText(ctx, out[out.length - 1] + '…', w);
      return out;
    };
    ctx.font = `400 ${fs}px ${FB}`;
    const c1 = []; if (o.author && o.author.trim()) c1.push('Dibuat oleh: ' + o.author.trim()); if (o.loc && o.loc.trim()) c1.push('Lokasi survey: ' + o.loc.trim());
    c1.push('Tanggal pembuatan: ' + dateText, 'Ukuran kertas: ' + (o.paperLabel || ''), 'Sistem koordinat: ' + crs);
    const c1L = wrapAll(c1, inW(0), 3, maxLn);
    const symSz = fs * 1.05, legRow = Math.max(flh, symSz * 1.3), h2 = flh + 3 * legRow;
    const c3 = o.analysis ? [`Jumlah titik: ${o.analysis.points}`, `Panjang garis: ${o.analysis.length}`, `Luas area: ${o.analysis.area}`] : ['Analisis tidak disajikan'];
    const c3L = wrapAll(c3, inW(2), 2, maxLn - 1), h3 = flh * (1 + c3L.length);
    // sel "Diproduksi dengan": satu baris bila muat, jika tidak dua baris (teks, lalu logo)
    let logoImgs = {}; if (o.logos) { logoImgs.tapak = o.logos.tapak ? await svgToImage(o.logos.tapak) : null; logoImgs.spectra = o.logos.spectra ? await svgToImage(o.logos.spectra) : null }
    const lgH = fs * 1.9, G = fs * .5, hasLogo = !!(logoImgs.tapak || logoImgs.spectra);
    ctx.font = `400 ${fs}px ${FB}`; const wProd = ctx.measureText('Diproduksi dengan').width, wBy = ctx.measureText('by').width;
    ctx.font = `800 ${fs}px ${FH}`; const wTap = ctx.measureText('TAPAK App').width, wSpc = ctx.measureText('Spectra CC').width;
    const lw1 = logoImgs.tapak ? lgH * logoImgs.tapak.width / logoImgs.tapak.height : 0, lw2 = logoImgs.spectra ? lgH * logoImgs.spectra.width / logoImgs.spectra.height : 0;
    const wLogos = (lw1 ? lw1 + G + wTap : 0) + (lw1 && lw2 ? G * 2 + wBy + G * 2 : 0) + (lw2 ? lw2 + G + wSpc : 0), oneRow = hasLogo && wProd + G * 2 + wLogos <= inW(3);
    const prodH = !hasLogo ? flh * 2 + 2 * fpad * .7 : oneRow ? lgH + 2 * fpad * .7 : flh + lgH + fpad * .7 * 2 + G * .5;
    ctx.font = `400 ${fs}px ${FB}`;
    const srcText = 'Sumber: Hasil pengukuran/survey' + (o.author && o.author.trim() ? ' ' + o.author.trim() : '') + ', ' + dateText + (o.loc && o.loc.trim() ? ', ' + o.loc.trim() : '');
    const c4 = [srcText]; if (o.basemapText) c4.push('Sumber basemap: ' + o.basemapText);
    const c4L = wrapAll(c4, inW(3), 4, Math.max(2, Math.floor((fMaxH - prodH - 2 * fpad) / flh)));
    const footH = Math.max(c1L.length * flh, h2, h3, 0) + 2 * fpad, footH2 = Math.max(footH, c4L.length * flh + 2 * fpad + prodH), fTop = fb - footH2;

    // kanvas peta (kotak) berisi bingkai peta + cincin label grid
    const cvTop = hb, cvBot = fTop - U(2.2), ring = hasGrid ? U(8) : U(1.6), fx = x0 + ring, fy = cvTop + ring, fw = cw - 2 * ring, fh = cvBot - cvTop - 2 * ring;
    if (fw < U(40) || fh < U(30)) throw new Error('Ukuran kertas terlalu kecil untuk memuat layout peta');
    const fwMm = fw / pxmm, fhMm = fh / pxmm;
    const vw = computeView(o.bounds, fwMm, fhMm, o.scaleMode, +o.scaleN, o.pad == null ? .05 : o.pad);
    info.scaleN = vw.N; info.frame = { w: fwMm, h: fhMm }; info.footH = footH2 / pxmm;
    const X = xm => fx + fw / 2 + (xm - vw.cx) / vw.mpm * pxmm, Yc = ym => fy + fh / 2 - (ym - vw.cy) / vw.mpm * pxmm;
    const toPx = (lon, lat) => { const m = merc(lon, lat); return [X(m[0]), Yc(m[1])] };
    const half = { x: fwMm / 2 * vw.mpm, y: fhMm / 2 * vw.mpm };
    const ext = { x0: vw.cx - half.x, x1: vw.cx + half.x, y0: vw.cy - half.y, y1: vw.cy + half.y };   // meter Mercator
    const ll0 = unmerc(ext.x0, ext.y0), ll1 = unmerc(ext.x1, ext.y1);                                     // [lon,lat] kiri-bawah & kanan-atas
    info.extent = { w: ll0[0], s: ll0[1], e: ll1[0], n: ll1[1] };

    // ----- kepala -----
    stop();
    if (hasHead) {
      let ty = headTop; ctx.fillStyle = NAVY; ctx.font = `700 ${tSize}px ${FH}`;
      tLines.forEach(l => { ctx.fillText(l, x0, ty); ty += tSize * 1.25 });
      if (dLines.length) { ctx.fillStyle = '#3B4852'; ctx.font = `italic 400 ${dSize}px ${FB}`; dLines.forEach(l => { ctx.fillText(l, x0, ty); ty += dLh }) }
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
    // arah utara & skala (kartu putih di dalam bingkai)
    const card = (x, y, w, h) => { placed.push([x, y, w, h]); rrect(ctx, x, y, w, h, U(1.2)); ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fill(); ctx.strokeStyle = 'rgba(23,50,77,.35)'; ctx.lineWidth = Math.max(1, U(.2)); ctx.stroke() };
    if (o.north !== false) {
      const w = U(11), h = U(15.5), x = fx + fw - w - U(2.5), yy = fy + U(2.5), cx = x + w / 2; card(x, yy, w, h);
      ctx.fillStyle = NAVY; ctx.font = `800 ${U(4)}px ${FH}`; ctx.textAlign = 'center'; ctx.fillText('U', cx, yy + U(1.2)); ctx.textAlign = 'left';
      const tip = yy + U(6.4), base = yy + h - U(1.8), hw = U(2.7), notch = base - U(2.8);
      ctx.beginPath(); ctx.moveTo(cx, tip); ctx.lineTo(cx - hw, base); ctx.lineTo(cx, notch); ctx.closePath(); ctx.fillStyle = NAVY; ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx, tip); ctx.lineTo(cx + hw, base); ctx.lineTo(cx, notch); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = NAVY; ctx.lineWidth = Math.max(1, U(.3)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, tip); ctx.lineTo(cx - hw, base); ctx.lineTo(cx, notch); ctx.lineTo(cx + hw, base); ctx.closePath(); ctx.stroke();
    }
    if (o.scalebar !== false) {
      const gm = vw.N / 1000, target = Math.min(50 * u, fwMm * .3) * gm, mag = Math.pow(10, Math.floor(Math.log10(target)));        // gm = meter tanah per mm kertas
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

    // label: ukuran font dari o.lblPt (pt untuk A4, diskalakan u). Teks panjang dibungkus (maks 3 baris) lalu dipotong "…";
    // posisi dicoba beberapa arah, menghindari simbol, kartu utara/skala, dan label lain. Yang tak muat dihitung & dilaporkan.
    if (o.showLabels) {
      const ls = U(clamp(+o.lblPt || 8, 4, 24) * PT), pad = U(.7), lh = ls * 1.2, maxW = U(36); ctx.font = `600 ${ls}px ${FB}`; ctx.textBaseline = 'middle';
      const lab = f => (f.label || '').trim(), hit = (a, b) => a[0] < b[0] + b[2] - .5 && a[0] + a[2] > b[0] + .5 && a[1] < b[1] + b[3] - .5 && a[1] + a[3] > b[1] + .5;   // toleransi 0,5 px: sentuhan tepi bukan tumpang tindih
      const inside = r => r[0] >= fx && r[1] >= fy && r[0] + r[2] <= fx + fw && r[1] + r[3] <= fy + fh;
      const todo = [], mk = (txt, c) => { const lines = wrapText(ctx, txt, maxW, 3); return { lines, w: Math.max(...lines.map(l => ctx.measureText(l).width)), c } };
      for (const [f, px, py] of pointPx) if (lab(f)) { const L = mk(lab(f), null), h = L.lines.length * lh, hs = symPx / 2 + pad; L.c = [[px + hs, py, 'l'], [px - hs, py, 'r'], [px, py - hs - h / 2, 'c'], [px, py + hs + h / 2, 'c'], [px + hs, py - h / 2 - hs / 2, 'l'], [px + hs, py + h / 2 + hs / 2, 'l']]; todo.push(L) }
      for (const f of feats) if (f.type !== 'Point' && lab(f)) {
        let a;
        if (f.type === 'Polygon') { const q = pxPath(f.coords); let sx = 0, sy = 0; q.forEach(p => { sx += p[0]; sy += p[1] }); a = [sx / q.length, sy / q.length] }
        else { const q = (f.parts && f.parts.length ? f.parts.reduce((m, p) => p.length > m.length ? p : m, f.parts[0]) : f.coords), pp = pxPath(q), seg = []; let tot = 0; for (let i = 1; i < pp.length; i++) { const d = Math.hypot(pp[i][0] - pp[i - 1][0], pp[i][1] - pp[i - 1][1]); seg.push(d); tot += d } let acc = 0, i = 0; while (i < seg.length - 1 && acc + seg[i] < tot / 2) { acc += seg[i]; i++ } const t = seg[i] ? (tot / 2 - acc) / seg[i] : 0; a = pp.length > 1 ? [pp[i][0] + (pp[i + 1][0] - pp[i][0]) * t, pp[i][1] + (pp[i + 1][1] - pp[i][1]) * t] : pp[0] }
        const L = mk(lab(f), null), h = L.lines.length * lh; L.c = [[a[0], a[1] - h * .8, 'c'], [a[0], a[1] + h * .8, 'c'], [a[0], a[1], 'c'], [a[0] + L.w * .6, a[1] - h, 'c'], [a[0] - L.w * .6, a[1] + h, 'c']]; todo.push(L)
      }
      ctx.lineJoin = 'round';
      for (const L of todo) {
        const h = L.lines.length * lh; let ok = false;
        for (const [cx, cy, al] of L.c) {
          const rx = al === 'l' ? cx : al === 'r' ? cx - L.w : cx - L.w / 2, r = [rx - pad, cy - h / 2, L.w + 2 * pad, h];
          if (!inside(r) || placed.some(p => hit(r, p))) continue;
          ctx.textAlign = al === 'c' ? 'center' : al === 'l' ? 'left' : 'right'; ctx.lineWidth = U(.8); ctx.strokeStyle = 'rgba(255,255,255,.95)';
          L.lines.forEach((t, k) => { const yy = cy - h / 2 + lh * (k + .5); ctx.strokeText(t, cx, yy); ctx.fillStyle = NAVY; ctx.fillText(t, cx, yy) });
          placed.push(r); ok = true; break;
        }
        if (!ok) info.labelsSkipped++;
      }
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    }

    ctx.restore();

    // ----- bingkai & label grid (di luar bingkai) -----
    ctx.strokeStyle = NAVY; ctx.lineWidth = Math.max(1.2, U(.35)); ctx.strokeRect(x0, cvTop, cw, cvBot - cvTop); ctx.lineWidth = Math.max(1, U(.3)); ctx.strokeRect(fx, fy, fw, fh);
    if (hasGrid) {
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

    // ----- kaki halaman (kotak 4 kolom) -----
    stop();
    ctx.strokeStyle = NAVY; ctx.lineWidth = Math.max(1.2, U(.35)); ctx.strokeRect(x0, fTop, cw, footH2);
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(colX[i], fTop); ctx.lineTo(colX[i], fTop + footH2); ctx.stroke() }
    const prodTop = fTop + footH2 - prodH; ctx.beginPath(); ctx.moveTo(colX[3], prodTop); ctx.lineTo(x1, prodTop); ctx.stroke();
    const INK = '#1F2A33', txt = (lines, i, y0) => lines.forEach((l, k) => ctx.fillText(l, colX[i] + fpad, y0 + k * flh));
    ctx.fillStyle = INK; ctx.font = `400 ${fs}px ${FB}`; txt(c1L, 0, fTop + fpad);
    // legenda (tetap 3 baris: titik, jalur, area)
    {
      const lx = colX[1] + fpad, lAv = inW(1); ctx.font = `700 ${fs}px ${FB}`; ctx.fillStyle = INK; ctx.fillText('Legenda', lx, fTop + fpad);
      ctx.font = `400 ${fs}px ${FB}`; const lw = Math.max(...['Titik', 'Jalur', 'Area'].map(t => ctx.measureText(t).width)), sx = lx + lw + fs * .8, av = lAv - lw - fs * .8, lg = o.legend || {};
      const pts = (lg.points && lg.points.length ? lg.points : [{ shape: 'circle', color: TEAL }]), spP = new Path2D(), sp2 = {}; for (const k in SHAPE_D) sp2[k] = new Path2D(SHAPE_D[k]);
      ['Titik', 'Jalur', 'Area'].forEach((name, r) => {
        const cy = fTop + fpad + flh + legRow * r + legRow / 2; ctx.fillStyle = INK; ctx.font = `400 ${fs}px ${FB}`; ctx.textBaseline = 'middle'; ctx.fillText(name, lx, cy);
        if (r === 0) {                                  // semua bentuk simbol titik yang dipakai, berjajar
          const step = symSz * 1.35, cap = Math.max(1, Math.floor(av / step)), show = pts.length > cap ? Math.max(1, cap - 1) : pts.length;
          for (let j = 0; j < show; j++) {
            const k = symSz / 24; ctx.save(); ctx.translate(sx + symSz / 2 + j * step, cy); ctx.scale(k, k); ctx.translate(-12, -12); ctx.lineJoin = 'round';
            const path = sp2[pts[j].shape] || sp2.circle; ctx.strokeStyle = 'rgba(23,50,77,.7)'; ctx.lineWidth = 3.6; ctx.stroke(path); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.2; ctx.stroke(path); ctx.fillStyle = pts[j].color; ctx.fill(path); ctx.restore();
          }
          if (show < pts.length) { ctx.fillStyle = INK; ctx.font = `600 ${fs * .85}px ${FB}`; ctx.fillText('+' + (pts.length - show), sx + show * step, cy) }
        } else if (r === 1) {
          const ex = sx + Math.min(av, fs * 4); ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = U(1.1); ctx.beginPath(); ctx.moveTo(sx, cy); ctx.lineTo(ex, cy); ctx.stroke();
          ctx.strokeStyle = lg.line || TEAL; ctx.lineWidth = U(.55); ctx.beginPath(); ctx.moveTo(sx, cy); ctx.lineTo(ex, cy); ctx.stroke();
        } else {
          const aw = Math.min(av, fs * 3), ah = symSz * 1.05; ctx.beginPath(); ctx.rect(sx, cy - ah / 2, aw, ah); ctx.globalAlpha = .22; ctx.fillStyle = lg.area || TEAL; ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = lg.area || TEAL; ctx.lineWidth = U(.55); ctx.stroke();
        }
      });
      ctx.textBaseline = 'top';
    }
    // analisis (opsional)
    ctx.fillStyle = INK; ctx.font = `700 ${fs}px ${FB}`; ctx.fillText('Analisis', colX[2] + fpad, fTop + fpad); ctx.font = `400 ${fs}px ${FB}`; txt(c3L, 2, fTop + fpad + flh);
    // sumber + produksi
    ctx.font = `400 ${fs}px ${FB}`; txt(c4L, 3, fTop + fpad);
    {
      const px0 = colX[3] + fpad, cy1 = prodTop + (prodH - (oneRow || !hasLogo ? (hasLogo ? lgH : flh) : flh + G * .5 + lgH)) / 2;
      ctx.fillStyle = INK; ctx.font = `400 ${fs}px ${FB}`;
      if (!hasLogo) { ctx.fillText(fitText(ctx, 'Diproduksi dengan TAPAK App', inW(3)), px0, prodTop + fpad * .7); ctx.fillText(fitText(ctx, 'by Spectra CC', inW(3)), px0, prodTop + fpad * .7 + flh) }
      else {
        let lx = px0, ly = cy1; const rowMid = () => ly + lgH / 2;
        if (oneRow) { ctx.textBaseline = 'middle'; ctx.fillText('Diproduksi dengan', lx, rowMid()); lx += wProd + G * 2; ctx.textBaseline = 'top' }
        else { ctx.fillText('Diproduksi dengan', px0, ly); ly += flh + G * .5 }
        const k = oneRow ? 1 : Math.min(1, inW(3) / wLogos);       // baris logo diperkecil bila masih terlalu lebar
        const lh2 = lgH * k, mid = ly + lgH / 2; ctx.textBaseline = 'middle';
        const word = (t, w0) => { ctx.font = `800 ${fs * k}px ${FH}`; ctx.fillStyle = NAVY; ctx.fillText(t, lx, mid); lx += w0 * k };
        if (logoImgs.tapak) { ctx.drawImage(logoImgs.tapak, lx, mid - lh2 / 2, lw1 * k, lh2); lx += (lw1 + G) * k; word('TAPAK App', wTap) }
        if (logoImgs.tapak && logoImgs.spectra) { ctx.font = `400 ${fs * k}px ${FB}`; ctx.fillStyle = INK; lx += G * 2 * k; ctx.fillText('by', lx, mid); lx += (wBy + G * 2) * k }
        if (logoImgs.spectra) { ctx.drawImage(logoImgs.spectra, lx, mid - lh2 / 2, lw2 * k, lh2); lx += (lw2 + G) * k; word('Spectra CC', wSpc) }
        ctx.textBaseline = 'top';
      }
    }
    ctx.strokeStyle = NAVY; ctx.lineWidth = Math.max(1, U(.4)); ctx.strokeRect(U(2.5), U(2.5), Wpx - U(5), Hpx - U(5));
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
