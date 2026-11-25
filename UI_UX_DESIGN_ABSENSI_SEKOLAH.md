# UI/UX DESIGN — SISTEM ABSENSI SEKOLAH OFFLINE-FIRST

> **Status:** Draft desain UI/UX  
> **Versi:** 1.0  
> **Tanggal:** 9 November 2026  
> **Dokumen acuan:** `SYSTEM_DESIGN_ABSENSI_SEKOLAH.md`  
> **Referensi visual:** Dashboard dengan sidebar hitam, aksen biru elektrik, area konten abu-abu terang, topbar biru, kartu statistik, grafik, dan panel informasi seperti gambar referensi pengguna.

---

## 1. Tujuan Dokumen

Dokumen ini menjadi pedoman desain antarmuka dan pengalaman pengguna (UI/UX) untuk aplikasi absensi sekolah. Dokumen harus digunakan bersama `SYSTEM_DESIGN_ABSENSI_SEKOLAH.md` dan tidak menggantikan keputusan arsitektur, database, maupun aturan bisnis yang telah ditetapkan di sana.

Tujuan desain:

1. Menghasilkan dashboard sekolah yang modern, rapi, profesional, dan mudah dipahami.
2. Mengadaptasi bahasa visual gambar referensi tanpa menyalin konten dashboard penjualan.
3. Memprioritaskan kecepatan operator ketika mencatat absensi.
4. Menampilkan status online/offline dan sinkronisasi dengan jelas.
5. Menjaga tampilan konsisten untuk admin, operator, dan orang tua.
6. Tetap nyaman digunakan pada desktop, laptop, tablet, dan ponsel.

## 2. Prinsip Desain

### 2.1 Visual utama

Gunakan karakter visual dari gambar referensi:

- Sidebar gelap/hitam di sisi kiri.
- Area konten utama berwarna abu-abu sangat terang atau putih.
- Biru elektrik sebagai warna aksen utama.
- Header/topbar biru dengan bentuk sederhana.
- Kartu informasi putih dengan sudut membulat.
- Bayangan halus, bukan bayangan tebal.
- Grafik sederhana dengan label yang terbaca.
- Ikon garis (outline) yang konsisten.
- Ruang kosong yang cukup agar dashboard tidak terasa padat.

### 2.2 Adaptasi untuk aplikasi sekolah

Jangan menggunakan konten contoh pada gambar seperti Customer, Orders, Earning, Top Product Sale, atau Traffic Source. Ganti dengan informasi yang relevan untuk absensi:

- Total siswa aktif.
- Hadir hari ini.
- Terlambat hari ini.
- Belum melakukan absensi.
- Tren kehadiran.
- Distribusi status kehadiran.
- Aktivitas absensi terbaru.
- Status perangkat dan sinkronisasi.

### 2.3 Prinsip UX

- **Operator-first:** halaman pemindaian harus menjadi halaman paling cepat dan sederhana.
- **Offline-aware:** pengguna selalu tahu apakah aplikasi online, offline, sedang sinkronisasi, atau memiliki transaksi tertunda.
- **Feedback langsung:** setiap scan menampilkan hasil yang jelas dalam waktu singkat.
- **Error prevention:** cegah scan ganda, sesi yang salah, dan pengiriman transaksi berulang.
- **Progressive disclosure:** tampilkan informasi utama dahulu; detail lanjutan berada di halaman detail atau panel.
- **Accessible:** jangan menyampaikan status hanya dengan warna; selalu sertakan teks atau ikon.
- **Consistent:** pola tombol, formulir, tabel, badge, dan navigasi harus konsisten di seluruh halaman.

---

## 3. Design System

### 3.1 Palet warna

Gunakan warna berikut sebagai token awal. Nilai dapat disesuaikan setelah implementasi visual pertama, tetapi penggunaannya harus konsisten.

| Token | Nilai | Penggunaan |
|---|---|---|
| `primary-600` | `#172BFF` | Tombol utama, navigasi aktif, link penting |
| `primary-700` | `#1022D8` | Hover/pressed tombol utama |
| `primary-100` | `#E8EBFF` | Latar elemen aktif yang lembut |
| `sidebar` | `#090A0F` | Latar sidebar |
| `sidebar-muted` | `#171923` | Hover item sidebar |
| `canvas` | `#F3F4F6` | Latar area utama |
| `surface` | `#FFFFFF` | Kartu, panel, modal |
| `text-primary` | `#171923` | Teks utama |
| `text-secondary` | `#6B7280` | Teks pendukung |
| `border` | `#E5E7EB` | Garis pemisah dan border |
| `success` | `#16A34A` | Berhasil, tersinkron |
| `success-bg` | `#DCFCE7` | Latar status berhasil |
| `warning` | `#D97706` | Perlu perhatian, pending |
| `warning-bg` | `#FEF3C7` | Latar status pending |
| `danger` | `#DC2626` | Gagal, ditolak, konflik |
| `danger-bg` | `#FEE2E2` | Latar status gagal |
| `info` | `#2563EB` | Informasi |
| `info-bg` | `#DBEAFE` | Latar informasi |

**Aturan warna:**

- Biru adalah aksen utama, bukan warna untuk semua elemen.
- Hijau hanya untuk keadaan berhasil/tersinkron.
- Kuning/oranye untuk pending/perlu perhatian.
- Merah untuk gagal, konflik, atau tindakan berisiko.
- Pastikan kontras teks terhadap latar memenuhi aksesibilitas.
- Jangan menggunakan warna saja untuk membedakan status.

### 3.2 Tipografi

Gunakan satu keluarga font sans-serif, disarankan **Inter** atau font sistem yang setara.

| Elemen | Ukuran desktop | Berat |
|---|---:|---|
| Judul halaman | 24–28 px | 600–700 |
| Judul bagian | 16–18 px | 600 |
| Judul kartu | 14–16 px | 600 |
| Isi utama | 14 px | 400 |
| Label/form | 13–14 px | 500 |
| Teks bantuan | 12 px | 400 |
| Angka KPI | 26–32 px | 700 |

Gunakan line-height yang nyaman. Hindari teks kecil untuk informasi penting seperti hasil scan, status offline, dan jumlah transaksi pending.

### 3.3 Bentuk dan elevasi

- Radius kartu: 12–16 px.
- Radius tombol/input: 8–10 px.
- Radius badge: 999 px atau pill.
- Border: 1 px solid `#E5E7EB`.
- Shadow kartu: lembut dan tipis.
- Hindari efek glassmorphism berlebihan.
- Hindari gradient yang terlalu ramai.
- Gunakan transisi singkat sekitar 150–200 ms untuk hover/focus.

### 3.4 Ikon

Gunakan ikon outline dari satu set yang konsisten, misalnya Lucide.

Ikon yang disarankan:

| Fungsi | Ikon |
|---|---|
| Dashboard | `layout-dashboard` |
| Absensi | `scan-line` |
| Siswa | `users` |
| Kelas | `school` |
| Laporan | `chart-column` |
| Perangkat | `monitor` |
| Sinkronisasi | `refresh-cw` |
| Pengguna | `user-round` |
| Pengaturan | `settings` |
| Notifikasi | `bell` |
| Keluar | `log-out` |
| Online | `wifi` |
| Offline | `wifi-off` |

---

## 4. Layout Global

### 4.1 Desktop

Gunakan layout dashboard seperti gambar referensi:

- Sidebar tetap di kiri.
- Topbar berada di bagian atas area konten.
- Konten utama menggunakan latar `canvas`.
- Konten menggunakan grid responsif.
- Sidebar desktop dapat diperlebar atau diciutkan.
- Area konten memiliki padding 24–32 px.

Struktur:

```text
┌────────────────────────────────────────────────────────────────────┐
│ SIDEBAR       │ TOPBAR: Search | Status koneksi | Notifikasi | User │
│               ├────────────────────────────────────────────────────┤
│ Logo          │                                                    │
│               │ Breadcrumb / Judul halaman                         │
│ Dashboard     │                                                    │
│ Absensi       │ Konten halaman                                     │
│ Data Siswa    │                                                    │
│ Kelas         │                                                    │
│ Laporan       │                                                    │
│ Perangkat     │                                                    │
│ Pengguna      │                                                    │
│ Pengaturan    │                                                    │
│               │                                                    │
│ Profil        │                                                    │
│ Logout        │                                                    │
└───────────────┴────────────────────────────────────────────────────┘
```

### 4.2 Sidebar

**Gaya:**

- Lebar terbuka: sekitar 240–260 px.
- Latar hitam sangat gelap.
- Logo sekolah di bagian atas.
- Item navigasi memiliki ikon dan label.
- Item aktif berupa pill biru elektrik.
- Hover menggunakan latar abu-abu gelap.
- Profil pengguna dan tombol logout di bagian bawah.

**Navigasi admin:**

1. Dashboard
2. Absensi
3. Data Siswa
4. Data Kelas
5. Pengguna
6. Laporan
7. Perangkat & Sinkronisasi
8. Pengaturan
9. Audit Log

**Navigasi operator:**

1. Dashboard Operator
2. Pemindaian Absensi
3. Absensi Manual
4. Riwayat Perangkat
5. Sinkronisasi

**Navigasi orang tua:**

1. Ringkasan
2. Riwayat Kehadiran
3. Rekap Bulanan
4. Profil Anak
5. Pengaturan Akun

Sidebar harus menampilkan menu sesuai peran. Jangan hanya menyembunyikan menu di frontend; backend tetap wajib memeriksa hak akses.

### 4.3 Topbar

Komponen topbar:

- Search bar (opsional sesuai halaman).
- Indikator koneksi: Online/Offline.
- Indikator sinkronisasi: jumlah pending.
- Tombol notifikasi.
- Nama dan avatar/inisial pengguna.
- Dropdown profil dan logout.

Contoh status:

```text
[ Search ................................ ] [● Online]
[ 3 transaksi menunggu sinkronisasi ] [Bell] [Operator ▾]
```

Jika offline, gunakan teks yang tegas:

```text
[ Wi-Fi Off  OFFLINE ] [ 12 transaksi tersimpan di perangkat]
```

Jangan tampilkan indikator `Online` hanya karena browser melaporkan `navigator.onLine`; status API/backend perlu diperiksa secara terpisah. Bila jaringan tersedia tetapi backend tidak merespons, tampilkan status seperti **Server tidak dapat dijangkau**.

---

## 5. Struktur Halaman Admin

### 5.1 Dashboard Admin

Dashboard admin mengambil inspirasi komposisi gambar referensi: KPI di bagian atas, grafik utama di kiri, dan kartu ringkasan di kanan.

**Susunan desktop:**

```text
┌──────────────────────────────────────────────────────────────────┐
│ Topbar                                                           │
├──────────────────────────────────────────────────────────────────┤
│ Dashboard                                      [Tanggal] [Export] │
│ Ringkasan kehadiran sekolah hari ini                             │
├──────────────┬──────────────┬──────────────┬──────────────────────┤
│ Total Siswa  │ Hadir        │ Terlambat    │ Belum Absen          │
├───────────────────────────────────────┬──────────────────────────┤
│ Tren Kehadiran                        │ Distribusi Status        │
│ Grafik harian/mingguan/bulanan         │ Donut chart              │
├───────────────────────────────────────┼──────────────────────────┤
│ Aktivitas Absensi Terbaru              │ Status 3 Perangkat       │
│ Tabel transaksi                        │ PC-01 / PC-02 / PC-03    │
├───────────────────────────────────────┴──────────────────────────┤
│ Ringkasan kelas / kehadiran per kelas                             │
└──────────────────────────────────────────────────────────────────┘
```

**Kartu KPI:**

1. Total Siswa Aktif
2. Hadir Hari Ini
3. Terlambat
4. Belum Tercatat

Setiap KPI menampilkan:

- Label.
- Angka utama.
- Ikon kecil.
- Keterangan tanggal/periode.
- Perbandingan periode sebelumnya hanya jika datanya tersedia dan valid.

Jangan menampilkan angka dummy pada produksi. Saat data belum tersedia, gunakan skeleton/loading atau empty state.

**Grafik:**

- Grafik tren kehadiran: line/area chart.
- Distribusi status: donut chart.
- Kehadiran per kelas: bar chart.
- Semua grafik harus memiliki label, tooltip, dan alternatif ringkasan teks.

**Aktivitas terbaru:**

Kolom minimal:

- Waktu.
- ID siswa.
- Nama.
- Kelas.
- Jenis (Masuk/Pulang).
- Metode (Barcode/Kamera/Manual).
- Status.
- Perangkat.
- Status sinkronisasi.

### 5.2 Halaman Data Siswa

**Bagian atas:**

- Judul: Data Siswa.
- Deskripsi singkat.
- Tombol Tambah Siswa (jika diizinkan).
- Tombol Import/Export sesuai kebutuhan.
- Search siswa.
- Filter kelas dan status aktif.

**Tabel:**

| Kolom | Isi |
|---|---|
| ID | ID siswa dari spreadsheet |
| Nama | Nama siswa |
| Kelas | Kelas siswa |
| No. WhatsApp | Nomor wali, tampil terbatas sesuai hak akses |
| Barcode | Status barcode / preview bila dibutuhkan |
| Status | Aktif/Nonaktif |
| Aksi | Detail/Edit |

Ketentuan UX:

- Tabel dapat di-scroll horizontal pada layar sempit.
- Gunakan pagination atau virtualized list jika data besar.
- Konfirmasi sebelum menonaktifkan siswa.
- Tampilkan sumber dan waktu pembaruan data.
- Jangan mengubah struktur Google Sheets secara otomatis dari halaman UI tanpa konfirmasi dan validasi.

### 5.3 Halaman Data Kelas

- Daftar kelas.
- Jumlah siswa per kelas.
- Tingkat/jenjang.
- Wali kelas jika tersedia.
- Detail siswa dalam kelas.
- Filter dan pencarian.

### 5.4 Halaman Pengguna

- Daftar admin, operator, dan orang tua.
- Status akun.
- Peran.
- Perangkat/akses terakhir jika tersedia.
- Aksi tambah, ubah, nonaktifkan, reset sesi sesuai otorisasi.

### 5.5 Halaman Laporan

Filter:

- Rentang tanggal.
- Kelas.
- Siswa.
- Jenis absensi.
- Status kehadiran.
- Metode pencatatan.

Konten:

- Ringkasan kehadiran.
- Rekap per kelas.
- Rekap per siswa.
- Daftar keterlambatan.
- Izin dan sakit.
- Siswa alfa.
- Waktu masuk dan pulang.

Aksi:

- Terapkan filter.
- Reset filter.
- Export CSV/XLSX/PDF sesuai kemampuan implementasi.
- Cetak laporan.

Tampilkan catatan bila rekap belum final karena perangkat masih memiliki transaksi pending atau data belum tersinkronisasi.

### 5.6 Halaman Perangkat & Sinkronisasi

Halaman ini sangat penting untuk sistem tiga komputer.

Tampilkan kartu perangkat:

| Perangkat | Status | Terakhir Sinkron | Pending |
|---|---|---|---:|
| PC-01 | Online/Offline | Waktu | Jumlah |
| PC-02 | Online/Offline | Waktu | Jumlah |
| PC-03 | Online/Offline | Waktu | Jumlah |

Status harus berasal dari heartbeat/sinkronisasi terakhir, bukan perkiraan lokasi perangkat.

Detail perangkat:

- Device ID.
- Nama perangkat.
- Operator terakhir.
- Waktu sinkronisasi terakhir.
- Versi aplikasi.
- Jumlah transaksi pending.
- Jumlah transaksi gagal.
- Waktu data master terakhir diperbarui.

Sediakan filter:

- Semua.
- Pending.
- Gagal.
- Konflik.
- Sudah tersinkron.

Sediakan aksi admin yang aman:

- Lihat detail transaksi.
- Coba sinkronisasi ulang jika didukung.
- Tandai konflik untuk pemeriksaan.
- Ekspor log.
- Jangan sediakan tombol hapus massal untuk transaksi yang belum diproses.

---

## 6. Desain Halaman Operator

Halaman operator merupakan halaman operasional utama. Desainnya harus lebih sederhana dibanding dashboard admin.

### 6.1 Dashboard Operator

Tampilkan:

- Nama perangkat (misalnya PC-01).
- Nama operator.
- Status koneksi.
- Status sinkronisasi.
- Sesi aktif (Masuk/Pulang).
- Jumlah scan hari ini.
- Jumlah transaksi pending.
- Tombol besar **Mulai Absensi**.

Jangan menampilkan grafik besar yang mengganggu pekerjaan operator.

### 6.2 Halaman Pemindaian

**Prioritas tampilan:**

1. Pemilihan sesi MASUK/PULANG.
2. Status koneksi dan sinkronisasi.
3. Area scan yang dominan.
4. Hasil scan terakhir.
5. Riwayat scan singkat.
6. Jumlah antrean lokal.

Wireframe:

```text
┌───────────────────────────────────────────────────────────────┐
│ ABSENSI SEKOLAH                  PC-01  [OFFLINE] [12 Pending] │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  PILIH SESI                                                   │
│  ┌──────────────────────┐  ┌──────────────────────┐           │
│  │       MASUK          │  │       PULANG         │           │
│  └──────────────────────┘  └──────────────────────┘           │
│                                                               │
│  METODE: [USB Scanner] [Kamera] [Manual]                       │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                                                         │  │
│  │                AREA PEMINDAIAN                          │  │
│  │          Arahkan barcode ke scanner                      │  │
│  │                                                         │  │
│  │          [Input scanner tersembunyi/terfokus]             │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  HASIL SCAN TERAKHIR                                          │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ NAMA SISWA                                               │  │
│  │ ID: M1B-26-005  |  Kelas: X B                            │  │
│  │ MASUK 07:05  |  HADIR                                    │  │
│  │ Tersimpan di perangkat — menunggu sinkronisasi           │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  RIWAYAT SCAN TERBARU                                         │
│  Waktu       Nama             Sesi       Status                │
│  07:05       Nama Siswa       Masuk      Pending               │
└───────────────────────────────────────────────────────────────┘
```

**Interaksi pemindaian:**

- Scanner USB harus tetap dapat menerima input setelah hasil scan ditampilkan.
- Fokus input scanner dijaga tanpa mengganggu tombol dan aksesibilitas.
- Jika scanner mengirim Enter, Enter memicu proses scan.
- Jika scanner tidak mengirim Enter, sediakan pengaturan suffix atau mekanisme deteksi input yang teruji.
- Setelah transaksi tersimpan, bersihkan input dan siapkan scan berikutnya.
- Jangan menampilkan modal konfirmasi untuk setiap scan yang berhasil karena memperlambat operator.
- Gunakan toast/banner hasil yang tidak menghalangi scan berikutnya.

**Hasil scan sukses:**

- Nama siswa.
- ID siswa.
- Kelas.
- Jenis absensi.
- Waktu lokal perangkat.
- Status kehadiran.
- Status penyimpanan: tersimpan lokal atau sudah tersinkron.

**Hasil scan gagal:**

- ID tidak ditemukan.
- Siswa nonaktif.
- Sudah melakukan absensi pada sesi yang sama.
- Sesi absensi tidak sesuai jadwal.
- Penyimpanan lokal gagal.
- Data siswa belum tersedia di perangkat.

Setiap pesan harus menjelaskan tindakan yang bisa dilakukan operator.

### 6.3 Pemilihan metode

Sediakan tiga tab/tombol:

- USB Scanner.
- Kamera.
- Manual.

Metode aktif harus terlihat jelas. Ketiga metode menggunakan layanan pencatatan yang sama.

**Mode kamera:**

- Tampilkan preview kamera.
- Tampilkan instruksi singkat.
- Sediakan tombol ganti kamera.
- Tampilkan pesan izin kamera ditolak.
- Hentikan stream ketika keluar dari mode kamera.

**Mode manual:**

- Search berdasarkan ID/nama.
- Hasil pencarian menampilkan nama, ID, dan kelas.
- Operator memilih siswa.
- Pilih Masuk/Pulang.
- Pilih status yang diizinkan.
- Isi catatan jika diperlukan.
- Simpan.
- Tampilkan hasil penyimpanan lokal/server.

### 6.4 Riwayat scan

Tampilkan 5–10 transaksi terbaru agar operator bisa memeriksa hasil tanpa meninggalkan halaman.

Gunakan status:

- Tersinkron.
- Menunggu sinkronisasi.
- Gagal sinkronisasi.
- Perlu pemeriksaan.

---

## 7. Dashboard Orang Tua

Tampilan orang tua menggunakan identitas visual yang sama tetapi layout lebih sederhana dan nyaman untuk ponsel.

### 7.1 Beranda orang tua

Bagian:

- Sapaan dan nama orang tua.
- Kartu profil anak.
- Status kehadiran hari ini.
- Jam masuk.
- Jam pulang.
- Status terakhir.
- Ringkasan kehadiran bulan ini.
- Tombol lihat riwayat.

Jika satu akun terhubung dengan lebih dari satu anak, sediakan pemilih anak yang jelas.

### 7.2 Riwayat kehadiran

Tampilkan dalam bentuk daftar/timeline:

```text
Senin, 9 November 2026
  07:05  Masuk
         Hadir

  15:10  Pulang
         Tercatat

Jumat, 6 November 2026
  07:18  Masuk
         Terlambat
```

Filter bulan dan status. Jangan tampilkan data siswa lain.

### 7.3 Rekap bulanan

- Total hari sekolah.
- Hadir.
- Terlambat.
- Izin.
- Sakit.
- Alfa.
- Persentase kehadiran.

Berikan keterangan bila data periode masih belum final karena transaksi belum tersinkronisasi.

### 7.4 Status data

Dashboard orang tua memerlukan koneksi internet untuk mengambil data terbaru. Jika koneksi terputus:

- Tampilkan waktu terakhir data diperbarui.
- Beri label **Data terakhir diperbarui ...**.
- Jangan menampilkan data lama seolah-olah real-time.
- Jangan menjanjikan dashboard orang tua tetap memperoleh data terbaru saat offline.

---

## 8. Komponen UI yang Wajib Dibuat

Buat komponen reusable berikut:

### 8.1 Layout

- `AppShell`
- `AdminLayout`
- `OperatorLayout`
- `ParentLayout`
- `Sidebar`
- `MobileNavigation`
- `Topbar`
- `PageHeader`
- `Breadcrumbs`

### 8.2 Status dan feedback

- `ConnectionStatus`
- `BackendStatus`
- `SyncStatusBadge`
- `PendingQueueIndicator`
- `LastSyncedAt`
- `Toast`
- `InlineAlert`
- `ConfirmDialog`
- `EmptyState`
- `ErrorState`
- `LoadingSkeleton`

### 8.3 Data display

- `StatCard`
- `AttendanceTrendChart`
- `AttendanceStatusChart`
- `AttendanceTable`
- `StudentTable`
- `DeviceCard`
- `ActivityList`
- `AttendanceTimeline`
- `Pagination`
- `FilterBar`

### 8.4 Form

- `SearchInput`
- `DateRangePicker`
- `ClassSelect`
- `AttendanceSessionSwitch`
- `AttendanceMethodTabs`
- `StudentSearch`
- `ManualAttendanceForm`
- `FormField`
- `PasswordField`

Komponen harus menerima data dan callback melalui props. Hindari duplikasi markup dan aturan visual antarhalaman.

---

## 9. Status, Warna, dan Microcopy

Gunakan istilah yang konsisten di seluruh aplikasi.

| Kondisi internal | Label UI | Warna |
|---|---|---|
| `ONLINE` | Online | Hijau |
| `OFFLINE` | Offline | Abu-abu/merah lembut |
| `SYNCING` | Menyinkronkan | Biru |
| `PENDING` | Menunggu sinkronisasi | Oranye |
| `SYNCED` | Tersinkron | Hijau |
| `FAILED` | Sinkronisasi gagal | Merah |
| `CONFLICT` | Perlu pemeriksaan | Merah/oranye |
| `DATA_STALE` | Data siswa perlu diperbarui | Oranye |
| `HADIR` | Hadir | Hijau |
| `TERLAMBAT` | Terlambat | Oranye |
| `IZIN` | Izin | Biru |
| `SAKIT` | Sakit | Ungu/abu-abu |
| `ALFA` | Alfa | Merah |

Contoh microcopy:

- Berhasil lokal: **Absensi tersimpan di perangkat. Akan disinkronkan saat koneksi tersedia.**
- Berhasil server: **Absensi berhasil dicatat dan tersinkron.**
- Offline: **Koneksi internet terputus. Anda tetap dapat melakukan absensi menggunakan data yang tersimpan di perangkat.**
- Data lama: **Data siswa terakhir diperbarui pada 08.00 WITA.**
- Scan tidak dikenal: **Barcode tidak ditemukan. Periksa barcode atau cari siswa secara manual.**
- Duplikat: **Siswa ini sudah tercatat untuk sesi Masuk hari ini.**
- Gagal simpan lokal: **Absensi belum tersimpan. Silakan ulangi dan pastikan penyimpanan perangkat tersedia.**
- Konflik: **Transaksi perlu diperiksa admin karena terdapat catatan lain untuk siswa dan sesi yang sama.**

Jangan gunakan pesan “Absensi berhasil” sebelum transaksi benar-benar berhasil disimpan secara persisten ke IndexedDB atau dikonfirmasi server.

---

## 10. Responsive Design

### 10.1 Desktop (≥ 1200 px)

- Sidebar terbuka.
- Dashboard memakai grid 12 kolom.
- KPI 4 kolom.
- Grafik dan panel samping 2 kolom.
- Tabel menampilkan kolom utama.
- Halaman scan menggunakan area lebar dan fokus.

### 10.2 Tablet (768–1199 px)

- Sidebar dapat diciutkan menjadi ikon.
- KPI 2 kolom.
- Grafik menjadi satu atau dua kolom sesuai lebar.
- Tabel dapat di-scroll horizontal.
- Tombol scan tetap besar.

### 10.3 Mobile (< 768 px)

- Sidebar berubah menjadi drawer atau bottom navigation sesuai peran.
- Topbar disederhanakan.
- KPI 2 kolom atau 1 kolom pada layar kecil.
- Grafik disusun vertikal.
- Tabel berubah menjadi card/list bila lebih mudah dibaca.
- Form manual menggunakan lebar penuh.
- Tombol aksi utama mudah dijangkau ibu jari.

### 10.4 Prioritas perangkat

- Komputer operator: prioritas utama untuk halaman pemindaian dan scanner USB.
- Laptop admin: prioritas utama untuk dashboard, tabel, laporan, dan monitoring.
- Ponsel orang tua: prioritas utama untuk dashboard orang tua.
- Ponsel operator: mendukung kamera sebagai metode pemindaian alternatif.

---

## 11. UX Offline-First

### 11.1 Indikator global

Setiap halaman operasional harus menampilkan:

- Status koneksi browser.
- Status keterjangkauan backend.
- Jumlah antrean lokal.
- Waktu sinkronisasi terakhir.
- Waktu pembaruan data master terakhir.

### 11.2 Banner offline

Ketika perangkat offline, tampilkan banner ringkas yang tidak menutup area kerja:

```text
[Wi-Fi Off] Anda sedang offline.
Absensi akan disimpan di perangkat dan dikirim saat internet kembali.
```

### 11.3 Antrean transaksi

Sediakan panel/detail antrean dengan:

- Jumlah pending.
- Jumlah berhasil.
- Jumlah gagal.
- Jumlah konflik.
- Waktu transaksi.
- Nama siswa.
- Jenis absensi.
- Aksi lihat detail.

Jangan menghapus antrean secara otomatis hanya karena pengguna logout atau menutup browser.

### 11.4 Data master kedaluwarsa

Jika data siswa terlalu lama:

- Tampilkan peringatan.
- Tampilkan tanggal dan waktu pembaruan terakhir.
- Izinkan absensi offline sesuai kebijakan sekolah.
- Tandai transaksi yang membutuhkan validasi ulang jika siswa tidak lagi aktif menurut data terbaru.
- Jangan menghapus transaksi lokal secara otomatis.

### 11.5 Tidak ada klaim sinkronisasi palsu

- `PENDING` bukan `SYNCED`.
- `navigator.onLine === true` bukan bukti backend siap.
- Respons timeout bukan bukti transaksi gagal tersimpan di server.
- Setelah timeout, kirim ulang dengan `transactionId` yang sama agar aman dari duplikasi.
- UI harus membedakan **tersimpan lokal**, **menunggu sinkronisasi**, dan **tersinkron ke server**.

---

## 12. Aksesibilitas dan Interaksi

- Semua kontrol dapat digunakan dengan keyboard.
- Focus ring terlihat jelas.
- Input memiliki label.
- Tombol ikon memiliki accessible name.
- Hasil scan diumumkan melalui area live status yang sesuai.
- Jangan mengandalkan warna saja.
- Target sentuh ideal minimal 44 × 44 px.
- Tabel memiliki header yang jelas.
- Modal dapat ditutup dengan Escape dan mengelola fokus dengan benar.
- Konfirmasi wajib untuk tindakan destruktif.
- Hindari animasi berlebihan; hormati preferensi reduced motion.

---

## 13. Keamanan dalam UI

UI bukan pengganti otorisasi backend.

- Menu dan halaman disesuaikan dengan role.
- Akses langsung ke URL tetap diperiksa di backend.
- Data nomor WhatsApp ditampilkan hanya untuk peran yang membutuhkan.
- Dashboard orang tua hanya menampilkan anak yang terhubung dengan akun.
- Jangan menaruh token rahasia di local storage atau source code.
- Jangan menampilkan detail teknis sensitif kepada pengguna umum.
- Logout membersihkan sesi lokal sesuai kebijakan, tetapi tidak menghapus antrean absensi yang belum tersinkron.
- Untuk perangkat bersama, sediakan penguncian sesi atau logout otomatis sesuai kebijakan sekolah.

---

## 14. Empty State, Loading, dan Error State

Setiap halaman harus memiliki tiga kondisi tampilan.

### Empty state

Contoh:

- Belum ada data siswa.
- Belum ada transaksi hari ini.
- Belum ada laporan pada rentang tanggal ini.
- Belum ada perangkat yang terdaftar.

Sertakan tindakan berikutnya jika relevan.

### Loading state

- Gunakan skeleton untuk kartu dan tabel.
- Hindari spinner penuh layar untuk proses singkat.
- Tampilkan progres jika proses sinkronisasi berlangsung lama.

### Error state

- Jelaskan apa yang gagal.
- Jelaskan apakah data lokal aman.
- Berikan aksi yang sesuai, misalnya coba lagi.
- Jangan menyamarkan error menjadi data kosong.

---

## 15. Acceptance Criteria UI/UX

Desain dianggap siap diimplementasikan jika kriteria berikut terpenuhi:

### Visual

- [ ] Sidebar gelap dan aksen Hijau Putih sesuai referensi.
- [ ] Area konten terang dan memiliki hierarki yang jelas.
- [ ] Kartu, tabel, badge, dan tombol konsisten.
- [ ] Tidak ada konten dashboard penjualan yang tersisa.
- [ ] Tampilan tidak terlalu padat.

### Admin

- [ ] Admin dapat memahami ringkasan kehadiran dengan cepat.
- [ ] KPI dan grafik menggunakan data aktual.
- [ ] Aktivitas terbaru dapat dibaca.
- [ ] Monitoring tiga perangkat tersedia.
- [ ] Status pending, gagal, dan konflik terlihat jelas.

### Operator

- [ ] Operator dapat memilih sesi Masuk/Pulang.
- [ ] Operator dapat memilih USB, Kamera, atau Manual.
- [ ] Hasil scan terlihat jelas.
- [ ] Scan berikutnya dapat dilakukan tanpa menutup modal.
- [ ] Status lokal dan sinkronisasi dibedakan.
- [ ] Kesalahan scan memiliki pesan yang dapat ditindaklanjuti.

### Orang tua

- [ ] Orang tua dapat melihat profil anak yang terhubung.
- [ ] Jam masuk dan pulang mudah ditemukan.
- [ ] Riwayat dan rekap bulanan mudah dipahami.
- [ ] Data lama diberi label waktu pembaruan.

### Offline dan responsif

- [ ] Banner offline terlihat.
- [ ] Antrean transaksi dapat dipantau.
- [ ] UI tidak mengklaim transaksi sudah tersinkron sebelum konfirmasi server.
- [ ] Layout berfungsi pada desktop, tablet, dan ponsel.
- [ ] Semua kontrol penting dapat digunakan dengan keyboard.

---

## 16. Rekomendasi Struktur Folder UI

Struktur ini merupakan rekomendasi untuk frontend React + TypeScript. Sesuaikan dengan struktur proyek aktual tanpa membuat duplikasi.

```text
src/
├── app/
│   ├── router/
│   ├── providers/
│   └── layouts/
│       ├── AdminLayout.tsx
│       ├── OperatorLayout.tsx
│       └── ParentLayout.tsx
│
├── components/
│   ├── ui/
│   ├── navigation/
│   ├── feedback/
│   ├── status/
│   ├── charts/
│   ├── tables/
│   └── forms/
│
├── features/
│   ├── dashboard/
│   ├── attendance/
│   ├── students/
│   ├── classes/
│   ├── users/
│   ├── reports/
│   ├── devices/
│   ├── synchronization/
│   └── parent-portal/
│
├── hooks/
├── services/
├── stores/
├── types/
├── utils/
└── styles/
```

---

## 17. Instruksi Implementasi untuk Antigravity AI Agent

Gunakan dokumen ini bersama `SYSTEM_DESIGN_ABSENSI_SEKOLAH.md`.

### Aturan wajib

1. Baca kedua dokumen sebelum membuat atau mengubah kode.
2. Jadikan gambar referensi sebagai acuan bahasa visual, bukan sebagai template dashboard penjualan.
3. Bangun design system terlebih dahulu: warna, tipografi, spacing, radius, tombol, input, badge, kartu, tabel, dan layout.
4. Implementasikan layout berdasarkan role: Admin, Operator, dan Orang Tua.
5. Prioritaskan halaman Pemindaian Operator setelah fondasi layout dan komponen selesai.
6. Jangan membuat data dummy seolah-olah data produksi. Data mock hanya boleh dipakai pada mode development dan harus diberi penanda.
7. Jangan mengubah nama/struktur sheet Google Sheets berdasarkan asumsi.
8. Jangan menambahkan fitur yang bertentangan dengan dokumen system design.
9. Jangan membuat aturan absensi berbeda untuk kamera, USB scanner, dan manual.
10. Semua status offline dan sinkronisasi harus terhubung dengan state aplikasi yang nyata, bukan badge dekoratif.
11. Jangan menyatakan transaksi berhasil sebelum penyimpanan lokal atau server terkonfirmasi.
12. Pastikan antarmuka responsif dan dapat diakses dengan keyboard.
13. Gunakan komponen reusable dan hindari satu file halaman yang terlalu besar.
14. Jangan mengganti teknologi inti tanpa menjelaskan alasan dan meminta persetujuan.
15. Implementasikan per fase dan lakukan pengujian sebelum melanjutkan fase berikutnya.

### Urutan implementasi UI

1. Design tokens dan komponen dasar.
2. App shell, sidebar, topbar, dan responsive navigation.
3. Login dan role-based layout.
4. Dashboard admin.
5. Halaman pemindaian operator.
6. Absensi manual.
7. Data siswa dan kelas.
8. Perangkat dan sinkronisasi.
9. Laporan.
10. Dashboard orang tua.
11. Empty/loading/error states.
12. Accessibility dan responsive refinement.

### Hasil yang harus diberikan agent

Setiap fase harus menghasilkan:

- Daftar file yang dibuat/diubah.
- Ringkasan implementasi.
- Screenshot atau preview halaman jika tersedia.
- Hasil pemeriksaan responsive.
- Hasil test/build.
- Daftar masalah yang belum diselesaikan.

Jangan mengerjakan seluruh fase sekaligus. Selesaikan satu fase, periksa hasilnya, lalu lanjutkan.

---

## 18. Catatan Keputusan Desain

- Gambar referensi menggunakan sidebar hitam, aksen biru elektrik, topbar biru, dan konten terang. Karakter visual tersebut dipertahankan.
- Komposisi dashboard diadaptasi dari metrik penjualan menjadi metrik kehadiran sekolah.
- Dashboard admin boleh memiliki grafik dan statistik yang kaya.
- Halaman operator harus minimalis dan berorientasi kecepatan.
- Dashboard orang tua harus sederhana dan mobile-first.
- Status offline/sinkronisasi menjadi bagian penting identitas produk, bukan informasi tersembunyi.
- Keputusan UI tidak boleh mengubah aturan database, sinkronisasi, atau keamanan yang telah ditetapkan di dokumen system design.

**Akhir dokumen — UI/UX Design Sistem Absensi Sekolah Offline-First.**
