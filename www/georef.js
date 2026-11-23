'use strict';
// ============================================================
// Georef: membaca georeferensi GeoPDF (ISO 32000 /Measure /GEO) dan menaruhnya di Web Mercator.
//
// Mengapa ditulis ulang (v1.3):
//  1. Versi lama mencocokkan satu transformasi affine langsung ke Web Mercator. Peta PDF dari ArcMap/QGIS hampir
//     selalu dalam proyeksi lain (UTM, geografis). Hubungannya dengan Mercator TIDAK affine, jadi makin luas
//     petanya makin melenceng. Sekarang: affine dicocokkan di ruang koordinat ASLI peta (mis. UTM 49S),
//     lalu setiap piksel hasil di-warp dengan proyeksi yang tepat (proj4).
//  2. Versi lama mengambil GPTS/LPTS pertama dan BBox pertama yang ditemukan; bila PDF punya beberapa viewport
//     (peta utama + inset/overview) keduanya bisa berasal dari viewport berbeda. Sekarang tiap viewport
//     dibaca utuh (BBox + Measure + GCS) dan viewport peta utama (terluas) dipilih.
//  3. Objek PDF yang tersimpan dalam object stream terkompresi (PDF 1.5+) kini dibaca (DecompressionStream).
//  4. Hasil dilengkapi diagnosis: CRS yang terbaca, jumlah titik kontrol, dan galat (RMS, meter).
//
// Modul ini murni (tanpa DOM) agar dapat diuji di Node: lihat test/georef.test.js.
// ============================================================
(function (root) {
  const R = 6378137; // jari-jari bola Web Mercator (sama dengan Leaflet EPSG:3857)
  const D2R = Math.PI / 180;
  const P4 = () => root.proj4 || (typeof require === 'function' ? require('proj4') : null);

  // ---------- penguraian sintaks PDF (kamus, larik, nama, angka, string, referensi) ----------
  const NUM = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
  const REF = /\s+(\d+)\s+R(?![A-Za-z0-9])/y;
  const NAME = /[^\s\/\[\]<>()%{}]*/y;
  function ws(s, i) {
    for (; ;) {
      const c = s.charCodeAt(i);
      if (c === 37) { while (i < s.length && s.charCodeAt(i) !== 10 && s.charCodeAt(i) !== 13) i++; continue; }
      if (c <= 32) { if (i >= s.length) return i; i++; continue; }
      return i;
    }
  }
  // nilai: {n:'Nama'} nama | {s:'teks'} string | {r:123} referensi | number | array | object | true/false/null
  function val(s, i, depth) {
    i = ws(s, i);
    if (depth > 40 || i >= s.length) return [null, s.length];
    const c = s[i];
    if (c === '<' && s[i + 1] === '<') {
      i += 2; const o = {};
      for (; ;) {
        i = ws(s, i);
        if (i >= s.length) return [o, i];
        if (s[i] === '>' && s[i + 1] === '>') return [o, i + 2];
        if (s[i] !== '/') { i++; continue; }
        NAME.lastIndex = i + 1; const k = NAME.exec(s)[0]; i = NAME.lastIndex;
        const r = val(s, i, depth + 1); o[k] = r[0]; i = r[1];
      }
    }
    if (c === '[') {
      i++; const a = [];
      for (; ;) {
        i = ws(s, i);
        if (i >= s.length) return [a, i];
        if (s[i] === ']') return [a, i + 1];
        const r = val(s, i, depth + 1); a.push(r[0]); i = r[1];
      }
    }
    if (c === '/') { NAME.lastIndex = i + 1; const n = NAME.exec(s)[0]; return [{ n }, NAME.lastIndex]; }
    if (c === '(') {
      let d = 1, j = i + 1, out = '';
      while (j < s.length && d) {
        const ch = s[j];
        if (ch === '\\') { out += s[j + 1] || ''; j += 2; continue; }
        if (ch === '(') d++; else if (ch === ')') { d--; if (!d) break; }
        out += ch; j++;
      }
      return [{ s: out }, j + 1];
    }
    if (c === '<') { const j = s.indexOf('>', i); const h = s.slice(i + 1, j).replace(/\s+/g, ''); let o = ''; for (let k = 0; k < h.length; k += 2) o += String.fromCharCode(parseInt(h.substr(k, 2).padEnd(2, '0'), 16)); return [{ s: o }, j + 1]; }
    NUM.lastIndex = i; const m = NUM.exec(s);
    if (m) {
      let j = NUM.lastIndex;
      if (/^\d+$/.test(m[0])) { REF.lastIndex = j; const r = REF.exec(s); if (r) return [{ r: +m[0] }, REF.lastIndex]; }
      return [parseFloat(m[0]), j];
    }
    const w = /[A-Za-z]+/y; w.lastIndex = i; const t = w.exec(s);
    if (t) return [t[0] === 'true' ? true : t[0] === 'false' ? false : null, w.lastIndex];
    return [null, i + 1];
  }

  // ---------- indeks objek PDF ----------
  function indexObjects(bytes) {
    const s = new TextDecoder('latin1').decode(bytes), parts = s.split('endobj'), objs = new Map();
    let off = 0;
    for (const ch of parts) {
      const hdr = /(\d+)\s+(\d+)\s+obj\b/.exec(ch.length > 400 ? ch.slice(0, 400) : ch);
      if (hdr) {
        const bodyStart = hdr.index + hdr[0].length, head = ch.slice(bodyStart, bodyStart + 60000);
        const sm = /stream\r?\n/.exec(head);
        const rec = { num: +hdr[1], text: sm ? head.slice(0, sm.index) : head, stream: null };
        if (sm && /\/ObjStm/.test(rec.text)) {
          const a = bodyStart + sm.index + sm[0].length, e = ch.lastIndexOf('endstream');
          if (e > a) rec.stream = [off + a, off + e];
        }
        objs.set(rec.num, rec);
      }
      off += ch.length + 6;
    }
    return objs;
  }
  async function inflate(u8) {
    const ds = new DecompressionStream('deflate'), w = ds.writable.getWriter();
    w.write(u8); w.close();
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
  }
  async function expandObjStm(bytes, objs) {
    if (typeof DecompressionStream === 'undefined') return 0;
    let added = 0;
    for (const rec of [...objs.values()]) {
      if (!rec.stream) continue;
      try {
        const d = val(rec.text, 0, 0)[0] || {};
        if (!d.Type || d.Type.n !== 'ObjStm') continue;
        const n = d.N, first = d.First;
        if (!(n > 0) || !(first >= 0)) continue;
        let a = rec.stream[0], e = rec.stream[1];
        while (e > a && (bytes[e - 1] === 10 || bytes[e - 1] === 13)) e--;
        const txt = new TextDecoder('latin1').decode(await inflate(bytes.subarray(a, e)));
        const nums = txt.slice(0, first).trim().split(/\s+/).map(Number);
        for (let i = 0; i < n; i++) {
          const num = nums[2 * i], o = nums[2 * i + 1], o2 = i + 1 < n ? nums[2 * i + 3] : txt.length - first;
          if (!objs.has(num) || !objs.get(num).text) { objs.set(num, { num, text: txt.slice(first + o, first + o2), stream: null }); added++; }
        }
      } catch (e) { /* objek stream rusak: lewati */ }
    }
    return added;
  }

  const nums = a => Array.isArray(a) ? a.map(x => typeof x === 'number' ? x : NaN) : null;

  // Kumpulkan semua viewport yang punya Measure /GEO. pageNum (opsional) membatasi ke /VP halaman tersebut.
  function collectViewports(objs, pageNum) {
    const cache = new Map();
    const get = n => { if (!cache.has(n)) { const r = objs.get(n); cache.set(n, r ? val(r.text, 0, 0)[0] : null); } return cache.get(n); };
    const res = v => (v && typeof v === 'object' && v.r != null) ? get(v.r) : v;
    const found = [], seen = new Set();
    const consider = (v, from) => {
      v = res(v); if (!v || typeof v !== 'object' || Array.isArray(v)) return;
      if (!v.BBox || !v.Measure) return;
      const bbox = nums(res(v.BBox)), m = res(v.Measure);
      if (!bbox || bbox.length < 4 || !m || typeof m !== 'object') return;
      const sub = m.Subtype && m.Subtype.n;
      const g = nums(res(m.GPTS)), l = nums(res(m.LPTS));
      if (sub && sub !== 'GEO') return;
      if (!g || !l || g.length < 6 || g.length !== l.length || g.some(isNaN) || l.some(isNaN)) return;
      const key = bbox.join(',') + '|' + g.join(',');
      if (seen.has(key)) return; seen.add(key);
      const gcs = res(m.GCS) || {};
      const name = res(v.Name);
      found.push({
        bboxRaw: bbox.slice(0, 4),
        bbox: [
            Math.min(bbox[0], bbox[2]),
            Math.min(bbox[1], bbox[3]),
            Math.max(bbox[0], bbox[2]),
            Math.max(bbox[1], bbox[3])
        ],
        // bbox: [Math.min(bbox[0], bbox[2]), Math.min(bbox[1], bbox[3]), Math.max(bbox[0], bbox[2]), Math.max(bbox[1], bbox[3])],
        gpts: g, lpts: l,
        gcs: { type: gcs.Type && gcs.Type.n, epsg: typeof res(gcs.EPSG) === 'number' ? res(gcs.EPSG) : null, wkt: res(gcs.WKT) && res(gcs.WKT).s || null },
        name: name && name.s || null
      });
      // found.push({
      //   bbox: [Math.min(bbox[0], bbox[2]), Math.min(bbox[1], bbox[3]), Math.max(bbox[0], bbox[2]), Math.max(bbox[1], bbox[3])],
      //   gpts: g, lpts: l,
      //   gcs: { type: gcs.Type && gcs.Type.n, epsg: typeof res(gcs.EPSG) === 'number' ? res(gcs.EPSG) : null, wkt: res(gcs.WKT) && res(gcs.WKT).s || null },
      //   name: name && name.s || null
      // });
    };
    let scoped = false;
    if (pageNum != null && objs.has(pageNum)) {
      const pg = get(pageNum);
      if (pg && pg.VP) { scoped = true; const vp = res(pg.VP); (Array.isArray(vp) ? vp : [vp]).forEach(x => consider(x)); }
    }
    if (!scoped || !found.length) {
      for (const [n] of objs) { const v = get(n); if (v && typeof v === 'object') { consider(v); if (Array.isArray(v)) v.forEach(x => consider(x)); else for (const k in v) { if (Array.isArray(v[k])) v[k].forEach(x => consider(x)); } } }
    }
    return found;
  }

  async function parse(bytes, pageNum) {
    const objs = indexObjects(bytes);
    let vps = collectViewports(objs, pageNum);
    if (!vps.length && await expandObjStm(bytes, objs)) vps = collectViewports(objs, pageNum);
    vps.forEach(v => { v.area = (v.bbox[2] - v.bbox[0]) * (v.bbox[3] - v.bbox[1]); });
    vps.sort((a, b) => b.area - a.area);
    return { viewports: vps, chosen: vps[0] || null };
  }

  // ---------- sistem koordinat ----------
  const utmDef = (z, south) => `+proj=utm +zone=${z}${south ? ' +south' : ''} +datum=WGS84 +units=m +no_defs`;
  // -> {fwd(lon,lat)->[X,Y], inv(X,Y)->[lon,lat], label, geographic, exact}
  function makeCRS(gcs, gptsLonLat) {
    const p4 = P4(); let def = null, label = null, geographic = false;
    const e = gcs && gcs.epsg;
    try {
      if (gcs && gcs.wkt) { def = gcs.wkt; label = (/(?:PROJCS|GEOGCS)\["([^"]+)"/.exec(gcs.wkt) || [])[1] || 'WKT'; geographic = /^\s*GEOGCS/i.test(gcs.wkt); p4('EPSG:4326', def); }
    } catch (err) { def = null; }
    if (!def && e) {
      if (e === 4326 || e === 4979 || e === 4619 || e === 4755 || e === 4238 || e === 4269) { def = '+proj=longlat +datum=WGS84 +no_defs'; label = 'EPSG:' + e; geographic = true; }
      else if (e >= 32601 && e <= 32660) { def = utmDef(e - 32600, false); label = 'WGS 84 / UTM ' + (e - 32600) + 'N (EPSG:' + e + ')'; }
      else if (e >= 32701 && e <= 32760) { def = utmDef(e - 32700, true); label = 'WGS 84 / UTM ' + (e - 32700) + 'S (EPSG:' + e + ')'; }
      else if (e === 3857 || e === 900913) { def = '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs'; label = 'Web Mercator'; }
      else if (e >= 23830 && e <= 23853) { def = utmDef(e - 23800, true); label = 'DGN95 / UTM ' + (e - 23800) + 'S (≈ WGS84)'; }
    }
    if (!def && gcs && gcs.type === 'GEOGCS') { def = '+proj=longlat +datum=WGS84 +no_defs'; label = 'Geografis (lon/lat)'; geographic = true; }
    if (!def) return null;
    let c;
    try { c = p4('EPSG:4326', def); } catch (err) { return null; }
    const f = (lon, lat) => c.forward([lon, lat]), i = (X, Y) => c.inverse([X, Y]);
    // uji bolak-balik pada titik kontrol: bila tidak konsisten, anggap CRS tidak terbaca
    for (let k = 0; k < gptsLonLat.length; k++) {
      const q = f(gptsLonLat[k][0], gptsLonLat[k][1]), b = i(q[0], q[1]);
      if (!isFinite(q[0]) || !isFinite(q[1]) || Math.abs(b[0] - gptsLonLat[k][0]) > 1e-6 || Math.abs(b[1] - gptsLonLat[k][1]) > 1e-6) return null;
    }
    return { fwd: f, inv: i, label: label || 'CRS', geographic, def: typeof def === 'string' && def.length < 300 ? def : 'WKT' };
  }

  const merc = (lon, lat) => [R * lon * D2R, R * Math.log(Math.tan(Math.PI / 4 + Math.max(-85.0511287798, Math.min(85.0511287798, lat)) * D2R / 2))];
  const unmerc = (x, y) => [x / R / D2R, (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) / D2R];
  const gdist = (a, b) => { const k = R * D2R, dx = (a[0] - b[0]) * Math.cos((a[1] + b[1]) / 2 * D2R) * k, dy = (a[1] - b[1]) * k; return Math.hypot(dx, dy); };

  // ---------- kuadrat terkecil affine (dengan pemusatan agar stabil secara numerik) ----------
  // P: [[x, y, X, Y], ...]  =>  X = a x + b y + c ; Y = d x + e y + f
  function fitAffine(P) {
    const n = P.length; if (n < 3) return null;
    let mx = 0, my = 0, mX = 0, mY = 0; P.forEach(p => { mx += p[0]; my += p[1]; mX += p[2]; mY += p[3]; }); mx /= n; my /= n; mX /= n; mY /= n;
    let sxx = 0, sxy = 0, syy = 0, sxX = 0, syX = 0, sxY = 0, syY = 0;
    P.forEach(p => { const x = p[0] - mx, y = p[1] - my, X = p[2] - mX, Y = p[3] - mY; sxx += x * x; sxy += x * y; syy += y * y; sxX += x * X; syX += y * X; sxY += x * Y; syY += y * Y; });
    const det = sxx * syy - sxy * sxy; if (!isFinite(det) || Math.abs(det) < 1e-12 * (sxx * syy + 1e-30)) return null;
    const a = (sxX * syy - syX * sxy) / det, b = (syX * sxx - sxX * sxy) / det, d = (sxY * syy - syY * sxy) / det, e = (syY * sxx - sxY * sxy) / det;
    const c = mX - a * mx - b * my, f = mY - d * mx - e * my, dt = a * e - b * d;
    if (!isFinite(dt) || Math.abs(dt) < 1e-30) return null;
    return { a, b, c, d, e, f, det: dt };
  }

  // Bangun model georeferensi dari viewport terpilih.
  // -> { toLonLat(x,y), fromLonLat(lon,lat), bbox, crs, rms, n, exact, warn }
  function buildModel(vp) {
    const pts = [], ll = [];
    for (let i = 0; i < vp.gpts.length / 2; i++) ll.push([vp.gpts[2 * i + 1], vp.gpts[2 * i]]); // GPTS = lat lon
    // const [x0, y0, x1, y1] = vp.bbox;
    const [x0, y0, x1, y1] = vp.bboxRaw || vp.bbox;
    const pg = []; for (let i = 0; i < vp.lpts.length / 2; i++) pg.push([x0 + vp.lpts[2 * i] * (x1 - x0), y0 + vp.lpts[2 * i + 1] * (y1 - y0)]);
    if (ll.some(p => Math.abs(p[1]) > 90 || Math.abs(p[0]) > 360)) throw 'Koordinat georeferensi di luar jangkauan lintang/bujur (GPTS bukan derajat?)';
    let crs = makeCRS(vp.gcs, ll), exact = true, warn = null;
    if (!crs) { // CRS tidak dikenal: jatuh ke pendekatan Web Mercator (kurang akurat untuk peta luas)
      exact = false; warn = 'Proyeksi peta tidak terbaca; memakai pendekatan Web Mercator (kurang akurat untuk peta luas)';
      crs = { fwd: merc, inv: unmerc, label: 'Web Mercator (pendekatan)', geographic: false, def: 'approx' };
    }
    ll.forEach((p, i) => { const q = crs.fwd(p[0], p[1]); pts.push([pg[i][0], pg[i][1], q[0], q[1]]); });
    const A = fitAffine(pts); if (!A) throw 'Titik kontrol georeferensi tidak valid (segaris/berimpit)';
    const toXY = (x, y) => [A.a * x + A.b * y + A.c, A.d * x + A.e * y + A.f];
    const toPage = (X, Y) => { const u = X - A.c, v = Y - A.f; return [(A.e * u - A.b * v) / A.det, (-A.d * u + A.a * v) / A.det]; };
    const toLonLat = (x, y) => { const q = toXY(x, y); return crs.inv(q[0], q[1]); };
    const fromLonLat = (lon, lat) => { const q = crs.fwd(lon, lat); return toPage(q[0], q[1]); };
    let s2 = 0, mx = 0; ll.forEach((p, i) => { const e = gdist(toLonLat(pg[i][0], pg[i][1]), p); s2 += e * e; if (e > mx) mx = e; });
    return { toLonLat, fromLonLat, bbox: vp.bbox, crs, rms: Math.sqrt(s2 / ll.length), maxErr: mx, n: ll.length, exact, warn };
  }

  // ---------- warp: raster halaman PDF -> grid Web Mercator ----------
  // src: {data:Uint8ClampedArray RGBA, w, h}; T: transformasi viewport pdf.js [a,b,c,d,e,f] (ruang halaman -> piksel src)
  function warp(src, T, model, opt) {
    opt = opt || {};
    const [x0, y0, x1, y1] = model.bbox;
    // batas hasil: sampel sepanjang tepi bingkai (tepi bisa melengkung di Mercator)
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    const N = 32;
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      for (const [x, y] of [[x0 + t * (x1 - x0), y0], [x0 + t * (x1 - x0), y1], [x0, y0 + t * (y1 - y0)], [x1, y0 + t * (y1 - y0)]]) {
        const p = model.toLonLat(x, y), m = merc(p[0], p[1]);
        if (!isFinite(m[0]) || !isFinite(m[1])) throw 'Peta berada di luar jangkauan proyeksi';
        minx = Math.min(minx, m[0]); maxx = Math.max(maxx, m[0]); miny = Math.min(miny, m[1]); maxy = Math.max(maxy, m[1]);
      }
    }
    const maxDim = opt.maxDim || Math.min(3600, Math.ceil(Math.max(src.w, src.h) * 1.1));
    const ps = Math.max(maxx - minx, maxy - miny) / maxDim;
    const W = Math.max(1, Math.ceil((maxx - minx) / ps)), H = Math.max(1, Math.ceil((maxy - miny) / ps));
    const G = 16, gw = Math.ceil(W / G) + 2, gh = Math.ceil(H / G) + 2;
    const px = new Float64Array(gw * gh), py = new Float64Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const ll = unmerc(minx + i * G * ps, maxy - j * G * ps);
      const q = model.fromLonLat(ll[0], ll[1]); px[j * gw + i] = q[0]; py[j * gw + i] = q[1];
    }
    const out = new Uint8ClampedArray(W * H * 4), sd = src.data, sw = src.w, sh = src.h;
    const eps = 1e-6 * Math.max(x1 - x0, y1 - y0);
    for (let v = 0; v < H; v++) {
      const gj = (v + .5) / G, j0 = gj | 0, fj = gj - j0;
      for (let u = 0; u < W; u++) {
        const gi = (u + .5) / G, i0 = gi | 0, fi = gi - i0, k00 = j0 * gw + i0, k10 = k00 + 1, k01 = k00 + gw, k11 = k01 + 1;
        const x = (px[k00] * (1 - fi) + px[k10] * fi) * (1 - fj) + (px[k01] * (1 - fi) + px[k11] * fi) * fj;
        const y = (py[k00] * (1 - fi) + py[k10] * fi) * (1 - fj) + (py[k01] * (1 - fi) + py[k11] * fi) * fj;
        if (!(x >= x0 - eps && x <= x1 + eps && y >= y0 - eps && y <= y1 + eps)) continue;
        // piksel sumber (pusat piksel di koordinat +0.5) lalu sampel bilinear
        const fx = T[0] * x + T[2] * y + T[4] - .5, fy = T[1] * x + T[3] * y + T[5] - .5;
        let ix = Math.floor(fx), iy = Math.floor(fy); const ax = fx - ix, ay = fy - iy;
        const xa = ix < 0 ? 0 : ix >= sw ? sw - 1 : ix, xb = ix + 1 < 0 ? 0 : ix + 1 >= sw ? sw - 1 : ix + 1;
        const ya = iy < 0 ? 0 : iy >= sh ? sh - 1 : iy, yb = iy + 1 < 0 ? 0 : iy + 1 >= sh ? sh - 1 : iy + 1;
        const a = (ya * sw + xa) * 4, b = (ya * sw + xb) * 4, c = (yb * sw + xa) * 4, d = (yb * sw + xb) * 4, o = (v * W + u) * 4;
        const w00 = (1 - ax) * (1 - ay), w10 = ax * (1 - ay), w01 = (1 - ax) * ay, w11 = ax * ay;
        out[o] = sd[a] * w00 + sd[b] * w10 + sd[c] * w01 + sd[d] * w11;
        out[o + 1] = sd[a + 1] * w00 + sd[b + 1] * w10 + sd[c + 1] * w01 + sd[d + 1] * w11;
        out[o + 2] = sd[a + 2] * w00 + sd[b + 2] * w10 + sd[c + 2] * w01 + sd[d + 2] * w11;
        out[o + 3] = 255;
      }
    }
    const sw_ = unmerc(minx, miny), ne = unmerc(maxx, maxy);
    return { W, H, data: out, bounds: [[sw_[1], sw_[0]], [ne[1], ne[0]]], ps, merc: { minx, miny, maxx, maxy } };
  }

  const api = { parse, buildModel, warp, fitAffine, makeCRS, merc, unmerc, gdist, _val: val, _index: indexObjects, _collect: collectViewports };
  root.Georef = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
