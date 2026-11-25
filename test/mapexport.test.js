'use strict';
// Uji ringan mesin ekspor peta (tanpa kanvas): ukuran kertas, skala, pembungkus teks, metadata berkas.
const assert = require('assert'), M = require('../www/mapexport.js');
const ctx = { font: '', measureText: s => ({ width: String(s).length * 10 }) };   // 10 px per huruf
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name) };

t('pageMm A4 lanskap/portrait', () => {
  assert.deepStrictEqual(M.pageMm('A4', 'landscape'), [297, 210]); assert.deepStrictEqual(M.pageMm('A4', 'portrait'), [210, 297]);
});
t('pageMm custom (cm -> mm, orientasi menentukan sisi lebar)', () => assert.deepStrictEqual(M.pageMm('custom', 'landscape', 20, 30), [300, 200]));
t('effDpi menurunkan resolusi bila terlalu besar', () => { assert.strictEqual(M.effDpi(297, 210, 150), 150); assert.ok(M.effDpi(2000, 2000, 300) < 300) });
t('niceScaleN membulatkan ke atas', () => { assert.ok(M.niceScaleN(12847) >= 12847); assert.ok(M.niceScaleN(12847) <= 13500) });
t('wrapText: menambah baris, lalu memotong dengan …', () => {
  const l = M.wrapText(ctx, 'Lembaga Pengelola Hutan Desa Kampung Baru', 200, 2);
  assert.strictEqual(l.length, 2); assert.ok(/…$/.test(l[1])); l.forEach(x => assert.ok(ctx.measureText(x).width <= 200));
  const k = M.wrapText(ctx, 'Pos jaga', 200, 3); assert.deepStrictEqual(k, ['Pos jaga']);
});
t('wrapText: kata lebih panjang dari baris dipotong', () => M.wrapText(ctx, 'Abcdefghijklmnopqrstuvwxyz', 100, 3).forEach(x => assert.ok(ctx.measureText(x).width <= 100)));
t('fitText memotong dengan …', () => { const r = M.fitText(ctx, 'Panjang sekali teks ini', 120); assert.ok(r.endsWith('…') && ctx.measureText(r).width <= 120) });
t('fmtDeg derajat desimal & DMS', () => { assert.strictEqual(M.fmtDeg(109.5, .5, false, true), '109.5° BT'); assert.strictEqual(M.fmtDeg(-0.25, .25, false, false).endsWith('LS'), true) });
t('PDF/PNG/JPEG membawa metadata ukuran', () => {
  const pdf = M.buildPdf(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), 10, 10, 297, 210, { title: 'x', author: 'y' });
  assert.strictEqual(pdf.type, 'application/pdf'); assert.ok(pdf.size > 200);
});
console.log(n + ' uji lulus');
