import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, setStoredUser } from '../../db/attendanceDb';
import type { UserAccount, AttendanceTransaction } from '../../types';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { EducationBackdrop } from '../../components/ui/EducationBackdrop';
import {
  Users,
  Home,
  TrendingUp,
  User,
  LogOut,
  CheckCircle2,
  Clock,
  AlertCircle,
  HeartPulse,
  UserMinus,
  Calendar,
  BellRing,
  Fingerprint,
  MapPin,
  Info,
  ChevronRight,
  Activity,
  Shield,
  GraduationCap,
  Pencil,
  Lock,
  Phone,
  Check,
  UserCheck,
  RefreshCw,
  WifiOff,
  Sparkles,
} from 'lucide-react';
import {
  formatTime,
  formatDate,
  normalizePhoneNumber,
  isValidIndonesianPhone,
  hashPassword,
  getLocalDateString,
} from '../../lib/utils';
import {
  getNotificationPermission,
  requestPWANotificationPermission,
  playNotificationChime,
  triggerPWANotification,
  subscribeToWebPush,
} from '../../lib/pwaNotification';
import { checkIsDayOff } from '../../services/holidayService';
import { syncParentPortalData, validateUserSession, saveParentToServer, fetchMasterStudentsFromSheets } from '../../services/syncService';
import { Swal } from '../../lib/swal';

const getDominantName = (fullName?: string) => {
  if (!fullName) return 'Siswa';
  const parts = fullName.trim().split(/\s+/);
  const honorifics = ['muhammad', 'muh', 'nur', 'andi', 'siti', 'a.', 'm.', 'st.'];
  if (parts.length > 1 && honorifics.includes(parts[0].toLowerCase())) {
    return parts[1];
  }
  return parts[0];
};

interface Props {
  currentUser: UserAccount;
  onLogout?: () => void;
}

export const ParentDesktopDashboard: React.FC<Props> = ({ currentUser, onLogout }) => {
  const [activeStudentId, setActiveStudentId] = useState<string>(() => currentUser.studentId || '');

  // ── Ambil nomor HP orang tua untuk pencocokan multi-anak ──────────────────
  const parentPhone = currentUser.phone || currentUser.username || '';
  const cleanParentPhone = useMemo(() => normalizePhoneNumber(parentPhone), [parentPhone]);

  // ── Query seluruh anak yang terhubung ke nomor HP orang tua ini ────────────
  const myStudents = useLiveQuery(
    async () => {
      const allStudents = await db.students.toArray();
      const explicitIds = new Set<string>();
      if (currentUser.studentId) explicitIds.add(String(currentUser.studentId).trim());
      if (Array.isArray(currentUser.studentIds)) {
        currentUser.studentIds.forEach((id) => explicitIds.add(String(id).trim()));
      }

      const matched = allStudents.filter((s) => {
        const sId = String(s.id).trim();
        if (explicitIds.has(sId)) return true;
        if (cleanParentPhone && s.whatsappNumber) {
          return normalizePhoneNumber(s.whatsappNumber) === cleanParentPhone;
        }
        return false;
      });

      // Deduplikasi
      const seen = new Set<string>();
      const unique = matched.filter((s) => {
        const sId = String(s.id).trim();
        if (seen.has(sId)) return false;
        seen.add(sId);
        return true;
      });

      return unique.sort((a, b) => a.name.localeCompare(b.name));
    },
    [currentUser.studentId, currentUser.studentIds, cleanParentPhone]
  ) || [];

  // Jika activeStudentId kosong atau tidak cocok, pilih anak pertama dari myStudents
  useEffect(() => {
    if (myStudents.length > 0) {
      const exists = myStudents.some((s) => s.id === activeStudentId);
      if (!exists) {
        setActiveStudentId(myStudents[0].id);
      }
    }
  }, [myStudents, activeStudentId]);

  const studentId = activeStudentId || currentUser.studentId || '';

  // ── Data Siswa ──────────────────────────────────────────────────────────────
  const student = useLiveQuery(
    async () => {
      if (!activeStudentId) return undefined;
      const s = await db.students.get(activeStudentId);
      if (s) return s;
      const all = await db.students.toArray();
      return all.find((item) => String(item.id).trim().toLowerCase() === String(activeStudentId).trim().toLowerCase());
    },
    [activeStudentId]
  );

  const allTransactions = useLiveQuery(
    async () => {
      if (!activeStudentId) return [];
      const trimmed = String(activeStudentId).trim();
      const records = await db.transactions.where('studentId').equals(trimmed).toArray();
      if (records.length > 0) {
        return records.sort(
          (a, b) => new Date(b.deviceTimestamp).getTime() - new Date(a.deviceTimestamp).getTime()
        );
      }
      const all = await db.transactions.toArray();
      return all
        .filter((t) => String(t.studentId).trim().toLowerCase() === trimmed.toLowerCase())
        .sort(
          (a, b) => new Date(b.deviceTimestamp).getTime() - new Date(a.deviceTimestamp).getTime()
        );
    },
    [activeStudentId]
  ) || [];

  // ── State ──────────────────────────────────────────────────────────────────
  const [activeNav, setActiveNav] = useState<'beranda' | 'rekap' | 'riwayat' | 'profil'>('beranda');
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateString());
  const [selectedTx, setSelectedTx] = useState<AttendanceTransaction | null>(null);
  const [permissionState, setPermissionState] = useState<'granted' | 'denied' | 'default' | 'unsupported'>('default');
  const [isRequestingPerm, setIsRequestingPerm] = useState(false);
  const [isNotifActive, setIsNotifActive] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      localStorage.getItem('parent_notif_enabled') === 'true' ||
      (typeof Notification !== 'undefined' && Notification.permission === 'granted')
    );
  });

  // Edit profil
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editPhone, setEditPhone] = useState('');
  const [editName, setEditName] = useState('');
  const [editPass, setEditPass] = useState('');
  const [editPassConfirm, setEditPassConfirm] = useState('');
  const [editMsg, setEditMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Jadwal Sekolah Dinamis (sinkron dari server MySQL)
  const [schoolSettings, setSchoolSettings] = useState(() => ({
    entryStart:  localStorage.getItem('school_entry_start')  || '06:30',
    entryLimit:  localStorage.getItem('school_entry_limit')  || '07:15',
    lateLimit:   localStorage.getItem('school_late_limit')   || '07:30',
    dismissal:   localStorage.getItem('school_dismissal_time') || '15:30',
  }));

  useEffect(() => {
    const loadSettings = () => {
      setSchoolSettings({
        entryStart:  localStorage.getItem('school_entry_start')  || '06:30',
        entryLimit:  localStorage.getItem('school_entry_limit')  || '07:15',
        lateLimit:   localStorage.getItem('school_late_limit')   || '07:30',
        dismissal:   localStorage.getItem('school_dismissal_time') || '15:30',
      });
    };
    window.addEventListener('school-settings-updated', loadSettings);
    return () => window.removeEventListener('school-settings-updated', loadSettings);
  }, []);

  // ── Auto-sync data dari MySQL saat halaman dibuka ──────────────────────────
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string>('');
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));

  useEffect(() => {
    const handleOnlineStatus = () => setIsOnline(true);
    const handleOfflineStatus = () => setIsOnline(false);
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOfflineStatus);
    return () => {
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOfflineStatus);
    };
  }, []);

  const handleSyncData = async () => {
    setIsSyncing(true);
    setSyncMsg('');
    try {
      const phone = currentUser.phone || currentUser.username;
      const allTargetIds = Array.from(new Set([
        ...myStudents.map((s) => s.id),
        ...(currentUser.studentIds || []),
        currentUser.studentId,
        studentId,
      ].filter(Boolean))) as string[];

      const result = await syncParentPortalData(studentId, phone, allTargetIds);
      if (result.accountDeleted) {
        if (onLogout) onLogout();
        Swal.error('Akses Dicabut', result.error || 'Akun orang tua ini telah dihapus oleh Administrator.');
        return;
      }
      if (result.success) {
        setSyncMsg(`${result.transactionsCount ?? 0} catatan absensi berhasil dimuat.`);
        if (!studentId && result.student?.id) {
          const updatedUser = { ...currentUser, studentId: result.student.id };
          await db.users.update(currentUser.userId, { studentId: result.student.id });
          setStoredUser(updatedUser);
        }
      } else {
        setSyncMsg(`Gagal memuat dari server. Menampilkan data terakhir yang tersimpan.`);
      }
    } catch {
      setSyncMsg('Gagal menghubungi server.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Validasi sesi akun secara berkala (memastikan akun belum dihapus oleh Admin)
  useEffect(() => {
    let isCancelled = false;
    async function checkSession() {
      try {
        const val = await validateUserSession(currentUser);
        if (!isCancelled && !val.valid) {
          if (onLogout) onLogout();
          Swal.error('Akses Dibatalkan', val.message || 'Akun Anda telah dihapus oleh Administrator madrasah.');
        }
      } catch {}
    }
    checkSession();
    const interval = setInterval(checkSession, 30000);
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [currentUser, onLogout]);

  // Sinkronisasi otomatis saat beralih anak (Multi-Anak)
  useEffect(() => {
    if (activeStudentId) {
      handleSyncData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStudentId]);

  useEffect(() => {
    setPermissionState(getNotificationPermission());
    // Auto-sync saat mount & seketika saat komputer terhubung kembali ke internet
    handleSyncData();

    const handleOnline = () => {
      handleSyncData();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Polling data presensi dari MySQL setiap 10 detik agar desktop selalu up-to-date
  useEffect(() => {
    const interval = setInterval(() => {
      const phone = currentUser.phone || currentUser.username;
      const sId = studentId || currentUser.studentId || '';
      const allTargetIds = Array.from(new Set([
        ...myStudents.map((s) => s.id),
        ...(currentUser.studentIds || []),
        currentUser.studentId,
        sId,
      ].filter(Boolean))) as string[];

      syncParentPortalData(sId, phone, allTargetIds).then(res => {
        if (!sId && res.student?.id) {
          const updatedUser = { ...currentUser, studentId: res.student.id };
          db.users.update(currentUser.userId, { studentId: res.student.id });
          setStoredUser(updatedUser);
        }
      }).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [studentId, currentUser, myStudents]);

  // ── Computed ───────────────────────────────────────────────────────────────
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => getLocalDateString(today), [today]);

  // Deduplikasi transaksi agar tidak ganda per tanggal dan tipe scan (MASUK/PULANG)
  const uniqueTransactions = useMemo(() => {
    const seen = new Set<string>();
    return allTransactions.filter((tx) => {
      const key = `${tx.studentId}_${tx.attendanceDate}_${tx.attendanceType}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [allTransactions]);

  const todayTxs = useMemo(
    () =>
      uniqueTransactions
        .filter((t) => t.attendanceDate === todayStr)
        .sort((a, b) => new Date(b.deviceTimestamp).getTime() - new Date(a.deviceTimestamp).getTime()),
    [uniqueTransactions, todayStr]
  );
  const morningTx = todayTxs.find((t) => t.attendanceType === 'MASUK');
  const departureTx = todayTxs.find((t) => t.attendanceType === 'PULANG');

  // Real-time watcher: membunyikan suara saat ada scan baru hari ini (Deduplikasi ketat)
  useEffect(() => {
    if (!studentId || todayTxs.length === 0) return;

    for (const tx of todayTxs) {
      const cleanDate = (tx.attendanceDate || '').replace(/[^0-9]/g, '');
      const storageKey = `desktop_notified_${tx.studentId}_${tx.attendanceDate}_${tx.attendanceType}`;
      const pushTagKey = `pwa_notified_tag_tx-${tx.studentId}-${tx.attendanceType}-${cleanDate}`;

      // Lewati jika sudah pernah dinotifikasikan via Web Push atau di sesi ini
      if (localStorage.getItem(storageKey) || localStorage.getItem(pushTagKey)) {
        continue;
      }

      localStorage.setItem(storageKey, 'true');

      let msg = '';
      if (tx.attendanceType === 'MASUK') {
        if (tx.attendanceStatus === 'HADIR') {
          msg = `${student?.name || 'Anak Anda'} telah tiba di madrasah dan scan MASUK tepat waktu (${formatTime(tx.deviceTimestamp)} WITA).`;
        } else if (tx.attendanceStatus === 'TERLAMBAT') {
          msg = `${student?.name || 'Anak Anda'} tiba di madrasah dan scan MASUK (Terlambat) pukul ${formatTime(tx.deviceTimestamp)} WITA.`;
        } else {
          msg = `Catatan presensi ${student?.name || 'anak Anda'}: [${tx.attendanceStatus}] (${tx.note || 'keterangan dicatat'}).`;
        }
      } else {
        msg = `${student?.name || 'Anak Anda'} telah scan PULANG pukul ${formatTime(tx.deviceTimestamp)} WITA.`;
      }

      playNotificationChime();
      triggerPWANotification({
        title: 'Presensi Siswa MAN 1 BULUKUMBA',
        body: msg,
        tag: `tx-${tx.studentId}-${tx.attendanceType}-${cleanDate}`,
      }).catch(() => {});
    }
  }, [todayTxs, studentId, student?.name]);

  const selectedDateTxs = useMemo(
    () =>
      uniqueTransactions
        .filter((t) => t.attendanceDate === selectedDate)
        .sort((a, b) => new Date(b.deviceTimestamp).getTime() - new Date(a.deviceTimestamp).getTime()),
    [uniqueTransactions, selectedDate]
  );

  // Statistik bulan ini
  const currentMonth = todayStr.substring(0, 7);
  const monthTxs = useMemo(
    () => uniqueTransactions.filter((t) => t.attendanceDate?.startsWith(currentMonth) && t.attendanceType === 'MASUK'),
    [uniqueTransactions, currentMonth]
  );
  const countHadir = monthTxs.filter((t) => t.attendanceStatus === 'HADIR').length;
  const countTerlambat = monthTxs.filter((t) => t.attendanceStatus === 'TERLAMBAT').length;
  const countIzinSakit = monthTxs.filter((t) => ['IZIN', 'SAKIT', 'BK'].includes(t.attendanceStatus)).length;
  const countAlfa = monthTxs.filter((t) => t.attendanceStatus === 'ALFA').length;
  const totalDays = monthTxs.length;
  const attendanceRate = totalDays > 0 ? Math.round((countHadir / totalDays) * 100) : 0;

  // Datesmap untuk kalender
  const datesStatusMap = useMemo(() => {
    const map: Record<string, 'HADIR' | 'TERLAMBAT' | 'IZIN' | 'ALFA'> = {};
    for (const t of uniqueTransactions) {
      if (t.attendanceType === 'MASUK') {
        if (t.attendanceStatus === 'HADIR') map[t.attendanceDate] = 'HADIR';
        else if (t.attendanceStatus === 'TERLAMBAT') map[t.attendanceDate] = 'TERLAMBAT';
        else if (['IZIN', 'SAKIT', 'BK'].includes(t.attendanceStatus)) map[t.attendanceDate] = 'IZIN';
        else if (t.attendanceStatus === 'ALFA') map[t.attendanceDate] = 'ALFA';
      }
    }
    return map;
  }, [uniqueTransactions]);

  // Riwayat 30 hari terakhir
  const recentHistory = useMemo(
    () => uniqueTransactions.filter((t) => t.attendanceType === 'MASUK').slice(0, 30),
    [uniqueTransactions]
  );

  // ── Kalender Bulan Ini ─────────────────────────────────────────────────────
  const calendarDays = useMemo(() => {
    try {
      const parts = (selectedDate || '').split('-');
      const y = Number(parts[0]) || new Date().getFullYear();
      const m = Number(parts[1]) || new Date().getMonth() + 1;

      const firstDay = new Date(y, m - 1, 1);
      const lastDay = new Date(y, m, 0);
      const totalDaysInMonth = lastDay.getDate() || 30;

      const startOffset = (firstDay.getDay() + 6) % 7; // Senin = 0
      const days: { date: string; day: number; inMonth: boolean }[] = [];

      // Isi hari kosong awal
      for (let i = startOffset; i > 0; i--) {
        const d = new Date(y, m - 1, 1 - i);
        const yStr = d.getFullYear();
        const mStr = String(d.getMonth() + 1).padStart(2, '0');
        const dStr = String(d.getDate()).padStart(2, '0');
        days.push({ date: `${yStr}-${mStr}-${dStr}`, day: d.getDate(), inMonth: false });
      }

      // Isi hari dalam bulan aktif
      for (let d = 1; d <= totalDaysInMonth; d++) {
        const mStr = String(m).padStart(2, '0');
        const dStr = String(d).padStart(2, '0');
        days.push({ date: `${y}-${mStr}-${dStr}`, day: d, inMonth: true });
      }

      return days;
    } catch {
      return [];
    }
  }, [selectedDate]);

  // ── Helper ─────────────────────────────────────────────────────────────────
  const statusColor = (s?: string) => {
    if (!s) return 'bg-slate-100 text-slate-500';
    if (s === 'PULANG') return 'bg-emerald-100 text-emerald-800';
    if (s === 'HADIR') return 'bg-primary-100 text-primary-800';
    if (s === 'TERLAMBAT') return 'bg-amber-100 text-amber-800';
    if (['IZIN', 'SAKIT', 'BK'].includes(s)) return 'bg-blue-100 text-blue-800';
    if (s === 'ALFA') return 'bg-red-100 text-red-800';
    return 'bg-slate-100 text-slate-600';
  };

  const calDotColor = (s?: string) => {
    if (!s) return '';
    if (s === 'HADIR') return 'bg-primary-500';
    if (s === 'TERLAMBAT') return 'bg-amber-500';
    if (s === 'IZIN') return 'bg-blue-500';
    if (s === 'ALFA') return 'bg-red-500';
    return '';
  };

  const monthName = useMemo(() => {
    try {
      const parts = (selectedDate || '').split('-');
      const y = Number(parts[0]) || new Date().getFullYear();
      const m = Number(parts[1]) || new Date().getMonth() + 1;
      return new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    } catch {
      return '';
    }
  }, [selectedDate]);

  const prevMonth = () => {
    try {
      const parts = (selectedDate || '').split('-');
      const y = Number(parts[0]) || new Date().getFullYear();
      const m = Number(parts[1]) || new Date().getMonth() + 1;
      const d = new Date(y, m - 2, 1);
      setSelectedDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
    } catch {}
  };

  const nextMonth = () => {
    try {
      const parts = (selectedDate || '').split('-');
      const y = Number(parts[0]) || new Date().getFullYear();
      const m = Number(parts[1]) || new Date().getMonth() + 1;
      const d = new Date(y, m, 1);
      setSelectedDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
    } catch {}
  };

  // ── Edit Profil ────────────────────────────────────────────────────────────
  const handleOpenEdit = () => {
    setEditPhone(currentUser.phone || currentUser.username || '');
    setEditName(currentUser.fullName || '');
    setEditPass('');
    setEditPassConfirm('');
    setEditMsg(null);
    setIsEditOpen(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditMsg(null);
    const cleanPhone = normalizePhoneNumber(editPhone);
    if (!isValidIndonesianPhone(cleanPhone)) {
      setEditMsg({ type: 'error', text: 'Nomor HP tidak valid.' });
      return;
    }
    if (!editName.trim()) {
      setEditMsg({ type: 'error', text: 'Nama wajib diisi.' });
      return;
    }
    if (editPass && editPass.length < 6) {
      setEditMsg({ type: 'error', text: 'Password baru minimal 6 karakter.' });
      return;
    }
    if (editPass && editPass !== editPassConfirm) {
      setEditMsg({ type: 'error', text: 'Konfirmasi password tidak cocok.' });
      return;
    }
    setIsSaving(true);
    try {
      const oldPhone = currentUser.phone || currentUser.username || '';
      const updates: Partial<UserAccount> = {
        phone: cleanPhone,
        username: cleanPhone,
        fullName: editName.trim(),
      };

      if (editPass) {
        updates.passwordHash = await hashPassword(editPass);
      } else {
        const existingInDb = await db.users.get(currentUser.userId);
        if (existingInDb?.passwordHash) {
          updates.passwordHash = existingInDb.passwordHash;
        }
      }

      const targetStudentIds = new Set<string>();
      if (currentUser.studentId) targetStudentIds.add(currentUser.studentId);
      if (Array.isArray(currentUser.studentIds)) {
        currentUser.studentIds.forEach((id) => targetStudentIds.add(id));
      }
      if (studentId) targetStudentIds.add(studentId);
      const targetList = Array.from(targetStudentIds);

      const updatedUser: UserAccount = {
        ...currentUser,
        ...updates,
        studentIds: targetList,
        studentId: targetList[0] || currentUser.studentId || '',
      };

      await db.users.put(updatedUser);
      setStoredUser(updatedUser);

      for (const sId of targetList) {
        await db.students.update(sId, {
          parentName: editName.trim(),
          whatsappNumber: cleanPhone,
          updatedAt: new Date().toISOString(),
        });
      }

      const saveRes = await saveParentToServer(updatedUser, oldPhone);
      if (!saveRes.success) {
        setEditMsg({
          type: 'error',
          text: `Gagal memperbarui ke server database: ${saveRes.error || 'Server tidak merespon'}.`,
        });
        setIsSaving(false);
        return;
      }

      currentUser.phone = cleanPhone;
      currentUser.username = cleanPhone;
      currentUser.fullName = editName.trim();
      if (updates.passwordHash) currentUser.passwordHash = updates.passwordHash;
      if (targetList.length > 0) currentUser.studentIds = targetList;

      fetchMasterStudentsFromSheets().catch(() => {});
      setEditMsg({ type: 'success', text: 'Nomor HP dan profil berhasil diperbarui & tersinkron ke database server!' });
      setTimeout(() => setIsEditOpen(false), 1200);
    } catch (err: any) {
      setEditMsg({ type: 'error', text: err?.message || 'Gagal menyimpan profil.' });
    } finally {
      setIsSaving(false);
    }
  };

  // ── UI ─────────────────────────────────────────────────────────────────────
  const navItems = [
    { key: 'beranda', label: 'Beranda', icon: Home },
    { key: 'rekap', label: 'Rekap Kehadiran', icon: TrendingUp },
    { key: 'riwayat', label: 'Riwayat Presensi', icon: Calendar },
    { key: 'profil', label: 'Profil Akun', icon: User },
  ] as const;

  const todayDayOff = useMemo(() => checkIsDayOff(todayStr), [todayStr]);

  const statusBadge = todayDayOff.isDayOff
    ? { label: todayDayOff.reason, cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' }
    : morningTx
    ? departureTx
      ? { label: 'Sudah Pulang', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' }
      : { label: 'Sedang Belajar', cls: 'bg-primary-100 text-primary-800 border-primary-200' }
    : { label: 'Menunggu Scan Masuk', cls: 'bg-amber-100 text-amber-800 border-amber-200' };

  return (
    <div className="flex h-screen bg-canvas overflow-hidden font-sans">

      {/* ── SIDEBAR  STYLE ────────────────────────────────────────── */}
      <aside className="w-64 bg-[#1c5e2d] text-emerald-50 border-r border-[#267b3c] flex flex-col shrink-0 shadow-sm select-none">
        {/* Logo */}
        <div className="p-5 border-b border-[#267b3c]">
          <div className="flex items-center gap-3">
            <img src="/icon-192.png" alt="Logo MAN 1 Bulukumba" className="w-10 h-10 rounded-xl object-contain bg-white/10 p-0.5 border border-white/20 shadow-sm shrink-0" />
            <div>
              <p className="text-xs font-bold text-white leading-tight">MAN 1 BULUKUMBA</p>
              <p className="text-[10px] text-emerald-300 font-medium">Portal Orang Tua</p>
            </div>
          </div>
        </div>

        {/* Info Siswa & Child Switcher */}
        <div className="mx-3 mt-4 p-3 bg-[#164e25] rounded-xl border border-[#2a8442] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-emerald-300" />
              <span>Anak ({myStudents.length || 1}):</span>
            </span>
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-white/15 text-white border border-white/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
              {statusBadge.label}
            </div>
          </div>

          {myStudents.length > 1 ? (
            <div className="space-y-1 pt-0.5">
              {myStudents.map((s) => {
                const isSelected = s.id === activeStudentId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiveStudentId(s.id)}
                    className={`w-full text-left p-2 rounded-xl flex items-center gap-2 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#2e8b38] text-white shadow-xs font-bold ring-1 ring-white/20'
                        : 'text-emerald-100 hover:bg-[#247539] hover:text-white font-medium'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                      isSelected ? 'bg-white/25 text-white' : 'bg-[#144721] text-emerald-200'
                    }`}>
                      {s.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs truncate leading-tight">{s.name}</p>
                      <p className={`text-[10px] ${isSelected ? 'text-emerald-100 font-semibold' : 'text-emerald-300'}`}>
                        {s.className} &bull; {s.id}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-[#2e8b38] border border-white/20 flex items-center justify-center shrink-0 shadow-sm">
                <GraduationCap className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">
                  {student?.name || '—'}
                </p>
                <p className="text-[10px] text-emerald-300 font-medium">
                  {student?.className || 'Memuat...'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Navigasi */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveNav(key)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeNav === key
                  ? 'bg-[#2e8b38] text-white shadow-sm ring-1 ring-white/20'
                  : 'text-emerald-100 hover:bg-[#247539] hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        {/* Footer Sidebar */}
        <div className="p-3 border-t border-[#267b3c] bg-[#144721] space-y-1">
          <div className="px-3.5 py-2.5 rounded-xl bg-[#164e25] border border-[#2a8442] text-[11px]">
            <p className="font-semibold text-white truncate">{currentUser.fullName}</p>
            <p className="text-emerald-300 truncate">{currentUser.phone || currentUser.username}</p>
          </div>
          <button
            onClick={async () => {
              const confirmed = await Swal.confirm(
                'Keluar dari Akun?',
                'Anda akan keluar dari portal orang tua di perangkat ini.',
                'Ya, Keluar',
                'Batal'
              );
              if (confirmed && onLogout) onLogout();
            }}
            className="w-full flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-emerald-200 hover:text-red-300 hover:bg-[#247539] transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Keluar
          </button>
        </div>
      </aside>

      {/* ── MAIN AREA ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Backdrop Ornamen Edukasi Halus */}
        <EducationBackdrop />

        {/* Topbar — Apple Style Translucent Frosted Glass */}
        <header className="h-14 apple-glass-nav border-b border-[#e1ede4]/80 flex items-center justify-between px-6 shrink-0 sticky top-0 z-30 select-none">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-sm font-black text-slate-800">
                {navItems.find((n) => n.key === activeNav)?.label}
              </h1>
              <p className="text-[11px] text-slate-400">
                {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>

            {/* Selector Cepat Anak di Topbar Desktop */}
            {myStudents.length > 1 && (
              <div className="hidden lg:flex items-center gap-1.5 p-1 bg-emerald-50/80 rounded-xl border border-emerald-200">
                <span className="text-[10px] font-bold text-emerald-800 px-2 flex items-center gap-1">
                  <Users className="w-3 h-3 text-[#2e8b38]" />
                  <span>Anak:</span>
                </span>
                {myStudents.map((s) => {
                  const isSelected = s.id === activeStudentId;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setActiveStudentId(s.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#2e8b38] text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                      }`}
                    >
                      {s.name.split(' ')[0]} ({s.className})
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {!isOnline && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold animate-fade-in" title="Perangkat sedang tidak terhubung ke internet. Data tersimpan lokal di browser.">
                <WifiOff className="w-3.5 h-3.5 text-amber-700" />
                Mode Offline
              </span>
            )}
            {!isNotifActive && (
              <button
                onClick={async () => {
                  setIsRequestingPerm(true);
                  localStorage.setItem('parent_notif_enabled', 'true');
                  setIsNotifActive(true);
                  try {
                    const granted = await requestPWANotificationPermission();
                    if (granted) {
                      subscribeToWebPush(currentUser.userId, studentId, currentUser.phone || currentUser.username).catch(() => {});
                    }
                    setPermissionState(getNotificationPermission());
                  } catch (_) {}
                  setIsRequestingPerm(false);
                }}
                disabled={isRequestingPerm}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-50 border border-primary-200 text-primary-700 text-xs font-bold hover:bg-primary-100 transition-colors shadow-xs"
              >
                <BellRing className="w-3.5 h-3.5" />
                {isRequestingPerm ? '...' : 'Aktifkan Notifikasi'}
              </button>
            )}
            <button
              onClick={handleOpenEdit}
              className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white font-black text-xs shadow-sm hover:bg-primary-700 transition-colors"
              title="Edit Profil"
            >
              {currentUser.fullName?.charAt(0).toUpperCase() || 'O'}
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">

          {/* ── BERANDA ─────────────────────────────────────────────────── */}
          {activeNav === 'beranda' && (
            <div className="space-y-6">
              {/* Status Hari Ini — 4 Stat Cards */}
              <div className="grid grid-cols-4 gap-4">
                {[
                  {
                    label: 'Scan Masuk',
                    value: morningTx ? formatTime(morningTx.deviceTimestamp) : '—',
                    sub: morningTx ? morningTx.attendanceStatus : 'Belum scan',
                    icon: UserCheck,
                    color: morningTx ? 'text-primary-700 bg-primary-50 border-primary-200' : 'text-slate-400 bg-slate-50 border-slate-200',
                    iconBg: morningTx ? 'bg-primary-600' : 'bg-slate-300',
                  },
                  {
                    label: 'Scan Pulang',
                    value: departureTx ? formatTime(departureTx.deviceTimestamp) : '—',
                    sub: departureTx ? 'Sudah Pulang' : 'Belum scan',
                    icon: Activity,
                    color: departureTx ? 'text-amber-800 bg-amber-50 border-amber-200' : 'text-slate-400 bg-slate-50 border-slate-200',
                    iconBg: departureTx ? 'bg-amber-500' : 'bg-slate-300',
                  },
                  {
                    label: 'Kehadiran Bulan Ini',
                    value: `${attendanceRate}%`,
                    sub: `${countHadir + countTerlambat} dari ${totalDays} hari`,
                    icon: TrendingUp,
                    color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
                    iconBg: 'bg-emerald-600',
                  },
                  {
                    label: 'Alfa / Tanpa Ket.',
                    value: String(countAlfa),
                    sub: `${countIzinSakit} Izin/Sakit`,
                    icon: AlertCircle,
                    color: countAlfa > 0 ? 'text-red-700 bg-red-50 border-red-200' : 'text-slate-400 bg-slate-50 border-slate-200',
                    iconBg: countAlfa > 0 ? 'bg-red-500' : 'bg-slate-300',
                  },
                ].map(({ label, value, sub, icon: Icon, color, iconBg }) => (
                  <div key={label} className={`rounded-2xl border p-4 ${color}`}>
                    <div className="flex items-start justify-between mb-3">
                      <p className="text-xs font-semibold opacity-80">{label}</p>
                      <div className={`w-8 h-8 rounded-xl ${iconBg} flex items-center justify-center`}>
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                    </div>
                    <p className="text-2xl font-black tracking-tight">{value}</p>
                    <p className="text-[11px] opacity-70 mt-0.5 font-medium">{sub}</p>
                  </div>
                ))}
              </div>

              {/* Row Tengah: Timeline Hari Ini + Info Siswa */}
              <div className="grid grid-cols-3 gap-6">
                {/* Timeline Hari Ini */}
                <div className="col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-black text-slate-800">Aktivitas Presensi Hari Ini</h2>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${statusBadge.cls}`}>
                      {statusBadge.label}
                    </span>
                  </div>
                  <div className="p-5">
                    {todayTxs.length === 0 ? (
                      <div className="text-center py-10">
                        <Clock className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                        <p className="text-sm font-semibold text-slate-400">
                          {todayDayOff.isDayOff ? todayDayOff.reason : 'Belum ada scan hari ini'}
                        </p>
                        <p className="text-xs text-slate-300 mt-1">
                          {todayDayOff.isDayOff
                            ? 'Tidak ada pemindaian kartu di gerbang pada hari libur / acara khusus.'
                            : 'Data akan muncul otomatis saat siswa scan kartu'}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {todayTxs.map((tx) => (
                          <button
                            key={tx.transactionId}
                            onClick={() => setSelectedTx(tx)}
                            className="w-full flex items-center gap-4 p-3.5 rounded-xl border border-slate-100 hover:border-primary-200 hover:bg-primary-50/40 transition-all group text-left"
                          >
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                              tx.attendanceType === 'MASUK' ? 'bg-primary-100' : 'bg-blue-100'
                            }`}>
                              <Fingerprint className={`w-5 h-5 ${tx.attendanceType === 'MASUK' ? 'text-primary-700' : 'text-blue-700'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-800">
                                {tx.attendanceType === 'MASUK' ? 'Scan Masuk Gerbang' : 'Scan Pulang Gerbang'}
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {tx.deviceId} &bull; {tx.operatorName || 'Operator'} &bull; {tx.method.replace('_', ' ')}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-black text-slate-800 font-mono">
                                {formatTime(tx.deviceTimestamp)}
                              </p>
                              <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${statusColor(tx.attendanceType === 'PULANG' ? 'PULANG' : tx.attendanceStatus)}`}>
                                {tx.attendanceType === 'PULANG' ? 'PULANG' : tx.attendanceStatus}
                              </span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-primary-500 transition-colors shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Info Siswa */}
                <div className="space-y-4">
                  <div className="bg-gradient-to-br from-primary-700 via-primary-600 to-emerald-600 text-white rounded-2xl p-5 shadow-md shadow-primary-600/20">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center border border-white/30">
                        <GraduationCap className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-white/80">Profil Siswa</p>
                        <p className="text-sm font-black leading-tight">{student?.name || '—'}</p>
                      </div>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-white/70">Kelas</span>
                        <span className="font-bold">{student?.className || '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/70">ID</span>
                        <span className="font-bold font-mono">{student?.id || studentId}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/70">Status</span>
                        <span className="font-bold">{student?.isActive ? 'Aktif' : 'Tidak Aktif'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Selector Anak di Bawah Kotak Hijau Profil Siswa */}
                  {myStudents.length > 1 && (
                    <div className="bg-white rounded-2xl p-3 border border-emerald-200 shadow-xs space-y-2 animate-fade-in">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-[#2e8b38]" />
                          <span>Pilih Anak ({myStudents.length} Bersaudara):</span>
                        </span>
                        <span className="text-[10px] font-medium text-slate-400">
                          Klik untuk beralih
                        </span>
                      </div>
                      <div className={`grid gap-1.5 w-full ${myStudents.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                        {myStudents.map((s) => {
                          const isSelected = s.id === activeStudentId;
                          const dominantName = getDominantName(s.name);
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => setActiveStudentId(s.id)}
                              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-all duration-150 w-full cursor-pointer active:scale-95 text-center min-w-0 ${
                                isSelected
                                  ? 'bg-[#2e8b38] text-white shadow-sm ring-2 ring-emerald-500/20'
                                  : 'bg-emerald-50/70 text-slate-700 hover:bg-emerald-100 hover:text-emerald-900 border border-emerald-100'
                              }`}
                              title={`${s.name} (${s.className})`}
                            >
                              <div
                                className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 ${
                                  isSelected ? 'bg-white/25 text-white' : 'bg-emerald-200 text-emerald-800'
                                }`}
                              >
                                {dominantName.charAt(0).toUpperCase()}
                              </div>
                              <span className="truncate">{dominantName}</span>
                              <span
                                className={`text-[9px] font-mono px-1 py-0.5 rounded shrink-0 ${
                                  isSelected ? 'bg-white/20 text-white' : 'bg-slate-200/80 text-slate-600'
                                }`}
                              >
                                {s.className}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Info Jam Gerbang */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
                    <p className="text-xs font-black text-slate-700 mb-3 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-primary-600" />
                      Jadwal Scan Gerbang
                    </p>
                    <div className="space-y-1.5">
                      {[
                        { label: 'Masuk Tepat Waktu', time: '06.30–07.15', c: 'text-primary-700' },
                        { label: 'Masuk Terlambat', time: '07.16–07.30', c: 'text-amber-700' },
                        { label: 'Gerbang Tutup', time: '07.30 WITA', c: 'text-red-600' },
                        { label: 'Scan Pulang', time: 'Mulai 15.30', c: 'text-blue-700' },
                      ].map(({ label, time, c }) => (
                        <div key={label} className="flex justify-between items-center text-[11px]">
                          <span className="text-slate-500">{label}</span>
                          <span className={`font-mono font-bold ${c}`}>{time}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── REKAP ───────────────────────────────────────────────────── */}
          {activeNav === 'rekap' && (
            <div className="space-y-6">
              {/* 1. Hero Card: Tingkat Kehadiran Tepat Waktu (Kotak Hijau Besar) */}
              <div className="relative rounded-2xl p-6 overflow-hidden bg-gradient-to-r from-[#1c5e2d] via-[#247539] to-[#2e8b38] text-white shadow-md">
                <div className="absolute -right-8 -bottom-8 w-48 h-48 rounded-full bg-white/10 blur-xl pointer-events-none" />
                <div
                  className="absolute right-4 top-4 w-36 h-28 opacity-20 pointer-events-none"
                  style={{
                    backgroundImage: 'radial-gradient(circle, #f59e0b 2px, transparent 2px)',
                    backgroundSize: '12px 12px',
                  }}
                />
                <div className="relative z-10 flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-xs font-semibold text-white border border-white/25">
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span>Disiplin Presensi {student ? `• ${student.name.split(' ')[0]}` : ''}</span>
                    </div>
                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-5xl font-black text-white tracking-tight">{attendanceRate}</span>
                        <span className="text-2xl font-bold text-emerald-200">%</span>
                      </div>
                      <p className="text-sm font-semibold text-emerald-100/90 mt-1">
                        Tingkat Kehadiran Tepat Waktu Bulan Ini ({new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })})
                      </p>
                    </div>
                  </div>

                  <div className="px-5 py-3.5 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 flex flex-col items-center justify-center shrink-0 shadow-inner">
                    <span className="text-2xl font-black text-white leading-tight">{countHadir}/{totalDays}</span>
                    <span className="text-xs text-emerald-200 font-bold uppercase tracking-wider mt-1">Hari Tepat Waktu</span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="relative z-10 mt-5 space-y-2">
                  <div className="w-full h-2.5 rounded-full bg-white/25 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-white transition-all duration-700"
                      style={{ width: `${Math.min(Math.max(attendanceRate, 0), 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-emerald-100/80 font-medium">
                    <span>{totalDays} hari total kegiatan tercatat</span>
                    <span className="font-bold text-white">
                      {totalDays === 0
                        ? 'Belum ada data presensi bulan ini'
                        : countTerlambat > 0 && countHadir === 0
                        ? '⚠️ Ada keterlambatan'
                        : attendanceRate >= 90
                        ? '🌟 Sangat Disiplin'
                        : attendanceRate >= 75
                        ? '👍 Cukup Baik'
                        : '❗ Perlu Perhatian'}
                    </span>
                  </div>
                </div>
              </div>

              {/* ── SELECTOR BANYAK ANAK DI TAB STATISTIK (DIBAWAH KOTAK HIJAU) ── */}
              {myStudents.length > 1 && (
                <div className="bg-white rounded-2xl p-3.5 border border-emerald-200 shadow-xs space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-[#2e8b38]" />
                      <span>Pilih Anak ({myStudents.length} Bersaudara):</span>
                    </span>
                    <span className="text-xs font-medium text-slate-400">
                      Klik untuk beralih data statistik anak
                    </span>
                  </div>
                  <div
                    className={`grid gap-2 w-full ${
                      myStudents.length === 2
                        ? 'grid-cols-2'
                        : myStudents.length === 3
                        ? 'grid-cols-3'
                        : 'grid-cols-4'
                    }`}
                  >
                    {myStudents.map((s) => {
                      const isSelected = s.id === activeStudentId;
                      const dominantName = getDominantName(s.name);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setActiveStudentId(s.id)}
                          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all duration-150 w-full cursor-pointer active:scale-95 text-center min-w-0 ${
                            isSelected
                              ? 'bg-[#2e8b38] text-white shadow-sm ring-2 ring-emerald-500/20'
                              : 'bg-emerald-50/70 text-slate-700 hover:bg-emerald-100 hover:text-emerald-900 border border-emerald-100'
                          }`}
                          title={`${s.name} (${s.className})`}
                        >
                          <div
                            className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                              isSelected ? 'bg-white/25 text-white' : 'bg-emerald-200 text-emerald-800'
                            }`}
                          >
                            {dominantName.charAt(0).toUpperCase()}
                          </div>
                          <span className="truncate">{dominantName}</span>
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                              isSelected ? 'bg-white/20 text-white' : 'bg-slate-200/80 text-slate-600'
                            }`}
                          >
                            {s.className}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Summary cards Bento Modern */}
              <div className="grid grid-cols-5 gap-4">
                {[
                  { label: 'Total Hari', value: totalDays, icon: Calendar, unit: 'Hari', bg: 'from-slate-500/10 via-slate-50/50 to-white', border: 'border-slate-200/80', iconBg: 'bg-slate-600', text: 'text-slate-900', badge: 'Efektif', badgeBg: 'bg-slate-100 text-slate-700' },
                  { label: 'Hadir Tepat', value: countHadir, icon: UserCheck, unit: 'Hari', bg: 'from-emerald-500/10 via-emerald-50/50 to-white', border: 'border-emerald-200/80', iconBg: 'bg-emerald-600', text: 'text-emerald-950', badge: '≤ 07.15', badgeBg: 'bg-emerald-100 text-emerald-800' },
                  { label: 'Terlambat', value: countTerlambat, icon: Clock, unit: 'Hari', bg: 'from-amber-500/10 via-amber-50/50 to-white', border: 'border-amber-200/80', iconBg: 'bg-amber-500', text: 'text-amber-950', badge: '> 07.15', badgeBg: 'bg-amber-100 text-amber-800' },
                  { label: 'Izin / Sakit', value: countIzinSakit, icon: HeartPulse, unit: 'Hari', bg: 'from-sky-500/10 via-sky-50/50 to-white', border: 'border-sky-200/80', iconBg: 'bg-sky-500', text: 'text-sky-950', badge: 'Surat', badgeBg: 'bg-sky-100 text-sky-800' },
                  { label: 'Alfa', value: countAlfa, icon: UserMinus, unit: 'Hari', bg: 'from-rose-500/10 via-rose-50/50 to-white', border: 'border-rose-200/80', iconBg: 'bg-rose-500', text: 'text-rose-950', badge: 'Tanpa Kabar', badgeBg: 'bg-rose-100 text-rose-800' },
                ].map(({ label, value, icon: Icon, unit, bg, border, iconBg, text, badge, badgeBg }) => (
                  <div key={label} className={`rounded-2xl border ${border} bg-white p-4.5 shadow-xs flex flex-col justify-between hover:border-emerald-300 hover:shadow-sm transition-all`}>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className={`w-9 h-9 rounded-xl ${iconBg} text-white flex items-center justify-center shadow-md shadow-black/10`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeBg}`}>
                        {badge}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-slate-500">{label}</span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className={`text-2xl font-black ${text}`}>{value}</span>
                        <span className="text-xs font-semibold text-slate-400">{unit}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Progress Kehadiran */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-black text-slate-800">Tingkat Kehadiran</h2>
                    <p className="text-xs text-slate-400">Bulan {new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</p>
                  </div>
                  <span className="text-3xl font-black text-primary-700">{attendanceRate}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#1c5e2d] to-[#2e8b38] transition-all duration-700"
                    style={{ width: `${attendanceRate}%` }}
                  />
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {[
                    { label: 'Hadir', val: countHadir, pct: totalDays > 0 ? Math.round((countHadir / totalDays) * 100) : 0, c: 'bg-primary-500' },
                    { label: 'Terlambat', val: countTerlambat, pct: totalDays > 0 ? Math.round((countTerlambat / totalDays) * 100) : 0, c: 'bg-amber-500' },
                    { label: 'Izin/Sakit', val: countIzinSakit, pct: totalDays > 0 ? Math.round((countIzinSakit / totalDays) * 100) : 0, c: 'bg-blue-500' },
                    { label: 'Alfa', val: countAlfa, pct: totalDays > 0 ? Math.round((countAlfa / totalDays) * 100) : 0, c: 'bg-red-500' },
                  ].map(({ label, val, pct, c }) => (
                    <div key={label} className="text-center">
                      <div className={`text-xs font-black text-white ${c} rounded-lg py-1 mb-1`}>{val}</div>
                      <p className="text-[10px] text-slate-500">{label} ({pct}%)</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Kalender Bulanan */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-black text-slate-800">Kalender Kehadiran</h2>
                  <div className="flex items-center gap-2">
                    <button onClick={prevMonth} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 text-slate-600 text-sm font-bold">‹</button>
                    <span className="text-sm font-bold text-slate-700 min-w-[140px] text-center">{monthName}</span>
                    <button onClick={nextMonth} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 text-slate-600 text-sm font-bold">›</button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1 mb-2">
                  {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((d) => (
                    <div key={d} className="text-center text-[10px] font-bold text-slate-400 py-1">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map(({ date, day, inMonth }) => {
                    const status = datesStatusMap[date];
                    const isToday = date === todayStr;
                    const dayOffCheck = inMonth ? checkIsDayOff(date) : { isDayOff: false, reason: '' };
                    
                    return (
                      <button
                        key={date}
                        onClick={() => setSelectedDate(date)}
                        className={`aspect-square flex flex-col items-center justify-center rounded-xl text-xs font-bold transition-all ${
                          !inMonth ? 'opacity-20 cursor-default' :
                          isToday ? 'bg-primary-600 text-white shadow-md' :
                          status ? 'bg-slate-50 border border-slate-200 hover:border-primary-300' :
                          dayOffCheck.isDayOff ? 'bg-blue-50/60 text-blue-700/80 hover:bg-blue-100/60' :
                          'hover:bg-slate-50 text-slate-600'
                        }`}
                        title={dayOffCheck.isDayOff ? dayOffCheck.reason : undefined}
                      >
                        {day}
                        {inMonth && !isToday && (
                          <div className="flex items-center justify-center h-1.5 mt-0.5">
                            {status ? (
                              <div className={`w-1 h-1 rounded-full ${calDotColor(status)}`} />
                            ) : dayOffCheck.isDayOff ? (
                              <div className="w-1 h-1 rounded-full bg-blue-400" />
                            ) : null}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Legenda */}
                <div className="mt-4 flex items-center gap-4 text-[11px] text-slate-500">
                  {[
                    { c: 'bg-primary-500', label: 'Hadir' },
                    { c: 'bg-amber-500', label: 'Terlambat' },
                    { c: 'bg-blue-500', label: 'Izin/Sakit' },
                    { c: 'bg-red-500', label: 'Alfa' },
                    { c: 'bg-blue-400', label: 'Libur / Acara' },
                  ].map(({ c, label }) => (
                    <div key={label} className="flex items-center gap-1">
                      <div className={`w-2 h-2 rounded-full ${c}`} />
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── RIWAYAT ─────────────────────────────────────────────────── */}
          {activeNav === 'riwayat' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-sm font-black text-slate-800">Riwayat Presensi</h2>
                <p className="text-xs text-slate-400 mt-0.5">{allTransactions.length} catatan tersimpan</p>
              </div>
              {allTransactions.length === 0 ? (
                <div className="text-center py-16">
                  <Calendar className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-400">Belum ada riwayat presensi</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {allTransactions.map((tx) => (
                    <button
                      key={tx.transactionId}
                      onClick={() => setSelectedTx(tx)}
                      className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors text-left group"
                    >
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        tx.attendanceType === 'MASUK' ? 'bg-primary-100' : 'bg-amber-100'
                      }`}>
                        <Fingerprint className={`w-4 h-4 ${tx.attendanceType === 'MASUK' ? 'text-primary-700' : 'text-amber-700'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800">
                          {tx.attendanceType === 'MASUK' ? 'Scan Masuk' : 'Scan Pulang'}
                        </p>
                        <p className="text-xs text-slate-400 truncate">
                          {formatDate(tx.attendanceDate)} &bull; {tx.deviceId} &bull; {tx.operatorName || 'Operator'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-mono font-black text-slate-700">{formatTime(tx.deviceTimestamp)}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor(tx.attendanceType === 'PULANG' ? 'PULANG' : tx.attendanceStatus)}`}>
                          {tx.attendanceType === 'PULANG' ? 'PULANG' : tx.attendanceStatus}
                        </span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-200 group-hover:text-primary-400 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── PROFIL ──────────────────────────────────────────────────── */}
          {activeNav === 'profil' && (
            <div className="max-w-2xl space-y-5">
              {/* Kartu Profil Utama */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="bg-gradient-to-r from-primary-700 to-emerald-600 px-6 py-8 flex items-center gap-5">
                  <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-xs border border-white/30 flex items-center justify-center shrink-0">
                    <span className="text-white font-black text-2xl">
                      {currentUser.fullName?.charAt(0).toUpperCase() || 'O'}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-white/70 font-semibold mb-1">Orang Tua / Wali Siswa</p>
                    <p className="text-xl font-black text-white leading-tight">{currentUser.fullName}</p>
                    <p className="text-sm text-white/80 mt-1">{currentUser.phone || currentUser.username}</p>
                  </div>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {[
                      { label: 'Nama Orang Tua', value: currentUser.fullName, icon: User },
                      { label: 'Nomor HP Login', value: currentUser.phone || currentUser.username, icon: Phone },
                      { label: 'Nama Siswa', value: student?.name || '—', icon: GraduationCap },
                      { label: 'Kelas', value: student?.className || '—', icon: Shield },
                    ].map(({ label, value, icon: Icon }) => (
                      <div key={label} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                        <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center shrink-0 mt-0.5">
                          <Icon className="w-4 h-4 text-primary-700" />
                        </div>
                        <div>
                          <p className="text-[11px] text-slate-400 font-medium">{label}</p>
                          <p className="text-sm font-bold text-slate-800 mt-0.5">{value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <Button onClick={handleOpenEdit} className="flex items-center gap-2">
                      <Pencil className="w-4 h-4" />
                      Ubah Profil & Password
                    </Button>
                    <Button variant="outline" onClick={onLogout} className="flex items-center gap-2 text-red-600 border-red-200 hover:bg-red-50">
                      <LogOut className="w-4 h-4" />
                      Keluar
                    </Button>
                  </div>
                </div>
              </div>

              {/* Info Madrasah */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
                <p className="text-sm font-black text-slate-800 mb-4 flex items-center gap-2">
                  <Info className="w-4 h-4 text-primary-600" />
                  Informasi Madrasah &amp; Jadwal Operasional
                </p>
                <div className="p-3 bg-primary-50 rounded-xl border border-primary-200 mb-4 text-xs text-primary-950">
                  <p className="font-bold mb-1 text-primary-800">Ketentuan Jam Scan Gerbang:</p>
                  <ul className="list-disc list-inside space-y-1 text-[11px] text-primary-900">
                    <li><strong>Scan Masuk:</strong> {schoolSettings.entryStart.replace(':', '.')} - {schoolSettings.entryLimit.replace(':', '.')} WITA (Tepat Waktu)</li>
                    <li><strong>Terlambat:</strong> {schoolSettings.entryLimit.replace(':', '.')} - {schoolSettings.lateLimit.replace(':', '.')} WITA</li>
                    <li><strong>Gerbang Ditutup:</strong> {schoolSettings.lateLimit.replace(':', '.')} WITA</li>
                    <li><strong>Scan Pulang:</strong> Mulai {schoolSettings.dismissal.replace(':', '.')} WITA</li>
                  </ul>
                </div>
                <div className="space-y-2.5 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                    MAN 1 BULUKUMBA — Jl. Pendidikan, Bulukumba, Sulawesi Selatan
                  </div>
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-slate-400 shrink-0" />
                    Data absensi terenkripsi dan hanya dapat diakses oleh pihak yang berwenang.
                  </div>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* ── MODAL DETAIL TRANSAKSI ───────────────────────────────────────────── */}
      {selectedTx && (
        <Modal
          isOpen={!!selectedTx}
          onClose={() => setSelectedTx(null)}
          title="Detail Presensi"
          description={`${selectedTx.attendanceType === 'MASUK' ? 'Scan Masuk' : 'Scan Pulang'} — ${formatDate(selectedTx.attendanceDate)}`}
        >
          <div className="space-y-3 text-sm">
            {[
              { label: 'Waktu Scan', value: formatTime(selectedTx.deviceTimestamp), icon: Clock },
              { label: 'Status', value: selectedTx.attendanceStatus, icon: CheckCircle2 },
              { label: 'Perangkat', value: selectedTx.deviceId, icon: MapPin },
              { label: 'Operator', value: selectedTx.operatorName || selectedTx.operatorId, icon: User },
              { label: 'Metode', value: selectedTx.method.replace(/_/g, ' '), icon: Fingerprint },
              ...(selectedTx.note ? [{ label: 'Catatan', value: selectedTx.note, icon: Info }] : []),
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-primary-700" />
                </div>
                <div>
                  <p className="text-[11px] text-slate-400">{label}</p>
                  <p className="font-bold text-slate-800">{value}</p>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* ── MODAL EDIT PROFIL ────────────────────────────────────────────────── */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Ubah Profil & Password"
        description="Nomor HP digunakan sebagai ID login portal orang tua."
      >
        <form onSubmit={handleSaveProfile} className="space-y-4">
          {editMsg && (
            <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
              editMsg.type === 'success'
                ? 'bg-primary-50 border border-primary-200 text-primary-800'
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}>
              {editMsg.type === 'success'
                ? <Check className="w-4 h-4 shrink-0 text-primary-600" />
                : <AlertCircle className="w-4 h-4 shrink-0" />}
              {editMsg.text}
            </div>
          )}
          <Input label="Nama Lengkap" value={editName} onChange={(e) => setEditName(e.target.value)} required />
          <Input label="Nomor HP / Telepon" leftIcon={<Phone className="w-4 h-4" />} value={editPhone} onChange={(e) => setEditPhone(e.target.value)} required />
          <Input label="Password Baru (isi jika ingin ubah)" type="password" leftIcon={<Lock className="w-4 h-4" />} value={editPass} onChange={(e) => setEditPass(e.target.value)} />
          <Input label="Konfirmasi Password Baru" type="password" leftIcon={<Lock className="w-4 h-4" />} value={editPassConfirm} onChange={(e) => setEditPassConfirm(e.target.value)} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" type="button" onClick={() => setIsEditOpen(false)}>Batal</Button>
            <Button type="submit" disabled={isSaving} className="bg-primary-600 text-white">
              {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

