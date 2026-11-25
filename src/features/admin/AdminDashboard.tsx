import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, bulkMarkAttendanceForUnrecorded, cleanupDuplicateTransactions } from '../../db/attendanceDb';
import { checkIsDayOff, addCustomHoliday, removeCustomHoliday } from '../../services/holidayService';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { 
  Users, 
  UserCheck, 
  Clock, 
  UserX, 
  Monitor, 
  ArrowUpRight, 
  CheckCircle2, 
  AlertTriangle, 
  HeartPulse, 
  UserMinus,
  Calendar,
  Info,
  ScanLine,
  FileSpreadsheet,
  Settings,
  Sparkles,
  TrendingUp,
  Activity,
  RefreshCw,
  Search,
  Phone,
  Download,
  FileText,
  Printer
} from 'lucide-react';
import { formatTime, formatDate, getLocalDateString } from '../../lib/utils';
import { syncPendingTransactions, fetchAttendanceTransactionsFromServer, fetchMasterStudentsFromSheets } from '../../services/syncService';
import { Swal } from '../../lib/swal';
import type { DeviceId, UserAccount, Student, AttendanceTransaction } from '../../types';

export interface AdminDashboardProps {
  currentDeviceId: DeviceId;
  onNavigateToTab: (tabId: string) => void;
  currentUser?: UserAccount | null;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currentDeviceId,
  onNavigateToTab,
  currentUser,
}) => {
  const allStudents = useLiveQuery(() => db.students.filter((s) => s.isActive).toArray(), []) || [];
  const totalStudents = allStudents.length;
  
  const today = getLocalDateString();
  const allTodayTransactions = useLiveQuery(
    () => db.transactions.where('attendanceDate').equals(today).toArray(),
    [today]
  ) || [];

  const morningTransactions = useMemo(() => {
    // Deduplikasi ketat per studentId agar transaksi ganda (lokal + server) tidak dihitung 2x
    const map = new Map<string, AttendanceTransaction>();
    allTodayTransactions
      .filter((t) => t.attendanceType === 'MASUK')
      .forEach((t) => {
        const existing = map.get(t.studentId);
        if (!existing) {
          map.set(t.studentId, t);
        } else if (existing.attendanceStatus === 'ALFA' && t.attendanceStatus !== 'ALFA') {
          // Utamakan status kehadiran riil dibanding status ALFA
          map.set(t.studentId, t);
        } else if (t.syncStatus === 'SYNCED' && existing.syncStatus !== 'SYNCED') {
          map.set(t.studentId, t);
        }
      });
    return Array.from(map.values());
  }, [allTodayTransactions]);
  const recordedStudentIds = useMemo(
    () => new Set(morningTransactions.map((t) => t.studentId)),
    [morningTransactions]
  );

  const presentCount = useMemo(
    () => morningTransactions.filter((t) => t.attendanceStatus === 'HADIR').length,
    [morningTransactions]
  );
  const lateCount = useMemo(
    () => morningTransactions.filter((t) => t.attendanceStatus === 'TERLAMBAT').length,
    [morningTransactions]
  );
  const excuseCount = useMemo(
    () => morningTransactions.filter((t) => ['IZIN', 'SAKIT', 'BK'].includes(t.attendanceStatus)).length,
    [morningTransactions]
  );
  const alfaCount = useMemo(
    () => morningTransactions.filter((t) => t.attendanceStatus === 'ALFA').length,
    [morningTransactions]
  );
  const unrecordedStudents = useMemo(
    () => allStudents.filter((s) => !recordedStudentIds.has(s.id)),
    [allStudents, recordedStudentIds]
  );
  const unrecordedCount = unrecordedStudents.length;

  // Persentase Kehadiran
  const attendedCount = presentCount + lateCount;
  const attendanceRate = totalStudents > 0 ? Math.round((attendedCount / totalStudents) * 100) : 0;
  const presentPercent = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;
  const latePercent = totalStudents > 0 ? Math.round((lateCount / totalStudents) * 100) : 0;
  const excusePercent = totalStudents > 0 ? Math.round((excuseCount / totalStudents) * 100) : 0;
  const alfaPercent = totalStudents > 0 ? Math.round((alfaCount / totalStudents) * 100) : 0;

  // Sinkronisasi realtime: Tarik presensi terbaru dari server MySQL (termasuk yang di-scan dari HP)
  const [isRefreshingServer, setIsRefreshingServer] = useState(false);

  const handleRefreshServerData = useCallback(async (showToast = false) => {
    setIsRefreshingServer(true);
    try {
      const res = await fetchAttendanceTransactionsFromServer(today);
      fetchMasterStudentsFromSheets().catch(() => {});
      if (res.success && showToast) {
        Swal.toast(`Data presensi tersinkronkan (${res.count} transaksi)`, 'success');
      }
    } catch (_) {
    } finally {
      setIsRefreshingServer(false);
    }
  }, [today]);

  useEffect(() => {
    // Bersihkan transaksi duplikat di IndexedDB browser
    cleanupDuplicateTransactions().catch(() => {});

    // Tarik data siswa terbaru & presensi hari ini saat dashboard admin dimuat
    fetchMasterStudentsFromSheets().catch(() => {});
    handleRefreshServerData(false);

    // Polling latar belakang tiap 15 detik agar absensi & data siswa dari HP masuk ke PC
    let tick = 0;
    const interval = setInterval(() => {
      fetchAttendanceTransactionsFromServer(today).catch(() => {});
      tick++;
      if (tick % 2 === 0) {
        fetchMasterStudentsFromSheets().catch(() => {});
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [today, handleRefreshServerData]);

  // =========================================================
  // State Modal Rincian Siswa per Kotak Dashboard (Interactive Drilldown)
  // =========================================================
  type DetailCategory = 'TOTAL' | 'HADIR' | 'TERLAMBAT' | 'IZIN' | 'ALFA' | 'BELUM' | null;
  const [activeCategory, setActiveCategory] = useState<DetailCategory>(null);
  const [categorySearch, setCategorySearch] = useState('');

  // Peta data master siswa untuk informasi kontak dan wali
  const studentMap = useMemo(() => {
    const map = new Map<string, Student>();
    allStudents.forEach((s) => map.set(s.id, s));
    return map;
  }, [allStudents]);

  // Ekstraksi data siswa sesuai kotak yang diklik
  const categoryData = useMemo(() => {
    if (!activeCategory) return [];

    let list: {
      studentId: string;
      studentName: string;
      className: string;
      status: string;
      time?: string;
      method?: string;
      deviceId?: string;
      note?: string;
      phone?: string;
      parentName?: string;
    }[] = [];

    if (activeCategory === 'TOTAL') {
      // Optimalkan kategori TOTAL: Buat map transactionByStudent sekali untuk O(1) lookup
      const txMap = new Map<string, typeof morningTransactions[0]>();
      morningTransactions.forEach((t) => txMap.set(t.studentId, t));

      list = allStudents.map((s) => {
        const tx = txMap.get(s.id);
        return {
          studentId: s.id,
          studentName: s.name,
          className: s.className,
          status: tx ? tx.attendanceStatus : 'BELUM SCAN',
          time: tx ? formatTime(tx.deviceTimestamp) : undefined,
          method: tx?.method,
          deviceId: tx?.deviceId,
          phone: s.whatsappNumber,
          parentName: s.parentName,
        };
      });
    } else if (activeCategory === 'HADIR') {
      list = morningTransactions
        .filter((t) => t.attendanceStatus === 'HADIR')
        .map((t) => {
          const s = studentMap.get(t.studentId);
          return {
            studentId: t.studentId,
            studentName: t.studentName || s?.name || 'Siswa',
            className: t.className || s?.className || '-',
            status: 'HADIR',
            time: formatTime(t.deviceTimestamp),
            method: t.method,
            deviceId: t.deviceId,
            phone: s?.whatsappNumber,
            parentName: s?.parentName,
          };
        });
    } else if (activeCategory === 'TERLAMBAT') {
      list = morningTransactions
        .filter((t) => t.attendanceStatus === 'TERLAMBAT')
        .map((t) => {
          const s = studentMap.get(t.studentId);
          return {
            studentId: t.studentId,
            studentName: t.studentName || s?.name || 'Siswa',
            className: t.className || s?.className || '-',
            status: 'TERLAMBAT',
            time: formatTime(t.deviceTimestamp),
            method: t.method,
            deviceId: t.deviceId,
            note: t.note || 'Tiba setelah batas waktu pagi',
            phone: s?.whatsappNumber,
            parentName: s?.parentName,
          };
        });
    } else if (activeCategory === 'IZIN') {
      list = morningTransactions
        .filter((t) => ['IZIN', 'SAKIT', 'BK'].includes(t.attendanceStatus))
        .map((t) => {
          const s = studentMap.get(t.studentId);
          return {
            studentId: t.studentId,
            studentName: t.studentName || s?.name || 'Siswa',
            className: t.className || s?.className || '-',
            status: t.attendanceStatus,
            time: formatTime(t.deviceTimestamp),
            method: t.method,
            deviceId: t.deviceId,
            note: t.note || 'Dispensasi / Keterangan',
            phone: s?.whatsappNumber,
            parentName: s?.parentName,
          };
        });
    } else if (activeCategory === 'ALFA') {
      list = morningTransactions
        .filter((t) => t.attendanceStatus === 'ALFA')
        .map((t) => {
          const s = studentMap.get(t.studentId);
          return {
            studentId: t.studentId,
            studentName: t.studentName || s?.name || 'Siswa',
            className: t.className || s?.className || '-',
            status: 'ALFA',
            time: formatTime(t.deviceTimestamp),
            method: t.method,
            deviceId: t.deviceId,
            note: t.note || 'Tidak hadir tanpa keterangan',
            phone: s?.whatsappNumber,
            parentName: s?.parentName,
          };
        });
    } else if (activeCategory === 'BELUM') {
      list = unrecordedStudents.map((s) => ({
        studentId: s.id,
        studentName: s.name,
        className: s.className,
        status: 'BELUM SCAN',
        phone: s.whatsappNumber,
        parentName: s.parentName,
        note: 'Belum scan masuk hari ini',
      }));
    }

    if (!categorySearch.trim()) return list;
    const term = categorySearch.toLowerCase().trim();
    return list.filter(
      (item) =>
        item.studentName.toLowerCase().includes(term) ||
        item.studentId.toLowerCase().includes(term) ||
        item.className.toLowerCase().includes(term) ||
        (item.phone && item.phone.includes(term))
    );
  }, [activeCategory, allStudents, morningTransactions, studentMap, unrecordedStudents, categorySearch]);

  const categoryMeta = useMemo(() => {
    switch (activeCategory) {
      case 'TOTAL':
        return {
          title: 'Total Siswa Aktif',
          desc: `Total ${totalStudents} siswa terdaftar aktif`,
          count: totalStudents,
          badgeColor: 'bg-emerald-50 text-emerald-700',
        };
      case 'HADIR':
        return {
          title: 'Hadir Tepat Waktu',
          desc: `${presentCount} siswa scan masuk tepat waktu`,
          count: presentCount,
          badgeColor: 'bg-emerald-100 text-emerald-700',
        };
      case 'TERLAMBAT':
        return {
          title: 'Siswa Terlambat',
          desc: `${lateCount} siswa scan lewat batas waktu`,
          count: lateCount,
          badgeColor: 'bg-amber-100 text-amber-700',
        };
      case 'IZIN':
        return {
          title: 'Izin / Sakit / Tugas',
          desc: `${excuseCount} siswa memiliki keterangan`,
          count: excuseCount,
          badgeColor: 'bg-blue-50 text-blue-700',
        };
      case 'ALFA':
        return {
          title: 'Siswa Alfa',
          desc: `${alfaCount} siswa tidak hadir tanpa keterangan`,
          count: alfaCount,
          badgeColor: 'bg-rose-100 text-rose-700',
        };
      case 'BELUM':
        return {
          title: 'Belum Scan Masuk',
          desc: `${unrecordedCount} siswa belum scan`,
          count: unrecordedCount,
          badgeColor: 'bg-slate-100 text-slate-700',
        };
      default:
        return null;
    }
  }, [activeCategory, totalStudents, presentCount, lateCount, excuseCount, alfaCount, unrecordedCount]);

  // -------------------------------------------------------
  // Export Data Kategori Aktif: CSV
  // -------------------------------------------------------
  const handleExportCategoryCsv = () => {
    if (!categoryData.length || !activeCategory) {
      Swal.toast('Tidak ada data siswa untuk diekspor.', 'warning');
      return;
    }
    const catTitle = categoryMeta?.title || activeCategory;
    const headers = ['No', 'ID', 'Nama Siswa', 'Kelas', 'Status Presensi', 'Waktu Masuk', 'No WA Wali', 'Nama Wali', 'Keterangan'];
    const rows = categoryData.map((item, idx) => [
      idx + 1,
      `"${item.studentId}"`,
      `"${(item.studentName || '').replace(/"/g, '""')}"`,
      `"${(item.className || '').replace(/"/g, '""')}"`,
      `"${item.status}"`,
      `"${item.time || '-'}"`,
      `"${item.phone || '-'}"`,
      `"${(item.parentName || '').replace(/"/g, '""')}"`,
      `"${(item.note || '').replace(/"/g, '""')}"`,
    ].join(','));

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Presensi_${catTitle.replace(/\s+/g, '_')}_${today}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    Swal.toast(`Data ${catTitle} berhasil diekspor ke CSV!`, 'success');
  };

  // -------------------------------------------------------
  // Export Data Kategori Aktif: Excel (.xlsx via SheetJS / CSV fallback)
  // -------------------------------------------------------
  const handleExportCategoryExcel = () => {
    if (!categoryData.length || !activeCategory) {
      Swal.toast('Tidak ada data siswa untuk diekspor.', 'warning');
      return;
    }
    const xlsxLib = (window as any).XLSX;
    if (!xlsxLib) {
      handleExportCategoryCsv();
      return;
    }

    try {
      const catTitle = categoryMeta?.title || activeCategory;
      const todayFormatted = new Date().toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

      const dataRows: any[][] = [
        ['LAPORAN REKAPITULASI PRESENSI SISWA'],
        ['MADRASAH ALIYAH NEGERI 1 BULUKUMBA'],
        ['Jalan K.H. Abd Karim Nomor 67 Tanete Bulukumba (0413) 2586253'],
        [],
        ['Kategori', catTitle, '', 'Tanggal', todayFormatted],
        ['Total Siswa', `${categoryData.length} Siswa`, '', 'Status', activeCategory],
        [],
        ['No', 'ID', 'Nama Siswa', 'Kelas', 'Status Presensi', 'Waktu Masuk', 'No WA Wali', 'Nama Wali', 'Keterangan'],
      ];

      categoryData.forEach((item, idx) => {
        dataRows.push([
          idx + 1,
          item.studentId,
          item.studentName,
          item.className,
          item.status,
          item.time || '-',
          item.phone || '-',
          item.parentName || '-',
          item.note || '-',
        ]);
      });

      const ws = xlsxLib.utils.aoa_to_sheet(dataRows);
      const wb = xlsxLib.utils.book_new();
      xlsxLib.utils.book_append_sheet(wb, ws, catTitle.substring(0, 31));

      ws['!cols'] = [
        { wch: 6 },  // No
        { wch: 14 }, // ID
        { wch: 28 }, // Nama
        { wch: 12 }, // Kelas
        { wch: 16 }, // Status
        { wch: 14 }, // Waktu
        { wch: 16 }, // No WA
        { wch: 22 }, // Nama Wali
        { wch: 30 }, // Catatan
      ];

      xlsxLib.writeFile(wb, `Presensi_${catTitle.replace(/\s+/g, '_')}_${today}.xlsx`);
      Swal.toast(`Data ${catTitle} berhasil diekspor ke Excel (.xlsx)!`, 'success');
    } catch (err) {
      console.error('Export Excel error:', err);
      handleExportCategoryCsv();
    }
  };

  // -------------------------------------------------------
  // Export Data Kategori Aktif: Cetak / Simpan ke PDF
  // -------------------------------------------------------
  const handleExportCategoryPdf = () => {
    if (!categoryData.length || !activeCategory) {
      Swal.toast('Tidak ada data siswa untuk dicetak.', 'warning');
      return;
    }

    const printWin = window.open('', '_blank', 'width=950,height=950');
    if (!printWin) {
      window.print();
      return;
    }

    const catTitle = categoryMeta?.title || activeCategory;
    const todayFormatted = new Date().toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

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

    const rowsHtml = categoryData
      .map((item, idx) => {
        const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
        return `
          <tr style="background-color: ${bg}; border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 7px 8px; text-align: center; font-size: 11px; font-family: monospace;">${idx + 1}</td>
            <td style="padding: 7px 8px; font-size: 11px; font-family: monospace; font-weight: bold;">${item.studentId}</td>
            <td style="padding: 7px 8px; font-size: 11px; font-weight: 600; color: #0f172a;">${item.studentName}</td>
            <td style="padding: 7px 8px; font-size: 11px; color: #334155;">${item.className}</td>
            <td style="padding: 7px 8px; text-align: center;">${statusBadge(item.status)}</td>
            <td style="padding: 7px 8px; font-size: 11px; text-align: center; font-family: monospace;">${item.time || '-'}</td>
            <td style="padding: 7px 8px; font-size: 10px; font-family: monospace; color: #166534;">${item.phone || '-'}</td>
            <td style="padding: 7px 8px; font-size: 10px; color: #475569;">${item.parentName || '-'}</td>
          </tr>
        `;
      })
      .join('');

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Presensi ${catTitle} - MAN 1 Bulukumba</title>
        <style>
          @page { size: A4 portrait; margin: 12mm 10mm; }
          * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { font-family: Arial, Helvetica, sans-serif; background: #ffffff; color: #0f172a; margin: 0; padding: 10px; font-size: 11px; }
          .header { text-align: center; border-bottom: 3px double #0f172a; padding-bottom: 8px; margin-bottom: 12px; }
          .header h1 { font-size: 15px; margin: 0; font-weight: 900; letter-spacing: 0.5px; color: #15803d; }
          .header h2 { font-size: 12px; margin: 3px 0 0; font-weight: bold; }
          .header .address { font-size: 10px; margin: 3px 0 0; color: #334155; }
          .header p { font-size: 10px; margin: 2px 0 0; color: #64748b; }
          .meta { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 11px; background: #f8fafc; padding: 8px 12px; border-radius: 6px; border: 1px solid #e2e8f0; }
          table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
          th { background: #0f172a; color: #ffffff; padding: 7px 8px; font-size: 10.5px; text-align: left; }
          th.center { text-align: center; }
          .footer { margin-top: 18px; display: flex; justify-content: space-between; font-size: 10px; color: #64748b; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>KEMENTERIAN AGAMA REPUBLIK INDONESIA</h1>
          <h2>MADRASAH ALIYAH NEGERI (MAN) 1 BULUKUMBA</h2>
          <p class="address">Jalan K.H. Abd Karim Nomor 67 Tanete Bulukumba (0413) 2586253</p>
          <p>Sistem Presensi Digital &bull; Laporan Rekapitulasi: <strong>${catTitle.toUpperCase()}</strong></p>
        </div>
        <div class="meta">
          <div><strong>Kategori:</strong> ${catTitle} (${categoryData.length} siswa)</div>
          <div><strong>Hari, Tanggal:</strong> ${todayFormatted}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th class="center" style="width: 30px;">#</th>
              <th style="width: 80px;">ID</th>
              <th>Nama Siswa</th>
              <th style="width: 70px;">Kelas</th>
              <th class="center" style="width: 90px;">Status</th>
              <th class="center" style="width: 65px;">Waktu</th>
              <th style="width: 95px;">No WA Wali</th>
              <th style="width: 100px;">Nama Wali</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <div class="footer">
          <div>Dicetak pada: ${new Date().toLocaleString('id-ID')} &bull; Aplikasi Absensi MAN 1 Bulukumba</div>
          <div>Halaman 1 / Dokumen Resmi</div>
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

  const [isAlfaModalOpen, setIsAlfaModalOpen] = useState(false);
  const [isProcessingAlfa, setIsProcessingAlfa] = useState(false);
  const [alfaSuccessMsg, setAlfaSuccessMsg] = useState('');
  
  // State seleksi dispensasi/izin siswa tertentu sebelum tutup Alfa
  const [dispensationStudentIds, setDispensationStudentIds] = useState<string[]>([]);
  const [dispensationReason, setDispensationReason] = useState('Tugas Kegiatan Madrasah / Acara Sekolah');

  // Status hari libur hari ini
  const todayDayOffStatus = checkIsDayOff(today);
  const [, setIsDayOffUpdated] = useState(0);

  // Salam waktu otomatis (Pagi/Siang/Sore/Malam)
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 4 && hour < 11) return 'Selamat Pagi';
    if (hour >= 11 && hour < 15) return 'Selamat Siang';
    if (hour >= 15 && hour < 18) return 'Selamat Sore';
    return 'Selamat Malam';
  }, []);

  // Format tanggal Indonesia
  const formattedToday = useMemo(() => formatDate(today), [today]);

  // Toggle tandai hari ini sebagai Hari Libur / Acara Khusus
  const handleToggleTodayDayOff = async () => {
    const isCurrentlyDayOff = todayDayOffStatus.isDayOff && todayDayOffStatus.type !== 'SUNDAY';
    const confirmed = await Swal.confirm(
      isCurrentlyDayOff ? 'Kembalikan Jadi Hari Belajar?' : 'Tetapkan Libur / Acara Khusus?',
      isCurrentlyDayOff
        ? 'Hari ini akan dikembalikan menjadi Hari Efektif Belajar normal.'
        : 'Hari ini akan ditetapkan sebagai Hari Acara Khusus / Libur Madrasah. Siswa tidak akan dicatat Alfa.',
      isCurrentlyDayOff ? 'Ya, Hari Belajar' : 'Ya, Tetapkan Libur',
      'Batal'
    );
    if (!confirmed) return;

    if (isCurrentlyDayOff) {
      removeCustomHoliday(today);
      Swal.success('Berhasil', 'Hari ini dikembalikan menjadi Hari Efektif Belajar.');
    } else {
      addCustomHoliday({
        date: today,
        name: 'Acara Khusus / Libur Madrasah',
        type: 'SPECIAL_EVENT',
        note: 'Ditetapkan oleh Admin',
      });
      Swal.success('Berhasil', 'Hari ini telah ditetapkan sebagai Hari Acara Khusus / Libur.');
    }
    setIsDayOffUpdated((v) => v + 1);
  };

  const toggleSelectDispensation = (id: string) => {
    setDispensationStudentIds((prev) => 
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Eksekusi penutupan absensi pagi dengan review
  const handleConfirmReviewClosing = async () => {
    const countIzin = dispensationStudentIds.length;
    const countAlfa = unrecordedStudents.length - countIzin;

    const confirmed = await Swal.confirm(
      'Konfirmasi Penutupan Gerbang?',
      `Sistem akan memproses data kehadiran: ${countIzin > 0 ? `${countIzin} siswa dicatat Izin Acara, dan ` : ''}${countAlfa} siswa dicatat Alfa. Tindakan ini akan disinkronkan ke server.`,
      'Ya, Simpan Presensi',
      'Batal'
    );
    if (!confirmed) return;

    setIsProcessingAlfa(true);
    try {
      let msg = '';
      
      // 1. Jika ada siswa yang dipilih tugas/acara sekolah -> catat sebagai IZIN (Dispensasi)
      if (dispensationStudentIds.length > 0) {
        await bulkMarkAttendanceForUnrecorded({
          attendanceDate: today,
          deviceId: currentDeviceId,
          operatorId: currentUser?.username || 'admin',
          operatorName: currentUser?.fullName || 'Super Admin',
          targetStudentIds: dispensationStudentIds,
          status: 'IZIN',
          note: dispensationReason,
        });
        msg += `${dispensationStudentIds.length} siswa dicatat Izin Tugas/Acara. `;
      }

      // 2. Sisanya yang tidak dipilih dan belum hadir -> catat sebagai ALFA
      const remainingUnrecorded = unrecordedStudents.filter((s) => !dispensationStudentIds.includes(s.id));
      if (remainingUnrecorded.length > 0) {
        await bulkMarkAttendanceForUnrecorded({
          attendanceDate: today,
          deviceId: currentDeviceId,
          operatorId: currentUser?.username || 'admin',
          operatorName: currentUser?.fullName || 'Super Admin',
          targetStudentIds: remainingUnrecorded.map((s) => s.id),
          status: 'ALFA',
          note: 'Tidak hadir tanpa keterangan saat sesi pagi ditutup',
        });
        msg += `${remainingUnrecorded.length} siswa dicatat Alfa.`;
      }

      setIsAlfaModalOpen(false);
      setDispensationStudentIds([]);
      setAlfaSuccessMsg(`Penutupan Sesi Berhasil: ${msg}`);
      setTimeout(() => setAlfaSuccessMsg(''), 6000);
      syncPendingTransactions(currentDeviceId).catch(() => {});
    } catch (err) {
      console.error('Gagal memproses penutupan sesi:', err);
      Swal.error('Terjadi Kesalahan', 'Terjadi kesalahan saat memproses data absensi.');
    } finally {
      setIsProcessingAlfa(false);
    }
  };

  // Data transaksi terbaru
  const latestTransactions = useLiveQuery(
    () => db.transactions.orderBy('deviceTimestamp').reverse().limit(10).toArray(),
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
    <div className="space-y-4 sm:space-y-6">
      {/* Notifikasi Sukses Tutup Alfa / Acara Khusus */}
      {alfaSuccessMsg && (
        <div className="p-3.5 sm:p-4 bg-emerald-50 border border-emerald-300 text-emerald-950 rounded-2xl flex items-center justify-between text-xs sm:text-sm font-semibold shadow-xs animate-fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{alfaSuccessMsg}</span>
          </div>
          <button 
            onClick={() => setAlfaSuccessMsg('')} 
            className="text-emerald-700 hover:text-emerald-900 font-bold p-1 rounded-lg"
          >
            ✕
          </button>
        </div>
      )}

      {/* Hero Welcome Card —  Fresh Green */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#1c5e2d] via-[#247539] to-[#2e8b38] text-white p-4 sm:p-6 shadow-sm">
        {/* Subtle curve accents matching  banner */}
        <div className="absolute -right-10 -bottom-10 w-44 h-44 rounded-full bg-white/10 blur-xl pointer-events-none" />
        <div className="absolute right-1/4 -top-8 w-32 h-32 rounded-full bg-emerald-400/15 pointer-events-none" />

        {/* Polka Dots Grid Ornament ( Amber Dots) */}
        <div 
          className="absolute right-32 -bottom-4 w-32 h-24 opacity-25 pointer-events-none hidden md:block"
          style={{
            backgroundImage: 'radial-gradient(circle, #f59e0b 2px, transparent 2px)',
            backgroundSize: '14px 14px'
          }}
        />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 text-[11px] font-bold text-white border border-white/25">
                <Sparkles className="w-3 h-3 text-amber-300" />
                MAN 1 BULUKUMBA
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/15 text-[10px] font-mono font-bold text-emerald-100 border border-white/15">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse"></span>
                {currentDeviceId}
              </span>
            </div>

            <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-white">
              {greeting}, {currentUser?.fullName || 'Administrator'}!
            </h1>

            <p className="text-xs sm:text-sm text-emerald-100 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-200 shrink-0" />
              <span>{formattedToday}</span>
            </p>
          </div>

          {/* Quick CTA Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-1 md:pt-0">
            {/* Tombol Aksen Kuning/Oranye Khas Edlink (Mulai Sekarang / Buka Pemindaian) */}
            <button
              onClick={() => onNavigateToTab('scan')}
              className="w-full sm:w-auto px-4 py-2.5 sm:px-5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md shadow-amber-500/25"
            >
              <ScanLine className="w-4 h-4 text-white" />
              <span>Buka Pemindaian</span>
              <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-white text-xs">
                <ArrowUpRight className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Shortcut Tombol Cepat di Mobile */}
      <div className="grid grid-cols-3 gap-2 sm:hidden">
        <button
          onClick={() => onNavigateToTab('students')}
          className="flex flex-col items-center justify-center p-3 rounded-xl bg-white border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 transition-colors text-center shadow-xs"
        >
          <div className="p-2 rounded-xl bg-emerald-50 text-emerald-800 mb-1.5 border border-emerald-200">
            <Users className="w-4 h-4" />
          </div>
          <span className="text-[10px] font-semibold text-slate-700">Siswa</span>
        </button>

        <button
          onClick={() => onNavigateToTab('reports')}
          className="flex flex-col items-center justify-center p-3 rounded-xl bg-white border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 transition-colors text-center shadow-xs"
        >
          <div className="p-2 rounded-xl bg-amber-100 text-amber-700 mb-1.5">
            <FileSpreadsheet className="w-4 h-4" />
          </div>
          <span className="text-[10px] font-semibold text-slate-700">Laporan</span>
        </button>

        <button
          onClick={() => onNavigateToTab('settings')}
          className="flex flex-col items-center justify-center p-3 rounded-xl bg-white border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 transition-colors text-center shadow-xs"
        >
          <div className="p-2 rounded-xl bg-slate-100 text-slate-600 mb-1.5">
            <Settings className="w-4 h-4" />
          </div>
          <span className="text-[10px] font-semibold text-slate-700">Pengaturan</span>
        </button>
      </div>

      {/* Progress Bar Tingkat Kehadiran */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-900">Tingkat Kehadiran Hari Ini</h3>
              <p className="text-[11px] text-slate-500">{attendedCount} dari {totalStudents} siswa hadir</p>
            </div>
          </div>
          <span className="text-lg font-bold text-emerald-700">{attendanceRate}%</span>
        </div>

        {/* Multi-segment Progress Bar */}
        <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
          {presentPercent > 0 && (
            <div style={{ width: `${presentPercent}%` }} className="bg-emerald-500 transition-all duration-500" title={`Hadir Tepat: ${presentPercent}%`} />
          )}
          {latePercent > 0 && (
            <div style={{ width: `${latePercent}%` }} className="bg-amber-400 transition-all duration-500" title={`Terlambat: ${latePercent}%`} />
          )}
          {excusePercent > 0 && (
            <div style={{ width: `${excusePercent}%` }} className="bg-sky-400 transition-all duration-500" title={`Izin/Sakit: ${excusePercent}%`} />
          )}
          {alfaPercent > 0 && (
            <div style={{ width: `${alfaPercent}%` }} className="bg-rose-500 transition-all duration-500" title={`Alfa: ${alfaPercent}%`} />
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-600">
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"></span>Hadir ({presentCount})</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400"></span>Terlambat ({lateCount})</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-sky-400"></span>Izin/Sakit ({excuseCount})</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500"></span>Alfa ({alfaCount})</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-300"></span>Belum Scan ({unrecordedCount})</div>
        </div>
      </div>

      {/* Grid 6 Kartu Status Kehadiran */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
        {/* 1. Total Siswa */}
        <div
          onClick={() => setActiveCategory('TOTAL')}
          className="p-3 sm:p-4 rounded-xl bg-white border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/25 cursor-pointer transition-colors duration-150 group"
          title="Klik untuk melihat seluruh daftar siswa aktif"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium text-slate-500 group-hover:text-emerald-700">Total Siswa</span>
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <Users className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900">{totalStudents}</p>
          <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
            <span>Siswa Aktif</span>
            <span className="text-emerald-600 group-hover:underline">Lihat →</span>
          </div>
        </div>

        {/* 2. Hadir Tepat */}
        <div
          onClick={() => setActiveCategory('HADIR')}
          className="p-3 sm:p-4 rounded-xl bg-white border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/30 cursor-pointer transition-colors duration-150 group"
          title="Klik untuk melihat siswa yang hadir tepat waktu"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium text-slate-500 group-hover:text-emerald-700">Hadir Tepat</span>
            <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <UserCheck className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-emerald-600">{presentCount}</p>
          <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
            <span>≤ 07:15 WITA</span>
            <span className="text-emerald-600 group-hover:underline">{presentPercent}% →</span>
          </div>
        </div>

        {/* 3. Terlambat */}
        <div
          onClick={() => setActiveCategory('TERLAMBAT')}
          className="p-3 sm:p-4 rounded-xl bg-white border border-slate-200 hover:border-amber-400 hover:bg-amber-50/30 cursor-pointer transition-colors duration-150 group"
          title="Klik untuk melihat daftar siswa terlambat"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium text-slate-500 group-hover:text-amber-700">Terlambat</span>
            <div className="p-1.5 rounded-lg bg-amber-100 text-amber-600 group-hover:bg-amber-500 group-hover:text-white transition-colors">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-amber-600">{lateCount}</p>
          <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
            <span>&gt; 07:15 WITA</span>
            <span className="text-amber-600 group-hover:underline">{latePercent}% →</span>
          </div>
        </div>

        {/* 4. Izin / Sakit */}
        <div
          onClick={() => setActiveCategory('IZIN')}
          className="p-3 sm:p-4 rounded-xl bg-white border border-slate-200 hover:border-sky-400 hover:bg-sky-50/30 cursor-pointer transition-colors duration-150 group"
          title="Klik untuk melihat siswa dengan izin/sakit"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium text-slate-500 group-hover:text-sky-700">Izin / Sakit</span>
            <div className="p-1.5 rounded-lg bg-sky-100 text-sky-600 group-hover:bg-sky-500 group-hover:text-white transition-colors">
              <HeartPulse className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-sky-600">{excuseCount}</p>
          <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
            <span>Ada Surat</span>
            <span className="text-sky-600 group-hover:underline">{excusePercent}% →</span>
          </div>
        </div>

        {/* 5. Alfa */}
        <div
          onClick={() => setActiveCategory('ALFA')}
          className="p-3 sm:p-4 rounded-xl bg-white border border-slate-200 hover:border-rose-400 hover:bg-rose-50/30 cursor-pointer transition-colors duration-150 group"
          title="Klik untuk melihat siswa yang tercatat Alfa"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium text-slate-500 group-hover:text-rose-700">Alfa (Absen)</span>
            <div className="p-1.5 rounded-lg bg-rose-100 text-rose-600 group-hover:bg-rose-500 group-hover:text-white transition-colors">
              <UserMinus className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-rose-600">{alfaCount}</p>
          <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
            <span>Tanpa Berita</span>
            <span className="text-rose-600 group-hover:underline">{alfaPercent}% →</span>
          </div>
        </div>

        {/* 6. Belum Scan */}
        <div
          onClick={() => setActiveCategory('BELUM')}
          className="p-3 sm:p-4 rounded-xl bg-white border border-slate-200 hover:border-slate-400 hover:bg-slate-50/50 cursor-pointer transition-colors duration-150 group"
          title="Klik untuk melihat daftar siswa belum scan"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium text-slate-500 group-hover:text-slate-900">Belum Scan</span>
            <div className="p-1.5 rounded-lg bg-slate-100 text-slate-500 group-hover:bg-slate-700 group-hover:text-white transition-colors">
              <UserX className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-700">{unrecordedCount}</p>
          <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
            <span>Antrean Pagi</span>
            <span className="text-slate-600 group-hover:underline">Lihat →</span>
          </div>
        </div>
      </div>

      {/* Banner Penutupan Gerbang Pagi & Tindakan Konfirmasi ALFA / Dispensasi Acara */}
      {todayDayOffStatus.isDayOff ? (
        <div className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 text-emerald-900 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700 shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-emerald-950">
                Status Hari Ini: {todayDayOffStatus.reason}
              </h4>
              <p className="text-xs text-emerald-800 mt-0.5">
                {todayDayOffStatus.type === 'SUNDAY'
                  ? 'Hari Minggu adalah hari libur rutin. Siswa tidak dihitung Alfa dan scanner libur.'
                  : 'Hari ini telah ditandai sebagai Acara Khusus / Libur Madrasah. Siswa tidak akan dicatat Alfa.'}
              </p>
            </div>
          </div>
          {todayDayOffStatus.type !== 'SUNDAY' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleToggleTodayDayOff}
              className="text-xs border-emerald-300 text-emerald-800 hover:bg-emerald-100"
            >
              Ubah Jadi Hari Masuk Normal
            </Button>
          )}
        </div>
      ) : unrecordedCount > 0 ? (
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-amber-100 text-amber-800 shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-950">
                Pintu Gerbang Pagi Ditutup? Ada {unrecordedCount} Siswa Belum Absen
              </h4>
              <p className="text-xs text-amber-800 mt-1 max-w-3xl leading-relaxed">
                Sebelum menandai Alfa, Anda dapat memilih siswa yang sedang <strong>Tugas Acara Madrasah / Lomba</strong> agar otomatis dicatat <em>Izin Tugas</em> dan tidak terkena Alfa.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Button
              type="button"
              variant="outline"
              onClick={handleToggleTodayDayOff}
              className="flex-1 md:flex-none text-xs border-amber-300 text-amber-900 hover:bg-amber-100"
              title="Jika ada acara madrasah dan libur mendadak"
            >
              Set Libur
            </Button>
            <Button
              type="button"
              onClick={() => {
                setDispensationStudentIds([]);
                setIsAlfaModalOpen(true);
              }}
              className="flex-1 md:flex-none bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm"
            >
              Review &amp; Tutup Pagi ({unrecordedCount})
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-3.5 rounded-2xl border border-emerald-200 bg-emerald-50/70 text-emerald-900 text-xs flex items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>Lengkap:</strong> Seluruh <strong>{totalStudents} siswa aktif</strong> sudah memiliki status kehadiran hari ini (Hadir, Terlambat, Izin, Sakit, atau Alfa).
            </span>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 shrink-0">100% Selesai</span>
        </div>
      )}

      {/* Modal Konfirmasi Penutupan Pagi & Review Dispensasi / Alfa */}
      <Modal
        isOpen={isAlfaModalOpen}
        onClose={() => setIsAlfaModalOpen(false)}
        title="Review Penutupan Sesi Absensi Pagi"
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 flex items-start gap-2.5">
            <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">
                Pilah Siswa Sebelum Penutupan Sesi:
              </p>
              <p className="mt-0.5 text-amber-800 leading-relaxed text-[11px]">
                Centang nama siswa yang <strong>mengikuti lomba / tugas acara madrasah</strong> agar dicatat <strong>Izin Tugas</strong>. Siswa yang tidak dicentang akan otomatis dicatat sebagai <strong>ALFA</strong>.
              </p>
            </div>
          </div>

          {/* Form alasan dispensasi jika ada siswa yang dicentang */}
          {dispensationStudentIds.length > 0 && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1.5">
              <label className="font-bold text-emerald-950 flex items-center justify-between">
                <span>Alasan / Keterangan Tugas ({dispensationStudentIds.length} Siswa Terpilih):</span>
                <span className="text-[10px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full font-bold">Dicatat Izin Acara</span>
              </label>
              <input
                type="text"
                value={dispensationReason}
                onChange={(e) => setDispensationReason(e.target.value)}
                placeholder="Contoh: Tugas Paduan Suara, Lomba KSM, Petugas Upacara..."
                className="w-full text-xs px-3 py-1.5 rounded-lg border border-emerald-300 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#2e8b38]"
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="font-bold text-content-primary">
                Daftar Belum Absen ({unrecordedCount} Siswa):
              </p>
              <span className="text-[11px] text-slate-500">
                {dispensationStudentIds.length} Izin Acara &bull; {unrecordedCount - dispensationStudentIds.length} Alfa
              </span>
            </div>

            <div className="max-h-56 overflow-y-auto border border-border rounded-xl divide-y divide-border bg-canvas">
              {unrecordedStudents.map((s, idx) => {
                const isSelected = dispensationStudentIds.includes(s.id);
                return (
                  <div 
                    key={s.id} 
                    onClick={() => toggleSelectDispensation(s.id)}
                    className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected ? 'bg-emerald-50/80 hover:bg-emerald-100/60' : 'hover:bg-surface'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}} // dikendalikan oleh parent onClick
                        className="rounded border-slate-300 text-[#2e8b38] focus:ring-[#2e8b38] pointer-events-none"
                      />
                      <span className="text-[11px] font-mono text-content-secondary w-4 text-right">
                        {idx + 1}.
                      </span>
                      <div>
                        <p className={`font-semibold ${isSelected ? 'text-emerald-900' : 'text-content-primary'}`}>{s.name}</p>
                        <p className="text-[10px] text-content-secondary font-mono">{s.id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                        {s.className}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isSelected ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-700'
                      }`}>
                        {isSelected ? 'Izin Acara' : 'Akan Alfa'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-content-secondary mt-1.5 italic">
              *Tips: Klik nama siswa untuk menandai mereka sedang bertugas dalam kegiatan madrasah.
            </p>
          </div>

          <div className="pt-3 border-t border-border flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAlfaModalOpen(false)}
              disabled={isProcessingAlfa}
              className="text-xs"
            >
              Batal
            </Button>
            <Button
              type="button"
              onClick={handleConfirmReviewClosing}
              disabled={isProcessingAlfa}
              className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs"
            >
              {isProcessingAlfa 
                ? 'Memproses...' 
                : dispensationStudentIds.length > 0
                ? `Simpan (${dispensationStudentIds.length} Izin, ${unrecordedCount - dispensationStudentIds.length} Alfa)`
                : `Set Seluruh ${unrecordedCount} Siswa Jadi Alfa`}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Monitoring 3 Perangkat Komputer (PC-01, PC-02, PC-03) — Khusus Super Admin */}
      {currentUser?.role === 'SUPER_ADMIN' && (
        <Card className="rounded-2xl border-slate-200 shadow-xs overflow-hidden">
          <CardHeader className="py-3.5 px-4 sm:px-6 bg-slate-50/60 border-b border-slate-100 flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm sm:text-base font-bold text-slate-900">
                Status 3 Perangkat Absensi
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Pemantauan sinkronisasi dan aktivitas masing-masing komputer operator.
              </CardDescription>
            </div>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-full shrink-0">
              3 Komputer Terdaftar
            </span>
          </CardHeader>
          <CardContent className="p-3.5 sm:p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
              {devices.map((device) => {
                const deviceTrx = allTodayTransactions.filter((t) => t.deviceId === device.id);
                const devicePending = deviceTrx.filter((t) => t.syncStatus === 'PENDING').length;

                return (
                  <div
                    key={device.id}
                    className={`p-3.5 sm:p-4 rounded-2xl border transition-all ${
                      device.isCurrent
                        ? 'border-emerald-500 bg-emerald-50/40 shadow-xs ring-1 ring-emerald-500/20'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className={`p-2 rounded-xl ${device.isCurrent ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                          <Monitor className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-xs font-bold text-slate-900">{device.id}</h4>
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Online" />
                          </div>
                          <p className="text-[10px] text-slate-500">{device.location}</p>
                        </div>
                      </div>
                      {device.isCurrent && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white shadow-2xs">
                          PC Ini
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5 pt-2.5 border-t border-slate-100 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Operator:</span>
                        <span className="font-semibold text-slate-800">@{device.operator}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Scan Hari Ini:</span>
                        <span className="font-bold text-slate-900">{deviceTrx.length} siswa</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Antrean Pending:</span>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                          devicePending > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {devicePending > 0 ? `${devicePending} pending` : 'Sinkron 100%'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Feed Aktivitas Absensi Terbaru (Tampilan Card Responsif untuk Mobile + Tabel untuk Desktop) */}
      <Card className="rounded-2xl border-slate-200 shadow-xs overflow-hidden">
        <CardHeader className="py-3.5 px-4 sm:px-6 bg-slate-50/60 border-b border-slate-100 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-sm sm:text-base font-bold text-slate-900">
                Aktivitas Absensi Terbaru
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Transaksi kehadiran terakhir yang masuk dari scanner lokal maupun sinkronisasi.
              </CardDescription>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            {latestTransactions.length} Terbaru
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {latestTransactions.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400 space-y-1">
              <ScanLine className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold text-slate-600">Belum Ada Catatan Transaksi</p>
              <p className="text-[11px]">Silakan mulai scan kartu barcode siswa di menu Pemindaian.</p>
            </div>
          ) : (
            <>
              {/* TAMPILAN MOBILE (sm:hidden): List Card Interaktif & Ramah Jempol */}
              <div className="sm:hidden divide-y divide-slate-100">
                {latestTransactions.map((trx) => {
                  const initial = (trx.studentName || 'S').charAt(0).toUpperCase();
                  return (
                    <div key={trx.transactionId} className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Avatar Inisial */}
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-2xs">
                          {initial}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-xs text-slate-900 truncate">
                            {trx.studentName || trx.studentId}
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                            {trx.className} &bull; <span className="font-mono text-slate-600">{trx.studentId}</span>
                          </p>
                          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-400">
                            <Clock className="w-3 h-3" />
                            <span>{formatTime(trx.deviceTimestamp)}</span>
                            <span>&bull;</span>
                            <span className="font-semibold text-emerald-700">{trx.deviceId}</span>
                          </div>
                        </div>
                      </div>

                      {/* Status Badges */}
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <Badge attendanceStatus={trx.attendanceStatus} />
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          trx.attendanceType === 'MASUK' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}>
                          {trx.attendanceType}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* TAMPILAN TABLE DESKTOP (hidden sm:block) */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-6">Waktu</th>
                      <th className="py-3 px-6">Siswa</th>
                      <th className="py-3 px-6">Kelas</th>
                      <th className="py-3 px-6">Sesi</th>
                      <th className="py-3 px-6">Status</th>
                      <th className="py-3 px-6">Perangkat</th>
                      <th className="py-3 px-6">Sync</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {latestTransactions.map((trx) => (
                      <tr key={trx.transactionId} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-6 font-mono text-[11px] text-slate-500 font-semibold">
                          {formatTime(trx.deviceTimestamp)}
                        </td>
                        <td className="py-3 px-6">
                          <p className="font-bold text-slate-900">{trx.studentName}</p>
                          <p className="text-[11px] font-mono text-slate-500">{trx.studentId}</p>
                        </td>
                        <td className="py-3 px-6 text-slate-600 font-medium">{trx.className}</td>
                        <td className="py-3 px-6">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            trx.attendanceType === 'MASUK' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                          }`}>
                            {trx.attendanceType}
                          </span>
                        </td>
                        <td className="py-3 px-6">
                          <Badge attendanceStatus={trx.attendanceStatus} />
                        </td>
                        <td className="py-3 px-6 font-mono font-bold text-emerald-800">{trx.deviceId}</td>
                        <td className="py-3 px-6">
                          <Badge syncStatus={trx.syncStatus} dot />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ========================================================= */}
      {/* Modal Rincian Siswa per Kotak Status (Ultra-Minimalis & Rendah) */}
      {/* ========================================================= */}
      {activeCategory && categoryMeta && (
        <Modal
          isOpen={!!activeCategory}
          onClose={() => {
            setActiveCategory(null);
            setCategorySearch('');
          }}
          title={categoryMeta.title}
          headerRight={
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${categoryMeta.badgeColor}`}>
              {categoryData.length} siswa
            </span>
          }
          maxWidth="3xl"
          maxHeight="max-h-[calc(100dvh-175px)] sm:max-h-[75vh]"
        >
          <div className="space-y-2.5">
            {/* Toolbar Sticky: Pencarian & Tombol Ekspor Simetris (CSV, Excel, PDF) */}
            <div className="sticky -top-2.5 sm:-top-4 z-20 bg-white pt-1 pb-2.5 space-y-2 border-b border-slate-100">
              {/* Form Input Pencarian Siswa */}
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:bg-white focus-within:border-emerald-600 focus-within:ring-1 focus-within:ring-emerald-600 transition-colors shadow-2xs">
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Cari berdasarkan nama, ID, atau kelas..."
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 outline-none font-medium"
                />
                {categorySearch && (
                  <button
                    type="button"
                    onClick={() => setCategorySearch('')}
                    className="text-slate-400 hover:text-slate-600 text-xs px-1.5 py-0.5 rounded hover:bg-slate-200 transition-colors"
                    title="Hapus pencarian"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Tombol Ekspor Simetris: Grid 3 di Mobile & Sejajar Rapi di Desktop */}
              <div className="grid grid-cols-3 gap-1.5 sm:flex sm:items-center sm:justify-end">
                <button
                  type="button"
                  onClick={handleExportCategoryCsv}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold transition-all active:scale-95 shadow-2xs"
                  title="Unduh data dalam format CSV"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  <span>CSV</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportCategoryExcel}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold transition-all active:scale-95 shadow-2xs"
                  title="Unduh data dalam format Microsoft Excel (.xlsx)"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span>Excel</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportCategoryPdf}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-xs font-bold transition-all active:scale-95 shadow-2xs"
                  title="Cetak atau Simpan ke format PDF resmi"
                >
                  <Printer className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                  <span>PDF / Cetak</span>
                </button>
              </div>
            </div>

            {/* Konten Daftar Siswa */}
            {categoryData.length === 0 ? (
              <div className="py-4 text-center text-slate-400 text-xs">
                <p className="font-semibold text-slate-600">Tidak ada siswa</p>
                {categorySearch && <p className="text-[10px] text-slate-400">Tidak cocok dengan pencarian</p>}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 rounded-xl bg-white border border-slate-100">
                {/* TAMPILAN MOBILE (sm:hidden): List Card Minimalis & Ringkas */}
                <div className="sm:hidden divide-y divide-slate-100">
                  {categoryData.map((item) => {
                    const cleanPhone = (item.phone || '').replace(/[^0-9]/g, '');
                    const waUrl = cleanPhone
                      ? `https://wa.me/${cleanPhone.startsWith('0') ? '62' + cleanPhone.substring(1) : cleanPhone}`
                      : null;
                    const initial = (item.studentName || 'S').charAt(0).toUpperCase();

                    return (
                      <div key={item.studentId} className="py-1.5 px-2 flex items-center justify-between gap-2 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-md bg-emerald-50 text-emerald-800 font-bold flex items-center justify-center text-[10px] shrink-0 border border-emerald-200">
                            {initial}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-xs text-slate-900 truncate leading-tight">{item.studentName}</p>
                            <p className="text-[10px] text-slate-500 truncate leading-none mt-0.5">
                              {item.className} &bull; <span className="font-mono">{item.studentId}</span>
                              {item.time && ` • ${item.time}`}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`inline-block font-bold text-[9px] px-2 py-0.5 rounded-full ${
                            item.status === 'HADIR'
                              ? 'bg-emerald-100 text-emerald-800'
                              : item.status === 'TERLAMBAT'
                              ? 'bg-amber-100 text-amber-800'
                              : ['IZIN', 'SAKIT', 'BK'].includes(item.status)
                              ? 'bg-blue-100 text-blue-800'
                              : item.status === 'ALFA'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {item.status}
                          </span>
                          {waUrl && (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-600 hover:text-emerald-700 bg-emerald-50 p-1 rounded border border-emerald-200"
                              title="WhatsApp Wali"
                            >
                              <Phone className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* TAMPILAN DESKTOP TABLE (hidden sm:block) */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="py-2 px-3">#</th>
                        <th className="py-2 px-3">ID</th>
                        <th className="py-2 px-3">Nama Siswa</th>
                        <th className="py-2 px-3">Kelas</th>
                        <th className="py-2 px-3">Status / Waktu</th>
                        <th className="py-2 px-3">Kontak Wali</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {categoryData.map((item, idx) => {
                        const cleanPhone = (item.phone || '').replace(/[^0-9]/g, '');
                        const waUrl = cleanPhone
                          ? `https://wa.me/${cleanPhone.startsWith('0') ? '62' + cleanPhone.substring(1) : cleanPhone}`
                          : null;

                        return (
                          <tr key={item.studentId} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                            <td className="py-2 px-3 font-mono font-bold text-slate-700 text-[11px]">
                              {item.studentId}
                            </td>
                            <td className="py-2 px-3 font-semibold text-slate-900">
                              {item.studentName}
                              {item.parentName && (
                                <span className="text-[10px] text-slate-400 font-normal ml-1">({item.parentName})</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-slate-600 font-medium">{item.className}</td>
                            <td className="py-2 px-3">
                              <span className={`inline-block font-bold text-[10px] px-2 py-0.5 rounded-full ${
                                item.status === 'HADIR'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : item.status === 'TERLAMBAT'
                                  ? 'bg-amber-100 text-amber-800'
                                  : ['IZIN', 'SAKIT', 'BK'].includes(item.status)
                                  ? 'bg-blue-100 text-blue-800'
                                  : item.status === 'ALFA'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-slate-100 text-slate-600'
                              }`}>
                                {item.status}
                              </span>
                              {item.time && (
                                <span className="text-[10px] text-slate-500 font-mono ml-1.5">
                                  {item.time}
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              {waUrl ? (
                                <a
                                  href={waUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 hover:underline"
                                >
                                  <Phone className="w-3 h-3" />
                                  <span>{item.phone}</span>
                                </a>
                              ) : (
                                <span className="text-[11px] text-slate-400 italic">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
