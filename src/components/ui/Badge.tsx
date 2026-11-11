import React from 'react';
import { cn } from '../../lib/utils';
import type { AttendanceStatus, SyncStatus } from '../../types';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'secondary' | 'attendance' | 'sync';
  attendanceStatus?: AttendanceStatus;
  syncStatus?: SyncStatus;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = 'default',
  attendanceStatus,
  syncStatus,
  dot = false,
  children,
  ...props
}) => {
  let badgeStyles = 'bg-gray-100 text-gray-800';
  let dotStyles = 'bg-gray-500';
  let text = children;

  // Penanganan otomatis berdasarkan Status Kehadiran
  if (attendanceStatus) {
    switch (attendanceStatus) {
      case 'HADIR':
        badgeStyles = 'bg-status-success-bg text-status-success font-semibold';
        dotStyles = 'bg-status-success';
        text = text || 'Hadir';
        break;
      case 'TERLAMBAT':
        badgeStyles = 'bg-status-warning-bg text-status-warning font-semibold';
        dotStyles = 'bg-status-warning';
        text = text || 'Terlambat';
        break;
      case 'IZIN':
        badgeStyles = 'bg-blue-100 text-blue-700 font-semibold';
        dotStyles = 'bg-blue-600';
        text = text || 'Izin';
        break;
      case 'SAKIT':
        badgeStyles = 'bg-purple-100 text-purple-700 font-semibold';
        dotStyles = 'bg-purple-600';
        text = text || 'Sakit';
        break;
      case 'ALFA':
        badgeStyles = 'bg-status-danger-bg text-status-danger font-semibold';
        dotStyles = 'bg-status-danger';
        text = text || 'Alfa';
        break;
      case 'BK':
        badgeStyles = 'bg-indigo-100 text-indigo-800 font-semibold';
        dotStyles = 'bg-indigo-600';
        text = text || 'BK';
        break;
    }
  } else if (syncStatus) {
    // Penanganan otomatis berdasarkan Status Sinkronisasi
    switch (syncStatus) {
      case 'SYNCED':
        badgeStyles = 'bg-status-success-bg text-status-success';
        dotStyles = 'bg-status-success';
        text = text || 'Tersinkron';
        break;
      case 'SYNCING':
        badgeStyles = 'bg-status-info-bg text-status-info animate-pulse';
        dotStyles = 'bg-status-info';
        text = text || 'Menyinkronkan...';
        break;
      case 'PENDING':
        badgeStyles = 'bg-status-warning-bg text-status-warning';
        dotStyles = 'bg-status-warning';
        text = text || 'Menunggu Sinkronisasi';
        break;
      case 'CONFLICT':
        badgeStyles = 'bg-amber-100 text-amber-800';
        dotStyles = 'bg-amber-600';
        text = text || 'Perlu Pemeriksaan';
        break;
      case 'FAILED':
        badgeStyles = 'bg-status-danger-bg text-status-danger';
        dotStyles = 'bg-status-danger';
        text = text || 'Gagal Sinkron';
        break;
    }
  } else {
    const variants = {
      default: 'bg-primary-50 text-primary-700 border border-primary-100',
      success: 'bg-status-success-bg text-status-success',
      warning: 'bg-status-warning-bg text-status-warning',
      danger: 'bg-status-danger-bg text-status-danger',
      info: 'bg-status-info-bg text-status-info',
      secondary: 'bg-gray-100 text-gray-700',
      attendance: '',
      sync: '',
    };
    badgeStyles = variants[variant];
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-pill text-xs font-medium tracking-wide transition-colors',
        badgeStyles,
        className
      )}
      {...props}
    >
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotStyles)} />}
      <span>{text}</span>
    </span>
  );
};

