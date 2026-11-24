// Menyalin library ke www/lib agar aplikasi 100% offline.
// Jika ada library yang gagal disalin, build DIHENTIKAN (bukan sekadar peringatan)
// supaya tidak menghasilkan APK yang rusak diam-diam.
const fs = require('fs'), p = require('path');
const n = 'node_modules/';
fs.mkdirSync('www/lib', { recursive: true });
const files = [
  'leaflet/dist/leaflet.js', 'leaflet/dist/leaflet.css',
  // PDF.js 6.x hanya berbentuk modul ES; build "legacy" dipakai agar jalan di Android WebView lama
  'pdfjs-dist/legacy/build/pdf.min.mjs', 'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
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
// Decoder WebAssembly PDF.js (JPEG2000, JBIG2, profil warna ICC) + cadangan tanpa wasm, dimuat lewat wasmUrl 'lib/wasm/'
const wasm = ['jbig2.wasm', 'jbig2_nowasm_fallback.js', 'openjpeg.wasm', 'openjpeg_nowasm_fallback.js', 'qcms_bg.wasm',
  'LICENSE_JBIG2', 'LICENSE_OPENJPEG', 'LICENSE_PDFJS_JBIG2', 'LICENSE_PDFJS_OPENJPEG', 'LICENSE_PDFJS_QCMS', 'LICENSE_QCMS'];
fs.mkdirSync('www/lib/wasm', { recursive: true });
let gagal = 0;
for (const f of files) {
  try { fs.copyFileSync(n + f, 'www/lib/' + p.basename(f)); console.log('ok', f); }
  catch (e) { gagal++; console.error('GAGAL', f, '-', e.message); }
}
for (const f of fonts) {
  try { fs.copyFileSync(n + f, 'www/lib/fonts/' + p.basename(f)); console.log('ok', f); }
  catch (e) { gagal++; console.error('GAGAL', f, '-', e.message); }
}
for (const f of wasm) {
  try { fs.copyFileSync(n + 'pdfjs-dist/wasm/' + f, 'www/lib/wasm/' + f); console.log('ok wasm', f); }
  catch (e) { gagal++; console.error('GAGAL wasm', f, '-', e.message); }
}
if (gagal) { console.error(`\n${gagal} berkas gagal disalin. Build dihentikan.`); process.exit(1); }

// Tulis versi aplikasi dari package.json agar layar "Tentang" selalu cocok dengan versi APK.
const v = require('./package.json').version;
fs.writeFileSync('www/lib/version.js', `window.APP_VER=${JSON.stringify(v)};\n`);
console.log('ok version', v);

// Model geoid EGM96 (offline) untuk mengubah tinggi elipsoid GPS menjadi elevasi di atas muka laut (MSL).
// Paket egm96-universal berformat CommonJS dan memakai rfc4648 hanya untuk decode base64; diganti atob() bawaan.
{
  let eg = fs.readFileSync(n + 'egm96-universal/dist/egm96-universal.cjs.js', 'utf8');
  eg = eg.replace("require('rfc4648')", "{ base64: { parse: function (s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); } } }");
  if (/require\(/.test(eg)) { console.error('egm96: masih ada require() setelah penggantian. Build dihentikan.'); process.exit(1); }
  fs.writeFileSync('www/lib/egm96.js', '(function(){var exports={};\n' + eg + '\nwindow.EGM96=exports;})();\n');
  console.log('ok egm96');
}
// Geometri logo TAPAK untuk UI (sumber tunggal: tools/mark.js, sama dengan ikon launcher)
{
  const M = require('./tools/mark.js');
  fs.writeFileSync('www/lib/mark.js', 'window.TAPAK_MARK=' + JSON.stringify(M.svgInner('var(--mk-pin)', 'var(--mk-ft)')) + ';\n');
  console.log('ok mark');
}

// Validasi CSP di index.html. Titik koma yang hilang (mis. "... 'wasm-unsafe-eval' style-src ...") membuat
// style-src ikut terbaca sebagai nilai script-src, lalu kebijakan jatuh ke default-src 'self' dan SEMUA style="..." inline
// diblokir (logo, swatch warna, dll. tampil rusak). Build dihentikan bila itu terjadi.
{
  const html = fs.readFileSync('www/index.html', 'utf8');
  const m = html.match(/Content-Security-Policy[\s\S]*?content="([^"]+)"/i);
  if (!m) { console.error('CSP tidak ditemukan di www/index.html'); process.exit(1); }
  const directives = m[1].split(';').map(d => d.trim()).filter(Boolean);
  const names = new Set(directives.map(d => d.split(/\s+/)[0]));
  let bad = 0;
  for (const d of directives) {
    for (const tok of d.split(/\s+/).slice(1)) {
      if (/-src$|^default-src$|^base-uri$|^form-action$|^object-src$/.test(tok) && !tok.startsWith("'")) { console.error('CSP salah: "' + tok + '" berada di dalam direktif "' + d.split(/\s+/)[0] + '" (titik koma hilang?)'); bad++; }
    }
  }
  for (const need of ['default-src', 'script-src', 'style-src', 'img-src']) if (!names.has(need)) { console.error('CSP tanpa direktif ' + need); bad++; }
  if (bad) process.exit(1);
  console.log('ok CSP');
}

