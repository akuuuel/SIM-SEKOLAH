<?php
/**
 * export_parent_report.php
 * Generator Dokumen PDF Resmi Laporan Kehadiran Siswa
 * Portal Orang Tua — MAN 1 BULUKUMBA
 */
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/SimpleNativePDF.php';

$studentId = isset($_GET['studentId']) ? trim($_GET['studentId']) : '';
$phone     = isset($_GET['phone'])     ? trim($_GET['phone'])     : '';
$month     = isset($_GET['month'])     ? trim($_GET['month'])     : date('Y-m'); // Contoh: 2026-11
$format    = isset($_GET['format'])    ? trim($_GET['format'])    : 'pdf';       // default 'pdf'

if (empty($studentId) && empty($phone)) {
    http_response_code(400);
    die('Parameter siswa atau nomor HP tidak ditentukan.');
}

// 1. Cari data siswa
$student = null;
if (!empty($studentId)) {
    $st = $pdo->prepare("SELECT id, nama, kelas, barcode FROM siswa WHERE id = ? LIMIT 1");
    $st->execute([$studentId]);
    $student = $st->fetch(PDO::FETCH_ASSOC);
}
if (!$student && !empty($phone)) {
    $normPhone = preg_replace('/[^0-9]/', '', $phone);
    $st = $pdo->prepare("SELECT id, nama, kelas, barcode FROM siswa WHERE REGEXP_REPLACE(no_wa,'[^0-9]','') = ? LIMIT 1");
    $st->execute([$normPhone]);
    $student = $st->fetch(PDO::FETCH_ASSOC);
}
if (!$student) {
    http_response_code(404);
    die('Data siswa tidak ditemukan di sistem.');
}

$sId = $student['id'];
$sName = $student['nama'];
$sClass = $student['kelas'] ?? '—';

// 2. Ambil seluruh data absensi bulan terpilih
$monthStart = $month . '-01';
$monthEnd   = date('Y-m-t', strtotime($monthStart));

$stm = $pdo->prepare("
    SELECT
        tanggal AS tgl,
        DAYNAME(tanggal) AS hari,
        jam_masuk,
        jam_pulang,
        status,
        keterangan
    FROM absensi
    WHERE id_siswa = ?
      AND (
          (tanggal IS NOT NULL AND tanggal != '' AND tanggal BETWEEN ? AND ?)
          OR (jam_masuk IS NOT NULL AND DATE(jam_masuk) BETWEEN ? AND ?)
      )
    ORDER BY tanggal ASC, jam_masuk ASC
");
$stm->execute([$sId, $monthStart, $monthEnd, $monthStart, $monthEnd]);
$rows = $stm->fetchAll(PDO::FETCH_ASSOC);

// 3. Hitung statistik kehadiran
$total = count($rows);
$hadir = 0; $terlambat = 0; $izin = 0; $alfa = 0;
foreach ($rows as $r) {
    $s = strtoupper($r['status'] ?? '');
    if ($s === 'HADIR')         $hadir++;
    elseif ($s === 'TERLAMBAT') $terlambat++;
    elseif (in_array($s, ['IZIN','SAKIT','BK'])) $izin++;
    elseif ($s === 'ALFA')      $alfa++;
}

// Tingkat kehadiran tepat waktu (Disiplin: hanya hadir tepat yang dihitung penuh)
$rateTepat = $total > 0 ? round(($hadir / $total) * 100) : 0;

// Nama bulan Indonesia
$bulanArr = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
[$y, $m2] = explode('-', $month);
$bulanLabel = ($bulanArr[(int)$m2] ?? '') . ' ' . $y;

$hariId = [
    'Monday' => 'Senin', 'Tuesday' => 'Selasa', 'Wednesday' => 'Rabu',
    'Thursday' => 'Kamis', 'Friday' => 'Jumat', 'Saturday' => 'Sabtu', 'Sunday' => 'Minggu'
];

function fmtJam($t) {
    if (!$t || $t === '-') return '-';
    if (strlen($t) <= 8 && strpos($t, ':') !== false) {
        return substr($t, 0, 5);
    }
    $ts = strtotime($t);
    return $ts ? date('H:i', $ts) : $t;
}

// Jika user secara spesifik meminta format HTML
if ($format === 'html') {
    header('Content-Type: text/html; charset=utf-8');
    ?>
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>Laporan Kehadiran - <?= htmlspecialchars($sName) ?></title>
      <style>
        body { font-family: sans-serif; font-size: 12px; margin: 20px; color: #1e293b; }
        .kop { border-bottom: 2px solid #15803d; padding-bottom: 10px; margin-bottom: 15px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
        th { background: #15803d; color: white; }
      </style>
    </head>
    <body>
      <div class="kop">
        <h2 style="margin:0;color:#15803d;">MAN 1 BULUKUMBA</h2>
        <p style="margin:2px 0;">Laporan Presensi Siswa: <strong><?= htmlspecialchars($sName) ?> (<?= htmlspecialchars($sClass) ?>)</strong></p>
        <p style="margin:2px 0;">Periode: <?= $bulanLabel ?> | Tingkat Hadir Tepat: <?= $rateTepat ?>%</p>
      </div>
      <table>
        <thead><tr><th>No</th><th>Tanggal</th><th>Hari</th><th>Masuk</th><th>Pulang</th><th>Status</th><th>Keterangan</th></tr></thead>
        <tbody>
          <?php foreach ($rows as $i => $r): ?>
          <tr>
            <td><?= $i + 1 ?></td>
            <td><?= date('d/m/Y', strtotime($r['tgl'])) ?></td>
            <td><?= $hariId[$r['hari']] ?? $r['hari'] ?></td>
            <td><?= fmtJam($r['jam_masuk']) ?></td>
            <td><?= fmtJam($r['jam_pulang']) ?></td>
            <td><?= htmlspecialchars($r['status']) ?></td>
            <td><?= htmlspecialchars($r['keterangan'] ?? '-') ?></td>
          </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    </body>
    </html>
    <?php
    exit();
}

// =========================================================================
// GENERATE PDF ASLI (100% Binary Standar PDF 1.4)
// =========================================================================
$pdf = new SimpleNativePDF();

// ── KOP SURAT HIJAU MADRASAH ──
// Header Banner Hijau (#15803d = 0.082, 0.502, 0.239)
$pdf->setFillColor(0.082, 0.502, 0.239);
$pdf->rect(36, 745, 523, 60, 'F');

// Logo Kotak Putih 'M1B'
$pdf->setFillColor(1, 1, 1);
$pdf->rect(48, 755, 42, 40, 'F');
$pdf->setFillColor(0.082, 0.502, 0.239);
$pdf->text(53, 768, 'M1B', 'F2', 16);

// Teks KOP Surat di Banner
$pdf->setFillColor(1, 1, 1);
$pdf->text(102, 783, 'KEMENTERIAN AGAMA REPUBLIK INDONESIA', 'F2', 9);
$pdf->text(102, 768, 'MAN 1 BULUKUMBA', 'F2', 15);
$pdf->text(102, 755, 'Sistem Presensi Siswa & Portal Orang Tua Terpadu', 'F1', 8);

// ── JUDUL DOKUMEN ──
$pdf->setFillColor(0.1, 0.1, 0.1);
$pdf->text(36, 725, 'LAPORAN REKAPITULASI PRESENSI SISWA', 'F2', 12);
$pdf->setFillColor(0.4, 0.4, 0.4);
$pdf->text(36, 712, 'Periode Bulan: ' . $bulanLabel, 'F1', 9);

// ── KOTAK IDENTITAS SISWA ──
$pdf->setFillColor(0.95, 0.98, 0.95);
$pdf->setStrokeColor(0.7, 0.88, 0.7);
$pdf->rect(36, 650, 523, 52, 'FD');

$pdf->setFillColor(0.1, 0.2, 0.1);
$pdf->text(48, 688, 'Nama Siswa', 'F1', 8);
$pdf->text(48, 674, $sName, 'F2', 11);

$pdf->text(250, 688, 'ID Siswa', 'F1', 8);
$pdf->text(250, 674, $sId, 'F2', 10);

$pdf->text(390, 688, 'Kelas', 'F1', 8);
$pdf->text(390, 674, $sClass, 'F2', 10);

$pdf->text(460, 688, 'Hadir Tepat', 'F1', 8);
$pdf->setFillColor(0.082, 0.502, 0.239);
$pdf->text(460, 674, $rateTepat . '% (' . $hadir . '/' . $total . ')', 'F2', 10);

// ── 4 KOTAK RINGKASAN METRIK ──
// Box 1: Hadir Tepat
$pdf->setFillColor(0.93, 0.98, 0.93);
$pdf->setStrokeColor(0.5, 0.8, 0.5);
$pdf->rect(36, 595, 122, 44, 'FD');
$pdf->setFillColor(0.082, 0.502, 0.239);
$pdf->text(46, 622, (string)$hadir . ' Hari', 'F2', 14);
$pdf->setFillColor(0.1, 0.4, 0.1);
$pdf->text(46, 606, 'HADIR TEPAT WAKTU', 'F2', 7);

// Box 2: Terlambat
$pdf->setFillColor(1.0, 0.98, 0.92);
$pdf->setStrokeColor(0.9, 0.8, 0.4);
$pdf->rect(168, 595, 122, 44, 'FD');
$pdf->setFillColor(0.8, 0.45, 0.0);
$pdf->text(178, 622, (string)$terlambat . ' Hari', 'F2', 14);
$pdf->setFillColor(0.6, 0.35, 0.0);
$pdf->text(178, 606, 'TERLAMBAT (> 07.15)', 'F2', 7);

// Box 3: Izin / Sakit
$pdf->setFillColor(0.93, 0.96, 1.0);
$pdf->setStrokeColor(0.6, 0.75, 0.95);
$pdf->rect(300, 595, 122, 44, 'FD');
$pdf->setFillColor(0.15, 0.4, 0.85);
$pdf->text(310, 622, (string)$izin . ' Hari', 'F2', 14);
$pdf->setFillColor(0.1, 0.3, 0.7);
$pdf->text(310, 606, 'IZIN / SAKIT / BK', 'F2', 7);

// Box 4: Alfa
$pdf->setFillColor(1.0, 0.94, 0.94);
$pdf->setStrokeColor(0.95, 0.6, 0.6);
$pdf->rect(432, 595, 127, 44, 'FD');
$pdf->setFillColor(0.85, 0.15, 0.15);
$pdf->text(442, 622, (string)$alfa . ' Hari', 'F2', 14);
$pdf->setFillColor(0.7, 0.1, 0.1);
$pdf->text(442, 606, 'ALFA (TANPA KETERANGAN)', 'F2', 6.5);

// ── TABEL RINCIAN KEHADIRAN ──
// Header Tabel (Y = 565)
$tableY = 565;
$pdf->setFillColor(0.082, 0.502, 0.239);
$pdf->rect(36, $tableY, 523, 20, 'F');

$pdf->setFillColor(1, 1, 1);
$pdf->text(42, $tableY + 6, 'No', 'F2', 8);
$pdf->text(62, $tableY + 6, 'Tanggal', 'F2', 8);
$pdf->text(125, $tableY + 6, 'Hari', 'F2', 8);
$pdf->text(175, $tableY + 6, 'Jam Masuk', 'F2', 8);
$pdf->text(245, $tableY + 6, 'Jam Pulang', 'F2', 8);
$pdf->text(315, $tableY + 6, 'Status Presensi', 'F2', 8);
$pdf->text(415, $tableY + 6, 'Keterangan', 'F2', 8);

// Baris Tabel
$curY = $tableY - 18;
$rowH = 17;

if (empty($rows)) {
    $pdf->setFillColor(0.5, 0.5, 0.5);
    $pdf->text(200, $curY + 5, 'Belum ada data presensi pada bulan ini.', 'F1', 9);
} else {
    foreach ($rows as $idx => $r) {
        if ($curY < 65) {
            // Batas bawah kertas A4 tercapai
            break;
        }

        // Zebra background baris genap
        if ($idx % 2 === 1) {
            $pdf->setFillColor(0.97, 0.98, 0.97);
            $pdf->rect(36, $curY, 523, $rowH, 'F');
        }

        // Garis batas bawah baris
        $pdf->setStrokeColor(0.88, 0.88, 0.88);
        $pdf->line(36, $curY, 559, $curY, 0.5);

        // Isi Kolom
        $pdf->setFillColor(0.2, 0.2, 0.2);
        $pdf->text(42, $curY + 5, (string)($idx + 1), 'F1', 8);
        $pdf->text(62, $curY + 5, date('d/m/Y', strtotime($r['tgl'])), 'F1', 8);
        $pdf->text(125, $curY + 5, $hariId[$r['hari']] ?? $r['hari'], 'F1', 8);
        $pdf->text(175, $curY + 5, fmtJam($r['jam_masuk']) . ' WITA', 'F1', 8);
        $pdf->text(245, $curY + 5, ($r['jam_pulang'] && $r['jam_pulang'] !== '-' ? fmtJam($r['jam_pulang']) . ' WITA' : '-'), 'F1', 8);

        // Badge Status Berwarna
        $st = strtoupper($r['status'] ?? '');
        if ($st === 'HADIR') {
            $pdf->setFillColor(0.082, 0.502, 0.239);
            $pdf->text(315, $curY + 5, 'Hadir Tepat', 'F2', 8);
        } elseif ($st === 'TERLAMBAT') {
            $pdf->setFillColor(0.8, 0.45, 0.0);
            $pdf->text(315, $curY + 5, 'Terlambat', 'F2', 8);
        } elseif ($st === 'ALFA') {
            $pdf->setFillColor(0.85, 0.15, 0.15);
            $pdf->text(315, $curY + 5, 'Alfa', 'F2', 8);
        } else {
            $pdf->setFillColor(0.15, 0.4, 0.85);
            $pdf->text(315, $curY + 5, $st ?: '-', 'F2', 8);
        }

        // Keterangan
        $pdf->setFillColor(0.4, 0.4, 0.4);
        $ket = $r['keterangan'] ?: '-';
        if (strlen($ket) > 24) $ket = substr($ket, 0, 22) . '..';
        $pdf->text(415, $curY + 5, $ket, 'F1', 8);

        $curY -= $rowH;
    }
}

// ── FOOTER DOKUMEN RESMI ──
$pdf->setStrokeColor(0.082, 0.502, 0.239);
$pdf->line(36, 42, 559, 42, 1);

$pdf->setFillColor(0.4, 0.4, 0.4);
$pdf->text(36, 30, 'Dokumen resmi presensi digital MAN 1 BULUKUMBA • Diunduh melalui Portal Orang Tua Siswa', 'F1', 7.5);
$pdf->text(430, 30, 'Waktu Cetak: ' . date('d/m/Y H:i') . ' WITA', 'F1', 7.5);

// Nama file download PDF bersih
$cleanName = preg_replace('/[^A-Za-z0-9_-]/', '_', $sName);
$fileName = 'Laporan_Kehadiran_' . $cleanName . '_' . $month . '.pdf';

// Output langsung sebagai dokumen PDF attachment untuk disimpan ke File/Galeri
$mode = isset($_GET['view']) && $_GET['view'] === '1' ? 'I' : 'D';
$pdf->output($fileName, $mode);
