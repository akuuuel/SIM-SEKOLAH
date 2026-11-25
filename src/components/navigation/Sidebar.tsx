import React from 'react';
import {
  LayoutDashboard,
  ScanLine,
  Users,
  Monitor,
  FileSpreadsheet,
  LogOut,
  School,
  X,
  Settings,
  Shield,
  HeartHandshake,
  ChevronRight,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Swal } from '../../lib/swal';
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
    },
    {
      id: 'students',
      label: 'Data Siswa',
      icon: Users,
      show: true,
    },
    {
      id: 'staff-users',
      label: 'Admin & Operator',
      icon: Shield,
      show: isSuperAdmin,
    },
    {
      id: 'parent-users',
      label: 'Akun Orang Tua',
      icon: HeartHandshake,
      show: isSuperAdmin,
    },
    {
      id: 'devices',
      label: 'Perangkat & Sync',
      icon: Monitor,
      show: isSuperAdmin,
    },
    {
      id: 'reports',
      label: 'Laporan Kehadiran',
      icon: FileSpreadsheet,
      show: true,
    },
    {
      id: 'settings',
      label: 'Pengaturan Sistem',
      icon: Settings,
      show: true,
    },
  ];

  const handleItemClick = (id: string) => {
    onTabChange(id);
    if (onCloseMobile) onCloseMobile();
  };

  const handleLogout = async () => {
    const confirmed = await Swal.confirm(
      'Keluar dari Akun?',
      'Anda akan keluar dari sistem absensi. Pastikan semua data sudah tersinkron.',
      'Ya, Keluar',
      'Batal'
    );
    if (confirmed) onLogout();
  };

  const sidebarContent = (
    <div className="w-60 bg-[#1c5e2d] text-emerald-50 flex flex-col h-full border-r border-[#267b3c] select-none shadow-sm">
      {/* Brand Header */}
      <div className="px-4 py-4 flex items-center justify-between border-b border-[#267b3c]">
        <div className="flex items-center gap-3">
          <img src="/icon-192.png" alt="Logo MAN 1 Bulukumba" className="w-9 h-9 rounded-xl object-contain bg-white/10 p-0.5 border border-white/20 shadow-sm shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight tracking-tight">
              ABSENSI SEKOLAH
            </h1>
            <p className="text-[11px] font-semibold text-emerald-300 leading-tight">
              MAN 1 BULUKUMBA
            </p>
          </div>
        </div>

        {/* Tutup mobile */}
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="md:hidden p-1.5 rounded-lg text-emerald-200 hover:text-white hover:bg-[#267b3c] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Device Info Pill */}
      <div className="mx-3 my-3 px-3 py-2 bg-[#164e25] rounded-xl border border-[#2a8442] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Monitor className="w-3.5 h-3.5 text-emerald-300" />
          <span className="text-xs font-semibold text-white">{currentDeviceId}</span>
        </div>
        <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded-full bg-[#2e8b38] text-white border border-emerald-400/30">
          {isSuperAdmin ? 'Super Admin' : 'Operator'}
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto py-2">
        {menuItems
          .filter((item) => item.show)
          .map((item) => {
            const Icon = item.icon;
            const isActive =
              currentTab === item.id ||
              (item.id === 'staff-users' && currentTab === 'users');

            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item.id)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-100',
                  isActive
                    ? 'bg-[#2e8b38] text-white font-bold shadow-xs ring-1 ring-white/20'
                    : 'text-emerald-100 hover:bg-[#247539] hover:text-white'
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className={cn('w-4 h-4', isActive ? 'text-white' : 'text-emerald-200')} />
                  <span>{item.label}</span>
                </div>
                {isActive && <ChevronRight className="w-3.5 h-3.5 text-white" />}
              </button>
            );
          })}
      </nav>

      {/* User Profile & Logout */}
      <div className="p-3 border-t border-[#267b3c] bg-[#144721]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-[#2e8b38] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs border border-white/20">
              {currentUser?.fullName?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-semibold text-white truncate leading-tight">
                {currentUser?.fullName || 'Belum Login'}
              </p>
              <p className="text-[10px] text-emerald-300 truncate">@{currentUser?.username}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Keluar"
            className="p-1.5 rounded-lg text-emerald-200 hover:text-red-300 hover:bg-[#247539] transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: Sidebar tetap di kiri */}
      <aside className="hidden md:flex shrink-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile: Off-canvas drawer */}
      {isOpenMobile && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={onCloseMobile}
          />
          <div className="relative z-10">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
