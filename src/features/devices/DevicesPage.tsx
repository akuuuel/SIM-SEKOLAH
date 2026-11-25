import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/attendanceDb';
import { syncPendingTransactions, fetchMasterStudentsFromSheets, getAppsScriptUrl } from '../../services/syncService';
import type { DeviceId, UserAccount } from '../../types';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Monitor, RefreshCw, Download, CheckCircle2, Laptop, AlertCircle, CloudDownload, Lock } from 'lucide-react';
import { formatTime } from '../../lib/utils';
import { Swal } from '../../lib/swal';

export interface DevicesPageProps {
  currentDeviceId: DeviceId;
  onSetCurrentDevice: (id: DeviceId) => void;
  currentUser?: UserAccount | null;
}

export const DevicesPage: React.FC<DevicesPageProps> = ({
  currentDeviceId,
  onSetCurrentDevice,
  currentUser,
}) => {
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const [isSyncing, setIsSyncing] = useState(false);
  const [isFetchingStudents, setIsFetchingStudents] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);

  const pendingTransactions = useLiveQuery(
    () => db.transactions.where('syncStatus').equals('PENDING').toArray(),
    []
  ) || [];

  const allTransactions = useLiveQuery(() => db.transactions.toArray(), []) || [];

  const handleSyncData = async () => {
    setIsSyncing(true);
    setSyncResult(null);

    const res = await syncPendingTransactions(currentDeviceId);

    setIsSyncing(false);
    if (res.success) {
      setSyncResult({
        success: true,
        message: `Berhasil menyinkronkan ${res.syncedCount} transaksi ke Google Sheets!`,
      });
    } else {
      setSyncResult({
        success: false,
        message: `Gagal sinkronisasi: ${res.error || 'Periksa koneksi internet atau URL Apps Script'}`,
      });
    }

    setTimeout(() => setSyncResult(null), 5000);
  };

  const handleFetchStudents = async () => {
    setIsFetchingStudents(true);
    setSyncResult(null);

    const res = await fetchMasterStudentsFromSheets();

    setIsFetchingStudents(false);
    if (res.success) {
      setSyncResult({
        success: true,
        message: `Berhasil mengunduh dan memperbarui ${res.total} data siswa dari tab PAGE Google Sheets!`,
      });
    } else {
      setSyncResult({
        success: false,
        message: `Gagal mengambil data siswa: ${res.error || 'Periksa URL Apps Script di Pengaturan'}`,
      });
    }

    setTimeout(() => setSyncResult(null), 5000);
  };

  const handleExportQueue = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(allTransactions, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `antrean_absensi_${currentDeviceId}_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const devices = [
    {
      id: 'PC-01' as DeviceId,
      name: 'Komputer Gerbang Utama',
      location: 'Gerbang Utama (Masuk & Pulang)',
      operator: 'admin_pc01',
    },
    {
      id: 'PC-02' as DeviceId,
      name: 'Komputer Gerbang Barat',
      location: 'Gerbang Barat (Masuk & Pulang)',
      operator: 'admin_pc02',
    },
    {
      id: 'PC-03' as DeviceId,
      name: 'Komputer Ruang Piket',
      location: 'Ruang Piket Guru (Koreksi & Manual)',
      operator: 'admin_pc03',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-content-primary">Perangkat & Sinkronisasi 3 PC</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={handleFetchStudents}
            isLoading={isFetchingStudents}
            leftIcon={<CloudDownload className="w-4 h-4 text-primary-600" />}
            className="text-xs"
            title="Tarik data siswa terbaru dari Google Sheet tab PAGE"
          >
            Tarik Siswa dari Sheets
          </Button>
          <Button
            variant="outline"
            onClick={handleExportQueue}
            leftIcon={<Download className="w-4 h-4" />}
            className="text-xs"
          >
            Cadangkan Data (.json)
          </Button>
          <Button
            onClick={handleSyncData}
            isLoading={isSyncing}
            disabled={pendingTransactions.length === 0}
            leftIcon={<RefreshCw className="w-4 h-4" />}
            className="text-xs"
          >
            Sinkronkan ({pendingTransactions.length} Pending)
          </Button>
        </div>
      </div>

      {syncResult && (
        <div className={`p-3 border rounded-card text-xs font-semibold flex items-center gap-2 ${
          syncResult.success
            ? 'bg-status-success-bg border-status-success/30 text-status-success'
            : 'bg-status-danger-bg border-status-danger/30 text-status-danger'
        }`}>
          {syncResult.success ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{syncResult.message}</span>
        </div>
      )}

      {/* Peringatan jika bukan Super Admin */}
      {!isSuperAdmin && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-semibold text-amber-900 flex items-center gap-2 shadow-xs">
          <Lock className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <b>Identitas Workstation Terkunci:</b> Hanya akun <b>Super Admin</b> yang berhak mengganti identitas komputer PC ini. Operator hanya diizinkan bekerja pada workstation yang telah ditugaskan.
          </span>
        </div>
      )}

      {/* Kartu Pemilihan Perangkat Komputer */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {devices.map((device) => {
          const isSelected = currentDeviceId === device.id;
          const count = allTransactions.filter((t) => t.deviceId === device.id).length;

          return (
            <Card
              key={device.id}
              className={`p-5 transition-all ${
                isSelected
                  ? 'border-2 border-[#2e8b38] bg-emerald-50/20 shadow-md'
                  : isSuperAdmin
                  ? 'hover:border-gray-300 cursor-pointer'
                  : 'opacity-70 cursor-not-allowed bg-gray-50/50'
              }`}
              onClick={async () => {
                if (isSuperAdmin) {
                  if (device.id === currentDeviceId) return;
                  const confirmed = await Swal.confirm(
                    `Ganti ke ${device.id}?`,
                    `Apakah Anda yakin ingin mengganti identitas workstation aktif komputer ini ke <b>${device.id}</b> (${device.name})?`,
                    'Ya, Ganti Workstation',
                    'Batal'
                  );
                  if (confirmed) {
                    onSetCurrentDevice(device.id);
                    Swal.toast(`Workstation diganti ke ${device.id}`, 'success');
                  }
                }
              }}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${isSelected ? 'bg-[#2e8b38] text-white' : 'bg-gray-100 text-gray-700'}`}>
                    <Laptop className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-content-primary">{device.id}</h3>
                    <p className="text-xs text-content-secondary">{device.name}</p>
                  </div>
                </div>
                {isSelected ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#2e8b38] text-white">
                    Perangkat Ini
                  </span>
                ) : isSuperAdmin ? (
                  <button className="text-[11px] text-[#2e8b38] font-semibold hover:underline">
                    Pilih PC Ini
                  </button>
                ) : (
                  <span className="text-[10px] font-semibold text-gray-400 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Terkunci
                  </span>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-border space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-content-secondary">Lokasi:</span>
                  <span className="font-medium text-content-primary">{device.location}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-content-secondary">Akun Ditugaskan:</span>
                  <span className="font-semibold text-[#2e8b38]">@{device.operator}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-content-secondary">Total Tercatat:</span>
                  <span className="font-bold text-content-primary">{count} transaksi</span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Antrean Transaksi Pending */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Antrean Transaksi Menunggu Sinkronisasi</CardTitle>
            <CardDescription>
              Transaksi lokal di IndexedDB yang belum dikonfirmasi oleh Google Sheets server.
            </CardDescription>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 rounded-pill bg-status-warning-bg text-status-warning">
            {pendingTransactions.length} Transaksi Menunggu
          </span>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-gray-50/75 text-[11px] font-semibold text-content-secondary uppercase tracking-wider">
                  <th className="py-3 px-6">UUID Transaksi</th>
                  <th className="py-3 px-6">Waktu Lokal</th>
                  <th className="py-3 px-6">Siswa</th>
                  <th className="py-3 px-6">Sesi</th>
                  <th className="py-3 px-6">Status</th>
                  <th className="py-3 px-6">Perangkat</th>
                  <th className="py-3 px-6">Operator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pendingTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-content-secondary">
                      Semua transaksi pada perangkat ini telah tersinkronisasi penuh dengan server.
                    </td>
                  </tr>
                ) : (
                  pendingTransactions.map((trx) => (
                    <tr key={trx.transactionId} className="hover:bg-gray-50/50">
                      <td className="py-3 px-6 font-mono text-[11px] text-gray-400">
                        {trx.transactionId.substring(0, 8)}...
                      </td>
                      <td className="py-3 px-6 font-mono text-content-secondary">
                        {formatTime(trx.deviceTimestamp)}
                      </td>
                      <td className="py-3 px-6 font-semibold text-content-primary">
                        {trx.studentName} ({trx.studentId})
                      </td>
                      <td className="py-3 px-6 font-medium">{trx.attendanceType}</td>
                      <td className="py-3 px-6">
                        <Badge attendanceStatus={trx.attendanceStatus} />
                      </td>
                      <td className="py-3 px-6 font-bold text-primary-700">{trx.deviceId}</td>
                      <td className="py-3 px-6 text-content-secondary">@{trx.operatorId}</td>
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

