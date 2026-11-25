# TAPAK

**Teknologi Akuisisi dan Pencatatan Hutan Kita**
*Every Track Tells a Story.*

Aplikasi Android untuk pemetaan, navigasi, dan pencatatan lapangan yang tetap berfungsi tanpa internet.

> Dikembangkan oleh **Spectra Citra Cendekia (Spectra CC)** · *Science into Sustainable Solutions.*
> Website: <https://spectracc24.github.io/spectracc> · Kontak: cc.spectra24@gmail.com

---

## 1. Apa itu TAPAK

TAPAK membantu tim lapangan (patroli hutan, survei, pemetaan partisipatif) menandai titik, merekam jalur, menggambar area, dan memotret temuan dengan koordinat. Peta dasar bisa berupa **GeoPDF** yang diimpor ke HP sehingga tetap terpakai di tempat tanpa sinyal. Semua data tersimpan di HP dan dapat diekspor ke format GIS standar atau dicetak sebagai peta berlayout.

| | |
|---|---|
| **Nama** | TAPAK |
| **Versi saat ini** | **1.6.0** |
| **Tagline** | Every Track Tells a Story. |
| **Pengembang** | Spectra Citra Cendekia (Spectra CC), Pontianak, Kalimantan Barat |
| **ID aplikasi** | `id.tapak.patroli` |
| **Platform** | Android |
| **Bahasa antarmuka** | Indonesia |

## 2. Fitur

**Peta**
- Peta offline dari **GeoPDF** (ArcMap/QGIS): proyeksi asli dibaca dan di-warp eksak, opasitas bisa diatur, ada geser manual untuk kalibrasi.
- Peta online gratis (jalan, kontur, satelit) saat ada internet.
- GPS, kompas, skala, dan tiga format koordinat: derajat desimal, derajat-menit-detik, UTM.
- Ukuran font label nama objek di peta bisa diatur (Pengaturan → Data di peta).

**Pencatatan**
- Tandai titik (dari GPS atau ketuk peta), gambar jalur dan area, ukur jarak dan luas.
- Atribut bebas, foto lampiran dengan geotag EXIF, simbol (6 bentuk, 8 warna, gaya garis), warna otomatis menurut atribut “Jenis”.
- Elevasi dengan koreksi geoid EGM96 (offline), profil elevasi, kalibrasi offset.
- Batas akurasi GPS (baku 32 m) dengan peringatan atau blokir.
- Cari, saring, sembunyikan, pilih banyak objek sekaligus.

**Rekam jejak (tracking)**
- Bisa dijeda dan dilanjutkan; jarak selama jeda tidak dihitung.
- Tetap merekam saat layar dikunci atau aplikasi diminimalkan.
- Notifikasi bilah status: hijau **“Sedang tracking”** begitu rekaman dimulai, berganti oranye **“Track dijeda”** saat dijeda, kembali ke “Sedang tracking” saat dilanjutkan, dan hilang semua begitu rekaman dihentikan.
- Interval 2 detik, 30 detik, semua fix, atau custom.

**Ekspor data:** GeoJSON, KMZ, SHP (zip); semua, terpilih, atau yang tampil; simpan ke perangkat atau bagikan.

**Ekspor peta berlayout (PDF, PNG, JPEG)** — Lainnya → Ekspor peta
- Kertas A4, A3, atau custom (cm); lanskap atau portrait. Semua ukuran font dalam pt untuk A4 dan diskalakan otomatis untuk ukuran lain.
- Struktur halaman: **judul** (12 pt, tebal) dan **deskripsi** (10 pt) → **kanvas peta** (grid koordinat, arah utara di kanan atas, skala di kiri bawah) → **kotak kaki 4 kolom** (10 pt):
  1. Info: dibuat oleh, lokasi survey (hanya bila diisi), tanggal pembuatan, ukuran kertas, sistem koordinat (otomatis).
  2. Legenda tetap tiga: titik (semua bentuk simbol yang dipakai), jalur, area.
  3. Analisis (opsional): jumlah titik, panjang garis, luas area; bila mati tertulis “Analisis tidak disajikan”.
  4. Sumber data dan basemap, serta “Diproduksi dengan TAPAK App by Spectra CC”.
- Ukuran font label objek dapat diatur dengan slider atau angka (pt).
- Tata letak menghindari tumpang tindih: teks panjang menambah baris lalu dipotong dengan “…”; label dicoba di beberapa posisi dan yang tidak muat dilaporkan.
- **Draft layout:** simpan, ubah, dan hapus. Draft yang sudah berhasil diekspor otomatis dihapus.

**Lainnya**
- Persetujuan syarat dan kebijakan privasi di awal (sekali; muncul lagi hanya bila versinya naik).
- Kartu pengenalan fitur setelah izin diberikan (sekali), dengan tautan ke website.
- Lainnya → **Laporkan bug / penyalahgunaan** (subjek email = jenis laporan, captcha, butuh internet).
- Tombol **Dukung Pengembang** di halaman awal; nomor versi tampil di halaman awal, menu Lainnya, dan Tentang.

## 3. Persyaratan Sistem

| | |
|---|---|
| **Android** | 7.0 (API 24) atau lebih baru; dikompilasi untuk Android 16 (API 36) |
| **Sensor** | GPS (disarankan), kompas; kamera opsional |
| **Izin** | Lokasi presisi, kamera, notifikasi (Android 13+), layanan latar depan lokasi |
| **Internet** | Tidak wajib. Dipakai hanya untuk peta online dan mengirim laporan bug |
| **Penyimpanan** | Foto dan peta PDF disimpan di dalam aplikasi; beri ruang secukupnya |
| **Baterai** | Di Xiaomi, Oppo, Vivo, Samsung dan sejenisnya, atur Baterai TAPAK ke “Tanpa batasan” agar rekaman latar belakang stabil |

## 4. Pengembang

**Spectra Citra Cendekia (Spectra CC)** · <https://spectracc24.github.io/spectracc> · cc.spectra24@gmail.com
Pontianak, Kalimantan Barat, Indonesia.

## 5. Teknologi dan Package

**Kerangka:** aplikasi web (HTML, CSS, JavaScript tanpa framework) dibungkus menjadi APK dengan **Capacitor 8**. Build otomatis di GitHub Actions (Ubuntu, Java 21 Temurin, Android SDK 36).

| Package | Versi | Fungsi |
|---|---|---|
| `@capacitor/core`, `cli`, `android` | 8.6.2 | Pembungkus aplikasi menjadi APK |
| `@capacitor/geolocation` | 8.2.5 | GPS layar depan, izin lokasi |
| `@capacitor-community/background-geolocation` | 1.3.1 | Rekaman latar belakang (layanan latar depan) |
| `@capacitor/local-notifications` | 8.3.1 | Izin notifikasi dan notifikasi “Track dijeda” |
| `@capacitor/camera` | 8.2.6 | Izin kamera |
| `@capacitor/filesystem` | 8.1.5 | Berkas ekspor sementara |
| `@capacitor/share` | 8.0.3 | Berbagi berkas |
| `@capacitor/assets` (dev) | 4.0.0 | Ikon dan splash |
| Leaflet | 1.9.4 | Mesin peta |
| pdf.js (`pdfjs-dist`) | 6.5.438 | Membaca dan merender GeoPDF |
| proj4 | 2.9.2 | Proyeksi koordinat (UTM) |
| JSZip | 3.10.1 | KMZ dan ZIP |
| piexifjs | 1.0.6 | Geotag EXIF foto |
| @mapbox/shp-write | 0.4.3 | Shapefile |
| egm96-universal | 1.1.1 | Model geoid offline |
| @fontsource/manrope, inter | 5.3.0 | Font identitas Spectra CC |

Plugin lokal `FileSaver` (`native/`) membuka dialog “Simpan sebagai” Android. Penyimpanan data memakai IndexedDB di dalam aplikasi.
Layanan pihak ketiga hanya untuk laporan bug: **Formspree** (penerus email) dan **hCaptcha** (captcha).

**Struktur repo**

```
www/index.html, style.css     Tampilan
www/app.js, ui.js             Logika aplikasi, panel, notifikasi tracking
www/extras.js, config.js      Persetujuan, laporan bug, tautan website, konfigurasi publik
www/mapexport.js              Mesin layout & ekspor peta (kanvas -> PNG/JPEG/PDF)
www/mapexport-ui.js           Panel ekspor peta, draft layout
www/perm.js, georef.js        Izin Android; georeferensi GeoPDF
native/                       FileSaverPlugin.java, MainActivity.java (dipasang saat build)
test/                         Uji otomatis: npm test, npm run test:map
tools/, assets/, prepare.js   Ikon, splash, penyalinan library
.github/workflows/build.yml   Build APK otomatis
```

## 6. Menyiapkan laporan bug (sekali oleh pemilik repo)

Fitur laporan tidak punya server sendiri. Tanpa langkah ini, tombol **Kirim laporan** memakai cadangan: membuka aplikasi email dengan subjek dan isi terisi.

1. Daftar di <https://formspree.io> dengan **cc.spectra24@gmail.com**, buat formulir, salin ID-nya (bagian setelah `/f/`).
2. Daftar di <https://www.hcaptcha.com>, buat site, salin **Site key** dan **Secret key**.
3. Di pengaturan formulir Formspree, aktifkan CAPTCHA hCaptcha dan tempel **Secret key** di sana.
4. Isi `www/config.js`: `formspreeId` dan `hcaptchaSiteKey` (kedua nilai ini publik). **Jangan** menaruh secret key di repo.
5. Build ulang, lalu kirim satu laporan uji dari HP.

Subjek email = jenis laporan (“Bug” atau “Penyalahgunaan”). Pengiriman gagal dengan pemberitahuan bila tidak ada sinyal.

## 7. Catatan penggunaan

- `useLegacyBridge: true` di `capacitor.config.json` **jangan dihapus**; tanpa itu pembaruan lokasi latar belakang berhenti sekitar 5 menit setelah aplikasi diminimalkan.
- Jangan geser-tutup TAPAK dari daftar aplikasi terbaru saat merekam.
- Rekaman yang terputus (aplikasi ditutup paksa, HP restart) dilanjutkan saat TAPAK dibuka lagi.
- Datum: titik kontrol GeoPDF diperlakukan sebagai WGS84; peta berdatum lokal bisa bergeser, gunakan **Geser** untuk kalibrasi.
- Peta online tidak disimpan untuk offline; pemakaian tile mengikuti kebijakan penyedia.
- Elevasi dari GPS HP: ketelitian vertikal biasanya 2–3× lebih buruk dari horizontal.
- Belum ada impor GeoJSON/KML/SHP maupun edit vertex setelah objek disimpan.
- Belum diuji di semua merek dan versi Android.

## 8. Keamanan, izin, dan penandatanganan APK

Izin diperiksa setiap aplikasi dibuka dan setiap kembali aktif (`www/perm.js`; `PERM_STRICT = true` menyembunyikan “Nanti saja”). Tanpa keystore, workflow hanya membuat APK **debug**. Untuk rilis:

1. `keytool -genkeypair -v -keystore tapak.jks -alias tapak -keyalg RSA -keysize 4096 -validity 10000`
2. Simpan `tapak.jks` **di luar repo** dan buat cadangannya (kunci hilang = APK tidak bisa diperbarui).
3. `base64 -w0 tapak.jks`, lalu di GitHub Settings → Secrets → Actions tambahkan `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
4. Setiap push menghasilkan APK rilis bertanda tangan dan `SHA256SUMS.txt`.

Google mulai mewajibkan verifikasi developer untuk APK di luar Play Store secara bertahap; periksa persyaratan terbaru di developer.android.com/developer-verification. Pelaporan kerentanan: lihat `SECURITY.md`.

## 9. Lisensi dan Atribusi

Peta dasar online: © kontributor OpenStreetMap; tampilan kontur © OpenTopoMap (CC-BY-SA); citra: Esri, Maxar, Earthstar Geographics, dan komunitas pengguna GIS.

Library pihak ketiga memakai lisensinya masing-masing: Leaflet (BSD-2-Clause), pdf.js (Apache-2.0), proj4 (MIT), JSZip (MIT atau GPL-3.0), piexifjs (MIT), @mapbox/shp-write (BSD-2-Clause), egm96-universal (MIT), Capacitor (MIT), font Manrope dan Inter (SIL OFL).

Logo dan identitas visual Spectra CC mengikuti *Brand Identity & Strategic Guideline* v1.0 (Spectra Citra Cendekia, AHU-015113.AH.01.30 Tahun 2025). **Lisensi kode TAPAK sendiri belum ditetapkan**; tentukan sesuai kebijakan organisasi lalu tambahkan berkas `LICENSE`.

## 10. Catatan Versi Terkini — 1.6.0

**Ekspor peta**
- Layout baru mengikuti rancangan: judul 12 pt, deskripsi 10 pt, kanvas, dan kotak kaki 4 kolom (info, legenda, analisis, sumber + produksi), untuk lanskap dan portrait, semua font dalam pt dan diskalakan menurut ukuran kertas.
- Kolom baru “Lokasi pengukuran/survey”; opsi “Sajikan analisis”; tanggal, ukuran kertas, sistem koordinat otomatis.
- Slider ukuran font label; label bisa 2–3 baris, menghindari simbol, kartu utara/skala, dan label lain.
- Draft layout (simpan, ubah, hapus); draft yang sudah diekspor otomatis hilang.
- Tinggi kaki mengikuti isi; teks kepanjangan menambah baris atau dipotong “…”.

**Tracking**
- Izin notifikasi diminta *sebelum* rekaman dimulai agar notifikasi “Sedang tracking” langsung tampil. Saat dijeda diganti notifikasi oranye “Track dijeda”; saat dilanjutkan kembali; semuanya hilang saat dihentikan atau dibuang. Notifikasi sisa dibersihkan saat aplikasi dibuka tanpa rekaman aktif.

**Alur awal**
- Persetujuan syarat dan privasi (sekali), kartu pengenalan fitur setelah izin (sekali), tombol **Dukung Pengembang**, nomor versi di halaman awal.
- Lainnya → Laporkan bug / penyalahgunaan dengan captcha.
- Ukuran font label nama di peta dapat diatur di Pengaturan.
- Uji otomatis `test/mapexport.test.js`; README diperbarui.

Catatan rilis sebelumnya ada di riwayat commit.
