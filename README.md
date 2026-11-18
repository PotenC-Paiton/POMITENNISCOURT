# POMI Tennis Court

Situs statis untuk melihat jadwal lapangan tenis dan mengirim permintaan booking ke admin lewat WhatsApp. Tidak butuh server atau database, jadi bisa langsung di-host di **GitHub Pages**.

## Cara kerja

1. Pengunjung membuka situs, memilih tanggal (14 hari ke depan) dan slot jam yang **Tersedia**.
2. Pengunjung mengisi nama, unit, durasi, dan jumlah pemain, lalu klik **Kirim via WhatsApp**. WhatsApp terbuka dengan pesan yang sudah terisi ke nomor admin.
3. Admin mengonfirmasi, lalu menambahkan booking ke `data/bookings.json`. Setelah di-commit, slot itu tampil **Terisi** untuk semua orang.

## Mengaktifkan GitHub Pages

1. Buka repo di GitHub → **Settings** → **Pages**.
2. **Source**: *Deploy from a branch*, **Branch**: `main` / `(root)` → **Save**.
3. Tunggu 1–2 menit. Situs tersedia di `https://potenc-paiton.github.io/POMITENNISCOURT/`.

## Pengaturan (`config.js`)

| Kunci | Isi |
|---|---|
| `adminWhatsApp` | Nomor WhatsApp admin, format internasional tanpa `+`, contoh `6281234567890`. Kosong = teks permintaan disalin ke clipboard. |
| `openHour`, `closeHour`, `slotMinutes` | Jam buka, jam tutup, dan durasi satu slot. |
| `daysAhead` | Jumlah hari ke depan yang tampil di jadwal. |
| `courts` | Daftar nama lapangan. Lebih dari satu → muncul pilihan lapangan. |
| `info`, `rules` | Isi bagian Info Lapangan dan Tata Tertib. |

## Mengisi jadwal (`data/bookings.json`)

Admin bisa mengedit file ini langsung di GitHub (ikon pensil → *Commit changes*).

```json
{
  "bookings": [
    { "date": "2026-11-21", "start": "16:00", "end": "18:00", "name": "Budi", "court": "Lapangan 1" }
  ],
  "recurring": [
    { "day": 3, "start": "16:00", "end": "18:00", "label": "Latihan rutin" }
  ],
  "closed": [
    { "date": "2026-12-25", "reason": "Libur" }
  ]
}
```

- `bookings`: booking satu kali, tanggal format `YYYY-MM-DD`.
- `recurring`: jadwal rutin mingguan. `day`: 0 = Minggu, 1 = Senin, …, 6 = Sabtu.
- `closed`: tanggal lapangan tutup.
- Jam memakai format 24 jam `HH:MM`. `court` boleh dikosongkan (artinya lapangan pertama).

Contoh data di file ini hanya ilustrasi. Hapus atau ganti sebelum dipakai.

## Menjalankan di komputer sendiri

Membuka `index.html` langsung (double-click) tidak bisa memuat `bookings.json` karena batasan browser. Jalankan server lokal dari folder ini:

```
python -m http.server 8000
```

lalu buka `http://localhost:8000`.
