import React from 'react';
import { 
  LayoutDashboard, 
  ScanLine, 
  Users, 
  Monitor, 
  UserRound, 
  FileSpreadsheet, 
  LogOut,
  School,
  X,
  Settings,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { UserAccount, DeviceId } from '../../types';

export interface SidebarProps {
  currentTab: string;
  onTabChange: (tabId: string) => void;
  currentUser: UserAccount | null;
  currentDeviceId: DeviceId;
  onLogout: () => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  currentUser,
  currentDeviceId,
  onLogout,
  isOpenMobile = false,
  onCloseMobile,
}) => {
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  const menuItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      show: true,
    },
    {
      id: 'scan',
      label: 'Pemindaian Absensi',
      icon: ScanLine,
      show: true,
      badge: 'Operator',
    },
    {
      id: 'students',
      label: 'Data Siswa',
      icon: Users,
      show: isSuperAdmin,
    },
    {
      id: 'users',
      label: 'Manajemen Pengguna',
      icon: UserRound,
      show: isSuperAdmin,
      badge: 'Akun PC',
    },
    {
      id: 'devices',
      label: 'Perangkat & Sync',
      icon: Monitor,
      show: true,
    },
    {
      id: 'reports',
      label: 'Laporan Kehadiran',
      icon: FileSpreadsheet,
      show: isSuperAdmin,
    },
    {
      id: 'settings',
      label: 'Pengaturan Sistem',
      icon: Settings,
      show: isSuperAdmin,
    },
  ];

  const handleItemClick = (id: string) => {
    onTabChange(id);
    if (onCloseMobile) onCloseMobile();
  };

  const sidebarContent = (
    <div className="w-64 bg-sidebar text-gray-300 flex flex-col h-full border-r border-sidebar-border select-none">
      {/* Brand Header */}
      <div className="p-4 sm:p-5 flex items-center justify-between border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary-600 flex items-center justify-center text-white shadow-md">
            <School className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <h1 className="text-xs sm:text-sm font-bold text-white tracking-tight leading-snug">
              ABSENSI SEKOLAH
            </h1>
            <p className="text-[10px] sm:text-[11px] font-semibold text-primary-400 leading-tight">
              MAN 1 BULUKUMBA
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-status-success inline-block"></span>
              <span className="text-[9px] sm:text-[10px] text-gray-400 font-medium">Offline-First PWA</span>
            </div>
          </div>
        </div>

        {/* Tombol Tutup untuk Tampilan Mobile */}
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="md:hidden p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-sidebar-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Device & Operator Info Pill */}
      <div className="px-3.5 py-2.5 mx-3 my-2.5 bg-sidebar-muted/70 rounded-xl border border-sidebar-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-primary-500" />
          <span className="text-xs font-semibold text-white tracking-wide">{currentDeviceId}</span>
        </div>
        <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded-full bg-primary-600/30 text-primary-100 border border-primary-500/40">
          {currentUser?.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Operator PC'}
        </span>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto pt-2">
        {menuItems
          .filter((item) => item.show)
          .map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item.id)}
                className={cn(
                  'w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all duration-150',
                  isActive
                    ? 'bg-primary-600 text-white font-semibold shadow-sm'
                    : 'text-gray-400 hover:bg-sidebar-muted hover:text-white'
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className={cn('w-4 h-4', isActive ? 'text-white' : 'text-gray-400')} />
                  <span>{item.label}</span>
                </div>
                {item.badge && !isActive && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-sidebar-muted text-gray-400">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
      </nav>

      {/* User Profile & Logout */}
      <div className="p-3.5 border-t border-sidebar-border bg-sidebar-muted/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-primary-700 text-white flex items-center justify-center font-bold text-xs shrink-0">
              {currentUser?.fullName?.charAt(0) || 'U'}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-semibold text-white truncate">
                {currentUser?.fullName || 'Belum Login'}
              </p>
              <p className="text-[10px] text-gray-400 truncate">@{currentUser?.username}</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            title="Keluar / Ganti Akun"
            className="p-1.5 rounded-lg text-gray-400 hover:text-status-danger hover:bg-sidebar-muted transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Tampilan Desktop: Sidebar Diam di Kiri */}
      <aside className="hidden md:flex shrink-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Tampilan Mobile: Off-Canvas Drawer dengan Animasi Slide & Backdrop */}
      {isOpenMobile && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop gelap */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={onCloseMobile}
          />
          {/* Konten Sidebar Geser */}
          <div className="relative z-10 transition-transform duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
