import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, setStoredDeviceId } from '../../db/attendanceDb';
import { syncPendingTransactions } from '../../services/syncService';
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

export interface AppShellProps {
  currentUser: UserAccount;
  currentDeviceId: DeviceId;
  onLogout: () => void;
  onDeviceChange: (newDevice: DeviceId) => void;
}

export const AppShell: React.FC<AppShellProps> = ({
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

  const pendingCount = useLiveQuery(
    () => db.transactions.where('syncStatus').equals('PENDING').count(),
    []
  ) || 0;

  useEffect(() => {
    const handleOnline = () => setConnectionState('ONLINE');
    const handleOffline = () => setConnectionState('OFFLINE');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleManualSync = async () => {
    if (connectionState === 'OFFLINE' || isSyncing) return;
    setIsSyncing(true);
    await syncPendingTransactions(currentDeviceId);
    setIsSyncing(false);
  };

  const handleSelectDevice = (id: DeviceId) => {
    setStoredDeviceId(id);
    onDeviceChange(id);
  };

  return (
    <div className="flex h-screen bg-canvas overflow-hidden">
      {/* Sidebar: Desktop diam di kiri, Mobile drawer geser */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        currentUser={currentUser}
        currentDeviceId={currentDeviceId}
        onLogout={onLogout}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar dengan Hamburger Mobile */}
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

        {/* Offline Banner Non-Blocking */}
        <OfflineBanner
          isOffline={connectionState === 'OFFLINE'}
          pendingCount={pendingCount}
        />

        {/* Content Area Responsif: padding disesuaikan untuk layar sempit */}
        <main className="flex-1 p-3.5 sm:p-6 md:p-8 overflow-y-auto bg-canvas pb-24 md:pb-8">
          <div className="max-w-7xl mx-auto space-y-4">
            {currentTab === 'dashboard' && (
              <AdminDashboard
                currentDeviceId={currentDeviceId}
                onNavigateToTab={setCurrentTab}
              />
            )}
            {currentTab === 'scan' && (
              <ScannerPage
                currentDeviceId={currentDeviceId}
                currentUser={currentUser}
              />
            )}
            {currentTab === 'users' && <UsersPage />}
            {currentTab === 'students' && <StudentsPage />}
            {currentTab === 'devices' && (
              <DevicesPage
                currentDeviceId={currentDeviceId}
                onSetCurrentDevice={handleSelectDevice}
              />
            )}
            {currentTab === 'reports' && <ReportsPage />}
            {currentTab === 'settings' && (
              <SettingsPage
                currentDeviceId={currentDeviceId}
                onDeviceChange={handleSelectDevice}
              />
            )}
          </div>
        </main>

        {/* Bottom Navigation Bar Khusus Tampilan Layar HP / Mobile */}
        <BottomNav
          currentTab={currentTab}
          onTabChange={setCurrentTab}
          currentUser={currentUser}
        />
      </div>

      {/* Modal Pengaturan Perangkat */}
      <DeviceSetupModal
        isOpen={isDeviceModalOpen}
        onClose={() => setIsDeviceModalOpen(false)}
        currentDeviceId={currentDeviceId}
        onSelectDevice={handleSelectDevice}
      />
    </div>
  );
};
