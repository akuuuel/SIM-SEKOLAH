import React, { useState, useEffect, useMemo } from 'react';
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
  MessageSquare,
  User,
  Menu,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Clock,
  CheckCircle2,
  AlertCircle,
  BellRing,
  Phone,
  Lock,
  Check,
  GraduationCap,
  Pencil,
  LogOut,
  MapPin,
  Fingerprint,
  Play,
  Info,
  Shield,
  Activity,
  HeartPulse,
  UserMinus,
  UserCheck,
  Calendar,
  Sparkles,
  Download,
  Smartphone,
  Share,
  RefreshCw,
  Volume2,
  X,
  WifiOff,
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
  triggerPWANotification,
  playNotificationChime,
  subscribeToWebPush,
  triggerTestPushFromServer,
} from '../../lib/pwaNotification';
import { checkIsDayOff } from '../../services/holidayService';
import { syncParentPortalData, validateUserSession, saveParentToServer, fetchMasterStudentsFromSheets } from '../../services/syncService';
import { Swal } from '../../lib/swal';

export interface ParentDashboardProps {
  currentUser: UserAccount;
  onLogout?: () => void;
}

/**
 * Helper untuk mengambil nama dominan/panggilan siswa agar tidak terlalu panjang di card mobile
 */
const getDominantName = (fullName: string): string => {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  const honorifics = ['muhammad', 'muh', 'muh.', 'm', 'm.', 'andi', 'a.', 'nur', 'st.', 'siti', 'raden'];
  if (parts.length > 1 && honorifics.includes(parts[0].toLowerCase())) {
    return parts[1];
  }
  return parts[0];
};

export const ParentDashboard: React.FC<ParentDashboardProps> = ({ currentUser, onLogout }) => {
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

  // Alias: ID siswa yang aktif digunakan di semua fungsi notifikasi & sinkronisasi
  const studentId = activeStudentId || currentUser.studentId || '';

  // ── 1. Data Siswa Aktif ───────────────────────────────────────────────────
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

  // ── 2A. Transaksi Siswa Aktif (Untuk Beranda & Rekap Siswa Terpilih) ───────
  const allStudentTransactions = useLiveQuery(
    async () => {
      if (!activeStudentId) return [];
      const trimmed = String(activeStudentId).trim();
      const records = await db.transactions
        .where('studentId')
        .equals(trimmed)
        .toArray();
      if (records.length > 0) {
        return records.sort(
          (a, b) => new Date(b.deviceTimestamp).getTime() - new Date(a.deviceTimestamp).getTime()
        );
      }
      const all = await db.transactions.toArray();
      return all
        .filter((t) => String(t.studentId).trim().toLowerCase() === trimmed.toLowerCase())
        .sort((a, b) => new Date(b.deviceTimestamp).getTime() - new Date(a.deviceTimestamp).getTime());
    },
    [activeStudentId]
  ) || [];

  // ── 2B. Daftar Seluruh ID Siswa Milik Orang Tua Ini (Dukungan Multi-Anak) ─
  const parentAllStudentIds = useMemo(() => {
    const ids = new Set<string>();
    myStudents.forEach((s) => ids.add(s.id));
    if (currentUser.studentId) ids.add(currentUser.studentId);
    if (Array.isArray(currentUser.studentIds)) {
      currentUser.studentIds.forEach((id) => ids.add(id));
    }
    if (activeStudentId) ids.add(activeStudentId);
    return Array.from(ids).filter(Boolean);
  }, [myStudents, currentUser.studentId, currentUser.studentIds, activeStudentId]);

  // Map pencarian cepat nama siswa berdasarkan studentId
  const studentMap = useMemo(() => {
    const map = new Map<string, any>();
    myStudents.forEach((s) => map.set(s.id, s));
    if (student) map.set(student.id, student);
    return map;
  }, [myStudents, student]);

  // ── 2C. Seluruh Transaksi SEMUA Anak (Real-time untuk Tab Notifikasi & Watcher) ──
  const allChildrenTransactions = useLiveQuery(
    async () => {
      const records = await db.transactions.toArray();
      const idSet = new Set(parentAllStudentIds.map((id) => String(id).trim()));

      // Jika idSet tersedia, prioritaskan transaksi milik anak-anak orang tua ini
      const filtered = idSet.size > 0
        ? records.filter((t) => idSet.has(String(t.studentId).trim()))
        : records;

      return filtered.sort((a, b) => {
        const timeB = new Date(b.deviceTimestamp || (b.attendanceDate + 'T00:00:00')).getTime();
        const timeA = new Date(a.deviceTimestamp || (a.attendanceDate + 'T00:00:00')).getTime();
        return timeB - timeA;
      });
    },
    [parentAllStudentIds]
  ) || [];

  // ── Daftar Riwayat Notifikasi Bersih Tanpa Duplikat untuk SEMUA ANAK (Terbaru di Paling Atas) ──
  const uniqueNotificationTransactions = useMemo(() => {
    const seen = new Set<string>();
    const list: AttendanceTransaction[] = [];
    for (const trx of allChildrenTransactions) {
      const key = `${trx.studentId}_${trx.attendanceDate}_${trx.attendanceType}`;
      if (!seen.has(key)) {
        seen.add(key);
        list.push(trx);
      }
    }
    // Pastikan urutan selalu yang paling baru berada di paling atas
    return list.sort((a, b) => {
      const timeB = new Date(b.deviceTimestamp || (b.attendanceDate + 'T00:00:00')).getTime();
      const timeA = new Date(a.deviceTimestamp || (a.attendanceDate + 'T00:00:00')).getTime();
      return timeB - timeA;
    });
  }, [allChildrenTransactions]);

  // ── 3. Tab State (Home, Rekap, Pesan, Profil) ──────────────────────────────
  const [activeTab, setActiveTab] = useState<'home' | 'rekap' | 'notif' | 'profil'>('home');

  // ── 4. Kalender & Tanggal Terpilih (Sesuai Waktu Lokal WITA) ─────────────
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => getLocalDateString(today), [today]);
  const [selectedDate, setSelectedDate] = useState(todayStr);

  // ── Modal Kalender Kustom Tema Madrasah ──────────────────────────────────
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [calendarViewDate, setCalendarViewDate] = useState<Date>(() => new Date(today));

  // Buat 7 hari dalam minggu ini (Senin - Minggu)
  const weekDays = useMemo(() => {
    const list = [];
    const d = new Date(today);
    const dayOfWeek = d.getDay(); // 0: Sun, 1: Mon, ...
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    d.setDate(d.getDate() + diffToMonday);

    const dayShortNames = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

    for (let i = 0; i < 7; i++) {
      const current = new Date(d);
      current.setDate(d.getDate() + i);
      const iso = getLocalDateString(current);
      list.push({
        date: iso,
        dayName: dayShortNames[i],
        dayNum: current.getDate(),
        isToday: iso === todayStr,
      });
    }
    return list;
  }, [today, todayStr]);

  // Transaksi hari ini
  const todayTransactions = useMemo(
    () => allStudentTransactions.filter((t) => t.attendanceDate === todayStr),
    [allStudentTransactions, todayStr]
  );
  const morningTx = todayTransactions.find((t) => t.attendanceType === 'MASUK');
  const departureTx = todayTransactions.find((t) => t.attendanceType === 'PULANG');

  // Status hari libur hari ini & tanggal terpilih
  const todayDayOff = useMemo(() => checkIsDayOff(todayStr), [todayStr]);
  const selectedDayOff = useMemo(() => checkIsDayOff(selectedDate), [selectedDate]);

  // Transaksi pada tanggal yang dipilih di kalender (diurutkan terbaru di atas / DESCENDING)
  const selectedDateTransactions = useMemo(() => {
    return allStudentTransactions
      .filter((t) => t.attendanceDate === selectedDate)
      .sort(
        (a, b) => new Date(b.deviceTimestamp).getTime() - new Date(a.deviceTimestamp).getTime()
      );
  }, [allStudentTransactions, selectedDate]);

  // Mapping status kehadiran tiap tanggal untuk dot indikator kalender
  const datesStatusMap = useMemo(() => {
    const map: Record<string, 'HADIR' | 'TERLAMBAT' | 'IZIN' | 'ALFA'> = {};
    for (const t of allStudentTransactions) {
      if (t.attendanceType === 'MASUK') {
        if (t.attendanceStatus === 'HADIR') map[t.attendanceDate] = 'HADIR';
        else if (t.attendanceStatus === 'TERLAMBAT') map[t.attendanceDate] = 'TERLAMBAT';
        else if (['IZIN', 'SAKIT', 'BK'].includes(t.attendanceStatus)) map[t.attendanceDate] = 'IZIN';
        else if (t.attendanceStatus === 'ALFA') map[t.attendanceDate] = 'ALFA';
      }
    }
    return map;
  }, [allStudentTransactions]);

  // ── 5. Statistik Kehadiran Bulan Ini ───────────────────────────────────────
  const currentMonth = todayStr.substring(0, 7);
  const monthTransactions = useMemo(
    () => allStudentTransactions.filter(
      (t) => t.attendanceDate?.startsWith(currentMonth) && t.attendanceType === 'MASUK'
    ),
    [allStudentTransactions, currentMonth]
  );

  const countHadir = monthTransactions.filter((t) => t.attendanceStatus === 'HADIR').length;
  const countTerlambat = monthTransactions.filter((t) => t.attendanceStatus === 'TERLAMBAT').length;
  const countIzinSakit = monthTransactions.filter((t) => ['IZIN', 'SAKIT', 'BK'].includes(t.attendanceStatus)).length;
  const countAlfa = monthTransactions.filter((t) => t.attendanceStatus === 'ALFA').length;
  const totalDays = monthTransactions.length;
  // Tingkat kehadiran tepat waktu (disiplin madrasah: hanya hadir tepat waktu yang dihitung 100%)
  const attendanceRate = totalDays > 0
    ? Math.round((countHadir / totalDays) * 100)
    : 0;

  // ── 6. State Modal Detail Presensi ─────────────────────────────────────────
  const [selectedTxDetail, setSelectedTxDetail] = useState<AttendanceTransaction | null>(null);

  // ── 7. Notifikasi PWA & Floating Banner Layar HP ───────────────────────────
  const [permissionState, setPermissionState] = useState<'granted' | 'denied' | 'default' | 'unsupported'>('default');
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [isNotifActive, setIsNotifActive] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      localStorage.getItem('parent_notif_enabled') === 'true' ||
      (typeof Notification !== 'undefined' && Notification.permission === 'granted')
    );
  });
  const [liveNotification, setLiveNotification] = useState<{
    title: string;
    body: string;
    time: string;
    status: string;
    type: string;
  } | null>(null);

  // State: apakah HP sudah terdaftar di server push (untuk menyembunyikan tombol Uji)
  const [isSubscribed, setIsSubscribed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('parent_push_subscribed') === 'true';
  });

  // State: tombol uji notifikasi hanya bisa diuji sekali, lalu hilang permanen
  const [hasTestedNotif, setHasTestedNotif] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('parent_notif_tested') === 'true';
  });

  // State: modal panduan pop-up mengambang & layar kunci HP
  const [isLockScreenGuideOpen, setIsLockScreenGuideOpen] = useState(false);
  const [lockScreenCountdown, setLockScreenCountdown] = useState<number | null>(null);

  // Badge count notifikasi belum dibaca
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const perm = getNotificationPermission();
    setPermissionState(perm);
    if (perm === 'granted' || localStorage.getItem('parent_notif_enabled') === 'true') {
      setIsNotifActive(true);
    }
  }, []);

  // ── Listener: Tangkap Notifikasi Push dari Service Worker & Custom Event ──
  // Menampilkan pop-up floating banner langsung di layar HP Android & bunyikan chime
  useEffect(() => {
    const handlePushEvent = (title?: string, body?: string, timeStr?: string, pushTag?: string) => {
      if (pushTag) {
        localStorage.setItem(`pwa_notified_tag_${pushTag}`, 'true');
      }
      setLiveNotification({
        title: title || 'Pemberitahuan Presensi',
        body: body || 'Catatan presensi siswa diterima.',
        time: timeStr || formatTime(new Date().toISOString()),
        status: 'HADIR',
        type: 'MASUK',
      });
      setUnreadCount((prev) => prev + 1);
      playNotificationChime();
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate([300, 100, 300, 100, 400]);
        } catch (_) {}
      }
    };

    const handleSwMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'PUSH_NOTIFICATION_RECEIVED') {
        handlePushEvent(event.data.title, event.data.body, event.data.time, event.data.tag);
      }
    };

    const handleLocalCustomNotif = (event: Event) => {
      const customEvt = event as CustomEvent;
      if (customEvt.detail) {
        handlePushEvent(customEvt.detail.title, customEvt.detail.body);
      }
    };

    if (typeof window !== 'undefined') {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', handleSwMessage);
      }
      window.addEventListener('pwa-notification-triggered', handleLocalCustomNotif);
    }

    return () => {
      if (typeof window !== 'undefined') {
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.removeEventListener('message', handleSwMessage);
        }
        window.removeEventListener('pwa-notification-triggered', handleLocalCustomNotif);
      }
    };
  }, []);

  // Tutup floating notification otomatis setelah 10 detik
  useEffect(() => {
    if (!liveNotification) return;
    const timer = setTimeout(() => setLiveNotification(null), 10000);
    return () => clearTimeout(timer);
  }, [liveNotification]);

  // Otomatis daftarkan Web Push jika izin notifikasi sudah granted
  useEffect(() => {
    if (permissionState === 'granted' || isNotifActive) {
      subscribeToWebPush(
        currentUser.userId,
        studentId,
        currentUser.phone || currentUser.username
      ).then((res) => {
        if (res && res.success) {
          localStorage.setItem('parent_push_subscribed', 'true');
          setIsSubscribed(true);
        }
      }).catch(() => {});
    }
  }, [permissionState, isNotifActive, currentUser.userId, studentId, currentUser.phone, currentUser.username]);

  const handleEnableNotification = async () => {
    setIsRequestingPermission(true);
    playNotificationChime();

    const subRes = await subscribeToWebPush(
      currentUser.userId,
      studentId,
      currentUser.phone || currentUser.username
    );

    setIsRequestingPermission(false);

    if (subRes.success) {
      localStorage.setItem('parent_notif_enabled', 'true');
      localStorage.setItem('parent_push_subscribed', 'true');
      setIsNotifActive(true);
      setIsSubscribed(true);
      setLiveNotification({
        title: 'Notifikasi HP Berhasil Aktif 🎉',
        body: 'HP Anda berhasil terhubung ke server push. Notifikasi akan tetap masuk meski aplikasi ditutup.',
        time: formatTime(new Date().toISOString()),
        status: 'HADIR',
        type: 'MASUK',
      });
      await triggerPWANotification({
        title: 'Notifikasi PWA Aktif 🎉',
        body: `Pemberitahuan absensi ${student?.name || 'anak Anda'} kini aktif langsung di HP ini.`,
        tag: 'welcome-parent-pwa',
      }).catch(() => {});
    } else {
      localStorage.removeItem('parent_notif_enabled');
      setIsNotifActive(false);
      const isIphoneMsg = subRes.error && subRes.error.includes('iPhone');
      setLiveNotification({
        title: isIphoneMsg ? '🍎 Khusus Pengguna iPhone' : '⚠️ Gagal Mengaktifkan Notifikasi',
        body: subRes.error || 'Gagal mendaftarkan HP ke server notifikasi.',
        time: formatTime(new Date().toISOString()),
        status: 'TERLAMBAT',
        type: 'MASUK',
      });
      if (isIphoneMsg) {
        setIsInstallGuideOpen(true);
      }
    }
  };

  // Uji coba notifikasi suara & getar langsung di HP (Hanya 1x pengujian lalu tombol hilang)
  const handleTestNotification = async () => {
    localStorage.setItem('parent_notif_tested', 'true');
    setHasTestedNotif(true);
    playNotificationChime();

    // Otomatis munculkan modal panduan pop-up & layar kunci saat pertama kali uji coba
    setTimeout(() => {
      setIsLockScreenGuideOpen(true);
    }, 1500);

    setLiveNotification({
      title: 'Mendaftarkan ke Server Push...',
      body: 'Menghubungkan perangkat Anda ke server Web Push...',
      time: formatTime(new Date().toISOString()),
      status: 'HADIR',
      type: 'MASUK',
    });

    // Otomatis pastikan HP terdaftar ke server push MySQL dengan kunci VAPID terbaru
    const subRes = await subscribeToWebPush(
      currentUser.userId,
      studentId,
      currentUser.phone || currentUser.username
    );

    if (!subRes.success) {
      // Fallback: picu notifikasi lokal jika belum terdaftar ke push server
      triggerPWANotification({
        title: '🔔 Uji Notifikasi Presensi',
        body: 'Tes notifikasi lokal berhasil aktif di HP ini.',
        tag: 'test-pwa-' + (studentId || Date.now()),
      }).catch(() => {});

      setLiveNotification({
        title: '⚠️ Mode Notifikasi Lokal Aktif',
        body: subRes.error || 'Server push belum terhubung, notifikasi lokal tetap aktif di HP.',
        time: formatTime(new Date().toISOString()),
        status: 'HADIR',
        type: 'MASUK',
      });
      return;
    }

    localStorage.setItem('parent_push_subscribed', 'true');
    setIsSubscribed(true);

    setLiveNotification({
      title: 'Menguji Sinyal Server...',
      body: 'Perangkat terdaftar! Mengirim sinyal Web Push dari server ke HP Anda...',
      time: formatTime(new Date().toISOString()),
      status: 'HADIR',
      type: 'MASUK',
    });

    const pushRes = await triggerTestPushFromServer(
      studentId,
      currentUser.phone || currentUser.username
    );

    if (pushRes.success) {
      localStorage.setItem('parent_push_subscribed', 'true');
      setIsSubscribed(true);
      setLiveNotification({
        title: '🔔 Push Notif Berhasil Masuk!',
        body: 'Sinyal Web Push dari server berhasil diterima HP ini! Notifikasi akan tetap berdering walau aplikasi ditutup total.',
        time: formatTime(new Date().toISOString()),
        status: 'HADIR',
        type: 'MASUK',
      });
    } else {
      // Fallback lokal jika server gagal mengirim
      triggerPWANotification({
        title: '🔔 Uji Notifikasi Presensi',
        body: 'Tes notifikasi lokal berhasil aktif di HP ini.',
        tag: 'test-pwa-' + (studentId || Date.now()),
      }).catch(() => {});

      setLiveNotification({
        title: '⚠️ Status Uji Push Server',
        body: pushRes.error || 'Server tidak dapat mengirim push notif ke HP ini. Notifikasi lokal tetap aktif.',
        time: formatTime(new Date().toISOString()),
        status: 'ALFA',
        type: 'MASUK',
      });
    }
  };

  // Uji coba notifikasi pop-up di layar kunci (Lock Screen) saat HP dimatikan/terkunci (Jeda 5 detik)
  const handleTestLockScreenNotification = async () => {
    localStorage.setItem('parent_notif_tested', 'true');
    setHasTestedNotif(true);
    playNotificationChime();

    // 1. Pastikan HP terdaftar ke server push
    const subRes = await subscribeToWebPush(
      currentUser.userId,
      studentId,
      currentUser.phone || currentUser.username
    );

    if (!subRes.success) {
      setLiveNotification({
        title: '⚠️ Gagal Terhubung ke Server',
        body: subRes.error || 'Pastikan izin notifikasi aktif di browser HP.',
        time: formatTime(new Date().toISOString()),
        status: 'HADIR',
        type: 'MASUK',
      });
      return;
    }

    localStorage.setItem('parent_push_subscribed', 'true');
    setIsSubscribed(true);

    // 2. Mulai countdown 5 detik
    setLockScreenCountdown(5);
    setLiveNotification({
      title: '⏱️ Segera Kunci Layar HP Anda!',
      body: 'Tekan tombol Power untuk mematikan layar HP Anda sekarang! Pop-up notifikasi akan muncul di Layar Kunci dalam 5 detik...',
      time: formatTime(new Date().toISOString()),
      status: 'HADIR',
      type: 'MASUK',
    });

    // Kirim request ke backend dengan delay 5 detik
    triggerTestPushFromServer(
      studentId,
      currentUser.phone || currentUser.username,
      5
    ).catch(() => {});

    // Otomatis munculkan panduan setelah jeda kunci layar selesai
    setTimeout(() => {
      setIsLockScreenGuideOpen(true);
    }, 6000);

    // Countdown timer untuk UI
    let remaining = 5;
    const timer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(timer);
        setLockScreenCountdown(null);
      } else {
        setLockScreenCountdown(remaining);
      }
    }, 1000);
  };

  // Transaksi hari ini untuk SEMUA anak (agar watcher mendeteksi scan tiap anak secara real-time)
  const todayAllChildrenTransactions = useMemo(
    () => allChildrenTransactions.filter((t) => t.attendanceDate === todayStr),
    [allChildrenTransactions, todayStr]
  );

  // Real-time watcher: memicu notifikasi saat ada scan baru anak hari ini
  useEffect(() => {
    if (todayAllChildrenTransactions.length === 0) return;

    for (const tx of todayAllChildrenTransactions) {
      // Kunci deterministik per sesi scan anak hari ini (mencegah pemicuan ganda/double)
      const uniqueStateKey = `pwa_notified_${tx.studentId}_${tx.attendanceDate}_${tx.attendanceType}`;
      const cleanDate = tx.attendanceDate.replace(/[^0-9]/g, '');
      const pushTagKey = `pwa_notified_tag_tx-${tx.studentId}-${tx.attendanceType}-${cleanDate}`;

      // Lewati jika sudah pernah dinotifikasikan via Web Push atau di sesi ini
      if (localStorage.getItem(uniqueStateKey) || localStorage.getItem(pushTagKey)) {
        continue;
      }

      localStorage.setItem(uniqueStateKey, 'true');

      const txStudent = studentMap.get(tx.studentId);
      const studentName = tx.studentName || txStudent?.name || 'Anak Anda';

      let msg = '';
      if (tx.attendanceType === 'MASUK') {
        if (tx.attendanceStatus === 'HADIR') {
          msg = `${studentName} telah tiba di madrasah dan scan MASUK tepat waktu (${formatTime(tx.deviceTimestamp)} WITA).`;
        } else if (tx.attendanceStatus === 'TERLAMBAT') {
          msg = `${studentName} tiba di madrasah dan scan MASUK (Terlambat) pukul ${formatTime(tx.deviceTimestamp)} WITA.`;
        } else {
          msg = `Catatan presensi ${studentName}: [${tx.attendanceStatus}] (${tx.note || 'keterangan dicatat'}).`;
        }
      } else {
        msg = `${studentName} telah scan PULANG pukul ${formatTime(tx.deviceTimestamp)} WITA. Sedang dalam perjalanan pulang.`;
      }

      // 1. Tampilkan floating banner di layar HP (bekerja 100% di semua browser HP)
      setLiveNotification({
        title: tx.attendanceType === 'MASUK' ? 'Siswa Tiba di Madrasah' : 'Siswa Scan Pulang',
        body: msg,
        time: formatTime(tx.deviceTimestamp),
        status: tx.attendanceStatus,
        type: tx.attendanceType,
      });

      // Tambah badge count notifikasi belum dibaca
      setUnreadCount((prev) => prev + 1);

      // 2. Bunyikan suara chime & getar HP
      playNotificationChime();

      // 3. Picu notifikasi sistem PWA HANYA jika tab tidak aktif / di latar belakang DAN Web Push belum aktif
      // Hal ini mencegah notifikasi sistem ganda (double) saat push server sudah mengirim
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden' && !isSubscribed) {
        triggerPWANotification({
          title: 'Presensi Siswa MAN 1 BULUKUMBA',
          body: msg,
          tag: `tx-${tx.studentId}-${tx.attendanceType}-${cleanDate}`,
        }).catch(() => {});
      }
    }
  }, [todayAllChildrenTransactions, studentMap, isSubscribed]);

  // Hitung jumlah notifikasi belum dibaca dari riwayat saat awal buka aplikasi
  useEffect(() => {
    if (!allStudentTransactions || allStudentTransactions.length === 0) return;
    const lastSeenTime = localStorage.getItem('parent_last_seen_notif_time');
    if (!lastSeenTime) {
      // Jika baru pertama kali buka, hitung transaksi hari ini sebagai unread
      const count = todayTransactions.length;
      setUnreadCount(count);
    } else {
      const unseen = allStudentTransactions.filter(
        (t) => new Date(t.deviceTimestamp).getTime() > new Date(lastSeenTime).getTime()
      ).length;
      setUnreadCount(unseen);
    }
  }, [allStudentTransactions, todayTransactions]);

  const handleOpenNotifTab = () => {
    setActiveTab('notif');
    setUnreadCount(0);
    localStorage.setItem('parent_last_seen_notif_time', new Date().toISOString());
  };

  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const handleDownloadReportPdf = async () => {
    const phone = currentUser.phone || currentUser.username || '';
    const sId = studentId || student?.id || '';
    const month = currentMonth;
    const url = `/api/export_parent_report.php?studentId=${encodeURIComponent(sId)}&phone=${encodeURIComponent(phone)}&month=${encodeURIComponent(month)}`;
    const cleanName = (student?.name || 'Siswa').replace(/[^A-Za-z0-9_-]/g, '_');
    const fileName = `Laporan_Kehadiran_${cleanName}_${month}.pdf`;

    setIsDownloadingPdf(true);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Gagal mengambil file PDF.');
      const blob = await response.blob();

      // Jika mendukung Web Share API untuk file (iPhone Safari / Android Chrome):
      // Muncul dialog sistem: "Simpan ke File" (iOS Files) atau "Simpan ke Drive / File Saya" (Android)
      const pdfFile = new File([blob], fileName, { type: 'application/pdf' });
      if (typeof navigator !== 'undefined' && (navigator as any).canShare && (navigator as any).canShare({ files: [pdfFile] })) {
        try {
          await (navigator as any).share({
            files: [pdfFile],
            title: 'Laporan Kehadiran Siswa',
            text: `Laporan Kehadiran ${student?.name || 'Siswa'} MAN 1 BULUKUMBA (${month})`,
          });
          setIsDownloadingPdf(false);
          return;
        } catch (shareErr: any) {
          if (shareErr.name === 'AbortError') {
            setIsDownloadingPdf(false);
            return;
          }
        }
      }

      // Download langsung ke perangkat (Folder File / Download / Galeri Dokumen)
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 3000);
    } catch {
      // Fallback
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // ── 7B. Auto-sinkron data siswa & absensi dari MySQL saat portal dibuka ───────
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
        Swal.error('Akses Dicabut', result.error || 'Akun orang tua ini telah dihapus oleh Administrator madrasah.');
        return;
      }
      if (result.success) {
        setSyncMsg(`Data berhasil dimuat: ${result.transactionsCount ?? 0} catatan absensi ditemukan.`);
        if (!studentId && result.student?.id) {
          const updatedUser = { ...currentUser, studentId: result.student.id };
          await db.users.update(currentUser.userId, { studentId: result.student.id });
          setStoredUser(updatedUser);
        }
      } else {
        setSyncMsg(`Gagal memuat data dari server (${result.error || 'koneksi terputus'}). Data yang tampil adalah data terakhir yang tersimpan di HP.`);
      }
    } catch {
      setSyncMsg('Gagal menghubungi server. Pastikan Anda terhubung ke jaringan madrasah (Wi-Fi sekolah).');
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

  // Sinkronisasi seketika saat beralih anak (Multi-Anak)
  useEffect(() => {
    if (activeStudentId) {
      handleSyncData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStudentId]);

  // Sinkronisasi otomatis saat orang tua membuka tab Rekap / Statistik Kehadiran
  useEffect(() => {
    if (activeTab === 'rekap') {
      handleSyncData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Auto-sync saat komponen mount & seketika saat HP kembali terhubung ke internet
  useEffect(() => {
    handleSyncData();

    const handleOnline = () => {
      handleSyncData();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Pull-to-Refresh Gesture (Tarik Turun untuk Memuat Ulang Data) ────────────
  const [pullY, setPullY] = useState(0);
  const touchStartY = React.useRef<number>(0);
  const isDragging = React.useRef<boolean>(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY <= 0 && !isSyncing) {
      touchStartY.current = e.touches[0].clientY;
      isDragging.current = true;
    } else {
      isDragging.current = false;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current || isSyncing) return;
    const currentY = e.touches[0].clientY;
    const dy = currentY - touchStartY.current;
    if (dy > 0 && window.scrollY <= 0) {
      const distance = Math.min(dy * 0.45, 75);
      setPullY(distance);
    } else {
      setPullY(0);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (pullY >= 48 && !isSyncing) {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try { navigator.vibrate(35); } catch (_) {}
      }
      handleSyncData().finally(() => {
        setPullY(0);
      });
    } else {
      setPullY(0);
    }
  };

  // Polling data presensi dari MySQL setiap 10 detik agar HP langsung update otomatis saat anak discan di gerbang
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

  // ── 8. Modal Info Madrasah & Menu Cepat ─────────────────────────────────────
  const [isInfoMenuOpen, setIsInfoMenuOpen] = useState(false);

  // ── 8A. Jadwal Sekolah Dinamis (sinkron dari server/admin) ─────────────────
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

  // ── 8B. Status & Aksi Instalasi PWA ─────────────────────────────────────────
  const [isPWAInstalled, setIsPWAInstalled] = useState(false);
  const [canInstallPWA, setCanInstallPWA] = useState(false);
  const [isInstallGuideOpen, setIsInstallGuideOpen] = useState(false);

  useEffect(() => {
    // Periksa apakah aplikasi sudah terpasang (display-mode standalone)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsPWAInstalled(isStandalone);

    if ((window as any).deferredPWAInstallPrompt) {
      setCanInstallPWA(true);
    }

    const onInstallable = () => setCanInstallPWA(true);
    const onAppInstalled = () => {
      setIsPWAInstalled(true);
      setCanInstallPWA(false);
    };

    window.addEventListener('pwa-installable', onInstallable);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('pwa-installable', onInstallable);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const handleInstallPWA = async () => {
    const promptEvent = (window as any).deferredPWAInstallPrompt;
    if (promptEvent) {
      promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice && choice.outcome === 'accepted') {
        setIsPWAInstalled(true);
      }
      (window as any).deferredPWAInstallPrompt = null;
      setCanInstallPWA(false);
    } else {
      // Jika browser tidak mendukung auto-prompt (seperti iOS Safari atau HTTP IP lokal), buka panduan instalasi
      setIsInstallGuideOpen(true);
    }
  };

  // ── 9. Modal Edit Profil & Ganti Password ─────────────────────────────────
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [editPhone, setEditPhone] = useState(currentUser.phone || currentUser.username || '');
  const [editFullName, setEditFullName] = useState(currentUser.fullName || '');
  const [editPassword, setEditPassword] = useState('');
  const [editPasswordConfirm, setEditPasswordConfirm] = useState('');
  const [editMsg, setEditMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleOpenEditModal = () => {
    setEditPhone(currentUser.phone || currentUser.username || '');
    setEditFullName(currentUser.fullName || '');
    setEditPassword('');
    setEditPasswordConfirm('');
    setEditMsg(null);
    setIsEditProfileOpen(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditMsg(null);

    const cleanPhone = normalizePhoneNumber(editPhone);
    if (!isValidIndonesianPhone(cleanPhone)) {
      setEditMsg({ type: 'error', text: 'Nomor HP tidak valid. Masukkan nomor aktif (contoh: 081234567890).' });
      return;
    }

    if (!editFullName.trim()) {
      setEditMsg({ type: 'error', text: 'Nama lengkap wajib diisi.' });
      return;
    }

    if (editPassword && editPassword.length < 6) {
      setEditMsg({ type: 'error', text: 'Password baru minimal 6 karakter.' });
      return;
    }

    if (editPassword && editPassword !== editPasswordConfirm) {
      setEditMsg({ type: 'error', text: 'Konfirmasi password tidak cocok.' });
      return;
    }

    setIsUpdating(true);
    try {
      const oldPhone = currentUser.phone || currentUser.username || '';
      const updates: Partial<UserAccount> = {
        phone: cleanPhone,
        username: cleanPhone,
        fullName: editFullName.trim(),
      };

      if (editPassword) {
        updates.passwordHash = await hashPassword(editPassword);
      } else {
        // Ambil passwordHash yang tersimpan di IndexedDB db.users jika currentUser.passwordHash kosong
        const existingInDb = await db.users.get(currentUser.userId);
        if (existingInDb?.passwordHash) {
          updates.passwordHash = existingInDb.passwordHash;
        }
      }

      // Kumpulkan seluruh ID anak yang terhubung ke orang tua ini
      const targetStudentIds = new Set<string>();
      if (currentUser.studentId) targetStudentIds.add(currentUser.studentId);
      if (Array.isArray(currentUser.studentIds)) {
        currentUser.studentIds.forEach((id) => targetStudentIds.add(id));
      }
      myStudents.forEach((s) => targetStudentIds.add(s.id));
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

      // Perbarui nomor WA orang tua & nama wali di database siswa lokal IndexedDB
      for (const sId of targetList) {
        await db.students.update(sId, {
          parentName: editFullName.trim(),
          whatsappNumber: cleanPhone,
          updatedAt: new Date().toISOString(),
        });
      }

      // Sinkronkan ke server MySQL (tabel orang_tua, siswa, users)
      const saveRes = await saveParentToServer(updatedUser, oldPhone);

      if (!saveRes.success) {
        setEditMsg({
          type: 'error',
          text: `Gagal memperbarui ke server database: ${saveRes.error || 'Server tidak merespon'}. Pastikan Apache & MySQL di laptop aktif.`,
        });
        setIsUpdating(false);
        return;
      }

      // Mutasi currentUser prop reference agar sesi aktif langsung memegang data baru
      currentUser.phone = cleanPhone;
      currentUser.username = cleanPhone;
      currentUser.fullName = editFullName.trim();
      if (updates.passwordHash) currentUser.passwordHash = updates.passwordHash;
      if (targetList.length > 0) currentUser.studentIds = targetList;

      // Tarik pembaruan master data siswa dari server jika online
      fetchMasterStudentsFromSheets().catch(() => {});

      setEditMsg({
        type: 'success',
        text: 'Nomor HP dan profil berhasil diperbarui & tersinkron ke database MySQL serta data siswa!',
      });
      setTimeout(() => setIsEditProfileOpen(false), 1400);
    } catch (err: any) {
      setEditMsg({ type: 'error', text: err?.message || 'Gagal memperbarui profil.' });
    } finally {
      setIsUpdating(false);
    }
  };

  // Helper render badge status kehadiran
  const renderStatusChip = (status?: string, type?: string) => {
    if (!status && !type) return null;

    // Sesi pulang tidak boleh berstatus "Hadir Tepat", melainkan "Pulang"
    if (type === 'PULANG' || status === 'PULANG') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          Pulang
        </span>
      );
    }

    switch (status) {
      case 'HADIR':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-primary-50 text-primary-700 border border-primary-200">
            <CheckCircle2 className="w-3 h-3 text-primary-600" />
            Hadir Tepat
          </span>
        );
      case 'TERLAMBAT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-600" />
            Terlambat
          </span>
        );
      case 'IZIN':
      case 'SAKIT':
      case 'BK':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <HeartPulse className="w-3 h-3 text-blue-600" />
            {status}
          </span>
        );
      case 'ALFA':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-200">
            <UserMinus className="w-3 h-3 text-red-600" />
            Alfa
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="flex flex-col min-h-screen bg-canvas text-slate-800 pb-20 select-none relative"
    >
      {/* ── SUBTLE EDUCATION WATERMARK BACKDROP ── */}
      <EducationBackdrop />

      {/* ── PULL-TO-REFRESH INDICATOR ── */}
      <div
        className="overflow-hidden transition-all duration-200 flex items-center justify-center pointer-events-none relative z-10"
        style={{
          height: isSyncing ? '44px' : `${pullY}px`,
          opacity: pullY > 10 || isSyncing ? 1 : 0,
        }}
      >
        <div className="flex items-center gap-2 px-3.5 py-1 rounded-full bg-white border border-emerald-200 shadow-sm text-xs font-semibold text-emerald-800 my-1">
          <RefreshCw
            className={`w-3.5 h-3.5 text-emerald-600 ${isSyncing ? 'animate-spin' : ''}`}
            style={{ transform: !isSyncing ? `rotate(${pullY * 4.5}deg)` : undefined }}
          />
          <span>
            {isSyncing
              ? 'Memperbarui data absensi...'
              : pullY >= 48
              ? 'Lepaskan untuk memperbarui'
              : 'Tarik turun untuk refresh'}
          </span>
        </div>
      </div>

      {/* ── TOP BAR — Apple Style Translucent Blur Effect & Edlink Accent ── */}
      <header className="apple-glass-nav border-b border-[#e1ede4]/80 border-t-2 border-t-emerald-600 h-14 px-4 flex items-center justify-between shrink-0 sticky top-0 z-30 select-none">
        {/* Kiri: Tombol Info Madrasah */}
        <button
          onClick={() => setIsInfoMenuOpen(true)}
          className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 active:scale-95 transition-all"
          title="Info Madrasah & Jam Gerbang"
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* Tengah: Nama Sekolah & Anak Aktif */}
        <div className="flex items-center gap-2 min-w-0 px-2">
          <img src="/icon-192.png" alt="Logo MAN 1 Bulukumba" className="w-8 h-8 rounded-lg object-contain bg-emerald-50 p-0.5 border border-emerald-200 shadow-xs shrink-0" />
          <div className="text-left min-w-0">
            <p className="text-[10px] font-bold tracking-wider text-emerald-700 uppercase">MAN 1 BULUKUMBA</p>
            <p className="text-xs font-bold text-slate-800 leading-tight truncate">
              {myStudents.length > 1 && student ? `${student.name.split(' ')[0]} (${student.className})` : 'Portal Orang Tua'}
            </p>
          </div>
        </div>

        {/* Kanan: Avatar → Profil */}
        <button
          onClick={() => setActiveTab('profil')}
          className="w-9 h-9 rounded-xl bg-emerald-700 flex items-center justify-center font-bold text-xs text-white active:scale-95 transition-transform shadow-xs"
          title="Akun Saya"
        >
          {currentUser.fullName ? currentUser.fullName.charAt(0).toUpperCase() : 'W'}
        </button>
      </header>

      {/* ── FLOATING NOTIFIKASI LANGSUNG DI LAYAR HP (Aktif di Semua Browser HP) ── */}
      {liveNotification && (
        <div className="fixed top-3 left-4 right-4 z-50 animate-bounce-in">
          <div className="bg-slate-900/95 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl border border-primary-500/60 flex items-start gap-3">
            <div className="relative shrink-0 mt-0.5">
              <img src="/icon-192.png?v=2" alt="Logo MAN 1" className="w-10 h-10 rounded-xl object-contain bg-white/10 p-0.5 border border-primary-500/60 shadow-md" />
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-slate-900 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <p className="text-xs font-black text-primary-400 uppercase tracking-wider">
                  {liveNotification.title}
                </p>
                <span className="text-[10px] text-slate-400 font-mono">
                  {liveNotification.time} WITA
                </span>
              </div>
              <p className="text-xs font-semibold text-white mt-1 leading-relaxed">
                {liveNotification.body}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary-500/30 text-primary-300 border border-primary-500/40">
                  {liveNotification.type === 'MASUK' ? 'Scan Gerbang Masuk' : 'Scan Kepulangan'}
                </span>
                <span className="text-[10px] text-slate-400">
                  MAN 1 BULUKUMBA
                </span>
              </div>
            </div>
            <button
              onClick={() => setLiveNotification(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── KONTEN AREA ── */}
      <main className="flex-1 px-5 pt-2 space-y-4">
        {/* =================================================================== */}
        {/* TAB 1: BERANDA (HOME)                                              */}
        {/* =================================================================== */}
        {activeTab === 'home' && (
          <div className="space-y-5 animate-fade-in">
            {/* Banner Indikator Offline saat HP tidak ada koneksi internet */}
            {!isOnline && (
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 shadow-xs flex items-center gap-3 animate-fade-in">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <WifiOff className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-amber-950">Mode Offline (Tanpa Internet)</p>
                  <p className="text-[11px] text-amber-800 leading-tight">
                    Menampilkan data tersimpan di HP. Portal akan otomatis sinkron saat internet aktif.
                  </p>
                </div>
              </div>
            )}

            {/* Banner Pasang Aplikasi PWA di Layar Utama HP */}
            {!isPWAInstalled && (
              <div className="p-3.5 rounded-2xl bg-surface border border-primary-300 shadow-xs flex items-center justify-between gap-3 animate-fade-in">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center shrink-0 border border-primary-200">
                    <Download className="w-4 h-4 text-primary-600" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">Pasang Aplikasi di Layar HP</p>
                    <p className="text-[11px] text-slate-500">Buka langsung dari beranda HP seperti aplikasi native.</p>
                  </div>
                </div>
                <button
                  onClick={handleInstallPWA}
                  className="px-3.5 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold shadow-xs active:scale-95 transition-transform shrink-0 flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Instal</span>
                </button>
              </div>
            )}

            {/* Banner Notifikasi & Uji Suara HP */}
            {!isNotifActive ? (
              <div className="p-3.5 rounded-2xl bg-primary-50 border border-primary-200/90 flex items-center justify-between gap-2 shadow-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-primary-600 text-white flex items-center justify-center shrink-0">
                    <BellRing className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-primary-950 truncate">Notifikasi Latar Belakang HP</p>
                    <p className="text-[11px] text-primary-800 leading-tight">Tetap berdering &amp; muncul di HP meski aplikasi ditutup.</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={handleEnableNotification}
                    disabled={isRequestingPermission}
                    className="px-3.5 py-1.5 rounded-xl bg-primary-600 text-white text-xs font-bold shadow-xs hover:bg-primary-700 active:scale-95 transition-transform"
                  >
                    {isRequestingPermission ? '...' : 'Aktifkan'}
                  </button>
                </div>
              </div>
            ) : !hasTestedNotif ? (
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 shadow-xs space-y-2.5 animate-fade-in">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-emerald-950 truncate">Notifikasi Latar Belakang Aktif</p>
                      <p className="text-[11px] text-emerald-700 leading-tight">Pemberitahuan masuk saat aplikasi ditutup &amp; di layar kunci.</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-emerald-200/80">
                  <button
                    type="button"
                    onClick={handleTestNotification}
                    className="flex-1 py-1.5 px-2 rounded-xl bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 text-xs font-bold shadow-xs active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    title="Uji coba notifikasi di HP sekarang"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Uji Langsung</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleTestLockScreenNotification}
                    disabled={lockScreenCountdown !== null}
                    className="flex-1 py-1.5 px-2 rounded-xl bg-[#2e8b38] hover:bg-[#247539] text-white text-xs font-bold shadow-xs active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    title="Uji coba pop-up di layar kunci saat layar mati (5 detik jeda)"
                  >
                    <Lock className="w-3.5 h-3.5 text-white" />
                    <span>{lockScreenCountdown !== null ? `Kunci Layar (${lockScreenCountdown}s)...` : 'Uji Layar Kunci'}</span>
                  </button>
                </div>
              </div>
            ) : null}

            {/* ── HERO CARD: Status Kehadiran Hari Ini — Clean  Green ── */}
            <div className="relative rounded-2xl p-5 overflow-hidden bg-gradient-to-r from-[#1c5e2d] via-[#247539] to-[#2e8b38] text-white shadow-sm">
              {/* Organic curve accent & dot pattern */}
              <div className="absolute -right-8 -bottom-8 w-36 h-36 rounded-full bg-white/10 blur-lg pointer-events-none" />
              <div 
                className="absolute right-4 top-4 w-28 h-20 opacity-20 pointer-events-none"
                style={{
                  backgroundImage: 'radial-gradient(circle, #f59e0b 2px, transparent 2px)',
                  backgroundSize: '12px 12px'
                }}
              />

              <div className="relative z-10 flex flex-col justify-between min-h-[160px]">
                {/* Header Card */}
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 text-[11px] font-semibold text-white border border-white/25 mb-2.5">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-200 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                    </span>
                    <span>
                      {todayDayOff.isDayOff
                        ? todayDayOff.reason
                        : morningTx
                        ? departureTx
                          ? 'Selesai Belajar & Scan Pulang'
                          : 'Sedang Belajar di Madrasah'
                        : 'Menunggu Scan Masuk'}
                    </span>
                  </div>

                  <h2 className="text-xl font-bold tracking-tight leading-tight">
                    {student?.name || 'Memuat Data Siswa...'}
                  </h2>

                  <p className="text-xs text-emerald-100 mt-1">
                    Kelas: <span className="font-bold text-white">{student?.className || '—'}</span> &bull; ID: {student?.id || studentId}
                  </p>
                </div>

                {/* Footer: Progress */}
                <div className="mt-4 pt-3 border-t border-white/20">
                  <div className="flex items-center justify-between text-[11px] font-medium text-emerald-100 mb-1.5">
                    <span>
                      Presensi Hari Ini: {morningTx && departureTx ? '2/2 Lengkap' : morningTx ? '1/2 Masuk Gerbang' : '0/2 Belum Scan'}
                    </span>
                    <span className="font-mono font-bold">
                      {morningTx ? formatTime(morningTx.deviceTimestamp) : '07:15 WITA'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setActiveTab('rekap')}
                      className="w-9 h-9 rounded-full bg-white text-[#2e8b38] flex items-center justify-center shadow-sm hover:bg-emerald-50 active:scale-95 transition-transform shrink-0"
                      title="Lihat Rekapitulasi Lengkap"
                    >
                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                    </button>

                    <div className="flex-1 bg-white/25 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-white transition-all duration-700"
                        style={{ width: morningTx && departureTx ? '100%' : morningTx ? '50%' : '0%' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── SELECTOR BANYAK ANAK (DIBAWAH KOTAK HIJAU BESAR) ── */}
            {myStudents.length > 1 && (
              <div className="bg-white/95 backdrop-blur-md rounded-2xl p-2.5 border border-emerald-200 shadow-xs space-y-1.5 animate-fade-in">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-[#2e8b38]" />
                    <span>Pilih Anak ({myStudents.length} Bersaudara):</span>
                  </span>
                  <span className="text-[10px] font-medium text-slate-400">
                    Ketuk untuk beralih
                  </span>
                </div>
                <div
                  className={`grid gap-1.5 w-full ${
                    myStudents.length === 2
                      ? 'grid-cols-2'
                      : myStudents.length === 3
                      ? 'grid-cols-3'
                      : 'grid-cols-2 sm:grid-cols-4'
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

            {/* ── KALENDER MINGGUAN (Jadwal & Presensi) ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-900">Jadwal &amp; Presensi</h3>
                <button
                  type="button"
                  onClick={() => {
                    setCalendarViewDate(new Date(selectedDate + 'T00:00:00'));
                    setIsCalendarModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 active:scale-95 px-3 py-1.5 rounded-xl border border-emerald-300 shadow-2xs transition-all cursor-pointer"
                  title="Klik untuk memilih tanggal dengan kalender kustom"
                >
                  <Calendar className="w-3.5 h-3.5 text-emerald-700" />
                  <span>
                    {new Date(selectedDate + 'T00:00:00').toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-emerald-600" />
                </button>
              </div>

              {/* Strip Hari Horizontal — Bentuk Kotak Simetris (Bukan Oval) */}
              <div className="flex items-center justify-between gap-1.5 overflow-x-auto py-1 scrollbar-none">
                {weekDays.map(({ date, dayName, dayNum }) => {
                  const isSelected = date === selectedDate;
                  const statusOnDate = datesStatusMap[date];

                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => setSelectedDate(date)}
                      className={`flex flex-col items-center justify-between py-2.5 px-1.5 rounded-xl min-w-[42px] flex-1 transition-all active:scale-95 cursor-pointer ${
                        isSelected
                          ? 'bg-[#2e8b38] text-white shadow-md shadow-emerald-700/25 ring-2 ring-emerald-500/30'
                          : 'bg-surface text-slate-700 border border-border hover:border-emerald-300'
                      }`}
                    >
                      <span className={`text-[10px] font-semibold uppercase ${isSelected ? 'text-emerald-100' : 'text-slate-500'}`}>
                        {dayName}
                      </span>
                      <span className="text-sm font-black my-0.5">
                        {dayNum}
                      </span>

                      {/* Dot Indikator Status */}
                      <div className="flex items-center justify-center gap-0.5 h-1.5 mt-0.5">
                        {statusOnDate ? (
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isSelected
                                ? 'bg-white'
                                : statusOnDate === 'HADIR'
                                ? 'bg-[#2e8b38]'
                                : statusOnDate === 'TERLAMBAT'
                                ? 'bg-amber-500'
                                : statusOnDate === 'IZIN'
                                ? 'bg-blue-500'
                                : 'bg-red-500'
                            }`}
                          />
                        ) : (
                          <span className="w-1 h-1 rounded-full bg-transparent" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── TIMELINE AKTIVITAS AKTUAL (Hanya Data Asli Hari Terpilih) ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">Riwayat Tanggal</h3>
                  <span className="text-[11px] font-semibold text-primary-700 bg-primary-50 px-2.5 py-0.5 rounded-full border border-primary-200">
                    {new Date(selectedDate + 'T00:00:00').toLocaleDateString('id-ID', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                </div>
                <span className="text-[10px] font-semibold text-slate-400">
                  {selectedDateTransactions.length} Catatan
                </span>
              </div>

              {/* Tampilan Riwayat Aktual */}
              {selectedDateTransactions.length > 0 ? (
                <div className="space-y-3">
                  {selectedDateTransactions.map((tx) => (
                    <div
                      key={tx.transactionId}
                      onClick={() => setSelectedTxDetail(tx)}
                      className="bg-surface rounded-2xl border border-border p-3.5 shadow-xs hover:border-primary-300 hover:shadow-sm active:scale-98 transition-all cursor-pointer flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Ikon Sesi */}
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          tx.attendanceType === 'MASUK'
                            ? tx.attendanceStatus === 'HADIR'
                              ? 'bg-primary-50 text-primary-700'
                              : 'bg-amber-50 text-amber-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}>
                          <CheckCircle2 className="w-5 h-5" />
                        </div>

                        {/* Rincian Transaksi */}
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">
                            {tx.attendanceType === 'MASUK' ? 'Scan Masuk Gerbang' : 'Scan Kepulangan'}
                          </p>
                          <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                            {formatTime(tx.deviceTimestamp)} WITA &bull; {tx.deviceId}
                          </p>
                          {tx.note && (
                            <p className="text-[10px] text-amber-800 bg-amber-50/80 px-2 py-0.5 rounded mt-1 truncate border border-amber-200">
                              Ket: {tx.note}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Status Badge & Indikator Klik */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {renderStatusChip(tx.attendanceStatus, tx.attendanceType)}
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : selectedDayOff.isDayOff ? (
                /* Hari Libur / Acara Khusus */
                <div className="bg-surface rounded-2xl border border-emerald-200 bg-emerald-50/40 p-6 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-emerald-950">
                    {selectedDayOff.reason}
                  </p>
                  <p className="text-[11px] text-emerald-800 max-w-xs mx-auto leading-relaxed">
                    Tanggal ini merupakan hari libur / kegiatan khusus madrasah. Tidak ada kewajiban presensi gerbang dan siswa tidak dihitung Alfa.
                  </p>
                </div>
              ) : (
                /* Jika Tidak Ada Data Pada Tanggal Ini */
                <div className="bg-surface rounded-2xl border border-dashed border-border p-6 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center mx-auto">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-slate-700">
                    {selectedDate === todayStr
                      ? 'Belum Melakukan Scan Gerbang Hari Ini'
                      : 'Tidak Ada Data Presensi'}
                  </p>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto leading-relaxed">
                    {selectedDate === todayStr
                      ? 'Siswa belum tercatat melakukan pemindaian di gerbang madrasah. Waktu scan masuk: 06.30 - 07.15 WITA.'
                      : selectedDate > todayStr
                      ? 'Jadwal presensi akan tercatat otomatis saat siswa memindai kartu barcode di gerbang.'
                      : 'Tidak ada data presensi yang tercatat pada tanggal ini (siswa tidak hadir / hari libur).'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: REKAPITULASI & STATISTIK (CHART)                            */}
        {/* =================================================================== */}
        {activeTab === 'rekap' && (
          <div className="space-y-5 animate-fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900">Statistik Kehadiran</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Bulan {today.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
                </p>
              </div>
              <button
                onClick={handleDownloadReportPdf}
                disabled={isDownloadingPdf}
                className="px-3.5 py-1.5 rounded-xl bg-[#2e8b38] hover:bg-[#247539] disabled:opacity-75 text-white text-xs font-bold shadow-xs active:scale-95 transition-transform flex items-center gap-1.5 shrink-0 cursor-pointer"
                title="Unduh & Simpan Dokumen PDF Laporan Kehadiran"
              >
                {isDownloadingPdf ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh PDF</span>
                  </>
                )}
              </button>
            </div>

            {/* Indikator sinkronisasi data server */}
            {isSyncing && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 text-[#2e8b38] animate-spin" />
                <span>Menyinkronkan data presensi terbaru dari server...</span>
              </div>
            )}

            {/* 1. Hero Card: Tingkat Kehadiran Tepat Waktu (Ultra-Modern Glassmorphic Gradient) */}
            <div className="relative rounded-2xl p-5 overflow-hidden bg-gradient-to-r from-[#1c5e2d] via-[#247539] to-[#2e8b38] text-white shadow-sm">
              {/* Organic curve accent & dot pattern emas/amber sama persis dengan beranda */}
              <div className="absolute -right-8 -bottom-8 w-36 h-36 rounded-full bg-white/10 blur-lg pointer-events-none" />
              <div
                className="absolute right-4 top-4 w-28 h-20 opacity-20 pointer-events-none"
                style={{
                  backgroundImage: 'radial-gradient(circle, #f59e0b 2px, transparent 2px)',
                  backgroundSize: '12px 12px',
                }}
              />

              <div className="relative z-10 flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 text-[11px] font-semibold text-white border border-white/25">
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>Disiplin Presensi {student ? `• ${student.name.split(' ')[0]}` : ''}</span>
                  </div>
                  <div className="pt-1">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-black text-white tracking-tight">{attendanceRate}</span>
                      <span className="text-xl font-bold text-emerald-200">%</span>
                    </div>
                    <p className="text-xs font-semibold text-emerald-100/90 mt-0.5">
                      Tepat Waktu Bulan Ini
                    </p>
                  </div>
                </div>

                <div className="px-3.5 py-2.5 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 flex flex-col items-center justify-center shrink-0 shadow-inner">
                  <span className="text-lg font-black text-white leading-tight">{countHadir}/{totalDays}</span>
                  <span className="text-[9px] text-emerald-200 font-bold uppercase tracking-wider mt-0.5">Hari Tepat</span>
                </div>
              </div>

              {/* Progress Bar Modern */}
              <div className="relative z-10 mt-4 space-y-1.5">
                <div className="w-full h-2 rounded-full bg-white/25 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-white transition-all duration-700"
                    style={{ width: `${Math.min(Math.max(attendanceRate, 0), 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-emerald-100/80 font-medium">
                  <span>{totalDays} hari total tercatat</span>
                  <span className="font-bold text-white">
                    {totalDays === 0
                      ? 'Belum ada data'
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
              <div className="bg-white/95 backdrop-blur-md rounded-2xl p-2.5 border border-emerald-200 shadow-xs space-y-1.5 animate-fade-in">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-[#2e8b38]" />
                    <span>Pilih Anak ({myStudents.length} Bersaudara):</span>
                  </span>
                  <span className="text-[10px] font-medium text-slate-400">
                    Ketuk untuk beralih
                  </span>
                </div>
                <div
                  className={`grid gap-1.5 w-full ${
                    myStudents.length === 2
                      ? 'grid-cols-2'
                      : myStudents.length === 3
                      ? 'grid-cols-3'
                      : 'grid-cols-2 sm:grid-cols-4'
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

            {/* 2. Grid 4 Kartu Metrik Bento — Selaras dengan Tema Kartu Beranda */}
            <div className="grid grid-cols-2 gap-3">
              {/* Kartu 1: Hadir Tepat */}
              <div className="rounded-2xl p-4 bg-surface border border-border shadow-xs hover:border-emerald-300 transition-all flex flex-col justify-between">
                <div className="flex items-center justify-between gap-1 mb-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200/80 flex items-center justify-center">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/60">
                    &le; 07.15
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-slate-500">Hadir Tepat</span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-2xl font-black text-emerald-950">{countHadir}</span>
                    <span className="text-xs font-semibold text-slate-400">Hari</span>
                  </div>
                </div>
              </div>

              {/* Kartu 2: Terlambat */}
              <div className="rounded-2xl p-4 bg-surface border border-border shadow-xs hover:border-amber-300 transition-all flex flex-col justify-between">
                <div className="flex items-center justify-between gap-1 mb-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 border border-amber-200/80 flex items-center justify-center">
                    <Clock className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200/60">
                    &gt; 07.15
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-slate-500">Terlambat</span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-2xl font-black text-amber-950">{countTerlambat}</span>
                    <span className="text-xs font-semibold text-slate-400">Hari</span>
                  </div>
                </div>
              </div>

              {/* Kartu 3: Izin / Sakit */}
              <div className="rounded-2xl p-4 bg-surface border border-border shadow-xs hover:border-blue-300 transition-all flex flex-col justify-between">
                <div className="flex items-center justify-between gap-1 mb-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 border border-blue-200/80 flex items-center justify-center">
                    <HeartPulse className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200/60">
                    Izin/Sakit
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-slate-500">Izin / Sakit</span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-2xl font-black text-blue-950">{countIzinSakit}</span>
                    <span className="text-xs font-semibold text-slate-400">Hari</span>
                  </div>
                </div>
              </div>

              {/* Kartu 4: Alfa */}
              <div className="rounded-2xl p-4 bg-surface border border-border shadow-xs hover:border-rose-300 transition-all flex flex-col justify-between">
                <div className="flex items-center justify-between gap-1 mb-2.5">
                  <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-700 border border-rose-200/80 flex items-center justify-center">
                    <UserMinus className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200/60">
                    Alfa
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-slate-500">Alfa</span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-2xl font-black text-rose-950">{countAlfa}</span>
                    <span className="text-xs font-semibold text-slate-400">Hari</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Riwayat Lengkap 30 Hari Terakhir — Selaras dengan Tema Kartu Beranda */}
            <div className="rounded-2xl bg-surface border border-border p-4 shadow-xs">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5 uppercase tracking-wider">
                  <Calendar className="w-3.5 h-3.5 text-primary-600" />
                  <span>Catatan 30 Hari Terakhir</span>
                </h4>
                <span className="text-[10px] font-semibold text-primary-700 bg-primary-50 px-2 py-0.5 rounded-full border border-primary-200">
                  {allStudentTransactions.length} Log
                </span>
              </div>

              {allStudentTransactions.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">
                  Belum ada riwayat absensi tersimpan.
                </p>
              ) : (
                <div className="divide-y divide-border max-h-72 overflow-y-auto">
                  {allStudentTransactions.slice(0, 30).map((trx) => (
                    <div
                      key={trx.transactionId}
                      onClick={() => setSelectedTxDetail(trx)}
                      className="py-2.5 flex items-center justify-between hover:bg-emerald-50/60 px-2.5 rounded-xl transition-all cursor-pointer active:scale-[0.99]"
                    >
                      <div>
                        <p className="text-xs font-bold text-slate-800">
                          {trx.attendanceType === 'MASUK' ? 'Scan Masuk' : 'Scan Pulang'}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {formatDate(trx.deviceTimestamp)} &bull; {formatTime(trx.deviceTimestamp)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {renderStatusChip(trx.attendanceStatus, trx.attendanceType)}
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: NOTIFIKASI PWA                                              */}
        {/* =================================================================== */}
        {activeTab === 'notif' && (
          <div className="space-y-4 animate-fade-in">

            {/* Feed Notifikasi */}
            <div className="space-y-2.5">
              {uniqueNotificationTransactions.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  Belum ada riwayat notifikasi absensi.
                </div>
              ) : (
                uniqueNotificationTransactions.slice(0, 50).map((trx) => {
                  const child = studentMap.get(trx.studentId);
                  const childName = trx.studentName || child?.name || 'Siswa';
                  const dominantName = child?.name ? getDominantName(child.name) : childName.split(' ')[0];

                  return (
                    <div
                      key={`${trx.studentId}_${trx.attendanceDate}_${trx.attendanceType}`}
                      onClick={() => setSelectedTxDetail(trx)}
                      className="p-3.5 rounded-2xl bg-surface border border-border shadow-2xs flex items-start gap-3 cursor-pointer hover:border-primary-300 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center shrink-0 mt-0.5">
                        <BellRing className="w-4 h-4 text-primary-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="text-xs font-bold text-slate-900 truncate">
                              {trx.attendanceType === 'MASUK' ? 'Siswa Tiba di Madrasah' : 'Siswa Scan Pulang'}
                            </p>
                            {myStudents.length > 1 && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                                {dominantName} ({trx.className || child?.className || '-'})
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono shrink-0">
                            {formatTime(trx.deviceTimestamp)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                          {trx.attendanceType === 'MASUK'
                            ? `${childName} scan masuk gerbang (${trx.attendanceStatus}).`
                            : `${childName} telah scan kepulangan.`}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {formatDate(trx.deviceTimestamp)} &bull; {trx.className || child?.className} &bull; {trx.deviceId}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 4: PROFIL AKUN (USER)                                          */}
        {/* =================================================================== */}
        {activeTab === 'profil' && (
          <div className="space-y-5 animate-fade-in">
            {/* Kartu Profil Utama */}
            <div className="rounded-3xl p-5 bg-surface border border-border shadow-xs flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-primary-600 text-white font-black text-2xl flex items-center justify-center shadow-md shadow-primary-600/20 shrink-0">
                {currentUser.fullName ? currentUser.fullName.charAt(0).toUpperCase() : 'W'}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-black text-slate-900 truncate">
                  {currentUser.fullName}
                </h3>
                <p className="text-xs font-mono text-slate-500 mt-0.5">
                  {currentUser.phone || currentUser.username}
                </p>
                <span className="inline-flex items-center gap-1 mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-primary-50 text-primary-700 border border-primary-200">
                  <Shield className="w-3 h-3" /> Akun Orang Tua Siswa
                </span>
              </div>
            </div>

            {/* Data Siswa Terhubung (Dukungan Multi-Anak) */}
            <div className="rounded-3xl p-5 bg-surface border border-border shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4 text-primary-600" />
                  <span>Siswa yang Terhubung ({myStudents.length || 1} Anak)</span>
                </span>
                <span className="text-[10px] font-semibold text-primary-700 bg-primary-50 px-2 py-0.5 rounded-full border border-primary-200">
                  {myStudents.length > 1 ? 'Multi-Anak Aktif' : 'Aktif'}
                </span>
              </div>

              {myStudents.length > 0 ? (
                <div className="space-y-2">
                  {myStudents.map((s) => {
                    const isSelected = s.id === activeStudentId;
                    return (
                      <div
                        key={s.id}
                        onClick={() => setActiveStudentId(s.id)}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-emerald-50/80 border-[#2e8b38] shadow-xs'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                            isSelected ? 'bg-[#2e8b38] text-white' : 'bg-slate-200 text-slate-700'
                          }`}>
                            {s.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-800 truncate">{s.name}</p>
                            <p className="text-[10px] text-slate-500 font-mono">
                              ID: {s.id} &bull; Kelas: {s.className}
                            </p>
                          </div>
                        </div>
                        {isSelected ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#2e8b38] text-white shrink-0">
                            Aktif
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveStudentId(s.id);
                            }}
                            className="text-[10px] font-bold text-[#2e8b38] hover:underline shrink-0"
                          >
                            Pilih
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Nama Siswa:</span>
                    <span className="font-bold text-slate-800">{student?.name || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Kelas:</span>
                    <span className="font-bold text-primary-700">{student?.className || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">ID Siswa:</span>
                    <span className="font-mono font-bold text-slate-800">{student?.id || studentId}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Menu Aksi */}
            <div className="space-y-2">
              <button
                onClick={handleInstallPWA}
                className="w-full p-4 rounded-2xl bg-surface border border-border shadow-xs flex items-center justify-between hover:bg-primary-50/50 active:scale-98 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-slate-900">
                      {isPWAInstalled ? 'Aplikasi Terpasang di Layar Utama' : 'Pasang Aplikasi di Layar HP (PWA)'}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {isPWAInstalled ? 'Aplikasi sudah aktif dalam mode layar penuh' : 'Tambahkan ikon ke layar utama HP'}
                    </p>
                  </div>
                </div>
                {isPWAInstalled ? (
                  <span className="text-[10px] font-bold text-primary-700 bg-primary-50 px-2 py-0.5 rounded-full border border-primary-200">
                    Terpasang
                  </span>
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                )}
              </button>

              <button
                onClick={handleOpenEditModal}
                className="w-full p-4 rounded-2xl bg-surface border border-border shadow-xs flex items-center justify-between hover:bg-primary-50/50 active:scale-98 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center">
                    <Pencil className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-slate-900">Ubah Nomor HP &amp; Password</p>
                    <p className="text-[10px] text-slate-400">Atur kata sandi baru untuk login</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                onClick={() => setIsLockScreenGuideOpen(true)}
                className="w-full p-4 rounded-2xl bg-surface border border-border shadow-xs flex items-center justify-between hover:bg-emerald-50/50 active:scale-98 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                    <BellRing className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-slate-900">Setelan Pop-up &amp; Layar Kunci HP</p>
                    <p className="text-[10px] text-slate-400">Panduan agar notifikasi melayang di atas layar &amp; menyala di lock screen</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                onClick={handleTestNotification}
                className="w-full p-4 rounded-2xl bg-surface border border-border shadow-xs flex items-center justify-between hover:bg-primary-50/50 active:scale-98 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center">
                    <Volume2 className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-slate-900">Uji Push &amp; Sambung Ulang HP</p>
                    <p className="text-[10px] text-slate-400">Hubungkan ulang perangkat dan kirim sinyal notifikasi tes</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

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
                className="w-full p-4 rounded-2xl bg-red-50/70 border border-red-200/80 text-red-700 shadow-xs flex items-center justify-between hover:bg-red-100/70 active:scale-98 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
                    <LogOut className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-red-700">Keluar dari Akun</p>
                    <p className="text-[10px] text-red-500">Keluar dari portal orang tua di perangkat ini</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-red-400" />
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ── BOTTOM TAB BAR — Apple Style Translucent Frosted Glass Dock ── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 apple-glass-dock border-t border-[#e1ede4]/80 pb-[max(env(safe-area-inset-bottom),0.5rem)] shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
        <nav className="flex items-stretch h-14 max-w-sm mx-auto">
          {/* 1. Tab Beranda */}
          <button
            onClick={() => setActiveTab('home')}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors active:bg-emerald-50 ${activeTab === 'home' ? 'text-[#2e8b38]' : 'text-slate-400'}`}
          >
            <div className={`p-1.5 rounded-xl transition-colors ${activeTab === 'home' ? 'bg-emerald-50' : ''}`}>
              <Home className="w-5 h-5 stroke-[2]" />
            </div>
            <span className={`text-[10px] leading-none ${activeTab === 'home' ? 'font-bold text-[#2e8b38]' : 'font-medium'}`}>Beranda</span>
          </button>

          {/* 2. Tab Statistik */}
          <button
            onClick={() => setActiveTab('rekap')}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors active:bg-emerald-50 ${activeTab === 'rekap' ? 'text-[#2e8b38]' : 'text-slate-400'}`}
          >
            <div className={`p-1.5 rounded-xl transition-colors ${activeTab === 'rekap' ? 'bg-emerald-50' : ''}`}>
              <TrendingUp className="w-5 h-5 stroke-[2]" />
            </div>
            <span className={`text-[10px] leading-none ${activeTab === 'rekap' ? 'font-bold text-[#2e8b38]' : 'font-medium'}`}>Statistik</span>
          </button>

          {/* 3. Tab Notifikasi */}
          <button
            onClick={handleOpenNotifTab}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors active:bg-emerald-50 ${activeTab === 'notif' ? 'text-[#2e8b38]' : 'text-slate-400'}`}
          >
            <div className={`p-1.5 rounded-xl relative transition-colors ${activeTab === 'notif' ? 'bg-emerald-50' : ''}`}>
              <MessageSquare className="w-5 h-5 stroke-[2]" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-bold rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center border border-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <span className={`text-[10px] leading-none ${activeTab === 'notif' ? 'font-bold text-[#2e8b38]' : 'font-medium'}`}>Notifikasi</span>
          </button>

          {/* 4. Tab Profil */}
          <button
            onClick={() => setActiveTab('profil')}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors active:bg-emerald-50 ${activeTab === 'profil' ? 'text-[#2e8b38]' : 'text-slate-400'}`}
          >
            <div className={`p-1.5 rounded-xl transition-colors ${activeTab === 'profil' ? 'bg-emerald-50' : ''}`}>
              <User className="w-5 h-5 stroke-[2]" />
            </div>
            <span className={`text-[10px] leading-none ${activeTab === 'profil' ? 'font-bold text-[#2e8b38]' : 'font-medium'}`}>Profil</span>
          </button>
        </nav>
      </div>

      {/* ── MODAL DETAIL LENGKAP PRESENSI (Saat Item Timeline Diklik) ── */}
      <Modal
        isOpen={!!selectedTxDetail}
        onClose={() => setSelectedTxDetail(null)}
        title="Detail Presensi Siswa"
        description="Rincian lengkap data pemindaian di gerbang madrasah."
      >
        {selectedTxDetail && (
          <div className="space-y-4">
            {/* Status Highlight Banner */}
            <div className="p-4 rounded-2xl bg-primary-50 border border-primary-200 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-primary-800 uppercase tracking-wider">
                  Sesi {selectedTxDetail.attendanceType === 'MASUK' ? 'Presensi Masuk' : 'Presensi Kepulangan'}
                </p>
                <p className="text-xl font-black text-primary-950 mt-0.5">
                  {formatTime(selectedTxDetail.deviceTimestamp)} WITA
                </p>
              </div>
              <div>
                {renderStatusChip(selectedTxDetail.attendanceStatus, selectedTxDetail.attendanceType)}
              </div>
            </div>

            {/* Informasi Detail Tabel */}
            <div className="rounded-2xl border border-border divide-y divide-border text-xs">
              <div className="flex justify-between py-2.5 px-3.5">
                <span className="text-slate-500">Nama Siswa</span>
                <span className="font-bold text-slate-800">{student?.name || '—'}</span>
              </div>
              <div className="flex justify-between py-2.5 px-3.5">
                <span className="text-slate-500">Kelas / ID</span>
                <span className="font-semibold text-slate-800">{student?.className || '—'} &bull; {student?.id}</span>
              </div>
              <div className="flex justify-between py-2.5 px-3.5">
                <span className="text-slate-500">Hari &amp; Tanggal</span>
                <span className="font-semibold text-slate-800">{formatDate(selectedTxDetail.deviceTimestamp)}</span>
              </div>
              <div className="flex justify-between py-2.5 px-3.5">
                <span className="text-slate-500">Komputer Gerbang</span>
                <span className="font-mono font-bold text-primary-700">{selectedTxDetail.deviceId}</span>
              </div>
              <div className="flex justify-between py-2.5 px-3.5">
                <span className="text-slate-500">Metode Presensi</span>
                <span className="font-semibold text-slate-800">
                  {selectedTxDetail.method === 'USB_SCANNER'
                    ? 'Scanner Barcode USB'
                    : selectedTxDetail.method === 'BARCODE_CAMERA'
                    ? 'Kamera Scanner'
                    : 'Input Manual Operator'}
                </span>
              </div>
              <div className="flex justify-between py-2.5 px-3.5">
                <span className="text-slate-500">Petugas / Operator</span>
                <span className="font-mono text-slate-700">@{selectedTxDetail.operatorId}</span>
              </div>
              <div className="flex justify-between py-2.5 px-3.5">
                <span className="text-slate-500">ID Transaksi Unik</span>
                <span className="font-mono text-[10px] text-slate-400 truncate max-w-[50%]">
                  {selectedTxDetail.transactionId}
                </span>
              </div>
            </div>

            {/* Catatan Khusus Jika Ada */}
            {selectedTxDetail.note && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-amber-600" />
                  Catatan dari Operator:
                </p>
                <p className="text-[11px] leading-relaxed">{selectedTxDetail.note}</p>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedTxDetail(null)}
              >
                Tutup
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── MODAL INFO MADRASAH & MENU CEPAT ── */}
      <Modal
        isOpen={isInfoMenuOpen}
        onClose={() => setIsInfoMenuOpen(false)}
        title="Informasi Madrasah & Tata Tertib"
        description="Jadwal operasional presensi gerbang MAN 1 BULUKUMBA."
      >
        <div className="space-y-4 text-xs text-slate-600">
          <div className="p-3 bg-primary-50 rounded-2xl border border-primary-200 space-y-1.5 text-primary-950">
            <p className="font-bold flex items-center gap-1.5 text-primary-800">
              <Info className="w-4 h-4 text-primary-600" />
              Ketentuan Jam Scan Gerbang
            </p>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-primary-900">
              <li><strong>Scan Masuk:</strong> {schoolSettings.entryStart.replace(':', '.')} - {schoolSettings.entryLimit.replace(':', '.')} WITA (Tepat Waktu)</li>
              <li><strong>Terlambat:</strong> {schoolSettings.entryLimit.replace(':', '.')} - {schoolSettings.lateLimit.replace(':', '.')} WITA</li>
              <li><strong>Gerbang Ditutup:</strong> {schoolSettings.lateLimit.replace(':', '.')} WITA</li>
              <li><strong>Scan Pulang:</strong> Mulai {schoolSettings.dismissal.replace(':', '.')} WITA</li>
            </ul>
          </div>

          <div className="space-y-1 pt-2 border-t border-border">
            <p className="font-bold text-slate-800">Bantuan &amp; Izin Siswa:</p>
            <p className="text-[11px] text-slate-500">
              Jika siswa berhalangan hadir (sakit/izin), harap menyampaikan surat keterangan ke wali kelas atau pihak madrasah.
            </p>
          </div>

          <div className="pt-2 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setIsInfoMenuOpen(false)}>
              Tutup
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── MODAL UBAH PROFIL & PASSWORD ── */}
      <Modal
        isOpen={isEditProfileOpen}
        onClose={() => setIsEditProfileOpen(false)}
        title="Ubah Profil & Nomor HP Login"
        description="Nomor HP digunakan untuk masuk ke portal orang tua."
      >
        <form onSubmit={handleSaveProfile} className="space-y-4">
          {editMsg && (
            <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
              editMsg.type === 'success'
                ? 'bg-primary-50 border border-primary-200 text-primary-800'
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}>
              {editMsg.type === 'success' ? (
                <Check className="w-4 h-4 shrink-0 text-primary-600" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{editMsg.text}</span>
            </div>
          )}

          <Input
            label="Nama Lengkap Orang Tua / Wali"
            value={editFullName}
            onChange={(e) => setEditFullName(e.target.value)}
            required
          />

          <Input
            label="Nomor HP / Telepon (ID Login)"
            value={editPhone}
            onChange={(e) => setEditPhone(e.target.value)}
            leftIcon={<Phone className="w-4 h-4 text-primary-600" />}
            helperText="Nomor aktif untuk login (contoh: 081234567890)"
            required
          />

          <div className="pt-2 border-t border-border space-y-3">
            <p className="text-xs font-bold text-slate-800">Ganti Password (Opsional)</p>
            <Input
              type="password"
              label="Password Baru"
              placeholder="Kosongkan jika tidak ingin mengganti"
              value={editPassword}
              onChange={(e) => setEditPassword(e.target.value)}
              leftIcon={<Lock className="w-4 h-4 text-slate-400" />}
            />
            {editPassword && (
              <Input
                type="password"
                label="Ulangi Password Baru"
                placeholder="Konfirmasi password baru"
                value={editPasswordConfirm}
                onChange={(e) => setEditPasswordConfirm(e.target.value)}
                leftIcon={<Lock className="w-4 h-4 text-slate-400" />}
                required
              />
            )}
          </div>

          <div className="pt-3 flex justify-end gap-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditProfileOpen(false)}
              disabled={isUpdating}
            >
              Batal
            </Button>
            <Button
              type="submit"
              disabled={isUpdating}
              className="bg-primary-600 hover:bg-primary-700 text-white font-semibold"
            >
              {isUpdating ? 'Menyimpan...' : 'Simpan Perubahan'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL PANDUAN INSTALASI PWA ── */}
      <Modal
        isOpen={isInstallGuideOpen}
        onClose={() => setIsInstallGuideOpen(false)}
        title="Syarat Wajib Notifikasi iPhone"
        description="Apple (iOS) mewajibkan aplikasi ditambahkan ke Layar Utama agar notifikasi sistem bisa aktif:"
      >
        <div className="space-y-4 text-xs text-slate-700">
          {/* Panduan Utama iPhone Safari */}
          <div className="p-4 rounded-2xl bg-blue-50/90 border border-blue-200 space-y-2.5">
            <p className="font-extrabold text-blue-950 flex items-center gap-1.5 text-xs">
              <Share className="w-4 h-4 text-blue-600" />
              Langkah Wajib di iPhone (Browser Safari):
            </p>
            <ol className="list-decimal list-inside space-y-2 text-[11px] text-slate-700 leading-relaxed pl-1">
              <li>
                Buka link ini menggunakan browser <strong>Safari</strong> (bukan Chrome iPhone).
              </li>
              <li>
                Ketuk tombol <strong>Bagikan (Share)</strong> — ikon kotak dengan panah ke atas di bilah bawah Safari.
              </li>
              <li>
                Gulir ke bawah dan pilih <strong>"Tambah ke Layar Utama" (Add to Home Screen)</strong>.
              </li>
              <li>
                Ketuk <strong>"Tambah"</strong> di pojok kanan atas.
              </li>
              <li>
                <strong>Keluar ke layar utama iPhone</strong>, lalu buka aplikasi dari ikon <strong>Absensi M1B</strong> yang baru muncul.
              </li>
              <li>
                Di dalam aplikasi dari Layar Utama, ketuk <strong>"Aktifkan"</strong> &rarr; pop-up resmi Apple akan muncul: pilih <strong>"Izinkan" (Allow)</strong>.
              </li>
            </ol>
            <p className="text-[10px] text-blue-800 font-semibold bg-blue-100/70 p-2 rounded-xl">
              💡 Ini adalah aturan resmi keamanan Apple iOS 16.4+. Setelah ditambahkan ke Layar Utama, notifikasi presensi anak akan berdering di iPhone Anda meskipun layar HP sedang terkunci!
            </p>
          </div>

          {/* Panduan Android Chrome */}
          <div className="p-3.5 rounded-2xl bg-primary-50/80 border border-primary-200 space-y-2">
            <p className="font-bold text-primary-950 flex items-center gap-1.5 text-xs">
              <Smartphone className="w-4 h-4 text-primary-600" />
              Untuk HP Android:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-700 leading-relaxed pl-1">
              <li>Tekan tombol menu <strong>titik tiga (⋮)</strong> di pojok kanan atas Chrome.</li>
              <li>Pilih menu <strong>"Instal Aplikasi"</strong> atau <strong>"Tambahkan ke Layar Utama"</strong>.</li>
            </ol>
          </div>

          <div className="pt-2 flex justify-end">
            <Button size="sm" onClick={() => setIsInstallGuideOpen(false)}>
              Saya Mengerti
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── MODAL PANDUAN NOTIFIKASI LAYAR KUNCI & POP-UP MELAYANG (HEADS-UP) ── */}
      <Modal
        isOpen={isLockScreenGuideOpen}
        onClose={() => setIsLockScreenGuideOpen(false)}
        title="🔔 Panduan Pop-up Melayang & Layar Kunci HP"
        description="Agar notifikasi presensi muncul melayang di atas layar dan menyala di layar kunci saat HP terkunci:"
      >
        <div className="space-y-3.5 text-xs text-slate-700 max-h-[72vh] overflow-y-auto pr-1">
          {/* Card Penjelasan Mengapa Perlu Diatur */}
          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1 text-[11px] leading-relaxed">
            <p className="font-bold flex items-center gap-1.5 text-xs text-amber-950">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              Mengapa Perlu Pengaturan Ini di HP?
            </p>
            <p>
              Secara bawaan pabrik, beberapa sistem HP (Samsung, Xiaomi, Oppo, Vivo) mengizinkan notifikasi tetapi <strong>menyembunyikan spanduk melayang (heads-up)</strong> di atas layar atau di layar kunci. Ikuti langkah cepat di bawah agar notifikasi selalu melompat di atas layar:
            </p>
          </div>

          {/* Samsung */}
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
            <p className="font-extrabold text-slate-900 flex items-center gap-1.5 text-xs">
              <Smartphone className="w-4 h-4 text-blue-600" />
              HP Samsung (One UI):
            </p>
            <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-700 pl-1 leading-relaxed">
              <li>Buka <strong>Pengaturan HP &rarr; Pemberitahuan</strong>.</li>
              <li>Pilih <strong>Gaya pop-up pemberitahuan &rarr; Singkat (Brief)</strong>.</li>
              <li>Buka <strong>Aplikasi &rarr; Chrome</strong> (atau aplikasi Absensi) <strong>&rarr; Pemberitahuan</strong>.</li>
              <li>Pastikan opsi <strong>"Tampilkan sebagai pop-up" (Show as pop-up)</strong> diaktifkan <strong>(ON)</strong>.</li>
              <li>Pada bagian <strong>Layar Kunci</strong>, pilih <strong>"Tampilkan konten"</strong>.</li>
            </ol>
          </div>

          {/* Xiaomi / Redmi / POCO */}
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
            <p className="font-extrabold text-slate-900 flex items-center gap-1.5 text-xs">
              <Smartphone className="w-4 h-4 text-orange-600" />
              HP Xiaomi / Redmi / POCO (MIUI / HyperOS):
            </p>
            <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-700 pl-1 leading-relaxed">
              <li>Buka <strong>Setelan HP &rarr; Aplikasi &rarr; Kelola Aplikasi &rarr; Chrome</strong> (atau Absensi).</li>
              <li>Ketuk menu <strong>Notifikasi</strong>.</li>
              <li>Centang opsi <strong>"Notifikasi Mengambang" (Floating notifications)</strong> agar muncul pop-up di atas layar.</li>
              <li>Centang opsi <strong>"Notifikasi Layar Kunci" (Lock screen)</strong> agar menyala di layar terkunci.</li>
            </ol>
          </div>

          {/* Oppo / Realme / Vivo */}
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
            <p className="font-extrabold text-slate-900 flex items-center gap-1.5 text-xs">
              <Smartphone className="w-4 h-4 text-emerald-600" />
              HP Oppo / Realme / Vivo:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-700 pl-1 leading-relaxed">
              <li>Buka <strong>Pengaturan &rarr; Manajemen Aplikasi &rarr; Chrome &rarr; Kelola Notifikasi</strong>.</li>
              <li>Centang opsi <strong>"Spanduk / Tampilan Atas" (Banner / Top Preview)</strong>.</li>
              <li>Centang opsi <strong>"Tampilkan di Layar Kunci"</strong>.</li>
            </ol>
          </div>

          {/* iPhone */}
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
            <p className="font-extrabold text-slate-900 flex items-center gap-1.5 text-xs">
              <Share className="w-4 h-4 text-blue-600" />
              iPhone (iOS Safari):
            </p>
            <p className="text-[11px] text-slate-700 pl-1 leading-relaxed">
              Wajib tambahkan ke <strong>Layar Utama (Add to Home Screen)</strong> terlebih dahulu. Setelah itu buka Pengaturan iPhone &rarr; Pemberitahuan &rarr; Absensi M1B &rarr; Centang <strong>Layar Kunci</strong> dan <strong>Spanduk (Banners)</strong>.
            </p>
          </div>

          {/* Tombol Uji Layar Kunci di dalam modal */}
          <div className="pt-2 flex items-center justify-between gap-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setIsLockScreenGuideOpen(false);
                handleTestLockScreenNotification();
              }}
              className="text-xs flex items-center gap-1.5 font-bold text-[#2e8b38] border-emerald-300 hover:bg-emerald-50 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Uji Layar Kunci (5s)</span>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setIsLockScreenGuideOpen(false)}
              className="bg-[#2e8b38] hover:bg-[#247539] text-white text-xs font-semibold cursor-pointer"
            >
              Saya Mengerti
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── MODAL KALENDER KUSTOM TEMA MADRASAH ── */}
      <Modal
        isOpen={isCalendarModalOpen}
        onClose={() => setIsCalendarModalOpen(false)}
        title="Pilih Tanggal Presensi"
        description="Pilih tanggal untuk melihat jadwal dan riwayat presensi siswa:"
      >
        <div className="space-y-4">
          {/* Header Kalender: Navigasi Bulan */}
          <div className="flex items-center justify-between p-2.5 rounded-2xl bg-gradient-to-r from-[#1c5e2d] to-[#2e8b38] text-white shadow-xs">
            <button
              type="button"
              onClick={() => {
                const prev = new Date(calendarViewDate);
                prev.setMonth(prev.getMonth() - 1);
                setCalendarViewDate(prev);
              }}
              className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 active:scale-95 flex items-center justify-center transition-all cursor-pointer"
              title="Bulan Sebelumnya"
            >
              <ChevronLeft className="w-4 h-4 text-white" />
            </button>

            <span className="text-sm font-bold tracking-wide">
              {calendarViewDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
            </span>

            <button
              type="button"
              onClick={() => {
                const next = new Date(calendarViewDate);
                next.setMonth(next.getMonth() + 1);
                setCalendarViewDate(next);
              }}
              className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 active:scale-95 flex items-center justify-center transition-all cursor-pointer"
              title="Bulan Berikutnya"
            >
              <ChevronRight className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* Grid Hari Kalender (Senin - Minggu) */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((day, idx) => (
              <span
                key={day}
                className={`text-[11px] font-bold py-1 ${
                  idx === 6 ? 'text-red-500' : idx === 4 ? 'text-emerald-700' : 'text-slate-500'
                }`}
              >
                {day}
              </span>
            ))}

            {/* Kotak Tanggal */}
            {(() => {
              const year = calendarViewDate.getFullYear();
              const month = calendarViewDate.getMonth();
              const firstDayOfMonth = new Date(year, month, 1);
              const daysInMonth = new Date(year, month + 1, 0).getDate();

              // Hari pertama: Senin = 0, Minggu = 6
              let startOffset = firstDayOfMonth.getDay() - 1;
              if (startOffset === -1) startOffset = 6;

              const cells = [];
              // Padding slot awal
              for (let i = 0; i < startOffset; i++) {
                cells.push(<div key={`empty-${i}`} className="h-9" />);
              }

              for (let d = 1; d <= daysInMonth; d++) {
                const dayDate = new Date(year, month, d);
                const isoStr = getLocalDateString(dayDate);
                const isSelected = isoStr === selectedDate;
                const isCurrentToday = isoStr === todayStr;
                const statusOnDate = datesStatusMap[isoStr];
                const dayOff = checkIsDayOff(isoStr);
                const isSunday = dayDate.getDay() === 0;

                cells.push(
                  <button
                    key={isoStr}
                    type="button"
                    onClick={() => {
                      setSelectedDate(isoStr);
                      setIsCalendarModalOpen(false);
                    }}
                    className={`h-9 rounded-xl flex flex-col items-center justify-center relative transition-all active:scale-95 cursor-pointer text-xs font-semibold ${
                      isSelected
                        ? 'bg-[#2e8b38] text-white font-black shadow-sm ring-2 ring-emerald-500/40'
                        : isCurrentToday
                        ? 'bg-emerald-50 text-emerald-900 border border-emerald-400 font-bold'
                        : isSunday || dayOff.isDayOff
                        ? 'bg-rose-50/50 text-rose-600 hover:bg-rose-100'
                        : 'hover:bg-slate-100 text-slate-800'
                    }`}
                  >
                    <span>{d}</span>
                    {/* Dot status presensi */}
                    <div className="flex items-center gap-0.5 h-1 mt-0.5">
                      {statusOnDate ? (
                        <span
                          className={`w-1 h-1 rounded-full ${
                            isSelected
                              ? 'bg-white'
                              : statusOnDate === 'HADIR'
                              ? 'bg-[#2e8b38]'
                              : statusOnDate === 'TERLAMBAT'
                              ? 'bg-amber-500'
                              : statusOnDate === 'IZIN'
                              ? 'bg-blue-500'
                              : 'bg-red-500'
                          }`}
                        />
                      ) : null}
                    </div>
                  </button>
                );
              }

              return cells;
            })()}
          </div>

          {/* Legend Status Kehadiran */}
          <div className="pt-2 border-t border-border flex items-center justify-between text-[10px] text-slate-600 font-medium px-1 flex-wrap gap-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#2e8b38]" />
              <span>Hadir</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>Terlambat</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span>Izin/Sakit</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span>Alfa</span>
            </div>
          </div>

          {/* Tombol Hari Ini & Tutup */}
          <div className="pt-2 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedDate(todayStr);
                setCalendarViewDate(new Date(todayStr + 'T00:00:00'));
                setIsCalendarModalOpen(false);
              }}
              className="text-xs"
            >
              Pilih Hari Ini
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setIsCalendarModalOpen(false)}
              className="bg-[#2e8b38] hover:bg-[#247539] text-white text-xs font-semibold"
            >
              Tutup
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ParentDashboard;
