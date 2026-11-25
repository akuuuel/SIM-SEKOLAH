import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
import { execSync } from 'child_process';

// Pastikan sertifikat SSL 2048-bit (SHA-256 + SAN) tersedia untuk Vite HTTPS Server
const sslKeyPath = path.resolve(__dirname, 'ssl/server.key');
const sslCrtPath = path.resolve(__dirname, 'ssl/server.crt');
let needGenerateSsl = !fs.existsSync(sslKeyPath) || !fs.existsSync(sslCrtPath);

// Validasi apakah sertifikat yang ada adalah format lama SHA-1 yang memicu error 'ee key too small' di Node.js
if (!needGenerateSsl && fs.existsSync(sslCrtPath)) {
  const crtText = fs.readFileSync(sslCrtPath, 'utf8');
  if (crtText.includes('0BAQUF')) {
    needGenerateSsl = true;
    try { fs.unlinkSync(sslKeyPath); } catch (_) {}
    try { fs.unlinkSync(sslCrtPath); } catch (_) {}
  }
}

if (needGenerateSsl) {
  try {
    const phpExe = fs.existsSync('C:/xampp.new/php/php.exe') ? 'C:/xampp.new/php/php.exe' : 'php';
    execSync(`"${phpExe}" "${path.resolve(__dirname, 'api/make_ssl.php')}"`);
  } catch (err) {
    console.warn('Gagal men-generate SSL via PHP:', err);
  }
}

try {
  const phpExe = fs.existsSync('C:/xampp.new/php/php.exe') ? 'C:/xampp.new/php/php.exe' : 'php';
  execSync(`"${phpExe}" "${path.resolve(__dirname, 'api/generate_logo_assets.php')}"`);
} catch (err) {
  console.warn('Gagal run generate_logo_assets.php:', err);
}

// Generator PNG Icon PWA Standalone (100% Native Node.js)
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf: Buffer): number {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function makePng(width: number, height: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // 8-bit
  ihdrData.writeUInt8(6, 9); // RGBA
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);

  const makeChunk = (type: string, data: Buffer) => {
    const len = data.length;
    const buf = Buffer.alloc(8 + len + 4);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);
    const crc = crc32(buf.subarray(4, 8 + len));
    buf.writeUInt32BE(crc, 8 + len);
    return buf;
  };

  const ihdr = makeChunk('IHDR', ihdrData);
  const rowSize = 1 + width * 4;
  const raw = Buffer.alloc(rowSize * height);

  // Background Hijau Madrasah (#16A34A: 22, 163, 74) dengan Emblem Putih M1B
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    raw[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + 1 + x * 4;
      const cx = width / 2;
      const cy = height / 2;
      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - cy);

      // Emblem M1B putih di bagian tengah
      const isEmblem =
        dx < width * 0.28 &&
        dy < height * 0.28 &&
        (dy < height * 0.05 ||
          (dx < width * 0.07 && dy < height * 0.22) ||
          (dx > width * 0.16 && dy < height * 0.22));

      if (isEmblem) {
        raw[idx] = 255;
        raw[idx + 1] = 255;
        raw[idx + 2] = 255;
        raw[idx + 3] = 255;
      } else {
        raw[idx] = 22;
        raw[idx + 1] = 163;
        raw[idx + 2] = 74;
        raw[idx + 3] = 255;
      }
    }
  }

  const idat = makeChunk('IDAT', zlib.deflateSync(raw));
  const iend = makeChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([signature, ihdr, idat, iend]);
}

// Plugin untuk membuat dan melayani file PNG Icon PWA secara otomatis
// Plugin untuk melayani file PNG Icon PWA secara optimal
function pwaIconPlugin() {
  return {
    name: 'pwa-icon-plugin',
    configureServer(server: any) {
      const publicDir = path.resolve(__dirname, './public');
      // Middleware melayani icon asli dari public jika diminta
      server.middlewares.use((req: any, res: any, next: any) => {
        const urlPath = req.url ? req.url.split('?')[0] : '';
        if (['/icon-192.png', '/apple-touch-icon.png', '/favicon.png'].includes(urlPath)) {
          const filePath = path.join(publicDir, 'icon-192.png');
          if (fs.existsSync(filePath)) {
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.end(fs.readFileSync(filePath));
            return;
          }
        }
        if (['/icon-512.png', '/maskable-icon-512.png', '/logo.png'].includes(urlPath)) {
          const filePath = path.join(publicDir, 'icon-512.png');
          if (fs.existsSync(filePath)) {
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.end(fs.readFileSync(filePath));
            return;
          }
        }
        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), pwaIconPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'dexie',
      'dexie-react-hooks',
      'lucide-react',
      'clsx',
      'tailwind-merge',
    ],
  },
  server: {
    host: true, // Mengizinkan akses dari HP & perangkat lain di jaringan Wi-Fi lokal
    port: 3000,
    open: true,
    allowedHosts: true, // Mengizinkan akses via tunneling publik (ngrok, Cloudflare Tunnel, dll.) di Vite 6
    // Jalankan HTTP biasa di port 3000 agar ngrok bisa meneruskan tanpa error TLS (ngrok sendiri sudah menyediakan SSL/HTTPS resmi)
    https: undefined,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1',
        changeOrigin: true,
        rewrite: (path) => '/Web%20Absensi' + path,
      },
      '/Web%20Absensi/api': {
        target: 'http://127.0.0.1',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: true,
    port: 3000,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1',
        changeOrigin: true,
        rewrite: (path) => '/Web%20Absensi' + path,
      },
      '/Web%20Absensi/api': {
        target: 'http://127.0.0.1',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },
  },
});
