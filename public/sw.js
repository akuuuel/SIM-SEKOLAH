// Service Worker — PWA MAN 1 BULUKUMBA Offline-First v48 (iOS Safari & Android WebKit Full Support)
const CACHE_STATIC_NAME = 'absensi-m1b-static-v48';
const CACHE_DYNAMIC_NAME = 'absensi-m1b-dynamic-v48';
const CACHE_CDN_NAME = 'absensi-m1b-cdn-v48';

// Aset inti yang selalu di-precache saat SW install (hanya file statis yang selalu ada)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/splash.css',
  '/manifest.json',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/maskable-icon-512.png',
  '/apple-touch-icon.png',
  '/favicon.png',
  '/badge-96.png',
];

// Helper: Fetch aman yang menyertakan header bypass ngrok agar tidak meng-cache halaman peringatan ngrok
async function safeFetchAndCache(url, cache) {
  try {
    const res = await fetch(url, {
      headers: { 'ngrok-skip-browser-warning': 'true' },
    });
    if (res && res.status === 200) {
      await cache.put(url, res.clone());
      // Jika yang di-cache adalah root '/' atau '/index.html', simpan juga untuk pasangannya
      if (url === '/') {
        await cache.put('/index.html', res.clone());
      } else if (url === '/index.html') {
        await cache.put('/', res.clone());
      }
    }
  } catch (err) {
    console.warn('[SW-v41] Gagal pre-cache:', url, err);
  }
}

// ─── INSTALL: Precache aset inti ───────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC_NAME).then(async (cache) => {
      // Pre-cache setiap aset secara independen dengan header bypass ngrok
      await Promise.allSettled(STATIC_ASSETS.map((url) => safeFetchAndCache(url, cache)));
    })
  );
  // Aktifkan langsung tanpa menunggu sesi lama ditutup
  self.skipWaiting();
});

// ─── ACTIVATE: Hapus cache versi lama ───────────────────────────────────────
self.addEventListener('activate', (event) => {
  const CURRENT_CACHES = [CACHE_STATIC_NAME, CACHE_DYNAMIC_NAME, CACHE_CDN_NAME];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !CURRENT_CACHES.includes(key))
          .map((key) => {
            console.log('[SW-v38] Menghapus cache usang:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ─── FETCH: Penanganan request dengan kompatibilitas tinggi untuk iOS Safari ─
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Abaikan request selain GET
  if (req.method !== 'GET') return;

  // 2. Vite internal modules pada mode dev (selalu teruskan dengan header bypass ngrok)
  if (
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/') ||
    url.search.includes('t=')
  ) {
    event.respondWith(
      fetch(req, { headers: { 'ngrok-skip-browser-warning': 'true' } }).catch(() => fetch(req))
    );
    return;
  }

  // 3. Permintaan Navigasi SPA (Halaman HTML di iOS Safari & Android)
  // STRATEGI: Network-First dengan Fallback ke Cache
  // Ketika online, browser SELALU memuat HTML terbaru dari server agar React tidak macet di splash screen.
  // Cache lokal hanya digunakan saat jaringan offline total.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        // A. Coba ambil dari jaringan terlebih dahulu (Online First)
        try {
          const networkRes = await fetch(req, {
            headers: { 'ngrok-skip-browser-warning': 'true' },
          });
          if (networkRes && networkRes.status === 200) {
            // Deteksi interstitial ngrok (halaman peringatan kecil < 500 byte)
            const clone = networkRes.clone();
            const text = await clone.text();
            const isNgrokInterstitial = text.includes('ERR_NGROK_6024') || text.includes('ngrok') && text.length < 600;
            if (isNgrokInterstitial) {
              // Redirect ke URL yang sama dengan query param bypass ngrok
              const redirectUrl = new URL(req.url);
              redirectUrl.searchParams.set('ngrok-skip-browser-warning', 'true');
              return Response.redirect(redirectUrl.toString(), 302);
            }
            const cache = await caches.open(CACHE_STATIC_NAME);
            const textRes = new Response(text, {
              status: networkRes.status,
              statusText: networkRes.statusText,
              headers: networkRes.headers,
            });
            await cache.put(req, textRes.clone());
            await cache.put('/index.html', textRes.clone());
            await cache.put('/', textRes.clone());
            return textRes;
          }
        } catch (_) {
          // Jaringan offline atau gagal: beralih ke cache lokal
        }

        // B. Fallback ke cache lokal jika perangkat sedang offline
        try {
          const cached =
            (await caches.match(req, { ignoreSearch: true })) ||
            (await caches.match('/index.html')) ||
            (await caches.match('/'));
          if (cached) return cached;
        } catch (_) {}

        // C. Fallback darurat jika belum pernah dicache sama sekali
        return offlineFallback();
      })()
    );
    return;
  }

  // 4. API Backend — Network First dengan timeout 5 detik
  if (url.pathname.includes('/api/')) {
    event.respondWith(
      (async () => {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 5000);
          const networkRes = await fetch(req, { signal: controller.signal });
          clearTimeout(timer);
          if (networkRes && networkRes.status === 200) {
            const cache = await caches.open(CACHE_DYNAMIC_NAME);
            await cache.put(req, networkRes.clone());
          }
          return networkRes;
        } catch (_) {
          const cached = await caches.match(req);
          if (cached) return cached;
          return new Response(JSON.stringify({ success: false, offline: true, error: 'Offline' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          });
        }
      })()
    );
    return;
  }

  // 5. CDN Aset Eksternal (Fonts Google, jsDelivr, unpkg)
  const isCdn =
    url.hostname.includes('jsdelivr.net') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('cdnjs.cloudflare.com');

  if (isCdn) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res && res.status === 200) {
            const cache = await caches.open(CACHE_CDN_NAME);
            await cache.put(req, res.clone());
          }
          return res;
        } catch (_) {
          // Jangan kembalikan undefined (mencegah crash WebKit iOS)
          return new Response('', { status: 408, statusText: 'Offline' });
        }
      })()
    );
    return;
  }

  // 6. Aset Bundel Vite (/assets/*.js, *.css), Ikon, Gambar, Script
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.json') ||
    url.pathname.endsWith('.webmanifest') ||
    req.destination === 'image' ||
    req.destination === 'style' ||
    req.destination === 'script' ||
    req.destination === 'font'
  ) {
    event.respondWith(
      (async () => {
        // Cek cache dulu (Cache-First)
        const cached =
          (await caches.match(req, { ignoreSearch: true })) ||
          (await caches.match(url.pathname));
        if (cached) return cached;

        try {
          const networkRes = await fetch(req, {
            headers: { 'ngrok-skip-browser-warning': 'true' },
          });
          if (networkRes && networkRes.status === 200) {
            const cacheName = url.pathname.startsWith('/assets/')
              ? CACHE_DYNAMIC_NAME
              : CACHE_STATIC_NAME;
            const cache = await caches.open(cacheName);
            await cache.put(req, networkRes.clone());
          }
          return networkRes;
        } catch (err) {
          if (req.destination === 'image' || url.pathname.endsWith('.png') || url.pathname.endsWith('.svg')) {
            const fallbackIcon = (await caches.match('/favicon.svg')) || (await caches.match('/icon-192.png'));
            if (fallbackIcon) return fallbackIcon;
          }
          // PENTING UNTUK IOS SAFARI: Selalu kembalikan Response valid, bukan undefined
          return new Response('', { status: 408, statusText: 'Resource Unavailable Offline' });
        }
      })()
    );
    return;
  }

  // 7. Request Lainnya — Network First dengan cache fallback
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        if (res && res.status === 200) {
          const cache = await caches.open(CACHE_DYNAMIC_NAME);
          await cache.put(req, res.clone());
        }
        return res;
      } catch (_) {
        const cached = await caches.match(req);
        if (cached) return cached;
        return new Response('', { status: 408, statusText: 'Offline' });
      }
    })()
  );
});

// ─── OFFLINE FALLBACK PAGE ──────────────────────────────────────────────────
function offlineFallback() {
  return new Response(
    `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>Offline — Absensi M1B</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           display: flex; align-items: center; justify-content: center; min-height: 100vh;
           margin: 0; background: #f4faf5; color: #0f2419; text-align: center; padding: 24px; box-sizing: border-box; }
    .card { background: #ffffff; padding: 32px 24px; border-radius: 24px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.06); max-width: 360px; width: 100%; }
    .icon { width: 64px; height: 64px; background: linear-gradient(135deg, #16A34A, #22C55E);
            border-radius: 20px; display: flex; align-items: center; justify-content: center;
            margin: 0 auto 16px; font-size: 30px; box-shadow: 0 8px 16px -4px rgba(22, 163, 74, 0.3); }
    h1 { font-size: 18px; font-weight: 700; margin: 0 0 8px; color: #112918; }
    p { font-size: 13px; color: #52665a; margin: 0 0 24px; line-height: 1.5; }
    button { background: #16A34A; color: white; border: none; padding: 12px 28px;
             border-radius: 14px; font-size: 14px; font-weight: 600; cursor: pointer; width: 100%; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">📡</div>
    <h1>Mode Offline</h1>
    <p>Aplikasi sedang offline. Data absensi yang sudah tersimpan tetap aman di perangkat Anda.</p>
    <button onclick="location.reload()">Muat Ulang</button>
  </div>
</body>
</html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

// ─── MESSAGE EVENT: Cache warming dari halaman index ─────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CACHE_ASSETS' && Array.isArray(event.data.urls)) {
    caches.open(CACHE_DYNAMIC_NAME).then((cache) => {
      event.data.urls.forEach((url) => {
        cache.match(url).then((existing) => {
          if (!existing) {
            fetch(url, { headers: { 'ngrok-skip-browser-warning': 'true' } })
              .then((res) => {
                if (res && res.status === 200) cache.put(url, res);
              })
              .catch(() => {});
          }
        });
      });
    });
  }
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Penanganan Notifikasi PWA & Klik Aksi Tombol
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Jika pengguna menekan tombol aksi 'close', tutup notifikasi tanpa membuka browser
  if (event.action === 'close') {
    return;
  }
  const urlToOpen = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(urlToOpen);
    })
  );
});

// Web Push Notification — Pop-up Layar Kunci & Spanduk Atas (Heads-up / Lock Screen Pop-up)
self.addEventListener('push', (event) => {
  // Parse payload — robust terhadap push tanpa payload (tickle push fallback)
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (_) {
      try {
        const text = event.data.text();
        if (text) data = { body: text };
      } catch (_2) {}
    }
  }

  const title = data.title || 'Presensi Siswa MAN 1 BULUKUMBA';
  const body  = data.body  || 'Pemberitahuan absensi siswa diterima.';
  // Pertahankan tag deterministik agar Android NotificationManager otomatis meng-collapse notifikasi duplikat
  const tag   = data.tag ? data.tag : `absensi-push-${Date.now()}`;

  const resolveUrl = (p, defaultPath = 'icon-192.png?v=2') => {
    try {
      const cleanPath = (p || defaultPath).replace(/^\//, '');
      return new URL(cleanPath, self.registration.scope).href;
    } catch (_) {
      return (p || '/' + defaultPath);
    }
  };

  const options = {
    body: body,
    icon: resolveUrl(data.icon || '/icon-192.png?v=2'),
    badge: resolveUrl(data.badge || '/badge-96.png?v=2', 'badge-96.png?v=2'), // PNG monochrome silhouette untuk Android status bar
    // Pola getar kuat agar Android klasifikasikan sebagai PRIORITY_HIGH
    vibrate: [300, 100, 300, 100, 500],
    tag: tag,
    // renotify: true agar Android selalu trigger heads-up bahkan jika tag sama
    renotify: true,
    // requireInteraction: tampil di lock screen hingga user tap/swipe
    requireInteraction: true,
    silent: false,
    timestamp: Date.now(),
    data: { url: data.url || '/' },
    actions: data.actions || [
      { action: 'open', title: '👀 Buka Presensi' },
      { action: 'close', title: 'Tutup' }
    ],
  };

  // 1. Tampilkan notifikasi sistem Android
  const showNotifPromise = self.registration.showNotification(title, options)
    .catch((err) => {
      // Fallback minimal jika options ada yang tidak didukung browser
      return self.registration.showNotification(title, {
        body: body,
        icon: resolveUrl(data.icon || '/icon-192.png?v=2'),
        badge: resolveUrl(data.badge || '/badge-96.png?v=2', 'badge-96.png?v=2'),
        vibrate: [300, 100, 300, 100, 400],
        tag: tag,
        renotify: true,
        data: { url: data.url || '/' },
      });
    });

  // 2. Beritahu semua tab/halaman web yang sedang aktif/terbuka di HP
  // Ini memicu spanduk floating pop-up langsung di layar HP saat aplikasi terbuka
  const broadcastPromise = self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then((clientList) => {
      if (clientList && clientList.length > 0) {
        clientList.forEach((client) => {
          client.postMessage({
            type: 'PUSH_NOTIFICATION_RECEIVED',
            title: title,
            body: body,
            tag: tag,
            url: data.url || '/',
            time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          });
        });
      }
    })
    .catch(() => {});

  // showNotification WAJIB dibungkus event.waitUntil agar SW tidak mati sebelum notif tampil
  event.waitUntil(Promise.all([showNotifPromise, broadcastPromise]));
});

// Periodic Background Sync
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-attendance-update') {
    event.waitUntil(Promise.resolve());
  }
});
