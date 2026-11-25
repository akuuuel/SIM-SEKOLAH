import React from 'react';
import { LayoutDashboard, ScanLine, Users, FileSpreadsheet, Settings } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { UserAccount } from '../../types';

export interface BottomNavProps {
  currentTab: string;
  onTabChange: (tabId: string) => void;
  currentUser: UserAccount | null;
  onLogout?: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onTabChange,
  currentUser,
}) => {
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  // Menu simetris 5 item untuk seluruh admin & operator
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'scan',      label: 'Absensi',   icon: ScanLine },
    { id: 'students',  label: 'Siswa',     icon: Users },
    { id: 'reports',   label: 'Laporan',   icon: FileSpreadsheet },
    { id: 'settings',  label: 'Pengaturan',icon: Settings },
  ];

  return (
    <nav className="md:hidden fixed bottom-2.5 left-3 right-3 z-40 max-w-md mx-auto apple-glass-dock rounded-2xl border border-white/80 shadow-[0_10px_30px_-6px_rgba(0,0,0,0.1),0_0_0_1px_rgba(46,139,56,0.06)] p-1 select-none">
      <div className="flex items-center justify-between">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                'flex-1 flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition-all duration-150 active:scale-95',
                isActive ? 'text-[#2e8b38]' : 'text-slate-600 hover:text-slate-900'
              )}
            >
              {/* Icon Container dengan Micro-pill aktif */}
              <div
                className={cn(
                  'w-10 h-7 rounded-full flex items-center justify-center transition-all duration-150',
                  isActive ? 'bg-emerald-50 text-[#2e8b38] shadow-2xs' : 'text-slate-600'
                )}
              >
                <Icon className={cn('w-4 h-4', isActive ? 'stroke-[2.3]' : 'stroke-[1.8]')} />
              </div>

              {/* Label Navigasi */}
              <span
                className={cn(
                  'text-[10px] leading-tight tracking-tight mt-0.5 transition-colors',
                  isActive ? 'font-bold text-[#2e8b38]' : 'font-medium text-slate-600'
                )}
              >
                {item.label}
              </span>

              {/* Micro-dot indicator */}
              <span
                className={cn(
                  'w-1 h-1 rounded-full mt-0.5 transition-all duration-150',
                  isActive ? 'bg-[#2e8b38] scale-100' : 'bg-transparent scale-0'
                )}
              />
            </button>
          );
        })}
      </div>
    </nav>
  );
};
