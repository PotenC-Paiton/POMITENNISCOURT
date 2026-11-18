# POTENC Tennis Court

Dashboard anggota dan booking lapangan tenis. Tampilan di-host di **GitHub Pages**; login dan data memakai **Firebase** (Authentication + Firestore, paket gratis).

## Fitur

- **Daftar & login pakai username** (tanpa email). Akun baru berstatus *Menunggu verifikasi* sampai disetujui pengurus.
- **Dashboard**: slot terisi/tersedia hari ini, jam terpakai 7 hari ke depan, booking saya, jadwal hari ini, grafik pemakaian.
- **Booking langsung**: slot terkunci begitu dibooking (tidak bisa bentrok), maksimal 2 jam per anggota per hari (bisa diatur), batal sendiri.
- **Pengurus**: verifikasi / tolak / nonaktifkan anggota, angkat pengurus lain, batalkan booking siapa pun, atur tanggal tutup dan jadwal rutin mingguan.
- **Profil**: ubah nama, unit, nomor HP, dan ganti password.

## Setup Firebase (sekali saja)

1. **Authentication** → *Get started* → *Sign-in method* → aktifkan **Email/Password**.
   (Login memakai username; di belakang layar dibuat alamat `username@potenc.tennis` yang tidak pernah dipakai mengirim email.)
2. **Firestore Database** → *Create database* → lokasi `asia-southeast2 (Jakarta)` → mode *production*.
3. **Firestore → Rules**: hapus isi lama, tempel seluruh isi file [`firestore.rules`](firestore.rules), klik **Publish**.
4. **Project settings** (ikon gerigi) → *General* → *Your apps* → ikon **`</>`** (Web) → beri nama → *Register app*. Salin isi `firebaseConfig` ke file [`firebase-config.js`](firebase-config.js).
5. **Authentication → Settings → Authorized domains**: pastikan `potenc-paiton.github.io` ada di daftar (tambahkan bila belum).

## Pengurus pertama

Akun pertama tidak bisa disetujui oleh siapa pun, jadi diangkat manual sekali:

1. Buka situs, **Daftar** dengan username pengurus.
2. Firebase Console → **Firestore** → koleksi `users` → dokumen akun tersebut.
3. Ubah `status` menjadi `approved` dan `role` menjadi `pengurus`.
4. Muat ulang situs. Selanjutnya pengurus ini memverifikasi anggota lain dan bisa mengangkat pengurus lain dari menu **Anggota**.

## Lupa password

Karena tanpa email, tidak ada reset otomatis. Langkahnya:

1. Firebase Console → **Authentication → Users** → hapus akun `username@potenc.tennis` orang tersebut.
2. Di situs, menu **Anggota → Ditolak / nonaktif** (nonaktifkan dulu bila masih aktif) → **Hapus** datanya.
3. Orang tersebut **Daftar** ulang dengan username yang sama, lalu pengurus menyetujuinya.

Anggota yang masih ingat password bisa menggantinya sendiri di menu **Profil**.

## Pengaturan (`config.js`)

| Kunci | Isi |
|---|---|
| `openHour`, `closeHour`, `slotMinutes` | Jam buka, jam tutup, durasi satu slot. |
| `maxHoursPerDay` | Batas booking per anggota per hari (pengurus tidak dibatasi). |
| `daysAhead` | Berapa hari ke depan yang bisa dibooking. |
| `courts` | Daftar lapangan. Lebih dari satu → muncul pilihan lapangan. |
| `units` | Pilihan unit/departemen saat daftar (kosong = isian bebas). |
| `rules` | Tata tertib di dashboard. |
| `authDomain` | Jangan diubah setelah ada anggota terdaftar. |

## Struktur data Firestore

- `users/{uid}`: `username, name, unit, phone, role (member|pengurus), status (pending|approved|rejected), createdAt`
- `bookings/{tanggal_lapangan_jam}`: satu dokumen per slot; `date, court, start, end, uid, username, name, note, group`
- `closed/{tanggal}`: `reason`
- `recurring/{id}`: `day (0=Minggu), start, end, court, label`

Batas jam per hari dicek di aplikasi; aturan keamanan memastikan hanya anggota terverifikasi yang bisa membaca/membooking dan slot yang sudah terisi tidak bisa ditimpa.

## Menjalankan di komputer sendiri

```
python -m http.server 8000
```

lalu buka `http://localhost:8000` (tambahkan `localhost` di *Authorized domains* bila perlu).
