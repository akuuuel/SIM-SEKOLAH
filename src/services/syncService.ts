import { db } from '../db/attendanceDb';
import type { AttendanceTransaction, DeviceId } from '../types';

const SYNC_URL_STORAGE_KEY = 'school_apps_script_url';
const SYNC_TOKEN_STORAGE_KEY = 'school_apps_script_token';

export function getAppsScriptUrl(): string {
  return localStorage.getItem(SYNC_URL_STORAGE_KEY) || '';
}

export function setAppsScriptUrl(url: string) {
  // Validasi format URL — hanya izinkan domain Google
  const trimmed = url.trim();
  if (trimmed && !trimmed.startsWith('https://script.google.com/')) {
    throw new Error('URL tidak valid. Harus diawali dengan https://script.google.com/');
  }
  localStorage.setItem(SYNC_URL_STORAGE_KEY, trimmed);
}

export function getAppsScriptToken(): string {
  return localStorage.getItem(SYNC_TOKEN_STORAGE_KEY) || '';
}

export function setAppsScriptToken(token: string) {
  localStorage.setItem(SYNC_TOKEN_STORAGE_KEY, token.trim());
}

/**
 * Sinkronkan transaksi pending dari IndexedDB lokal ke Google Sheets backend
 */
export async function syncPendingTransactions(
  deviceId: DeviceId
): Promise<{ success: boolean; syncedCount: number; error?: string }> {
  const scriptUrl = getAppsScriptUrl();

  // Jika belum ada URL backend yang dikonfigurasi, simulasikan lokal saja
  const pending = await db.transactions
    .where('syncStatus')
    .equals('PENDING')
    .toArray();

  if (pending.length === 0) {
    return { success: true, syncedCount: 0 };
  }

  // Tandai transaksi sebagai SYNCING
  const txIds = pending.map((t) => t.transactionId);
  await db.transactions.where('transactionId').anyOf(txIds).modify({ syncStatus: 'SYNCING' });

  if (!scriptUrl) {
    // Mode demo offline tanpa backend URL: update ke SYNCED secara lokal
    await new Promise((r) => setTimeout(r, 1000));
    await db.transactions.where('transactionId').anyOf(txIds).modify({
      syncStatus: 'SYNCED',
      serverTimestamp: new Date().toISOString(),
    });
    return { success: true, syncedCount: pending.length };
  }

  try {
    const payload = {
      action: 'submitAttendanceBatch',
      token: getAppsScriptToken(),   // ← kirim token autentikasi
      device_id: deviceId,
      transactions: pending,
    };

    const res = await fetch(scriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8', // Menggunakan text/plain untuk menghindari CORS preflight OPTIONS di Apps Script
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json();

    if (json && json.success) {
      await db.transactions.where('transactionId').anyOf(txIds).modify({
        syncStatus: 'SYNCED',
        serverTimestamp: json.serverTimestamp || new Date().toISOString(),
      });
      return { success: true, syncedCount: pending.length };
    } else {
      throw new Error(json.error || 'Server menolak pemrosesan batch.');
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    // Kembalikan status ke PENDING agar dicoba lagi nanti
    await db.transactions.where('transactionId').anyOf(txIds).modify({
      syncStatus: 'PENDING',
      syncError: errorMsg,
    });
    return { success: false, syncedCount: 0, error: errorMsg };
  }
}

/**
 * Unduh pembaruan data master siswa dari Google Sheets tab PAGE
 */
export async function fetchMasterStudentsFromSheets(): Promise<{
  success: boolean;
  total?: number;
  error?: string;
}> {
  const scriptUrl = getAppsScriptUrl();
  if (!scriptUrl) {
    return { success: false, error: 'URL Google Apps Script belum dikonfigurasi.' };
  }

  try {
    const res = await fetch(`${scriptUrl}?action=getInitialData&token=${encodeURIComponent(getAppsScriptToken())}`);
    const json = await res.json();

    if (json && json.success && Array.isArray(json.students)) {
      await db.students.bulkPut(json.students);
      return { success: true, total: json.students.length };
    }
    return { success: false, error: json.error || 'Gagal membaca data siswa.' };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMsg };
  }
}

