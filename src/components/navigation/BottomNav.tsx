import React from 'react';
import { LayoutDashboard, ScanLine, Users, Monitor, FileSpreadsheet, Settings } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { UserAccount } from '../../types';

export interface BottomNavProps {
  currentTab: string;
  onTabChange: (tabId: string) => void;
  currentUser: UserAccount | null;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onTabChange,
  currentUser,
}) => {
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  const navItems = [
    { id: 'dashboard', label: 'Dashboard',  icon: LayoutDashboard, show: true },
    { id: 'scan',      label: 'Absensi',    icon: ScanLine,         show: true },
    { id: 'students',  label: 'Siswa',      icon: Users,            show: isSuperAdmin },
    { id: 'devices',   label: 'Perangkat',  icon: Monitor,          show: true },
    { id: 'reports',   label: 'Laporan',    icon: FileSpreadsheet,  show: isSuperAdmin },
    { id: 'settings',  label: 'Pengaturan', icon: Settings,         show: isSuperAdmin },
  ];

  const visibleItems = navItems.filter((item) => item.show);

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-md border-t border-border px-2 py-1.5 shadow-lg select-none">
      <div className="flex items-center justify-around">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                'flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all duration-150 min-w-[52px]',
                isActive
                  ? 'text-primary-600 font-bold scale-105'
                  : 'text-content-secondary hover:text-content-primary'
              )}
            >
              <div
                className={cn(
                  'p-1 rounded-lg transition-colors',
                  isActive ? 'bg-primary-50 text-primary-600' : 'text-gray-500'
                )}
              >
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight leading-none">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
