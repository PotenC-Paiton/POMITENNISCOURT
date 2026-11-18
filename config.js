// ============================================================
//  PENGATURAN KLUB — ubah nilai di file ini saja.
// ============================================================
window.COURT_CONFIG = {
  siteName: 'POTENC Tennis Court',
  tagline: 'Dashboard anggota & booking lapangan',

  // Login memakai username saja. Di belakang layar username diubah menjadi
  // alamat "username@<authDomain>" untuk Firebase Auth — alamat ini tidak
  // pernah dipakai mengirim email. JANGAN diubah setelah ada anggota terdaftar.
  authDomain: 'potenc.tennis',

  // Jam operasional (24 jam) dan durasi satu slot (menit)
  openHour: 6,
  closeHour: 22,
  slotMinutes: 60,

  // Batas booking per anggota per hari (jam). Pengurus tidak dibatasi.
  maxHoursPerDay: 2,

  // Berapa hari ke depan yang bisa dibooking
  daysAhead: 14,

  // Daftar lapangan
  courts: ['Lapangan 1', 'Lapangan 2'],

  // Pilihan unit/departemen saat daftar (kosongkan [] untuk isian bebas)
  units: [],

  rules: [
    'Booking berlaku langsung dan terlihat oleh semua anggota.',
    'Maksimal 2 jam per anggota per hari.',
    'Batalkan booking lewat aplikasi bila tidak jadi bermain, agar slot bisa dipakai anggota lain.',
    'Slot yang tidak dipakai 15 menit setelah mulai dapat diberikan ke pemain lain.',
    'Gunakan sepatu tenis dan jaga kebersihan lapangan.',
  ],
};
