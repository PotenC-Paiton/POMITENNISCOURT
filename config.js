// ============================================================
//  PENGATURAN KLUB — ubah nilai di file ini saja.
// ============================================================
window.COURT_CONFIG = {
  siteName: 'PE-POMI Tennis Court',
  tagline: 'Member dashboard & court booking',

  // Login memakai username saja. Di belakang layar username diubah menjadi
  // alamat "username@<authDomain>" untuk Firebase Auth — alamat ini tidak
  // pernah dipakai mengirim email. JANGAN diubah setelah ada anggota terdaftar.
  authDomain: 'potenc.tennis',

  // Jam operasional (24 jam) dan durasi satu slot (menit)
  openHour: 6,
  closeHour: 22,
  slotMinutes: 60,

  // Batas booking anggota (pengurus tidak dibatasi):
  //  - maksimal N reservasi per minggu (minggu = Senin s/d Minggu; reservasi yang dibatalkan tidak dihitung)
  //  - maksimal N jam per satu reservasi
  maxReservationsPerWeek: 2,
  maxHoursPerReservation: 2,

  // Berapa hari ke depan yang bisa dibooking
  daysAhead: 14,

  // Daftar lapangan
  courts: ['Court 1', 'Court 2'],

  // Pilihan unit/departemen saat daftar (kosongkan [] untuk isian bebas)
  units: [],

  rules: [
    'Bookings take effect immediately and are visible to all members.',
    'Each member may make up to 2 reservations per week (Monday–Sunday), with a maximum of 2 hours per reservation.',
    'If you will not play, cancel your booking in the app so other members can use the slot.',
    'A slot that is not used within 15 minutes of its start time may be given to other players.',
    'Wear tennis shoes and keep the court clean.',
  ],
};
