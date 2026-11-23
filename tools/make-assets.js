// Membuat ikon & splash TAPAK dari logo vektor Spectra CC (tanda 'kontur' dari situs resmi + pin TAPAK).
// Jalankan: node tools/make-assets.js   (butuh sharp, sudah ikut sebagai dependensi @capacitor/assets)
const sharp = require('sharp'), fs = require('fs'), path = require('path');
const NAVY = '#17324D', TEAL = '#2DB1B7', SAGE = '#A9C6B2', GREEN = '#367A55', WHITE = '#FFFFFF';
const out = f => path.join(__dirname, '..', 'assets', f);

// tanda Spectra CC (viewBox -210..210) dengan pin TAPAK menggantikan titik pusat
const mark = `
<g fill="none" stroke-width="32" stroke-linecap="round">
  <path d="M-90.5 -165.9A189 189 0 1 0 163.8 -94.2" stroke="${WHITE}"/>
  <path d="M67.5 -112.3A131 131 0 1 0 112.8 66.7" stroke="${TEAL}"/>
  <path d="M71 0A71 71 0 1 0 0 71" stroke="${SAGE}"/>
</g>
<path d="M0 41C-7 32 -27 12 -27 -12A27 27 0 0 1 27 -12C27 12 7 32 0 41Z" fill="${WHITE}"/>
<circle cx="0" cy="-12" r="9.5" fill="${NAVY}"/>`;
const svg = (w, h, body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`);
const at = (cx, cy, s, inner) => `<g transform="translate(${cx} ${cy}) scale(${s})">${inner}</g>`;
const rule3 = (cx, y, w) => `<rect x="${cx - w / 2}" y="${y}" width="${w / 3}" height="14" fill="${WHITE}"/><rect x="${cx - w / 2 + w / 3}" y="${y}" width="${w / 3}" height="14" fill="#168C91"/><rect x="${cx - w / 2 + 2 * w / 3}" y="${y}" width="${w / 3}" height="14" fill="${GREEN}"/>`;

(async () => {
  const bg = `<rect width="1024" height="1024" fill="${NAVY}"/>`;
  await sharp(svg(1024, 1024, bg)).png().toFile(out('icon-background.png'));
  await sharp(svg(1024, 1024, at(512, 512, 1.5, mark))).png().toFile(out('icon-foreground.png'));
  await sharp(svg(1024, 1024, bg + at(512, 512, 1.78, mark))).png().toFile(out('icon-only.png'));
  // splash: kontur seperti sampul guideline + tanda + garis tiga warna
  const W = 2732, ell = [1, .84, .68, .52, .38, .25, .13].map((k, i) => `<ellipse cx="${W * .62}" cy="${W * .3}" rx="${W * .46 * k}" ry="${W * .3 * k}" fill="none" stroke="${TEAL}" stroke-opacity="${.16 + i * .02}" stroke-width="5"/>`).join('');
  const sp = `<rect width="${W}" height="${W}" fill="${NAVY}"/>${ell}${at(W / 2, W / 2, 2.1, mark)}${rule3(W / 2, W * .93, 1400)}`;
  await sharp(svg(W, W, sp)).png().toFile(out('splash.png'));
  await sharp(svg(W, W, sp)).png().toFile(out('splash-dark.png'));
  console.log('ikon & splash dibuat');
})();
