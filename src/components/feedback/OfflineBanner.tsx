import React from 'react';
import { WifiOff } from 'lucide-react';

export interface OfflineBannerProps {
  isOffline: boolean;
  pendingCount?: number;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ isOffline, pendingCount = 0 }) => {
  if (!isOffline) return null;

  return (
    <div className="bg-amber-500 text-slate-900 px-4 py-2 text-xs font-medium flex items-center justify-between border-b border-amber-600 shadow-sm">
      <div className="flex items-center gap-2 max-w-4xl mx-auto w-full">
        <WifiOff className="w-4 h-4 shrink-0 text-slate-900" />
        <span>
          <strong>Koneksi Offline.</strong> Absensi tetap berfungsi normal dan tersimpan aman di perangkat ini. Transaksi ({pendingCount} pending) akan otomatis disinkronkan saat koneksi kembali.
        </span>
      </div>
    </div>
  );
};

