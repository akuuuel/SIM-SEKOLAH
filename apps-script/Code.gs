// ===================================================================
// GOOGLE APPS SCRIPT BACKEND — SISTEM ABSENSI MAN 1 BULUKUMBA
// ===================================================================
// Format Output Rapi:
// [ Tanggal | Nama | ID | Kelas | Jam Masuk | Jam Pulang | Status ]
// - 1 Siswa = Tepat 1 Baris per Tanggal (Jam Masuk & Jam Pulang bergabung di baris yang sama)
// - Otomatis terdistribusi ke tab: 'Hadir', 'Terlambat', 'Izin', 'Sakit', 'Alfa'
// - Tab Master Siswa: 'Data Siswa'
// ===================================================================

const SECRET_TOKEN = 'man1bulukumba_2026';

// Nama Tab
const SHEET_STUDENTS_NAME   = 'Data Siswa';
const SHEET_ATTENDANCE_NAME = 'ABSENSI';

// Header resmi yang rapi sesuai permintaan
const REKAP_HEADERS = ['Tanggal', 'Nama', 'ID', 'Kelas', 'Jam Masuk', 'Jam Pulang', 'Status'];

// ── Entry points ────────────────────────────────────────────────────────────

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

// ── Request Router ──────────────────────────────────────────────────────────

function handleRequest(e) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  try {
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        return output.setContent(JSON.stringify({
          success: false,
          error: 'Format request body bukan JSON yang valid.'
        }));
      }
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    // ── Validasi Token ──────────────────────────────────────────────────
    if (SECRET_TOKEN) {
      const incomingToken = String(payload.token || (e && e.parameter && e.parameter.token) || '').trim();
      if (incomingToken !== SECRET_TOKEN) {
        return output.setContent(JSON.stringify({
          success: false,
          error: 'Unauthorized: Token keamanan tidak valid.'
        }));
      }
    }

    const action = String(payload.action || 'ping').trim();

    switch (action) {
      case 'ping':
        return output.setContent(JSON.stringify({
          success: true,
          message: 'Backend Google Apps Script aktif dan terhubung ke spreadsheet Absensi MAN 1 BULUKUMBA.',
          timestamp: new Date().toISOString()
        }));

      case 'getInitialData':
        return output.setContent(JSON.stringify(getMasterStudents()));

      case 'submitAttendanceBatch':
        return output.setContent(JSON.stringify(processAttendanceBatch(payload)));

      default:
        return output.setContent(JSON.stringify({
          success: false,
          error: 'Aksi API tidak dikenal: ' + action
        }));
    }
  } catch (err) {
    return output.setContent(JSON.stringify({
      success: false,
      error: 'Terjadi kesalahan server: ' + (err.message || String(err))
    }));
  }
}

// ── Helper: Normalisasi Nilai ───────────────────────────────────────────────

function _clean(val, maxLen) {
  if (val === null || val === undefined) return '';
  return String(val).trim().replace(/[<>"'`\\]/g, '').substring(0, maxLen || 100);
}

// Normalisasi Tanggal ke format teks murni YYYY-MM-DD
function _normalizeDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(val).trim();
  if (s.length >= 10 && s.indexOf('-') > 0) {
    return s.substring(0, 10);
  }
  return s;
}

// Format waktu ISO ke format Jam:Menit:Detik lokal (WITA / Jam Lokal)
function _formatTimeOnly(isoString) {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  } catch (e) {
    return String(isoString);
  }
}

// ── 1. Tarik Master Siswa dari Tab 'Data Siswa' ──────────────────────────────

function getMasterStudents() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_STUDENTS_NAME) || ss.getSheetByName('PAGE') || ss.getSheets()[0];
  const data = sheet.getDataRange().getValues();

  const students = [];
  // Baris 1 Header: ID | Nama | Kelas | NO_WA | BARCODE
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    students.push({
      id:             _clean(row[0], 30),
      name:           _clean(row[1], 100),
      className:      _clean(row[2], 50),
      whatsappNumber: _clean(row[3], 20),
      barcodeValue:   _clean(row[0], 30),
      isActive:       true,
    });
  }

  return {
    success:       true,
    students:      students,
    totalStudents: students.length,
    serverTime:    new Date().toISOString(),
  };
}

// ── 2. Proses Rekap Absensi Rapi ke Tab Terkait ──────────────────────────────

function processAttendanceBatch(payload) {
  const lock = LockService.getScriptLock();
  const successLock = lock.tryLock(25000);

  if (!successLock) {
    return { success: false, error: 'Server sibuk. Coba beberapa detik lagi.' };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const rawTransactions = payload.transactions || [];

    if (!Array.isArray(rawTransactions) || rawTransactions.length === 0) {
      return { success: true, processedCount: 0, results: [] };
    }

    // Pastikan sheet 'ABSENSI' ada
    let mainSheet = ss.getSheetByName(SHEET_ATTENDANCE_NAME);
    if (!mainSheet) {
      mainSheet = ss.insertSheet(SHEET_ATTENDANCE_NAME);
    }

    const results = [];

    // Proses setiap transaksi absensi satu per satu
    for (let i = 0; i < rawTransactions.length; i++) {
      const tx = rawTransactions[i];
      const txId       = _clean(tx.transactionId, 50);
      const date       = _normalizeDate(tx.attendanceDate); // Format YYYY-MM-DD
      const studentId  = _clean(tx.studentId, 30);
      const name       = _clean(tx.studentName, 100);
      const className  = _clean(tx.className, 50);
      const session    = _clean(tx.attendanceType, 10).toUpperCase(); // MASUK / PULANG
      const status     = _clean(tx.attendanceStatus, 20).toUpperCase(); // HADIR, TERLAMBAT, IZIN, SAKIT, ALFA
      const timeStr    = _formatTimeOnly(tx.deviceTimestamp);

      // 1. Tulis atau Gabungkan ke Tab Induk 'ABSENSI'
      const finalStatus = _upsertRecord(mainSheet, date, name, studentId, className, session, timeStr, status);

      // Jika sesi PULANG tapi siswa tidak punya data MASUK di tanggal ini, abaikan pencatatan pulang liar
      if (!finalStatus && session === 'PULANG') {
        results.push({ transactionId: txId, status: 'REJECTED_NO_ENTRY' });
        continue;
      }

      // 2. Tulis atau Gabungkan ke Tab Kategori Masing-masing (Hadir, Terlambat, Izin, Sakit, Alfa, BK)
      let categoryTabName = '';
      if (finalStatus === 'HADIR') categoryTabName = 'Hadir';
      else if (finalStatus === 'TERLAMBAT') categoryTabName = 'Terlambat';
      else if (finalStatus === 'IZIN') categoryTabName = 'Izin';
      else if (finalStatus === 'SAKIT') categoryTabName = 'Sakit';
      else if (finalStatus === 'ALFA') categoryTabName = 'Alfa';
      else if (finalStatus === 'BK') categoryTabName = 'BK';

      if (categoryTabName) {
        let catSheet = ss.getSheetByName(categoryTabName);
        if (!catSheet) {
          catSheet = ss.insertSheet(categoryTabName);
        }
        _upsertRecord(catSheet, date, name, studentId, className, session, timeStr, finalStatus);
      }

      // Pastikan data siswa tidak ganda di tab status yang lain
      const allCategoryTabs = ['Hadir', 'Terlambat', 'Izin', 'Sakit', 'Alfa', 'BK'];
      for (let c = 0; c < allCategoryTabs.length; c++) {
        const otherTab = allCategoryTabs[c];
        if (otherTab !== categoryTabName) {
          _removeFromSheetIfExist(ss.getSheetByName(otherTab), date, studentId);
        }
      }

      results.push({ transactionId: txId, status: 'SYNCED' });
    }

    return {
      success: true,
      processedCount: rawTransactions.length,
      results: results,
      serverTimestamp: new Date().toISOString()
    };

  } finally {
    lock.releaseLock();
  }
}

/**
 * Logika Penggabungan Baris Pintar:
 * Kolom A (1) = Tanggal
 * Kolom B (2) = Nama
 * Kolom C (3) = ID
 * Kolom D (4) = Kelas
 * Kolom E (5) = Jam Masuk
 * Kolom F (6) = Jam Pulang
 * Kolom G (7) = Status
 */
function _upsertRecord(sheet, date, name, studentId, className, session, timeStr, status) {
  // Jika sheet belum punya header, buat header resmi
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(REKAP_HEADERS);
    _styleHeader(sheet);
  }

  const lastRow = sheet.getLastRow();
  let existingRow = -1;
  let currentStatus = status;

  if (lastRow > 1) {
    // Ambil seluruh data dari baris 2 hingga akhir
    const rangeData = sheet.getRange(2, 1, lastRow - 1, 7).getValues();

    for (let i = 0; i < rangeData.length; i++) {
      const rowDate = _normalizeDate(rangeData[i][0]);
      const rowId   = _clean(rangeData[i][2], 30);

      // Cocokkan Tanggal & ID Siswa
      if (rowDate === date && rowId === studentId) {
        existingRow = i + 2; // Baris riil di sheet (1-based index)
        currentStatus = rangeData[i][6] || status; // Ambil status awal jika sudah ada
        break;
      }
    }
  }

  if (existingRow > 0) {
    // Siswa SUDAH ADA di tanggal ini -> GABUNGKAN PADA BARIS INI!
    if (session === 'PULANG') {
      // Isi Jam Pulang di Kolom F (kolom 6)
      sheet.getRange(existingRow, 6).setValue(timeStr);
    } else {
      // Isi Jam Masuk di Kolom E (kolom 5)
      sheet.getRange(existingRow, 5).setValue(timeStr);
      // Jika scan sesi masuk membawa status baru (misal TERLAMBAT), update statusnya
      sheet.getRange(existingRow, 7).setValue(status);
      currentStatus = status;
    }
    return currentStatus;
  } else {
    // Siswa BELUM ADA di tanggal ini:
    // Jika sesi PULANG tapi belum pernah scan MASUK hari ini, tolak dan jangan buat baris kosong!
    if (session === 'PULANG') {
      return null;
    }

    sheet.appendRow([
      date,
      name,
      studentId,
      className,
      timeStr,
      '-',
      status
    ]);
    return status;
  }
}

// Helper: Hapus baris lama jika pindah tab status
function _removeFromSheetIfExist(sheet, date, studentId) {
  if (!sheet || sheet.getLastRow() <= 1) return;
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
  for (let i = data.length - 1; i >= 0; i--) {
    const rDate = _normalizeDate(data[i][0]);
    const rId   = _clean(data[i][2], 30);
    if (rDate === date && rId === studentId) {
      sheet.deleteRow(i + 2);
    }
  }
}

// Beri style rapi pada Header baris 1
function _styleHeader(sheet) {
  try {
    const headerRange = sheet.getRange(1, 1, 1, REKAP_HEADERS.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#E8F0FE'); // Biru muda lembut Google
    headerRange.setHorizontalAlignment('center');
  } catch (e) {}
}
