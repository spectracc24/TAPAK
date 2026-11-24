// Membuat ikon launcher, splash, dan ikon notifikasi TAPAK dari logo pin + telapak kaki (tools/mark.js).
// Jalankan: node tools/make-assets.js   (butuh sharp, sudah ikut sebagai dependensi @capacitor/assets)
const sharp = require('sharp'), fs = require('fs'), path = require('path');
const NAVY = '#17324D', TEAL = '#2DB1B7', GREEN = '#367A55', WHITE = '#FFFFFF';
const out = f => path.join(__dirname, '..', 'assets', f);

const M = require('./mark.js');
// logo TAPAK: pin + telapak kaki (tanpa logo pengembang)
const mark = M.svgInner(WHITE, NAVY);
const svg = (w, h, body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`);
const at = (cx, cy, s, inner) => `<g transform="translate(${cx} ${cy}) scale(${s})">${inner}</g>`;
const rule3 = (cx, y, w) => `<rect x="${cx - w / 2}" y="${y}" width="${w / 3}" height="14" fill="${WHITE}"/><rect x="${cx - w / 2 + w / 3}" y="${y}" width="${w / 3}" height="14" fill="#168C91"/><rect x="${cx - w / 2 + 2 * w / 3}" y="${y}" width="${w / 3}" height="14" fill="${GREEN}"/>`;

(async () => {
  const bg = `<rect width="1024" height="1024" fill="${NAVY}"/>`;
  await sharp(svg(1024, 1024, bg)).png().toFile(out('icon-background.png'));
  await sharp(svg(1024, 1024, at(512, 512, 2.6, mark))).png().toFile(out('icon-foreground.png'));
  await sharp(svg(1024, 1024, bg + at(512, 512, 3.5, mark))).png().toFile(out('icon-only.png'));
  // splash: kontur seperti sampul guideline + tanda + garis tiga warna
  const W = 2732, ell = [1, .84, .68, .52, .38, .25, .13].map((k, i) => `<ellipse cx="${W * .62}" cy="${W * .3}" rx="${W * .46 * k}" ry="${W * .3 * k}" fill="none" stroke="${TEAL}" stroke-opacity="${.16 + i * .02}" stroke-width="5"/>`).join('');
  const sp = `<rect width="${W}" height="${W}" fill="${NAVY}"/>${ell}${at(W / 2, W / 2, 4.2, mark)}${rule3(W / 2, W * .93, 1400)}`;
  await sharp(svg(W, W, sp)).png().toFile(out('splash.png'));
  await sharp(svg(W, W, sp)).png().toFile(out('splash-dark.png'));
  fs.mkdirSync(out('android'), { recursive: true });
  fs.writeFileSync(out('android/ic_stat_tapak.xml'), M.androidXml());
  console.log('ikon, splash & ikon notifikasi dibuat');
})();
