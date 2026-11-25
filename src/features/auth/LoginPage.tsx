import React, { useState, useEffect } from 'react';
import { db, setStoredUser, initializeDatabase } from '../../db/attendanceDb';
import type { UserAccount, DeviceId } from '../../types';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import {
  Laptop, 
  Lock, 
  ShieldCheck, 
  AlertCircle, 
  Clock,
  HeartHandshake,
  Phone,
  Shield,
  Info,
  Download,
  Smartphone,
  Share,
  ArrowRight,
  Sparkles,
  School,
} from 'lucide-react';
import { EducationBackdrop } from '../../components/ui/EducationBackdrop';
import {
  hashPassword,
  verifyPassword,
  sanitizeInput,
  checkLoginRateLimit,
  recordFailedLoginAttempt,
  resetLoginAttempts,
  normalizePhoneNumber,
} from '../../lib/utils';
import { 
  fetchUsersFromServer, 
  saveUserToServer, 
  fetchParentsFromServer, 
  saveParentToServer, 
  syncParentPortalData,
  validateUserSession,
  checkIsAccountDeleted,
  markParentAsDeleted,
  clearDeletedParentId,
} from '../../services/syncService';

export interface LoginPageProps {
  currentDeviceId: DeviceId;
  onOpenDeviceSetup: () => void;
  onLoginSuccess: (user: UserAccount) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  currentDeviceId,
  onOpenDeviceSetup,
  onLoginSuccess,
}) => {
  // Hanya ada 2 opsi login: Masuk sebagai Admin / Masuk sebagai Orang Tua
  const [loginRole, setLoginRole] = useState<'ADMIN' | 'PARENT'>('PARENT');

  // State: Form Admin
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  // State: Form Orang Tua
  const [parentPhone, setParentPhone] = useState('');
  const [parentPassword, setParentPassword] = useState('');

  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // State & Handler Instalasi PWA
  const [isPWAInstalled, setIsPWAInstalled] = useState(false);
  const [isInstallGuideOpen, setIsInstallGuideOpen] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsPWAInstalled(isStandalone);
  }, []);

  const handleInstallClick = async () => {
    const promptEvent = (window as any).deferredPWAInstallPrompt;
    if (promptEvent) {
      promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice && choice.outcome === 'accepted') {
        setIsPWAInstalled(true);
      }
      (window as any).deferredPWAInstallPrompt = null;
    } else {
      setIsInstallGuideOpen(true);
    }
  };

  // ── 1. Login Admin / Operator ─────────────────────────────────────
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const rateCheck = checkLoginRateLimit();
      if (!rateCheck.allowed) {
        const menit = Math.ceil((rateCheck.remainingMs ?? 0) / 60000);
        setError(`Terlalu banyak percobaan gagal. Akun dikunci ${menit} menit lagi.`);
        setIsLoading(false);
        return;
      }

      let cleanUser = sanitizeInput(adminUsername).trim().toLowerCase();
      if (cleanUser.startsWith('@')) cleanUser = cleanUser.substring(1).trim();

      if (!cleanUser) {
        setError('Silakan masukkan username admin / operator.');
        setIsLoading(false);
        return;
      }

      const cleanPassword = sanitizeInput(adminPassword, 128);
      if (cleanPassword.length < 6) {
        setError('Password minimal 6 karakter.');
        setIsLoading(false);
        return;
      }

      const totalUser = await db.users.count();
      if (totalUser === 0) {
        await initializeDatabase();
      }

      // Cari user berdasarkan username
      const user = await db.users.where('username').equals(cleanUser).first();

      if (!user) {
        recordFailedLoginAttempt();
        setError('Username atau password admin salah.');
        setIsLoading(false);
        return;
      }

      // Pastikan bukan akun orang tua
      if (user.role === 'PARENT') {
        setError('Akun ini terdaftar sebagai Orang Tua. Silakan gunakan tab "Masuk sebagai Orang Tua".');
        setIsLoading(false);
        return;
      }

      if (user.status !== 'ACTIVE') {
        setError('Akun ini dinonaktifkan. Hubungi administrator.');
        setIsLoading(false);
        return;
      }

      const isPasswordValid = await verifyPassword(cleanPassword, user.passwordHash);
      if (!isPasswordValid) {
        recordFailedLoginAttempt();
        setError('Username atau password admin salah.');
        setIsLoading(false);
        return;
      }

      // Validasi ke server MySQL untuk memastikan akun petugas belum dihapus / dinonaktifkan
      const sessionVal = await validateUserSession(user);
      if (!sessionVal.valid) {
        await db.users.delete(user.userId).catch(() => {});
        setError(sessionVal.message || 'Akun ini telah dihapus atau dinonaktifkan oleh Administrator.');
        setIsLoading(false);
        return;
      }

      // Validasi Device Binding ketat untuk operator gerbang (Anti Fitnah & Penyalahgunaan Akses)
      if (user.role !== 'SUPER_ADMIN' && user.assignedDeviceId !== 'ALL' && user.assignedDeviceId !== currentDeviceId) {
        setError(`Akses Ditolak: Akun Anda (@${cleanUser}) hanya diizinkan bertugas di [${user.assignedDeviceId}], sedangkan komputer ini adalah [${currentDeviceId}]. Anda tidak diizinkan masuk dari workstation lain.`);
        setIsLoading(false);
        return;
      }

      resetLoginAttempts();
      const updatedUser: UserAccount = {
        ...user,
        lastLoginAt: new Date().toISOString(),
      };
      await db.users.update(user.userId, { lastLoginAt: updatedUser.lastLoginAt });

      setStoredUser(updatedUser);
      onLoginSuccess(updatedUser);
    } catch {
      setError('Terjadi kesalahan saat masuk. Silakan muat ulang halaman.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── 2. Login Orang Tua Siswa (Nomor HP & Password) ─────────────────
  const handleParentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const rateCheck = checkLoginRateLimit();
      if (!rateCheck.allowed) {
        const menit = Math.ceil((rateCheck.remainingMs ?? 0) / 60000);
        setError(`Terlalu banyak percobaan gagal. Akun dikunci ${menit} menit lagi.`);
        setIsLoading(false);
        return;
      }

      const rawInput = sanitizeInput(parentPhone).trim();
      const cleanPhone = normalizePhoneNumber(rawInput);

      if (!cleanPhone && !rawInput) {
        setError('Silakan masukkan nomor HP orang tua.');
        setIsLoading(false);
        return;
      }

      const cleanPassword = sanitizeInput(parentPassword, 128);
      if (cleanPassword.length < 6) {
        setError('Password minimal 6 karakter.');
        setIsLoading(false);
        return;
      }

      // 1. Cari akun orang tua di database lokal terlebih dahulu
      let parentUser = await db.users
        .filter((u) => {
          if (u.role !== 'PARENT') return false;
          const userPhoneNorm = u.phone ? normalizePhoneNumber(u.phone) : '';
          const userUsernameNorm = u.username ? normalizePhoneNumber(u.username) : '';
          return (
            (cleanPhone && userPhoneNorm === cleanPhone) ||
            (cleanPhone && userUsernameNorm === cleanPhone) ||
            u.username.toLowerCase() === rawInput.toLowerCase() ||
            u.phone === rawInput ||
            (u.studentId && (u.studentId.toLowerCase() === rawInput.toLowerCase() || u.studentId === cleanPhone))
          );
        })
        .first();

      let isAccountDeleted = false;
      // Jika akun orang tua aktif ditemukan di lokal (baru dibuat oleh admin), bersihkan tanda terhapus lama
      if (parentUser && parentUser.status === 'ACTIVE') {
        clearDeletedParentId(parentUser.userId, cleanPhone || rawInput);
      } else {
        // Jika akun tidak ada di lokal, periksa apakah akun ini memang tercatat telah dihapus oleh Admin
        isAccountDeleted = await checkIsAccountDeleted(cleanPhone || rawInput);
        if (isAccountDeleted) {
          setError('Akun orang tua ini telah dihapus oleh Administrator madrasah. Akses tidak diizinkan.');
          setIsLoading(false);
          return;
        }
      }

      // Sinkronkan akun terbaru dari server agar data lokal terbarui
      try {
        await fetchParentsFromServer();
      } catch {}

      // Jika belum ditemukan di lokal, cari ulang setelah sinkron server
      if (!parentUser) {
        parentUser = await db.users
          .filter((u) => {
            if (u.role !== 'PARENT') return false;
            const userPhoneNorm = u.phone ? normalizePhoneNumber(u.phone) : '';
            const userUsernameNorm = u.username ? normalizePhoneNumber(u.username) : '';
            return (
              (cleanPhone && userPhoneNorm === cleanPhone) ||
              (cleanPhone && userUsernameNorm === cleanPhone) ||
              u.username.toLowerCase() === rawInput.toLowerCase() ||
              u.phone === rawInput ||
              (u.studentId && (u.studentId.toLowerCase() === rawInput.toLowerCase() || u.studentId === cleanPhone))
            );
          })
          .first();
      }

      // 2. Jika tidak ada di lokal (misal baru buka di browser HP), coba sinkron dari tabel orang_tua & users MySQL
      let serverSyncError = '';
      if (!parentUser) {
        try {
          const syncParentsRes = await fetchParentsFromServer();
          if (!syncParentsRes.success) {
            const syncUsersRes = await fetchUsersFromServer();
            if (!syncUsersRes.success && syncUsersRes.error) {
              serverSyncError = syncParentsRes.error || syncUsersRes.error || '';
            }
          }
          parentUser = await db.users
            .filter((u) => {
              if (u.role !== 'PARENT') return false;
              const userPhoneNorm = u.phone ? normalizePhoneNumber(u.phone) : '';
              const userUsernameNorm = u.username ? normalizePhoneNumber(u.username) : '';
              return (
                (cleanPhone && userPhoneNorm === cleanPhone) ||
                (cleanPhone && userUsernameNorm === cleanPhone) ||
                u.username.toLowerCase() === rawInput.toLowerCase() ||
                u.phone === rawInput ||
                (u.studentId && (u.studentId.toLowerCase() === rawInput.toLowerCase() || u.studentId === cleanPhone))
              );
            })
            .first();
        } catch (err: unknown) {
          serverSyncError = err instanceof Error ? err.message : 'Koneksi ke server terputus';
        }
      }

      // 3. Fallback praktis sekolah: Jika nomor HP terdaftar pada data siswa
      // dan orang tua memasukkan password default ('parent123' atau '123456')
      // Catatan: Fallback HANYA berlaku jika akun TIDAK tercatat pernah dihapus admin!
      if (!parentUser && !isAccountDeleted) {
        const matchingStudent = await db.students
          .filter((s) => {
            const studentPhoneNorm = s.whatsappNumber ? normalizePhoneNumber(s.whatsappNumber) : '';
            return (
              (cleanPhone && studentPhoneNorm === cleanPhone) ||
              s.whatsappNumber === rawInput ||
              s.id.toLowerCase() === rawInput.toLowerCase()
            );
          })
          .first();

        if (matchingStudent && (cleanPassword === 'parent123' || cleanPassword === '123456')) {
          const passwordHash = await hashPassword(cleanPassword);

          // Deteksi otomatis jika ada saudara kandung lain dengan nomor WhatsApp yang sama
          const allSiblingStudents = await db.students
            .filter((s) => {
              const studentPhoneNorm = s.whatsappNumber ? normalizePhoneNumber(s.whatsappNumber) : '';
              return Boolean(cleanPhone && studentPhoneNorm === cleanPhone);
            })
            .toArray();
          const allSiblingIds = Array.from(
            new Set([matchingStudent.id, ...allSiblingStudents.map((s) => s.id)])
          );

          const autoUser: UserAccount = {
            userId: `USR-P-${matchingStudent.id}`,
            username: cleanPhone || rawInput,
            fullName: matchingStudent.parentName || `Orang Tua (${matchingStudent.name})`,
            passwordHash,
            role: 'PARENT',
            assignedDeviceId: 'ALL',
            studentId: matchingStudent.id,
            studentIds: allSiblingIds.length > 1 ? allSiblingIds : undefined,
            phone: cleanPhone || rawInput,
            status: 'ACTIVE',
            createdAt: new Date().toISOString(),
            lastLoginAt: new Date().toISOString(),
          };
          await db.users.put(autoUser);
          saveParentToServer(autoUser).catch(() => {});
          saveUserToServer(autoUser).catch(() => {});
          parentUser = autoUser;
        }
      }

      if (!parentUser) {
        recordFailedLoginAttempt();
        if (serverSyncError) {
          setError(`Akun belum ada di HP & gagal menghubungi MySQL XAMPP (${serverSyncError}). Pastikan Apache & MySQL aktif di laptop.`);
        } else {
          setError('Nomor HP atau password tidak cocok. Pastikan akun orang tua sudah dibuat dan diaktifkan oleh pihak madrasah.');
        }
        setIsLoading(false);
        return;
      }

      if (parentUser.status !== 'ACTIVE') {
        setError('Akun orang tua ini belum aktif atau dinonaktifkan oleh pihak sekolah. Silakan hubungi admin.');
        setIsLoading(false);
        return;
      }

      const isPasswordValid = await verifyPassword(cleanPassword, parentUser.passwordHash);
      if (!isPasswordValid) {
        recordFailedLoginAttempt();
        setError('Nomor HP atau password salah.');
        setIsLoading(false);
        return;
      }

      // Validasi ke database server MySQL: Pastikan akun belum dihapus oleh Admin
      clearDeletedParentId(parentUser.userId, cleanPhone || parentUser.phone || parentUser.username);
      const sessionVal = await validateUserSession(parentUser);
      if (!sessionVal.valid && (sessionVal.reason === 'DELETED' || sessionVal.reason === 'INACTIVE')) {
        await db.users.delete(parentUser.userId).catch(() => {});
        if (cleanPhone) markParentAsDeleted(parentUser.userId, cleanPhone);
        setError(sessionVal.message || 'Akun orang tua ini telah dihapus atau dinonaktifkan oleh Administrator madrasah.');
        setIsLoading(false);
        return;
      }

      resetLoginAttempts();
      const updatedUser: UserAccount = {
        ...parentUser,
        passwordHash: await hashPassword(cleanPassword),
        lastLoginAt: new Date().toISOString(),
      };
      await db.users.update(parentUser.userId, { 
        passwordHash: updatedUser.passwordHash,
        lastLoginAt: updatedUser.lastLoginAt 
      });

      // Sinkronkan data anak & absensi dari server MySQL agar langsung muncul di HP
      try {
        const syncRes = await syncParentPortalData(updatedUser.studentId || '', updatedUser.phone || updatedUser.username);
        if (syncRes.success && syncRes.student?.id && !updatedUser.studentId) {
          updatedUser.studentId = syncRes.student.id;
          await db.users.update(parentUser.userId, { studentId: syncRes.student.id });
        }
      } catch (_) {}

      setStoredUser(updatedUser);
      onLoginSuccess(updatedUser);
    } catch {
      setError('Terjadi kesalahan saat masuk. Silakan muat ulang halaman.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex flex-col justify-between bg-gradient-to-br from-[#164e25] via-[#1c5e2d] to-[#2e8b38] select-none overflow-x-hidden">
      {/* ── TOPBAR APPLE-STYLE FROSTED GLASS (Dark variant untuk bg hijau) ── */}
      <header className="w-full apple-glass-nav-dark border-b border-white/15 sticky top-0 z-30 px-4 sm:px-8 py-3 flex items-center justify-between select-none">
        <div className="flex items-center gap-3">
          <img src="/icon-192.png" alt="Logo MAN 1 Bulukumba" className="w-9 h-9 rounded-xl object-contain bg-white/10 p-0.5 shadow-sm ring-1 ring-white/30" />
          <div>
            <h1 className="text-xs sm:text-sm font-bold text-white leading-tight">MAN 1 BULUKUMBA</h1>
            <p className="text-[10px] text-emerald-200 font-medium">Sistem Absensi &amp; Portal Siswa</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/20 text-white border border-white/25">
            <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
            <span className="hidden sm:inline">Server</span> Online
          </span>
        </div>
      </header>

      {/* ── ORNAMEN DEKORATIF  (Curves, Dot Pattern & Education Backdrop) ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-0">
        {/* Backdrop Ornamen Edukasi Halus */}
        <EducationBackdrop svgClassName="text-white" opacity={0.045} />

        {/* Organic Wave Curves (Khas Desain ) */}
        <svg className="absolute -top-20 -left-20 w-96 h-96 text-white/5" viewBox="0 0 200 200" fill="currentColor">
          <path d="M42.7,-62.9C53.9,-54.3,60.8,-40.4,66.4,-26.1C72,-11.8,76.3,2.9,73.4,16.8C70.5,30.7,60.4,43.8,47.9,53.4C35.4,63,20.5,69.1,5.2,71.1C-10.1,73.1,-25.8,71,-39.8,63.4C-53.8,55.8,-66.1,42.7,-72.1,27.1C-78.1,11.5,-77.8,-6.6,-71.7,-22.1C-65.6,-37.6,-53.7,-50.5,-40.3,-58.5C-26.9,-66.5,-12,-69.6,1.8,-72C15.6,-74.4,31.5,-71.5,42.7,-62.9Z" transform="translate(100 100)" />
        </svg>

        <svg className="absolute -bottom-24 -right-24 w-[30rem] h-[30rem] text-emerald-400/10" viewBox="0 0 200 200" fill="currentColor">
          <path d="M38.1,-54C48.8,-44.6,56.5,-32.8,61.8,-19.6C67.1,-6.4,70,8.2,66.4,21.7C62.8,35.2,52.7,47.6,40.1,56.7C27.5,65.8,12.4,71.6,-2.8,75.4C-18,79.2,-33.3,81.0,-45.3,73.8C-57.3,66.6,-66,50.4,-70.8,34.2C-75.6,18.0,-76.5,1.8,-72.5,-12.8C-68.5,-27.4,-59.6,-40.4,-47.6,-49.6C-35.6,-58.8,-20.5,-64.2,-5.6,-62.9C9.3,-61.6,27.4,-63.4,38.1,-54Z" transform="translate(100 100)" />
        </svg>

        {/* Polka Dots Grid Ornament (Aksen Kuning/Emas Edlink) */}
        <div 
          className="absolute right-8 top-28 w-44 h-64 opacity-25 hidden md:block"
          style={{
            backgroundImage: 'radial-gradient(circle, #f59e0b 2px, transparent 2px)',
            backgroundSize: '18px 18px'
          }}
        />
        <div 
          className="absolute left-8 bottom-20 w-36 h-48 opacity-15 hidden md:block"
          style={{
            backgroundImage: 'radial-gradient(circle, #ffffff 1.8px, transparent 1.8px)',
            backgroundSize: '16px 16px'
          }}
        />
      </div>

      {/* ── KONTEN UTAMA: KARTU MASUK SISTEM ── */}
      <div className="relative z-10 flex-1 flex flex-col justify-center items-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-md space-y-4">
          {/* Identitas Madrasah & Sambutan */}
          <div className="text-center space-y-2 flex flex-col items-center">
            <img src="/icon-192.png" alt="Logo MAN 1 Bulukumba" className="w-20 h-20 rounded-2xl object-contain drop-shadow-md border border-white/20 bg-white/10 p-1.5 mb-1" />
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight drop-shadow-sm">
              MAN 1 BULUKUMBA
            </h1>
            <p className="text-xs text-emerald-100 font-medium">
              Sistem Absensi Digital &amp; Pemantauan Kehadiran Siswa
            </p>
          </div>

          {/* ── Tab Pilihan: Masuk sebagai Orang Tua / Masuk sebagai Admin ── */}
          <div className="grid grid-cols-2 p-1.5 bg-black/20 backdrop-blur-md rounded-2xl gap-1.5 border border-white/15 shadow-inner">
            <button
              type="button"
              onClick={() => {
                setLoginRole('PARENT');
                setError('');
              }}
              className={`py-2.5 text-xs font-bold rounded-xl transition-all duration-150 flex items-center justify-center gap-1.5 ${
                loginRole === 'PARENT'
                  ? 'bg-white text-emerald-900 shadow-md scale-[1.01]'
                  : 'text-emerald-100 hover:text-white hover:bg-white/10'
              }`}
            >
              <HeartHandshake className="w-4 h-4 text-[#2e8b38]" />
              <span>Masuk Orang Tua</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setLoginRole('ADMIN');
                setError('');
              }}
              className={`py-2.5 text-xs font-bold rounded-xl transition-all duration-150 flex items-center justify-center gap-1.5 ${
                loginRole === 'ADMIN'
                  ? 'bg-white text-emerald-900 shadow-md scale-[1.01]'
                  : 'text-emerald-100 hover:text-white hover:bg-white/10'
              }`}
            >
              <Shield className="w-4 h-4 text-[#2e8b38]" />
              <span>Masuk Admin</span>
            </button>
          </div>

          {/* ============================================================== */}
          {/* FORM 1: MASUK SEBAGAI ORANG TUA SISWA                          */}
          {/* ============================================================== */}
          {loginRole === 'PARENT' && (
            <Card className="shadow-2xl rounded-3xl border-white/80 bg-white/95 backdrop-blur-xl animate-fade-in">
              <CardContent className="p-5 sm:p-7">
                <form onSubmit={handleParentLogin} className="space-y-4" autoComplete="off">
                  <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 text-[#2e8b38] flex items-center justify-center shrink-0">
                      <HeartHandshake className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-xs sm:text-sm font-bold text-slate-800">
                        Masuk Portal Orang Tua
                      </h2>
                      <p className="text-[10px] text-slate-500">
                        Gunakan nomor HP &amp; password yang diberikan madrasah
                      </p>
                    </div>
                  </div>

                  {error && (
                    <div className="p-3 bg-status-danger-bg border border-status-danger/30 rounded-xl text-status-danger text-xs font-medium flex items-start gap-2">
                      {error.includes('dikunci') ? (
                        <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      )}
                      <span>{error}</span>
                    </div>
                  )}

                  <Input
                    label="Nomor HP / Telepon"
                    placeholder="Contoh: 081234567890"
                    value={parentPhone}
                    onChange={(e) => setParentPhone(e.target.value)}
                    leftIcon={<Phone className="w-4 h-4 text-[#2e8b38]" />}
                    autoComplete="tel"
                    required
                    helperText="Nomor HP yang didaftarkan pihak sekolah"
                  />

                  <Input
                    type="password"
                    label="Password Akun"
                    placeholder="Masukkan password akun"
                    value={parentPassword}
                    onChange={(e) => setParentPassword(e.target.value)}
                    leftIcon={<Lock className="w-4 h-4" />}
                    autoComplete="current-password"
                    required
                  />

                  {/* Tombol Aksen Oranye Edlink (Khas Tombol Mulai Sekarang Sevima) */}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full mt-2 py-3.5 px-6 rounded-2xl font-bold text-sm text-white bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 shadow-lg shadow-amber-500/30 transition-all duration-150 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isLoading ? (
                      <span>Memverifikasi Akun...</span>
                    ) : (
                      <>
                        <span>Masuk sebagai Orang Tua</span>
                        <div className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center text-white text-xs">
                          <ArrowRight className="w-3 h-3 stroke-[3]" />
                        </div>
                      </>
                    )}
                  </button>

                  {/* Informasi Layanan Madrasah */}
                  <div className="pt-3 border-t border-slate-100 flex items-start gap-2 text-[11px] text-slate-500 bg-slate-50/80 p-3 rounded-xl border border-slate-100">
                    <Info className="w-4 h-4 text-[#2e8b38] shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      <strong>Pemberitahuan:</strong> Masuk menggunakan nomor HP / akun dan kata sandi yang telah terdaftar resmi di database madrasah.
                    </p>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* ============================================================== */}
          {/* FORM 2: MASUK SEBAGAI ADMIN / OPERATOR GERBANG                */}
          {/* ============================================================== */}
          {loginRole === 'ADMIN' && (
            <div className="space-y-3 animate-fade-in">
              {/* Info Komputer / PC Saat Ini (Terkunci) */}
              <div className="p-3 bg-white/95 backdrop-blur-md rounded-2xl border border-white/80 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200">
                    <Laptop className="w-4 h-4 text-[#2e8b38]" />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 font-medium">Workstation Komputer Ini:</p>
                    <p className="text-xs font-bold text-slate-800">{currentDeviceId}</p>
                  </div>
                </div>
                <div 
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 select-none"
                  title="Identitas PC terkunci. Hanya Super Admin yang berhak mengubah identitas workstation ini."
                >
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Terkunci</span>
                </div>
              </div>

              <Card className="shadow-2xl rounded-3xl border-white/80 bg-white/95 backdrop-blur-xl">
                <CardContent className="p-5 sm:p-7">
                  <form onSubmit={handleAdminLogin} className="space-y-4" autoComplete="off">
                    <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
                      <div className="w-8 h-8 rounded-xl bg-emerald-50 text-[#2e8b38] flex items-center justify-center shrink-0">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <h2 className="text-xs sm:text-sm font-bold text-slate-800">
                          Masuk Administrator / Operator
                        </h2>
                        <p className="text-[10px] text-slate-500">
                          Khusus petugas gerbang dan staf tata usaha madrasah
                        </p>
                      </div>
                    </div>

                    {error && (
                      <div className="p-3 bg-status-danger-bg border border-status-danger/30 rounded-xl text-status-danger text-xs font-medium flex items-start gap-2">
                        {error.includes('dikunci') ? (
                          <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        )}
                        <span>{error}</span>
                      </div>
                    )}

                    <Input
                      label="Username Admin / Operator"
                      placeholder="Contoh: admin atau admin_pc01"
                      value={adminUsername}
                      onChange={(e) => setAdminUsername(e.target.value)}
                      autoComplete="username"
                      required
                    />

                    <Input
                      type="password"
                      label="Password"
                      placeholder="Masukkan password admin"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      leftIcon={<Lock className="w-4 h-4" />}
                      autoComplete="current-password"
                      required
                    />

                    {/* Tombol Aksen Oranye Edlink */}
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full mt-2 py-3.5 px-6 rounded-2xl font-bold text-sm text-white bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 shadow-lg shadow-amber-500/30 transition-all duration-150 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isLoading ? (
                        <span>Memverifikasi Akun...</span>
                      ) : (
                        <>
                          <span>Masuk ke Sistem</span>
                          <div className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center text-white text-xs">
                            <ArrowRight className="w-3 h-3 stroke-[3]" />
                          </div>
                        </>
                      )}
                    </button>
                  </form>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Tombol Pasang Aplikasi PWA di HP */}
          {!isPWAInstalled && (
            <button
              type="button"
              onClick={handleInstallClick}
              className="w-full py-2.5 px-4 rounded-2xl bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/25 shadow-sm flex items-center justify-center gap-2 text-xs font-bold text-white transition-all active:scale-[0.98]"
            >
              <Download className="w-4 h-4 text-amber-300" />
              <span>Pasang Aplikasi di Layar HP (Instal PWA)</span>
            </button>
          )}

          {/* Footer Identitas */}
          <p className="text-center text-[10px] text-emerald-100/70 font-medium">
            MAN 1 BULUKUMBA
          </p>
        </div>
      </div>

      {/* Modal Panduan Instalasi PWA */}
      <Modal
        isOpen={isInstallGuideOpen}
        onClose={() => setIsInstallGuideOpen(false)}
        title="Pasang Aplikasi di Layar Utama HP"
        description="Ikuti langkah berikut untuk memasang aplikasi absensi di HP Anda:"
      >
        <div className="space-y-4 text-xs text-slate-700">
          {/* Panduan Android Chrome */}
          <div className="p-3.5 rounded-2xl bg-primary-50/80 border border-primary-200 space-y-2">
            <p className="font-bold text-primary-950 flex items-center gap-1.5 text-xs">
              <Smartphone className="w-4 h-4 text-primary-600" />
              Untuk HP Android (Google Chrome):
            </p>
            <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-700 leading-relaxed pl-1">
              <li>Tekan tombol menu <strong>titik tiga (⋮)</strong> di pojok kanan atas Chrome.</li>
              <li>Pilih menu <strong>"Instal Aplikasi"</strong> atau <strong>"Tambahkan ke Layar Utama"</strong>.</li>
              <li>Tekan <strong>"Instal"</strong> pada konfirmasi yang muncul.</li>
              <li>Ikon <strong>Absensi M1B</strong> akan langsung terpasang di menu HP seperti aplikasi Play Store!</li>
            </ol>
          </div>

          {/* Panduan iPhone Safari */}
          <div className="p-3.5 rounded-2xl bg-blue-50/80 border border-blue-200 space-y-2">
            <p className="font-bold text-blue-950 flex items-center gap-1.5 text-xs">
              <Share className="w-4 h-4 text-blue-600" />
              Untuk iPhone / iPad (Browser Safari):
            </p>
            <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-700 leading-relaxed pl-1">
              <li>Buka link ini menggunakan browser <strong>Safari</strong> bawaan Apple.</li>
              <li>Tekan tombol <strong>Bagikan (Share / ikon kotak panah atas)</strong> di bilah bawah.</li>
              <li>Gulir menu ke bawah lalu tekan <strong>"Tambah ke Layar Utama" (Add to Home Screen)</strong>.</li>
              <li>Tekan <strong>"Tambah"</strong> di pojok kanan atas.</li>
            </ol>
          </div>

          <div className="pt-2 flex justify-end">
            <Button size="sm" onClick={() => setIsInstallGuideOpen(false)}>
              Saya Mengerti
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default LoginPage;
