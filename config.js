// ============================================================
//  KONFIGURASI SITUS — ubah nilai di file ini saja.
//  Tidak perlu menyentuh index.html / app.js.
// ============================================================
window.COURT_CONFIG = {
  // Nama yang tampil di judul halaman
  siteName: 'POMI Tennis Court',
  tagline: 'Jadwal & booking lapangan tenis',

  // Nomor WhatsApp admin untuk menerima permintaan booking.
  // Format internasional TANPA "+" dan tanpa spasi, contoh: '6281234567890'.
  // Biarkan kosong ('') selama nomor belum ditentukan — tombol booking
  // akan menyalin teks permintaan ke clipboard sebagai gantinya.
  adminWhatsApp: '',

  // Jam operasional lapangan (format 24 jam) dan durasi satu slot (menit)
  openHour: 6,
  closeHour: 22,
  slotMinutes: 60,

  // Berapa hari ke depan yang ditampilkan di jadwal
  daysAhead: 14,

  // Jumlah lapangan (nama yang tampil di jadwal)
  courts: ['Lapangan 1'],

  // Informasi yang tampil di bagian "Info Lapangan"
  info: [
    { label: 'Jam operasional', value: '06.00 – 22.00' },
    { label: 'Durasi booking', value: 'Per 1 jam, maks. 2 jam per hari' },
    { label: 'Lampu malam', value: 'Tersedia mulai 18.00' },
    { label: 'Kontak', value: 'Hubungi admin lewat tombol booking' },
  ],

  // Tata tertib — ubah sesuai aturan pengelola
  rules: [
    'Booking dianggap sah setelah dikonfirmasi admin dan slot tampil "Terisi" di jadwal.',
    'Gunakan sepatu tenis (sol rata, tidak meninggalkan bekas di lapangan).',
    'Datang tepat waktu; slot yang tidak dipakai 15 menit setelah mulai dapat diberikan ke pemain lain.',
    'Jaga kebersihan lapangan dan buang sampah pada tempatnya.',
    'Pembatalan mohon diinformasikan ke admin paling lambat 2 jam sebelumnya.',
  ],
};
