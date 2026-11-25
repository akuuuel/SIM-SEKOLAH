import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ========================================================
// Security Utilities
// ========================================================

/**
 * Pure JavaScript SHA-256 implementation sebagai fallback handal
 * ketika window.crypto.subtle tidak tersedia di non-HTTPS/HTTP IP lokal.
 */
function sha256Fallback(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let lengthProperty = 'length';
  let i = 0, j = 0;
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii[lengthProperty] * 8;

  let hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  let isComposite: Record<number, boolean> = {};
  for (let candidate = 2; k[lengthProperty] < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = true;
      }
      hash[k[lengthProperty]] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[k[lengthProperty]] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  ascii += '\x80';
  while ((ascii[lengthProperty] % 64) - 56) ascii += '\x00';
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return '';
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
  words[words[lengthProperty]] = asciiBitLength;

  for (j = 0; j < words[lengthProperty]; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash;
    hash = hash.slice(0, 8);

    for (i = 0; i < 64; i++) {
      const i2 = i + j;
      const w15 = w[i - 15],
        w2 = w[i - 2];

      const a = hash[0],
        e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);

      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (let b = 3; b >= 0; b--) {
      const byte = (hash[i] >> (b * 8)) & 255;
      result += (byte < 16 ? '0' : '') + byte.toString(16);
    }
  }
  return result;
}

/**
 * Hash password menggunakan SHA-256 (Web Crypto API jika tersedia, atau fallback pure JS)
 * Mendukung semua lingkungan: HTTPS, HTTP biasa, localhost, IP lokal HP, dan emulator.
 */
export async function hashPassword(password: string): Promise<string> {
  const salted = password + 'absensi_sekolah_salt_2026';

  // 1. Coba gunakan Web Crypto API bawaan jika didukung (HTTPS / localhost)
  if (
    typeof window !== 'undefined' &&
    window.crypto &&
    window.crypto.subtle &&
    typeof window.crypto.subtle.digest === 'function'
  ) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(salted);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Jika terjadi error, gunakan fallback di bawah
    }
  }

  // 2. Gunakan fallback pure JS (kompatibel 100% di HTTP HP / non-secure context)
  return sha256Fallback(salted);
}

/**
 * Verifikasi password dengan dukungan fleksibel:
 * 1. Salted SHA-256 (format enkripsi default aplikasi)
 * 2. Plaintext (jika admin input langsung kata sandi di phpMyAdmin / MySQL)
 * 3. Pure SHA-256 tanpa salt (jika di-hash fungsi SHA2 bawaan SQL)
 */
export async function verifyPassword(plainInput: string, storedHash: string): Promise<boolean> {
  if (!storedHash) return false;

  // 1. Salted hash bawaan aplikasi
  const saltedHash = await hashPassword(plainInput);
  if (storedHash === saltedHash) return true;

  // 2. Plaintext (jika di database disimpan teks biasa tanpa hash)
  if (storedHash === plainInput) return true;

  // 3. Pure SHA-256 tanpa salt
  const pureSha = sha256Fallback(plainInput);
  if (storedHash.toLowerCase() === pureSha.toLowerCase()) return true;

  return false;
}

/**
 * Sanitasi input string — hapus karakter berbahaya, trim, batas panjang
 */
export function sanitizeInput(input: string, maxLength = 100): string {
  return input
    .trim()
    .replace(/[<>"'`\\]/g, '') // hapus karakter HTML/script injection
    .substring(0, maxLength);
}

/**
 * Validasi format username — hanya huruf, angka, underscore, strip
 */
export function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9_-]{3,30}$/.test(username);
}

/**
 * Validasi kekuatan password minimal
 */
export function isStrongPassword(password: string): { valid: boolean; message: string } {
  if (password.length < 6) {
    return { valid: false, message: 'Password minimal 6 karakter.' };
  }
  return { valid: true, message: '' };
}

/**
 * Rate limiter sederhana berbasis localStorage (mencegah brute force login)
 * Maks 5 percobaan gagal dalam 5 menit
 */
const RATE_LIMIT_KEY = 'login_attempts';
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 menit

interface LoginAttemptRecord {
  count: number;
  firstAttemptAt: number;
  lockedUntil?: number;
}

export function checkLoginRateLimit(): { allowed: boolean; remainingMs?: number } {
  const raw = localStorage.getItem(RATE_LIMIT_KEY);
  const record: LoginAttemptRecord = raw ? JSON.parse(raw) : { count: 0, firstAttemptAt: Date.now() };

  const now = Date.now();

  // Cek apakah masih dalam status lockout
  if (record.lockedUntil && now < record.lockedUntil) {
    return { allowed: false, remainingMs: record.lockedUntil - now };
  }

  // Reset jika sudah lewat window 5 menit
  if (now - record.firstAttemptAt > LOCKOUT_MS) {
    localStorage.removeItem(RATE_LIMIT_KEY);
    return { allowed: true };
  }

  return { allowed: true };
}

export function recordFailedLoginAttempt(): void {
  const raw = localStorage.getItem(RATE_LIMIT_KEY);
  const now = Date.now();
  const record: LoginAttemptRecord = raw ? JSON.parse(raw) : { count: 0, firstAttemptAt: now };

  record.count += 1;

  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS;
  }

  localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(record));
}

export function resetLoginAttempts(): void {
  localStorage.removeItem(RATE_LIMIT_KEY);
}

/**
 * Ambil tanggal lokal perangkat dalam format YYYY-MM-DD
 * Mencegah bug toISOString() yang menghasilkan tanggal kemarin saat pagi hari (sebelum jam 08:00 WITA)
 */
export function getLocalDateString(dateInput: Date | string = new Date()): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) {
    const fallback = new Date();
    const y = fallback.getFullYear();
    const m = String(fallback.getMonth() + 1).padStart(2, '0');
    const day = String(fallback.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatTime(isoString: string): string {
  try {
    if (!isoString) return '--:--';
    // Jika sudah berupa format jam 'HH:mm' atau 'HH:mm:ss'
    if (/^\d{2}:\d{2}(:\d{2})?$/.test(isoString)) {
      return isoString.substring(0, 5);
    }
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d
      .toLocaleTimeString('id-ID', {
        timeZone: 'Asia/Makassar',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
      .replace(/\./g, ':');
  } catch {
    return isoString;
  }
}

export function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString('id-ID', {
      timeZone: 'Asia/Makassar',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return isoString;
  }
}

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Normalisasi nomor WhatsApp Indonesia (contoh: '+62 812-3456-7890' -> '081234567890')
 */
export function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';
  let cleaned = phone.replace(/[^0-9+]/g, '');
  if (cleaned.startsWith('+62')) {
    cleaned = '0' + cleaned.substring(3);
  } else if (cleaned.startsWith('62')) {
    cleaned = '0' + cleaned.substring(2);
  }
  return cleaned;
}

/**
 * Validasi apakah nomor HP Indonesia valid (diawali 08, panjang 10-14 digit)
 */
export function isValidIndonesianPhone(phone: string): boolean {
  const norm = normalizePhoneNumber(phone);
  return /^08[1-9][0-9]{7,11}$/.test(norm);
}

