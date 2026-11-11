// ===================================================================
// FILE: ApiPwa.gs — BACKUP / ALTERNATIF CODE.GS
// ===================================================================
// Token resmi: man1bulukumba_2026
// Tab master: Data Siswa
// ===================================================================

const PWA_SECRET_TOKEN = 'man1bulukumba_2026';

const PWA_SHEET_STUDENTS   = 'Data Siswa'; // Tab data master siswa
const PWA_SHEET_ATTENDANCE = 'ABSENSI';    // Tab pencatatan transaksi
const PWA_SHEET_LOGS       = 'LOG';        // Tab audit log sistem

// Whitelist nilai yang diizinkan untuk keamanan
const PWA_ALLOWED_SESSIONS = ['MASUK', 'PULANG'];
const PWA_ALLOWED_STATUS   = ['HADIR', 'TERLAMBAT', 'IZIN', 'SAKIT', 'ALFA'];
const PWA_ALLOWED_METHODS  = ['USB_SCANNER', 'BARCODE_CAMERA', 'MANUAL'];
const PWA_ALLOWED_DEVICES  = ['PC-01', 'PC-02', 'PC-03'];

/**
 * Handler utama untuk semua request dari Web Absensi PWA baru
 */
function handlePwaRequest(e) {
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

    // ── Autentikasi Token ──────────────────────────────────────────
    const incomingToken = String(payload.token || (e && e.parameter && e.parameter.token) || '').trim();
    if (PWA_SECRET_TOKEN && PWA_SECRET_TOKEN !== 'GANTI_DENGAN_TOKEN_RAHASIA_ANDA_YANG_KUAT_DAN_PANJANG') {
      if (incomingToken !== PWA_SECRET_TOKEN) {
        pwaWriteLog('UNAUTHORIZED_ACCESS', 'Token tidak valid atau tidak disertakan', e);
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
          message: 'Backend Google Apps Script aktif dan terhubung ke spreadsheet MAN 1 BULUKUMBA.',
          timestamp: new Date().toISOString()
        }));

      case 'getInitialData':
        return output.setContent(JSON.stringify(pwaGetInitialData()));

      case 'submitAttendanceBatch':
        return output.setContent(JSON.stringify(pwaSubmitAttendanceBatch(payload)));

      default:
        return output.setContent(JSON.stringify({
          success: false,
          error: 'Aksi API tidak dikenal.'
        }));
    }
  } catch (err) {
    return output.setContent(JSON.stringify({
      success: false,
      error: 'Terjadi kesalahan pada server script: ' + (err.message || String(err))
    }));
  }
}

// ── Helper: Sanitasi Input ─────────────────────────────────────────

function pwaSanitize(val, maxLen) {
  if (val === null || val === undefined) return '';
  return String(val).trim().replace(/[<>"'`\\]/g, '').substring(0, maxLen || 200);
}

// ── Helper: Log Audit Sistem ───────────────────────────────────────

function pwaWriteLog(eventType, detail, e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let logSheet = ss.getSheetByName(PWA_SHEET_LOGS);
    if (!logSheet) {
      logSheet = ss.insertSheet(PWA_SHEET_LOGS);
      logSheet.appendRow(['TIMESTAMP', 'EVENT', 'DETAIL', 'IP_HINT']);
    }
    const ipHint = (e && e.parameter && e.parameter.device_id) ? String(e.parameter.device_id) : 'PWA';
    logSheet.appendRow([new Date().toISOString(), eventType, detail, ipHint]);
  } catch (_) {
    // Pengabaian kegagalan log
  }
}

// ── 1. Ambil Data Master Siswa dari Tab PAGE ────────────────────────

function pwaGetInitialData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pageSheet = ss.getSheetByName(PWA_SHEET_STUDENTS) || ss.getSheets()[0];
  const pageData = pageSheet.getDataRange().getValues();

  const students = [];
  // Baris 1: ID | NAMA | KELAS | NO_WA | BARCODE
  for (let i = 1; i < pageData.length; i++) {
    const row = pageData[i];
    if (!row[0]) continue;
    students.push({
      id:             pwaSanitize(row[0], 30),
      name:           pwaSanitize(row[1], 100),
      className:      pwaSanitize(row[2], 50),
      whatsappNumber: pwaSanitize(row[3], 20),
      barcodeValue:   pwaSanitize(row[4] || row[0], 30),
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

// ── 2. Simpan Catatan Absensi ke Tab ABSENSI Secara Batch ────────────

function pwaSubmitAttendanceBatch(payload) {
  const lock = LockService.getScriptLock();
  const successLock = lock.tryLock(20000); // Kunci 20 detik untuk mencegah tabrakan data 3 PC

  if (!successLock) {
    return {
      success: false,
      error: 'Server sedang sibuk memproses absensi dari PC lain. Silakan coba lagi.'
    };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let attSheet = ss.getSheetByName(PWA_SHEET_ATTENDANCE);

    // Buat sheet ABSENSI bila belum ada
    if (!attSheet) {
      attSheet = ss.insertSheet(PWA_SHEET_ATTENDANCE);
      attSheet.appendRow([
        'TRANSACTION_ID', 'TANGGAL', 'WAKTU_SCAN',
        'ID_SISWA', 'NAMA_SISWA', 'KELAS',
        'SESI', 'STATUS', 'METODE',
        'DEVICE_ID', 'OPERATOR_ID', 'WAKTU_SYNC_SERVER'
      ]);
    }

    const rawTransactions = payload.transactions;
    if (!Array.isArray(rawTransactions) || rawTransactions.length === 0) {
      return { success: true, processedCount: 0, results: [] };
    }

    const transactions = rawTransactions.slice(0, 500);
    const serverTimestamp = new Date().toISOString();
    const results = [];

    // Ambil ID yang sudah ada untuk mencegah duplikasi (Idempotensi)
    const existingData  = attSheet.getDataRange().getValues();
    const existingTxIds = new Set();
    for (let r = 1; r < existingData.length; r++) {
      if (existingData[r][0]) existingTxIds.add(String(existingData[r][0]));
    }

    const rowsToAppend = [];

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];

      const txId        = pwaSanitize(tx.transactionId, 50);
      const txDate      = pwaSanitize(tx.attendanceDate, 10);
      const txTime      = pwaSanitize(tx.deviceTimestamp, 30);
      const txStudentId = pwaSanitize(tx.studentId, 30);
      const txName      = pwaSanitize(tx.studentName, 100);
      const txClass     = pwaSanitize(tx.className, 50);
      const txSession   = pwaSanitize(tx.attendanceType, 10);
      const txStatus    = pwaSanitize(tx.attendanceStatus, 20);
      const txMethod    = pwaSanitize(tx.method, 20);
      const txDevice    = pwaSanitize(tx.deviceId, 10);
      const txOperator  = pwaSanitize(tx.operatorId, 20);

      // Cek apakah transaksi sudah pernah tersimpan sebelumnya
      if (existingTxIds.has(txId)) {
        results.push({ transactionId: txId, status: 'SYNCED', message: 'Sudah ada sebelumnya.' });
        continue;
      }

      rowsToAppend.push([
        txId, txDate, txTime,
        txStudentId, txName, txClass,
        txSession, txStatus, txMethod,
        txDevice, txOperator, serverTimestamp
      ]);

      existingTxIds.add(txId);
      results.push({ transactionId: txId, status: 'SYNCED' });
    }

    // Tulis baris baru sekaligus secara batch
    if (rowsToAppend.length > 0) {
      const startRow = attSheet.getLastRow() + 1;
      attSheet
        .getRange(startRow, 1, rowsToAppend.length, rowsToAppend[0].length)
        .setValues(rowsToAppend);
    }

    return {
      success:        true,
      processedCount: rowsToAppend.length,
      results:        results,
      serverTimestamp: serverTimestamp,
    };

  } finally {
    lock.releaseLock();
  }
}

