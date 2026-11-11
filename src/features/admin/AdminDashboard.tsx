import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/attendanceDb';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Users, UserCheck, Clock, UserX, Monitor, ArrowUpRight } from 'lucide-react';
import { formatTime } from '../../lib/utils';
import type { DeviceId } from '../../types';

export interface AdminDashboardProps {
  currentDeviceId: DeviceId;
  onNavigateToTab: (tabId: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currentDeviceId,
  onNavigateToTab,
}) => {
  const totalStudents = useLiveQuery(() => db.students.count(), []) || 0;
  
  const today = new Date().toISOString().split('T')[0];
  const allTodayTransactions = useLiveQuery(
    () => db.transactions.where('attendanceDate').equals(today).toArray(),
    [today]
  ) || [];

  const presentCount = allTodayTransactions.filter((t) => t.attendanceStatus === 'HADIR').length;
  const lateCount = allTodayTransactions.filter((t) => t.attendanceStatus === 'TERLAMBAT').length;
  const unrecordedCount = Math.max(0, totalStudents - (presentCount + lateCount));

  // Data transaksi terbaru
  const latestTransactions = useLiveQuery(
    () => db.transactions.orderBy('deviceTimestamp').reverse().limit(8).toArray(),
    []
  ) || [];

  const devices = [
    {
      id: 'PC-01' as DeviceId,
      name: 'Komputer Gerbang Utama',
      location: 'Pintu Gerbang Utama',
      operator: 'admin_pc01',
      isCurrent: currentDeviceId === 'PC-01',
    },
    {
      id: 'PC-02' as DeviceId,
      name: 'Komputer Gerbang Barat',
      location: 'Pintu Gerbang Barat',
      operator: 'admin_pc02',
      isCurrent: currentDeviceId === 'PC-02',
    },
    {
      id: 'PC-03' as DeviceId,
      name: 'Komputer Ruang Piket',
      location: 'Ruang Piket Guru',
      operator: 'admin_pc03',
      isCurrent: currentDeviceId === 'PC-03',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-content-primary">Dashboard Absensi</h2>
            <span className="px-2 py-0.5 rounded-full bg-primary-100 text-primary-800 text-[11px] font-bold">
              MAN 1 BULUKUMBA
            </span>
          </div>
          <p className="text-xs text-content-secondary mt-1">
            Ringkasan kehadiran siswa hari ini dan pemantauan tiga perangkat absensi madrasah.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigateToTab('scan')}
            className="px-4 py-2 rounded-button bg-primary-600 text-white hover:bg-primary-700 text-xs font-semibold shadow-sm flex items-center gap-2 transition-colors"
          >
            <span>Buka Pemindaian Absensi</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Grid 4 Kartu KPI: 2 Kolom di Mobile, 4 Kolom di Desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <Card className="p-3.5 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold text-content-secondary truncate">Total Siswa</span>
            <div className="p-1.5 sm:p-2 rounded-lg bg-blue-50 text-blue-600">
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="mt-2 sm:mt-3">
            <p className="text-xl sm:text-2xl font-bold text-content-primary">{totalStudents}</p>
            <p className="text-[10px] sm:text-[11px] text-content-secondary mt-0.5 truncate">Data terdaftar</p>
          </div>
        </Card>

        <Card className="p-3.5 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold text-content-secondary truncate">Hadir Tepat</span>
            <div className="p-1.5 sm:p-2 rounded-lg bg-status-success-bg text-status-success">
              <UserCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="mt-2 sm:mt-3">
            <p className="text-xl sm:text-2xl font-bold text-status-success">{presentCount}</p>
            <p className="text-[10px] sm:text-[11px] text-content-secondary mt-0.5 truncate">&le; 07:15 WITA</p>
          </div>
        </Card>

        <Card className="p-3.5 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold text-content-secondary truncate">Terlambat</span>
            <div className="p-1.5 sm:p-2 rounded-lg bg-status-warning-bg text-status-warning">
              <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="mt-2 sm:mt-3">
            <p className="text-xl sm:text-2xl font-bold text-status-warning">{lateCount}</p>
            <p className="text-[10px] sm:text-[11px] text-content-secondary mt-0.5 truncate">&gt; 07:15 WITA</p>
          </div>
        </Card>

        <Card className="p-3.5 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold text-content-secondary truncate">Belum Absen</span>
            <div className="p-1.5 sm:p-2 rounded-lg bg-gray-100 text-gray-600">
              <UserX className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="mt-2 sm:mt-3">
            <p className="text-xl sm:text-2xl font-bold text-content-primary">{unrecordedCount}</p>
            <p className="text-[10px] sm:text-[11px] text-content-secondary mt-0.5 truncate">Menunggu scan</p>
          </div>
        </Card>
      </div>

      {/* Monitoring 3 Perangkat Komputer (Section 5.6) */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Status 3 Perangkat Absensi</CardTitle>
            <CardDescription>
              Pemantauan sinkronisasi dan aktivitas masing-masing komputer operator.
            </CardDescription>
          </div>
          <span className="text-xs font-medium text-primary-600 bg-primary-50 px-2.5 py-1 rounded-pill">
            3 Komputer Terdaftar
          </span>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {devices.map((device) => {
              const deviceTrx = allTodayTransactions.filter((t) => t.deviceId === device.id);
              const devicePending = deviceTrx.filter((t) => t.syncStatus === 'PENDING').length;

              return (
                <div
                  key={device.id}
                  className={`p-4 rounded-xl border transition-all ${
                    device.isCurrent
                      ? 'border-primary-600 bg-primary-50/30 shadow-sm'
                      : 'border-border bg-surface'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-lg ${device.isCurrent ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                        <Monitor className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-content-primary">{device.id}</h4>
                        <p className="text-[10px] text-content-secondary">{device.location}</p>
                      </div>
                    </div>
                    {device.isCurrent && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-600 text-white">
                        PC Ini
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-border text-xs">
                    <div className="flex justify-between">
                      <span className="text-content-secondary">Operator Aktif:</span>
                      <span className="font-semibold text-content-primary">@{device.operator}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-content-secondary">Scan Hari Ini:</span>
                      <span className="font-bold text-content-primary">{deviceTrx.length} siswa</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-content-secondary">Antrean Pending:</span>
                      <span className={`font-semibold ${devicePending > 0 ? 'text-status-warning' : 'text-status-success'}`}>
                        {devicePending} pending
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Tabel Aktivitas Absensi Terbaru */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Aktivitas Absensi Terbaru</CardTitle>
            <CardDescription>
              Transaksi kehadiran terakhir yang masuk dari scanner lokal maupun sinkronisasi.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-gray-50/75 text-[11px] font-semibold text-content-secondary uppercase tracking-wider">
                  <th className="py-3 px-6">Waktu</th>
                  <th className="py-3 px-6">Siswa</th>
                  <th className="py-3 px-6">Kelas</th>
                  <th className="py-3 px-6">Sesi</th>
                  <th className="py-3 px-6">Status</th>
                  <th className="py-3 px-6">Perangkat</th>
                  <th className="py-3 px-6">Sync</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {latestTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-content-secondary">
                      Belum ada catatan aktivitas absensi.
                    </td>
                  </tr>
                ) : (
                  latestTransactions.map((trx) => (
                    <tr key={trx.transactionId} className="hover:bg-gray-50/50">
                      <td className="py-3 px-6 font-mono text-[11px] text-content-secondary">
                        {formatTime(trx.deviceTimestamp)}
                      </td>
                      <td className="py-3 px-6">
                        <p className="font-semibold text-content-primary">{trx.studentName}</p>
                        <p className="text-[11px] font-mono text-content-secondary">{trx.studentId}</p>
                      </td>
                      <td className="py-3 px-6 text-content-secondary">{trx.className}</td>
                      <td className="py-3 px-6 font-medium">{trx.attendanceType}</td>
                      <td className="py-3 px-6">
                        <Badge attendanceStatus={trx.attendanceStatus} />
                      </td>
                      <td className="py-3 px-6 font-bold text-primary-700">{trx.deviceId}</td>
                      <td className="py-3 px-6">
                        <Badge syncStatus={trx.syncStatus} dot />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

