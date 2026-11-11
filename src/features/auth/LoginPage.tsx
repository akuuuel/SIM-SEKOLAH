import React, { useState } from 'react';
import { db, setStoredUser } from '../../db/attendanceDb';
import type { UserAccount, DeviceId } from '../../types';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import {
  School, Laptop, Lock, ShieldCheck, AlertCircle, Clock
} from 'lucide-react';
import {
  hashPassword,
  sanitizeInput,
  isValidUsername,
  checkLoginRateLimit,
  recordFailedLoginAttempt,
  resetLoginAttempts,
} from '../../lib/utils';

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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // 1. Cek Rate Limit (mencegah brute force)
      const rateCheck = checkLoginRateLimit();
      if (!rateCheck.allowed) {
        const menit = Math.ceil((rateCheck.remainingMs ?? 0) / 60000);
        setError(
          `Terlalu banyak percobaan gagal. Akun dikunci ${menit} menit lagi. Hubungi administrator jika lupa password.`
        );
        setIsLoading(false);
        return;
      }

      // 2. Sanitasi dan validasi input
      let cleanUsername = sanitizeInput(username).toLowerCase();
      if (cleanUsername.startsWith('@')) {
        cleanUsername = cleanUsername.substring(1).trim();
      }

      if (!isValidUsername(cleanUsername)) {
        setError('Username hanya boleh mengandung huruf, angka, underscore (_), atau strip (-).');
        setIsLoading(false);
        return;
      }

      const cleanPassword = sanitizeInput(password, 128);
      if (cleanPassword.length < 6) {
        setError('Password minimal 6 karakter.');
        setIsLoading(false);
        return;
      }

      // 3. Pastikan database terisi
      const totalUser = await db.users.count();
      if (totalUser === 0) {
        const { initializeDatabase } = await import('../../db/attendanceDb');
        await initializeDatabase();
      }

      // 4. Cari user (generic error — tidak bocorkan apakah username ada atau tidak)
      const user = await db.users.where('username').equals(cleanUsername).first();

      if (!user) {
        recordFailedLoginAttempt();
        // Pesan generik — tidak bocorkan apakah username terdaftar
        setError('Username atau password salah. Hubungi administrator jika lupa kredensial.');
        setIsLoading(false);
        return;
      }

      if (user.status !== 'ACTIVE') {
        setError('Akun ini telah dinonaktifkan. Hubungi administrator.');
        setIsLoading(false);
        return;
      }

      // 5. Verifikasi password dengan SHA-256
      const inputHash = await hashPassword(cleanPassword);
      if (user.passwordHash !== inputHash) {
        recordFailedLoginAttempt();
        setError('Username atau password salah. Hubungi administrator jika lupa kredensial.');
        setIsLoading(false);
        return;
      }

      // 6. Validasi Device Binding
      if (user.assignedDeviceId !== 'ALL' && user.assignedDeviceId !== currentDeviceId) {
        setError(
          `Akses Ditolak: Akun ini ditugaskan untuk [${user.assignedDeviceId}], komputer ini terdaftar sebagai [${currentDeviceId}].`
        );
        setIsLoading(false);
        return;
      }

      // 7. Login berhasil — reset rate limit, update lastLoginAt
      resetLoginAttempts();
      const updatedUser: UserAccount = {
        ...user,
        lastLoginAt: new Date().toISOString(),
      };
      await db.users.update(user.userId, { lastLoginAt: updatedUser.lastLoginAt });

      setStoredUser(updatedUser);
      onLoginSuccess(updatedUser);
    } catch {
      setError('Terjadi kesalahan saat memproses login. Coba refresh halaman.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-primary-600 text-white items-center justify-center shadow-lg shadow-primary-600/20 mb-2">
            <School className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-content-primary">
            System Absensi Sekolah
          </h1>
          <p className="text-sm font-bold text-primary-600 tracking-wide uppercase">
            MAN 1 BULUKUMBA
          </p>
          <p className="text-xs text-content-secondary max-w-xs mx-auto">
            Aplikasi absensi mandiri offline-first untuk operator dan staf madrasah.
          </p>
        </div>

        {/* Perangkat Aktif Pill */}
        <div className="p-3 bg-white rounded-card border border-border flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary-50 text-primary-600">
              <Laptop className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] text-content-secondary">Identitas Komputer Ini:</p>
              <p className="text-xs font-bold text-content-primary">{currentDeviceId}</p>
            </div>
          </div>
          <button
            onClick={onOpenDeviceSetup}
            className="text-xs text-primary-600 font-semibold hover:underline px-2 py-1"
          >
            Ganti PC
          </button>
        </div>

        {/* Card Form Login */}
        <Card className="shadow-card">
          <CardContent className="p-6">
            <form onSubmit={handleLogin} className="space-y-4" autoComplete="off">
              <div className="flex items-center gap-2 border-b border-border pb-3">
                <ShieldCheck className="w-4 h-4 text-primary-600" />
                <h2 className="text-sm font-semibold text-content-primary">Masuk ke Akun Anda</h2>
              </div>

              {error && (
                <div className="p-3 bg-status-danger-bg border border-status-danger/30 rounded-button text-status-danger text-xs font-medium flex items-start gap-2">
                  {error.includes('dikunci') ? (
                    <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <span>{error}</span>
                </div>
              )}

              <Input
                label="Username"
                placeholder="Masukkan username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
              />

              <Input
                type="password"
                label="Password"
                placeholder="Masukkan password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                leftIcon={<Lock className="w-4 h-4" />}
                autoComplete="current-password"
                required
              />

              <Button
                type="submit"
                isLoading={isLoading}
                className="w-full mt-2"
                size="lg"
              >
                Masuk ke Aplikasi
              </Button>
            </form>

            {/* Info akun bawaan — hanya untuk mode development */}
            {import.meta.env.DEV && (
              <div className="mt-5 pt-4 border-t border-border">
                <p className="text-[11px] text-content-secondary text-center mb-2 font-medium">
                  🔧 Info Akun Default (Development Mode)
                </p>
                <div className="bg-gray-50 rounded-button p-3 space-y-1">
                  <p className="text-[10px] text-content-secondary font-mono">
                    admin → password: <strong>admin123</strong> (Semua PC)
                  </p>
                  <p className="text-[10px] text-content-secondary font-mono">
                    admin_pc01/02/03 → password: <strong>operator123</strong>
                  </p>
                </div>
                <p className="text-[10px] text-status-warning text-center mt-2">
                  ⚠️ Blok info ini otomatis hilang di production build.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer info */}
        <p className="text-center text-[11px] text-content-secondary">
          <ShieldCheck className="w-3 h-3 inline mr-1" />
          Data tersimpan lokal dan terenkripsi. Disinkronkan ke Google Sheets sekolah.
        </p>
      </div>
    </div>
  );
};
