import { db } from '../db/attendanceDb';
import type { AttendanceTransaction, DeviceId, UserAccount } from '../types';
import { normalizePhoneNumber, getLocalDateString } from '../lib/utils';

const SYNC_URL_STORAGE_KEY = 'school_apps_script_url';
const SYNC_TOKEN_STORAGE_KEY = 'school_apps_script_token';

/**
 * Normalisasi URL backend agar aman dari Mixed Content (HTTPS) dan dapat diakses dari perangkat HP
 */
export function resolveBackendUrl(url: string): string {
  if (!url) return '/api/';
  const trimmed = url.trim();
  if (typeof window !== 'undefined') {
    // Jika diakses via HTTPS (ngrok tunnel) atau dari HP (IP lokal/bukan localhost),
    // ubah http://localhost... ke proxy relative /api/ agar tidak diblokir browser
    if ((window.location.protocol === 'https:' || window.location.hostname !== 'localhost') && trimmed.startsWith('http://localhost')) {
      return '/api/';
    }
  }
  return trimmed;
}

export function getAppsScriptUrl(): string {
  const saved = localStorage.getItem(SYNC_URL_STORAGE_KEY);
  if (saved) return resolveBackendUrl(saved);

  if (typeof window !== 'undefined' && window.location) {
    if (window.location.pathname.includes('/Web%20Absensi/') || window.location.pathname.includes('/Web Absensi/')) {
      return `${window.location.protocol}//${window.location.host}/Web%20Absensi/api/`;
    }
    // Jika diakses via Vite (localhost:3000 atau ngrok tunnel ke port 3000), gunakan proxy /api/
    return '/api/';
  }
  return '/api/';
}

export function setAppsScriptUrl(url: string) {
  // Validasi format URL — izinkan relative path /api/, domain Google Apps Script maupun server lokal XAMPP / PHP
  const trimmed = url.trim();
  if (trimmed && !trimmed.startsWith('/') && !trimmed.startsWith('https://script.google.com/') && !trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    throw new Error('URL tidak valid. Gunakan /api/, atau diawali dengan http:// / https://');
  }
  localStorage.setItem(SYNC_URL_STORAGE_KEY, trimmed);
}

export function getAppsScriptToken(): string {
  return localStorage.getItem(SYNC_TOKEN_STORAGE_KEY) || '';
}

export function setAppsScriptToken(token: string) {
  localStorage.setItem(SYNC_TOKEN_STORAGE_KEY, token.trim());
}

// ========================================================
// SMART IN-MEMORY CACHE & REQUEST DEDUPLICATION
// Menghilangkan request redundan ke ngrok / Apache XAMPP
// ========================================================
interface CacheEntry {
  data: any;
  timestamp: number;
}

const apiCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<any>>();

export function invalidateApiCache(actionKeyPrefix?: string) {
  if (!actionKeyPrefix) {
    apiCache.clear();
    return;
  }
  for (const key of apiCache.keys()) {
    if (key.includes(actionKeyPrefix)) {
      apiCache.delete(key);
    }
  }
}

/**
 * Fetch cerdas dengan deduplikasi request bersamaan & caching singkat (TTL)
 */
async function cachedFetchJson(
  url: string,
  ttlMs: number = 0,
  options?: RequestInit
): Promise<any> {
  const method = (options?.method || 'GET').toUpperCase();
  const cacheKey = `${method}:${url}`;

  // 1. Cek in-memory cache jika masih dalam batas masa berlaku (TTL)
  if (method === 'GET' && ttlMs > 0) {
    const cached = apiCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < ttlMs) {
      return cached.data;
    }
  }

  // 2. Request deduplication: jika request yang sama persis sedang berjalan (in-flight),
  // tunggu Promise yang sama tanpa membuat koneksi HTTP kedua
  if (method === 'GET' && inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }

  const promise = (async () => {
    try {
      const res = await fetch(url, options);
      if (!res.ok) return null;
      const json = await res.json();
      if (method === 'GET' && ttlMs > 0 && json) {
        apiCache.set(cacheKey, {
          data: json,
          timestamp: Date.now(),
        });
      }
      return json;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  if (method === 'GET') {
    inFlightRequests.set(cacheKey, promise);
  }

  return promise;
}

/**
 * Buat daftar URL backend yang sudah bersih dari Mixed Content (aman untuk HTTP & HTTPS)
 */
function buildBackendUrls(): string[] {
  const primary = getAppsScriptUrl(); // sudah melewati resolveBackendUrl
  const origin = typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}/Web%20Absensi/api/`
    : '';

  const raw = [primary, '/api/', origin].filter(Boolean).map((u) => resolveBackendUrl(u));
  return [...new Set(raw)];
}

/**
 * Sinkronkan transaksi pending dari IndexedDB lokal ke Google Sheets backend
 */
export async function syncPendingTransactions(
  deviceId: DeviceId
): Promise<{ success: boolean; syncedCount: number; error?: string }> {
  const scriptUrl = getAppsScriptUrl();

  // 1. Pulihkan transaksi yang sempat menggantung dalam status SYNCING jika sebelumnya koneksi terputus tiba-tiba
  try {
    await db.transactions
      .where('syncStatus')
      .equals('SYNCING')
      .modify({ syncStatus: 'PENDING' });
  } catch (_) {}

  // 2. Ambil seluruh transaksi berstatus PENDING yang tersimpan aman di perangkat
  const pending = await db.transactions
    .where('syncStatus')
    .equals('PENDING')
    .toArray();

  if (pending.length === 0) {
    return { success: true, syncedCount: 0 };
  }

  // 3. Urutkan transaksi sebelum dikirim: tanggal ASC, studentId ASC, MASUK (0) sebelum PULANG (1)
  pending.sort((a, b) => {
    const dateCmp = (a.attendanceDate || '').localeCompare(b.attendanceDate || '');
    if (dateCmp !== 0) return dateCmp;
    const studentCmp = (a.studentId || '').localeCompare(b.studentId || '');
    if (studentCmp !== 0) return studentCmp;
    const rankA = a.attendanceType === 'MASUK' ? 0 : 1;
    const rankB = b.attendanceType === 'MASUK' ? 0 : 1;
    if (rankA !== rankB) return rankA - rankB;
    return (a.deviceTimestamp || '').localeCompare(b.deviceTimestamp || '');
  });

  // Tandai transaksi sebagai SYNCING sementara proses kirim berlangsung
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
      invalidateApiCache('getAttendanceTransactions');
      invalidateApiCache('getParentSyncData');
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
 * Sinkronkan ulang seluruh transaksi lokal hari ini ke server MySQL (termasuk yang sudah SYNCED)
 * Memastikan semua jam masuk & jam pulang offline yang sempat tidak tersimpan di database server langsung tersinkron
 */
export async function forceResyncAllToday(
  deviceId: DeviceId
): Promise<{ success: boolean; count: number; error?: string }> {
  const today = getLocalDateString();
  const txs = await db.transactions
    .where('attendanceDate')
    .equals(today)
    .toArray();

  if (txs.length === 0) {
    return { success: true, count: 0 };
  }

  // Setel ulang status transaksi hari ini ke PENDING
  const txIds = txs.map((t) => t.transactionId);
  await db.transactions.where('transactionId').anyOf(txIds).modify({ syncStatus: 'PENDING' });

  // Jalankan sinkronisasi
  const res = await syncPendingTransactions(deviceId);
  return { success: res.success, count: txs.length, error: res.error };
}

/**
 * Unduh dan sinkronkan data master siswa dari backend database MySQL XAMPP / Google Sheets
 * Menggunakan Full Mirror Sync: Jika data di MySQL dihapus, IndexedDB lokal langsung mencerminkan penghapusan tersebut
 */
export async function fetchMasterStudentsFromSheets(): Promise<{
  success: boolean;
  total?: number;
  error?: string;
}> {
  const urls = buildBackendUrls();
  let lastError = '';

  for (const url of urls) {
    try {
      const res = await fetch(`${url}?action=getInitialData&token=${encodeURIComponent(getAppsScriptToken())}&_t=${Date.now()}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const json = await res.json();

      if (json && json.success && Array.isArray(json.students)) {
        // Full Mirror Sync: Hapus data lokal dan timpa dengan data terbaru dari database server
        await db.transaction('rw', db.students, async () => {
          await db.students.clear();
          if (json.students.length > 0) {
            await db.students.bulkPut(json.students);
          }
        });

        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('school_students_seed_initialized', 'true');
        }

        return { success: true, total: json.students.length };
      }
      if (json && json.error) lastError = json.error;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return { success: false, error: lastError || 'Tidak dapat terhubung ke database backend siswa.' };
}

/**
 * Sinkronkan akun pengguna (Admin, Operator, Orang Tua) dari database server MySQL
 */
export async function fetchUsersFromServer(): Promise<{
  success: boolean;
  users?: UserAccount[];
  error?: string;
}> {
  const urls = buildBackendUrls();
  let lastError = '';

  for (const url of urls) {
    try {
      const json = await cachedFetchJson(`${url}?action=getUsers`, 25000, {
        signal: AbortSignal.timeout(8000),
      });
      if (!json) continue;

      if (json && json.success && Array.isArray(json.users)) {
        // Filter: hanya masukkan akun STAFF (SUPER_ADMIN, ADMIN_PC) — PARENT ditangani oleh fetchParentsFromServer
        const staffOnly = json.users.filter((u: UserAccount) => u.role !== 'PARENT');
        if (staffOnly.length > 0) {
          await db.users.bulkPut(staffOnly);
        }
        return { success: true, users: staffOnly };
      }
      if (json && json.error) lastError = json.error;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return { success: false, error: lastError || 'Tidak dapat terhubung ke server database.' };
}

/**
 * Simpan akun pengguna ke database server MySQL
 */
export async function saveUserToServer(
  user: UserAccount
): Promise<{ success: boolean; error?: string }> {
  const urls = buildBackendUrls();

  let lastError = '';

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'saveUser',
          userId: user.userId,
          username: user.username,
          fullName: user.fullName,
          passwordHash: user.passwordHash,
          role: user.role,
          assignedDeviceId: user.assignedDeviceId,
          studentId: user.studentId || null,
          phone: user.phone || null,
          status: user.status,
        }),
      });
      if (!res.ok) continue;
      const json = await res.json();
      if (json && json.success) {
        invalidateApiCache('getUsers');
        return { success: true };
      }
      if (json && json.error) lastError = json.error;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return { success: false, error: lastError || 'Gagal menyimpan ke server database.' };
}

/**
 * Kirim/sinkronkan seluruh akun yang ada di IndexedDB PC ke database MySQL XAMPP
 */
export async function syncAllUsersToServer(): Promise<{
  success: boolean;
  syncedCount: number;
  total: number;
  error?: string;
}> {
  const users = await db.users.toArray();
  if (users.length === 0) {
    return { success: true, syncedCount: 0, total: 0 };
  }

  let synced = 0;
  let lastError = '';

  for (const u of users) {
    const res = u.role === 'PARENT' ? await saveParentToServer(u) : await saveUserToServer(u);
    if (res.success) {
      synced++;
    } else if (res.error) {
      lastError = res.error;
    }
  }

  invalidateApiCache('getUsers');
  invalidateApiCache('getParents');

  return {
    success: synced > 0,
    syncedCount: synced,
    total: users.length,
    error: lastError,
  };
}

/**
 * Hapus akun pengguna dari database server MySQL
 */
export async function deleteUserFromServer(
  userId: string,
  username?: string
): Promise<{ success: boolean; error?: string }> {
  const urls = buildBackendUrls();
  let lastError = '';

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'deleteUser',
          userId,
          username,
        }),
      });
      if (!res.ok) continue;
      const json = await res.json();
      if (json && json.success) {
        invalidateApiCache('getUsers');
        return { success: true };
      }
      if (json && json.error) lastError = json.error;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return { success: false, error: lastError || 'Gagal menghapus di server database.' };
}

// Key localStorage untuk menyimpan ID orang tua yang sudah dihapus lokal
const DELETED_PARENT_IDS_KEY = 'deleted_parent_ids';

function getDeletedParentIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_PARENT_IDS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function markParentAsDeleted(id: string, phone?: string) {
  const ids = getDeletedParentIds();
  if (id) ids.add(id);
  if (phone) {
    ids.add(phone);
    ids.add(normalizePhoneNumber(phone));
    const cleanDigits = phone.replace(/[^0-9]/g, '');
    if (cleanDigits) ids.add(cleanDigits);
  }
  localStorage.setItem(DELETED_PARENT_IDS_KEY, JSON.stringify([...ids]));
}

export function clearDeletedParentId(id: string, phone?: string) {
  const ids = getDeletedParentIds();
  if (id) ids.delete(id);
  if (phone) {
    ids.delete(phone);
    ids.delete(normalizePhoneNumber(phone));
    const cleanDigits = phone.replace(/[^0-9]/g, '');
    if (cleanDigits) ids.delete(cleanDigits);
  }
  localStorage.setItem(DELETED_PARENT_IDS_KEY, JSON.stringify([...ids]));
}

/**
 * Sinkronkan akun orang tua dari tabel terpisah (orang_tua) di MySQL
 */
export async function fetchParentsFromServer(): Promise<{
  success: boolean;
  parents?: UserAccount[];
  error?: string;
}> {
  const urls = buildBackendUrls();

  let lastError = '';

  for (const url of urls) {
    try {
      const json = await cachedFetchJson(`${url}?action=getParents&_t=${Date.now()}`, 5000, {
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
      if (!json) continue;

      if (json && json.success && Array.isArray(json.parents)) {
        // Jika server mengembalikan daftar deletedAccounts, tandai ke localStorage
        if (Array.isArray(json.deletedAccounts)) {
          for (const d of json.deletedAccounts) {
            if (d.identifier || d.phone) {
              markParentAsDeleted(d.identifier, d.phone);
            }
          }
        }

        // Akun yang aktif di daftar parents server secara tegas BUKAN terhapus (bersihkan tanda deleted lama)
        for (const p of json.parents) {
          const id = p.userId || (p as any).id || '';
          const phone = p.phone || p.username || '';
          clearDeletedParentId(id, phone);
        }

        // Filter: jangan masukkan akun yang sudah ditandai dihapus lokal
        const deletedIds = getDeletedParentIds();
        const filtered = json.parents.filter((p: UserAccount) => {
          const id = p.userId || (p as any).id || '';
          const phone = p.phone || p.username || '';
          const normPhone = normalizePhoneNumber(phone);
          const digits = phone.replace(/[^0-9]/g, '');
          return !deletedIds.has(id) && !deletedIds.has(phone) && !deletedIds.has(normPhone) && !deletedIds.has(digits);
        });

        // 1. Simpan/perbarui akun valid dari server ke IndexedDB
        if (filtered.length > 0) {
          const mapped = filtered.map((p: any) => {
            let sIds = p.studentIds;
            if (typeof sIds === 'string' && sIds.trim()) {
              sIds = sIds.split(',').map((x: string) => x.trim()).filter(Boolean);
            }
            if (!Array.isArray(sIds) || sIds.length === 0) {
              sIds = p.studentId ? [p.studentId] : [];
            }
            return {
              ...p,
              studentIds: sIds,
              studentId: sIds[0] || p.studentId || '',
            };
          });
          await db.users.bulkPut(mapped);
        }

        // 2. BERSIHKAN IndexedDB: Hapus akun orang tua lokal yang sudah TIDAK ADA di server MySQL atau sudah dihapus
        const serverParentIds = new Set(filtered.map((p: any) => p.userId || p.id));
        const serverParentPhones = new Set(
          filtered.map((p: any) => normalizePhoneNumber(p.phone || p.username || ''))
        );

        const localParents = await db.users.filter((u) => u.role === 'PARENT').toArray();
        for (const lp of localParents) {
          const lpNormPhone = normalizePhoneNumber(lp.phone || lp.username || '');
          const lpDigits = (lp.phone || lp.username || '').replace(/[^0-9]/g, '');

          const isMarkedDeleted =
            deletedIds.has(lp.userId) ||
            deletedIds.has(lp.phone || '') ||
            deletedIds.has(lp.username || '') ||
            deletedIds.has(lpNormPhone) ||
            deletedIds.has(lpDigits);

          const existsOnServer =
            serverParentIds.has(lp.userId) || serverParentPhones.has(lpNormPhone);

          if (isMarkedDeleted || !existsOnServer) {
            await db.users.delete(lp.userId);

            // Cek jika akun yang sedang aktif di HP ini adalah akun yang telah dihapus
            try {
              const storedRaw = localStorage.getItem('stored_user');
              if (storedRaw) {
                const storedUser = JSON.parse(storedRaw);
                // Hanya force-logout jika pengguna yang sedang login di perangkat ini adalah akun PARENT
                if (storedUser && storedUser.role === 'PARENT') {
                  const storedNorm = normalizePhoneNumber(storedUser.phone || storedUser.username || '');
                  if (
                    storedUser.userId === lp.userId ||
                    storedNorm === lpNormPhone ||
                    storedUser.username === lp.username ||
                    storedUser.phone === lp.phone
                  ) {
                    localStorage.removeItem('stored_user');
                    localStorage.removeItem('parent_push_subscribed');
                    localStorage.removeItem('parent_notif_enabled');
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(
                        new CustomEvent('force-logout', {
                          detail: { reason: 'Akun Anda telah dihapus atau dinonaktifkan oleh Administrator.' },
                        })
                      );
                    }
                  }
                }
              }
            } catch {}
          }
        }

        return { success: true, parents: filtered };
      }
      if (json && json.error) lastError = json.error;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return { success: false, error: lastError || 'Gagal memuat data orang tua dari server.' };
}

/**
 * Simpan akun orang tua ke tabel terpisah (orang_tua) di MySQL
 */
export async function saveParentToServer(
  parent: UserAccount,
  oldPhone?: string
): Promise<{ success: boolean; error?: string }> {
  clearDeletedParentId(parent.userId, parent.phone || parent.username);
  if (oldPhone) clearDeletedParentId(parent.userId, oldPhone);
  const urls = buildBackendUrls();
  let lastError = '';

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'saveParent',
          id: parent.userId,
          fullName: parent.fullName,
          phone: parent.phone || parent.username,
          oldPhone: oldPhone || '',
          username: parent.username,
          passwordHash: parent.passwordHash,
          studentId: parent.studentId || '',
          studentIds: parent.studentIds || (parent.studentId ? [parent.studentId] : []),
          status: parent.status || 'ACTIVE',
        }),
      });
      if (!res.ok) continue;
      const json = await res.json();
      if (json && json.success) {
        invalidateApiCache();
        return { success: true };
      }
      if (json && json.error) lastError = json.error;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return { success: false, error: lastError || 'Gagal menyimpan ke tabel orang_tua.' };
}

/**
 * Hapus akun orang tua dari tabel terpisah (orang_tua) di MySQL
 */
export async function deleteParentFromServer(
  id: string,
  phone?: string
): Promise<{ success: boolean; error?: string }> {
  const urls = buildBackendUrls();
  let lastError = '';

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'deleteParent',
          id,
          phone,
        }),
      });
      if (!res.ok) continue;
      const json = await res.json();
      if (json && json.success) {
        // Tandai sebagai deleted agar tidak di-sync kembali dari MySQL saat refresh
        markParentAsDeleted(id, phone);
        invalidateApiCache('getParents');
        invalidateApiCache('getParentSyncData');
        return { success: true };
      }
      if (json && json.error) lastError = json.error;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  // Jika semua URL gagal (MySQL tidak aktif), tetap tandai sebagai deleted lokal
  // agar tidak muncul lagi saat fetchParentsFromServer
  markParentAsDeleted(id, phone);
  invalidateApiCache('getParents');
  invalidateApiCache('getParentSyncData');

  return { success: false, error: lastError || 'Gagal menghapus dari tabel orang_tua.' };
}

/**
 * Tarik data profil siswa & seluruh riwayat absensi dari MySQL untuk portal orang tua di HP
 */
export async function syncParentPortalData(
  studentId: string,
  phone?: string,
  studentIds?: string[]
): Promise<{
  success: boolean;
  student?: any;
  students?: any[];
  transactionsCount?: number;
  accountDeleted?: boolean;
  error?: string;
}> {
  const urls = buildBackendUrls();
  let lastError = '';

  for (const url of urls) {
    try {
      const q = new URLSearchParams();
      q.set('action', 'getParentSyncData');
      if (studentId) q.set('studentId', studentId);
      if (phone) q.set('phone', phone);
      if (studentIds && studentIds.length > 0) {
        q.set('studentIds', studentIds.join(','));
      }

      const json = await cachedFetchJson(`${url}?${q.toString()}`, 12000, {
        signal: AbortSignal.timeout(8000),
      });
      if (!json) continue;

      if (json && json.accountDeleted) {
        // Akun ini telah dihapus oleh admin di database server
        if (phone) markParentAsDeleted('', phone);
        if (typeof window !== 'undefined') {
          try {
            const storedRaw = localStorage.getItem('stored_user');
            if (storedRaw) {
              const u = JSON.parse(storedRaw);
              // Hanya logout paksa jika akun yang login adalah PARENT
              if (u && u.role === 'PARENT') {
                localStorage.removeItem('stored_user');
                localStorage.removeItem('parent_push_subscribed');
                localStorage.removeItem('parent_notif_enabled');
                window.dispatchEvent(
                  new CustomEvent('force-logout', {
                    detail: { reason: json.error || 'Akun Anda telah dihapus oleh pihak madrasah.' },
                  })
                );
              }
            }
          } catch {}
        }
        return {
          success: false,
          accountDeleted: true,
          error: json.error || 'Akun orang tua ini telah dihapus oleh Administrator madrasah.',
        };
      }

      if (json && json.success) {
        // Sinkronkan pengaturan jadwal sekolah dari server ke localStorage
        if (json.settings) {
          if (json.settings.entry_limit) localStorage.setItem('school_entry_limit', json.settings.entry_limit);
          if (json.settings.entry_start) localStorage.setItem('school_entry_start', json.settings.entry_start);
          if (json.settings.late_limit) localStorage.setItem('school_late_limit', json.settings.late_limit);
          if (json.settings.dismissal) localStorage.setItem('school_dismissal_time', json.settings.dismissal);
          if (json.settings.timezone) localStorage.setItem('school_timezone', json.settings.timezone);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('school-settings-updated', { detail: json.settings }));
          }
        }
        // Simpan data siswa ke IndexedDB lokal (mendukung multi-anak)
        if (Array.isArray(json.students) && json.students.length > 0) {
          await db.students.bulkPut(json.students);
        } else if (json.student && json.student.id) {
          await db.students.put(json.student);
        }
        // Simpan seluruh riwayat transaksi untuk seluruh anak ke IndexedDB lokal
        if (Array.isArray(json.transactions) && json.transactions.length > 0) {
          try {
            // Bersihkan duplikat lama dengan suffix berulang _IN_IN jika ada
            const targetIds: string[] = Array.isArray(json.students) && json.students.length > 0
              ? json.students.map((s: any) => s.id)
              : [studentId];
            const oldDups = await db.transactions
              .where('studentId')
              .anyOf(targetIds)
              .filter((t) => t.transactionId.includes('_IN_IN') || t.transactionId.includes('_OUT_OUT'))
              .toArray();
            if (oldDups.length > 0) {
              await db.transactions.bulkDelete(oldDups.map((d) => d.transactionId));
            }
          } catch {}
          await db.transactions.bulkPut(json.transactions);
        }
        return {
          success: true,
          student: json.student,
          students: json.students,
          transactionsCount: json.transactions ? json.transactions.length : 0,
        };
      }
      if (json && json.error) lastError = json.error;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return { success: false, error: lastError || 'Gagal menyinkronkan data presensi anak.' };
}

/**
 * Tarik seluruh riwayat presensi siswa tertentu dari MySQL ke IndexedDB lokal
 * Khusus untuk tampilan riwayat presensi di Dashboard Admin & Siswa
 * (Aman, tanpa validasi/force-logout akun orang tua)
 */
export async function syncStudentAttendanceHistory(
  studentId: string
): Promise<{ success: boolean; count: number; error?: string }> {
  if (!studentId) return { success: false, count: 0 };
  const urls = buildBackendUrls();
  let lastError = '';

  for (const url of urls) {
    try {
      const q = new URLSearchParams();
      q.set('action', 'getParentSyncData');
      q.set('studentId', studentId);
      // PENTING: Jangan sertakan parameter phone di sini agar server tidak mengecek tabel deleted_accounts orang tua

      const json = await cachedFetchJson(`${url}?${q.toString()}`, 8000, {
        signal: AbortSignal.timeout(8000),
      });
      if (!json) continue;

      if (json && json.success) {
        if (Array.isArray(json.transactions) && json.transactions.length > 0) {
          await db.transactions.bulkPut(json.transactions);
        }
        return {
          success: true,
          count: json.transactions ? json.transactions.length : 0,
        };
      }
      if (json && json.error) lastError = json.error;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return { success: false, count: 0, error: lastError || 'Gagal memuat riwayat kehadiran siswa.' };
}

/**
 * Simpan pengaturan jadwal sekolah ke tabel `pengaturan` MySQL di server
 */
export async function saveSchoolSettingsToServer(
  settings: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
  const urls = buildBackendUrls();
  let lastError = '';

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'saveSettings', settings }),
      });
      if (!res.ok) continue;
      const json = await res.json();
      if (json && json.success) {
        invalidateApiCache('getSettings');
        invalidateApiCache('getParentSyncData');
        return { success: true };
      }
      if (json && json.error) lastError = json.error;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return { success: false, error: lastError || 'Gagal menyimpan pengaturan ke server.' };
}

/**
 * Ambil pengaturan jadwal sekolah terbaru dari MySQL dan simpan ke localStorage
 */
export async function fetchSchoolSettingsFromServer(): Promise<{ success: boolean; error?: string }> {
  const urls = buildBackendUrls();
  let lastError = '';

  for (const url of urls) {
    try {
      const json = await cachedFetchJson(`${url}?action=getSettings`, 60000);
      if (!json) continue;
      if (json && json.success && json.settings) {
        const s = json.settings;
        if (s.entry_limit) localStorage.setItem('school_entry_limit', s.entry_limit);
        if (s.entry_start) localStorage.setItem('school_entry_start', s.entry_start);
        if (s.late_limit) localStorage.setItem('school_late_limit', s.late_limit);
        if (s.dismissal) localStorage.setItem('school_dismissal_time', s.dismissal);
        if (s.timezone) localStorage.setItem('school_timezone', s.timezone);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('school-settings-updated', { detail: s }));
        }
        return { success: true };
      }
      if (json && json.error) lastError = json.error;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return { success: false, error: lastError || 'Gagal mengambil pengaturan dari server.' };
}

/**
 * Tarik seluruh transaksi absensi tanggal tertentu dari database server MySQL ke IndexedDB lokal
 * Ini memastikan Dashboard Admin di PC/Laptop menampilkan presensi yang di-scan dari HP secara real-time!
 */
export async function fetchAttendanceTransactionsFromServer(
  date?: string
): Promise<{ success: boolean; count: number; error?: string }> {
  const targetDate = date || getLocalDateString();
  const urls = buildBackendUrls();
  let lastError = '';

  for (const url of urls) {
    try {
      const json = await cachedFetchJson(
        `${url}?action=getAttendanceTransactions&date=${encodeURIComponent(targetDate)}`,
        12000,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!json) continue;

      if (json && json.success && Array.isArray(json.transactions)) {
        if (json.transactions.length > 0) {
          // Lindungi transaksi lokal yang statusnya masih PENDING agar tidak tertimpa
          const localPending = await db.transactions
            .where('attendanceDate')
            .equals(targetDate)
            .filter((t) => t.syncStatus === 'PENDING')
            .toArray();
          const pendingIds = new Set(localPending.map((p) => p.transactionId));

          const toSave = json.transactions.filter(
            (st: AttendanceTransaction) => !pendingIds.has(st.transactionId)
          );

          if (toSave.length > 0) {
            // Bersihkan transaksi lokal lama yang duplikat (misal ID tanpa akhiran _IN / _OUT)
            const localSameDate = await db.transactions
              .where('attendanceDate')
              .equals(targetDate)
              .toArray();

            const toDeleteIds: string[] = [];
            for (const st of toSave) {
              const dupes = localSameDate.filter(
                (lt) =>
                  lt.studentId === st.studentId &&
                  lt.attendanceType === st.attendanceType &&
                  lt.transactionId !== st.transactionId &&
                  lt.syncStatus !== 'PENDING'
              );
              dupes.forEach((d) => toDeleteIds.push(d.transactionId));
            }

            if (toDeleteIds.length > 0) {
              await db.transactions.bulkDelete(toDeleteIds);
            }

            await db.transactions.bulkPut(toSave);
          }
        }
        return { success: true, count: json.transactions.length };
      }
      if (json && json.error) lastError = json.error;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return { success: false, count: 0, error: lastError || 'Tidak dapat menarik data transaksi dari server.' };
}

/**
 * Validasi apakah akun pengguna masih terdaftar dan aktif di database server MySQL
 * Dipanggil saat App boot, login, dan secara periodik di background
 */
export async function validateUserSession(
  user: UserAccount
): Promise<{ valid: boolean; reason?: string; message?: string }> {
  if (!user) return { valid: false, reason: 'NO_USER' };

  // Jika sedang offline di browser, izinkan tetap aktif untuk fitur offline
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { valid: true };
  }

  const urls = buildBackendUrls();
  for (const url of urls) {
    try {
      const q = new URLSearchParams();
      q.set('action', 'validateSession');
      if (user.userId) q.set('userId', user.userId);
      if (user.username) q.set('username', user.username);
      if (user.phone) q.set('phone', user.phone);
      if (user.role) q.set('role', user.role);

      const res = await fetch(`${url}?${q.toString()}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;
      const json = await res.json();
      if (json && typeof json.valid === 'boolean') {
        if (!json.valid) {
          // Akun sudah tidak valid / telah dihapus di server
          await db.users.delete(user.userId).catch(() => {});
          if (user.phone) markParentAsDeleted(user.userId, user.phone);
          if (user.username) markParentAsDeleted(user.userId, user.username);
        }
        return { valid: json.valid, reason: json.reason, message: json.message };
      }
    } catch {
      // Gagal menghubungi URL ini, coba URL berikutnya
    }
  }

  // Jika server MySQL tidak bisa dihubungi sama sekali, jangan tendang user offline
  return { valid: true };
}

/**
 * Periksa apakah suatu nomor telepon atau username terdaftar dalam daftar akun yang dihapus
 */
export async function checkIsAccountDeleted(identifier: string): Promise<boolean> {
  if (!identifier) return false;
  const clean = identifier.trim();
  const norm = normalizePhoneNumber(clean);
  const digits = clean.replace(/[^0-9]/g, '');

  // 1. Cek apakah akun ini justru ada dan aktif di database lokal (IndexedDB)
  const localActive = await db.users.filter((u) => {
    if (u.role !== 'PARENT' || u.status !== 'ACTIVE') return false;
    const uPhoneNorm = normalizePhoneNumber(u.phone || u.username || '');
    const uDigits = (u.phone || u.username || '').replace(/[^0-9]/g, '');
    return (
      u.username.toLowerCase() === clean.toLowerCase() ||
      (norm && uPhoneNorm === norm) ||
      (digits && uDigits === digits)
    );
  }).first();

  if (localActive) {
    clearDeletedParentId(localActive.userId, clean);
    return false;
  }

  const deletedIds = getDeletedParentIds();
  if (deletedIds.has(clean) || (norm && deletedIds.has(norm)) || (digits && deletedIds.has(digits))) {
    return true;
  }

  // Jika online, verifikasi cepat ke server
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    const urls = buildBackendUrls();
    for (const url of urls) {
      try {
        const q = new URLSearchParams();
        q.set('action', 'validateSession');
        q.set('phone', clean);
        q.set('username', clean);
        q.set('role', 'PARENT');
        const res = await fetch(`${url}?${q.toString()}`, { signal: AbortSignal.timeout(4000) });
        if (res.ok) {
          const json = await res.json();
          if (json && json.valid === false && json.reason === 'DELETED') {
            markParentAsDeleted('', clean);
            return true;
          }
        }
      } catch {}
    }
  }

  return false;
}



