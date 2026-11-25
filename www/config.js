// Konfigurasi publik TAPAK (aman dibaca siapa pun; kunci di bawah memang kunci PUBLIK).
window.TAPAK_CFG = {
  site: 'https://spectracc24.github.io/spectracc',   // website pengembang (Dukung Pengembang, Selengkapnya)
  email: 'cc.spectra24@gmail.com',                    // tujuan laporan bug / penyalahgunaan
  // Pengiriman laporan memakai Formspree + hCaptcha. Isi dua nilai ini (lihat README bagian "Menyiapkan laporan bug").
  // Selama kosong, tombol kirim memakai cadangan: membuka aplikasi email dengan subjek dan isi laporan terisi.
  formspreeId: '',        // ID formulir Formspree, mis. 'xyzabcde'  (formulir didaftarkan atas cc.spectra24@gmail.com)
  hcaptchaSiteKey: ''     // Site key hCaptcha (kunci publik). Secret key ditempel di pengaturan formulir Formspree, BUKAN di sini.
};
