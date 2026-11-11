import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/attendanceDb';
import type { AttendanceStatus, AttendanceSession } from '../../types';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import { 
  FileSpreadsheet, 
  Download, 
  Printer, 
  Filter, 
  UserCheck, 
  Clock, 
  Calendar 
} from 'lucide-react';
import { formatTime, formatDate } from '../../lib/utils';

export const ReportsPage: React.FC = () => {
  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [selectedSession, setSelectedSession] = useState<string>('ALL');
  const [selectedClass, setSelectedClass] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Ambil data transaksi dari IndexedDB
  const allTransactions = useLiveQuery(() => db.transactions.toArray(), []) || [];
  const students = useLiveQuery(() => db.students.toArray(), []) || [];

  // Dapatkan daftar kelas unik
  const availableClasses = Array.from(new Set(students.map((s) => s.className))).filter(Boolean);

  // Filter transaksi berdasarkan kriteria
  const filteredTransactions = allTransactions.filter((trx) => {
    if (selectedDate && trx.attendanceDate !== selectedDate) return false;
    if (selectedSession !== 'ALL' && trx.attendanceType !== selectedSession) return false;
    if (selectedClass !== 'ALL' && trx.className !== selectedClass) return false;
    if (selectedStatus !== 'ALL' && trx.attendanceStatus !== selectedStatus) return false;
    return true;
  });

  const totalHadir = filteredTransactions.filter((t) => t.attendanceStatus === 'HADIR').length;
  const totalTerlambat = filteredTransactions.filter((t) => t.attendanceStatus === 'TERLAMBAT').length;
  const totalIzinSakit = filteredTransactions.filter(
    (t) => t.attendanceStatus === 'IZIN' || t.attendanceStatus === 'SAKIT'
  ).length;

  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) {
      alert('Tidak ada data transaksi untuk diekspor.');
      return;
    }

    const headers = [
      'No',
      'Tanggal',
      'Waktu Scan',
      'ID Siswa',
      'Nama Siswa',
      'Kelas',
      'Sesi',
      'Status Kehadiran',
      'Metode',
      'Perangkat',
      'Operator',
      'Status Sinkronisasi',
    ];

    const rows = filteredTransactions.map((trx, idx) => [
      idx + 1,
      trx.attendanceDate,
      formatTime(trx.deviceTimestamp),
      `"${trx.studentId}"`,
      `"${trx.studentName || ''}"`,
      `"${trx.className || ''}"`,
      trx.attendanceType,
      trx.attendanceStatus,
      trx.method,
      trx.deviceId,
      trx.operatorId,
      trx.syncStatus,
    ]);

    const csvContent =
      '\uFEFF' + // UTF-8 BOM agar Excel membaca karakter khusus dengan benar
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `rekap_absensi_MAN1_BULUKUMBA_${selectedDate || 'semua'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-content-primary">Laporan & Rekap Kehadiran</h2>
            <span className="px-2 py-0.5 rounded-full bg-primary-100 text-primary-800 text-[11px] font-bold">
              MAN 1 BULUKUMBA
            </span>
          </div>
          <p className="text-xs text-content-secondary mt-1">
            Rekapitulasi kehadiran harian siswa dari seluruh komputer operator absensi madrasah.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handlePrint}
            leftIcon={<Printer className="w-4 h-4" />}
            className="text-xs"
          >
            Cetak Laporan
          </Button>
          <Button
            onClick={handleExportCSV}
            leftIcon={<Download className="w-4 h-4" />}
            className="text-xs shadow-sm"
          >
            Ekspor ke CSV / Excel
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-content-secondary mb-1">
              Tanggal
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full bg-canvas text-xs rounded-button border border-border px-3 py-2 text-content-primary focus:outline-none focus:border-primary-600"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-content-secondary mb-1">
              Sesi Absensi
            </label>
            <select
              value={selectedSession}
              onChange={(e) => setSelectedSession(e.target.value)}
              className="w-full bg-canvas text-xs rounded-button border border-border px-3 py-2 text-content-primary focus:outline-none focus:border-primary-600"
            >
              <option value="ALL">Semua Sesi (Masuk & Pulang)</option>
              <option value="MASUK">Sesi Masuk</option>
              <option value="PULANG">Sesi Pulang</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-content-secondary mb-1">
              Kelas
            </label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="w-full bg-canvas text-xs rounded-button border border-border px-3 py-2 text-content-primary focus:outline-none focus:border-primary-600"
            >
              <option value="ALL">Semua Kelas</option>
              {availableClasses.map((cls) => (
                <option key={cls} value={cls}>
                  {cls}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-content-secondary mb-1">
              Status Kehadiran
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full bg-canvas text-xs rounded-button border border-border px-3 py-2 text-content-primary focus:outline-none focus:border-primary-600"
            >
              <option value="ALL">Semua Status</option>
              <option value="HADIR">Hadir</option>
              <option value="TERLAMBAT">Terlambat</option>
              <option value="IZIN">Izin</option>
              <option value="SAKIT">Sakit</option>
              <option value="ALFA">Alfa</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Ringkasan Angka Rekap */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-surface border border-border rounded-card flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-content-secondary">Total Hadir Tepat Waktu</p>
            <p className="text-xl font-bold text-status-success mt-1">{totalHadir} siswa</p>
          </div>
          <div className="p-2.5 rounded-xl bg-status-success-bg text-status-success">
            <UserCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-surface border border-border rounded-card flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-content-secondary">Total Terlambat</p>
            <p className="text-xl font-bold text-status-warning mt-1">{totalTerlambat} siswa</p>
          </div>
          <div className="p-2.5 rounded-xl bg-status-warning-bg text-status-warning">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-surface border border-border rounded-card flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-content-secondary">Total Tercatat pada Filter</p>
            <p className="text-xl font-bold text-primary-700 mt-1">{filteredTransactions.length} transaksi</p>
          </div>
          <div className="p-2.5 rounded-xl bg-primary-50 text-primary-600">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Tabel Data Rekapitulasi */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Rincian Kehadiran Siswa</CardTitle>
            <CardDescription>
              Menampilkan {filteredTransactions.length} data absensi yang sesuai filter.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-gray-50/75 text-[11px] font-semibold text-content-secondary uppercase tracking-wider">
                  <th className="py-3 px-6">Waktu</th>
                  <th className="py-3 px-6">ID & Siswa</th>
                  <th className="py-3 px-6">Kelas</th>
                  <th className="py-3 px-6">Sesi</th>
                  <th className="py-3 px-6">Status</th>
                  <th className="py-3 px-6">Metode</th>
                  <th className="py-3 px-6">Perangkat</th>
                  <th className="py-3 px-6">Operator</th>
                  <th className="py-3 px-6">Sinkronisasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-content-secondary">
                      Tidak ada catatan absensi yang cocok dengan kriteria filter yang dipilih.
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((trx) => (
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
                      <td className="py-3 px-6 text-content-secondary font-mono text-[11px]">
                        {trx.method === 'BARCODE_CAMERA'
                          ? 'Kamera'
                          : trx.method === 'USB_SCANNER'
                          ? 'USB'
                          : 'Manual'}
                      </td>
                      <td className="py-3 px-6 font-bold text-primary-700">{trx.deviceId}</td>
                      <td className="py-3 px-6 text-content-secondary">@{trx.operatorId}</td>
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

