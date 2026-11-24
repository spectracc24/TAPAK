# TAPAK

**Teknologi Akuisisi dan Pencatatan Hutan Kita**
*Every Track Tells a Story.*

Aplikasi Android untuk pemetaan, navigasi, dan pencatatan lapangan yang bekerja tanpa internet.

> Dikembangkan oleh **Spectra Citra Cendekia (Spectra CC)** · *Science into Sustainable Solutions.*
 
---

## 1. Tentang Aplikasi

| | |
|---|---|
| **Nama** | TAPAK |
| **Kepanjangan** | Teknologi Akuisisi dan Pencatatan Hutan Kita |
| **Tagline** | Every Track Tells a Story. |
| **Versi** | 1.3.0 |
| **Pengembang** | Spectra Citra Cendekia (Spectra CC) |
| **ID aplikasi** | `id.tapak.patroli` |
| **Platform** | Android |
| **Bahasa antarmuka** | Indonesia |

TAPAK dibuat sebagai alternatif ringan untuk aplikasi peta lapangan berbayar. Aplikasi ini memakai peta PDF berreferensi geografis (GeoPDF), misalnya hasil ekspor ArcMap atau QGIS, sebagai peta dasar saat tidak ada sinyal. Data yang dikumpulkan tersimpan di HP dan dapat diekspor ke format standar GIS.

## 2. Kegunaan

- **Navigasi dan orientasi peta** memakai posisi GPS, kompas, dan skala.
- **Peta offline:** impor GeoPDF dari HP, tampil sesuai posisi sebenarnya, dengan pengaturan transparansi.
- **Peta online gratis** (jalan, kontur, satelit) saat ada internet.
- **Rekam jejak patroli (tracking):** jarak dan durasi tampil langsung, bisa **dijeda dan dilanjutkan**, hasilnya disimpan sebagai jalur. Interval pencatatan 2 detik (baku), 30 detik, semua fix, atau custom. Tetap merekam saat aplikasi diminimalkan, ditandai notifikasi di bilah status. 
- **Elevasi:** dari GPS dengan koreksi geoid EGM96 (offline), tampil di layar, tersimpan pada titik dan jejak (naik/turun, profil elevasi), dan bisa dikalibrasi.
- **Batas akurasi GPS:** baku 32 m (setara Avenza); peringatan atau blokir saat menandai titik bila akurasi lebih buruk; titik jejak yang melebihi batas dilewati.
- **Kelola banyak data:** cari, saring, **sembunyikan/tampilkan**, pilih beberapa objek untuk disembunyikan, diberi simbol, diekspor, atau dihapus.
- **Simbol:** 6 bentuk titik, 8 warna, gaya garis (tegas/putus/titik), ukuran simbol, label nama (tampil/otomatis/sembunyi), dan warna otomatis menurut atribut “Jenis”. **Tetap merekam saat layar dikunci atau aplikasi diminimalkan** (layanan latar depan dengan notifikasi permanen), dan jejak yang belum disimpan dipulihkan otomatis bila aplikasi tertutup.
- **Tandai titik, gambar jalur, dan gambar area** langsung di peta atau dari lokasi GPS.
- **Ukur jarak dan luas** (metrik, imperial, atau nautika).
- **Atribut objek:** nama, keterangan, dan data tambahan bebas (jenis, jumlah, kondisi, dan lain-lain).
- **Foto lampiran dengan geotag:** koordinat dituliskan ke EXIF foto. Foto kamera dan galeri sama-sama didukung.
- **Navigasi ke titik tujuan:** jarak dan arah dari posisi saat ini.
- **Sistem koordinat:** derajat desimal (WGS84), derajat-menit-detik, dan UTM. Ketuk kotak koordinat di kiri atas untuk berganti.
- **Ekspor data:** GeoJSON, KMZ, dan SHP (zip). Pilih semua, terpilih, atau yang tampil; **Simpan ke perangkat** (dialog “Simpan sebagai” Android) atau **Bagikan**. Elevasi, akurasi GPS, dan simbol ikut sebagai atribut.
- **Ekspor peta berlayout (v1.5):** Lainnya → Ekspor peta. Kertas A4, A3, atau custom (cm), lanskap/portrait; judul, deskripsi, nama pembuat, tanggal ekspor; pilih data lapangan, basemap online (jalan, kontur, satelit) dan/atau peta PDF offline; label data (nama, elevasi, panjang/luas); grid koordinat (derajat, DMS, UTM); arah utara, skala, logo TAPAK dan Spectra CC beserta keterangan sumber. Hasil PDF, PNG, atau JPEG berukuran kertas sebenarnya (metadata DPI tertanam). Kode: `www/mapexport.js` (mesin), `www/mapexport-ui.js` (panel); uji: `npm run test:map`.
- **Pengaturan** lengkap dengan tombol **Kembalikan ke default**.

## 3. Teknologi dan Package

**Kerangka aplikasi**
- Aplikasi web (HTML, CSS, JavaScript tanpa framework) yang dibungkus menjadi APK dengan **Capacitor 8**.
- Build APK otomatis di **GitHub Actions** (Ubuntu, Node 22, Java 21 Temurin, Gradle 8.14, Android SDK 36).

**Package Capacitor (versi dikunci di `package-lock.json`)**

| Package                             | Versi  | Fungsi                                                                    |
| ----------------------------------- | ------ | ------------------------------------------------------------------------- |
| `@capacitor/core`, `cli`, `android` | 8.6.2  | Pembungkus aplikasi menjadi APK                                           |
| `@capacitor/geolocation`            | 8.2.5  | GPS di layar depan dan izin lokasi                                        |
| `@capacitor-community/background-geolocation` | 1.3.1 | Merekam saat diminimalkan (layanan latar depan + notifikasi)  |
| `@capacitor/local-notifications`    | 8.3.1  | Izin notifikasi (Android 13+) dan notifikasi “rekaman dijeda”             |
| `@capacitor/camera`                 | 8.2.6  | Meminta izin kamera (foto tetap diambil lewat input bawaan)               |
| `@capacitor/filesystem`             | 8.1.5  | Menulis berkas ekspor sementara                                           |
| `@capacitor/share`                  | 8.0.3  | Membagikan berkas ekspor                                                  |
| `@capacitor/assets` (dev)           | 4.0.0  | Membuat ikon dan splash Android                                          |

Plugin lokal `FileSaver` (`native/FileSaverPlugin.java`, dipasang otomatis oleh workflow) membuka dialog “Simpan sebagai” Android (Storage Access Framework) tanpa izin penyimpanan.

**Library peta dan data (versi TAPAK 1.0)** (disalin ke `www/lib` saat build agar jalan offline)
| Library | Versi | Fungsi |
|---|---|---|
| Leaflet | 1.9.4 | Mesin peta |
| pdf.js (`pdfjs-dist`) | 3.11.174 | Membaca dan merender PDF |
| proj4 | 2.9.2 | Konversi koordinat (UTM) |
| JSZip | 3.10.1 | Membuat berkas KMZ dan ZIP |
| piexifjs | 1.0.6 | Menulis dan membaca geotag EXIF foto |
| @mapbox/shp-write | 0.4.3 | Membuat Shapefile |

**Penyimpanan:** IndexedDB di dalam aplikasi (objek, foto, peta PDF, pengaturan).

**Izin Android:** lokasi (presisi dan perkiraan), kamera, internet, layanan latar depan (`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`), dan notifikasi (`POST_NOTIFICATIONS`); ditulis otomatis ke AndroidManifest oleh workflow build. Aplikasi **memeriksa izin setiap dibuka dan setiap kembali ke layar depan**, lalu menampilkan dialog bila ada yang belum diberikan (lihat bagian 6). Pilih foto dari galeri memakai pemilih foto bawaan Android yang tidak memerlukan izin tambahan.
 
## 4. Struktur Repo

```
www/index.html, style.css          Tampilan (token, ikon, dan komponen mengikuti situs Spectra CC)
www/app.js, ui.js                   Logika aplikasi dan panel
www/georef.js                       Georeferensi GeoPDF (parser, proyeksi, warp); diuji di test/
test/georef.test.js                 Uji otomatis georeferensi (npm test; dijalankan juga di GitHub Actions)
tools/make-assets.js                Membuat ikon dan splash dari logo vektor Spectra CC (npm run assets)
assets/android/ic_tracking.xml      Ikon notifikasi rekam jejak (monokrom)
www/perm.js                         Manajer izin (lokasi, kamera, notifikasi)
native/                             FileSaverPlugin.java + MainActivity.java (dipasang saat build)
tools/mark.js, make-assets.js       Logo pin + telapak kaki, pembuat ikon/splash/ikon notifikasi
assets/                             Ikon dan splash sumber
prepare.js                          Menyalin library ke www/lib saat build
capacitor.config.json               Nama dan ID aplikasi
package.json, package-lock.json      Dependensi (versi dikunci)
.github/workflows/build.yml         Build APK otomatis
```

## 5. Catatan

**Peta**
- **Impor GeoPDF** (`www/georef.js`) membaca georeferensi ISO 32000 (`/Measure /GEO`) dari **halaman pertama**. Sejak v1.3: (1) proyeksi asli peta (UTM, geografis, atau WKT/EPSG lain) dibaca lalu tiap piksel di-warp secara eksak ke Web Mercator, tidak lagi memakai satu transformasi affine langsung; (2) bila PDF punya beberapa viewport (peta utama + inset), bingkai terluas yang dipakai; (3) objek PDF dalam object stream terkompresi (PDF 1.5+) ikut terbaca; (4) kartu peta menampilkan proyeksi, galat titik kontrol, dan resolusi. PDF tanpa georeferensi tetap ditolak. Saat ekspor dari ArcMap, centang **"Export Map Georeference Information"**; di QGIS, **"Create Geospatial PDF"**.
- **Datum:** titik kontrol GPTS diperlakukan sebagai WGS84. Peta dengan datum lokal lain (mis. ID74) bisa bergeser sampai puluhan meter; pakai **Geser** di kartu peta PDF untuk kalibrasi, dan **Salin info georeferensi** untuk menelusuri sebab.
- Pada peta yang sangat luas bisa ada selisih posisi kecil. Cek posisi GPS pada fitur yang dikenal sebelum dipakai.
- Peta PDF sangat besar dirender dengan resolusi dibatasi, sehingga detail halus bisa berkurang.
- **Peta online tidak disimpan** untuk offline. Tanpa internet, hanya peta PDF yang tampil. Pemakaian tile OpenStreetMap harus mengikuti kebijakan penggunaannya.

**Tracking dan GPS**

- **Tracking latar belakang** memakai layanan latar depan Android, sehingga selalu ada notifikasi “TAPAK sedang merekam jejak” selama merekam. Di Android 13+, izinkan notifikasi untuk TAPAK agar tanda ini terlihat (rekaman tetap berjalan walau notifikasi ditolak).
- `useLegacyBridge: true` di `capacitor.config.json` **jangan dihapus**: tanpa itu, pembaruan lokasi latar belakang berhenti sekitar 5 menit setelah aplikasi diminimalkan.
- Jangan geser-tutup TAPAK dari daftar aplikasi terbaru saat merekam. Pada HP Xiaomi, Oppo, Vivo, Samsung, dan merek lain dengan penghemat baterai agresif, atur Baterai TAPAK ke **Tanpa batasan**.
- Rekaman yang terputus (aplikasi ditutup paksa, HP restart) dilanjutkan otomatis saat TAPAK dibuka lagi; bagian yang hilang selama terputus tampak sebagai garis lurus.
- Fix GPS pertama bisa lama, terutama di dalam bangunan atau di bawah kanopi lebat. Titik yang akurasinya melebihi batas (baku 32 m, bisa diubah di Pengaturan) tidak dicatat dalam track.
- Kompas bergantung pada sensor HP dan bisa perlu dikalibrasi. Peta tidak berputar mengikuti arah HP.

**Data dan ekspor**
- Tidak ada fitur impor GeoJSON, KML, atau SHP, dan tidak ada pengeditan titik (vertex) setelah objek disimpan.
- Elevasi berasal dari GPS HP: ketelitian vertikal biasanya 2–3× lebih buruk dari horizontal. Untuk elevasi titik di luar jangkauan sinyal, atau titik yang ditandai manual di peta, elevasi tidak tersedia (belum ada model elevasi/DEM offline).
- Ikon KMZ memakai titik bulat berwarna; bentuk simbol lengkap tersimpan sebagai atribut `simbol`.
- Foto diperkecil maksimal 1600 px dan disimpan di dalam aplikasi, jadi banyak foto menambah ukuran data.
- Shapefile membatasi nama atribut maksimal 10 karakter, dan koordinatnya WGS84.
- Satu objek hanya bertipe titik, jalur, atau area. Tidak ada lapisan (layer) terpisah.

**Distribusi**
- Tanpa keystore, workflow hanya membuat APK **debug** (bertanda `DEBUG-jangan-dibagikan`). Untuk dibagikan, isi secrets penandatanganan di bagian 6.
- Belum diuji pada semua merek dan versi Android. Uji di beberapa HP sebelum dipakai luas.

## 6. Keamanan, Izin, dan Penandatanganan APK

**Izin aplikasi.** `www/perm.js` memeriksa izin lokasi presisi dan kamera saat aplikasi dibuka dan setiap kali kembali aktif. Jika belum diberikan, tampil dialog dengan tombol *Berikan izin*. Bila Android sudah menolak permanen, dialog menampilkan petunjuk membuka Pengaturan; begitu pengguna kembali, izin dicek ulang otomatis. Fitur rekam jejak dan kamera juga meminta izin saat dipakai. Ubah `PERM_STRICT = true` di `perm.js` untuk menyembunyikan tombol *Nanti saja*.

**Penandatanganan rilis (sekali saja).**
1. Buat kunci: `keytool -genkeypair -v -keystore tapak.jks -alias tapak -keyalg RSA -keysize 4096 -validity 10000`
2. Simpan `tapak.jks` di tempat aman **di luar repo** dan buat cadangannya. Kunci hilang = APK tidak bisa diperbarui.
3. Encode: `base64 -w0 tapak.jks`
4. Di GitHub: Settings → Secrets and variables → Actions, tambahkan `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
5. Setiap push kini menghasilkan APK rilis bertanda tangan dan `SHA256SUMS.txt`. Cocokkan checksum sebelum membagikan. `versionCode` naik otomatis sehingga APK baru dapat menimpa versi lama tanpa menghapus data.

**Kebijakan Android untuk APK di luar Play Store.** Google mulai mewajibkan verifikasi developer secara bertahap, termasuk di Indonesia sejak akhir September 2026. Periksa persyaratan terbaru di developer.android.com/developer-verification sebelum membagikan APK ke banyak pengguna.

Pelaporan kerentanan: lihat `SECURITY.md`.

## 7. Lisensi dan Atribusi

Peta dasar online: © kontributor OpenStreetMap, OpenTopoMap, dan Esri. Library pihak ketiga memakai lisensi masing-masing (Leaflet BSD-2, pdf.js Apache-2.0, proj4 MIT, JSZip MIT/GPLv3, piexifjs MIT, shp-write BSD). Logo dan identitas visual Spectra CC mengikuti *Brand Identity & Strategic Guideline* v1.0 (Spectra Citra Cendekia, terdaftar AHU-015113.AH.01.30 Tahun 2025). Tentukan lisensi TAPAK sendiri sesuai kebijakan organisasi Anda.

## 8. Catatan Versi 1.4.0

- Peta PDF yang disembunyikan kini jelas ditandai (badge, kartu putus-putus, catatan, tombol berubah, titik pada tombol lapisan); status tersimpan.
- Simpan ke perangkat, ekspor sebagian data, sembunyikan/tampilkan data, pilih banyak objek, simbol (bentuk/warna/gaya).
- Elevasi (koreksi geoid EGM96, kalibrasi offset), profil elevasi jalur, selisih elevasi ke tujuan.
- Jeda/lanjut rekaman; jarak selama jeda tidak dihitung (jejak menjadi multi-segmen). Interval 2 dtk / 30 dtk / semua fix / custom.
- Notifikasi “sedang merekam” kini tampil: meminta izin `POST_NOTIFICATIONS` (Android 13+) dan memakai ikon monokrom TAPAK (sebelumnya ikon launcher berwarna).
- Batas akurasi horizontal (baku 32 m) dengan peringatan/blokir; Pengaturan lengkap + reset default.
- Logo aplikasi: pin + telapak kaki (tanpa unsur logo pengembang); logo Spectra CC hanya di “Dikembangkan oleh”.
- Perbaikan: tata letak “Tentang”; KMZ memakai tag `<name>` yang valid (sebelumnya `<n>`, sehingga nama objek tidak tampil di Google Earth); Shapefile jalur kini satu record per jalur (library sebelumnya menggabung semua jalur menjadi satu record).

## 9. Catatan Versi 1.4.1 (perbaikan)

- **CSP:** titik koma yang hilang di `index.html` (`'wasm-unsafe-eval' style-src ...`) membuat `style-src` terbaca sebagai nilai `script-src`, sehingga semua atribut `style=""` inline diblokir (logo Spectra hilang, swatch warna polos). Diperbaiki, dan `prepare.js` kini menghentikan build bila CSP salah format.
- **Logo Spectra & swatch:** warnanya kini lewat class CSS / atribut SVG, tidak lagi bergantung pada `style=""` inline.
- **Notifikasi “sedang merekam” tidak hilang:** di Capacitor 8 `addWatcher` (bertipe callback) mengembalikan string id, bukan Promise. Kode lama memanggil `.catch()` pada string itu sehingga id watcher tidak pernah tersimpan dan `removeWatcher` tidak pernah dipanggil. Kini dibungkus `Promise.resolve()` (juga pada `watchPosition`).
- **Splash:** tidak lagi menutup otomatis; ada tombol **Jelajahi Peta**. Sambutan pertama kali dan permintaan izin muncul setelah tombol ditekan.

