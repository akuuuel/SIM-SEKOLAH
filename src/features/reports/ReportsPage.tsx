import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/attendanceDb';
import type { AttendanceStatus, AttendanceSession, SyncStatus } from '../../types';
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
  Calendar,
  HeartPulse,
  UserMinus,
  Users,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  Phone,
  Search,
} from 'lucide-react';
import { formatTime, formatDate, getLocalDateString } from '../../lib/utils';
import { Swal } from '../../lib/swal';
import { fetchAttendanceTransactionsFromServer } from '../../services/syncService';

export type ReportsTask = 'harian' | 'kelas' | 'perhatian' | 'ekspor';

export const ReportsPage: React.FC = () => {
  const today = getLocalDateString();
  const [activeTask, setActiveTask] = useState<ReportsTask>('harian');
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [selectedSession, setSelectedSession] = useState<string>('ALL');
  const [selectedClass, setSelectedClass] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Tarik transaksi dari database server setiap kali tanggal dipilih
  useEffect(() => {
    fetchAttendanceTransactionsFromServer(selectedDate).catch(() => {});
  }, [selectedDate]);

  // Ambil data transaksi dari IndexedDB
  const allTransactions = useLiveQuery(() => db.transactions.toArray(), []) || [];
  const students = useLiveQuery(() => db.students.toArray(), []) || [];

  // Dapatkan daftar kelas unik
  const availableClasses = useMemo(() => {
    return Array.from(new Set(students.map((s) => s.className))).filter(Boolean).sort();
  }, [students]);

  // Seluruh transaksi pada tanggal terpilih (tanpa terpengaruh filter sesi, kelas, atau status harian)
  const dateTransactions = useMemo(() => {
    const raw = allTransactions.filter((trx) => {
      if (selectedDate && trx.attendanceDate !== selectedDate) return false;
      return true;
    });

    // Cegah duplikasi transaksi ganda (lokal + server)
    const map = new Map<string, typeof raw[0]>();
    for (const trx of raw) {
      const key = `${trx.studentId}_${trx.attendanceDate}_${trx.attendanceType}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, trx);
      } else if (existing.attendanceStatus === 'ALFA' && trx.attendanceStatus !== 'ALFA') {
        map.set(key, trx);
      } else if (trx.syncStatus === 'SYNCED' && existing.syncStatus !== 'SYNCED') {
        map.set(key, trx);
      }
    }
    return Array.from(map.values());
  }, [allTransactions, selectedDate]);

  // Rekapitulasi Presensi Harian per Siswa (Menggabungkan Waktu Masuk & Waktu Pulang)
  const dailyAttendanceRecords = useMemo(() => {
    const map = new Map<string, {
      studentId: string;
      studentName: string;
      className: string;
      attendanceDate: string;
      entryTime: string | null;
      departureTime: string | null;
      attendanceStatus: AttendanceStatus;
      method: string;
      deviceId: string;
      operatorId: string;
      syncStatus: SyncStatus;
      note: string | null;
    }>();

    for (const trx of dateTransactions) {
      const key = `${trx.studentId}_${trx.attendanceDate}`;
      let record = map.get(key);
      if (!record) {
        record = {
          studentId: trx.studentId,
          studentName: trx.studentName || '-',
          className: trx.className || '-',
          attendanceDate: trx.attendanceDate,
          entryTime: null,
          departureTime: null,
          attendanceStatus: trx.attendanceStatus,
          method: trx.method,
          deviceId: trx.deviceId,
          operatorId: trx.operatorId,
          syncStatus: trx.syncStatus,
          note: trx.note || null,
        };
        map.set(key, record);
      }

      if (trx.attendanceType === 'MASUK') {
        record.entryTime = formatTime(trx.deviceTimestamp);
        record.attendanceStatus = trx.attendanceStatus;
        if (trx.method) record.method = trx.method;
        if (trx.deviceId) record.deviceId = trx.deviceId;
        if (trx.operatorId) record.operatorId = trx.operatorId;
        if (trx.note) record.note = trx.note;
      } else if (trx.attendanceType === 'PULANG') {
        record.departureTime = formatTime(trx.deviceTimestamp);
        if (!record.entryTime && trx.attendanceStatus) {
          record.attendanceStatus = trx.attendanceStatus;
        }
      }

      if (trx.syncStatus === 'PENDING') {
        record.syncStatus = 'PENDING';
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      const classCmp = (a.className || '').localeCompare(b.className || '');
      if (classCmp !== 0) return classCmp;
      return (a.studentName || '').localeCompare(b.studentName || '');
    });
  }, [dateTransactions]);

  // Filter khusus untuk tab Presensi Harian berdasarkan kriteria filter aktif
  const filteredDailyRecords = useMemo(() => {
    return dailyAttendanceRecords.filter((rec) => {
      if (selectedSession === 'MASUK' && !rec.entryTime) return false;
      if (selectedSession === 'PULANG' && !rec.departureTime) return false;
      if (selectedClass !== 'ALL' && rec.className !== selectedClass) return false;
      if (selectedStatus !== 'ALL' && rec.attendanceStatus !== selectedStatus) return false;
      return true;
    });
  }, [dailyAttendanceRecords, selectedSession, selectedClass, selectedStatus]);

  const totalHadir = filteredDailyRecords.filter((t) => t.attendanceStatus === 'HADIR').length;
  const totalTerlambat = filteredDailyRecords.filter((t) => t.attendanceStatus === 'TERLAMBAT').length;
  const totalIzinSakit = filteredDailyRecords.filter((t) =>
    ['IZIN', 'SAKIT', 'BK'].includes(t.attendanceStatus)
  ).length;
  const totalAlfa = filteredDailyRecords.filter((t) => t.attendanceStatus === 'ALFA').length;

  // Data siswa yang terlambat atau alfa (Perhatian Khusus) - Independen dari filter sesi/kelas/status Presensi Harian
  const attentionTransactions = useMemo(() => {
    return dateTransactions.filter((t) => ['TERLAMBAT', 'ALFA'].includes(t.attendanceStatus));
  }, [dateTransactions]);

  // Agregat rekapitulasi kehadiran per kelas - Independen dari filter sesi/kelas/status Presensi Harian
  const classSummaries = useMemo(() => {
    return availableClasses.map((cls) => {
      const classStudents = students.filter((s) => s.className === cls);
      const classTxs = dateTransactions.filter((t) => t.className === cls);

      const hadir = classTxs.filter((t) => t.attendanceStatus === 'HADIR').length;
      const terlambat = classTxs.filter((t) => t.attendanceStatus === 'TERLAMBAT').length;
      const izinSakit = classTxs.filter((t) => ['IZIN', 'SAKIT', 'BK'].includes(t.attendanceStatus)).length;
      const alfa = classTxs.filter((t) => t.attendanceStatus === 'ALFA').length;
      const totalSiswa = classStudents.length;
      const totalMasuk = hadir + terlambat;
      const percent = totalSiswa > 0 ? Math.min(100, Math.round((totalMasuk / totalSiswa) * 100)) : 0;

      return {
        className: cls,
        totalSiswa,
        hadir,
        terlambat,
        izinSakit,
        alfa,
        totalTercatat: classTxs.length,
        percent,
      };
    });
  }, [availableClasses, students, dateTransactions]);

  const handleExportCSV = (useAllDate = false) => {
    const dataToExport = useAllDate ? dailyAttendanceRecords : filteredDailyRecords;
    if (dataToExport.length === 0) {
      Swal.warning('Peringatan', 'Tidak ada data presensi untuk diekspor.');
      return;
    }

    const headers = [
      'No',
      'Tanggal',
      'Waktu Masuk',
      'Waktu Pulang',
      'ID Siswa',
      'Nama Siswa',
      'Kelas',
      'Status Kehadiran',
      'Metode',
      'Perangkat',
      'Operator',
      'Status Sinkronisasi',
      'Keterangan',
    ];

    const rows = dataToExport.map((rec, idx) => [
      idx + 1,
      rec.attendanceDate,
      `"${rec.entryTime || '-'}"`,
      `"${rec.departureTime || '-'}"`,
      `"${rec.studentId}"`,
      `"${rec.studentName || ''}"`,
      `"${rec.className || ''}"`,
      rec.attendanceStatus,
      rec.method,
      rec.deviceId,
      rec.operatorId,
      rec.syncStatus,
      `"${rec.note || ''}"`,
    ]);

    const csvContent =
      '\uFEFF' +
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

  const handleExportFromMySQL = () => {
    const backendUrl = localStorage.getItem('school_apps_script_url') || 'http://localhost/Web%20Absensi/api/';
    const baseUrl = backendUrl.replace(/index\.php\/?$/, '').replace(/\/?$/, '/');
    const exportUrl = `${baseUrl}export.php?date=${selectedDate || new Date().toISOString().split('T')[0]}${selectedClass !== 'ALL' ? '&kelas=' + encodeURIComponent(selectedClass) : ''}`;
    window.open(exportUrl, '_blank');
  };

  // -------------------------------------------------------
  // Cetak Dokumen / Simpan PDF Resmi (Sesuai Filter yang Diterapkan)
  // -------------------------------------------------------
  const handlePrintReportPdf = (withSignature = false) => {
    const printWin = window.open('', '_blank', 'width=950,height=950');
    if (!printWin) {
      window.print();
      return;
    }

    const todayFormatted = new Date().toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const dateFormatted = selectedDate
      ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : todayFormatted;

    let docTitle = 'LAPORAN REKAPITULASI PRESENSI HARIAN SISWA';
    if (withSignature || activeTask === 'ekspor') {
      docTitle = 'LAPORAN RESMI REKAPITULASI PRESENSI SISWA';
    } else if (activeTask === 'kelas') {
      docTitle = 'LAPORAN REKAPITULASI KEHADIRAN PER KELAS';
    } else if (activeTask === 'perhatian') {
      docTitle = 'DAFTAR SISWA PERLU PEMBINAAN KHUSUS (TERLAMBAT & ALFA)';
    }

    const statusBadge = (st: string) => {
      switch (st) {
        case 'HADIR':
          return '<span style="color:#15803d;background:#dcfce7;padding:3px 8px;border-radius:9999px;font-weight:bold;font-size:10px;">HADIR TEPAT</span>';
        case 'TERLAMBAT':
          return '<span style="color:#b45309;background:#fef3c7;padding:3px 8px;border-radius:9999px;font-weight:bold;font-size:10px;">TERLAMBAT</span>';
        case 'IZIN':
          return '<span style="color:#1d4ed8;background:#dbeafe;padding:3px 8px;border-radius:9999px;font-weight:bold;font-size:10px;">IZIN</span>';
        case 'SAKIT':
          return '<span style="color:#7c3aed;background:#ede9fe;padding:3px 8px;border-radius:9999px;font-weight:bold;font-size:10px;">SAKIT</span>';
        case 'ALFA':
          return '<span style="color:#b91c1c;background:#fee2e2;padding:3px 8px;border-radius:9999px;font-weight:bold;font-size:10px;">ALFA</span>';
        default:
          return `<span style="color:#475569;background:#f1f5f9;padding:3px 8px;border-radius:9999px;font-weight:bold;font-size:10px;">${st}</span>`;
      }
    };

    let tableHtml = '';

    if (activeTask === 'kelas') {
      // TABEL REKAP KELAS
      const rowsHtml = classSummaries
        .map((c, idx) => {
          const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
          return `
            <tr style="background-color: ${bg}; border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 7px 10px; text-align: center; font-family: monospace;">${idx + 1}</td>
              <td style="padding: 7px 10px; font-weight: bold; color: #0f172a;">${c.className}</td>
              <td style="padding: 7px 10px; text-align: center; font-weight: 600;">${c.totalSiswa}</td>
              <td style="padding: 7px 10px; text-align: center; color: #15803d; font-weight: bold;">${c.hadir}</td>
              <td style="padding: 7px 10px; text-align: center; color: #b45309; font-weight: bold;">${c.terlambat}</td>
              <td style="padding: 7px 10px; text-align: center; color: #1d4ed8; font-weight: bold;">${c.izinSakit}</td>
              <td style="padding: 7px 10px; text-align: center; color: #b91c1c; font-weight: bold;">${c.alfa}</td>
              <td style="padding: 7px 10px; text-align: center; font-weight: bold; color: ${c.percent >= 80 ? '#15803d' : '#b45309'};">${c.percent}%</td>
            </tr>
          `;
        })
        .join('');

      tableHtml = `
        <table>
          <thead>
            <tr>
              <th style="width: 35px; text-align: center;">#</th>
              <th>Nama Kelas / Rombel</th>
              <th style="width: 80px; text-align: center;">Total Siswa</th>
              <th style="width: 80px; text-align: center;">Hadir Tepat</th>
              <th style="width: 80px; text-align: center;">Terlambat</th>
              <th style="width: 80px; text-align: center;">Izin / Sakit</th>
              <th style="width: 70px; text-align: center;">Alfa</th>
              <th style="width: 85px; text-align: center;">% Kehadiran</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="8" style="text-align: center; padding: 20px;">Tidak ada data kelas.</td></tr>'}
          </tbody>
        </table>
      `;
    } else if (activeTask === 'perhatian') {
      // TABEL PERHATIAN KHUSUS (TERLAMBAT & ALFA)
      const rowsHtml = attentionTransactions
        .map((trx, idx) => {
          const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
          return `
            <tr style="background-color: ${bg}; border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 7px 10px; text-align: center; font-family: monospace;">${idx + 1}</td>
              <td style="padding: 7px 10px; font-family: monospace; text-align: center;">${formatTime(trx.deviceTimestamp)}</td>
              <td style="padding: 7px 10px; font-family: monospace; font-weight: bold;">${trx.studentId}</td>
              <td style="padding: 7px 10px; font-weight: 600; color: #0f172a;">${trx.studentName}</td>
              <td style="padding: 7px 10px; color: #334155;">${trx.className}</td>
              <td style="padding: 7px 10px; text-align: center;">${statusBadge(trx.attendanceStatus)}</td>
              <td style="padding: 7px 10px; text-align: center; font-weight: 600; color: #166534;">${trx.deviceId}</td>
              <td style="padding: 7px 10px; color: #64748b;">${trx.note || '-'}</td>
            </tr>
          `;
        })
        .join('');

      tableHtml = `
        <table>
          <thead>
            <tr>
              <th style="width: 35px; text-align: center;">#</th>
              <th style="width: 75px; text-align: center;">Waktu</th>
              <th style="width: 85px;">ID Siswa</th>
              <th>Nama Siswa</th>
              <th style="width: 75px;">Kelas</th>
              <th style="width: 95px; text-align: center;">Status</th>
              <th style="width: 75px; text-align: center;">Perangkat</th>
              <th style="width: 140px;">Catatan Pembinaan</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="8" style="text-align: center; padding: 20px;">Tidak ada siswa yang terlambat atau alfa.</td></tr>'}
          </tbody>
        </table>
      `;
    } else {
      // TABEL PRESENSI HARIAN & PUSAT EKSPOR
      // Jika cetak dari Pusat Ekspor atau dengan tanda tangan: gunakan seluruh data harian (dailyAttendanceRecords)
      // Jika cetak dari Presensi Harian: gunakan data yang sudah difilter (filteredDailyRecords)
      const dataToRender = (withSignature || activeTask === 'ekspor') ? dailyAttendanceRecords : filteredDailyRecords;

      const rowsHtml = dataToRender
        .map((rec, idx) => {
          const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
          return `
            <tr style="background-color: ${bg}; border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 7px 8px; text-align: center; font-family: monospace;">${idx + 1}</td>
              <td style="padding: 7px 8px; font-family: monospace; font-weight: bold;">${rec.studentId}</td>
              <td style="padding: 7px 8px; font-weight: 600; color: #0f172a;">${rec.studentName || '-'}</td>
              <td style="padding: 7px 8px; color: #334155;">${rec.className || '-'}</td>
              <td style="padding: 7px 8px; text-align: center; font-family: monospace; font-weight: bold; color: #15803d;">
                ${rec.entryTime || '-'}
              </td>
              <td style="padding: 7px 8px; text-align: center; font-family: monospace; font-weight: bold; color: #2563eb;">
                ${rec.departureTime || '-'}
              </td>
              <td style="padding: 7px 8px; text-align: center;">${statusBadge(rec.attendanceStatus)}</td>
              <td style="padding: 7px 8px; text-align: center; font-size: 10px; color: #475569;">${rec.operatorId || rec.deviceId || '-'}</td>
              <td style="padding: 7px 8px; color: #64748b; font-size: 10px;">${rec.note || '-'}</td>
            </tr>
          `;
        })
        .join('');

      tableHtml = `
        <table>
          <thead>
            <tr>
              <th style="width: 30px; text-align: center;">#</th>
              <th style="width: 85px;">ID Siswa</th>
              <th>Nama Siswa</th>
              <th style="width: 70px;">Kelas</th>
              <th style="width: 80px; text-align: center;">Waktu Masuk</th>
              <th style="width: 80px; text-align: center;">Waktu Pulang</th>
              <th style="width: 90px; text-align: center;">Status</th>
              <th style="width: 80px; text-align: center;">Operator</th>
              <th style="width: 95px;">Keterangan</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="9" style="text-align: center; padding: 25px;">Tidak ada data presensi yang sesuai.</td></tr>'}
          </tbody>
        </table>
      `;
    }

    const signaturesHtml = (withSignature || activeTask === 'ekspor') ? `
      <div style="margin-top: 35px; display: flex; justify-content: space-between; page-break-inside: avoid; font-size: 11px;">
        <div style="text-align: center; width: 220px;">
          <p style="margin: 0;">Mengetahui,</p>
          <p style="margin: 3px 0 0; font-weight: bold;">Kepala Madrasah</p>
          <div style="height: 60px;"></div>
          <p style="margin: 0; font-weight: bold; text-decoration: underline;">Drs. H. Muhammad Yunus, M.Ag</p>
          <p style="margin: 2px 0 0; font-size: 10px; color: #475569;">NIP. 196805121995031002</p>
        </div>
        <div style="text-align: center; width: 220px;">
          <p style="margin: 0;">Bulukumba, ${todayFormatted}</p>
          <p style="margin: 3px 0 0; font-weight: bold;">Wakamad Kesiswaan / Petugas</p>
          <div style="height: 60px;"></div>
          <p style="margin: 0; font-weight: bold; text-decoration: underline;">( .................................................... )</p>
          <p style="margin: 2px 0 0; font-size: 10px; color: #475569;">NIP. -</p>
        </div>
      </div>
    ` : '';

    const filterSummaryHtml = (withSignature || activeTask === 'ekspor') ? `
      <div class="meta">
        <div>
          <div><strong>Hari, Tanggal:</strong> ${dateFormatted}</div>
          <div style="margin-top: 3px;"><strong>Cakupan:</strong> Seluruh Siswa &amp; Sesi Presensi Madrasah</div>
        </div>
        <div style="text-align: right;">
          <div><strong>Total Data:</strong> ${dateTransactions.length} baris</div>
          <div style="margin-top: 3px; font-size: 10.5px; color: #166534;">
            <strong>Hadir:</strong> ${dateTransactions.filter(t => t.attendanceStatus === 'HADIR').length} | 
            <strong>Terlambat:</strong> ${dateTransactions.filter(t => t.attendanceStatus === 'TERLAMBAT').length} | 
            <strong>Izin/Sakit:</strong> ${dateTransactions.filter(t => ['IZIN', 'SAKIT', 'BK'].includes(t.attendanceStatus)).length} | 
            <strong>Alfa:</strong> ${dateTransactions.filter(t => t.attendanceStatus === 'ALFA').length}
          </div>
        </div>
      </div>
    ` : activeTask === 'perhatian' ? `
      <div class="meta">
        <div>
          <div><strong>Hari, Tanggal:</strong> ${dateFormatted}</div>
          <div style="margin-top: 3px;"><strong>Cakupan:</strong> Siswa Terlambat &amp; Alfa (Perlu Pembinaan)</div>
        </div>
        <div style="text-align: right;">
          <div><strong>Total Data:</strong> ${attentionTransactions.length} siswa</div>
          <div style="margin-top: 3px; font-size: 10.5px; color: #b45309;">
            <strong>Terlambat:</strong> ${attentionTransactions.filter(t => t.attendanceStatus === 'TERLAMBAT').length} | 
            <strong>Alfa:</strong> ${attentionTransactions.filter(t => t.attendanceStatus === 'ALFA').length}
          </div>
        </div>
      </div>
    ` : activeTask === 'kelas' ? `
      <div class="meta">
        <div>
          <div><strong>Hari, Tanggal:</strong> ${dateFormatted}</div>
          <div style="margin-top: 3px;"><strong>Cakupan:</strong> Rekapitulasi Kehadiran Kumulatif Seluruh Rombongan Belajar</div>
        </div>
        <div style="text-align: right;">
          <div><strong>Total Kelas:</strong> ${classSummaries.length} Rombel</div>
        </div>
      </div>
    ` : `
      <div class="meta">
        <div>
          <div><strong>Hari, Tanggal:</strong> ${dateFormatted}</div>
          <div style="margin-top: 3px;"><strong>Filter Sesi:</strong> ${selectedSession === 'ALL' ? 'Semua Sesi' : selectedSession} &bull; <strong>Kelas:</strong> ${selectedClass === 'ALL' ? 'Semua Kelas' : selectedClass} &bull; <strong>Status:</strong> ${selectedStatus === 'ALL' ? 'Semua Status' : selectedStatus}</div>
        </div>
        <div style="text-align: right;">
          <div><strong>Total Data:</strong> ${filteredDailyRecords.length} siswa</div>
          <div style="margin-top: 3px; font-size: 10.5px; color: #166534;"><strong>Hadir:</strong> ${totalHadir} | <strong>Terlambat:</strong> ${totalTerlambat} | <strong>Izin:</strong> ${totalIzinSakit} | <strong>Alfa:</strong> ${totalAlfa}</div>
        </div>
      </div>
    `;

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${docTitle} - MAN 1 Bulukumba</title>
        <style>
          @page { size: A4 portrait; margin: 12mm 10mm; }
          * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { font-family: Arial, Helvetica, sans-serif; background: #ffffff; color: #0f172a; margin: 0; padding: 10px; font-size: 11px; }
          .header { text-align: center; border-bottom: 3px double #0f172a; padding-bottom: 8px; margin-bottom: 12px; }
          .header h1 { font-size: 14px; margin: 0; font-weight: 900; letter-spacing: 0.5px; color: #15803d; text-transform: uppercase; }
          .header h2 { font-size: 12px; margin: 3px 0 0; font-weight: bold; color: #0f172a; text-transform: uppercase; }
          .header .address { font-size: 10px; margin: 3px 0 0; color: #334155; }
          .header p { font-size: 10px; margin: 2px 0 0; color: #64748b; }
          .meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 11px; background: #f8fafc; padding: 8px 12px; border-radius: 6px; border: 1px solid #e2e8f0; }
          table { width: 100%; border-collapse: collapse; font-size: 10px; }
          th { background: #0f172a; color: #ffffff; padding: 7px 8px; font-size: 10px; text-align: left; }
          th.center { text-align: center; }
          .footer { margin-top: 18px; display: flex; justify-content: space-between; font-size: 10px; color: #64748b; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>KEMENTERIAN AGAMA REPUBLIK INDONESIA</h1>
          <h2>MADRASAH ALIYAH NEGERI (MAN) 1 BULUKUMBA</h2>
          <p class="address">Jalan K.H. Abd Karim Nomor 67 Tanete Bulukumba (0413) 2586253</p>
          <p>Sistem Presensi Digital Terpadu &bull; ${docTitle}</p>
        </div>
        ${filterSummaryHtml}
        ${tableHtml}
        ${signaturesHtml}
        <div class="footer">
          <div>Dicetak pada: ${new Date().toLocaleString('id-ID')} WITA &bull; Sistem Absensi MAN 1 Bulukumba</div>
          <div>Dokumen Resmi Madrasah</div>
        </div>
        <script>
          window.onload = function() {
            window.focus();
            window.print();
          };
        </script>
      </body>
      </html>
    `);
    printWin.document.close();
  };

  // -------------------------------------------------------
  // Unduh Excel Lokal (.xlsx via SheetJS / CSV fallback)
  // -------------------------------------------------------
  const handleExportExcel = (useAllDate = false) => {
    const dataToExport = useAllDate ? dailyAttendanceRecords : filteredDailyRecords;
    if (dataToExport.length === 0) {
      Swal.warning('Peringatan', 'Tidak ada data transaksi untuk diekspor.');
      return;
    }

    const xlsxLib = (window as any).XLSX;
    if (!xlsxLib) {
      handleExportCSV(useAllDate);
      return;
    }
    try {
      const dataRows: any[][] = [
        ['LAPORAN REKAPITULASI PRESENSI SISWA'],
        ['MADRASAH ALIYAH NEGERI 1 BULUKUMBA'],
        ['Jalan K.H. Abd Karim Nomor 67 Tanete Bulukumba (0413) 2586253'],
        [],
        ['Tanggal', selectedDate || 'Semua Tanggal', '', 'Sesi', useAllDate ? 'Semua Sesi' : selectedSession],
        ['Kelas', useAllDate ? 'Semua Kelas' : selectedClass, '', 'Status', useAllDate ? 'Semua Status' : selectedStatus],
        ['Total Siswa', `${dataToExport.length} Siswa`, '', '', ''],
        [],
        ['No', 'Tanggal', 'Waktu Masuk', 'Waktu Pulang', 'ID Siswa', 'Nama Siswa', 'Kelas', 'Status Kehadiran', 'Metode', 'Perangkat', 'Operator', 'Keterangan'],
      ];

      dataToExport.forEach((rec, idx) => {
        dataRows.push([
          idx + 1,
          rec.attendanceDate,
          rec.entryTime || '-',
          rec.departureTime || '-',
          rec.studentId,
          rec.studentName || '-',
          rec.className || '-',
          rec.attendanceStatus,
          rec.method,
          rec.deviceId,
          rec.operatorId,
          rec.note || '-',
        ]);
      });

      const ws = xlsxLib.utils.aoa_to_sheet(dataRows);
      const wb = xlsxLib.utils.book_new();
      xlsxLib.utils.book_append_sheet(wb, ws, 'Rekap Presensi');

      ws['!cols'] = [
        { wch: 6 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 28 },
        { wch: 12 },
        { wch: 16 },
        { wch: 14 },
        { wch: 12 },
        { wch: 14 },
        { wch: 26 },
      ];

      xlsxLib.writeFile(wb, `rekap_presensi_MAN1_BULUKUMBA_${selectedDate || 'semua'}.xlsx`);
      Swal.toast('Laporan berhasil diekspor ke Excel (.xlsx)!', 'success');
    } catch (err) {
      console.error('Export Excel error:', err);
      handleExportCSV(useAllDate);
    }
  };

  // Definisi Task Laporan
  const tasks: {
    id: ReportsTask;
    title: string;
    badge: string;
    desc: string;
    icon: React.ElementType;
    color: string;
  }[] = [
    {
      id: 'harian',
      title: 'Presensi Harian',
      badge: `${filteredDailyRecords.length} Siswa`,
      desc: 'Filter & detail kehadiran siswa',
      icon: Calendar,
      color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    },
    {
      id: 'kelas',
      title: 'Rekap Per Kelas',
      badge: `${availableClasses.length} Rombel`,
      desc: 'Matriks persentase tiap kelas',
      icon: Users,
      color: 'text-primary-700 bg-primary-50 border-primary-200',
    },
    {
      id: 'perhatian',
      title: 'Terlambat & Alfa',
      badge: `${attentionTransactions.length} Siswa`,
      desc: 'Daftar pembinaan BK & kesiswaan',
      icon: AlertTriangle,
      color: 'text-amber-700 bg-amber-50 border-amber-200',
    },
    {
      id: 'ekspor',
      title: 'Pusat Cetak & Unduh',
      badge: `${dateTransactions.length} Transaksi`,
      desc: 'Ekspor dokumen resmi madrasah',
      icon: FileSpreadsheet,
      color: 'text-blue-700 bg-blue-50 border-blue-200',
    },
  ];

  const currentTaskIndex = tasks.findIndex((t) => t.id === activeTask);
  const prevTask = currentTaskIndex > 0 ? tasks[currentTaskIndex - 1] : null;
  const nextTask = currentTaskIndex < tasks.length - 1 ? tasks[currentTaskIndex + 1] : null;

  return (
    <div className="space-y-5">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-content-primary">Laporan &amp; Rekapitulasi Kehadiran</h2>
            <span className="px-2 py-0.5 rounded-full bg-primary-100 text-primary-800 text-[11px] font-bold">
              MAN 1 BULUKUMBA
            </span>
          </div>
          <p className="text-xs text-content-secondary mt-1">
            Pusat laporan presensi digital dari seluruh workstation gerbang madrasah.
          </p>
        </div>

        {/* Action Button Bar */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePrintReportPdf(activeTask === 'ekspor')}
            leftIcon={<Printer className="w-4 h-4 text-emerald-700" />}
            className="text-xs font-semibold"
          >
            Cetak PDF
          </Button>
          <Button
            size="sm"
            onClick={handleExportFromMySQL}
            leftIcon={<FileSpreadsheet className="w-4 h-4" />}
            className="text-xs shadow-sm font-semibold"
          >
            Ekspor dari Database Server
          </Button>
        </div>
      </div>

      {/* ── TASK CARDS SELECTOR (4 Bento Task Cards) ───────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {tasks.map((task) => {
          const Icon = task.icon;
          const isActive = activeTask === task.id;

          return (
            <button
              key={task.id}
              type="button"
              onClick={() => setActiveTask(task.id)}
              className={`p-3.5 rounded-2xl text-left transition-all duration-150 flex flex-col justify-between border relative cursor-pointer ${
                isActive
                  ? 'border-2 border-[#2e8b38] bg-white shadow-md ring-2 ring-emerald-500/20 scale-[1.01]'
                  : 'bg-white border-border hover:border-emerald-300 hover:bg-emerald-50/20 shadow-xs'
              }`}
            >
              {isActive && (
                <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-[#2e8b38] animate-pulse" />
              )}
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-2 rounded-xl ${task.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div>
                <p className={`text-xs font-bold leading-tight ${isActive ? 'text-[#2e8b38]' : 'text-slate-800'}`}>
                  {task.title}
                </p>
                <p className="text-[10px] font-mono font-semibold text-slate-500 truncate mt-0.5">
                  {task.badge}
                </p>
                <p className="text-[10px] text-slate-400 truncate mt-0.5 hidden sm:block">
                  {task.desc}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── CARD TASK AKTIF ─────────────────────────────────────────────────── */}
      <div className="animate-fade-in space-y-4">
        {/* TASK 1: PRESENSI HARIAN */}
        {activeTask === 'harian' && (
          <div className="space-y-4">
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
                    <option value="ALL">Semua Sesi (Masuk &amp; Pulang)</option>
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

            {/* Ringkasan Angka Rekap 5 Kartu */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="p-3.5 bg-surface border border-border rounded-card flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-content-secondary">Hadir Tepat</p>
                  <p className="text-lg sm:text-xl font-bold text-status-success mt-1">{totalHadir} siswa</p>
                </div>
                <div className="p-2 rounded-xl bg-status-success-bg text-status-success">
                  <UserCheck className="w-4 h-4" />
                </div>
              </div>

              <div className="p-3.5 bg-surface border border-border rounded-card flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-content-secondary">Terlambat</p>
                  <p className="text-lg sm:text-xl font-bold text-status-warning mt-1">{totalTerlambat} siswa</p>
                </div>
                <div className="p-2 rounded-xl bg-status-warning-bg text-status-warning">
                  <Clock className="w-4 h-4" />
                </div>
              </div>

              <div className="p-3.5 bg-surface border border-border rounded-card flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-content-secondary">Izin / Sakit</p>
                  <p className="text-lg sm:text-xl font-bold text-amber-600 mt-1">{totalIzinSakit} siswa</p>
                </div>
                <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
                  <HeartPulse className="w-4 h-4" />
                </div>
              </div>

              <div className="p-3.5 bg-surface border border-border rounded-card flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-content-secondary">Alfa (Absen)</p>
                  <p className="text-lg sm:text-xl font-bold text-red-600 mt-1">{totalAlfa} siswa</p>
                </div>
                <div className="p-2 rounded-xl bg-red-100 text-red-700">
                  <UserMinus className="w-4 h-4" />
                </div>
              </div>

              <div className="col-span-2 md:col-span-1 p-3.5 bg-surface border border-border rounded-card flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-content-secondary">Total Siswa</p>
                  <p className="text-lg sm:text-xl font-bold text-primary-700 mt-1">{filteredDailyRecords.length}</p>
                </div>
                <div className="p-2 rounded-xl bg-primary-50 text-primary-600">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* Tabel Data Rekapitulasi */}
            <Card>
              <CardHeader className="border-b border-border">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle>Rincian Transaksi Presensi Siswa</CardTitle>
                    <CardDescription>
                      Menampilkan {filteredDailyRecords.length} catatan kehadiran siswa sesuai filter tanggal {selectedDate || 'semua'}.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePrintReportPdf(false)}
                      leftIcon={<Printer className="w-3.5 h-3.5 text-emerald-700" />}
                      className="text-xs font-semibold"
                    >
                      Cetak PDF
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleExportExcel(false)}
                      leftIcon={<FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />}
                      className="text-xs font-semibold"
                    >
                      Excel
                    </Button>
                    <span className="text-xs font-semibold text-content-secondary hidden sm:inline ml-1">
                      Total {filteredDailyRecords.length} siswa
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border bg-gray-50/75 text-[11px] font-semibold text-content-secondary uppercase tracking-wider">
                        <th className="py-3 px-4 text-center w-12">#</th>
                        <th className="py-3 px-6">ID &amp; Nama Siswa</th>
                        <th className="py-3 px-6">Kelas</th>
                        <th className="py-3 px-6 text-center">Waktu Masuk</th>
                        <th className="py-3 px-6 text-center">Waktu Pulang</th>
                        <th className="py-3 px-6 text-center">Status</th>
                        <th className="py-3 px-6">Metode</th>
                        <th className="py-3 px-6">Perangkat / Operator</th>
                        <th className="py-3 px-6 text-center">Sync</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredDailyRecords.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-12 text-center text-content-secondary">
                            Tidak ada catatan absensi yang cocok dengan kriteria filter yang dipilih.
                          </td>
                        </tr>
                      ) : (
                        filteredDailyRecords.map((rec, idx) => (
                          <tr key={`${rec.studentId}_${rec.attendanceDate}`} className="hover:bg-gray-50/50">
                            <td className="py-3 px-4 text-center font-mono text-[11px] text-content-secondary">
                              {idx + 1}
                            </td>
                            <td className="py-3 px-6">
                              <p className="font-semibold text-content-primary">{rec.studentName}</p>
                              <p className="text-[11px] font-mono text-content-secondary">{rec.studentId}</p>
                            </td>
                            <td className="py-3 px-6 text-content-secondary font-medium">{rec.className}</td>
                            <td className="py-3 px-6 text-center font-mono font-semibold text-emerald-700">
                              {rec.entryTime ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
                                  {rec.entryTime}
                                </span>
                              ) : (
                                <span className="text-slate-400 italic text-[11px]">—</span>
                              )}
                            </td>
                            <td className="py-3 px-6 text-center font-mono font-semibold text-blue-700">
                              {rec.departureTime ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-[11px] font-bold">
                                  {rec.departureTime}
                                </span>
                              ) : (
                                <span className="text-slate-400 italic text-[11px]">Belum Pulang</span>
                              )}
                            </td>
                            <td className="py-3 px-6 text-center">
                              <Badge attendanceStatus={rec.attendanceStatus} />
                            </td>
                            <td className="py-3 px-6 text-content-secondary font-mono text-[11px]">
                              {rec.method === 'BARCODE_CAMERA'
                                ? 'Kamera'
                                : rec.method === 'USB_SCANNER'
                                ? 'USB'
                                : 'Manual'}
                            </td>
                            <td className="py-3 px-6 text-content-secondary text-[11px]">
                              <p className="font-bold text-slate-700">{rec.deviceId}</p>
                              <p className="text-[10px] text-slate-400">@{rec.operatorId}</p>
                            </td>
                            <td className="py-3 px-6 text-center">
                              <Badge syncStatus={rec.syncStatus} dot />
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
        )}

        {/* TASK 2: REKAPITULASI PER KELAS */}
        {activeTask === 'kelas' && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="border-b border-border bg-emerald-50/30">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
                      <Users className="w-5 h-5 text-[#2e8b38]" />
                    </div>
                    <div>
                      <CardTitle>Rekapitulasi Kehadiran Siswa Per Rombongan Belajar / Kelas</CardTitle>
                      <CardDescription>
                        Ringkasan kehadiran kumulatif tanggal {selectedDate || today} di seluruh kelas MAN 1 Bulukumba.
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="bg-canvas text-xs rounded-button border border-border px-3 py-1.5 text-content-primary focus:outline-none focus:border-primary-600"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border bg-gray-50/75 text-[11px] font-semibold text-content-secondary uppercase tracking-wider">
                        <th className="py-3.5 px-6">Nama Kelas</th>
                        <th className="py-3.5 px-6 text-center">Total Siswa</th>
                        <th className="py-3.5 px-6 text-center text-status-success">Hadir</th>
                        <th className="py-3.5 px-6 text-center text-amber-600">Terlambat</th>
                        <th className="py-3.5 px-6 text-center text-blue-600">Izin/Sakit</th>
                        <th className="py-3.5 px-6 text-center text-red-600">Alfa</th>
                        <th className="py-3.5 px-6">Persentase Kehadiran</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {classSummaries.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-content-secondary">
                            Belum ada data siswa terdaftar. Tarik data siswa dari menu Pengaturan.
                          </td>
                        </tr>
                      ) : (
                        classSummaries.map((c) => (
                          <tr key={c.className} className="hover:bg-gray-50/50">
                            <td className="py-3.5 px-6 font-bold text-content-primary">
                              {c.className}
                            </td>
                            <td className="py-3.5 px-6 text-center font-mono font-semibold">
                              {c.totalSiswa}
                            </td>
                            <td className="py-3.5 px-6 text-center font-bold text-emerald-700">
                              {c.hadir}
                            </td>
                            <td className="py-3.5 px-6 text-center font-bold text-amber-600">
                              {c.terlambat}
                            </td>
                            <td className="py-3.5 px-6 text-center font-bold text-blue-600">
                              {c.izinSakit}
                            </td>
                            <td className="py-3.5 px-6 text-center font-bold text-red-600">
                              {c.alfa}
                            </td>
                            <td className="py-3.5 px-6">
                              <div className="flex items-center gap-3">
                                <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden max-w-[120px]">
                                  <div
                                    className={`h-full rounded-full ${
                                      c.percent >= 90
                                        ? 'bg-[#2e8b38]'
                                        : c.percent >= 75
                                        ? 'bg-amber-500'
                                        : 'bg-red-500'
                                    }`}
                                    style={{ width: `${c.percent}%` }}
                                  />
                                </div>
                                <span className={`text-xs font-bold ${
                                  c.percent >= 90
                                    ? 'text-[#2e8b38]'
                                    : c.percent >= 75
                                    ? 'text-amber-600'
                                    : 'text-red-600'
                                }`}>
                                  {c.percent}%
                                </span>
                              </div>
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
        )}

        {/* TASK 3: PERHATIAN KHUSUS (TERLAMBAT & ALFA) */}
        {activeTask === 'perhatian' && (
          <div className="space-y-4">
            <Card className="border-amber-200">
              <CardHeader className="border-b border-amber-100 bg-amber-50/40">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-amber-100 text-amber-800">
                      <AlertTriangle className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <CardTitle className="text-amber-950">Daftar Siswa Perlu Pembinaan (Terlambat &amp; Alfa)</CardTitle>
                      <CardDescription className="text-amber-800">
                        Khusus untuk koordinasi Guru BK, Wali Kelas, dan Kesiswaan tanggal {selectedDate || today}.
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-200/80 text-amber-900">
                      {attentionTransactions.length} Siswa Perlu Perhatian
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border bg-gray-50/75 text-[11px] font-semibold text-content-secondary uppercase tracking-wider">
                        <th className="py-3 px-6">Waktu Presensi</th>
                        <th className="py-3 px-6">ID &amp; Nama Siswa</th>
                        <th className="py-3 px-6">Kelas</th>
                        <th className="py-3 px-6">Status Kehadiran</th>
                        <th className="py-3 px-6">Perangkat</th>
                        <th className="py-3 px-6">Catatan Operator</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {attentionTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-content-secondary">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                              <p className="font-bold text-slate-700">Alhamdulillah, Tidak Ada Keterlambatan atau Alfa</p>
                              <p className="text-xs text-slate-400">Seluruh siswa yang hadir pada filter ini tepat waktu.</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        attentionTransactions.map((trx) => (
                          <tr key={trx.transactionId} className="hover:bg-amber-50/30">
                            <td className="py-3 px-6 font-mono text-[11px] text-content-secondary">
                              {formatTime(trx.deviceTimestamp)}
                            </td>
                            <td className="py-3 px-6">
                              <p className="font-bold text-content-primary">{trx.studentName}</p>
                              <p className="text-[11px] font-mono text-content-secondary">{trx.studentId}</p>
                            </td>
                            <td className="py-3 px-6 font-semibold text-content-secondary">
                              {trx.className}
                            </td>
                            <td className="py-3 px-6">
                              <Badge attendanceStatus={trx.attendanceStatus} />
                            </td>
                            <td className="py-3 px-6 font-bold text-primary-700">
                              {trx.deviceId}
                            </td>
                            <td className="py-3 px-6 text-content-secondary text-[11px]">
                              {trx.note || 'Tercatat otomatis lewat gerbang'}
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
        )}

        {/* TASK 4: PUSAT CETAK & EKSPOR DOKUMEN */}
        {activeTask === 'ekspor' && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="border-b border-border bg-emerald-50/30">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-800">
                    <FileSpreadsheet className="w-5 h-5 text-[#2e8b38]" />
                  </div>
                  <div>
                    <CardTitle>Pusat Cetak &amp; Ekspor Dokumen Resmi Madrasah</CardTitle>
                    <CardDescription>
                      Unduh dan cetak rekapitulasi presensi harian maupun bulanan untuk pertanggungjawaban dinas.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5 sm:p-6 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Opsi 1: Cetak Laporan Format Resmi */}
                  <div className="p-4 rounded-2xl border border-border bg-surface flex flex-col justify-between space-y-3 hover:border-emerald-300 transition-all">
                    <div>
                      <div className="w-9 h-9 rounded-xl bg-emerald-50 text-[#2e8b38] flex items-center justify-center mb-2">
                        <Printer className="w-5 h-5" />
                      </div>
                      <h4 className="text-xs font-bold text-slate-800">Cetak Laporan Siap Tanda Tangan</h4>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                        Membuka dokumen cetak PDF resmi dengan Kop Madrasah dan kolom tanda tangan Kepala Madrasah &amp; Kesiswaan.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePrintReportPdf(true)}
                      leftIcon={<Printer className="w-4 h-4 text-emerald-700" />}
                      className="w-full text-xs font-bold"
                    >
                      Cetak Laporan Siap Tanda Tangan
                    </Button>
                  </div>

                  {/* Opsi 2: Ekspor Excel dari Database Server */}
                  <div className="p-4 rounded-2xl border border-border bg-surface flex flex-col justify-between space-y-3 hover:border-emerald-300 transition-all">
                    <div>
                      <div className="w-9 h-9 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center mb-2">
                        <FileSpreadsheet className="w-5 h-5" />
                      </div>
                      <h4 className="text-xs font-bold text-slate-800">Ekspor Excel dari Database Server</h4>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                        Unduh spreadsheet lengkap langsung dari database MySQL server madrasah (sesuai filter tanggal &amp; kelas).
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={handleExportFromMySQL}
                      leftIcon={<Download className="w-4 h-4" />}
                      className="w-full text-xs font-bold"
                    >
                      Unduh dari Database Server
                    </Button>
                  </div>

                  {/* Opsi 3: Ekspor Excel / CSV Lokal */}
                  <div className="p-4 rounded-2xl border border-border bg-surface flex flex-col justify-between space-y-3 hover:border-emerald-300 transition-all">
                    <div>
                      <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center mb-2">
                        <Download className="w-5 h-5" />
                      </div>
                      <h4 className="text-xs font-bold text-slate-800">Cadangan Excel / CSV Lokal</h4>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                        Mengekspor seluruh catatan transaksi yang tersimpan di memori browser komputer ini ke format Excel atau CSV.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleExportExcel(true)}
                        leftIcon={<FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />}
                        className="text-xs font-semibold"
                      >
                        Excel (.xlsx)
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleExportCSV(true)}
                        leftIcon={<Download className="w-3.5 h-3.5" />}
                        className="text-xs font-semibold"
                      >
                        CSV
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-center justify-between">
                  <span>Data siap diekspor untuk tanggal <strong>{selectedDate || today}</strong>:</span>
                  <span className="font-bold text-[#2e8b38]">{dailyAttendanceRecords.length} siswa tercatat</span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* ── FOOTER TASK NAVIGATION (Sebelumnya / Selanjutnya) ─────────────── */}
      <div className="flex items-center justify-between pt-2">
        {prevTask ? (
          <button
            type="button"
            onClick={() => setActiveTask(prevTask.id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Sebelumnya: {prevTask.title}</span>
          </button>
        ) : (
          <div />
        )}

        {nextTask ? (
          <button
            type="button"
            onClick={() => setActiveTask(nextTask.id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-[#2e8b38] hover:bg-emerald-50 transition-colors cursor-pointer"
          >
            <span>Selanjutnya: {nextTask.title}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
};


