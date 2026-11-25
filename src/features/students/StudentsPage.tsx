import React, { useState, useRef, useEffect, useCallback, useMemo, useDeferredValue } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getStoredUser } from '../../db/attendanceDb';
import { fetchMasterStudentsFromSheets, getAppsScriptUrl, invalidateApiCache, syncParentPortalData, syncStudentAttendanceHistory } from '../../services/syncService';
import { Swal } from '../../lib/swal';
import type { Student, UserAccount, AttendanceTransaction } from '../../types';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import {
  User,
  UserPlus,
  Search,
  Barcode,
  Phone,
  CloudDownload,
  CheckCircle2,
  AlertCircle,
  Trash2,
  QrCode,
  Printer,
  Upload,
  FileText,
  Info,
  Download,
  Pencil,
  Check,
  HeartHandshake,
  Lock,
  ArrowRightLeft,
  Wrench,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
  Filter,
  History,
  Calendar,
  TrendingUp,
  UserCheck,
  Clock,
  HeartPulse,
  UserMinus,
  FileSpreadsheet,
} from 'lucide-react';
import { renderCode128ToCanvas } from '../../lib/barcode128';
import { normalizePhoneNumber, hashPassword, verifyPassword, generateUUID, formatTime, formatDate } from '../../lib/utils';

// =========================================================
// Komponen BarcodeCanvas — render barcode Code128 asli
// 100% Offline via engine murni Code128 ISO/IEC 15417
// =========================================================
const BarcodeCanvas: React.FC<{ value: string; width?: number; height?: number }> = ({
  value,
  width = 2,
  height = 65,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;
    try {
      renderCode128ToCanvas(canvasRef.current, value.trim().toUpperCase(), {
        scale: width,
        height,
        margin: 6,
      });
    } catch (err) {
      console.warn('Barcode render warning:', err);
    }
  }, [value, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className="max-w-full rounded"
      style={{ imageRendering: 'crisp-edges' }}
    />
  );
};

// =========================================================
// Komponen KartuBarcode — UI kartu cetak siswa
// =========================================================
const KartuBarcode: React.FC<{ student: Student }> = ({ student }) => {
  const barcodeVal = student.barcodeValue || student.id;
  return (
    <div
      id="print-barcode-card"
      className="p-5 bg-white border-2 border-slate-300 rounded-2xl shadow-sm space-y-3 max-w-xs mx-auto"
      style={{ fontFamily: 'Arial, sans-serif' }}
    >
      {/* Header Kartu */}
      <div className="text-center border-b border-slate-200 pb-2">
        <p className="text-[10px] font-black text-primary-700 uppercase tracking-widest">
          MAN 1 BULUKUMBA
        </p>
        <p className="text-[9px] text-slate-500 uppercase tracking-wider">
          Kartu Absensi Siswa
        </p>
      </div>

      {/* Info Siswa */}
      <div className="text-center space-y-0.5">
        <p className="text-sm font-bold text-slate-900 leading-tight">{student.name}</p>
        <p className="text-[11px] text-slate-500 font-medium">
          {student.className}
        </p>
        <p className="text-[10px] font-mono text-slate-400">ID: {student.id}</p>
      </div>

      {/* Barcode Asli (JsBarcode Code128) */}
      <div className="flex flex-col items-center bg-white rounded-lg py-2 px-1 border border-slate-100">
        <BarcodeCanvas value={barcodeVal} width={1.8} height={60} />
        <p className="font-mono text-[11px] font-bold text-slate-800 tracking-widest mt-1">
          {barcodeVal}
        </p>
      </div>

      {/* Footer */}
      <p className="text-[9px] text-center text-slate-400">
        Scan kartu ini saat masuk & pulang sekolah
      </p>
    </div>
  );
};

// =========================================================
// Halaman Utama — Data Siswa
// =========================================================
export interface StudentsPageProps {
  currentUser?: UserAccount | null;
}

export const StudentsPage: React.FC<StudentsPageProps> = ({ currentUser: propUser }) => {
  const activeUser = propUser || getStoredUser();
  const isSuperAdmin = activeUser?.role === 'SUPER_ADMIN';
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [selectedBarcodeStudent, setSelectedBarcodeStudent] = useState<Student | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [notification, setNotification] = useState<{ success: boolean; message: string } | null>(null);

  // State Modal Keamanan Kosongkan Data Siswa
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [clearPassword, setClearPassword] = useState('');
  const [clearError, setClearError] = useState('');
  const [isClearing, setIsClearing] = useState(false);

  // State Riwayat Kehadiran Siswa
  const [selectedStudentForHistory, setSelectedStudentForHistory] = useState<Student | null>(null);
  const [isHistorySyncing, setIsHistorySyncing] = useState(false);

  // State Form Tambah Siswa
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [className, setClassName] = useState('X A');
  const [barcodeValue, setBarcodeValue] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [parentName, setParentName] = useState('');

  // State Form Edit Siswa
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editId, setEditId] = useState('');
  const [editName, setEditName] = useState('');
  const [editClassName, setEditClassName] = useState('');
  const [editBarcodeValue, setEditBarcodeValue] = useState('');
  const [editWhatsappNumber, setEditWhatsappNumber] = useState('');
  const [editParentName, setEditParentName] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);

  // State Import CSV
  const [csvText, setCsvText] = useState('');
  const [csvPreview, setCsvPreview] = useState<Student[]>([]);
  const [csvError, setCsvError] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [csvInputMode, setCsvInputMode] = useState<'FILE' | 'TEXT'>('FILE');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClearImportData = useCallback(() => {
    setCsvText('');
    setCsvPreview([]);
    setCsvError('');
    setUploadedFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // Ambil seluruh data siswa sekali dari IndexedDB (hanya re-query jika data berubah)
  const allStudents = useLiveQuery(() => db.students.toArray(), []) || [];

  // Query transaksi riwayat presensi khusus untuk siswa yang dipilih
  const studentTransactions = useLiveQuery(
    async () => {
      if (!selectedStudentForHistory) return [];
      const txs = await db.transactions
        .where('studentId')
        .equals(selectedStudentForHistory.id)
        .toArray();
      return txs.sort(
        (a, b) => new Date(b.deviceTimestamp).getTime() - new Date(a.deviceTimestamp).getTime()
      );
    },
    [selectedStudentForHistory?.id]
  ) || [];

  // Hitung ringkasan statistik kehadiran siswa yang dipilih
  const historyStats = useMemo(() => {
    if (!studentTransactions.length) {
      return { total: 0, hadir: 0, terlambat: 0, izin: 0, alfa: 0, rate: 0 };
    }
    const masukTxs = studentTransactions.filter((t) => t.attendanceType === 'MASUK');
    const hadir = masukTxs.filter((t) => t.attendanceStatus === 'HADIR').length;
    const terlambat = masukTxs.filter((t) => t.attendanceStatus === 'TERLAMBAT').length;
    const izin = masukTxs.filter((t) => ['IZIN', 'SAKIT', 'BK'].includes(t.attendanceStatus)).length;
    const alfa = masukTxs.filter((t) => t.attendanceStatus === 'ALFA').length;
    const totalHari = hadir + terlambat + izin + alfa;
    const rate = totalHari > 0 ? Math.round(((hadir + terlambat) / totalHari) * 100) : 0;
    return {
      total: studentTransactions.length,
      hadir,
      terlambat,
      izin,
      alfa,
      rate,
    };
  }, [studentTransactions]);

  // State Paginasi & Filter Kelas
  const [selectedClassFilter, setSelectedClassFilter] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL'); // ALL | AKTIF | NONAKTIF
  const [selectedWaFilter, setSelectedWaFilter] = useState('ALL'); // ALL | ADA | TIDAK
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Otomatis tarik data siswa terbaru dari database MySQL saat halaman dibuka & saat tab difokuskan
  useEffect(() => {
    fetchMasterStudentsFromSheets().catch(() => {});
    const onFocus = () => {
      fetchMasterStudentsFromSheets().catch(() => {});
    };
    window.addEventListener('focus', onFocus);
    const interval = setInterval(() => {
      fetchMasterStudentsFromSheets().catch(() => {});
    }, 15000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, []);

  // Kumpulan daftar kelas unik untuk filter cepat
  const availableClasses = useMemo(() => {
    const set = new Set<string>();
    allStudents.forEach((s) => {
      if (s.className && s.className.trim()) set.add(s.className.trim());
    });
    return Array.from(set).sort();
  }, [allStudents]);

  // Gunakan useDeferredValue agar input ketikan tetap 120 FPS tanpa lag sedikitpun
  const deferredSearchTerm = useDeferredValue(searchTerm);

  // Filter in-memory super cepat (< 1ms untuk ribuan data, bebas lag saat mengetik)
  const filteredStudents = useMemo(() => {
    let result = allStudents;

    // Filter Kelas jika dipilih
    if (selectedClassFilter !== 'ALL') {
      result = result.filter((s) => s.className === selectedClassFilter);
    }

    // Filter Status Aktif/Nonaktif
    if (selectedStatusFilter === 'AKTIF') {
      result = result.filter((s) => s.isActive);
    } else if (selectedStatusFilter === 'NONAKTIF') {
      result = result.filter((s) => !s.isActive);
    }

    // Filter Keberadaan No. WA
    if (selectedWaFilter === 'ADA') {
      result = result.filter((s) => s.whatsappNumber && s.whatsappNumber.trim());
    } else if (selectedWaFilter === 'TIDAK') {
      result = result.filter((s) => !s.whatsappNumber || !s.whatsappNumber.trim());
    }

    // Filter Kata Kunci Pencarian (menggunakan deferred value)
    if (deferredSearchTerm.trim()) {
      const term = deferredSearchTerm.toLowerCase().trim();
      result = result.filter((s) => {
        return (
          (s.name && s.name.toLowerCase().includes(term)) ||
          (s.id && s.id.toLowerCase().includes(term)) ||
          (s.barcodeValue && s.barcodeValue.toLowerCase().includes(term)) ||
          (s.className && s.className.toLowerCase().includes(term)) ||
          (s.parentName && s.parentName.toLowerCase().includes(term)) ||
          (s.whatsappNumber && s.whatsappNumber.includes(term))
        );
      });
    }

    return result;
  }, [allStudents, deferredSearchTerm, selectedClassFilter, selectedStatusFilter, selectedWaFilter]);

  // Reset halaman ke 1 saat pencarian atau filter kelas berubah
  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearchTerm, selectedClassFilter, selectedStatusFilter, selectedWaFilter, pageSize]);

  // Hitung total halaman & slice data untuk halaman aktif
  const totalFiltered = filteredStudents.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedStudents = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return filteredStudents.slice(startIndex, startIndex + pageSize);
  }, [filteredStudents, safeCurrentPage, pageSize]);

  const showNotification = useCallback((success: boolean, message: string, duration = 4500) => {
    setNotification({ success, message });
    setTimeout(() => setNotification(null), duration);
  }, []);

  // -------------------------------------------------------
  // Deteksi & Perbaikan Otomatis Posisi Kolom Siswa Tertukar
  // (Nama di Barcode, Kelas di Nama, No. WA di Kelas)
  // -------------------------------------------------------
  const isShiftedStudent = useCallback((s: Student): boolean => {
    const cleanedClassAsPhone = (s.className || '').replace(/[^0-9]/g, '');
    const classIsPhone =
      cleanedClassAsPhone.length >= 8 &&
      (cleanedClassAsPhone.startsWith('62') ||
        cleanedClassAsPhone.startsWith('08') ||
        cleanedClassAsPhone.startsWith('8'));
    const barcodeIsName =
      /[a-zA-Z]{3,}/.test(s.barcodeValue || '') &&
      (s.barcodeValue || '').trim() !== s.id.trim();

    return classIsPhone || (barcodeIsName && (!s.whatsappNumber || s.whatsappNumber.length < 5));
  }, []);

  const shiftedStudents = useMemo(() => {
    return allStudents.filter(isShiftedStudent);
  }, [allStudents, isShiftedStudent]);

  const [isFixingShifted, setIsFixingShifted] = useState(false);

  const handleFixShiftedColumns = async () => {
    if (shiftedStudents.length === 0) return;

    const confirmed = await Swal.confirm(
      `Perbaiki Posisi Kolom ${shiftedStudents.length} Siswa?`,
      `Sistem mendeteksi bahwa posisi kolom untuk <b>${shiftedStudents.length} siswa</b> saat ini tertukar akibat format file import sebelumnya:<br/><br/>
      <div style="text-align:left; font-size:12px; background:#f8fafc; padding:12px; border-radius:8px; border:1px solid #e2e8f0; line-height:1.7;">
        • <b>Nama Siswa</b> diambil dari kolom Barcode (contoh: <i>${shiftedStudents[0]?.barcodeValue || 'Nama'}</i>)<br/>
        • <b>Kelas</b> diambil dari kolom Nama Siswa (contoh: <i>${shiftedStudents[0]?.name || 'Kelas'}</i>)<br/>
        • <b>No. WA Wali</b> diambil dari kolom Kelas (contoh: <i>${shiftedStudents[0]?.className || 'No WA'}</i>)<br/>
        • <b>Kode Barcode</b> dinormalkan kembali sama dengan ID (<i>${shiftedStudents[0]?.id || 'ID'}</i>)
      </div><br/>
      Apakah Anda ingin memperbaiki dan menyelaraskannya ke database lokal & MySQL sekarang?`
    );

    if (!confirmed) return;

    setIsFixingShifted(true);
    try {
      const allDbStudents = await db.students.toArray();
      const fixedList: Student[] = [];

      for (const s of allDbStudents) {
        if (isShiftedStudent(s)) {
          const realName = (s.barcodeValue || '').trim();
          const realClass = (s.name || '').trim();
          const rawPhone = (s.className || '').trim();
          const realWa = normalizePhoneNumber(rawPhone);
          const realBarcode = s.id.trim().toUpperCase();

          fixedList.push({
            ...s,
            name: realName,
            className: realClass,
            whatsappNumber: realWa,
            barcodeValue: realBarcode,
            updatedAt: new Date().toISOString(),
          });
        }
      }

      if (fixedList.length > 0) {
        // 1. Simpan perubahan ke IndexedDB lokal browser
        await db.students.bulkPut(fixedList);

        // 2. Kirim update ke MySQL backend XAMPP via batch & direct repair
        const backendUrl = getAppsScriptUrl();
        if (backendUrl) {
          try {
            await fetch(backendUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'fixShiftedStudents' }),
            }).catch(() => {});

            const res = await fetch(backendUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'saveStudentsBatch',
                students: fixedList,
              }),
            });
            if (!res.ok) {
              for (const s of fixedList) {
                await fetch(backendUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'saveStudent', isEdit: true, ...s }),
                }).catch(() => {});
              }
            }
          } catch (_) {
            // Offline
          }
        }

        await Swal.success(
          'Berhasil Diperbaiki!',
          `Sebanyak <b>${fixedList.length}</b> data siswa telah berhasil dinormalkan posisinya (Nama Siswa, Kelas, No. WA Wali, dan Barcode) serta diselaraskan dengan database MySQL!`
        );
      }
    } catch (err: any) {
      await Swal.error('Gagal Memperbaiki', err?.message || 'Terjadi kesalahan saat memperbaiki data.');
    } finally {
      setIsFixingShifted(false);
    }
  };

  // State Akun Login Orang Tua di Modal Edit
  const [existingParentAccount, setExistingParentAccount] = useState<UserAccount | null>(null);
  const [editParentPassword, setEditParentPassword] = useState('');
  const [editCreateParentAccount, setEditCreateParentAccount] = useState(false);

  // -------------------------------------------------------
  // Buka Modal Edit Siswa
  // -------------------------------------------------------
  const handleOpenEditModal = async (student: Student) => {
    if (!isSuperAdmin) {
      await Swal.error('Akses Dibatasi', 'Hanya Super Admin yang diizinkan untuk mengubah atau mengedit data siswa.');
      return;
    }
    setEditingStudent(student);
    setEditId(student.id);
    setEditName(student.name);
    setEditClassName(student.className);
    setEditBarcodeValue(student.barcodeValue || student.id);
    setEditWhatsappNumber(student.whatsappNumber || '');
    setEditParentName(student.parentName || '');
    setEditIsActive(student.isActive);
    setEditParentPassword('');

    // Periksa apakah akun login orang tua untuk siswa ini sudah pernah dibuat
    const linked = await db.users.where('studentId').equals(student.id).first();
    setExistingParentAccount(linked || null);
    setEditCreateParentAccount(!!linked);
    setIsEditModalOpen(true);
  };

  // -------------------------------------------------------
  // Simpan Perubahan Edit Siswa & Kontak Orang Tua
  // -------------------------------------------------------
  const handleSaveEditStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editId.trim() || !editName.trim()) return;

    const cleanWa = normalizePhoneNumber(editWhatsappNumber.trim());

    const updatedStudent: Student = {
      id: editId.trim().toUpperCase(),
      name: editName.trim(),
      className: editClassName.trim(),
      barcodeValue: (editBarcodeValue.trim() || editId.trim()).toUpperCase(),
      whatsappNumber: cleanWa,
      parentName: editParentName.trim() || undefined,
      isActive: editIsActive,
      updatedAt: new Date().toISOString(),
    };

    // 1. Simpan ke IndexedDB lokal
    await db.students.put(updatedStudent);

    // 2. Kelola Akun Login Orang Tua (Khusus dibuat & dikonfirmasi Admin)
    let parentStatusMsg = '';
    if (cleanWa) {
      if (existingParentAccount) {
        // Update akun orang tua yang sudah ada
        const updates: Partial<UserAccount> = {
          phone: cleanWa,
          username: cleanWa,
          fullName: updatedStudent.parentName || existingParentAccount.fullName,
        };
        if (editParentPassword.trim().length >= 6) {
          updates.passwordHash = await hashPassword(editParentPassword.trim());
          parentStatusMsg = ' dan password akun orang tua diperbarui';
        }
        await db.users.update(existingParentAccount.userId, updates);
      } else if (editCreateParentAccount) {
        // Buat akun orang tua baru oleh admin
        const initialPass = editParentPassword.trim().length >= 6 ? editParentPassword.trim() : 'wali123';
        const newParentUser: UserAccount = {
          userId: `USR-PRNT-${generateUUID().substring(0, 8).toUpperCase()}`,
          username: cleanWa,
          fullName: updatedStudent.parentName || `Wali Murid ${updatedStudent.name}`,
          passwordHash: await hashPassword(initialPass),
          role: 'PARENT',
          assignedDeviceId: 'ALL',
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          studentId: updatedStudent.id,
          phone: cleanWa,
        };
        await db.users.add(newParentUser);
        parentStatusMsg = ` serta akun orang tua aktif dibuat (Pass: ${initialPass})`;
      }
    }

    // 3. Kirim ke Backend MySQL XAMPP jika terhubung
    const backendUrl = getAppsScriptUrl();
    if (backendUrl) {
      try {
        await fetch(backendUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'saveStudent', 
            isEdit: true,
            ...updatedStudent,
            nama_wali: updatedStudent.parentName 
          }),
        });
      } catch (_) {
        // Offline
      }
    }

    setIsEditModalOpen(false);
    setEditingStudent(null);
    showNotification(
      true,
      `Data siswa [${updatedStudent.name}] berhasil disimpan${parentStatusMsg}!`
    );
  };

  // -------------------------------------------------------
  // Tarik Data dari Backend MySQL XAMPP
  // -------------------------------------------------------
  const handleFetchFromDatabase = async () => {
    setIsFetching(true);
    setNotification(null);
    const res = await fetchMasterStudentsFromSheets();
    setIsFetching(false);
    if (res.success) {
      if (res.total === 0) {
        showNotification(true, 'Database server kosong (0 siswa). Data siswa di browser berhasil disinkronkan dan dikosongkan!');
      } else {
        showNotification(true, `Berhasil menyinkronkan ${res.total} data siswa dari database backend!`);
      }
    } else {
      showNotification(false, `Gagal menarik data: ${res.error || 'Pastikan backend XAMPP aktif di Pengaturan.'}`);
    }
  };

  // -------------------------------------------------------
  // Kosongkan Seluruh Data Siswa di Browser Lokal & Server MySQL
  // Dilindungi Otentikasi Password Sesuai Akun Login
  // -------------------------------------------------------
  const handleOpenClearModal = () => {
    if (!isSuperAdmin) {
      Swal.error('Akses Dibatasi', 'Hanya Super Admin yang diizinkan untuk mengosongkan data siswa.');
      return;
    }
    setClearPassword('');
    setClearError('');
    setIsClearModalOpen(true);
  };

  const handleConfirmClearAll = async (e: React.FormEvent) => {
    e.preventDefault();
    setClearError('');

    const cleanPass = clearPassword.trim();
    if (!cleanPass) {
      setClearError('Silakan masukkan password akun Anda untuk melanjutkan.');
      return;
    }

    const user = activeUser || getStoredUser();
    if (!user) {
      setClearError('Sesi login tidak terdeteksi. Silakan muat ulang halaman.');
      return;
    }

    // 1. Verifikasi Password terhadap akun yang sedang login di database lokal
    const freshUser = (await db.users.where('username').equals(user.username).first()) || user;
    const isPasswordValid = await verifyPassword(cleanPass, freshUser.passwordHash);

    if (!isPasswordValid) {
      setClearError(`Password untuk akun @${user.username} (${user.role}) salah. Pengosongan data ditolak demi keamanan.`);
      return;
    }

    setIsClearing(true);

    try {
      // 2. Hapus seluruh data siswa di database server MySQL XAMPP
      const backendUrl = getAppsScriptUrl();
      if (backendUrl) {
        try {
          const res = await fetch(backendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'clearAllStudents',
              username: user.username,
              password: cleanPass,
            }),
          });
          const json = await res.json().catch(() => null);
          if (res.status === 401 || (json && !json.success && json.error?.includes('Password'))) {
            setClearError(json?.error || 'Password verifikasi ditolak oleh server database.');
            setIsClearing(false);
            return;
          }
        } catch (serverErr) {
          console.warn('Gagal menghubungi backend untuk clearAllStudents:', serverErr);
        }
      }

      // 3. Kosongkan database lokal IndexedDB
      await db.students.clear();

      // 4. Set flag agar data siswa contoh (dummy seed) tidak otomatis di-generate ulang
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('school_students_seed_initialized', 'true');
      }

      invalidateApiCache('getInitialData');

      setIsClearModalOpen(false);
      setClearPassword('');
      setClearError('');
      await Swal.success(
        'Data Siswa Berhasil Dikosongkan',
        'Seluruh data master siswa telah dikosongkan secara permanen baik dari database server MySQL maupun penyimpanan browser.'
      );
    } catch (err: any) {
      setClearError(`Terjadi kesalahan: ${err?.message || err}`);
    } finally {
      setIsClearing(false);
    }
  };

  // -------------------------------------------------------
  // Auto-sync barcodeValue dengan ID jika belum diubah
  // -------------------------------------------------------
  const handleIdChange = (val: string) => {
    setId(val);
    if (!barcodeValue || barcodeValue === id) {
      setBarcodeValue(val);
    }
  };

  // -------------------------------------------------------
  // Simpan Siswa Baru
  // -------------------------------------------------------
  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !name.trim()) return;

    const finalId = id.trim().toUpperCase();
    const finalBarcode = (barcodeValue.trim() || finalId).toUpperCase();
    const cleanWa = normalizePhoneNumber(whatsappNumber.trim());

    // ⛔ Cek duplikat ID di IndexedDB lokal terlebih dahulu
    const existing = await db.students.get(finalId);
    if (existing) {
      await Swal.error(
        'ID Sudah Digunakan!',
        `ID "${finalId}" sudah dimiliki oleh siswa lain (${existing.name}). Gunakan ID yang berbeda untuk mencegah penimpaan data.`
      );
      return;
    }

    const newStudent = {
      id: finalId,
      name: name.trim(),
      className: className.trim(),
      barcodeValue: finalBarcode,
      whatsappNumber: cleanWa,
      parentName: parentName.trim() || undefined,
      isActive: true,
      updatedAt: new Date().toISOString(),
    };

    await db.students.put(newStudent);

    // Simpan ke Backend MySQL XAMPP jika terhubung
    const backendUrl = getAppsScriptUrl();
    if (backendUrl) {
      try {
        const res = await fetch(backendUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'saveStudent',
            isEdit: false,
            ...newStudent,
            nama_wali: newStudent.parentName
          }),
        });
        if (!res.ok && res.status === 409) {
          const json = await res.json();
          await Swal.error('ID Duplikat di Server!', json.error || 'ID ini sudah digunakan oleh siswa lain di database server.');
          // Rollback dari IndexedDB lokal
          await db.students.delete(finalId);
          return;
        }
      } catch (_) {
        // Offline — data tetap tersimpan lokal
      }
    }

    setIsAddModalOpen(false);
    setId(''); setName(''); setBarcodeValue(''); setWhatsappNumber(''); setParentName('');
    await Swal.success('Berhasil Disimpan', `Siswa ${newStudent.name} dengan Barcode ${newStudent.barcodeValue} berhasil ditambahkan.`);
  };

  // -------------------------------------------------------
  // Hapus Siswa
  // -------------------------------------------------------
  const handleDeleteStudent = async (studentId: string, studentName: string) => {
    if (!isSuperAdmin) {
      await Swal.error('Akses Dibatasi', 'Hanya Super Admin yang diizinkan untuk menghapus data siswa.');
      return;
    }
    const confirmed = await Swal.confirm(
      'Hapus Siswa?',
      `Data siswa <b>${studentName}</b> (${studentId}) akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.`
    );
    if (!confirmed) return;
    await db.students.delete(studentId);
    const backendUrl = getAppsScriptUrl();
    if (backendUrl) {
      try {
        await fetch(backendUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'deleteStudent', id: studentId }),
        });
      } catch (_) {}
    }
    Swal.toast(`Siswa ${studentName} berhasil dihapus.`, 'success');
  };

  // -------------------------------------------------------
  // Unduh Gambar Barcode sebagai file PNG
  // -------------------------------------------------------
  const handleDownloadBarcodeImage = () => {
    if (!selectedBarcodeStudent) return;
    const cardEl = document.getElementById('print-barcode-card');
    if (!cardEl) return;
    const canvas = cardEl.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `Barcode_${selectedBarcodeStudent.id}_${selectedBarcodeStudent.name.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  const handlePrintCard = () => {
    if (!selectedBarcodeStudent) return;
    const cardEl = document.getElementById('print-barcode-card');
    if (!cardEl) {
      window.print();
      return;
    }

    // Ambil data gambar barcode langsung dari elemen canvas
    const canvas = cardEl.querySelector('canvas') as HTMLCanvasElement | null;
    const barcodeDataUrl = canvas ? canvas.toDataURL('image/png') : '';
    const barcodeVal = selectedBarcodeStudent.barcodeValue || selectedBarcodeStudent.id;

    const printWindow = window.open('', '_blank', 'width=650,height=750');
    if (!printWindow) {
      window.print();
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Kartu Absensi - ${selectedBarcodeStudent.name}</title>
        <style>
          @page {
            size: auto;
            margin: 10mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            font-family: Arial, Helvetica, sans-serif;
            background: #ffffff;
            margin: 0;
            padding: 20px;
            display: flex;
            justify-content: center;
            align-items: flex-start;
          }
          .card {
            width: 85.6mm;
            height: 54mm;
            border: 2px solid #0f172a;
            border-radius: 8px;
            padding: 8px 12px;
            background: #ffffff;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            text-align: center;
            box-shadow: none;
          }
          .header {
            border-bottom: 2px solid #16a34a;
            padding-bottom: 3px;
          }
          .header .school {
            font-size: 11px;
            font-weight: 900;
            color: #15803d;
            letter-spacing: 1px;
            text-transform: uppercase;
            margin: 0;
          }
          .header .subtitle {
            font-size: 8px;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin: 1px 0 0 0;
          }
          .student-info {
            margin: 2px 0;
          }
          .student-name {
            font-size: 12px;
            font-weight: bold;
            color: #0f172a;
            margin: 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .student-detail {
            font-size: 9px;
            color: #475569;
            font-weight: 600;
            margin: 1px 0 0 0;
          }
          .barcode-box {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 1px 0;
          }
          .barcode-img {
            max-width: 95%;
            height: 22mm;
            image-rendering: crisp-edges;
            display: block;
          }
          .barcode-code {
            font-family: 'Courier New', Courier, monospace;
            font-size: 11px;
            font-weight: bold;
            color: #0f172a;
            letter-spacing: 2px;
            margin: 2px 0 0 0;
          }
          .footer {
            font-size: 7.5px;
            color: #94a3b8;
            margin: 0;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <p class="school">MAN 1 BULUKUMBA</p>
            <p class="subtitle">Kartu Absensi Siswa</p>
          </div>
          <div class="student-info">
            <p class="student-name">${selectedBarcodeStudent.name}</p>
            <p class="student-detail">${selectedBarcodeStudent.className} &bull; ID: ${selectedBarcodeStudent.id}</p>
          </div>
          <div class="barcode-box">
            ${barcodeDataUrl ? `<img class="barcode-img" src="${barcodeDataUrl}" />` : ''}
            <p class="barcode-code">${barcodeVal}</p>
          </div>
          <p class="footer">Scan kartu ini saat masuk &amp; pulang madrasah</p>
        </div>
        <script>
          window.onload = function() {
            window.focus();
            window.print();
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // -------------------------------------------------------
  // Riwayat Kehadiran Siswa: Buka Modal & Sinkronisasi
  // -------------------------------------------------------
  const handleOpenAttendanceHistory = (student: Student) => {
    setSelectedStudentForHistory(student);
    if (student.id) {
      setIsHistorySyncing(true);
      syncStudentAttendanceHistory(student.id)
        .catch((err) => console.warn('Sync student history background error:', err))
        .finally(() => setIsHistorySyncing(false));
    }
  };

  // -------------------------------------------------------
  // Riwayat Kehadiran Siswa: Export ke CSV
  // -------------------------------------------------------
  const handleExportHistoryCsv = () => {
    if (!selectedStudentForHistory) return;
    if (studentTransactions.length === 0) {
      Swal.toast('Belum ada data riwayat presensi untuk diekspor.', 'warning');
      return;
    }

    const headers = [
      'No',
      'ID',
      'Nama Siswa',
      'Kelas',
      'Tanggal',
      'Waktu',
      'Sesi Absensi',
      'Status Kehadiran',
      'Metode Absensi',
      'ID Perangkat / Operator',
      'Catatan / Keterangan',
    ];

    const rows = studentTransactions.map((tx, idx) => {
      const timeStr = tx.deviceTimestamp
        ? new Date(tx.deviceTimestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : '-';
      return [
        idx + 1,
        `"${selectedStudentForHistory.id}"`,
        `"${selectedStudentForHistory.name.replace(/"/g, '""')}"`,
        `"${selectedStudentForHistory.className.replace(/"/g, '""')}"`,
        `"${tx.attendanceDate}"`,
        `"${timeStr}"`,
        `"${tx.attendanceType === 'MASUK' ? 'Masuk' : 'Pulang'}"`,
        `"${tx.attendanceStatus}"`,
        `"${tx.method || 'BARCODE'}"`,
        `"${tx.operatorId || tx.deviceId || '-'}"`,
        `"${(tx.note || '').replace(/"/g, '""')}"`,
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = selectedStudentForHistory.name.replace(/[^a-zA-Z0-9]/g, '_');
    link.href = url;
    link.download = `Riwayat_Absensi_${selectedStudentForHistory.id}_${safeName}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    Swal.toast('Riwayat absensi berhasil diunduh sebagai file CSV!', 'success');
  };

  // -------------------------------------------------------
  // Riwayat Kehadiran Siswa: Export ke Excel (.xlsx)
  // -------------------------------------------------------
  const handleExportHistoryExcel = () => {
    if (!selectedStudentForHistory) return;
    if (studentTransactions.length === 0) {
      Swal.toast('Belum ada data riwayat presensi untuk diekspor.', 'warning');
      return;
    }

    const xlsxLib = (window as any).XLSX;
    if (!xlsxLib) {
      // Fallback ke CSV jika library SheetJS belum termuat
      handleExportHistoryCsv();
      return;
    }

    try {
      const dataRows: any[][] = [
        ['LAPORAN RIWAYAT KEHADIRAN SISWA'],
        ['MADRASAH ALIYAH NEGERI 1 BULUKUMBA'],
        ['Jalan K.H. Abd Karim Nomor 67 Tanete Bulukumba (0413) 2586253'],
        [],
        ['ID', selectedStudentForHistory.id, '', 'Total Presensi', historyStats.total],
        ['Nama Siswa', selectedStudentForHistory.name, '', 'Hadir Tepat', historyStats.hadir],
        ['Kelas', selectedStudentForHistory.className, '', 'Terlambat', historyStats.terlambat],
        ['No. WA Wali', selectedStudentForHistory.whatsappNumber || '-', '', 'Izin / Sakit', historyStats.izin],
        ['Nama Wali', selectedStudentForHistory.parentName || '-', '', 'Alfa / Tanpa Ket.', historyStats.alfa],
        ['Tanggal Cetak', new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }), '', 'Tingkat Kehadiran', `${historyStats.rate}%`],
        [],
        ['No', 'Tanggal', 'Waktu', 'Sesi', 'Status Kehadiran', 'Metode Presensi', 'ID Perangkat / Operator', 'Catatan'],
      ];

      studentTransactions.forEach((tx, idx) => {
        const timeStr = tx.deviceTimestamp
          ? new Date(tx.deviceTimestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          : '-';
        dataRows.push([
          idx + 1,
          tx.attendanceDate,
          timeStr,
          tx.attendanceType === 'MASUK' ? 'Masuk' : 'Pulang',
          tx.attendanceStatus,
          tx.method || 'BARCODE',
          tx.operatorId || tx.deviceId || '-',
          tx.note || '-',
        ]);
      });

      const ws = xlsxLib.utils.aoa_to_sheet(dataRows);
      const wb = xlsxLib.utils.book_new();
      xlsxLib.utils.book_append_sheet(wb, ws, 'Riwayat Presensi');

      // Set lebar kolom otomatis agar rapi saat dibuka di Microsoft Excel
      ws['!cols'] = [
        { wch: 6 },  // No
        { wch: 14 }, // Tanggal
        { wch: 12 }, // Waktu
        { wch: 10 }, // Sesi
        { wch: 18 }, // Status
        { wch: 16 }, // Metode
        { wch: 22 }, // Perangkat
        { wch: 30 }, // Catatan
      ];

      const safeName = selectedStudentForHistory.name.replace(/[^a-zA-Z0-9]/g, '_');
      xlsxLib.writeFile(wb, `Riwayat_Absensi_${selectedStudentForHistory.id}_${safeName}.xlsx`);
      Swal.toast('Riwayat absensi berhasil diunduh sebagai file Excel (.xlsx)!', 'success');
    } catch (err: any) {
      console.error('Export Excel error:', err);
      handleExportHistoryCsv();
    }
  };

  // -------------------------------------------------------
  // Riwayat Kehadiran Siswa: Cetak / Simpan ke PDF
  // -------------------------------------------------------
  const handlePrintHistoryPdf = () => {
    if (!selectedStudentForHistory) return;

    const printWin = window.open('', '_blank', 'width=900,height=950');
    if (!printWin) {
      window.print();
      return;
    }

    const todayDate = new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const statusBadge = (status: string) => {
      switch (status) {
        case 'HADIR':
          return '<span style="color:#15803d;background:#dcfce7;padding:2px 8px;border-radius:9999px;font-weight:bold;font-size:11px;">HADIR TEPAT</span>';
        case 'TERLAMBAT':
          return '<span style="color:#b45309;background:#fef3c7;padding:2px 8px;border-radius:9999px;font-weight:bold;font-size:11px;">TERLAMBAT</span>';
        case 'IZIN':
          return '<span style="color:#1d4ed8;background:#dbeafe;padding:2px 8px;border-radius:9999px;font-weight:bold;font-size:11px;">IZIN</span>';
        case 'SAKIT':
          return '<span style="color:#7c3aed;background:#ede9fe;padding:2px 8px;border-radius:9999px;font-weight:bold;font-size:11px;">SAKIT</span>';
        case 'ALFA':
          return '<span style="color:#b91c1c;background:#fee2e2;padding:2px 8px;border-radius:9999px;font-weight:bold;font-size:11px;">ALFA</span>';
        case 'BK':
          return '<span style="color:#c2410c;background:#ffedd5;padding:2px 8px;border-radius:9999px;font-weight:bold;font-size:11px;">KONSELING BK</span>';
        default:
          return `<span style="font-size:11px;">${status}</span>`;
      }
    };

    const rowsHtml = studentTransactions.length > 0
      ? studentTransactions
          .map((tx, idx) => {
            const timeStr = tx.deviceTimestamp
              ? new Date(tx.deviceTimestamp).toLocaleTimeString('id-ID', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })
              : '-';
            const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
            return `
              <tr style="background-color: ${bg}; border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 7px 10px; text-align: center; font-size: 11px;">${idx + 1}</td>
                <td style="padding: 7px 10px; font-size: 11px; font-weight: 600;">${tx.attendanceDate}</td>
                <td style="padding: 7px 10px; font-size: 11px; text-align: center;">${timeStr}</td>
                <td style="padding: 7px 10px; font-size: 11px; text-align: center; font-weight: bold; color: ${tx.attendanceType === 'MASUK' ? '#15803d' : '#2563eb'};">
                  ${tx.attendanceType === 'MASUK' ? 'MASUK' : 'PULANG'}
                </td>
                <td style="padding: 7px 10px; text-align: center;">${statusBadge(tx.attendanceStatus)}</td>
                <td style="padding: 7px 10px; font-size: 11px; text-align: center;">${tx.method || 'BARCODE'}</td>
                <td style="padding: 7px 10px; font-size: 10px; color: #475569;">${tx.operatorId || tx.deviceId || '-'}</td>
                <td style="padding: 7px 10px; font-size: 11px; color: #64748b;">${tx.note || '-'}</td>
              </tr>
            `;
          })
          .join('')
      : `
        <tr>
          <td colspan="8" style="padding: 24px; text-align: center; color: #64748b; font-size: 12px;">
            Belum ada catatan riwayat kehadiran yang tersimpan untuk siswa ini.
          </td>
        </tr>
      `;

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Riwayat Kehadiran - ${selectedStudentForHistory.name} (${selectedStudentForHistory.id})</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 12mm 15mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            color: #0f172a;
            margin: 0;
            padding: 10px;
            background: #ffffff;
            font-size: 12px;
          }
          /* KOP SURAT MADRASAH */
          .kop {
            text-align: center;
            border-bottom: 3px double #0f172a;
            padding-bottom: 8px;
            margin-bottom: 16px;
          }
          .kop h3 {
            margin: 0;
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0.5px;
            color: #047857;
            text-transform: uppercase;
          }
          .kop h2 {
            margin: 2px 0;
            font-size: 16px;
            font-weight: 900;
            letter-spacing: 1px;
            color: #065f46;
            text-transform: uppercase;
          }
          .kop p {
            margin: 2px 0 0;
            font-size: 10px;
            color: #475569;
          }

          /* JUDUL DOKUMEN */
          .doc-title {
            text-align: center;
            margin-bottom: 16px;
          }
          .doc-title h1 {
            font-size: 14px;
            font-weight: 800;
            text-transform: uppercase;
            text-decoration: underline;
            margin: 0;
            color: #0f172a;
            letter-spacing: 0.5px;
          }
          .doc-title p {
            margin: 3px 0 0;
            font-size: 10px;
            color: #64748b;
          }

          /* INFORMASI SISWA */
          .info-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 16px;
            background: #f8fafc;
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid #e2e8f0;
          }
          .info-table td {
            padding: 6px 12px;
            font-size: 11px;
          }

          /* KARTU STATISTIK */
          .stats-grid {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 8px;
            margin-bottom: 16px;
          }
          .stat-card {
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 8px 6px;
            text-align: center;
          }
          .stat-card .val {
            font-size: 16px;
            font-weight: 800;
          }
          .stat-card .lbl {
            font-size: 9px;
            text-transform: uppercase;
            font-weight: 600;
            margin-top: 2px;
          }

          /* TABEL DATA */
          .table-data {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          .table-data th {
            background-color: #047857;
            color: #ffffff;
            padding: 8px 10px;
            font-size: 11px;
            font-weight: 700;
            text-align: left;
            border: 1px solid #047857;
          }
          .table-data th.center {
            text-align: center;
          }

          /* TANDA TANGAN */
          .signature-section {
            margin-top: 30px;
            display: flex;
            justify-content: space-between;
            page-break-inside: avoid;
          }
          .signature-box {
            width: 200px;
            text-align: center;
            font-size: 11px;
          }
          .signature-space {
            height: 60px;
          }
          .signature-name {
            font-weight: bold;
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <!-- KOP RESMI MADRASAH -->
        <div class="kop">
          <h3>KEMENTERIAN AGAMA REPUBLIK INDONESIA</h3>
          <h2>MADRASAH ALIYAH NEGERI 1 BULUKUMBA</h2>
          <p>Jalan K.H. Abd Karim Nomor 67 Tanete Bulukumba (0413) 2586253</p>
        </div>

        <!-- JUDUL -->
        <div class="doc-title">
          <h1>LEMBAR RIWAYAT KEHADIRAN SISWA</h1>
          <p>Dicetak pada: ${todayDate} &bull; Sistem Presensi Digital Madrasah</p>
        </div>

        <!-- INFO SISWA -->
        <table class="info-table">
          <tr>
            <td style="width: 15%; font-weight: bold; color: #475569;">Nama Siswa</td>
            <td style="width: 35%; font-weight: bold; color: #047857; font-size: 13px;">${selectedStudentForHistory.name}</td>
            <td style="width: 18%; font-weight: bold; color: #475569;">No. WA Wali</td>
            <td style="width: 32%;">${selectedStudentForHistory.whatsappNumber || '-'}</td>
          </tr>
          <tr>
            <td style="font-weight: bold; color: #475569;">ID</td>
            <td style="font-family: monospace; font-weight: bold;">${selectedStudentForHistory.id}</td>
            <td style="font-weight: bold; color: #475569;">Nama Orang Tua / Wali</td>
            <td>${selectedStudentForHistory.parentName || '-'}</td>
          </tr>
          <tr>
            <td style="font-weight: bold; color: #475569;">Kelas</td>
            <td style="font-weight: 600;">${selectedStudentForHistory.className}</td>
            <td style="font-weight: bold; color: #475569;">Kode Barcode</td>
            <td style="font-family: monospace;">${selectedStudentForHistory.barcodeValue || selectedStudentForHistory.id}</td>
          </tr>
        </table>

        <!-- STATISTIK RINGKAS -->
        <div class="stats-grid">
          <div class="stat-card" style="background: #f0fdf4; border-color: #bbf7d0;">
            <div class="val" style="color: #15803d;">${historyStats.hadir}</div>
            <div class="lbl" style="color: #166534;">Hadir Tepat</div>
          </div>
          <div class="stat-card" style="background: #fffbeb; border-color: #fde68a;">
            <div class="val" style="color: #b45309;">${historyStats.terlambat}</div>
            <div class="lbl" style="color: #92400e;">Terlambat</div>
          </div>
          <div class="stat-card" style="background: #eff6ff; border-color: #bfdbfe;">
            <div class="val" style="color: #1d4ed8;">${historyStats.izin}</div>
            <div class="lbl" style="color: #1e40af;">Izin / Sakit</div>
          </div>
          <div class="stat-card" style="background: #fef2f2; border-color: #fecaca;">
            <div class="val" style="color: #b91c1c;">${historyStats.alfa}</div>
            <div class="lbl" style="color: #991b1b;">Alfa</div>
          </div>
          <div class="stat-card" style="background: #ecfdf5; border-color: #a7f3d0;">
            <div class="val" style="color: #047857;">${historyStats.rate}%</div>
            <div class="lbl" style="color: #065f46;">% Kehadiran</div>
          </div>
        </div>

        <!-- TABEL RINCIAN LOG PRESENSI -->
        <table class="table-data">
          <thead>
            <tr>
              <th class="center" style="width: 4%;">No</th>
              <th style="width: 14%;">Tanggal</th>
              <th class="center" style="width: 10%;">Waktu</th>
              <th class="center" style="width: 10%;">Sesi</th>
              <th class="center" style="width: 15%;">Status</th>
              <th class="center" style="width: 12%;">Metode</th>
              <th style="width: 15%;">Perangkat / Operator</th>
              <th style="width: 20%;">Catatan</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <!-- TANDA TANGAN PENGESAHAN -->
        <div class="signature-section">
          <div class="signature-box">
            <p>Mengetahui,<br/>Orang Tua / Wali Siswa</p>
            <div class="signature-space"></div>
            <p class="signature-name">${selectedStudentForHistory.parentName || '.....................................'}</p>
          </div>
          <div class="signature-box">
            <p>Bulukumba, ${todayDate}<br/>Wali Kelas / Petugas Absensi</p>
            <div class="signature-space"></div>
            <p class="signature-name">${activeUser?.fullName || 'Petugas Absensi MAN 1'}</p>
            <p style="font-size: 10px; color: #64748b; margin-top: 2px;">NIP. .....................................</p>
          </div>
        </div>

        <script>
          window.onload = function() {
            window.focus();
            window.print();
          };
        </script>
      </body>
      </html>
    `);
    printWin.document.close();
  };

  // -------------------------------------------------------
  // Parser Cerdas Excel & CSV (Mendukung Format Sekolah & Auto-Detect Header)
  // Format Standar: ID| Nama Siswa | Kelas | No WA Wali | Nama Wali (Opsional)
  // -------------------------------------------------------
  const parseSmartRows = useCallback((rawRows: any[][]): Student[] => {
    if (!rawRows || rawRows.length === 0) return [];

    let startIdx = 0;
    const firstRow = rawRows[0].map((c) => String(c ?? '').toLowerCase().trim());

    let colNis = -1;
    let colBarcode = -1;
    let colNama = -1;
    let colKelas = -1;
    let colWa = -1;
    let colWali = -1;

    const hasHeader = firstRow.some(
      (h) =>
        h.includes('ID') ||
        h === 'id' ||
        h.includes('nama') ||
        h.includes('name') ||
        h.includes('kelas') ||
        h.includes('class') ||
        h.includes('wa') ||
        h.includes('hp') ||
        h.includes('telepon') ||
        h.includes('phone')
    );

    if (hasHeader) {
      startIdx = 1;
      firstRow.forEach((h, idx) => {
        if ((h.includes('ID') || h === 'id' || h.includes('nomor induk')) && colNis === -1) {
          colNis = idx;
        } else if (h.includes('barcode') && colBarcode === -1) {
          colBarcode = idx;
        } else if (
          (h.includes('wali') ||
            h.includes('orang tua') ||
            h.includes('orangtua') ||
            h.includes('parent') ||
            h.includes('ayah') ||
            h.includes('ibu')) &&
          colWali === -1
        ) {
          colWali = idx;
        } else if ((h.includes('nama') || h.includes('siswa') || h.includes('name')) && colNama === -1) {
          colNama = idx;
        } else if (
          (h.includes('kelas') || h.includes('rombel') || h.includes('class') || h.includes('tingkat')) &&
          colKelas === -1
        ) {
          colKelas = idx;
        } else if (
          (h.includes('wa') ||
            h.includes('hp') ||
            h.includes('telepon') ||
            h.includes('telp') ||
            h.includes('phone') ||
            h.includes('kontak')) &&
          colWa === -1
        ) {
          colWa = idx;
        }
      });
    }

    const isHeaderValid = colNis !== -1 && colNama !== -1;
    const results: Student[] = [];

    for (let i = startIdx; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row || row.length === 0) continue;

      let ID = '';
      let name = '';
      let className = '';
      let barcode = '';
      let wa = '';
      let parent = '';

      if (isHeaderValid) {
        ID = String(row[colNis] ?? '').trim();
        name = String(row[colNama] ?? '').trim();
        className = colKelas !== -1 ? String(row[colKelas] ?? '').trim() : '';
        barcode = colBarcode !== -1 ? String(row[colBarcode] ?? '').trim() : '';
        wa = colWa !== -1 ? String(row[colWa] ?? '').trim() : '';
        parent = colWali !== -1 ? String(row[colWali] ?? '').trim() : '';
      } else {
        // Deteksi Posisi Kolom Standar Pengguna MAN 1 Bulukumba:
        // Col 0 = ID, Col 1 = Nama Siswa, Col 2 = Kelas, Col 3 = No WA Wali, Col 4 = Nama Wali (Opsional)
        // Barcode selalu diselaraskan dengan ID kartu
        const c0 = String(row[0] ?? '').trim();
        const c1 = String(row[1] ?? '').trim();
        const c2 = String(row[2] ?? '').trim();
        const c3 = String(row[3] ?? '').trim();
        const c4 = String(row[4] ?? '').trim();

        // Cek jika baris khusus format lawas yang menyelipkan barcode di kolom 1
        const isLegacyBarcodeFormat =
          c1 &&
          c1.toUpperCase() === c0.toUpperCase() &&
          !/[0-9]{8,}/.test(c2);

        if (isLegacyBarcodeFormat) {
          ID = c0;
          barcode = c1 || c0;
          name = c2;
          className = c3;
          wa = c4;
        } else {
          // Format Standar Pengguna:
          // ID | Nama Siswa | Kelas | No WA Wali | Nama Wali
          ID = c0;
          name = c1;
          className = c2;
          wa = c3;
          parent = c4;
          barcode = c0; // Default barcode kartu sama dengan ID
        }
      }

      if (!ID || !name) continue;

      const cleanWa = normalizePhoneNumber(wa);
      const finalBarcode = (barcode || ID).toUpperCase();

      results.push({
        id: ID.toUpperCase(),
        name: name,
        className: className,
        barcodeValue: finalBarcode,
        whatsappNumber: cleanWa,
        parentName: parent || undefined,
        isActive: true,
        updatedAt: new Date().toISOString(),
      });
    }

    return results;
  }, []);

  // -------------------------------------------------------
  // Parse CSV (Mendukung Separator Koma, Titik Koma, & Tab)
  // -------------------------------------------------------
  const parseCsv = useCallback(
    (text: string): Student[] => {
      const lines = text.trim().split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
      if (lines.length === 0) return [];

      const firstLine = lines[0];
      const semiCount = (firstLine.match(/;/g) || []).length;
      const tabCount = (firstLine.match(/\t/g) || []).length;
      const commaCount = (firstLine.match(/,/g) || []).length;

      let sep = ',';
      if (semiCount > commaCount && semiCount > tabCount) sep = ';';
      else if (tabCount > commaCount && tabCount > semiCount) sep = '\t';

      const rawRows: string[][] = [];
      for (const line of lines) {
        const pattern = new RegExp(`(?:^|${sep})(\"(?:[^\"]|\"\")*\"|[^${sep}]*)`, 'g');
        const cols: string[] = [];
        let match;
        while ((match = pattern.exec(line)) !== null) {
          let val = match[1] || '';
          val = val.trim();
          if (val.startsWith('"') && val.endsWith('"')) {
            val = val.substring(1, val.length - 1).replace(/""/g, '"');
          }
          cols.push(val.trim());
        }
        if (cols.length > 0) {
          rawRows.push(cols);
        }
      }

      return parseSmartRows(rawRows);
    },
    [parseSmartRows]
  );

  const handleCsvTextChange = (text: string) => {
    setCsvText(text);
    setCsvError('');
    if (!text.trim()) {
      setCsvPreview([]);
      return;
    }
    try {
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        setCsvError('Tidak ada baris siswa yang valid ditemukan. Periksa format data CSV.');
        setCsvPreview([]);
      } else {
        setCsvPreview(parsed);
      }
    } catch (err: any) {
      setCsvError('Format data CSV tidak valid: ' + (err?.message || err));
      setCsvPreview([]);
    }
  };

  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);

    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    const win = window as any;

    if (isExcel && win.XLSX) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
          const workbook = win.XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rawRows: any[][] = win.XLSX.utils.sheet_to_json(worksheet, { header: 1 });

          if (!rawRows || rawRows.length === 0) {
            setCsvError('File Excel kosong atau tidak memiliki data.');
            setCsvPreview([]);
            return;
          }

          const parsed = parseSmartRows(rawRows);

          if (parsed.length === 0) {
            setCsvError('Tidak ditemukan baris siswa yang valid di file Excel.');
            setCsvPreview([]);
          } else {
            setCsvError('');
            setCsvPreview(parsed);
          }
        } catch (err: any) {
          setCsvError(`Gagal membaca file Excel: ${err.message || err}`);
          setCsvPreview([]);
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    // Default: baca file teks CSV biasa
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      handleCsvTextChange(text);
    };
    reader.readAsText(file, 'UTF-8');
  };

  // Download template CSV / Excel kosong sesuai format sekolah pengguna
  const handleDownloadTemplate = () => {
    const content = [
      'ID,Nama Siswa,Kelas,No WA Wali,Nama Wali',
      'M1B-24-001,A. Huzaema Syekh,XII A,081356215865,Bpk. Syekh',
      'M1B-24-002,Adha Nur Islami,XII A,089542895193,Ibu Fatimah',
      '# Kolom: ID (wajib), Nama Siswa (wajib), Kelas, No WA Wali (wajib untuk notifikasi), Nama Wali (opsional)',
    ].join('\r\n');
    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template-import-siswa-MAN1.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportCsv = async () => {
    if (csvPreview.length === 0) return;
    setIsImporting(true);
    try {
      // 1. Simpan ke IndexedDB lokal (bulk put)
      await db.students.bulkPut(csvPreview);

      // 2. Simpan ke Backend MySQL XAMPP via batch
      const backendUrl = getAppsScriptUrl();
      if (backendUrl) {
        try {
          const res = await fetch(backendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'saveStudentsBatch', students: csvPreview }),
          });
          if (!res.ok) {
            // Fallback: simpan satu per satu jika batch endpoint tidak merespon
            for (const s of csvPreview) {
              await fetch(backendUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'saveStudent', isEdit: true, ...s }),
              }).catch(() => {});
            }
          }
        } catch (_) {
          // Offline
        }
      }

      setIsCsvModalOpen(false);
      handleClearImportData();
      showNotification(true, `Berhasil mengimpor ${csvPreview.length} siswa ke database!`);
    } catch (err: any) {
      showNotification(false, `Gagal import: ${err?.message || err}`);
    } finally {
      setIsImporting(false);
    }
  };

  // =========================================================
  // RENDER
  // =========================================================
  return (
    <div className="space-y-6">
      {/* Header & Tombol Aksi */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-content-primary">Data Siswa</h2>
        </div>
        <div className={isSuperAdmin ? "grid grid-cols-3 sm:flex sm:flex-wrap sm:items-center gap-2" : "flex items-center gap-2"}>
          {isSuperAdmin && shiftedStudents.length > 0 && (
            <Button
              onClick={handleFixShiftedColumns}
              isLoading={isFixingShifted}
              leftIcon={<Wrench className="w-4 h-4" />}
              className="col-span-3 sm:col-auto bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-sm"
              title="Perbaiki kolom Nama Siswa, Kelas, No WA Wali, dan Barcode yang tertukar akibat format import sebelumnya"
            >
              Perbaiki Posisi Kolom ({shiftedStudents.length} Siswa)
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleFetchFromDatabase}
            isLoading={isFetching}
            leftIcon={<CloudDownload className="w-4 h-4 text-primary-600" />}
            title="Sinkronkan data siswa dari Database MySQL XAMPP"
            className="text-xs sm:text-sm"
          >
            <span className="hidden sm:inline">Tarik dari </span>Database
          </Button>
          {isSuperAdmin && allStudents.length > 0 && (
            <Button
              variant="outline"
              onClick={handleOpenClearModal}
              leftIcon={<Trash2 className="w-4 h-4 text-red-600" />}
              className="hidden sm:inline-flex border-red-200 text-red-700 hover:bg-red-50 font-semibold"
              title="Kosongkan seluruh data siswa dari database server MySQL & web browser (Memerlukan verifikasi password)"
            >
              Kosongkan Data
            </Button>
          )}
          {isSuperAdmin && (
            <>
              <Button
                variant="outline"
                onClick={() => setIsCsvModalOpen(true)}
                leftIcon={<Upload className="w-4 h-4 text-emerald-600" />}
                className="text-xs sm:text-sm"
              >
                <span className="hidden sm:inline">Import </span>Excel/CSV
              </Button>
              <Button
                onClick={() => setIsAddModalOpen(true)}
                leftIcon={<UserPlus className="w-4 h-4" />}
                className="text-xs sm:text-sm"
              >
                <span className="hidden sm:inline">Tambah </span>Siswa
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Notifikasi */}
      {notification && (
        <div
          className={`p-3 border rounded-card text-xs font-semibold flex items-center gap-2 ${
            notification.success
              ? 'bg-status-success-bg border-status-success/30 text-status-success'
              : 'bg-status-danger-bg border-status-danger/30 text-status-danger'
          }`}
        >
          {notification.success ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Tabel Siswa dengan Paginasi Cepat */}
      <Card>
        <CardHeader className="flex-col md:flex-row gap-3 md:items-center justify-between">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CardTitle>Daftar Siswa</CardTitle>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-primary-50 text-primary-700 border border-primary-200">
                {totalFiltered} Siswa
              </span>
            </div>
            <CardDescription className="text-xs text-content-secondary md:hidden text-right">
              Total <strong>{allStudents.length}</strong> terdaftar
            </CardDescription>
          </div>
          <div className="hidden md:block">
            <CardDescription className="text-xs text-content-secondary mt-0.5">
              Total <strong>{allStudents.length} siswa aktif</strong> terdaftar di sistem.
            </CardDescription>
          </div>

          {/* Bar Filter & Pencarian Cepat */}
          <div className="flex flex-col gap-2 w-full md:w-auto">
            {/* Baris 1: Filter Dropdown (Kelas, Status, WA) */}
            <div className="grid grid-cols-3 sm:flex sm:flex-row sm:flex-wrap items-center gap-2">
              {/* Filter Dropdown Kelas */}
              {availableClasses.length > 0 && (
                <select
                  value={selectedClassFilter}
                  onChange={(e) => setSelectedClassFilter(e.target.value)}
                  className="bg-canvas text-xs rounded-button border border-border px-2 py-2 text-content-primary focus:outline-none focus:border-primary-600 font-semibold truncate"
                  title="Filter berdasarkan Kelas"
                >
                  <option value="ALL">Semua Kelas</option>
                  {availableClasses.map((cls) => (
                    <option key={cls} value={cls}>
                      {cls}
                    </option>
                  ))}
                </select>
              )}

              {/* Filter Status Aktif/Nonaktif */}
              <select
                value={selectedStatusFilter}
                onChange={(e) => setSelectedStatusFilter(e.target.value)}
                className="bg-canvas text-xs rounded-button border border-border px-2 py-2 text-content-primary focus:outline-none focus:border-primary-600 font-semibold"
                title="Filter berdasarkan Status Siswa"
              >
                <option value="ALL">Semua Status</option>
                <option value="AKTIF">Aktif</option>
                <option value="NONAKTIF">Nonaktif</option>
              </select>

              {/* Filter Keberadaan No. WA */}
              <select
                value={selectedWaFilter}
                onChange={(e) => setSelectedWaFilter(e.target.value)}
                className="bg-canvas text-xs rounded-button border border-border px-2 py-2 text-content-primary focus:outline-none focus:border-primary-600 font-semibold"
                title="Filter berdasarkan Nomor WA Orang Tua"
              >
                <option value="ALL">Semua WA</option>
                <option value="ADA">Ada No. WA</option>
                <option value="TIDAK">Tanpa No. WA</option>
              </select>
            </div>

            {/* Baris 2: Input Pencarian */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Cari nama, ID, barcode, kelas, WA..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-canvas text-xs rounded-button border border-border pl-9 pr-8 py-2 focus:outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600 p-0.5 rounded"
                  title="Hapus pencarian"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {allStudents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <FileText className="w-10 h-10 text-gray-300" />
              <p className="text-sm font-semibold text-content-secondary">Belum ada data siswa</p>
              <p className="text-xs text-content-tertiary max-w-xs">
                Tambah siswa satu per satu, import dari file CSV/Excel, atau tarik dari database MySQL XAMPP.
              </p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
              <Search className="w-8 h-8 text-gray-300" />
              <p className="text-xs font-bold text-content-primary">Tidak ada siswa yang sesuai</p>
              <p className="text-[11px] text-content-tertiary">
                Tidak ditemukan data dengan kata kunci "{searchTerm}"
                {selectedClassFilter !== 'ALL' ? ` di kelas ${selectedClassFilter}` : ''}
                {selectedStatusFilter !== 'ALL' ? ` · status ${selectedStatusFilter.toLowerCase()}` : ''}
                {selectedWaFilter !== 'ALL' ? ` · WA ${selectedWaFilter === 'ADA' ? 'terdaftar' : 'tidak ada'}` : ''}.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedClassFilter('ALL');
                  setSelectedStatusFilter('ALL');
                  setSelectedWaFilter('ALL');
                }}
                className="mt-2 text-xs"
              >
                Reset Pencarian & Semua Filter
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-gray-50/75 text-[11px] font-semibold text-content-secondary uppercase tracking-wider">
                    <th className="py-3 px-4">#</th>
                    <th className="py-3 px-4">ID</th>
                    <th className="py-3 px-4">Kode Barcode</th>
                    <th className="py-3 px-4">Nama Siswa</th>
                    <th className="py-3 px-4">Kelas</th>
                    <th className="py-3 px-4">No. WA Wali</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedStudents.map((student, idx) => {
                    const rowNumber = (safeCurrentPage - 1) * pageSize + idx + 1;
                    return (
                      <tr key={student.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-2.5 px-4 text-content-tertiary font-mono">{rowNumber}</td>
                        <td className="py-2.5 px-4 font-mono font-bold text-slate-800">
                          {student.id}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-primary-700 font-semibold">
                          <div className="flex items-center gap-1.5">
                            <Barcode className="w-4 h-4 text-primary-400 shrink-0" />
                            <span>{student.barcodeValue || student.id}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-4 font-semibold">
                          <button
                            type="button"
                            onClick={() => handleOpenAttendanceHistory(student)}
                            title="Klik untuk melihat riwayat kehadiran, export Excel/CSV & cetak PDF"
                            className="group text-left inline-flex items-center gap-1.5 font-bold text-primary-700 hover:text-primary-800 hover:underline transition-colors cursor-pointer"
                          >
                            <span>{student.name}</span>
                            <History className="w-3.5 h-3.5 text-primary-500 opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-all shrink-0" />
                          </button>
                        </td>
                        <td className="py-2.5 px-4 text-content-secondary">{student.className}</td>
                        <td className="py-2.5 px-4 font-mono text-content-secondary">
                          {student.whatsappNumber ? (
                            <div>
                              <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                                <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>{student.whatsappNumber}</span>
                              </div>
                              {student.parentName && (
                                <p className="text-[10px] text-content-tertiary truncate max-w-[140px]">
                                  Wali: {student.parentName}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              <AlertCircle className="w-2.5 h-2.5" />
                              Belum Ada WA
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          <Badge variant={student.isActive ? 'success' : 'default'} dot>
                            {student.isActive ? 'Aktif' : 'Nonaktif'}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenAttendanceHistory(student)}
                              title="Lihat Riwayat Kehadiran Siswa"
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                            >
                              <History className="w-4 h-4" />
                            </button>
                            {isSuperAdmin && (
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(student)}
                                title="Edit Data Siswa & Kontak Orang Tua"
                                className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-md transition-colors"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setSelectedBarcodeStudent(student)}
                              title="Lihat & Cetak Kartu Barcode"
                              className="p-1.5 text-primary-600 hover:bg-primary-50 rounded-md transition-colors"
                            >
                              <QrCode className="w-4 h-4" />
                            </button>
                            {isSuperAdmin && (
                              <button
                                type="button"
                                onClick={() => handleDeleteStudent(student.id, student.name)}
                                title="Hapus Siswa"
                                className="p-1.5 text-red-500 hover:bg-red-50 rounded-md transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Bar Kontrol Paginasi */}
          {filteredStudents.length > 0 && (
            <div className="p-3.5 sm:px-6 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-content-secondary select-none bg-slate-50/50">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span>Menampilkan</span>
                <span className="font-bold text-content-primary">
                  {(safeCurrentPage - 1) * pageSize + 1} - {Math.min(safeCurrentPage * pageSize, totalFiltered)}
                </span>
                <span>dari</span>
                <span className="font-bold text-content-primary">{totalFiltered} siswa</span>
                {totalFiltered < allStudents.length && (
                  <span className="text-[11px] text-content-tertiary">
                    (disaring dari {allStudents.length} total siswa)
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 flex-wrap">
                {/* Pilihan Jumlah Baris per Halaman */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-content-tertiary">Baris:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="bg-white border border-border rounded-lg text-xs py-1 px-2 focus:outline-none focus:border-primary-600 font-semibold"
                  >
                    <option value={15}>15</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>

                {/* Tombol Navigasi Halaman */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(1)}
                    disabled={safeCurrentPage === 1}
                    className="p-1.5 rounded-lg border border-border bg-white text-content-primary hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    title="Halaman Pertama"
                  >
                    <ChevronsLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safeCurrentPage === 1}
                    className="p-1.5 rounded-lg border border-border bg-white text-content-primary hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    title="Halaman Sebelumnya"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>

                  <span className="px-2.5 py-1 font-bold text-xs text-content-primary bg-white rounded-lg border border-border">
                    {safeCurrentPage} / {totalPages}
                  </span>

                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safeCurrentPage === totalPages}
                    className="p-1.5 rounded-lg border border-border bg-white text-content-primary hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    title="Halaman Berikutnya"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={safeCurrentPage === totalPages}
                    className="p-1.5 rounded-lg border border-border bg-white text-content-primary hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    title="Halaman Terakhir"
                  >
                    <ChevronsRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===================================================
          Modal Tambah Siswa Baru
          =================================================== */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Tambah Siswa Baru"
        description="Data tersimpan ke IndexedDB lokal & langsung dikirim ke MySQL XAMPP."
      >
        <form onSubmit={handleAddStudent} className="space-y-4">
          <Input
            label="ID Siswa"
            placeholder="Contoh: M1B-26-009"
            value={id}
            onChange={(e) => handleIdChange(e.target.value)}
            required
            helperText="Nomor ID Siswa — harus unik"
          />
          <Input
            label="Kode Barcode Kartu"
            placeholder="Otomatis sama dengan ID jika tidak diubah"
            value={barcodeValue}
            onChange={(e) => setBarcodeValue(e.target.value)}
            leftIcon={<Barcode className="w-4 h-4" />}
            helperText="Nilai yang terbaca saat kartu di-scan scanner"
            required
          />
          <Input
            label="Nama Lengkap"
            placeholder="Contoh: Muhammad Rizky"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            label="Kelas"
            placeholder="Contoh: X A, X MIPA 1, XI IPS 2"
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            required
          />
          <div className="p-3 bg-primary-50/70 border border-primary-200 rounded-xl space-y-3">
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-primary-700" />
              <p className="text-xs font-bold text-primary-900">
                Target Notifikasi Orang Tua / Wali
              </p>
            </div>
         
            <Input
              label="Nama Orang Tua / Wali (Opsional)"
              placeholder="Contoh: Bapak H. Sulaiman"
              value={parentName}
              onChange={(e) => setParentName(e.target.value)}
            />
            <Input
              label="No. WhatsApp Orang Tua (Opsional)"
              placeholder="Contoh: 081234567890"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              leftIcon={<Phone className="w-4 h-4 text-emerald-600" />}
            />
          </div>

          {/* Preview barcode langsung */}
          {(barcodeValue || id) && (
            <div className="bg-gray-50 rounded-xl p-3 flex flex-col items-center gap-1 border border-border">
              <p className="text-[10px] text-content-tertiary uppercase tracking-wider font-semibold">Preview Barcode</p>
              <BarcodeCanvas value={(barcodeValue || id).toUpperCase()} width={1.6} height={48} />
              <p className="font-mono text-xs font-bold text-slate-700">{(barcodeValue || id).toUpperCase()}</p>
            </div>
          )}

          <div className="pt-3 flex justify-end gap-2 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Batal
            </Button>
            <Button type="submit">Simpan Siswa</Button>
          </div>
        </form>
      </Modal>

      {/* ===================================================
          Modal Edit Data Siswa & Kontak Orang Tua
          =================================================== */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingStudent(null);
        }}
        title="Edit Data Siswa & Kontak Orang Tua"
        description="Perubahan akan tersimpan di database lokal & MySQL XAMPP."
      >
        <form onSubmit={handleSaveEditStudent} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="ID Siswa"
              value={editId}
              disabled
              helperText="IDSiswa resmi"
            />
            <Input
              label="Kelas"
              placeholder="Contoh: X MIPA 1"
              value={editClassName}
              onChange={(e) => setEditClassName(e.target.value)}
              required
            />
          </div>

          <Input
            label="Nama Lengkap Siswa"
            placeholder="Nama Siswa"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            required
          />

          <Input
            label="Kode Barcode Kartu"
            placeholder="Kode Barcode"
            value={editBarcodeValue}
            onChange={(e) => setEditBarcodeValue(e.target.value)}
            leftIcon={<Barcode className="w-4 h-4" />}
            helperText="Kode pada kartu absensi siswa (Code 128)"
            required
          />

          {/* Konfigurasi Orang Tua & Akun Login */}
          <div className="p-3.5 bg-primary-50/70 border border-primary-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HeartHandshake className="w-4 h-4 text-primary-700" />
                <p className="text-xs font-bold text-primary-950">
                  Data Orang Tua &amp; Akun Login PWA
                </p>
              </div>
              {existingParentAccount ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary-800 bg-primary-100 px-2 py-0.5 rounded-full border border-primary-200">
                  <CheckCircle2 className="w-3 h-3 text-primary-600" />
                  Akun Login Aktif
                </span>
              ) : (
                <span className="text-[10px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 font-semibold">
                  Belum Ada Akun Login
                </span>
              )}
            </div>

            <p className="text-[11px] text-primary-800 leading-relaxed">
              Nomor ini digunakan sebagai ID login orang tua untuk memantau absensi siswa <strong>{editName}</strong> melalui aplikasi.
            </p>

            <Input
              label="Nama Lengkap Orang Tua / Wali"
              placeholder="Contoh: Bapak H. Sulaiman"
              value={editParentName}
              onChange={(e) => setEditParentName(e.target.value)}
            />

            <Input
              label="Nomor WhatsApp / HP Orang Tua (ID Login)"
              placeholder="Contoh: 081234567890"
              value={editWhatsappNumber}
              onChange={(e) => setEditWhatsappNumber(e.target.value)}
              leftIcon={<Phone className="w-4 h-4 text-primary-600" />}
              helperText="Format: 08xxxxxxxxxx (Nomor aktif untuk login & notifikasi)"
            />

            {/* Buat atau Atur Password Akun Login */}
            <div className="pt-2 border-t border-primary-200 space-y-2">
              {!existingParentAccount ? (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editCreateParentAccount}
                    onChange={(e) => setEditCreateParentAccount(e.target.checked)}
                    className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-xs font-bold text-primary-900">
                    Aktifkan &amp; Buat Akun Login untuk Orang Tua Ini
                  </span>
                </label>
              ) : null}

              {(existingParentAccount || editCreateParentAccount) && (
                <div className="space-y-1.5 pt-1">
                  <Input
                    type="password"
                    label={existingParentAccount ? "Atur Ulang Password Orang Tua (Opsional)" : "Password Login Awal Orang Tua"}
                    placeholder={existingParentAccount ? "Kosongkan jika tidak ingin mengubah password" : "Minimal 6 karakter (default: wali123)"}
                    value={editParentPassword}
                    onChange={(e) => setEditParentPassword(e.target.value)}
                    leftIcon={<Lock className="w-4 h-4 text-primary-600" />}
                    helperText={
                      existingParentAccount
                        ? `ID Login saat ini: ${existingParentAccount.phone || existingParentAccount.username}. Masukkan password baru jika orang tua lupa kata sandi.`
                        : "Berikan password ini kepada orang tua agar dapat masuk di tab Masuk Orang Tua."
                    }
                  />
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-content-primary mb-1">
              Status Keaktifan Siswa
            </label>
            <select
              value={editIsActive ? '1' : '0'}
              onChange={(e) => setEditIsActive(e.target.value === '1')}
              className="w-full bg-surface text-content-primary text-xs rounded-button border border-border px-3 py-2.5 focus:outline-none focus:border-primary-600"
            >
              <option value="1">Aktif (Dapat Melakukan Absensi)</option>
              <option value="0">Nonaktif (Siswa Pindah / Lulus)</option>
            </select>
          </div>

          {/* Preview Barcode */}
          {editBarcodeValue && (
            <div className="bg-gray-50 rounded-xl p-3 flex flex-col items-center gap-1 border border-border">
              <p className="text-[10px] text-content-tertiary uppercase tracking-wider font-semibold">Preview Barcode</p>
              <BarcodeCanvas value={editBarcodeValue.toUpperCase()} width={1.6} height={45} />
              <p className="font-mono text-xs font-bold text-slate-700">{editBarcodeValue.toUpperCase()}</p>
            </div>
          )}

          <div className="pt-3 flex justify-end gap-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsEditModalOpen(false);
                setEditingStudent(null);
              }}
            >
              Batal
            </Button>
            <Button type="submit" className="font-bold text-white bg-primary-600 hover:bg-primary-700">
              Simpan Perubahan
            </Button>
          </div>
        </form>
      </Modal>

      {/* ===================================================
          Modal Import Siswa (Excel & CSV Massal)
          =================================================== */}
      <Modal
        isOpen={isCsvModalOpen}
        onClose={() => {
          setIsCsvModalOpen(false);
          handleClearImportData();
        }}
        title="Import Data Siswa (Excel & CSV)"
        description="Format Excel (.xlsx / .xls) atau CSV (.csv)"
        maxWidth="2xl"
      >
        <div className="space-y-3.5">
          {/* Panduan Ringkas Kolom Standar */}
          <div className="bg-emerald-50/90 border border-emerald-200/90 rounded-xl p-3 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5 font-bold text-emerald-950">
                <FileSpreadsheet className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>Format Standar Urutan Kolom</span>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="inline-flex items-center justify-center gap-1.5 text-[11px] font-bold text-emerald-900 hover:text-emerald-950 bg-emerald-200/70 hover:bg-emerald-200 px-2.5 py-1 rounded-lg border border-emerald-300 transition-colors w-fit"
              >
                <Download className="w-3.5 h-3.5 text-emerald-800" />
                <span>Download Contoh Template</span>
              </button>
            </div>

            {/* Grid Kolom */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[11px]">
              <div className="bg-white/95 px-2 py-1.5 rounded-lg border border-emerald-100 shadow-2xs">
                <span className="text-[10px] text-emerald-700 font-bold block">Kolom A (Wajib)</span>
                <span className="font-semibold text-slate-800">ID</span>
              </div>
              <div className="bg-white/95 px-2 py-1.5 rounded-lg border border-emerald-100 shadow-2xs">
                <span className="text-[10px] text-emerald-700 font-bold block">Kolom B (Wajib)</span>
                <span className="font-semibold text-slate-800">Nama Siswa</span>
              </div>
              <div className="bg-white/95 px-2 py-1.5 rounded-lg border border-emerald-100 shadow-2xs">
                <span className="text-[10px] text-emerald-700 font-bold block">Kolom C</span>
                <span className="font-semibold text-slate-800">Kelas</span>
              </div>
              <div className="bg-white/95 px-2 py-1.5 rounded-lg border border-emerald-100 shadow-2xs">
                <span className="text-[10px] text-emerald-700 font-bold block">Kolom D (WA)</span>
                <span className="font-semibold text-slate-800">No. WA Wali</span>
              </div>
              <div className="col-span-2 sm:col-span-1 bg-white/95 px-2 py-1.5 rounded-lg border border-emerald-100 shadow-2xs">
                <span className="text-[10px] text-emerald-700 font-bold block">Kolom E (Opsional)</span>
                <span className="font-semibold text-slate-800">Nama Wali</span>
              </div>
            </div>
            <p className="text-[10px] text-emerald-800 mt-2 leading-tight">
              &bull; <b>Barcode</b> otomatis disamakan dengan ID. Header / judul kolom otomatis dideteksi.
            </p>
          </div>

          {/* Tab Pemilih Metode Input */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => setCsvInputMode('FILE')}
              className={`py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all ${
                csvInputMode === 'FILE'
                  ? 'bg-white text-emerald-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload File Excel / CSV</span>
            </button>
            <button
              type="button"
              onClick={() => setCsvInputMode('TEXT')}
              className={`py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all ${
                csvInputMode === 'TEXT'
                  ? 'bg-white text-emerald-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Tempel Teks Manual</span>
            </button>
          </div>

          {/* Area Input File / Teks */}
          {csvInputMode === 'FILE' ? (
            <div>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50/20 hover:bg-emerald-50/50 rounded-xl p-4 sm:p-5 text-center cursor-pointer transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  onChange={handleCsvFileUpload}
                  className="hidden"
                />
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-2">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                {uploadedFileName ? (
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-900 truncate max-w-xs mx-auto">
                      📄 {uploadedFileName}
                    </p>
                    <p className="text-[11px] text-emerald-700 font-semibold">
                      Klik di sini untuk mengganti file
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-800">
                      Klik untuk memilih file Excel (.xlsx / .xls) atau CSV
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Mendukung file langsung dari Microsoft Excel atau Google Sheets
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-content-secondary">
                Tempel baris data CSV (pisah koma, titik koma, atau tab):
              </label>
              <textarea
                className="w-full h-28 text-xs font-mono bg-slate-50 border border-border rounded-xl p-3 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 resize-none leading-relaxed"
                placeholder={"M1B-24-001,Ahmad Fauzi,X MIPA 1,081234567891,Bpk. Fauzi\nM1B-24-002,Anisa Rahmawati,X MIPA 1,081234567892,Ibu Siti"}
                value={csvText}
                onChange={(e) => handleCsvTextChange(e.target.value)}
              />
              <p className="text-[10px] text-slate-400 text-right">
                {csvText.trim() ? `${csvText.trim().split(/\r?\n/).length} baris teks terdeteksi` : 'Tempel baris CSV di atas'}
              </p>
            </div>
          )}

          {/* Pesan Kesalahan / Error */}
          {csvError && (
            <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <span className="leading-tight">{csvError}</span>
            </div>
          )}

          {/* Preview Tabel Hasil Deteksi */}
          {csvPreview.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-800">
                    Preview: <span className="text-emerald-700 font-extrabold">{csvPreview.length} Siswa Siap Diimpor</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleClearImportData}
                  className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 hover:underline"
                >
                  Reset Data
                </button>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-40 sm:max-h-52 overflow-y-auto">
                <table className="w-full text-[11px] text-left border-collapse">
                  <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 border-b border-slate-200 text-[10px] font-bold uppercase">
                    <tr>
                      <th className="py-2 px-2.5">#</th>
                      <th className="py-2 px-2.5">ID</th>
                      <th className="py-2 px-2.5">Nama Siswa</th>
                      <th className="py-2 px-2.5">Kelas</th>
                      <th className="py-2 px-2.5">No. WA</th>
                      <th className="py-2 px-2.5">Nama Wali</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {csvPreview.map((s, idx) => (
                      <tr key={s.id + idx} className="hover:bg-slate-50">
                        <td className="py-1.5 px-2.5 text-slate-400 font-mono text-[10px]">{idx + 1}</td>
                        <td className="py-1.5 px-2.5 font-mono font-bold text-slate-800">{s.id}</td>
                        <td className="py-1.5 px-2.5 font-semibold text-slate-900 truncate max-w-[130px] sm:max-w-none">{s.name}</td>
                        <td className="py-1.5 px-2.5 text-slate-600">{s.className || '-'}</td>
                        <td className="py-1.5 px-2.5 font-mono text-emerald-700">{s.whatsappNumber || '-'}</td>
                        <td className="py-1.5 px-2.5 text-slate-500">{s.parentName || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tombol Aksi Bawah */}
          <div className="pt-3 grid grid-cols-2 sm:flex sm:justify-end gap-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsCsvModalOpen(false);
                handleClearImportData();
              }}
              className="justify-center text-xs font-semibold w-full sm:w-auto"
            >
              Batal
            </Button>
            <Button
              type="button"
              onClick={handleImportCsv}
              isLoading={isImporting}
              disabled={csvPreview.length === 0}
              leftIcon={<Upload className="w-4 h-4" />}
              className="justify-center text-xs font-bold bg-primary-600 hover:bg-primary-700 text-white w-full sm:w-auto"
            >
              Import {csvPreview.length > 0 ? `(${csvPreview.length} Siswa)` : ''}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ===================================================
          Modal Konfirmasi Keamanan Password — Kosongkan Seluruh Data Siswa
          =================================================== */}
      <Modal
        isOpen={isClearModalOpen}
        onClose={() => {
          if (!isClearing) {
            setIsClearModalOpen(false);
            setClearPassword('');
            setClearError('');
          }
        }}
        title="Verifikasi Keamanan: Kosongkan Data Siswa"
      >
        <form onSubmit={handleConfirmClearAll} className="space-y-4">
          {/* Warning Banner */}
          <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-2xl flex items-start gap-3 text-rose-950">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-bold">PERINGATAN: TINDAKAN BERSIFAT PERMANEN!</p>
              <p className="text-[11px] text-rose-800 leading-relaxed">
                Tindakan ini akan mengosongkan <strong>seluruh data master siswa ({allStudents.length} siswa)</strong> baik dari <strong>Database Server MySQL (XAMPP)</strong> maupun penyimpanan browser lokal.
              </p>
            </div>
          </div>

          {/* User Account Info */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5 text-slate-700">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Akun Anda:</span>
              <span className="font-bold text-slate-900">{activeUser?.fullName || activeUser?.username || 'Administrator'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Role / Hak Akses:</span>
              <span className="font-semibold font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[10px]">
                {activeUser?.role || 'SUPER_ADMIN'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Username Login:</span>
              <span className="font-mono text-slate-800">@{activeUser?.username || 'admin'}</span>
            </div>
          </div>

          {/* Error Message */}
          {clearError && (
            <div className="p-3 bg-red-50 border border-red-300 rounded-xl text-red-900 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{clearError}</span>
            </div>
          )}

          {/* Input Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1.5">
              Masukkan Password Akun Anda (@{activeUser?.username || 'admin'})
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="password"
                placeholder="Ketik password akun login Anda untuk verifikasi..."
                value={clearPassword}
                onChange={(e) => setClearPassword(e.target.value)}
                disabled={isClearing}
                required
                className="w-full bg-white text-xs rounded-xl border border-slate-300 pl-9 pr-3 py-2.5 focus:outline-none focus:border-rose-600 focus:ring-1 focus:ring-rose-600 text-slate-900 shadow-xs"
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              Demi mencegah penyalahgunaan data siswa, tindakan pengosongan ini wajib diverifikasi menggunakan password akun yang sedang login.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setIsClearModalOpen(false);
                setClearPassword('');
                setClearError('');
              }}
              disabled={isClearing}
            >
              Batal
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isClearing || !clearPassword.trim()}
              isLoading={isClearing}
              leftIcon={<Trash2 className="w-4 h-4" />}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-sm"
            >
              {isClearing ? 'Mengosongkan Data...' : 'Kosongkan Data Permanen'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ===================================================
          Modal Preview & Cetak Kartu Barcode
          =================================================== */}
      {selectedBarcodeStudent && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedBarcodeStudent(null)}
          title="Kartu Barcode Siswa"
          description="Kartu ini memuat barcode Code128 asli yang bisa discan. Klik Cetak untuk print."
        >
          <div className="space-y-4">
            {/* Kartu Cetak */}
            <KartuBarcode student={selectedBarcodeStudent} />

            {/* Info */}
            <div className="flex items-start gap-2 text-xs text-content-secondary bg-gray-50 border border-border rounded-lg p-3">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-primary-400" />
              <div>
                <p className="font-semibold text-content-primary">Tips Cetak Kartu:</p>
                <ul className="mt-1 space-y-0.5 text-[11px] list-disc list-inside text-content-secondary">
                  <li>Gunakan kertas putih tebal (230 gsm) agar barcode kontras</li>
                  <li>Set printer scale ke <strong>100%</strong> (jangan "fit to page")</li>
                  <li>Laminating kartu agar tahan lama</li>
                  <li>Test scan setelah cetak sebelum dibagikan ke siswa</li>
                </ul>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedBarcodeStudent(null)}
              >
                Tutup
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleDownloadBarcodeImage}
                leftIcon={<Download className="w-4 h-4 text-emerald-600" />}
              >
                Unduh PNG
              </Button>
              <Button
                type="button"
                onClick={handlePrintCard}
                leftIcon={<Printer className="w-4 h-4" />}
              >
                Cetak Kartu
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ===================================================
          Modal Riwayat Kehadiran Siswa
          (Detail, Statistik, Export CSV/Excel & Cetak PDF)
          =================================================== */}
      {selectedStudentForHistory && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedStudentForHistory(null)}
          title="Riwayat Kehadiran Siswa"
          description="Rincian catatan presensi, profil siswa & wali, , serta opsi cetak & export berkas."
          maxWidth="max-w-4xl"
          maxHeight="max-h-[calc(100dvh-175px)] sm:max-h-[82vh]"
        >
          <div className="space-y-3.5">
            {/* Profil Lengkap & Detail Siswa */}
            <div className="p-3 bg-gradient-to-r from-emerald-50 via-teal-50 to-slate-50 border border-emerald-200/80 rounded-2xl shadow-xs space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-primary-600 text-white font-bold flex items-center justify-center text-base shadow-sm shrink-0 border border-white/20">
                    {selectedStudentForHistory.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-slate-900 text-sm sm:text-base leading-tight">
                        {selectedStudentForHistory.name}
                      </h3>
                      <Badge variant={selectedStudentForHistory.isActive ? 'success' : 'default'} dot>
                        {selectedStudentForHistory.isActive ? 'Aktif' : 'Nonaktif'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-600 mt-1 flex-wrap">
                      <span className="bg-white/80 px-2 py-0.5 rounded border border-slate-200 font-mono text-[11px]">
                        ID: <strong className="text-slate-800">{selectedStudentForHistory.id}</strong>
                      </span>
                      <span className="bg-white/80 px-2 py-0.5 rounded border border-slate-200 font-sans text-[11px]">
                        Kelas: <strong className="text-primary-800">{selectedStudentForHistory.className}</strong>
                      </span>
                      <span className="bg-white/80 px-2 py-0.5 rounded border border-slate-200 font-mono text-[11px] flex items-center gap-1 text-slate-700">
                        <Barcode className="w-3 h-3 text-slate-500" />
                        {selectedStudentForHistory.barcodeValue || selectedStudentForHistory.id}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status Sync */}
                <div className="text-left sm:text-right shrink-0">
                  {isHistorySyncing ? (
                    <div className="inline-flex items-center gap-1.5 text-xs text-primary-700 bg-primary-50 px-2.5 py-1 rounded-full border border-primary-200 animate-pulse">
                      <CloudDownload className="w-3.5 h-3.5 animate-spin text-primary-600" />
                      <span>Sinkronisasi database...</span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1 text-[11px] text-slate-500 bg-white/70 px-2.5 py-1 rounded-full border border-slate-200">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      <span>Realtime ({studentTransactions.length} log)</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Data Detail Orang Tua / Wali Siswa */}
              <div className="pt-2 border-t border-emerald-200/60 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {/* Nama Orang Tua / Wali */}
                <div className="flex items-center gap-2 p-2 bg-white/80 rounded-xl border border-slate-200/80">
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                    <User className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase leading-tight">Orang Tua / Wali Siswa</p>
                    <p className="font-bold text-slate-800 truncate">
                      {selectedStudentForHistory.parentName?.trim() || <span className="italic text-slate-400 font-normal">Belum diisi</span>}
                    </p>
                  </div>
                </div>

                {/* No WhatsApp / Kontak Wali */}
                <div className="flex items-center justify-between gap-2 p-2 bg-white/80 rounded-xl border border-slate-200/80">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                      <Phone className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-slate-400 font-semibold uppercase leading-tight">Kontak WhatsApp Wali</p>
                      <p className="font-mono font-bold text-slate-800 truncate">
                        {selectedStudentForHistory.whatsappNumber || <span className="italic text-slate-400 font-normal font-sans">Belum ada nomor</span>}
                      </p>
                    </div>
                  </div>
                  {selectedStudentForHistory.whatsappNumber && (
                    <a
                      href={`https://wa.me/${(() => {
                        const cl = selectedStudentForHistory.whatsappNumber.replace(/[^0-9]/g, '');
                        return cl.startsWith('0') ? '62' + cl.substring(1) : cl;
                      })()}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] flex items-center gap-1 shrink-0 transition-colors shadow-xs"
                      title="Kirim pesan WhatsApp ke Wali"
                    >
                      <Phone className="w-2.5 h-2.5" />
                      <span>Chat WA</span>
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* 
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 select-none">
              <div className="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-xl text-center">
                <div className="flex items-center justify-center gap-1 text-emerald-700 text-xs font-semibold mb-0.5">
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Hadir Tepat</span>
                </div>
                <div className="text-lg font-black text-emerald-800">{historyStats.hadir}</div>
                <div className="text-[10px] text-emerald-600">Presensi Tepat</div>
              </div>

              <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-xl text-center">
                <div className="flex items-center justify-center gap-1 text-amber-700 text-xs font-semibold mb-0.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Terlambat</span>
                </div>
                <div className="text-lg font-black text-amber-800">{historyStats.terlambat}</div>
                <div className="text-[10px] text-amber-600">Lewat Batas Jam</div>
              </div>

              <div className="p-2.5 bg-blue-50/70 border border-blue-200 rounded-xl text-center">
                <div className="flex items-center justify-center gap-1 text-blue-700 text-xs font-semibold mb-0.5">
                  <HeartPulse className="w-3.5 h-3.5" />
                  <span>Izin / Sakit</span>
                </div>
                <div className="text-lg font-black text-blue-800">{historyStats.izin}</div>
                <div className="text-[10px] text-blue-600">Dengan Surat / Ket</div>
              </div>

              <div className="p-2.5 bg-rose-50/70 border border-rose-200 rounded-xl text-center">
                <div className="flex items-center justify-center gap-1 text-rose-700 text-xs font-semibold mb-0.5">
                  <UserMinus className="w-3.5 h-3.5" />
                  <span>Alfa</span>
                </div>
                <div className="text-lg font-black text-rose-800">{historyStats.alfa}</div>
                <div className="text-[10px] text-rose-600">Tanpa Keterangan</div>
              </div>

              <div className="col-span-2 sm:col-span-1 p-2.5 bg-teal-50/70 border border-teal-200 rounded-xl text-center">
                <div className="flex items-center justify-center gap-1 text-teal-700 text-xs font-semibold mb-0.5">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>% Hadir</span>
                </div>
                <div className="text-lg font-black text-teal-800">{historyStats.rate}%</div>
                <div className="text-[10px] text-teal-600">Tingkat Kehadiran</div>
              </div>
            </div>

            {/* Bilah Aksi Export & Cetak */}
            <div className="space-y-2 pt-1 border-t border-slate-100">
              <div className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold">
                <History className="w-4 h-4 text-primary-600" />
                <span>Daftar Log Kehadiran Siswa</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleExportHistoryCsv}
                  disabled={studentTransactions.length === 0}
                  leftIcon={<Download className="w-3.5 h-3.5 text-slate-600" />}
                  className="text-xs font-semibold shadow-xs w-full justify-center"
                >
                  <span className="hidden sm:inline">Export </span>CSV
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleExportHistoryExcel}
                  disabled={studentTransactions.length === 0}
                  leftIcon={<FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />}
                  className="text-xs font-semibold shadow-xs text-emerald-800 border-emerald-300 hover:bg-emerald-50 w-full justify-center"
                >
                  <span className="hidden sm:inline">Export </span>Excel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handlePrintHistoryPdf}
                  leftIcon={<Printer className="w-3.5 h-3.5" />}
                  className="text-xs font-bold bg-primary-600 hover:bg-primary-700 text-white shadow-xs w-full justify-center"
                >
                  <span className="hidden sm:inline">Cetak / </span>PDF
                </Button>
              </div>
            </div>

            {/* Tabel Log Transaksi Presensi */}
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[200px] sm:max-h-[320px] overflow-y-auto">
              {studentTransactions.length === 0 ? (
                <div className="p-8 text-center bg-slate-50">
                  <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-700">Belum ada catatan presensi</p>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto mt-1">
                    Log riwayat kehadiran siswa ini akan otomatis muncul saat siswa melakukan scan absensi masuk atau pulang.
                  </p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 border-b border-slate-200 font-semibold text-[11px]">
                    <tr>
                      <th className="py-2.5 px-3">Tanggal</th>
                      <th className="py-2.5 px-3">Waktu</th>
                      <th className="py-2.5 px-3">Sesi</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Metode</th>
                      <th className="py-2.5 px-3">Perangkat / Petugas</th>
                      <th className="py-2.5 px-3">Catatan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {studentTransactions.map((tx) => {
                      const timeStr = tx.deviceTimestamp
                        ? new Date(tx.deviceTimestamp).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })
                        : '-';

                      let statusBadge = (
                        <span className="font-mono text-[11px] font-semibold text-slate-700">
                          {tx.attendanceStatus}
                        </span>
                      );
                      if (tx.attendanceStatus === 'HADIR') {
                        statusBadge = (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            HADIR
                          </span>
                        );
                      } else if (tx.attendanceStatus === 'TERLAMBAT') {
                        statusBadge = (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                            <Clock className="w-3 h-3 text-amber-600" />
                            TERLAMBAT
                          </span>
                        );
                      } else if (tx.attendanceStatus === 'IZIN' || tx.attendanceStatus === 'SAKIT') {
                        statusBadge = (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded-full border border-blue-300">
                            <HeartPulse className="w-3 h-3 text-blue-600" />
                            {tx.attendanceStatus}
                          </span>
                        );
                      } else if (tx.attendanceStatus === 'ALFA') {
                        statusBadge = (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-800 bg-rose-100 px-2 py-0.5 rounded-full border border-rose-300">
                            <AlertCircle className="w-3 h-3 text-rose-600" />
                            ALFA
                          </span>
                        );
                      }

                      return (
                        <tr key={tx.transactionId} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 px-3 font-medium text-slate-900 whitespace-nowrap">
                            {tx.attendanceDate}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                            {timeStr}
                          </td>
                          <td className="py-2.5 px-3 font-bold whitespace-nowrap">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded ${
                                tx.attendanceType === 'MASUK'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-blue-50 text-blue-700 border border-blue-200'
                              }`}
                            >
                              {tx.attendanceType}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">{statusBadge}</td>
                          <td className="py-2.5 px-3 text-slate-600 text-[11px] whitespace-nowrap font-mono">
                            {tx.method || 'BARCODE'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 text-[11px] whitespace-nowrap truncate max-w-[120px]">
                            {tx.operatorId || tx.deviceId || '-'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                            {tx.note || '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Tombol Tutup */}
            <div className="flex justify-end pt-2 border-t border-slate-200">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedStudentForHistory(null)}
              >
                Tutup
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
