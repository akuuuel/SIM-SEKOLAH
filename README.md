# 🏫 SIM-SEKOLAH — Sistem Presensi & Manajemen Madrasah
### MAN 1 BULUKUMBA
> **Sistem Presensi Siswa Modern Berbasis Progressive Web App (PWA) dengan Arsitektur Offline-First, Pemindai Barcode/QR Real-Time, dan Portal Terintegrasi untuk Orang Tua & Madrasah.**

---

## 📌 Ringkasan Proyek

**SIM-SEKOLAH MAN 1 Bulukumba** adalah platform presensi digital yang dirancang khusus untuk memenuhi kebutuhan madrasah dalam mencatat kehadiran siswa secara cepat, akurat, dan transparan. Dibangun dengan pendekatan **Offline-First**, sistem tetap dapat beroperasi 100% normal untuk pemindaian presensi di gerbang madrasah meskipun koneksi internet terputus, dan otomatis melakukan sinkronisasi data seketika jaringan pulih.

---

## ✨ Fitur Utama

### 1. 🕒 Pencatatan Presensi Akurat (Masuk & Pulang)
- **Waktu Masuk & Pulang Lengkap:** Mencatat jam kedatangan dan jam kepulangan siswa hingga satuan detik (WITA).
- **Status Kehadiran Otomatis:** Menentukan status secara otomatis berdasarkan batas toleransi jam madrasah (`HADIR`, `TERLAMBAT`, `PULANG`, `IZIN`, `SAKIT`, `ALFA`).
- **Pencatatan Presensi Manual:** Operator madrasah dapat menginput izin, sakit, maupun dispensasi BK disertai alasan/keterangan.

### 2. ⚡ Pemindai Barcode / QR Cepat (Scanner 360)
- Mendukung pemindai barcode perangkat keras USB / Bluetooth (POS scanner) dengan input cepat bebas lag.
- Mendukung pemindaian menggunakan kamera HP/perangkat mobile secara responsif.
- Dilengkapi audio feedback (suara notifikasi kedatangan/kepulangan) dan popup konfirmasi visual seketika.

### 3. 🌐 Arsitektur PWA Offline-First
- Menggunakan **IndexedDB (Dexie.js)** di sisi client untuk menyimpan basis data lokal di perangkat.
- **Service Worker v48** meng-cache seluruh aset web sehingga aplikasi dapat dibuka dan digunakan tanpa kuota/internet.
- **Penanganan Multi-Akun Offline:** Orang tua atau operator dapat berpindah akun di satu HP walau sedang tidak terkoneksi ke internet.

### 4. 👨‍👩‍👧‍👦 Portal Wali Murid / Orang Tua
- **Tampilan Khusus Mobile & Desktop:** Desain elegan bergaya modern (*Apple Frosted Glass & Emerald Madrasah Theme*).
- **Urutan Catatan Terkini:** Transaksi terakhir (seperti jam pulang) selalu ditampilkan di urutan paling atas.
- **Dukungan Multi-Anak:** Satu akun orang tua dapat memantau lebih dari satu anak yang bersekolah di MAN 1 Bulukumba.
- **Web Push Notification:** Notifikasi langsung ke layar HP orang tua ketika anak berhasil scan masuk atau scan pulang.

### 5. 📊 Rekapitulasi, Cetak PDF, & Export Data
- **Cetak Dokumen Resmi PDF:** Generator PDF native tanpa dependensi eksternal, mencantumkan jam masuk dan jam pulang secara rapi untuk arsip madrasah.
- **Export Excel / CSV:** Unduh laporan presensi harian, bulanan, maupun per kelas dengan format siap cetak.
- **Sinkronisasi Dua Arah:** Terintegrasi dengan database MySQL server dan Google Sheets untuk kemudahan backup data.

---

## 🛠️ Tech Stack

- **Frontend:** [React 18](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/), [Lucide React Icons](https://lucide.dev/)
- **Database Client-Side:** [Dexie.js](https://dexie.org/) (Wrapper IndexedDB untuk performa offline)
- **Backend API:** PHP 8+ (PDO MySQL, REST API)
- **Database Server:** MySQL / MariaDB
- **PWA & Notifikasi:** Service Worker v48, Web Push API (VAPID protocol), Native Audio Feedback

---

## 📁 Struktur Direktori

```plaintext
Web Absensi/
├── api/                         # Backend REST API (PHP PDO)
│   ├── db.php                   # Konfigurasi koneksi MySQL & CORS
│   ├── index.php                # Endpoint sinkronisasi data presensi & siswa
│   ├── export.php               # Endpoint cetak laporan PDF & Excel
│   ├── export_parent_report.php # Endpoint rekap presensi per siswa untuk orang tua
│   ├── web_push.php             # Service pengirim notifikasi Web Push
│   └── vapid.json.example       # Template konfigurasi kunci VAPID
├── database.sql                 # Struktur skema basis data MySQL
├── public/                      # Aset statis PWA (icons, manifest, sound, sw.js)
├── src/                         # Sumber kode utama Frontend React
│   ├── app/                     # Layout shell aplikasi (Admin & Parent Shell)
│   ├── components/              # Komponen reusable (Modal, Topbar, Sidebar, Backdrop)
│   ├── db/                      # Skema Dexie.js (IndexedDB local database)
│   ├── features/                # Modul fitur aplikasi
│   │   ├── admin/               # Dashboard statistik admin madrasah
│   │   ├── auth/                # Halaman login (Admin, Operator, Orang Tua)
│   │   ├── operator/            # Layar pemindai barcode / presensi gerbang
│   │   ├── parent/              # Portal dasbor orang tua (Mobile & Desktop)
│   │   ├── reports/             # Halaman rekap & cetak laporan presensi
│   │   ├── settings/            # Pengaturan jam operasional & hari libur
│   │   ├── students/            # Manajemen data siswa & cetak kartu barcode
│   │   └── users/               # Manajemen akun pengguna
│   ├── services/                # Layanan sinkronisasi data & holiday API
│   └── types/                   # Definisi tipe TypeScript
└── index.html                   # Entry point aplikasi web PWA
```

---

## 🚀 Panduan Instalasi & Menjalankan

### 1. Prasyarat Sistem
- **Web Server:** XAMPP / Apache dengan PHP 8.0 atau lebih baru.
- **Database:** MySQL / MariaDB.
- **Node.js:** Versi 18+ dan NPM.

### 2. Konfigurasi Basis Data
1. Buka **phpMyAdmin** di browser (`http://localhost/phpmyadmin`).
2. Buat database baru bernama `db_absensi_man1`.
3. Import berkas `database.sql` ke dalam database tersebut.
4. Sesuaikan konfigurasi database jika diperlukan pada berkas `api/db.php`:
   ```php
   $db_host = 'localhost';
   $db_name = 'db_absensi_man1';
   $db_user = 'root';
   $db_pass = '';
   ```

### 3. Konfigurasi Web Push (VAPID)
Salin berkas `api/vapid.json.example` menjadi `api/vapid.json` dan isi dengan pasangan kunci VAPID Anda:
```bash
cp api/vapid.json.example api/vapid.json
```

### 4. Instalasi Dependensi & Menjalankan Frontend
```bash
# Instal seluruh package NPM
npm install

# Jalankan dalam mode pengembangan (Development)
npm run dev

# Kompilasi untuk produksi (Build Production)
npm run build
```

Hasil kompilasi build akan otomatis ditempatkan pada folder `dist/` dan siap disajikan melalui web server Apache XAMPP atau hosting cPanel.

---

## 🔐 Akun Akses Default (Pengembangan Awal)

| Peran (Role) | Username / Nomor HP | Password Default | Keterangan |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `admin` | `admin123` | Akses penuh seluruh pengaturan & data |
| **Operator Gerbang** | `admin_pc01` | `operator123` | Khusus pemindaian presensi gerbang |
| **Orang Tua Siswa** | Nomor HP Siswa | Nomor HP Siswa | Portal pantau kehadiran anak |

---

## 📄 Lisensi

Proyek ini dilindungi di bawah lisensi **MIT License** — silakan baca berkas [LICENSE](LICENSE) untuk informasi lebih detail.
Dikelola dan dikembangkan untuk lingkungan pendidikan **MAN 1 Bulukumba**.
