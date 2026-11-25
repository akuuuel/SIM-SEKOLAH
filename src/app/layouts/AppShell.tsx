import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, setStoredDeviceId } from '../../db/attendanceDb';
import { syncPendingTransactions, fetchAttendanceTransactionsFromServer } from '../../services/syncService';
import { Swal } from '../../lib/swal';
import type { UserAccount, DeviceId, ConnectionState } from '../../types';
import { Sidebar } from '../../components/navigation/Sidebar';
import { Topbar } from '../../components/navigation/Topbar';
import { BottomNav } from '../../components/navigation/BottomNav';
import { OfflineBanner } from '../../components/feedback/OfflineBanner';
import { DeviceSetupModal } from '../../components/navigation/DeviceSetupModal';
import { AdminDashboard } from '../../features/admin/AdminDashboard';
import { ScannerPage } from '../../features/operator/ScannerPage';
import { UsersPage } from '../../features/users/UsersPage';
import { StudentsPage } from '../../features/students/StudentsPage';
import { DevicesPage } from '../../features/devices/DevicesPage';
import { ReportsPage } from '../../features/reports/ReportsPage';
import { SettingsPage } from '../../features/settings/SettingsPage';
import { ParentDashboard } from '../../features/parent/ParentDashboard';
import { ParentDesktopDashboard } from '../../features/parent/ParentDesktopDashboard';
import { ErrorBoundary } from '../../components/feedback/ErrorBoundary';
import { EducationBackdrop } from '../../components/ui/EducationBackdrop';

export interface AppShellProps {
  currentUser: UserAccount;
  currentDeviceId: DeviceId;
  onLogout: () => void;
  onDeviceChange: (newDevice: DeviceId) => void;
}

// ── Shell khusus Admin / Operator — semua hook ada di sini ──────────────────
const AdminShell: React.FC<AppShellProps> = ({
  currentUser,
  currentDeviceId,
  onLogout,
  onDeviceChange,
}) => {
  const defaultTab = currentUser.role === 'OPERATOR' ? 'scan' : 'dashboard';
  const [currentTab, setCurrentTab] = useState<string>(defaultTab);
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    navigator.onLine ? 'ONLINE' : 'OFFLINE'
  );
  const [isSyncing, setIsSyncing] = useState(false);

  const pendingCount =
    useLiveQuery(
      () => db.transactions.where('syncStatus').equals('PENDING').count(),
      []
    ) || 0;

  useEffect(() => {
    // Sinkronkan otomatis saat awal buka: dorong antrean pending & tarik data presensi terbaru dari server
    syncPendingTransactions(currentDeviceId).catch(() => {});
    fetchAttendanceTransactionsFromServer().catch(() => {});

    const handleOnline = () => {
      setConnectionState('ONLINE');
      // Otomatis sinkronkan seketika saat perangkat terhubung kembali ke jaringan/internet
      syncPendingTransactions(currentDeviceId).catch(() => {});
      fetchAttendanceTransactionsFromServer().catch(() => {});
    };
    const handleOffline = () => setConnectionState('OFFLINE');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [currentDeviceId]);

  // Background auto-sync: Jika ada antrean transaksi pending, dorong otomatis ke MySQL tiap 10 detik saat tab aktif
  useEffect(() => {
    if (pendingCount === 0 || isSyncing) return;
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      syncPendingTransactions(currentDeviceId).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [pendingCount, isSyncing, currentDeviceId]);

  // Background auto-pull cerdas: Tarik presensi terbaru hanya saat tab/jendela AKTIF (Page Visibility API)
  // Menghindari spam request ke ngrok saat layar HP dikunci atau diminimize
  useEffect(() => {
    if (connectionState === 'OFFLINE') return;

    const pullNow = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      fetchAttendanceTransactionsFromServer().catch(() => {});
    };

    const interval = setInterval(pullNow, 35000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        pullNow();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [connectionState]);

  const handleManualSync = async () => {
    if (connectionState === 'OFFLINE' || isSyncing) return;
    setIsSyncing(true);
    await syncPendingTransactions(currentDeviceId);
    await fetchAttendanceTransactionsFromServer();
    setIsSyncing(false);
  };

  const handleSelectDevice = (id: DeviceId) => {
    if (currentUser.role !== 'SUPER_ADMIN') {
      Swal.warning(
        'Akses Ditolak',
        'Hanya Super Admin yang diizinkan mengganti workstation PC guna mencegah manipulasi akses dan fitnah.'
      );
      return;
    }
    setStoredDeviceId(id);
    onDeviceChange(id);
  };

  return (
    <div className="flex h-screen bg-canvas overflow-hidden">
      <Sidebar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        currentUser={currentUser}
        currentDeviceId={currentDeviceId}
        onLogout={onLogout}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar
          currentDeviceId={currentDeviceId}
          onOpenDeviceSetup={() => setIsDeviceModalOpen(true)}
          connectionState={connectionState}
          pendingCount={pendingCount}
          currentUser={currentUser}
          onManualSync={handleManualSync}
          isSyncing={isSyncing}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
        />

        <OfflineBanner
          isOffline={connectionState === 'OFFLINE'}
          pendingCount={pendingCount}
        />

        <main className="flex-1 p-3.5 sm:p-6 md:p-8 overflow-y-auto bg-canvas pb-24 md:pb-8 relative">
          {/* Subtle Education Icon Watermark Backdrop */}
          <EducationBackdrop />
          <div className="max-w-7xl mx-auto space-y-4 relative z-10">
            {currentTab === 'dashboard' && (
              <AdminDashboard
                currentDeviceId={currentDeviceId}
                onNavigateToTab={setCurrentTab}
                currentUser={currentUser}
              />
            )}
            {currentTab === 'scan' && (
              <ScannerPage
                currentDeviceId={currentDeviceId}
                currentUser={currentUser}
              />
            )}
            {(currentTab === 'users' || currentTab === 'staff-users') && <UsersPage initialTab="STAFF" />}
            {currentTab === 'parent-users' && <UsersPage initialTab="PARENT" />}
            {currentTab === 'students' && <StudentsPage currentUser={currentUser} />}
            {currentTab === 'devices' && (
              <DevicesPage
                currentDeviceId={currentDeviceId}
                onSetCurrentDevice={handleSelectDevice}
                currentUser={currentUser}
              />
            )}
            {currentTab === 'reports' && <ReportsPage />}
            {currentTab === 'settings' && (
              <SettingsPage
                currentDeviceId={currentDeviceId}
                onDeviceChange={handleSelectDevice}
                onLogout={onLogout}
                currentUser={currentUser}
              />
            )}
          </div>
        </main>

        <BottomNav
          currentTab={currentTab}
          onTabChange={setCurrentTab}
          currentUser={currentUser}
          onLogout={onLogout}
        />
      </div>

      <DeviceSetupModal
        isOpen={isDeviceModalOpen}
        onClose={() => setIsDeviceModalOpen(false)}
        currentDeviceId={currentDeviceId}
        onSelectDevice={handleSelectDevice}
      />
    </div>
  );
};

// ── Shell khusus Orang Tua — mobile: app mobile, desktop: web app penuh ──────
const ParentShell: React.FC<Pick<AppShellProps, 'currentUser' | 'onLogout'>> = ({
  currentUser,
  onLogout,
}) => {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 640;
    }
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <ErrorBoundary>
      {isMobile ? (
        <ParentDashboard currentUser={currentUser} onLogout={onLogout} />
      ) : (
        <ParentDesktopDashboard currentUser={currentUser} onLogout={onLogout} />
      )}
    </ErrorBoundary>
  );
};

// ── Entry point AppShell — tidak ada hook kondisional di sini ───────────────
export const AppShell: React.FC<AppShellProps> = (props) => {
  if (props.currentUser.role === 'PARENT') {
    return <ParentShell currentUser={props.currentUser} onLogout={props.onLogout} />;
  }
  return <AdminShell {...props} />;
};
