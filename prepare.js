// Menyalin library ke www/lib agar aplikasi 100% offline.
// Jika ada library yang gagal disalin, build DIHENTIKAN (bukan sekadar peringatan)
// supaya tidak menghasilkan APK yang rusak diam-diam.
const fs = require('fs'), p = require('path');
const n = 'node_modules/';
fs.mkdirSync('www/lib', { recursive: true });
const files = [
  'leaflet/dist/leaflet.js', 'leaflet/dist/leaflet.css',
  'pdfjs-dist/build/pdf.min.js', 'pdfjs-dist/build/pdf.worker.min.js',
  'proj4/dist/proj4.js', 'jszip/dist/jszip.min.js',
  'piexifjs/piexif.js', '@mapbox/shp-write/shpwrite.js'
]; 
// Font identitas Spectra CC (Manrope untuk judul, Inter untuk isi), disalin agar tampil tanpa internet
const fonts = [
  '@fontsource/manrope/files/manrope-latin-500-normal.woff2', '@fontsource/manrope/files/manrope-latin-700-normal.woff2',
  '@fontsource/manrope/files/manrope-latin-800-normal.woff2',
  '@fontsource/inter/files/inter-latin-400-normal.woff2', '@fontsource/inter/files/inter-latin-500-normal.woff2',
  '@fontsource/inter/files/inter-latin-600-normal.woff2'
];
fs.mkdirSync('www/lib/fonts', { recursive: true });
let gagal = 0;
for (const f of files) {
  try { fs.copyFileSync(n + f, 'www/lib/' + p.basename(f)); console.log('ok', f); }
  catch (e) { gagal++; console.error('GAGAL', f, '-', e.message); }
}
for (const f of fonts) {
  try { fs.copyFileSync(n + f, 'www/lib/fonts/' + p.basename(f)); console.log('ok', f); }
  catch (e) { gagal++; console.error('GAGAL', f, '-', e.message); }
}
if (gagal) { console.error(`\n${gagal} berkas gagal disalin. Build dihentikan.`); process.exit(1); }

// Tulis versi aplikasi dari package.json agar layar "Tentang" selalu cocok dengan versi APK.
const v = require('./package.json').version;
fs.writeFileSync('www/lib/version.js', `window.APP_VER=${JSON.stringify(v)};\n`);
console.log('ok version', v); 
