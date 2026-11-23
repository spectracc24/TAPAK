# Kebijakan Keamanan

## Versi yang didukung

Hanya rilis terbaru (saat ini **1.3.x**) yang menerima perbaikan keamanan.

## Melaporkan kerentanan

Jangan membuka issue publik untuk masalah keamanan. Gunakan **Report a vulnerability**
di tab *Security* repositori ini (GitHub Private Vulnerability Reporting). Sertakan langkah
reproduksi, versi TAPAK, dan versi Android. Kami berusaha menanggapi dalam 7 hari.

> Pemilik repo: aktifkan fitur ini di Settings → Code security → *Private vulnerability reporting*.

## Model ancaman singkat

- Data (objek, foto, jejak, peta PDF) disimpan **hanya di HP** (IndexedDB). Tidak ada server TAPAK.
- Rekaman latar belakang berjalan sebagai layanan Android dengan notifikasi permanen; titik jejak hanya disimpan di HP.
- Satu-satunya koneksi keluar adalah ke server tile peta (OpenStreetMap, OpenTopoMap, Esri) lewat HTTPS.
- Berkas yang diimpor (GeoPDF) diperlakukan tidak tepercaya: ukuran dibatasi, tanda `%PDF-` diperiksa,
  dan pdf.js dijalankan dengan `isEvalSupported:false` (mitigasi CVE-2024-4367).
- Backup Android dimatikan (`allowBackup=false`) dan lalu lintas HTTP tanpa enkripsi dilarang.
- Gunakan hanya APK **rilis** yang ditandatangani dan cocokkan checksum SHA-256 dari `SHA256SUMS.txt`.
