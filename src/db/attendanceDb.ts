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
import { generateUUID, hashPassword, sanitizeInput, getLocalDateString } from '../lib/utils';

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

    // v3 → index studentId pada users (akun orang tua) & whatsappNumber pada students
    this.version(3).stores({
      students: 'id, name, className, barcodeValue, isActive, whatsappNumber',
      users: 'userId, username, role, assignedDeviceId, status, studentId',
      transactions:
        'transactionId, studentId, attendanceDate, attendanceType, deviceId, operatorId, syncStatus, deviceTimestamp, [studentId+attendanceDate+attendanceType]',
      deviceConfig: 'deviceId',
    });
  }
}

export const db = new AttendanceDatabase();

// ========================================================
// Seed Data Awal untuk Inisialisasi Pertama
// ========================================================

export async function initializeDatabase() {
  // Tandai bahwa inisialisasi awal sudah pernah berjalan
  const seedDone = typeof localStorage !== 'undefined' ? localStorage.getItem('school_students_seed_initialized') : null;
  const studentCount = await db.students.count();

  // --- Seed Siswa (Hanya sekali saat pertama kali aplikasi dibuka) ---
  if (!seedDone && studentCount === 0) {
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
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('school_students_seed_initialized', 'true');
    }
  } else if (!seedDone && typeof localStorage !== 'undefined') {
    localStorage.setItem('school_students_seed_initialized', 'true');
  }

  // --- Seed User (hanya akun Super Admin utama) ---
  const userCount = await db.users.count();

  if (userCount === 0) {
    const adminHash = await hashPassword('admin123');
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
    ];
    await db.users.bulkAdd(initialUsers);
  } else {
    // Hapus akun operator bawaan lama (PC-01, PC-02, PC-03) agar tidak selalu muncul
    await db.users.where('username').anyOf(['admin_pc01', 'admin_pc02', 'admin_pc03']).delete();
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

  // 1. Cek validitas data siswa di cache lokal (dukung case-insensitive, barcodeValue, & strip/spasi)
  const normClean = cleanId.toLowerCase().trim();
  const strippedClean = normClean.replace(/[-_\s]/g, '');

  // Peta unshift jika scanner USB mengirim karakter simbol akibat CapsLock/Shift aktif di laptop
  // Misal: ! -> 1, @ -> 2, # -> 3, $ -> 4, % -> 5, ^ -> 6, & -> 7, * -> 8, ( -> 9, ) -> 0, _ -> -
  const shiftMap: Record<string, string> = {
    '!': '1', '@': '2', '#': '3', '$': '4', '%': '5',
    '^': '6', '&': '7', '*': '8', '(': '9', ')': '0', '_': '-', '/': '-'
  };
  const unshiftedClean = normClean.split('').map((ch) => shiftMap[ch] || ch).join('');
  const strippedUnshifted = unshiftedClean.replace(/[-_\s]/g, '');

  let student = await db.students.get(cleanId);
  if (!student) {
    student = await db.students
      .filter((s) => {
        const sid = (s.id || '').toLowerCase().trim();
        const sbar = (s.barcodeValue || '').toLowerCase().trim();
        const sidClean = sid.replace(/[-_\s]/g, '');
        const sbarClean = sbar.replace(/[-_\s]/g, '');

        return (
          sid === normClean ||
          sbar === normClean ||
          sid === unshiftedClean ||
          sbar === unshiftedClean ||
          (strippedClean.length >= 3 && (sidClean === strippedClean || sbarClean === strippedClean)) ||
          (strippedUnshifted.length >= 3 && (sidClean === strippedUnshifted || sbarClean === strippedUnshifted))
        );
      })
      .first();
  }

  if (!student) {
    return { 
      success: false, 
      message: `Barcode/ID [${cleanId}] tidak terdaftar di sistem lokal. Pastikan siswa sudah disimpan di menu Data Siswa atau klik "Tarik dari Database".` 
    };
  }
  if (!student.isActive) {
    return { success: false, message: `Siswa [${student.name}] berstatus NONAKTIF.` };
  }

  // Gunakan ID resmi siswa yang terdaftar
  const officialStudentId = student.id;

  const now   = new Date();
  const today = getLocalDateString(now);

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
    // Sesi PULANG: Periksa riwayat kedatangan siswa hari ini
    const morningTransactions = await db.transactions
      .where('studentId')
      .equals(officialStudentId)
      .and((t) => t.attendanceDate === today && t.attendanceType === 'MASUK')
      .toArray();

    // 1. Siswa sama sekali belum memiliki catatan kedatangan
    if (morningTransactions.length === 0) {
      return {
        success: false,
        message: `Scan PULANG Ditolak! Siswa [${student.name}] belum tercatat melakukan scan MASUK hari ini.`,
      };
    }

    // 2. Cari apakah siswa pernah hadir secara fisik di madrasah (scan barcode atau berstatus HADIR/TERLAMBAT)
    const physicalArrival = morningTransactions.find(
      (t) => ['HADIR', 'TERLAMBAT'].includes(t.attendanceStatus) || t.method !== 'MANUAL'
    );
    const excuseRecord = morningTransactions.find(
      (t) => ['IZIN', 'SAKIT', 'ALFA', 'BK'].includes(t.attendanceStatus)
    );

    // 3. Jika siswa murni tidak pernah datang ke sekolah (alfa atau izin/sakit dari rumah tanpa pernah scan masuk)
    if (!physicalArrival && excuseRecord) {
      return {
        success: false,
        message: `Scan PULANG Ditolak! Siswa [${student.name}] berstatus [${excuseRecord.attendanceStatus}] (tidak hadir di madrasah hari ini).`,
      };
    }

    // 4. Jika siswa pernah hadir di pagi hari:
    // Izinkan scan pulang! Baik pulang normal di sore hari maupun pulang lebih awal karena sakit di sekolah
    if (excuseRecord) {
      // Siswa awalnya hadir lalu tercatat sakit saat jam pelajaran: tetap catat jam pulangnya
      status = excuseRecord.attendanceStatus;
    } else if (physicalArrival) {
      // Siswa hadir normal: warisi status kedatangan pagi (HADIR atau TERLAMBAT)
      status = physicalArrival.attendanceStatus;
    } else {
      status = 'HADIR';
    }

    // Auto-clean: Jika ada transaksi MASUK duplikat sebelumnya, bersihkan agar database tetap 1 baris
    if (morningTransactions.length > 1) {
      const primaryTx = physicalArrival || morningTransactions[0];
      for (const dup of morningTransactions) {
        if (dup.transactionId !== primaryTx.transactionId) {
          await db.transactions.delete(dup.transactionId);
        }
      }
    }
  }

  // 4. Buat objek transaksi (Gunakan akhiran _IN / _OUT agar sinkron dengan format server)
  const suffix = session === 'MASUK' ? '_IN' : '_OUT';
  const transaction: AttendanceTransaction = {
    transactionId:  `${generateUUID()}${suffix}`,
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

// ========================================================
// Tandai Siswa Belum Absen sebagai ALFA / IZIN DISPENSASI (Tutup Pagi)
// Mendukung pengecekan khusus: hanya siswa yang dipilih atau seluruhnya
// ========================================================

export async function bulkMarkAttendanceForUnrecorded({
  attendanceDate,
  deviceId,
  operatorId,
  operatorName,
  targetStudentIds, // jika disediakan, hanya siswa ini yang diproses
  status = 'ALFA',
  note = 'Ditandai saat penutupan absensi pagi',
}: {
  attendanceDate: string;
  deviceId: DeviceId;
  operatorId: string;
  operatorName: string;
  targetStudentIds?: string[];
  status?: AttendanceStatus;
  note?: string;
}): Promise<{ count: number; studentNames: string[] }> {
  // 1. Ambil siswa aktif
  let activeStudents = await db.students.filter((s) => s.isActive).toArray();
  if (targetStudentIds && targetStudentIds.length > 0) {
    const targetSet = new Set(targetStudentIds);
    activeStudents = activeStudents.filter((s) => targetSet.has(s.id));
  }
  if (activeStudents.length === 0) {
    return { count: 0, studentNames: [] };
  }

  // 2. Ambil seluruh transaksi MASUK pada tanggal tersebut
  const existingMorningTx = await db.transactions
    .where('attendanceDate')
    .equals(attendanceDate)
    .and((t) => t.attendanceType === 'MASUK')
    .toArray();

  const recordedStudentIds = new Set(existingMorningTx.map((t) => t.studentId));

  // 3. Filter siswa yang belum memiliki rekaman kedatangan
  const unrecordedStudents = activeStudents.filter((s) => !recordedStudentIds.has(s.id));

  if (unrecordedStudents.length === 0) {
    return { count: 0, studentNames: [] };
  }

  const now = new Date();
  const newTransactions: AttendanceTransaction[] = unrecordedStudents.map((s) => ({
    transactionId: `${generateUUID()}_IN`,
    studentId: s.id,
    studentName: s.name,
    className: s.className,
    attendanceDate,
    attendanceType: 'MASUK',
    method: 'MANUAL',
    attendanceStatus: status,
    deviceId,
    operatorId,
    operatorName,
    deviceTimestamp: now.toISOString(),
    syncStatus: 'PENDING',
    note,
  }));

  await db.transactions.bulkAdd(newTransactions);

  return {
    count: newTransactions.length,
    studentNames: unrecordedStudents.map((s) => s.name),
  };
}

/**
 * Bersihkan transaksi duplikat di IndexedDB
 * (misal jika ada dua transaksi MASUK atau PULANG untuk siswa yang sama pada tanggal yang sama akibat sync server)
 */
export async function cleanupDuplicateTransactions(): Promise<number> {
  const allTxs = await db.transactions.toArray();
  const seen = new Map<string, AttendanceTransaction>();
  const toDelete: string[] = [];

  for (const tx of allTxs) {
    const key = `${tx.studentId}_${tx.attendanceDate}_${tx.attendanceType}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, tx);
    } else {
      let keepCurrent = false;
      // Utamakan yang bukan ALFA jika yang satu ALFA
      if (existing.attendanceStatus === 'ALFA' && tx.attendanceStatus !== 'ALFA') {
        keepCurrent = true;
      } else if (tx.syncStatus === 'SYNCED' && existing.syncStatus !== 'SYNCED') {
        keepCurrent = true;
      } else if (tx.transactionId.endsWith('_IN') || tx.transactionId.endsWith('_OUT')) {
        keepCurrent = true;
      }

      if (keepCurrent) {
        toDelete.push(existing.transactionId);
        seen.set(key, tx);
      } else {
        toDelete.push(tx.transactionId);
      }
    }
  }

  if (toDelete.length > 0) {
    await db.transactions.bulkDelete(toDelete);
  }
  return toDelete.length;
}

// Alias backward-compatibility
export const bulkMarkUnrecordedAsAlfa = bulkMarkAttendanceForUnrecorded;
