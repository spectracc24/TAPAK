// Geometri logo TAPAK: pin lokasi dengan telapak kaki (4 jari) di dalamnya.
// Hasil trace vektor dari logo resmi (assets/logo-tapak.png); tanpa unsur logo pengembang.
// Dipakai oleh: tools/make-assets.js (ikon launcher & splash), prepare.js (www/lib/mark.js untuk UI),
// dan ikon notifikasi Android (assets/android/ic_stat_tapak.xml, dibuat otomatis).
// Sistem koordinat: pusat (0,0), pin setinggi ±110 (selebar ±81). Hanya perintah M/L/C/Z absolut.
const PIN = 'M-2 109.7C-6 108.2 -13.7 99.8 -28.2 81.2C-38.1 68.5 -44.1 60 -53.9 45.1C-65.2 27.7 -73.5 12.2 -77 1.8C-80.3 -8.3 -81.5 -15.9 -81.2 -26.3C-81.1 -34.1 -80.5 -38.6 -78.7 -45.9C-67.7 -89.8 -26.9 -116.9 15.4 -108.4C51.1 -101.3 77.8 -70 81.1 -31.3C81.5 -27.4 81.3 -17.8 80.8 -14.3C80 -8.4 78.2 -1.5 76.1 4.3C69.9 21.1 51.4 51 30.7 77.9C22.6 88.4 18.3 93.6 10.7 102.3C7.4 106.1 4 109 2 109.7C1 110.1 -1 110.1 -2 109.7Z';
// telapak kaki: 1 tapak + 4 jari sebagai subpath terpisah (tidak saling tumpang tindih)
const FOOT = 'M-9.8 66.4C-7.8 62.8 -4.3 58.9 0.5 55C5.6 51 7.6 49.3 10.7 46.4C13.6 43.8 18.5 38.7 20.4 36.3C20.8 35.7 21.7 34.7 22.2 34C29.5 25 36.5 12.2 39.2 2.7C40.9 -3.2 41.3 -5.9 41.3 -10.8C41.3 -27.6 31.3 -39.2 12.6 -44C6.3 -45.6 3.4 -45.9 -3.3 -45.9C-10 -45.9 -11.3 -45.8 -16.1 -44.6C-29.6 -41.2 -36.8 -32.8 -34.7 -22.9C-34 -19.2 -32.6 -16.8 -29.4 -13.9C-26.1 -10.8 -22.9 -9.2 -14.8 -6.7C-5.5 -3.8 -0.8 -2 2.1 -0C10 5.2 12.3 14.8 7.8 24C6 27.7 3.9 30 -3 36.4C-9.7 42.6 -12.6 46.2 -14.6 50.9C-17.1 56.6 -16.2 62.8 -12.3 66.4C-10.7 67.9 -10.6 67.9 -9.8 66.4ZM-14.1 -50.4C-10.6 -51.5 -7.9 -54 -5.9 -58C-0.4 -69.2 -4.9 -83.8 -14.6 -86.3C-26.5 -89.3 -37.3 -75.4 -33.7 -61.7C-31.5 -53.1 -22.2 -47.7 -14.1 -50.4ZM31.7 -47.4C34.2 -48.6 36.5 -51.4 37.6 -54.6C38.4 -56.8 38.3 -60.4 37.5 -62.1C35 -67.6 28.1 -67.8 23.9 -62.5C21.8 -59.9 21.2 -58.1 21.2 -54.7C21.2 -52 21.2 -51.8 21.8 -50.7C23.8 -46.9 27.9 -45.5 31.7 -47.4ZM12.4 -52.6C16.6 -54.8 19.4 -60 19.4 -65.6C19.5 -79 4.7 -79.9 0.7 -66.8C-1 -61.3 0.6 -55.3 4.6 -52.8C6.7 -51.5 10 -51.4 12.4 -52.6ZM47.6 -36.8C52.8 -39.4 55.1 -48.3 51.8 -52.8C50.4 -54.6 49.3 -55.2 46.8 -55.2C44.2 -55.2 43.2 -54.7 41.1 -52.6C37 -48.5 36.2 -41.8 39.2 -38.2C41.2 -35.9 44.6 -35.3 47.6 -36.8Z';
// SVG isi: pin berwarna `pin`, telapak berwarna `ft`
const svgInner = (pin, ft) => `<path d="${PIN}" fill="${pin}"/><path d="${FOOT}" fill="${ft}"/>`;
// Transformasi koordinat path M/L/C/Z absolut: (x, y) -> (x * s + ox, y * s + oy)
const tx = (d, s, ox, oy) => {
  let i = 0;
  return d.replace(/-?\d*\.?\d+/g, v => { const r = +v * s + (i++ % 2 ? oy : ox); return +r.toFixed(2); })
    .replace(/(\d)(?=-)/g, '$1 ').replace(/([MLC])\s+/g, '$1').replace(/(\d) (?=[MLCZ])/g, '$1');
};
// Ikon notifikasi monokrom (viewport 24): satu path evenodd, telapak menjadi lubang pada pin
function androidXml() {
  const k = 20 / 220;                       // pin setinggi 20 dari 24
  const pathData = tx(PIN, k, 12, 12) + tx(FOOT, k, 12, 12);
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Ikon notifikasi Android (monokrom): pin TAPAK dengan telapak kaki. Dibuat oleh tools/make-assets.js -->
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
    <path android:fillColor="#FFFFFFFF" android:fillType="evenOdd" android:pathData="${pathData}" />
</vector>
`;
}
module.exports = { PIN, FOOT, svgInner, androidXml, tx };
