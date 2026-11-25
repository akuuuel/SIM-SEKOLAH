<?php
/**
 * Export Rekap Absensi — Sistem MAN 1 BULUKUMBA
 * Akses: http://localhost/Web%20Absensi/api/export.php?date=2026-11-11
 *         http://localhost/Web%20Absensi/api/export.php?bulan=2026-11
 */
require_once __DIR__ . '/db.php';

$date  = isset($_GET['date'])  ? preg_replace('/[^0-9\-]/', '', trim($_GET['date']))  : null;
$bulan = isset($_GET['bulan']) ? preg_replace('/[^0-9\-]/', '', trim($_GET['bulan'])) : null;
$kelas = isset($_GET['kelas']) ? trim($_GET['kelas']) : null;
$studentId = isset($_GET['student_id']) ? trim($_GET['student_id']) : (isset($_GET['id_siswa']) ? trim($_GET['id_siswa']) : null);

try {
    if ($studentId) {
        // Export riwayat satu siswa spesifik
        $where = "WHERE a.id_siswa = ?";
        $params = [$studentId];
        $filename = "riwayat_absensi_{$studentId}";
        if ($bulan) {
            $where .= " AND DATE_FORMAT(a.tanggal, '%Y-%m') = ?";
            $params[] = $bulan;
            $filename .= "_{$bulan}";
        }
    } elseif ($date) {
        // Export per hari
        $where = "WHERE a.tanggal = ?";
        $params = [$date];
        $filename = "rekap_database_server_MAN1_BULUKUMBA_{$date}";
    } elseif ($bulan) {
        // Export per bulan (format: 2026-11)
        $where = "WHERE DATE_FORMAT(a.tanggal, '%Y-%m') = ?";
        $params = [$bulan];
        $filename = "rekap_database_server_MAN1_BULUKUMBA_{$bulan}";
    } else {
        // Default: hari ini
        $date = date('Y-m-d');
        $where = "WHERE a.tanggal = ?";
        $params = [$date];
        $filename = "rekap_database_server_MAN1_BULUKUMBA_{$date}";
    }

    // Filter tambahan: per kelas
    if ($kelas) {
        $where .= " AND a.kelas = ?";
        $params[] = $kelas;
        $filename .= "_" . preg_replace('/[^A-Za-z0-9]/', '-', $kelas);
    }

    // Sanitisasi nama file agar bebas dari header injection / CRLF
    $filename = preg_replace('/[^A-Za-z0-9_\-]/', '_', $filename);

    $stmt = $pdo->prepare("
        SELECT
            a.tanggal,
            a.jam_masuk,
            a.jam_pulang,
            a.id_siswa,
            a.nama_siswa,
            a.kelas,
            a.status,
            a.metode,
            a.device_id,
            a.operator_id,
            TIMESTAMPDIFF(MINUTE, a.jam_masuk, a.jam_pulang) AS durasi_menit,
            a.keterangan
        FROM absensi a
        {$where}
        ORDER BY a.tanggal ASC, a.kelas ASC, a.nama_siswa ASC
    ");
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    // Output sebagai file CSV
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '.csv"');
    header('Cache-Control: no-cache, no-store, must-revalidate');
    header('Pragma: no-cache');
    header('Expires: 0');

    $output = fopen('php://output', 'w');

    // UTF-8 BOM agar Excel baca karakter Indonesia dengan benar
    fputs($output, "\xEF\xBB\xBF");

    // Header baris pertama: info sekolah
    fputcsv($output, ['REKAP ABSENSI SISWA DARI DATABASE SERVER - MAN 1 BULUKUMBA']);
    fputcsv($output, ['Jalan K.H. Abd Karim Nomor 67 Tanete Bulukumba (0413) 2586253']);
    fputcsv($output, ['Dicetak pada: ' . date('d/m/Y H:i:s') . ' WITA']);
    fputcsv($output, []); // baris kosong

    // Header kolom
    fputcsv($output, [
        'No',
        'Tanggal',
        'Jam Masuk',
        'Jam Pulang',
        'Durasi (menit)',
        'ID Siswa',
        'Nama Siswa',
        'Kelas',
        'Status Kehadiran',
        'Metode',
        'Device',
        'Operator',
        'Keterangan',
    ]);

    // Helper Mitigasi CSV Formula Injection (CWE-1236)
    $sanitizeCsv = function($val) {
        if (is_string($val) && strlen($val) > 0) {
            if (in_array($val[0], ['=', '+', '-', '@', "\t", "\r"])) {
                return "'" . $val;
            }
        }
        return $val;
    };

    // Data
    foreach ($rows as $i => $row) {
        $csvRow = [
            $i + 1,
            date('d/m/Y', strtotime($row['tanggal'])),
            $row['jam_masuk']  ? date('H:i', strtotime($row['jam_masuk']))  : '-',
            $row['jam_pulang'] ? date('H:i', strtotime($row['jam_pulang'])) : '-',
            $row['durasi_menit'] !== null ? $row['durasi_menit'] : '-',
            $row['id_siswa'],
            $row['nama_siswa'],
            $row['kelas'],
            $row['status'],
            $row['metode'],
            $row['device_id'],
            $row['operator_id'],
            $row['keterangan'] ?? '',
        ];
        fputcsv($output, array_map($sanitizeCsv, $csvRow));
    }

    // Baris kosong + summary
    fputcsv($output, []);
    fputcsv($output, ['--- RINGKASAN ---']);
    $totalHadir    = count(array_filter($rows, fn($r) => $r['status'] === 'HADIR'));
    $totalTerlambat= count(array_filter($rows, fn($r) => $r['status'] === 'TERLAMBAT'));
    $totalIzin     = count(array_filter($rows, fn($r) => $r['status'] === 'IZIN'));
    $totalSakit    = count(array_filter($rows, fn($r) => $r['status'] === 'SAKIT'));
    $totalAlfa     = count(array_filter($rows, fn($r) => $r['status'] === 'ALFA'));
    $totalBk       = count(array_filter($rows, fn($r) => $r['status'] === 'BK'));
    fputcsv($output, ['Total Hadir',    $totalHadir]);
    fputcsv($output, ['Total Terlambat',$totalTerlambat]);
    fputcsv($output, ['Total Izin',     $totalIzin]);
    fputcsv($output, ['Total Sakit',    $totalSakit]);
    fputcsv($output, ['Total Alfa',     $totalAlfa]);
    fputcsv($output, ['Total BK',       $totalBk]);
    fputcsv($output, ['Grand Total',    count($rows)]);

    fclose($output);
    exit();

} catch (Exception $e) {
    error_log("Export Error: " . $e->getMessage());
    http_response_code(500);
    die('Terjadi kesalahan saat memproses ekspor rekap absensi. Silakan hubungi administrator.');
}
