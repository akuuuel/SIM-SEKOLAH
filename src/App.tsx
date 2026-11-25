import React, { useState, useEffect } from 'react';
import { 
  db,
  initializeDatabase, 
  getStoredUser, 
  setStoredUser, 
  getStoredDeviceId, 
  setStoredDeviceId 
} from './db/attendanceDb';
import type { UserAccount, DeviceId } from './types';
import { LoginPage } from './features/auth/LoginPage';
import { AppShell } from './app/layouts/AppShell';
import { DeviceSetupModal } from './components/navigation/DeviceSetupModal';
import { 
  fetchUsersFromServer, 
  fetchMasterStudentsFromSheets, 
  fetchParentsFromServer,
  fetchAttendanceTransactionsFromServer,
  validateUserSession 
} from './services/syncService';
import { Swal } from './lib/swal';

export const App: React.FC = () => {
  const [currentUser, setCurrentUserState] = useState<UserAccount | null>(null);
  const [currentDeviceId, setCurrentDeviceIdState] = useState<DeviceId>('PC-01');
  const [isReady, setIsReady] = useState(false);
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);

  // Dengarkan sinyal force-logout (misal ketika akun dihapus admin di database server)
  useEffect(() => {
    const handleForceLogout = (e: any) => {
      setStoredUser(null);
      setCurrentUserState(null);
      const reason = e?.detail?.reason || 'Akun Anda telah dihapus atau dinonaktifkan oleh Administrator madrasah.';
      Swal.error('Akses Dibatalkan', reason);
    };
    window.addEventListener('force-logout', handleForceLogout);
    return () => window.removeEventListener('force-logout', handleForceLogout);
  }, []);

  useEffect(() => {
    let mounted = true;
    async function boot() {
      try {
        // Beri batas waktu pengaman 2.5 detik agar booting tidak pernah macet
        const initPromise = initializeDatabase();
        const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 2500));
        await Promise.race([initPromise, timeoutPromise]);

        let savedUser = getStoredUser();
        const savedDevice = getStoredDeviceId();

        // 1. Validasi lokal: Pastikan savedUser masih ada di database IndexedDB lokal
        if (savedUser) {
          const localExists = await db.users.get(savedUser.userId);
          if (!localExists) {
            setStoredUser(null);
            savedUser = null;
          }
        }

        if (mounted) {
          setCurrentUserState(savedUser);
          setCurrentDeviceIdState(savedDevice);
        }

        // 2. Validasi ke server: Pastikan akun belum dihapus oleh Admin di MySQL
        if (savedUser) {
          validateUserSession(savedUser).then((valRes) => {
            if (mounted && !valRes.valid) {
              setStoredUser(null);
              setCurrentUserState(null);
              Swal.error(
                'Akses Dibatalkan',
                valRes.message || 'Akun Anda telah dihapus atau dinonaktifkan oleh Administrator madrasah.'
              );
            }
          }).catch(() => {});
        }

        // Sinkronkan akun terbaru, master siswa, dan presensi hari ini dari server MySQL di background
        fetchUsersFromServer().catch(() => {});
        fetchParentsFromServer().catch(() => {});   // ← sync orang tua (sudah filter deleted)
        fetchMasterStudentsFromSheets().catch(() => {});
        fetchAttendanceTransactionsFromServer().catch(() => {});
      } catch (err) {
        console.error('Error saat inisialisasi boot:', err);
      } finally {
        if (mounted) setIsReady(true);
      }
    }
    boot();
    return () => {
      mounted = false;
    };
  }, []);

  const handleLoginSuccess = (user: UserAccount) => {
    setCurrentUserState(user);
  };

  const handleLogout = () => {
    setStoredUser(null);
    setCurrentUserState(null);
  };

  const handleDeviceChange = (newDevice: DeviceId) => {
    setStoredDeviceId(newDevice);
    setCurrentDeviceIdState(newDevice);
  };

  if (!isReady) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center text-xs font-semibold text-content-secondary">
        Memuat sistem absensi lokal...
      </div>
    );
  }

  // Jika belum login, tampilkan layar login dengan validasi PC
  if (!currentUser) {
    return (
      <>
        <LoginPage
          currentDeviceId={currentDeviceId}
          onOpenDeviceSetup={() => setIsDeviceModalOpen(true)}
          onLoginSuccess={handleLoginSuccess}
        />
        <DeviceSetupModal
          isOpen={isDeviceModalOpen}
          onClose={() => setIsDeviceModalOpen(false)}
          currentDeviceId={currentDeviceId}
          onSelectDevice={handleDeviceChange}
        />
      </>
    );
  }

  // Jika sudah login, tampilkan antarmuka utama aplikasi
  return (
    <AppShell
      currentUser={currentUser}
      currentDeviceId={currentDeviceId}
      onLogout={handleLogout}
      onDeviceChange={handleDeviceChange}
    />
  );
};

export default App;

