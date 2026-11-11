import React from 'react';
import { Wifi, WifiOff, AlertCircle } from 'lucide-react';
import type { ConnectionState } from '../../types';
import { cn } from '../../lib/utils';

export interface ConnectionStatusProps {
  state: ConnectionState;
  pendingCount?: number;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ state, pendingCount = 0 }) => {
  if (state === 'ONLINE') {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-status-success-bg text-status-success text-xs font-semibold">
          <Wifi className="w-3.5 h-3.5" />
          <span>Online</span>
        </span>
        {pendingCount > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-pill bg-status-warning-bg text-status-warning text-xs font-medium">
            <span>{pendingCount} antrean</span>
          </span>
        )}
      </div>
    );
  }

  if (state === 'OFFLINE') {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-gray-200 text-gray-700 text-xs font-semibold">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Offline</span>
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-pill bg-status-warning-bg text-status-warning text-xs font-medium">
          <span>{pendingCount} tersimpan lokal</span>
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-status-danger-bg text-status-danger text-xs font-semibold">
        <AlertCircle className="w-3.5 h-3.5" />
        <span>Server Tak Terjangkau</span>
      </span>
      {pendingCount > 0 && (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-pill bg-status-warning-bg text-status-warning text-xs font-medium">
          <span>{pendingCount} antrean</span>
        </span>
      )}
    </div>
  );
};

