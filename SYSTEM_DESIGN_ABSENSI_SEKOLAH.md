# SYSTEM DESIGN --- Aplikasi Absensi Sekolah Offline-First

> **Status dokumen:** Draft desain teknis\
> **Versi:** 1.0\
> **Tanggal:** 9 November 2026\
> **Tujuan:** Menjadi pedoman perancangan dan implementasi aplikasi
> absensi sekolah di Antigravity.

------------------------------------------------------------------------

## 1. Ringkasan Proyek

Aplikasi ini merupakan sistem absensi sekolah berbasis web yang dapat
dipasang sebagai **Progressive Web App (PWA)**. Sistem dirancang dengan
pendekatan **offline-first**, sehingga operator tetap dapat mencatat
kehadiran ketika koneksi internet terputus.

Database utama tetap menggunakan **Google Sheets** yang sudah dimiliki
sekolah. Google Apps Script digunakan sebagai backend/API awal. Setiap
komputer absensi menyimpan cache aplikasi, data siswa, dan antrean
transaksi secara lokal menggunakan Service Worker dan IndexedDB.

Sistem dirancang untuk tiga komputer absensi yang bekerja secara
mandiri. Ketika internet tersedia, masing-masing perangkat mengirim
transaksi lokal ke backend untuk divalidasi dan disimpan ke Google
Sheets.

### 1.1 Tujuan

1.  Mempermudah pencatatan absensi masuk dan pulang.
2.  Mempertahankan barcode siswa yang sudah tersedia.
3.  Mendukung pemindaian melalui scanner USB maupun kamera perangkat.
4.  Menyediakan absensi manual saat online dan offline.
5.  Menjaga transaksi agar tidak hilang ketika koneksi terputus atau
    halaman ditutup.
6.  Menyinkronkan transaksi dari tiga komputer ke database pusat.
7.  Menyediakan dashboard admin dan dashboard orang tua.
8.  Menyediakan laporan dan pemantauan status sinkronisasi.

### 1.2 Keputusan Konfigurasi

  Komponen              Keputusan
  --------------------- -------------------------------------------
  Jenis aplikasi        Web App berbasis PWA
  Pendekatan            Offline-first
  Frontend              React + TypeScript
  Styling               Tailwind CSS
  Hosting frontend      Cloudflare Pages
  Backend awal          Google Apps Script Web App
  Database utama        Google Sheets
  Database lokal        IndexedDB
  Cache aplikasi        Service Worker
  Perangkat operator    3 komputer
  Metode barcode        Scanner USB dan kamera
  Isi barcode           ID siswa
  Absensi QR/barcode    Masuk dan pulang
  Absensi manual        Online dan offline
  Dashboard orang tua   Ya
  Version control       GitHub
  Zona waktu            Asia/Makassar (WITA), dapat dikonfigurasi

------------------------------------------------------------------------

## 2. Ruang Lingkup Sistem

### 2.1 Fitur dalam versi pertama

-   Login dan pengelolaan sesi pengguna.
-   Dashboard admin.
-   Dashboard operator.
-   Dashboard orang tua.
-   Pengelolaan data siswa dan kelas.
-   Pengambilan data master dari Google Sheets.
-   Absensi masuk menggunakan barcode.
-   Absensi pulang menggunakan barcode.
-   Absensi manual masuk dan pulang.
-   Pencatatan izin dan sakit oleh pengguna yang berwenang.
-   Pencatatan keterlambatan berdasarkan konfigurasi sekolah.
-   Penetapan alfa setelah batas waktu absensi.
-   PWA yang dapat dipasang pada Windows dan perangkat yang mendukung.
-   Cache aplikasi dan data master.
-   Antrean transaksi offline.
-   Sinkronisasi batch dan retry.
-   Pencegahan transaksi ganda.
-   Monitoring perangkat dan sinkronisasi.
-   Rekap kehadiran harian dan bulanan.

### 2.2 Fitur tahap lanjutan

Fitur berikut tidak boleh menghambat penyelesaian fungsi inti:

-   Notifikasi WhatsApp otomatis kepada orang tua.
-   Retry notifikasi dan monitoring status pengiriman.
-   Export laporan lanjutan.
-   Integrasi layanan pesan eksternal.
-   Pemindahan backend ke server khusus jika kapasitas Apps Script tidak
    lagi mencukupi.

### 2.3 Di luar ruang lingkup versi pertama

-   Payment gateway.
-   Pelacakan GPS siswa.
-   Pengenalan wajah.
-   Live streaming.
-   Aplikasi Android native terpisah.

------------------------------------------------------------------------

## 3. Pengguna dan Hak Akses

### 3.1 Admin

Admin memiliki hak untuk:

-   Melihat ringkasan seluruh kehadiran.
-   Mengelola data siswa dan kelas sesuai kebijakan sekolah.
-   Mengelola akun pengguna dan peran.
-   Mengatur jadwal masuk, pulang, dan batas keterlambatan.
-   Melihat, memeriksa, dan mengoreksi transaksi.
-   Mengelola izin dan sakit.
-   Melihat laporan harian dan bulanan.
-   Memantau perangkat absensi.
-   Melihat transaksi pending, gagal, duplikat, dan konflik.
-   Melihat audit log.

### 3.2 Operator

Operator memiliki hak untuk:

-   Membuka halaman absensi.
-   Memilih sesi masuk atau pulang.
-   Melakukan pemindaian barcode.
-   Melakukan pencatatan manual.
-   Melihat hasil pencatatan pada perangkatnya.
-   Melihat antrean lokal dan status sinkronisasi.
-   Melihat data siswa yang diperlukan untuk operasional.

Hak operator tidak boleh otomatis mencakup pengelolaan seluruh data atau
penghapusan transaksi.

### 3.3 Orang Tua/Wali

Orang tua memiliki hak untuk:

-   Melihat profil anak yang terhubung dengan akunnya.
-   Melihat waktu masuk dan pulang.
-   Melihat status hadir, terlambat, izin, sakit, dan alfa.
-   Melihat riwayat dan rekap kehadiran anak.

Server wajib memverifikasi relasi akun orang tua dengan siswa. ID siswa
yang dimasukkan pengguna tidak boleh menjadi satu-satunya dasar
pemberian akses.

------------------------------------------------------------------------

## 4. Arsitektur Teknologi

### 4.1 Komponen utama

  -----------------------------------------------------------------------
  Lapisan                 Teknologi               Tanggung jawab
  ----------------------- ----------------------- -----------------------
  Frontend                React + TypeScript      Antarmuka dan interaksi
                                                  pengguna

  Styling                 Tailwind CSS            Tampilan responsif

  PWA                     Web App Manifest        Identitas dan instalasi
                                                  aplikasi

  Cache                   Service Worker          Menyajikan app shell
                                                  saat offline

  Local database          IndexedDB               Cache data master dan
                                                  transaksi lokal

  Backend                 Google Apps Script      Validasi, autentikasi,
                                                  dan akses Sheets

  Database pusat          Google Sheets           Penyimpanan utama

  Hosting                 Cloudflare Pages        Distribusi frontend
                                                  melalui HTTPS

  API proxy opsional      Cloudflare Worker       Proxy/API layer jika
                                                  diperlukan

  Repository              GitHub                  Version control dan
                                                  deployment
  -----------------------------------------------------------------------

### 4.2 Diagram arsitektur

``` mermaid
flowchart TB
    subgraph Devices["Perangkat Operator"]
        PC1["PC 01 - PWA"]
        PC2["PC 02 - PWA"]
        PC3["PC 03 - PWA"]
        PC1 --> SW1["Service Worker + IndexedDB"]
        PC2 --> SW2["Service Worker + IndexedDB"]
        PC3 --> SW3["Service Worker + IndexedDB"]
    end

    HOST["Cloudflare Pages - Frontend Hosting"]
    API["API Layer - Apps Script Web App"]
    PROXY["Cloudflare Worker - Opsional"]
    SHEET[("Google Sheets - Database Utama")]
    PARENT["Dashboard Orang Tua"]
    ADMIN["Dashboard Admin"]

    HOST --> PC1
    HOST --> PC2
    HOST --> PC3
    HOST --> ADMIN
    HOST --> PARENT

    SW1 <-->|"Sinkronisasi saat online"| API
    SW2 <-->|"Sinkronisasi saat online"| API
    SW3 <-->|"Sinkronisasi saat online"| API
    API <--> SHEET
    ADMIN <-->|"Permintaan data terotorisasi"| API
    PARENT <-->|"Permintaan data terotorisasi"| API
    PROXY -. "Dipakai bila dibutuhkan" .-> API
```

### 4.3 Prinsip arsitektur

1.  Google Sheets adalah sumber data pusat.
2.  IndexedDB adalah penyimpanan operasional lokal, bukan pengganti
    database pusat.
3.  Service Worker menyimpan app shell dan aset statis agar PWA dapat
    dibuka tanpa internet setelah instalasi dan cache awal.
4.  Data siswa harus diunduh dan disimpan sebelum perangkat digunakan
    offline.
5.  Setiap perangkat memiliki antrean transaksi sendiri.
6.  Transaksi tidak dihapus sebelum server memberikan hasil pemrosesan
    yang dapat diverifikasi.
7.  Backend memvalidasi seluruh transaksi; frontend tidak boleh menjadi
    satu-satunya lapisan validasi.
8.  Tidak boleh ada kredensial rahasia atau kunci layanan Google yang
    ditanam di frontend.

### 4.4 Catatan komunikasi API

Komunikasi langsung browser ke Google Apps Script dapat menghadapi
redirect, CORS, dan kendala autentikasi. Sebelum implementasi penuh,
buat proof of concept untuk menguji:

-   Permintaan baca data.
-   Permintaan tulis transaksi.
-   Respons setelah redirect.
-   CORS dan preflight bila terjadi.
-   Autentikasi dan otorisasi.
-   Penanganan timeout dan koneksi terputus.

Jika komunikasi langsung tidak stabil atau sulit diamankan, gunakan
Cloudflare Worker sebagai lapisan proxy/API. Jangan menganggap proxy
otomatis menyelesaikan autentikasi; seluruh pemeriksaan hak akses tetap
harus dilakukan.

------------------------------------------------------------------------

## 5. Integrasi Google Sheets yang Sudah Ada

### 5.1 Struktur yang terlihat

Dari screenshot spreadsheet, tab dan kolom berikut terlihat:

**Data siswa**

  Kolom   Nama      Keterangan
  ------- --------- -----------------
  A       ID        Identitas siswa
  B       Nama      Nama lengkap
  C       Kelas     Kelas siswa
  D       NO_WA     Nomor WhatsApp
  E       BARCODE   Gambar barcode

Contoh ID siswa: `M1B-26-005`.

Tab yang terlihat pada spreadsheet:

-   `PAGE`
-   `ABSENSI`
-   `WEB`
-   `USER`
-   `SETTING`
-   `LOG`

### 5.2 Aturan integrasi

-   Pertahankan spreadsheet yang sudah ada.
-   Jangan menghapus, mengganti nama, atau mengubah kolom sebelum audit
    selesai.
-   Gunakan kolom `ID` sebagai identitas siswa yang stabil.
-   Simpan `NO_WA` sebagai teks agar angka nol di depan tidak hilang.
-   Jangan mengandalkan gambar barcode sebagai data yang dikirim
    scanner.
-   Scanner harus menghasilkan teks ID, misalnya `M1B-26-005`.
-   Backend mencari dan memvalidasi ID tersebut terhadap data siswa.
-   Fungsi tab `PAGE`, `ABSENSI`, `WEB`, `USER`, `SETTING`, dan `LOG`
    harus diperiksa sebelum diputuskan untuk digunakan ulang.

### 5.3 Informasi yang belum diketahui

Screenshot belum memperlihatkan seluruh isi dan struktur tab. Karena
itu, desain ini belum menetapkan kolom final untuk tab `ABSENSI`,
`USER`, `SETTING`, atau `LOG`.

Sebelum migrasi atau penulisan data, lakukan audit terhadap:

1.  Nama seluruh sheet.
2.  Header setiap sheet.
3.  Format tanggal dan waktu.
4.  Contoh beberapa baris data.
5.  Formula yang digunakan.
6.  Relasi antar-sheet.
7.  Cara sistem lama menulis transaksi.
8.  Apakah ada data historis yang harus dipertahankan.

------------------------------------------------------------------------

## 6. Desain Data

### 6.1 Data master siswa

Model logis siswa:

``` ts
type Student = {
  id: string;
  name: string;
  className: string;
  whatsappNumber?: string;
  barcodeValue: string;
  isActive: boolean;
  updatedAt?: string;
};
```

Catatan:

-   `id` menggunakan nilai dari kolom `ID`.
-   `barcodeValue` diharapkan berisi ID siswa, tetapi harus dibuktikan
    dengan pengujian scanner.
-   `isActive` dapat berasal dari kolom yang sudah ada atau ditambahkan
    setelah audit.
-   Jangan membuat kolom fisik baru sebelum struktur spreadsheet
    diperiksa.

### 6.2 Model transaksi absensi

Model logis transaksi:

``` ts
type AttendanceTransaction = {
  transactionId: string;
  studentId: string;
  attendanceDate: string;
  attendanceType: "MASUK" | "PULANG";
  method: "BARCODE_CAMERA" | "USB_SCANNER" | "MANUAL";
  attendanceStatus?: "HADIR" | "TERLAMBAT" | "IZIN" | "SAKIT" | "ALFA";
  deviceId: string;
  operatorId: string;
  deviceTimestamp: string;
  serverTimestamp?: string;
  syncStatus: "PENDING" | "SYNCED" | "FAILED" | "CONFLICT";
  note?: string;
};
```

Model tersebut merupakan kontrak logis aplikasi, bukan keputusan bahwa
seluruh properti harus menjadi kolom baru pada sheet lama.

### 6.3 Identitas transaksi

Setiap transaksi wajib memiliki UUID unik yang dibuat saat transaksi
pertama kali disimpan di perangkat.

Contoh:

``` text
transaction_id = 550e8400-e29b-41d4-a716-446655440000
```

ID tersebut tidak boleh berubah saat transaksi dicoba ulang. Backend
menggunakan ID ini untuk mencegah pencatatan ganda.

### 6.4 Struktur IndexedDB

Nama database lokal: `attendance_db`.

Object store yang direncanakan:

  Object store         Fungsi
  -------------------- --------------------------------------
  `students`           Cache data siswa
  `classes`            Cache data kelas
  `settings`           Cache konfigurasi
  `users_cache`        Informasi sesi dan pengguna terbatas
  `attendance_local`   Catatan transaksi lokal
  `attendance_queue`   Antrean transaksi yang perlu dikirim
  `sync_logs`          Riwayat sinkronisasi
  `device_info`        Identitas dan konfigurasi perangkat

Gunakan transaksi IndexedDB yang atomik ketika menyimpan transaksi dan
memasukkannya ke antrean. Jika penyimpanan gagal, aplikasi tidak boleh
menampilkan pesan bahwa absensi berhasil dicatat.

------------------------------------------------------------------------

## 7. Desain Modul Absensi

### 7.1 Tiga metode input

Satu modul absensi mendukung tiga metode:

1.  Kamera perangkat.
2.  Scanner USB.
3.  Input manual.

Ketiganya harus memanggil satu layanan pencatatan absensi yang sama.
Jangan membuat aturan bisnis terpisah untuk setiap metode.

### 7.2 Scanner USB

Scanner USB umumnya bekerja dalam mode keyboard HID:

1.  Operator memilih sesi masuk atau pulang.
2.  Input scanner berada dalam keadaan fokus.
3.  Scanner membaca barcode.
4.  Scanner mengetikkan teks ID siswa.
5.  Scanner mengirim Enter jika dikonfigurasi demikian.
6.  Aplikasi memvalidasi ID dan memproses transaksi.

Scanner harus diuji untuk memastikan:

-   Format barcode yang dibaca.
-   Akhiran Enter atau Tab.
-   Kecepatan input.
-   Karakter yang dihasilkan.
-   Kompatibilitas browser dan sistem operasi.

### 7.3 Kamera

Gunakan library yang mendukung barcode 1D apabila barcode sekolah memang
berupa barcode 1D. ZXing dapat dievaluasi sebagai salah satu pilihan.

Persyaratan:

-   Meminta izin kamera.
-   Menggunakan HTTPS.
-   Memilih kamera yang sesuai.
-   Menghindari pembacaan berulang dalam waktu singkat.
-   Menghentikan kamera ketika halaman ditutup atau mode kamera
    ditinggalkan.
-   Memvalidasi hasil scan dengan data siswa lokal.

Jangan mengasumsikan barcode adalah Code 128 hanya berdasarkan
tampilannya. Pastikan formatnya melalui scanner atau alat pembaca
barcode.

### 7.4 Absensi manual

Formulir manual mendukung:

-   Pencarian siswa berdasarkan ID atau nama.
-   Pemilihan masuk atau pulang.
-   Pemilihan status yang diizinkan.
-   Keterangan.
-   Identitas operator.
-   Waktu pencatatan.

Transaksi manual wajib melalui validasi dan antrean yang sama dengan
transaksi barcode.

### 7.5 Pemilihan sesi

Operator memilih sesi secara eksplisit:

-   `MASUK`
-   `PULANG`

Jangan membuat sistem bergantian otomatis antara masuk dan pulang setiap
kali barcode dipindai. Pemilihan eksplisit mengurangi kesalahan akibat
scan ganda.

### 7.6 Aturan duplikasi

Kunci pemeriksaan bisnis minimal:

``` text
student_id + attendance_date + attendance_type
```

Satu siswa tidak boleh memiliki lebih dari satu transaksi masuk yang sah
atau lebih dari satu transaksi pulang yang sah pada tanggal yang sama,
kecuali sekolah menetapkan kebijakan khusus.

Jika transaksi kedua ditemukan:

-   Jangan menghapus transaksi pertama.
-   Tandai sebagai duplikat atau konflik.
-   Tampilkan penjelasan kepada operator.
-   Catat kejadian dalam log.

------------------------------------------------------------------------

## 8. Aturan Status Kehadiran

Jenis transaksi dan status kehadiran adalah dua hal berbeda.

**Jenis transaksi:**

-   `MASUK`
-   `PULANG`

**Status kehadiran:**

-   `HADIR`
-   `TERLAMBAT`
-   `IZIN`
-   `SAKIT`
-   `ALFA`

### 8.1 Aturan status

-   Status masuk ditentukan berdasarkan waktu scan dan konfigurasi batas
    keterlambatan.
-   Status pulang mencatat waktu pulang dan tidak mengganti status
    masuk.
-   Izin dan sakit dicatat oleh pengguna yang memiliki hak.
-   Alfa ditentukan setelah batas absensi berdasarkan aturan sekolah.
-   Status yang dihasilkan otomatis harus dapat ditelusuri sumber dan
    waktunya.

### 8.2 Penentuan alfa

Jangan menetapkan alfa hanya karena satu komputer tidak melihat siswa
melakukan scan. Ketiga perangkat dapat offline secara bersamaan.

Penetapan alfa sebaiknya dilakukan oleh proses penutupan sesi setelah:

1.  Batas waktu absensi tercapai.
2.  Perangkat yang digunakan sudah diberi kesempatan untuk sinkronisasi.
3.  Transaksi pending yang relevan diperiksa.
4.  Data izin dan sakit diperhitungkan.
5.  Admin dapat memeriksa hasil atau anomali.

Jika perangkat masih offline, sistem harus menampilkan bahwa rekap belum
final atau belum lengkap, bukan menganggap siswa pasti alfa.

------------------------------------------------------------------------

## 9. Desain Offline-First PWA

### 9.1 Cara aplikasi dibuka saat offline

PWA harus terlebih dahulu dibuka ketika online agar browser dapat:

1.  Mengunduh file HTML, JavaScript, CSS, ikon, dan aset.
2.  Mendaftarkan Service Worker.
3.  Menyimpan app shell ke Cache Storage.
4.  Mengunduh data siswa ke IndexedDB.
5.  Memastikan data lokal dapat dibaca.

Setelah proses awal selesai, pengguna dapat membuka aplikasi yang sudah
terpasang ketika internet terputus. Service Worker menyajikan app shell
dari cache, sedangkan data siswa dan antrean dibaca dari IndexedDB.

### 9.2 Cache yang perlu disiapkan

Cache aplikasi:

-   Halaman utama aplikasi.
-   File JavaScript dan CSS hasil build.
-   Ikon dan aset lokal.
-   Halaman fallback offline.
-   Font atau aset lokal yang diperlukan.

Jangan menyimpan respons sensitif seperti data dashboard orang tua atau
data seluruh siswa dalam cache HTTP publik. Data tersebut harus dikelola
melalui IndexedDB dengan pembatasan akses dan kebijakan sesi yang
sesuai.

### 9.3 Data awal perangkat

Sebelum komputer digunakan untuk absensi offline:

-   Login saat online.
-   Daftarkan identitas perangkat.
-   Unduh data siswa dan konfigurasi yang dibutuhkan.
-   Verifikasi jumlah data yang berhasil disimpan.
-   Jalankan uji offline.
-   Tampilkan waktu terakhir data master diperbarui.

Perangkat baru yang belum pernah melakukan sinkronisasi awal tidak dapat
mengakses data siswa ketika offline.

### 9.4 Status koneksi

UI perlu menampilkan status yang jelas:

-   `ONLINE`
-   `OFFLINE`
-   `SYNCING`
-   `PENDING`
-   `SYNC_ERROR`
-   `DATA_STALE`

Jangan hanya mengandalkan `navigator.onLine` untuk memastikan backend
dapat diakses. Lakukan pemeriksaan konektivitas ke API secara berkala
atau ketika pengguna meminta sinkronisasi.

### 9.5 Batasan offline

Ketika offline:

-   Pencatatan lokal dapat dilakukan.
-   Data master hanya sesuai cache terakhir.
-   Perubahan data siswa dari komputer lain belum terlihat.
-   Status absensi lintas komputer belum tentu langsung diketahui.
-   Dashboard orang tua tidak dapat mengambil pembaruan terbaru.
-   Login baru dan pemulihan akun mungkin memerlukan internet.

Aplikasi harus menjelaskan batasan tersebut kepada pengguna.

------------------------------------------------------------------------

## 10. Sinkronisasi Tiga Komputer

### 10.1 Identitas perangkat

Setiap komputer mempunyai identitas tetap:

-   `PC-01`
-   `PC-02`
-   `PC-03`

Identitas perangkat disimpan dalam konfigurasi lokal dan didaftarkan ke
backend. Identitas tersebut bukan pengganti autentikasi pengguna.

### 10.2 Alur sinkronisasi

``` mermaid
flowchart TD
    A["Transaksi tersimpan di IndexedDB"] --> B["Status PENDING"]
    B --> C{"API dapat diakses?"}
    C -- "Tidak" --> D["Tetap simpan di antrean"]
    D --> E["Coba lagi kemudian"]
    E --> C
    C -- "Ya" --> F["Kirim batch transaksi"]
    F --> G["Backend validasi"]
    G --> H{"transaction_id sudah ada?"}
    H -- "Ya" --> I["Kembalikan DUPLICATE"]
    H -- "Tidak" --> J["Periksa aturan bisnis"]
    J --> K{"Valid?"}
    K -- "Tidak" --> L["CONFLICT / FAILED"]
    K -- "Ya" --> M["Tulis ke Google Sheets"]
    M --> N["Kirim hasil per transaksi"]
    I --> O["Perbarui status lokal"]
    L --> O
    N --> O
```

### 10.3 Batch

Gunakan batch agar tidak membuat permintaan API untuk setiap scan.
Ukuran batch awal dapat diuji pada kisaran 25--50 transaksi, lalu
disesuaikan berdasarkan waktu eksekusi dan kuota.

### 10.4 Status transaksi

  Status        Arti
  ------------- -----------------------------------------
  `PENDING`     Menunggu pengiriman
  `SYNCING`     Sedang dikirim
  `SYNCED`      Sudah diterima dan diproses
  `DUPLICATE`   Sudah tercatat sebelumnya
  `FAILED`      Gagal diproses dan perlu tindakan/retry
  `CONFLICT`    Bertentangan dengan aturan bisnis

Bedakan kegagalan sementara, seperti timeout, dari kegagalan permanen,
seperti ID siswa tidak dikenal. Kegagalan sementara dapat dicoba kembali
dengan exponential backoff. Kegagalan permanen perlu ditampilkan untuk
diperiksa operator/admin.

### 10.5 Konkurensi

Apps Script harus menggunakan mekanisme penguncian seperti `LockService`
pada bagian kritis yang memeriksa duplikasi dan menulis transaksi. Kunci
harus digunakan sesingkat mungkin.

Namun, `LockService` tidak menghilangkan seluruh risiko batas kuota,
timeout, atau keterbatasan Google Sheets. Uji beban dengan tiga
perangkat harus dilakukan sebelum produksi.

### 10.6 Waktu dan zona waktu

Simpan setidaknya:

-   Waktu perangkat saat scan.
-   Waktu server saat transaksi diterima.
-   Tanggal operasional sekolah.
-   Zona waktu yang digunakan.

Gunakan zona waktu `Asia/Makassar` sebagai konfigurasi awal berdasarkan
kebutuhan proyek, tetapi jadikan dapat diubah. Jam perangkat yang tidak
wajar perlu ditandai.

------------------------------------------------------------------------

## 11. Desain API

Nama berikut adalah rancangan fungsi logis. Implementasi Apps Script
dapat menggunakan satu `doPost` dengan properti `action`, atau pola
routing lain yang konsisten.

  Action                    Kegunaan
  ------------------------- ---------------------------------
  `login`                   Autentikasi pengguna
  `getInitialData`          Mengambil data master awal
  `getUpdatedData`          Mengambil perubahan data master
  `registerDevice`          Mendaftarkan perangkat
  `submitAttendanceBatch`   Mengirim batch transaksi
  `getAttendanceReport`     Mengambil laporan
  `saveManualAttendance`    Mencatat transaksi manual
  `getParentAttendance`     Mengambil kehadiran anak
  `getSyncStatus`           Mengambil status sinkronisasi
  `getDeviceStatus`         Memantau perangkat

### 11.1 Contoh payload

``` json
{
  "action": "submitAttendanceBatch",
  "device_id": "PC-01",
  "transactions": [
    {
      "transaction_id": "uuid-001",
      "student_id": "M1B-26-005",
      "attendance_date": "2026-11-09",
      "attendance_type": "MASUK",
      "method": "USB_SCANNER",
      "device_timestamp": "2026-11-09T07:05:00+08:00"
    }
  ]
}
```

### 11.2 Contoh respons

``` json
{
  "success": true,
  "results": [
    {
      "transaction_id": "uuid-001",
      "status": "SYNCED"
    }
  ]
}
```

### 11.3 Ketentuan API

-   Semua input divalidasi di backend.
-   Semua action memeriksa autentikasi dan hak akses.
-   ID siswa harus ditemukan dan aktif.
-   `transaction_id` wajib unik.
-   Backend mengembalikan hasil per transaksi.
-   Error harus memiliki kode dan pesan yang konsisten.
-   Jangan mengembalikan data pribadi yang tidak diperlukan.
-   Jangan menaruh token rahasia permanen di frontend.
-   Hindari membuka Google Sheets secara publik.

------------------------------------------------------------------------

## 12. Dashboard

### 12.1 Dashboard Admin

Informasi utama:

-   Jumlah siswa.
-   Jumlah hadir.
-   Jumlah terlambat.
-   Jumlah izin dan sakit.
-   Jumlah alfa.
-   Ringkasan masuk dan pulang.
-   Grafik kehadiran.
-   Daftar transaksi terbaru.
-   Status PC-01, PC-02, PC-03.
-   Jumlah transaksi pending, gagal, dan konflik.

### 12.2 Dashboard Operator

Informasi utama:

-   Pemilihan sesi masuk/pulang.
-   Metode kamera, USB scanner, dan manual.
-   Hasil scan terakhir.
-   Informasi siswa.
-   Status online/offline.
-   Jumlah antrean lokal.
-   Waktu sinkronisasi terakhir.
-   Peringatan data master yang sudah lama.

### 12.3 Dashboard Orang Tua

Informasi utama:

-   Profil anak.
-   Tanggal dan waktu masuk.
-   Tanggal dan waktu pulang.
-   Status kehadiran.
-   Keterangan izin atau sakit.
-   Riwayat harian.
-   Rekap bulanan.

Akses orang tua harus dibatasi berdasarkan relasi akun yang telah
diverifikasi oleh backend.

------------------------------------------------------------------------

## 13. Keamanan

### 13.1 Autentikasi

-   Password tidak boleh disimpan dalam bentuk teks biasa.
-   Gunakan mekanisme autentikasi yang dapat diverifikasi di server.
-   Terapkan sesi dengan masa berlaku.
-   Batasi percobaan login.
-   Sediakan proses logout dan pencabutan sesi.
-   Untuk operator offline, gunakan sesi/perangkat yang sebelumnya telah
    diotorisasi dengan masa berlaku offline yang terbatas.

### 13.2 Otorisasi

Terapkan pemeriksaan peran di backend untuk setiap action.
Menyembunyikan tombol di frontend bukan mekanisme keamanan.

### 13.3 Data lokal

-   Batasi data lokal sesuai kebutuhan perangkat.
-   Jangan menyimpan password mentah.
-   Jangan menyimpan rahasia API di IndexedDB.
-   Terapkan kebijakan logout dan penghapusan data sesi.
-   Jangan menghapus antrean transaksi yang belum tersinkronisasi saat
    logout biasa.
-   Sediakan prosedur aman untuk perangkat hilang atau tidak lagi
    digunakan.

### 13.4 Audit

Catat setidaknya:

-   Pengguna yang melakukan tindakan.
-   Jenis tindakan.
-   Waktu.
-   Perangkat.
-   Data sebelum dan sesudah untuk koreksi penting.
-   Alasan koreksi.
-   Hasil tindakan.

Nomor WhatsApp dan informasi pribadi siswa hanya digunakan sesuai
kebutuhan sistem dan kebijakan sekolah.

------------------------------------------------------------------------

## 14. Hosting dan Deployment

### 14.1 Konfigurasi

  Bagian           Layanan
  ---------------- -----------------------------------
  Frontend         Cloudflare Pages
  Backend          Google Apps Script Web App
  Proxy opsional   Cloudflare Worker
  Database pusat   Google Sheets
  Repository       GitHub
  Domain           Domain sekolah atau domain khusus
  HTTPS            Wajib

### 14.2 Deployment frontend

1.  Bangun aplikasi React.
2.  Pastikan konfigurasi PWA benar.
3.  Simpan source code di GitHub.
4.  Hubungkan repository dengan Cloudflare Pages.
5.  Atur perintah build dan direktori output sesuai toolchain.
6.  Deploy ke alamat uji.
7.  Uji manifest dan Service Worker.
8.  Uji instalasi PWA pada Windows.
9.  Konfigurasikan domain khusus jika tersedia.

### 14.3 Deployment backend

1.  Audit spreadsheet.
2.  Buat dan uji Apps Script.
3.  Konfigurasikan akses spreadsheet.
4.  Deploy sebagai Web App.
5.  Uji autentikasi dan izin.
6.  Uji komunikasi dari domain frontend.
7.  Tambahkan Worker jika diperlukan.
8.  Catat versi deployment dan prosedur pembaruan.

### 14.4 Persiapan perangkat

Untuk masing-masing dari tiga komputer:

1.  Buka aplikasi ketika online.
2.  Login dan daftarkan perangkat.
3.  Instal PWA.
4.  Unduh data master.
5.  Pastikan cache dan IndexedDB terisi.
6.  Lakukan uji scan.
7.  Putuskan internet dan uji kembali.
8.  Pulihkan internet dan pastikan antrean tersinkronisasi.

------------------------------------------------------------------------

## 15. Pengujian dan Kriteria Penerimaan

  ------------------------------------------------------------------------
                           No. Skenario              Kriteria berhasil
  ---------------------------- --------------------- ---------------------
                             1 Membuka PWA online    Aplikasi dapat dibuka

                             2 Membuka PWA offline   App shell tetap
                               setelah persiapan     tersedia

                             3 Scan barcode valid    Transaksi tersimpan
                               offline               lokal

                             4 Scan ID tidak dikenal Ditolak dan dicatat
                                                     sebagai masalah

                             5 Scan berulang pada    Duplikasi dicegah
                               sesi sama             

                             6 Absensi manual        Transaksi masuk
                               offline               antrean

                             7 Browser ditutup       Transaksi yang sudah
                               mendadak              committed tetap ada

                             8 Internet kembali      Antrean mulai
                                                     disinkronkan

                             9 Respons server hilang Retry tidak membuat
                               setelah penulisan     transaksi ganda

                            10 Tiga komputer         Hasil konsisten atau
                               mengirim bersamaan    konflik terdeteksi

                            11 Orang tua membuka     Hanya data yang
                               data anak             berhak dilihat

                            12 Operator melakukan    Audit log tersedia
                               koreksi               

                            13 Data master berubah   Perangkat menerima
                                                     pembaruan saat online

                            14 Perangkat belum       Aplikasi memberi tahu
                               pernah sinkron        bahwa offline belum
                                                     siap
  ------------------------------------------------------------------------

### 15.1 Pengujian khusus

Lakukan pengujian pada:

-   Koneksi lambat.
-   Internet terputus saat pengiriman.
-   Backend tidak tersedia.
-   Google Sheets tidak tersedia.
-   Komputer restart.
-   Browser ditutup paksa.
-   Dua perangkat mencatat siswa yang sama saat offline.
-   Jam komputer tidak sesuai.
-   Data siswa berubah setelah cache awal.

------------------------------------------------------------------------

## 16. Risiko dan Mitigasi

  -----------------------------------------------------------------------
  Risiko                  Dampak                  Mitigasi
  ----------------------- ----------------------- -----------------------
  Kuota Apps Script habis Sinkronisasi tertunda   Batch, monitoring
                                                  kuota, evaluasi
                                                  kapasitas

  Google Sheets lambat    Antrean bertambah       Batasi operasi
                                                  baca/tulis dan
                                                  optimalkan batch

  Data lokal belum        Siswa baru tidak        Tampilkan waktu
  diperbarui              ditemukan offline       pembaruan dan
                                                  sinkronisasi master

  Dua PC mencatat siswa   Konflik transaksi       Validasi server dan
  yang sama saat offline                          daftar konflik

  Komputer rusak sebelum  Data lokal berisiko     Jangan menunda
  sinkronisasi            hilang                  sinkronisasi saat
                                                  online; siapkan
                                                  prosedur pemulihan
                                                  perangkat

  Jam komputer salah      Urutan waktu keliru     Simpan waktu perangkat
                                                  dan server; tandai
                                                  anomali

  API/CORS bermasalah     Frontend gagal          Proof of concept dan
                          mengakses backend       Worker bila diperlukan

  Akun orang tua          Kebocoran data          Verifikasi relasi di
  mengakses anak lain                             backend

  Cache aplikasi tidak    PWA gagal offline       Uji instalasi dan
  lengkap                                         offline readiness
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 17. Roadmap Implementasi

### Fase 1 --- Audit spreadsheet

-   [ ] Periksa seluruh tab.
-   [ ] Catat header setiap tab.
-   [ ] Periksa beberapa contoh transaksi.
-   [ ] Pastikan format barcode.
-   [ ] Petakan relasi siswa, pengguna, dan orang tua.
-   [ ] Tentukan aturan absensi sekolah.

**Output:** struktur data final dan aturan bisnis.

### Fase 2 --- Proof of Concept backend

-   [ ] Buat Apps Script API minimal.
-   [ ] Baca data siswa.
-   [ ] Kirim satu transaksi uji.
-   [ ] Uji CORS dan redirect.
-   [ ] Uji autentikasi.
-   [ ] Uji penulisan bersamaan.

**Output:** jalur komunikasi frontend-backend terbukti.

### Fase 3 --- Fondasi frontend

-   [ ] Buat proyek React + TypeScript.
-   [ ] Konfigurasi Tailwind CSS.
-   [ ] Buat routing.
-   [ ] Buat komponen layout.
-   [ ] Buat login.
-   [ ] Buat sistem role.

**Output:** kerangka aplikasi.

### Fase 4 --- Fitur online

-   [ ] Dashboard admin.
-   [ ] Halaman operator.
-   [ ] Dashboard orang tua.
-   [ ] Pengelolaan siswa.
-   [ ] Barcode kamera.
-   [ ] Input scanner USB.
-   [ ] Absensi manual.
-   [ ] Laporan dasar.

**Output:** sistem absensi online.

### Fase 5 --- Offline-first

-   [ ] PWA manifest.
-   [ ] Service Worker.
-   [ ] Cache app shell.
-   [ ] IndexedDB.
-   [ ] Cache data master.
-   [ ] Antrean transaksi.
-   [ ] Status koneksi dan offline readiness.

**Output:** pencatatan lokal ketika offline.

### Fase 6 --- Sinkronisasi multi-perangkat

-   [ ] Identitas tiga perangkat.
-   [ ] Batch upload.
-   [ ] Idempotensi.
-   [ ] Retry dan backoff.
-   [ ] Locking backend.
-   [ ] Deteksi konflik.
-   [ ] Monitoring sinkronisasi.

**Output:** sinkronisasi tiga komputer.

### Fase 7 --- Pengujian dan deployment

-   [ ] Uji semua skenario penerimaan.
-   [ ] Uji volume transaksi realistis.
-   [ ] Uji pemulihan perangkat.
-   [ ] Deploy frontend.
-   [ ] Deploy backend.
-   [ ] Pasang PWA pada tiga komputer.
-   [ ] Dokumentasikan prosedur operator dan admin.

**Output:** sistem siap untuk uji coba operasional.

### Fase 8 --- Pengembangan lanjutan

-   [ ] Notifikasi WhatsApp.
-   [ ] Retry dan monitoring notifikasi.
-   [ ] Laporan lanjutan.
-   [ ] Evaluasi kapasitas Sheets dan Apps Script.
-   [ ] Pertimbangkan backend/database khusus jika kebutuhan melampaui
    kapasitas.

------------------------------------------------------------------------

## 18. Struktur Folder yang Disarankan

Contoh struktur awal untuk repository:

``` text
school-attendance/
├── public/
│   ├── icons/
│   ├── manifest.webmanifest
│   └── offline.html
│
├── src/
│   ├── app/
│   │   ├── router/
│   │   └── providers/
│   │
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   └── attendance/
│   │
│   ├── features/
│   │   ├── auth/
│   │   ├── admin/
│   │   ├── operator/
│   │   ├── parent/
│   │   ├── students/
│   │   ├── attendance/
│   │   ├── reports/
│   │   └── synchronization/
│   │
│   ├── services/
│   │   ├── api/
│   │   ├── attendance/
│   │   ├── scanner/
│   │   └── synchronization/
│   │
│   ├── db/
│   │   ├── indexeddb.ts
│   │   ├── schema.ts
│   │   └── repositories/
│   │
│   ├── hooks/
│   ├── lib/
│   ├── types/
│   ├── utils/
│   └── main.tsx
│
├── apps-script/
│   ├── Code.gs
│   ├── Auth.gs
│   ├── Students.gs
│   ├── Attendance.gs
│   ├── Sync.gs
│   └── Reports.gs
│
├── docs/
│   ├── SYSTEM_DESIGN.md
│   ├── DATABASE.md
│   ├── API.md
│   ├── OFFLINE_SYNC.md
│   └── SECURITY.md
│
├── AGENTS.md
├── package.json
├── tsconfig.json
└── README.md
```

Struktur dapat disesuaikan dengan toolchain dan kebutuhan implementasi.
Folder `apps-script` dapat dikelola terpisah jika proses deployment Apps
Script menggunakan clasp atau metode lain.

------------------------------------------------------------------------

## 19. Instruksi Penting untuk AI Agent

Saat mengembangkan proyek ini, AI Agent wajib mengikuti aturan berikut:

1.  Baca seluruh dokumen proyek sebelum mengubah kode.
2.  Jangan mengubah atau menghapus struktur Google Sheets tanpa
    persetujuan.
3.  Jangan mengarang kolom spreadsheet yang belum diaudit.
4.  Gunakan ID siswa yang sudah ada sebagai identitas utama.
5.  Gunakan satu layanan pencatatan untuk kamera, USB scanner, dan input
    manual.
6.  Semua transaksi harus disimpan secara lokal sebelum dinyatakan
    berhasil pada mode offline.
7.  Jangan menghapus antrean sebelum hasil server terkonfirmasi.
8.  Terapkan idempotensi di backend.
9.  Terapkan validasi dan otorisasi di backend.
10. Jangan menyimpan password atau rahasia API di frontend.
11. Jangan menganggap `navigator.onLine` sebagai bukti bahwa backend
    tersedia.
12. Jangan menganggap Background Sync selalu didukung semua browser;
    sediakan retry saat aplikasi aktif.
13. Jangan menandai seluruh siswa alfa sebelum proses penutupan dan
    pemeriksaan sinkronisasi.
14. Jangan membuat fitur baru yang berada di luar ruang lingkup tanpa
    memperbarui dokumen.
15. Setelah setiap fase, jalankan pengujian dan perbarui `TASKS.md`.

------------------------------------------------------------------------

## 20. Keputusan yang Masih Menunggu Audit

Hal berikut belum boleh dianggap final:

-   Struktur lengkap tab `ABSENSI`.
-   Struktur lengkap tab `WEB`.
-   Struktur lengkap tab `USER`.
-   Struktur lengkap tab `SETTING`.
-   Struktur lengkap tab `LOG`.
-   Format barcode yang sebenarnya.
-   Jumlah siswa dan estimasi transaksi harian.
-   Aturan jam masuk, batas terlambat, dan jam pulang.
-   Kebijakan koreksi absensi.
-   Relasi akun orang tua dengan siswa.
-   Kebijakan sesi operator ketika offline.
-   Kebijakan finalisasi alfa.
-   Kebutuhan dan penyedia notifikasi WhatsApp.

Keputusan ini harus dikonfirmasi dengan data dan kebijakan sekolah
sebelum implementasi produksi.

------------------------------------------------------------------------

## 21. Rekomendasi Akhir

Arsitektur yang direkomendasikan untuk versi pertama:

**React + TypeScript + Tailwind CSS + PWA + IndexedDB + Cloudflare
Pages + Google Apps Script + Google Sheets.**

Prioritas implementasi bukan membuat dashboard yang banyak terlebih
dahulu. Prioritasnya adalah membuktikan tiga fondasi:

1.  Frontend dapat berkomunikasi dengan backend dan membaca/menulis
    Google Sheets secara aman.
2.  PWA tetap dapat dibuka dan mencatat transaksi ketika offline.
3.  Tiga komputer dapat mengirim transaksi tanpa kehilangan data atau
    membuat duplikasi yang tidak terdeteksi.

Setelah tiga fondasi tersebut berhasil, fitur dashboard, laporan, dan
notifikasi dapat dikembangkan dengan risiko yang lebih rendah.

**Prinsip utama proyek: data absensi yang sudah berhasil disimpan secara
lokal tidak boleh hilang hanya karena internet, hosting, atau backend
sedang tidak tersedia.**
