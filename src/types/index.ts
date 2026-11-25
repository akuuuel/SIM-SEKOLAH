// ==========================================
// Tipe Data Inti Sistem Absensi Sekolah
// ==========================================

export type DeviceId = 'PC-01' | 'PC-02' | 'PC-03';
export type DeviceAssignment = DeviceId | 'ALL';

export type UserRole = 'SUPER_ADMIN' | 'ADMIN_PC' | 'OPERATOR' | 'PARENT';

export interface UserAccount {
  userId: string;
  username: string;
  fullName: string;
  passwordHash: string;       // SHA-256 hash — tidak pernah simpan plain text
  role: UserRole;
  assignedDeviceId: DeviceAssignment;
  status: 'ACTIVE' | 'INACTIVE';
  lastLoginAt?: string;
  createdAt: string;
  failedLoginCount?: number;  // Tracking percobaan gagal per akun
  studentId?: string;         // ID/ID Siswa anak yang terhubung (khusus role PARENT)
  studentIds?: string[];      // Daftar ID seluruh anak jika orang tua memiliki > 1 anak
  phone?: string;             // Nomor WhatsApp orang tua untuk notifikasi
}

export interface DeviceConfig {
  deviceId: DeviceId;
  deviceName: string;
  locationName: string;
  isRegistered: boolean;
  registeredAt?: string;
  lastSyncAt?: string;
}

export interface Student {
  id: string; // contoh: "M1B-26-005"
  name: string;
  className: string;
  whatsappNumber?: string;    // Nomor WhatsApp Orang Tua / Wali untuk Notifikasi
  parentName?: string;        // Nama Lengkap Orang Tua / Wali Siswa
  barcodeValue: string;
  isActive: boolean;
  updatedAt?: string;
}

export type AttendanceSession = 'MASUK' | 'PULANG';

export type AttendanceMethod = 'USB_SCANNER' | 'BARCODE_CAMERA' | 'MANUAL';

export type AttendanceStatus = 'HADIR' | 'TERLAMBAT' | 'IZIN' | 'SAKIT' | 'ALFA' | 'BK';

export type SyncStatus = 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED' | 'CONFLICT';

export interface AttendanceTransaction {
  transactionId: string; // UUID v4 unik
  studentId: string;
  studentName?: string;
  className?: string;
  attendanceDate: string; // YYYY-MM-DD
  attendanceType: AttendanceSession;
  method: AttendanceMethod;
  attendanceStatus: AttendanceStatus;
  deviceId: DeviceId;
  operatorId: string;
  operatorName?: string;
  deviceTimestamp: string; // ISO 8601
  serverTimestamp?: string;
  syncStatus: SyncStatus;
  syncError?: string;
  note?: string;
}

export type ConnectionState = 'ONLINE' | 'OFFLINE' | 'SERVER_UNREACHABLE';

export interface SyncSummary {
  totalPending: number;
  totalSynced: number;
  totalFailed: number;
  totalConflict: number;
  lastSyncTime?: string;
}

export interface AttendanceKPI {
  totalStudents: number;
  presentToday: number;
  lateToday: number;
  absentToday: number;
  unrecordedToday: number;
}

