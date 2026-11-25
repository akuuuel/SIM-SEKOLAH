-- ========================================================
-- DATABASE SCHEMA: SISTEM ABSENSI MAN 1 BULUKUMBA
-- Server: MySQL / phpMyAdmin XAMPP
-- Database: db_absensi_man1
-- ========================================================

CREATE DATABASE IF NOT EXISTS `db_absensi_man1` 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE `db_absensi_man1`;

-- --------------------------------------------------------
-- 1. TABEL: siswa (Data Master Siswa)
-- --------------------------------------------------------
DROP TABLE IF EXISTS `siswa`;
CREATE TABLE `siswa` (
  `id` VARCHAR(50) NOT NULL,
  `nama` VARCHAR(100) NOT NULL,
  `kelas` VARCHAR(50) NOT NULL,
  `barcode` VARCHAR(50) NOT NULL,
  `no_wa` VARCHAR(25) DEFAULT NULL,
  `nama_wali` VARCHAR(100) DEFAULT NULL,
  `status_aktif` TINYINT(1) NOT NULL DEFAULT 1,
  `dibuat_pada` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_barcode` (`barcode`),
  KEY `idx_kelas` (`kelas`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed Data Siswa Contoh
INSERT INTO `siswa` (`id`, `nama`, `kelas`, `barcode`, `no_wa`, `status_aktif`) VALUES
('M1B-26-001', 'Ahmad Fauzi', 'X MIPA 1', 'M1B-26-001', '081234567891', 1),
('M1B-26-002', 'Anisa Rahmawati', 'X MIPA 1', 'M1B-26-002', '081234567892', 1),
('M1B-26-003', 'Budi Santoso', 'X MIPA 2', 'M1B-26-003', '081234567893', 1),
('M1B-26-004', 'Citra Dewi', 'X IPS 1', 'M1B-26-004', '081234567894', 1),
('M1B-26-005', 'Dimas Pratama', 'X B', 'M1B-26-005', '081234567895', 1),
('M1B-26-006', 'Eka Nurhayati', 'XI MIPA 1', 'M1B-26-006', '081234567896', 1),
('M1B-26-007', 'Farhan Maulana', 'XI IPS 2', 'M1B-26-007', '081234567897', 1),
('M1B-26-008', 'Gita Permata', 'XII MIPA 1', 'M1B-26-008', '081234567898', 1);

-- --------------------------------------------------------
-- 2. TABEL: users (Akun Pengguna & Operator PC)
-- --------------------------------------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `user_id` VARCHAR(50) NOT NULL,
  `username` VARCHAR(50) NOT NULL,
  `full_name` VARCHAR(100) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('SUPER_ADMIN','ADMIN_PC','OPERATOR','PARENT') NOT NULL DEFAULT 'ADMIN_PC',
  `assigned_device_id` VARCHAR(20) NOT NULL DEFAULT 'ALL',
  `student_id` VARCHAR(50) DEFAULT NULL,
  `phone` VARCHAR(25) DEFAULT NULL,
  `status` ENUM('ACTIVE','SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `unique_username` (`username`),
  KEY `idx_student` (`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Password Hash SHA-256 bawaan:
-- admin / admin123       -> 240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9
-- operator / operator123 -> a445a9992d95e865f57ff89da1b827ff330084c78feea50529d381014cc6cb84
INSERT INTO `users` (`user_id`, `username`, `full_name`, `password_hash`, `role`, `assigned_device_id`, `status`) VALUES
('USR-000', 'admin', 'Super Admin Sekolah', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'SUPER_ADMIN', 'ALL', 'ACTIVE'),
('USR-001', 'admin_pc01', 'Operator Gerbang Utama (PC-01)', 'a445a9992d95e865f57ff89da1b827ff330084c78feea50529d381014cc6cb84', 'ADMIN_PC', 'PC-01', 'ACTIVE'),
('USR-002', 'admin_pc02', 'Operator Gerbang Barat (PC-02)', 'a445a9992d95e865f57ff89da1b827ff330084c78feea50529d381014cc6cb84', 'ADMIN_PC', 'PC-02', 'ACTIVE'),
('USR-003', 'admin_pc03', 'Operator Ruang Piket (PC-03)', 'a445a9992d95e865f57ff89da1b827ff330084c78feea50529d381014cc6cb84', 'ADMIN_PC', 'PC-03', 'ACTIVE');

-- --------------------------------------------------------
-- 3. TABEL: absensi (Pencatatan Kehadiran 1 Baris per Siswa per Hari)
-- --------------------------------------------------------
DROP TABLE IF EXISTS `absensi`;
CREATE TABLE `absensi` (
  `id` BIGINT AUTO_INCREMENT NOT NULL,
  `transaction_id` VARCHAR(64) NOT NULL,
  `tanggal` DATE NOT NULL,
  `id_siswa` VARCHAR(50) NOT NULL,
  `nama_siswa` VARCHAR(100) NOT NULL,
  `kelas` VARCHAR(50) NOT NULL,
  `jam_masuk` TIME DEFAULT NULL,
  `jam_pulang` TIME DEFAULT NULL,
  `status` ENUM('HADIR','TERLAMBAT','IZIN','SAKIT','ALFA','BK') NOT NULL DEFAULT 'HADIR',
  `metode` ENUM('USB_SCANNER','BARCODE_CAMERA','MANUAL') NOT NULL DEFAULT 'USB_SCANNER',
  `device_id` VARCHAR(20) NOT NULL,
  `operator_id` VARCHAR(50) NOT NULL,
  `operator_name` VARCHAR(100) NOT NULL,
  `keterangan` TEXT DEFAULT NULL,
  `dibuat_pada` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_transaksi` (`transaction_id`),
  UNIQUE KEY `unique_siswa_tanggal` (`id_siswa`, `tanggal`),
  KEY `idx_tanggal` (`tanggal`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

