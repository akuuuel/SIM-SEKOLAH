// ========================================================
// Service Pengaturan Hari Libur & Kalender Efektif Madrasah
// MAN 1 BULUKUMBA
// ========================================================

export interface HolidayRecord {
  date: string; // YYYY-MM-DD
  name: string; // contoh: "Hari Libur Nasional / Acara Madrasah"
  type: 'HOLIDAY' | 'SPECIAL_EVENT';
  note?: string;
  createdAt: string;
}

const STORAGE_KEY_HOLIDAYS = 'school_custom_holidays';

export function getCustomHolidays(): HolidayRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HOLIDAYS);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveCustomHolidays(holidays: HolidayRecord[]) {
  localStorage.setItem(STORAGE_KEY_HOLIDAYS, JSON.stringify(holidays));
}

export function addCustomHoliday(holiday: Omit<HolidayRecord, 'createdAt'>) {
  const current = getCustomHolidays();
  const exists = current.some((h) => h.date === holiday.date);
  if (exists) {
    const updated = current.map((h) => (h.date === holiday.date ? { ...holiday, createdAt: new Date().toISOString() } : h));
    saveCustomHolidays(updated);
  } else {
    current.push({ ...holiday, createdAt: new Date().toISOString() });
    saveCustomHolidays(current);
  }
}

export function removeCustomHoliday(date: string) {
  const current = getCustomHolidays();
  const filtered = current.filter((h) => h.date !== date);
  saveCustomHolidays(filtered);
}

/**
 * Cek apakah tanggal tertentu adalah hari libur:
 * 1. Hari Minggu (day === 0)
 * 2. Tanggal terdaftar dalam daftar libur kustom / acara madrasah
 */
export function checkIsDayOff(dateStr: string): { isDayOff: boolean; reason: string; type?: 'SUNDAY' | 'HOLIDAY' | 'SPECIAL_EVENT' } {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    
    // Hari Minggu = Libur Rutin
    if (dateObj.getDay() === 0) {
      return {
        isDayOff: true,
        reason: 'Hari Minggu (Libur Rutin)',
        type: 'SUNDAY',
      };
    }

    // Cek daftar libur khusus / acara
    const holidays = getCustomHolidays();
    const found = holidays.find((h) => h.date === dateStr);
    if (found) {
      return {
        isDayOff: true,
        reason: found.name,
        type: found.type,
      };
    }

    return { isDayOff: false, reason: 'Hari Efektif Belajar' };
  } catch {
    return { isDayOff: false, reason: 'Hari Efektif Belajar' };
  }
}

