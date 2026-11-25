import React, { useState, useEffect } from 'react';
import { db } from '../../db/attendanceDb';
import {
  getAppsScriptUrl, setAppsScriptUrl,
  getAppsScriptToken, setAppsScriptToken,
  saveSchoolSettingsToServer, fetchSchoolSettingsFromServer,
  invalidateApiCache,
  forceResyncAllToday,
} from '../../services/syncService';
import { Swal } from '../../lib/swal';
import type { DeviceId, UserAccount } from '../../types';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import {
  Settings,
  Clock,
  Link2,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Database,
  Laptop,
  KeyRound,
  ShieldCheck,
  Send,
  Smartphone,
  BellRing,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  RefreshCw,
} from 'lucide-react';

export type SettingsTask = 'jadwal' | 'backend' | 'push_notif' | 'workstation' | 'pemeliharaan' | 'keamanan';

export interface SettingsPageProps {
  currentDeviceId: DeviceId;
  onDeviceChange: (id: DeviceId) => void;
  onLogout?: () => void;
  currentUser?: UserAccount | null;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  currentDeviceId,  
  onDeviceChange,
  onLogout,
  currentUser,
}) => {
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const [activeTask, setActiveTask] = useState<SettingsTask>(() => isSuperAdmin ? 'jadwal' : 'workstation');
  const [scriptUrl, setScriptUrlState] = useState('');
  const [scriptToken, setScriptTokenState] = useState('');
  const [urlError, setUrlError] = useState('');
  const [entryStartTime, setEntryStartTime] = useState('06:30');
  const [entryTimeLimit, setEntryTimeLimit] = useState('07:15');
  const [lateLimitTime, setLateLimitTime] = useState('07:30');
  const [dismissalTime, setDismissalTime] = useState('15:30');
  const [timeZone, setTimeZone] = useState('Asia/Makassar');

  const [testStatus, setTestStatus] = useState<{
    loading: boolean;
    success?: boolean;
    message?: string;
  }>({ loading: false });

  const [savedSuccess, setSavedSuccess] = useState(false);

  // State Uji Coba Web Push Notification
  const [pushTestPhone, setPushTestPhone] = useState('');
  const [pushTestStatus, setPushTestStatus] = useState<{
    loading: boolean;
    success?: boolean;
    message?: string;
  }>({ loading: false });

  useEffect(() => {
    setScriptUrlState(getAppsScriptUrl());
    setScriptTokenState(getAppsScriptToken());

    const applySavedLocal = () => {
      const savedStart = localStorage.getItem('school_entry_start');
      if (savedStart) setEntryStartTime(savedStart);
      const savedLimit = localStorage.getItem('school_entry_limit');
      if (savedLimit) setEntryTimeLimit(savedLimit);
      const savedLate = localStorage.getItem('school_late_limit');
      if (savedLate) setLateLimitTime(savedLate);
      const savedDismissal = localStorage.getItem('school_dismissal_time');
      if (savedDismissal) setDismissalTime(savedDismissal);
      const savedTz = localStorage.getItem('school_timezone');
      if (savedTz) setTimeZone(savedTz);
    };

    applySavedLocal();

    // Ambil pengaturan terbaru dari server MySQL
    fetchSchoolSettingsFromServer().then((res) => {
      if (res.success) {
        applySavedLocal();
      }
    }).catch(() => {});
  }, []);

  const handleSaveSettings = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setUrlError('');

    // Validasi URL — izinkan relative path /api/, domain Google Apps Script, maupun http/https
    const trimmed = scriptUrl.trim();
    if (trimmed && !trimmed.startsWith('/') && !trimmed.startsWith('https://') && !trimmed.startsWith('http://')) {
      setUrlError('URL tidak valid. Gunakan /api/ untuk XAMPP, atau https://script.google.com/... untuk Google Sheets.');
      return;
    }

    try {
      setAppsScriptUrl(scriptUrl);
    } catch (err: unknown) {
      setUrlError(err instanceof Error ? err.message : 'URL tidak valid.');
      return;
    }

    setAppsScriptToken(scriptToken);
    localStorage.setItem('school_entry_start', entryStartTime);
    localStorage.setItem('school_entry_limit', entryTimeLimit);
    localStorage.setItem('school_late_limit', lateLimitTime);
    localStorage.setItem('school_dismissal_time', dismissalTime);
    localStorage.setItem('school_timezone', timeZone);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('school-settings-updated', {
        detail: {
          entry_start: entryStartTime,
          entry_limit: entryTimeLimit,
          late_limit: lateLimitTime,
          dismissal: dismissalTime,
          timezone: timeZone,
        }
      }));
    }

    // Simpan ke server MySQL secara async (tidak memblokir UI)
    saveSchoolSettingsToServer({
      entry_start: entryStartTime,
      entry_limit: entryTimeLimit,
      late_limit: lateLimitTime,
      dismissal: dismissalTime,
      timezone: timeZone,
    }).then((res) => {
      if (res.success) {
        Swal.success('Pengaturan Tersimpan', 'Jadwal operasional berhasil disimpan ke database server dan akan tersinkron ke semua perangkat orang tua.');
      } else {
        Swal.success('Tersimpan Lokal', 'Pengaturan disimpan di perangkat ini. Server MySQL tidak terhubung saat ini.');
      }
    }).catch(() => {
      Swal.success('Tersimpan Lokal', 'Pengaturan disimpan di perangkat ini. Server MySQL tidak terhubung saat ini.');
    });

    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleTestConnection = async () => {
    const trimmedUrl = scriptUrl.trim();
    if (!trimmedUrl) {
      setTestStatus({
        loading: false,
        success: false,
        message: 'Masukkan URL backend. Klik tombol hijau "Gunakan MySQL XAMPP" untuk pengisian otomatis.',
      });
      return;
    }

    if (!trimmedUrl.startsWith('/') && !trimmedUrl.startsWith('https://') && !trimmedUrl.startsWith('http://')) {
      setTestStatus({
        loading: false,
        success: false,
        message: 'URL tidak valid. Gunakan /api/ untuk XAMPP, atau https://script.google.com/... untuk Google Sheets.',
      });
      return;
    }

    setTestStatus({ loading: true, message: 'Menguji koneksi ke server backend...' });

    try {
      const tokenParam = scriptToken.trim()
        ? `&token=${encodeURIComponent(scriptToken.trim())}`
        : '';
      
      let targetUrl = trimmedUrl;
      if (typeof window !== 'undefined' && (window.location.protocol === 'https:' || window.location.hostname !== 'localhost') && targetUrl.startsWith('http://localhost')) {
        targetUrl = '/api/';
      }

      const separator = targetUrl.includes('?') ? '&' : '?';
      const res = await fetch(`${targetUrl}${separator}action=ping${tokenParam}`, {
        signal: AbortSignal.timeout(8000),
      });
      
      if (!res.ok) {
        throw new Error(`Server merespons status HTTP ${res.status} (${res.statusText})`);
      }

      const json = await res.json();

      if (json && json.success) {
        setTestStatus({
          loading: false,
          success: true,
          message: `✅ ${json.message || 'Koneksi berhasil! Backend aktif, database terhubung.'}${json.totalSiswa !== undefined ? ` (${json.totalSiswa} siswa, ${json.totalAbsensi ?? 0} absensi)` : ''}`,
        });
      } else {
        setTestStatus({
          loading: false,
          success: false,
          message: json.error || 'Server merespons tetapi mengembalikan error.',
        });
      }
    } catch (err: any) {
      const isAppsScript = trimmedUrl.includes('script.google.com');
      const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
      let hint = '';
      if (isTimeout) {
        hint = 'Koneksi timeout (> 8 detik). Pastikan Apache & MySQL XAMPP sudah dijalankan (tombol Start di XAMPP Control Panel harus hijau).';
      } else if (isAppsScript) {
        hint = 'Gagal ke Google Apps Script. Pastikan sudah Deploy → New deployment → Web app dengan akses "Anyone" (Siapa saja).';
      } else {
        hint = 'Pastikan Apache & MySQL XAMPP sudah dijalankan (tombol Start di XAMPP Control Panel berwarna hijau).';
      }
      setTestStatus({
        loading: false,
        success: false,
        message: `${err.message || 'Koneksi gagal'}. ${hint}`,
      });
    }
  };

  const [isResyncing, setIsResyncing] = useState(false);

  const handleForceResync = async () => {
    const confirmed = await Swal.confirm(
      'Sinkronkan Ulang Semua Data Hari Ini?',
      'Seluruh transaksi absensi (masuk & pulang) yang tersimpan di perangkat ini untuk hari ini akan dikirim ulang ke server MySQL. Jam pulang yang sempat tertinggal offline akan langsung tercatat di database.'
    );
    if (!confirmed) return;

    setIsResyncing(true);
    try {
      const res = await forceResyncAllToday(currentDeviceId);
      if (res.success) {
        Swal.success(
          'Sinkronisasi Berhasil',
          `Berhasil menyinkronkan ${res.count} transaksi hari ini ke server MySQL! Semua jam masuk dan jam pulang telah diperbarui di database.`
        );
      } else {
        Swal.error('Gagal Sinkronisasi', res.error || 'Periksa koneksi internet ke server.');
      }
    } catch (err: any) {
      Swal.error('Gagal', err?.message || 'Terjadi kesalahan saat sinkronisasi.');
    } finally {
      setIsResyncing(false);
    }
  };

  const handleClearSyncedData = async () => {
    const confirmed = await Swal.confirm(
      'Bersihkan Data Tersinkron?',
      'Transaksi yang sudah tersinkron ke server akan dihapus dari penyimpanan lokal. Data pending tidak akan terpengaruh.'
    );
    if (!confirmed) return;
    await db.transactions.where('syncStatus').equals('SYNCED').delete();
    Swal.success('Berhasil', 'Data tersinkron berhasil dibersihkan dari penyimpanan lokal.');
  };

  const handleClearAppCache = async () => {
    const confirmed = await Swal.confirm(
      'Hapus Cache Aplikasi & Browser?',
      'Semua cache file statis (HTML/JS/CSS), cache offline PWA (Service Worker), dan memori data sementara pada browser ini akan dibersihkan. Halaman akan otomatis dimuat ulang.'
    );
    if (!confirmed) return;

    try {
      invalidateApiCache();

      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }

      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          await reg.update();
        }
      }

      await Swal.success('Cache Dihapus', 'Cache aplikasi berhasil dibersihkan. Memuat ulang sistem...');
      window.location.reload();
    } catch (err: any) {
      Swal.error('Gagal', err?.message || 'Gagal membersihkan cache browser.');
    }
  };

  // Daftar Kartu Task Pengaturan
  const allTasks: {
    id: SettingsTask;
    title: string;
    badge: string;
    desc: string;
    icon: React.ElementType;
    color: string;
    superAdminOnly?: boolean;
  }[] = [
    {
      id: 'jadwal',
      title: 'Jadwal & Jam',
      badge: `${entryStartTime} - ${entryTimeLimit}`,
      desc: 'Batas toleransi masuk & pulang',
      icon: Clock,
      color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
      superAdminOnly: true,
    },
    {
      id: 'backend',
      title: 'Database Server',
      badge: scriptUrl ? (scriptUrl.includes('google') ? 'Google Sheets' : 'MySQL XAMPP') : 'Belum Terhubung',
      desc: 'API endpoint & token keamanan',
      icon: Database,
      color: 'text-primary-700 bg-primary-50 border-primary-200',
      superAdminOnly: true,
    },
    {
      id: 'push_notif',
      title: 'Web Push HP',
      badge: 'PWA Native',
      desc: 'Engine notifikasi & tes kirim HP',
      icon: BellRing,
      color: 'text-amber-700 bg-amber-50 border-amber-200',
      superAdminOnly: true,
    },
    {
      id: 'workstation',
      title: 'Workstation PC',
      badge: currentDeviceId,
      desc: 'Pengenal komputer operator ini',
      icon: Laptop,
      color: 'text-blue-700 bg-blue-50 border-blue-200',
    },
    {
      id: 'pemeliharaan',
      title: 'Pemeliharaan',
      badge: 'Cache & Data',
      desc: 'Pembersihan riwayat & cache',
      icon: Trash2,
      color: 'text-rose-700 bg-rose-50 border-rose-200',
    },
    {
      id: 'keamanan',
      title: 'Sesi Akun',
      badge: `@${currentUser?.username || 'admin'}`,
      desc: 'Informasi akun & keluar aman',
      icon: LogOut,
      color: 'text-slate-700 bg-slate-100 border-slate-200',
    },
  ];

  const tasks = allTasks.filter((t) => isSuperAdmin || !t.superAdminOnly);

  // Pastikan jika bukan super admin dan task aktif adalah task terbatas, otomatis fallback ke workstation
  useEffect(() => {
    if (!isSuperAdmin && ['jadwal', 'backend', 'push_notif'].includes(activeTask)) {
      setActiveTask('workstation');
    }
  }, [isSuperAdmin, activeTask]);

  const currentTaskIndex = tasks.findIndex((t) => t.id === activeTask);
  const prevTask = currentTaskIndex > 0 ? tasks[currentTaskIndex - 1] : null;
  const nextTask = currentTaskIndex < tasks.length - 1 ? tasks[currentTaskIndex + 1] : null;

  return (
    <div className="space-y-5">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-content-primary">Pengaturan Sistem Absensi</h2>
          </div>
        </div>

        {/* Global Save Button — hanya untuk Super Admin pada task jadwal, backend, workstation */}
        {isSuperAdmin && ['jadwal', 'backend', 'workstation'].includes(activeTask) && (
          <Button
            type="button"
            onClick={() => handleSaveSettings()}
            size="sm"
            className="shadow-sm self-start sm:self-auto"
          >
            Simpan Pengaturan
          </Button>
        )}
      </div>

      {savedSuccess && (
        <div className="p-3 bg-status-success-bg border border-status-success/30 rounded-card text-status-success text-xs font-semibold flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Pengaturan sistem berhasil disimpan ke penyimpanan lokal &amp; disinkronkan ke server!</span>
        </div>
      )}

      {/* ── TASK CARDS SELECTOR (Bento Task Cards) ─────────────────────────── */}
      <div className={`grid gap-2.5 ${isSuperAdmin ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6' : 'grid-cols-2 max-w-md'}`}>
        {tasks.map((task) => {
          const Icon = task.icon;
          const isActive = activeTask === task.id;

          return (
            <button
              key={task.id}
              type="button"
              onClick={() => setActiveTask(task.id)}
              className={`p-3.5 rounded-2xl text-left transition-all duration-150 flex flex-col justify-between border relative cursor-pointer ${
                isActive
                  ? 'border-2 border-[#2e8b38] bg-white shadow-md ring-2 ring-emerald-500/20 scale-[1.01]'
                  : 'bg-white border-border hover:border-emerald-300 hover:bg-emerald-50/20 shadow-xs'
              }`}
            >
              {isActive && (
                <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-[#2e8b38] animate-pulse" />
              )}
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-2 rounded-xl ${task.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div>
                <p className={`text-xs font-bold leading-tight ${isActive ? 'text-[#2e8b38]' : 'text-slate-800'}`}>
                  {task.title}
                </p>
                <p className="text-[10px] font-mono font-semibold text-slate-500 truncate mt-0.5">
                  {task.badge}
                </p>
                <p className="text-[10px] text-slate-400 truncate mt-0.5 hidden sm:block">
                  {task.desc}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── CARD TASK AKTIF ─────────────────────────────────────────────────── */}
      <div className="animate-fade-in">
        {/* TASK 1: JADWAL & WAKTU — Khusus Super Admin */}
        {isSuperAdmin && activeTask === 'jadwal' && (
          <Card>
            <CardHeader className="border-b border-border bg-emerald-50/30">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-800">
                  <Clock className="w-5 h-5 text-[#2e8b38]" />
                </div>
                <div>
                  <CardTitle>Jadwal Sekolah &amp; Toleransi Absensi Siswa</CardTitle>
                  <CardDescription>
                    Menentukan batas waktu otomatis status Hadir Tepat Waktu vs Terlambat serta jam buka sesi kepulangan.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5 p-5 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Input
                  label="Jam Buka Scan Masuk"
                  type="time"
                  value={entryStartTime}
                  onChange={(e) => setEntryStartTime(e.target.value)}
                  helperText="Mulai pemindaian gerbang (default 06:30)"
                  required
                />
                <Input
                  label="Batas Jam Masuk (Tepat Waktu)"
                  type="time"
                  value={entryTimeLimit}
                  onChange={(e) => setEntryTimeLimit(e.target.value)}
                  helperText="Lewat jam ini otomatis TERLAMBAT (07:15)"
                  required
                />
                <Input
                  label="Batas Terlambat / Gerbang Tutup"
                  type="time"
                  value={lateLimitTime}
                  onChange={(e) => setLateLimitTime(e.target.value)}
                  helperText="Batas akhir toleransi masuk (07:30)"
                  required
                />
                <Input
                  label="Jam Mulai Kepulangan Siswa"
                  type="time"
                  value={dismissalTime}
                  onChange={(e) => setDismissalTime(e.target.value)}
                  helperText="Awal pembukaan sesi PULANG (15:30)"
                  required
                />
              </div>

              <div>
                <Select
                  label="Zona Waktu Operasional Madrasah"
                  value={timeZone}
                  onChange={(e) => setTimeZone(e.target.value)}
                  helperText="MAN 1 Bulukumba berlokasi di Sulawesi Selatan menggunakan WITA (Asia/Makassar - UTC+8)"
                >
                  <option value="Asia/Makassar">WITA (Asia/Makassar - UTC+8)</option>
                  <option value="Asia/Jakarta">WIB (Asia/Jakarta - UTC+7)</option>
                  <option value="Asia/Jayapura">WIT (Asia/Jayapura - UTC+9)</option>
                </Select>
              </div>

              <div className="p-3.5 bg-emerald-50/60 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-[#2e8b38] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-emerald-950">Aturan Penentuan Status Otomatis:</p>
                  <p className="text-[11px] leading-relaxed">
                    Siswa yang scan pada rentang <strong>{entryStartTime} &ndash; {entryTimeLimit} WITA</strong> dicatat <strong>Hadir Tepat</strong>. 
                    Scan antara <strong>{entryTimeLimit} &ndash; {lateLimitTime} WITA</strong> dicatat <strong>Terlambat</strong>. 
                    Setelah gerbang ditutup, sistem mencatat status khusus atau penanganan manual oleh Guru Piket / BK.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* TASK 2: INTEGRASI SERVER & DATABASE — Khusus Super Admin */}
        {isSuperAdmin && activeTask === 'backend' && (
          <Card>
            <CardHeader className="border-b border-border bg-emerald-50/30">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-800">
                  <Database className="w-5 h-5 text-[#2e8b38]" />
                </div>
                <div>
                  <CardTitle>Integrasi Backend Server (MySQL XAMPP / Google Sheets)</CardTitle>
                  <CardDescription>
                    Pusat penyimpanan database terpusat agar sinkronisasi antar PC gerbang dan HP orang tua berjalan lancar.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-5 sm:p-6">
              {/* Panduan 3 Pilihan Sumber Data */}
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2 text-xs text-emerald-900">
                <div className="font-bold flex items-center gap-1.5 text-emerald-900">
                  <span>💡</span>
                  <span>Rekomendasi Sumber Data MAN 1 Bulukumba:</span>
                </div>
                <ul className="space-y-1 text-[11px] text-emerald-800 list-disc list-inside leading-relaxed">
                  <li>
                    <strong>MySQL XAMPP (Sangat Direkomendasikan):</strong> Pastikan Apache &amp; MySQL di XAMPP Control Panel sudah <strong>Start (Hijau)</strong>, lalu klik tombol hijau di bawah.
                  </li>
                  <li>
                    <strong>Google Sheets / Apps Script:</strong> Masukkan URL Web App dari Google Sheets (Deploy &gt; Web app &gt; Anyone).
                  </li>
                  <li>
                    <strong>File Excel / CSV Offline:</strong> Dapat diunggah langsung lewat menu <em>Data Siswa &gt; Import Excel / CSV</em>.
                  </li>
                </ul>
              </div>

              {/* Tombol Cepat Pilihan Database */}
              <div className="flex flex-wrap gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl items-center">
                <span className="text-xs font-bold text-slate-700 mr-1">Pilihan Cepat:</span>
                <button
                  type="button"
                  onClick={() => {
                    setScriptUrlState('/api/');
                    setScriptTokenState('man1bulukumba_2026');
                    setUrlError('');
                  }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-xs"
                >
                  Gunakan MySQL XAMPP (phpMyAdmin)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setScriptUrlState('');
                    setScriptTokenState('man1bulukumba_2026');
                    setUrlError('');
                  }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Gunakan Google Sheets
                </button>
              </div>

              <Input
                label="URL Backend Server (API XAMPP / Google Apps Script)"
                placeholder="/api/ atau https://script.google.com/..."
                value={scriptUrl}
                onChange={(e) => { setScriptUrlState(e.target.value); setUrlError(''); }}
                helperText="Untuk MySQL XAMPP gunakan: /api/ | Untuk Google Sheets: https://script.google.com/macros/s/.../exec"
                error={urlError}
              />

              {/* Token rahasia untuk autentikasi */}
              <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-amber-800">Token Keamanan Backend API</p>
                    <p className="text-[10px] text-amber-700 mt-0.5">
                      Token ini dikirimkan ke server setiap kali sinkronisasi (default: <code>man1bulukumba_2026</code>).
                    </p>
                  </div>
                </div>
                <Input
                  label="Secret Token"
                  type="password"
                  placeholder="man1bulukumba_2026"
                  value={scriptToken}
                  onChange={(e) => setScriptTokenState(e.target.value)}
                  leftIcon={<KeyRound className="w-4 h-4" />}
                  helperText="Token keamanan standar: man1bulukumba_2026"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  isLoading={testStatus.loading}
                  leftIcon={<Link2 className="w-4 h-4" />}
                >
                  Uji Koneksi Backend
                </Button>

                {testStatus.message && (
                  <div
                    className={`text-xs p-2.5 rounded-xl flex items-center gap-2 ${
                      testStatus.success
                        ? 'bg-status-success-bg text-status-success border border-status-success/30'
                        : 'bg-status-danger-bg text-status-danger border border-status-danger/30'
                    }`}
                  >
                    {testStatus.success ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span>{testStatus.message}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* TASK 3: WEB PUSH NOTIFIKASI — Khusus Super Admin */}
        {isSuperAdmin && activeTask === 'push_notif' && (
          <Card>
            <CardHeader className="border-b border-border bg-amber-50/30">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-amber-100 text-amber-800">
                  <BellRing className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <CardTitle>Web Push Notification (PWA Native — Layar Terkunci)</CardTitle>
                  <CardDescription>
                    Engine Web Push bawaan (RFC 8291 / VAPID via Service Worker). Membangunkan HP orang tua &amp; memunculkan notifikasi resmi di layar kunci HP saat siswa scan gerbang.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-5 sm:p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-[11px] font-bold text-slate-500 uppercase">Status Push Engine</p>
                  <p className="text-sm font-black text-emerald-600 mt-0.5 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Aktif (Siap Digunakan)
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">RFC 8291 aes128gcm &amp; NIST P-256</p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-[11px] font-bold text-slate-500 uppercase">Protokol Push</p>
                  <p className="text-sm font-black text-slate-800 mt-0.5">
                    VAPID &amp; Google FCM
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">Membangunkan Service Worker saat HP tertutup</p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-[11px] font-bold text-slate-500 uppercase">Pengiriman Otomatis</p>
                  <p className="text-sm font-black text-primary-700 mt-0.5">
                    Setiap Scan Gerbang
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">Sesi Masuk &amp; Pulang Siswa</p>
                </div>
              </div>

              {/* Uji Coba Kirim Push Notification */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-primary-600" />
                  <span>Uji Coba Kirim Web Push Langsung ke HP Terdaftar:</span>
                </p>
                <p className="text-[11px] text-slate-500">
                  Ketikkan nomor HP orang tua atau ID Siswa untuk mengetes pengiriman notifikasi Web Push dari server langsung ke HP penerima.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={pushTestPhone}
                    onChange={(e) => setPushTestPhone(e.target.value)}
                    placeholder="Nomor HP Orang Tua / ID Siswa (contoh: 081234567890)"
                    className="flex-1 text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={async () => {
                      if (!pushTestPhone.trim()) {
                        setPushTestStatus({ loading: false, success: false, message: 'Masukkan nomor HP atau ID Siswa.' });
                        return;
                      }
                      setPushTestStatus({ loading: true, message: 'Mengirim sinyal Web Push ke HP...' });
                      try {
                        const res = await fetch('/api/', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            action: 'testPushNotification',
                            phone: pushTestPhone.trim(),
                            studentId: pushTestPhone.trim(),
                          }),
                        });
                        const json = await res.json();
                        if (json && json.success) {
                          setPushTestStatus({
                            loading: false,
                            success: true,
                            message: 'Sinyal Web Push berhasil dikirim ke perangkat! Periksa layar HP penerima.',
                          });
                        } else {
                          setPushTestStatus({
                            loading: false,
                            success: false,
                            message: json.error || 'Gagal mengirim push notification.',
                          });
                        }
                      } catch (err: any) {
                        setPushTestStatus({
                          loading: false,
                          success: false,
                          message: err.message || 'Koneksi ke backend server gagal.',
                        });
                      }
                    }}
                    disabled={pushTestStatus.loading}
                    className="bg-primary-600 hover:bg-primary-700 text-white shrink-0 font-bold"
                    leftIcon={<Send className="w-3.5 h-3.5" />}
                  >
                    {pushTestStatus.loading ? 'Mengirim...' : 'Kirim Push Test'}
                  </Button>
                </div>
                {pushTestStatus.message && (
                  <p className={`text-xs mt-1.5 font-semibold ${pushTestStatus.success ? 'text-emerald-700' : 'text-red-600'}`}>
                    {pushTestStatus.message}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* TASK 4: WORKSTATION KOMPUTER */}
        {activeTask === 'workstation' && (
          <Card>
            <CardHeader className="border-b border-border bg-blue-50/30">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-blue-100 text-blue-800">
                  <Laptop className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <CardTitle>Identitas Fisik Workstation Komputer Ini</CardTitle>
                  <CardDescription>
                    Pengenal unik yang disematkan pada setiap catatan transaksi absensi yang dikirim dari browser komputer ini.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-5 sm:p-6">
              <div className="max-w-md">
                <Select
                  label="Identitas Perangkat Aktif di Ruangan / Gerbang"
                  value={currentDeviceId}
                  onChange={(e) => onDeviceChange(e.target.value as DeviceId)}
                  disabled={!isSuperAdmin}
                  helperText={!isSuperAdmin ? `Workstation [${currentDeviceId}] terkunci khusus untuk akun operator ini.` : undefined}
                >
                  <option value="PC-01">PC-01 (Komputer Gerbang Utama Madrasah)</option>
                  <option value="PC-02">PC-02 (Komputer Gerbang Barat)</option>
                  <option value="PC-03">PC-03 (Komputer Ruang Piket / Guru)</option>
                </Select>
              </div>

              <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-1">
                <p className="font-bold">Ketentuan Keamanan Multi-PC:</p>
                <p className="text-[11px] leading-relaxed">
                  Setiap transaksi absensi menyimpan riwayat <code>deviceId</code> secara permanen. Hal ini menjamin audit data transparan, membuktikan di gerbang mana siswa memindai kartu presensinya.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* TASK 5: PEMELIHARAAN DATA & CACHE — Tersedia untuk Semua Admin */}
        {activeTask === 'pemeliharaan' && (
          <Card className="border-red-200">
            <CardHeader className="border-b border-red-100 bg-red-50/40">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-red-100 text-red-800">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <CardTitle className="text-red-950">Pemeliharaan &amp; Pembersihan Ruang Penyimpanan Lokal</CardTitle>
                  <CardDescription className="text-red-800">
                    Pembersihan cache browser, PWA offline storage, dan cache IndexedDB pada komputer ini tanpa menghilangkan data di server MySQL.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-5 sm:p-6 space-y-4">
              {/* Opsi 1: Sinkronkan Ulang Semua Transaksi Hari Ini ke Server */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-emerald-200 bg-emerald-50/50">
                <div>
                  <h4 className="text-xs font-bold text-emerald-950">Sinkronkan Ulang Semua Data Hari Ini ke Server</h4>
                  <p className="text-[11px] text-emerald-800 mt-0.5">
                    Kirim ulang seluruh transaksi lokal hari ini ke server MySQL. Gunakan tombol ini jika ada jam pulang yang baru dicatat offline agar langsung masuk ke database.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={isResyncing}
                  onClick={handleForceResync}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold border-none shadow-xs shrink-0"
                  leftIcon={<RefreshCw className={`w-4 h-4 ${isResyncing ? 'animate-spin' : ''}`} />}
                >
                  {isResyncing ? 'Menyinkronkan...' : 'Sinkronkan Ulang Hari Ini'}
                </Button>
              </div>

              {/* Opsi 2: Hapus Cache Browser & Aplikasi (PWA) */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-border bg-surface">
                <div>
                  <h4 className="text-xs font-bold text-content-primary">Hapus Cache Browser &amp; Aplikasi (PWA)</h4>
                  <p className="text-[11px] text-content-secondary mt-0.5">
                    Membersihkan seluruh file cache web (HTML/JS/CSS), Service Worker offline, dan memori data sementara agar perangkat selalu menggunakan versi sistem terbaru.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClearAppCache}
                  className="text-amber-700 border-amber-300 hover:bg-amber-50 shrink-0"
                  leftIcon={<RefreshCw className="w-4 h-4" />}
                >
                  Hapus Cache Aplikasi
                </Button>
              </div>

              {/* Opsi 2: Bersihkan Riwayat Absensi yang Sudah Tersinkron */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-border bg-surface">
                <div>
                  <h4 className="text-xs font-bold text-content-primary">Bersihkan Riwayat Absensi yang Sudah Tersinkron</h4>
                  <p className="text-[11px] text-content-secondary mt-0.5">
                    Hanya menghapus transaksi lokal berstatus <code>SYNCED</code> yang telah aman tercatat di database MySQL server. Transaksi pending tidak terhapus.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClearSyncedData}
                  className="text-status-danger border-red-200 hover:bg-red-50 shrink-0"
                  leftIcon={<Trash2 className="w-4 h-4" />}
                >
                  Bersihkan Cache Tersinkron
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* TASK 6: SESI AKUN & KEAMANAN */}
        {activeTask === 'keamanan' && (
          <Card className="border-slate-200">
            <CardHeader className="border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-slate-200 text-slate-800">
                  <LogOut className="w-5 h-5 text-slate-700" />
                </div>
                <div>
                  <CardTitle className="text-slate-900">Sesi Akun &amp; Keamanan Operator</CardTitle>
                  <CardDescription>
                    Kelola sesi login workstation Anda dan lakukan logout secara aman dari perangkat ini.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-5 sm:p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                  <p className="text-[11px] font-semibold text-slate-500">Nama Petugas / Operator</p>
                  <p className="text-sm font-bold text-slate-800 mt-1">{currentUser?.fullName || 'Pengguna'}</p>
                </div>
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                  <p className="text-[11px] font-semibold text-slate-500">Username Login</p>
                  <p className="text-sm font-bold text-[#2e8b38] font-mono mt-1">@{currentUser?.username || 'admin'}</p>
                </div>
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                  <p className="text-[11px] font-semibold text-slate-500">Tingkat Hak Akses</p>
                  <p className="text-sm font-bold text-slate-800 mt-1">
                    {currentUser?.role === 'SUPER_ADMIN' ? 'Super Administrator' : 'Operator Workstation'}
                  </p>
                </div>
              </div>

              {/* Hapus Cache Cepat */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-amber-200 bg-amber-50/40">
                <div>
                  <p className="text-xs font-bold text-amber-950">Hapus Cache Aplikasi &amp; Muat Ulang</p>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    Gunakan tombol ini jika tampilan tidak terbarui atau data tampak belum sinkron di browser ini.
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={handleClearAppCache}
                  variant="outline"
                  size="sm"
                  className="text-amber-800 border-amber-300 hover:bg-amber-100 bg-white shrink-0"
                  leftIcon={<RefreshCw className="w-4 h-4" />}
                >
                  Hapus Cache
                </Button>
              </div>

              {onLogout && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-red-200 bg-red-50/50">
                  <div>
                    <p className="text-xs font-bold text-red-950">Keluar dari Sesi Komputer Ini</p>
                    <p className="text-[11px] text-red-800 mt-0.5">
                      Akhiri sesi aktif Anda. Disarankan selalu logout setelah selesai bertugas di gerbang madrasah.
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={async () => {
                      const confirmed = await Swal.confirm(
                        'Keluar dari Akun?',
                        'Anda akan keluar dari sistem absensi. Pastikan semua data transaksi lokal sudah tersinkronkan.',
                        'Ya, Keluar Sekarang',
                        'Batal'
                      );
                      if (confirmed && onLogout) {
                        onLogout();
                      }
                    }}
                    className="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs border-none shadow-sm shrink-0"
                    leftIcon={<LogOut className="w-4 h-4" />}
                  >
                    Keluar dari Akun
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── FOOTER TASK NAVIGATION (Sebelumnya / Selanjutnya) ─────────────── */}
      <div className="flex items-center justify-between pt-2">
        {prevTask ? (
          <button
            type="button"
            onClick={() => setActiveTask(prevTask.id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Sebelumnya: {prevTask.title}</span>
          </button>
        ) : (
          <div />
        )}

        {nextTask ? (
          <button
            type="button"
            onClick={() => setActiveTask(nextTask.id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-[#2e8b38] hover:bg-emerald-50 transition-colors cursor-pointer"
          >
            <span>Selanjutnya: {nextTask.title}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
};
