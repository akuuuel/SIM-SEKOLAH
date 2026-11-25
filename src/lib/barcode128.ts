// =======================================================================
// Generator Barcode Code 128 (Subtipe B) — 100% Offline & Murni TypeScript
// Standar ISO/IEC 15417 — Menghasilkan barcode presisi tinggi tanpa CDN
// =======================================================================

// Pola Code 128: Setiap karakter diwakili oleh 6 elemen (3 garis bar, 3 celah space)
// Total lebar modul per karakter = 11 modul (kecuali Stop character = 13 modul)
const CODE128_PATTERNS: number[] = [
  212222, 222122, 222221, 121223, 121322, 131222, 122213, 122312, 132212, 221213, // 0 - 9
  221312, 231212, 112232, 122132, 122231, 113222, 123122, 123221, 223211, 221132, // 10 - 19
  221231, 213212, 223112, 312131, 311222, 321122, 321221, 312212, 322112, 322211, // 20 - 29
  212123, 212321, 232121, 111323, 131123, 131321, 112313, 132113, 132311, 211313, // 30 - 39
  231113, 231311, 112133, 112331, 132131, 113123, 113321, 133121, 313121, 211331, // 40 - 49
  231131, 213113, 213311, 213131, 311123, 311321, 331121, 312113, 312311, 332111, // 50 - 59
  314111, 221411, 431111, 111224, 111422, 121124, 121421, 141122, 141221, 112214, // 60 - 69
  112412, 122114, 122411, 142112, 142211, 241211, 221114, 413111, 241112, 134111, // 70 - 79
  111242, 121142, 121241, 114212, 124112, 124211, 411212, 421112, 421211, 212141, // 80 - 89
  214121, 412121, 111143, 111341, 131141, 114113, 114311, 411113, 411311, 113141, // 90 - 99
  114131, 311141, 411131, 211412, 211214, 211232, 2331112 // 100 - 106 (106 = STOP)
];

const START_CODE_B = 104;
const STOP_CODE = 106;

/**
 * Menghasilkan array modul biner (1 untuk bar hitam, 0 untuk space putih)
 * untuk string alfanumerik yang diberikan (menggunakan Code 128 Subset B).
 */
export function encodeCode128B(text: string): number[] {
  if (!text) return [];

  const values: number[] = [START_CODE_B];
  let checksum = START_CODE_B;

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    // Karakter ASCII yang didukung Code 128B (32 sampai 126)
    const val = charCode >= 32 && charCode <= 126 ? charCode - 32 : 0;
    values.push(val);
    checksum += val * (i + 1);
  }

  const checkValue = checksum % 103;
  values.push(checkValue);
  values.push(STOP_CODE);

  // Ubah setiap pola angka menjadi modul bar & space
  const modules: number[] = [];

  // Quiet zone awal (minimal 10 modul putih)
  for (let q = 0; q < 10; q++) modules.push(0);

  for (let i = 0; i < values.length; i++) {
    const pattern = CODE128_PATTERNS[values[i]];
    const patternStr = pattern.toString();
    for (let j = 0; j < patternStr.length; j++) {
      const width = parseInt(patternStr[j], 10);
      const isBar = j % 2 === 0 ? 1 : 0;
      for (let w = 0; w < width; w++) {
        modules.push(isBar);
      }
    }
  }

  // Quiet zone akhir (minimal 10 modul putih)
  for (let q = 0; q < 10; q++) modules.push(0);

  return modules;
}

/**
 * Menggambar barcode Code 128 secara presisi ke elemen HTMLCanvasElement.
 */
export function renderCode128ToCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  options: {
    scale?: number;
    height?: number;
    margin?: number;
  } = {}
) {
  const { scale = 2, height = 65, margin = 4 } = options;
  const modules = encodeCode128B(text);
  if (modules.length === 0) return;

  const totalWidth = modules.length * scale + margin * 2;
  const totalHeight = height + margin * 2;

  canvas.width = totalWidth;
  canvas.height = totalHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Latar belakang putih bersih
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  // Gambar garis hitam
  ctx.fillStyle = '#000000';
  for (let i = 0; i < modules.length; i++) {
    if (modules[i] === 1) {
      ctx.fillRect(margin + i * scale, margin, scale, height);
    }
  }
}

