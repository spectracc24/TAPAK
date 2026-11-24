// Geometri logo TAPAK: pin lokasi dengan telapak kaki di kepalanya (tanpa unsur logo pengembang).
// Dipakai oleh: tools/make-assets.js (ikon launcher & splash), prepare.js (www/lib/mark.js untuk UI),
// dan ikon notifikasi Android (assets/android/ic_stat_tapak.xml, dibuat otomatis).
// Sistem koordinat: pusat (0,0), pin setinggi ±110, selebar ±70.
const PIN = 'M0 110C-14 92-70 40-70-40A70 70 0 0 1 70-40C70 40 14 92 0 110Z';
// telapak kaki kanan, kotak 100x100 (toe di atas)
const SOLE = 'M37 37C37 30 46 28 56 30C68 32 76 39 75 51C74 61 69 65 67 73C65 85 60 96 50 96C40 96 35 85 36 73C37 62 37 48 37 37Z';
const TOES = [[32, 24, 10], [47, 15, 6.8], [59, 17, 5.8], [68, 23, 5.1], [75, 32, 4.5]];
const FT = { s: 1.22, x: -61, y: -102 };       // skala & geser telapak ke pusat kepala pin (0,-40)
const circle = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
const foot = () => `<g transform="translate(${FT.x} ${FT.y}) scale(${FT.s})"><path d="${SOLE}"/>${TOES.map(t => `<circle cx="${t[0]}" cy="${t[1]}" r="${t[2]}"/>`).join('')}</g>`;
// SVG isi: pin berwarna `pin`, telapak berwarna `ft`
const svgInner = (pin, ft) => `<path d="${PIN}" fill="${pin}"/><g fill="${ft}">${foot()}</g>`;
// Satu path evenodd (pin dengan lubang telapak) untuk ikon monokrom, viewport 24 (skala 24/240)
const k = 24 / 240, n = v => +(v * k).toFixed(2);
function androidXml() {
  // pin saja (lubang telapak digambar lewat evenodd): tulis ulang PIN dan telapak ke koordinat 24x24 (+12,+11)
  const T = (x, y) => [n(FT.s * x + FT.x) + 12, n(FT.s * y + FT.y) + 11];
  const sole = SOLE.replace(/(-?\d+\.?\d*) (-?\d+\.?\d*)/g, (m, a, b) => { const p = T(+a, +b); return p[0] + ' ' + p[1]; })
    .replace(/A\s*[\d.]+ [\d.]+ [\d.]+ [\d.]+ [\d.]+/g, '');
  const toes = TOES.map(t => { const c = T(t[0], t[1]), r = n(t[2] * FT.s); return circle(c[0], c[1], r); }).join('');
  const pin = 'M12 22C10.6 20.2 5 15 5 7A7 7 0 0 1 19 7C19 15 13.4 20.2 12 22Z';
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Ikon notifikasi Android (monokrom): pin TAPAK dengan telapak kaki. Dibuat oleh tools/make-assets.js -->
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
    <path android:fillColor="#FFFFFFFF" android:fillType="evenOdd" android:pathData="${pin}${sole}${toes}" />
</vector>
`;
}
module.exports = { PIN, SOLE, TOES, FT, svgInner, androidXml, foot };
