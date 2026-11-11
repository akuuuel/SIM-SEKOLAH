import React from 'react';
import { Menu, RefreshCw, Bell, Laptop } from 'lucide-react';
import { ConnectionStatus } from '../status/ConnectionStatus';
import type { ConnectionState, DeviceId, UserAccount } from '../../types';

export interface TopbarProps {
  currentDeviceId: DeviceId;
  onOpenDeviceSetup: () => void;
  connectionState: ConnectionState;
  pendingCount: number;
  currentUser: UserAccount | null;
  onManualSync: () => void;
  isSyncing: boolean;
  onOpenMobileSidebar?: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  currentDeviceId,
  onOpenDeviceSetup,
  connectionState,
  pendingCount,
  currentUser,
  onManualSync,
  isSyncing,
  onOpenMobileSidebar,
}) => {
  return (
    <header className="h-14 sm:h-16 bg-surface border-b border-border px-3 sm:px-6 flex items-center justify-between shrink-0 select-none">
      {/* Sisi Kiri: Tombol Hamburger Mobile & Identitas Device */}
      <div className="flex items-center gap-2 sm:gap-3">
        {onOpenMobileSidebar && (
          <button
            onClick={onOpenMobileSidebar}
            className="md:hidden p-1.5 rounded-lg text-content-primary hover:bg-gray-100 transition-colors"
            title="Buka Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <button
          onClick={onOpenDeviceSetup}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-button bg-gray-100 hover:bg-gray-200 text-xs font-semibold text-content-primary border border-border transition-colors"
          title="Klik untuk mengganti identitas PC ini"
        >
          <Laptop className="w-3.5 h-3.5 text-primary-600" />
          <span><strong>{currentDeviceId}</strong></span>
          <span className="text-[10px] text-content-secondary font-normal underline ml-0.5 hidden xs:inline">Ganti</span>
        </button>

        <span className="hidden sm:inline-block text-[11px] font-semibold text-content-secondary border-l border-border pl-2.5">
          MAN 1 BULUKUMBA
        </span>
      </div>

      {/* Sisi Kanan: Status Koneksi, Sync Action & Info User */}
      <div className="flex items-center gap-1.5 sm:gap-3">
        {/* Indikator Online/Offline */}
        <ConnectionStatus state={connectionState} pendingCount={pendingCount} />

        {/* Tombol Sinkronisasi Manual */}
        <button
          onClick={onManualSync}
          disabled={isSyncing || connectionState === 'OFFLINE'}
          className="inline-flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-button border border-border text-xs font-medium text-content-primary hover:bg-gray-50 disabled:opacity-50 transition-colors"
          title="Sinkronkan transaksi lokal ke Google Sheets"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-primary-600 ${isSyncing ? 'animate-spin' : ''}`} />
          <span className="hidden md:inline">Sinkronkan</span>
        </button>

        {/* Notifikasi */}
        <button className="p-1.5 sm:p-2 rounded-button text-content-secondary hover:text-content-primary hover:bg-gray-100 transition-colors relative">
          <Bell className="w-4 h-4" />
          {pendingCount > 0 && (
            <span className="w-2 h-2 rounded-full bg-status-warning absolute top-1 right-1"></span>
          )}
        </button>

        {/* User Avatar */}
        <div className="pl-1 sm:pl-2 border-l border-border flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-xs">
            {currentUser?.fullName?.charAt(0) || 'A'}
          </div>
          <div className="hidden lg:block text-left">
            <p className="text-xs font-semibold text-content-primary leading-tight">
              {currentUser?.fullName}
            </p>
            <p className="text-[10px] text-content-secondary">
              @{currentUser?.username}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
};
