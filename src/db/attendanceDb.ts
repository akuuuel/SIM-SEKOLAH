import Dexie, { type Table } from 'dexie';
import type {
  Student,
  AttendanceTransaction,
  UserAccount,
  DeviceConfig,
  DeviceId,
  AttendanceSession,
  AttendanceMethod,
  AttendanceStatus,
} from '../types';
import { generateUUID, hashPassword, sanitizeInput } from '../lib/utils';

// ========================================================
// Database Schema — versi 2 menambahkan passwordHash pada users
// ========================================================

export class AttendanceDatabase extends Dexie {
  students!: Table<Student, string>;
  users!: Table<UserAccount, string>;
  transactions!: Table<AttendanceTransaction, string>;
  deviceConfig!: Table<DeviceConfig, string>;

  constructor() {
    super('AttendanceSchoolDB');

    // v1 → skema awal
    this.version(1).stores({
      students: 'id, name, className, barcodeValue, isActive',
      users: 'userId, username, role, assignedDeviceId, status',
      transactions:
        'transactionId, studentId, attendanceDate, attendanceType, deviceId, operatorId, syncStatus, deviceTimestamp, [studentId+attendanceDate+attendanceType]',
      deviceConfig: 'deviceId',
    });

    // v2 → migrasi: tambah passwordHash ke semua user yang belum punya
    this.version(2)
      .stores({
        students: 'id, name, className, barcodeValue, isActive',
        users: 'userId, username, role, assignedDeviceId, status',
        transactions:
          'transactionId, studentId, attendanceDate, attendanceType, deviceId, operatorId, syncStatus, deviceTimestamp, [studentId+attendanceDate+attendanceType]',
        deviceConfig: 'deviceId',
      })
      .upgrade(async (tx) => {
        // Beri semua user lama password hash default supaya tidak gagal login
        const DEFAULT_PASS = 'operator123';
        const ADMIN_PASS = 'admin123';
        const usersTable = tx.table('users');
        const allUsers = await usersTable.toArray();

        for (const user of allUsers) {
          if (!user.passwordHash) {
            const plain = user.role === 'SUPER_ADMIN' ? ADMIN_PASS : DEFAULT_PASS;
            const hash = await hashPassword(plain);
            await usersTable.update(user.userId, { passwordHash: hash });
          }
        }
      });
  }
}

export const db = new AttendanceDatabase();

// ========================================================
// Seed Data Awal untuk Inisialisasi Pertama
// ========================================================

export async function initializeDatabase() {
  // --- Seed Siswa ---
  const studentCount = await db.students.count();
  if (studentCount === 0) {
    const initialStudents: Student[] = [
      { id: 'M1B-26-001', name: 'Ahmad Fauzi',      className: 'X MIPA 1',   barcodeValue: 'M1B-26-001', isActive: true, whatsappNumber: '081234567891' },
      { id: 'M1B-26-002', name: 'Anisa Rahmawati',  className: 'X MIPA 1',   barcodeValue: 'M1B-26-002', isActive: true, whatsappNumber: '081234567892' },
      { id: 'M1B-26-003', name: 'Budi Santoso',     className: 'X MIPA 2',   barcodeValue: 'M1B-26-003', isActive: true, whatsappNumber: '081234567893' },
      { id: 'M1B-26-004', name: 'Citra Dewi',       className: 'X IPS 1',    barcodeValue: 'M1B-26-004', isActive: true, whatsappNumber: '081234567894' },
      { id: 'M1B-26-005', name: 'Dimas Pratama',    className: 'X B',        barcodeValue: 'M1B-26-005', isActive: true, whatsappNumber: '081234567895' },
      { id: 'M1B-26-006', name: 'Eka Nurhayati',    className: 'XI MIPA 1',  barcodeValue: 'M1B-26-006', isActive: true, whatsappNumber: '081234567896' },
      { id: 'M1B-26-007', name: 'Farhan Maulana',   className: 'XI IPS 2',   barcodeValue: 'M1B-26-007', isActive: true, whatsappNumber: '081234567897' },
      { id: 'M1B-26-008', name: 'Gita Permata',     className: 'XII MIPA 1', barcodeValue: 'M1B-26-008', isActive: true, whatsappNumber: '081234567898' },
    ];
    await db.students.bulkAdd(initialStudents);
  }

  // --- Seed User (hanya jika belum ada) ---
  const userCount = await db.users.count();
  if (userCount === 0) {
    // Password default — hash dengan SHA-256 + salt
    const [adminHash, operatorHash] = await Promise.all([
      hashPassword('admin123'),       // ← Super Admin
      hashPassword('operator123'),    // ← Operator PC
    ]);

    const initialUsers: UserAccount[] = [
      {
        userId: 'USR-000',
        username: 'admin',
        fullName: 'Super Admin Sekolah',
        passwordHash: adminHash,
        role: 'SUPER_ADMIN',
        assignedDeviceId: 'ALL',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
      },
      {
        userId: 'USR-001',
        username: 'admin_pc01',
        fullName: 'Operator Gerbang Utama (PC-01)',
        passwordHash: operatorHash,
        role: 'ADMIN_PC',
        assignedDeviceId: 'PC-01',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
      },
      {
        userId: 'USR-002',
        username: 'admin_pc02',
        fullName: 'Operator Gerbang Barat (PC-02)',
        passwordHash: operatorHash,
        role: 'ADMIN_PC',
        assignedDeviceId: 'PC-02',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
      },
      {
        userId: 'USR-003',
        username: 'admin_pc03',
        fullName: 'Operator Ruang Piket (PC-03)',
        passwordHash: operatorHash,
        role: 'ADMIN_PC',
        assignedDeviceId: 'PC-03',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
      },
    ];
    await db.users.bulkAdd(initialUsers);
  }
}

// ========================================================
// Helper: Session & Device Persistence (localStorage)
// ========================================================

const CURRENT_DEVICE_KEY = 'school_active_device_id';
const CURRENT_USER_KEY   = 'school_active_user';

export function getStoredDeviceId(): DeviceId {
  const saved = localStorage.getItem(CURRENT_DEVICE_KEY);
  if (saved === 'PC-01' || saved === 'PC-02' || saved === 'PC-03') return saved;
  return 'PC-01';
}

export function setStoredDeviceId(deviceId: DeviceId) {
  localStorage.setItem(CURRENT_DEVICE_KEY, deviceId);
}

export function getStoredUser(): UserAccount | null {
  const json = localStorage.getItem(CURRENT_USER_KEY);
  if (!json) return null;
  try {
    return JSON.parse(json) as UserAccount;
  } catch {
    return null;
  }
}

export function setStoredUser(user: UserAccount | null) {
  if (!user) {
    localStorage.removeItem(CURRENT_USER_KEY);
  } else {
    // Jangan simpan passwordHash di localStorage — keamanan ekstra
    const { passwordHash: _removed, ...safeUser } = user as UserAccount & { passwordHash?: string };
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(safeUser));
  }
}

// ========================================================
// Catat Absensi — Offline Atomic Transaction
// ========================================================

export async function recordAttendanceOffline({
  studentId,
  session,
  method,
  deviceId,
  operatorId,
  operatorName,
}: {
  studentId: string;
  session: AttendanceSession;
  method: AttendanceMethod;
  deviceId: DeviceId;
  operatorId: string;
  operatorName: string;
}): Promise<{ success: boolean; message: string; transaction?: AttendanceTransaction }> {

  // 0. Sanitasi input barcode sebelum query (mencegah injection)
  const cleanId = sanitizeInput(studentId, 50);
  if (!cleanId || cleanId.length < 3) {
    return { success: false, message: 'ID barcode tidak valid.' };
  }

  // 1. Cek validitas data siswa di cache lokal (dukung case-insensitive & barcodeValue)
  let student = await db.students.get(cleanId);
  if (!student) {
    const lowerClean = cleanId.toLowerCase();
    student = await db.students
      .filter((s) => s.id.toLowerCase() === lowerClean || (s.barcodeValue ? s.barcodeValue.toLowerCase() === lowerClean : false))
      .first();
  }

  if (!student) {
    return { success: false, message: `Barcode/ID [${cleanId}] tidak terdaftar di sistem lokal. Tarik data siswa dari Google Sheets terlebih dahulu.` };
  }
  if (!student.isActive) {
    return { success: false, message: `Siswa [${student.name}] berstatus NONAKTIF.` };
  }

  // Gunakan ID resmi siswa yang terdaftar
  const officialStudentId = student.id;

  const today = new Date().toISOString().split('T')[0];
  const now   = new Date();

  // 2. Cegah duplikasi transaksi sesi yang sama pada hari yang sama
  const existing = await db.transactions
    .where('studentId')
    .equals(officialStudentId)
    .and((t) => t.attendanceDate === today && t.attendanceType === session)
    .first();

  if (existing) {
    return {
      success: false,
      message: `Siswa [${student.name}] SUDAH tercatat ${session} hari ini pukul ${new Date(existing.deviceTimestamp).toLocaleTimeString('id-ID')}.`,
      transaction: existing,
    };
  }

  // 3. Tentukan status kehadiran berdasarkan sesi
  let status: AttendanceStatus = 'HADIR';
  if (session === 'MASUK') {
    const limitStr = localStorage.getItem('school_entry_limit') || '07:15';
    const [limitH, limitM] = limitStr.split(':').map(Number);
    const h = now.getHours();
    const m = now.getMinutes();

    // Ubah ke total menit dari jam 00:00 untuk perbandingan yang akurat
    const currentTotalMinutes = h * 60 + m;
    const limitTotalMinutes   = limitH * 60 + limitM;

    // Batas jam masuk sekolah: jika lewat batas (07:15) atau dini hari di luar jam sekolah pagi, dianggap TERLAMBAT
    if (currentTotalMinutes > limitTotalMinutes || currentTotalMinutes < (5 * 60)) {
      status = 'TERLAMBAT';
    } else {
      status = 'HADIR';
    }
  } else if (session === 'PULANG') {
    // Sesi PULANG: Wajib sudah melakukan scan MASUK terlebih dahulu di hari yang sama!
    const morningTx = await db.transactions
      .where('studentId')
      .equals(officialStudentId)
      .and((t) => t.attendanceDate === today && t.attendanceType === 'MASUK')
      .first();

    if (!morningTx) {
      return {
        success: false,
        message: `Scan PULANG Ditolak! Siswa [${student.name}] belum tercatat melakukan scan MASUK hari ini.`,
      };
    }

    // Jika siswa tercatat Izin, Sakit, Alfa, atau BK, tidak bisa scan pulang
    if (['IZIN', 'SAKIT', 'ALFA', 'BK'].includes(morningTx.attendanceStatus)) {
      return {
        success: false,
        message: `Scan PULANG Ditolak! Siswa [${student.name}] berstatus ${morningTx.attendanceStatus} hari ini.`,
      };
    }

    // Warisi status kedatangan paginya (HADIR atau TERLAMBAT)
    status = morningTx.attendanceStatus;
  }

  // 4. Buat objek transaksi
  const transaction: AttendanceTransaction = {
    transactionId:  generateUUID(),
    studentId:      officialStudentId,
    studentName:    student.name,
    className:      student.className,
    attendanceDate: today,
    attendanceType: session,
    method,
    attendanceStatus: status,
    deviceId,
    operatorId,
    operatorName,
    deviceTimestamp: now.toISOString(),
    syncStatus: 'PENDING',
  };

  // 5. Simpan atomik ke IndexedDB
  await db.transactions.add(transaction);

  return {
    success: true,
    message: `Absensi ${session} berhasil — [${student.name}] (${status}). Menunggu sinkronisasi.`,
    transaction,
  };
}
