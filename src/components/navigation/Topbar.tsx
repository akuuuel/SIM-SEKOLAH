import React from 'react';
import { RefreshCw, Laptop, Lock } from 'lucide-react';
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
}) => {
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  return (
    <header className="h-14 apple-glass-nav border-b border-[#e1ede4]/80 px-4 sm:px-6 flex items-center justify-between shrink-0 select-none sticky top-0 z-30">
      {/* Kiri: Brand mobile + Device identifier desktop */}
      <div className="flex items-center gap-3">
        {/* Brand nama sekolah — hanya mobile (desktop lihat sidebar) */}
        <div className="md:hidden flex items-center gap-2">
          <img src="/icon-192.png" alt="Logo MAN 1 Bulukumba" className="w-7 h-7 rounded-lg object-contain bg-emerald-50 p-0.5 border border-emerald-200 shadow-xs" />
          <span className="text-sm font-bold text-emerald-900 tracking-tight">
            Absensi <span className="text-[#2e8b38]">MAN 1</span>
          </span>
        </div>

        {/* Device Identifier — hanya desktop */}
        {isSuperAdmin ? (
          <button
            onClick={onOpenDeviceSetup}
            className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold text-emerald-800 border border-emerald-200 transition-colors cursor-pointer"
            title="Super Admin: Klik untuk mengganti workstation PC ini"
          >
            <Laptop className="w-3.5 h-3.5 text-[#2e8b38]" />
            <span><strong>{currentDeviceId}</strong></span>
            <span className="text-[10px] text-emerald-600 font-normal underline ml-0.5">Ganti</span>
          </button>
        ) : (
          <div
            className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-xs font-semibold text-slate-700 border border-slate-200"
            title="Identitas PC terkunci"
          >
            <Lock className="w-3.5 h-3.5 text-slate-400" />
            <span>{currentDeviceId}</span>
            <span className="text-[10px] text-slate-400 font-normal ml-0.5">Terkunci</span>
          </div>
        )}

        <span className="hidden lg:inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-[#2e8b38]"></span>
          MAN 1 BULUKUMBA
        </span>
      </div>

      {/* Kanan: Status koneksi, tombol sync, avatar */}
      <div className="flex items-center gap-2 sm:gap-3">
        <ConnectionStatus state={connectionState} pendingCount={pendingCount} />

        <button
          onClick={onManualSync}
          disabled={isSyncing || connectionState === 'OFFLINE'}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#e1ede4] text-xs font-medium text-slate-600 hover:bg-emerald-50 disabled:opacity-40 transition-colors"
          title="Sinkronkan data ke server"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#2e8b38] ${isSyncing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Sinkron</span>
        </button>

        <div className="flex items-center gap-2 pl-2 border-l border-[#e1ede4]">
          <div className="w-8 h-8 rounded-full bg-[#2e8b38] text-white flex items-center justify-center font-bold text-xs">
            {currentUser?.fullName?.charAt(0)?.toUpperCase() || 'A'}
          </div>
          <div className="hidden lg:block">
            <p className="text-xs font-semibold text-slate-800 leading-tight">{currentUser?.fullName}</p>
            <p className="text-[10px] text-slate-400">@{currentUser?.username}</p>
          </div>
        </div>
      </div>
    </header>
  );
};
