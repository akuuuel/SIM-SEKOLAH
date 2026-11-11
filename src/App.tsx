import React, { useState, useEffect } from 'react';
import { 
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

export const App: React.FC = () => {
  const [currentUser, setCurrentUserState] = useState<UserAccount | null>(null);
  const [currentDeviceId, setCurrentDeviceIdState] = useState<DeviceId>('PC-01');
  const [isReady, setIsReady] = useState(false);
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);

  useEffect(() => {
    async function boot() {
      try {
        await initializeDatabase();
        const savedUser = getStoredUser();
        const savedDevice = getStoredDeviceId();
        setCurrentUserState(savedUser);
        setCurrentDeviceIdState(savedDevice);
      } catch (err) {
        console.error('Error saat inisialisasi boot:', err);
      } finally {
        setIsReady(true);
      }
    }
    boot();
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

