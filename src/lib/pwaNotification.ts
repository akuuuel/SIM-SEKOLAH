// ========================================================
// Utility Notifikasi Web PWA untuk Orang Tua Siswa
// MAN 1 BULUKUMBA
// ========================================================

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export function getNotificationPermission(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission as NotificationPermissionState;
}

export async function requestPWANotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  try {
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch (err) {
    console.warn('Gagal meminta izin notifikasi browser/PWA:', err);
    return false;
  }
}

// Suara Chime Lembut untuk Notifikasi PWA
let sharedAudioCtx: AudioContext | null = null;

export function getNotificationAudioContext(): AudioContext | null {
  try {
    if (!sharedAudioCtx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

// Buka kunci AudioContext saat ada sentuhan atau klik pertama di HP
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    const ctx = getNotificationAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
    window.removeEventListener('touchend', unlockAudio);
  };
  window.addEventListener('click', unlockAudio);
  window.addEventListener('touchstart', unlockAudio);
  window.addEventListener('touchend', unlockAudio);
}

export function playNotificationChime() {
  try {
    // Getar HP jika didukung browser
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([200, 100, 200]);
    }

    const ctx = getNotificationAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    // Nada 1: 587.33 Hz (D5) -> Nada 2: 880 Hz (A5) chord ceria bertingkat
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.1);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.18);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.6);
  } catch {
    // Audio context mungkin diblokir jika belum ada interaksi pengguna
  }
}

export interface PWANotificationPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

export async function triggerPWANotification({
  title,
  body,
  tag = 'absensi-notif',
  url = '/',
}: PWANotificationPayload): Promise<boolean> {
  playNotificationChime();

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  if (Notification.permission !== 'granted') {
    return false;
  }

  const notifTag = tag || ('absensi-' + Date.now());
  const options = {
    body,
    icon: '/icon-192.png?v=2',
    badge: '/badge-96.png?v=2',
    tag: notifTag,
    renotify: true,
    vibrate: [500, 150, 500, 150, 500],
    requireInteraction: true,
    silent: false,
    timestamp: Date.now(),
    data: { url },
    actions: [
      { action: 'open', title: 'Buka Presensi' },
      { action: 'close', title: 'Tutup' }
    ],
  } as NotificationOptions;

  try {
    // Siarkan custom event agar tab yang sedang aktif langsung memunculkan in-app pop-up melayang di layar
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(
          new CustomEvent('pwa-notification-triggered', {
            detail: { title, body, tag: notifTag, url },
          })
        );
      } catch (_) {}
    }

    // Pada Android Chrome, notifikasi WAJIB dipicu lewat ServiceWorkerRegistration
    if ('serviceWorker' in navigator) {
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      }
      if (reg && reg.showNotification) {
        await reg.showNotification(title, options);
        return true;
      }
    }

    // Fallback untuk browser desktop non-Android
    if (typeof Notification !== 'undefined') {
      new Notification(title, options);
      return true;
    }
    return false;
  } catch (err) {
    console.warn('Gagal memicu notifikasi sistem:', err);
    return false;
  }
}

/**
 * Konversi Base64URL string ke Uint8Array (dibutuhkan untuk applicationServerKey)
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function getApiEndpoint(query: string = ''): string {
  if (typeof window !== 'undefined') {
    if (window.location.pathname.includes('/Web%20Absensi/') || window.location.pathname.includes('/Web Absensi/')) {
      return `/Web%20Absensi/api/${query}`;
    }
  }
  return `/api/${query}`;
}

/**
 * Daftarkan browser/HP ke Web Push Server (Google FCM) dengan VAPID key
 * Memungkinkan notifikasi tetap berdering & muncul di layar HP meski browser/PWA ditutup total!
 */
export async function subscribeToWebPush(
  userId?: string,
  studentId?: string,
  phone?: string
): Promise<{ success: boolean; error?: string }> {
  if (typeof window === 'undefined') {
    return { success: false, error: 'Lingkungan tidak valid.' };
  }

  // Cek apakah dibuka lewat HTTP biasa di HP (Non-Secure Context)
  const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (!window.isSecureContext && !isLocalHost) {
    return {
      success: false,
      error: `Browser HP memblokir notifikasi latar belakang karena alamat dibuka lewat HTTP biasa (${window.location.protocol}//). Buka menggunakan HTTPS (https://${window.location.host}${window.location.pathname}) agar izin notifikasi bisa aktif di HP.`,
    };
  }

  // Deteksi khusus Apple iOS (iPhone / iPad)
  const isIOS =
    typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true);

  if (isIOS && !isStandalone) {
    return {
      success: false,
      error:
        'Khusus iPhone: Apple mewajibkan aplikasi ditambahkan ke Layar Utama terlebih dahulu. Buka di Safari, ketuk tombol Bagikan (ikon kotak panah ke atas) di bilah bawah, lalu pilih "Tambah ke Layar Utama". Buka aplikasi dari ikon di layar utama iPhone Anda untuk mengaktifkan notifikasi.',
    };
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return {
      success: false,
      error:
        isIOS
          ? 'Versi iOS iPhone Anda belum mendukung Web Push (perlu iOS 16.4 ke atas) atau belum dibuka dari Layar Utama.'
          : 'Browser ini belum mendukung Web Push Notification di latar belakang.',
    };
  }

  try {
    let reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    }
    await navigator.serviceWorker.ready;
    if (!reg) {
      return { success: false, error: 'Service Worker belum siap di browser ini.' };
    }

    // 1. Minta izin notifikasi browser jika belum
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        success: false,
        error: 'Izin notifikasi tidak diberikan (status: ' + permission + '). Ketuk ikon gembok di sebelah URL browser HP Anda dan ubah Notifikasi menjadi Izinkan.',
      };
    }

    // 2. Ambil VAPID Public Key dari backend server PHP
    const vapidRes = await fetch(getApiEndpoint('?action=getVapidPublicKey'));
    const vapidJson = await vapidRes.json();
    if (!vapidJson || !vapidJson.success || !vapidJson.publicKey) {
      return { success: false, error: vapidJson?.error || 'Gagal mengambil kunci VAPID dari server.' };
    }

    const applicationServerKey = urlBase64ToUint8Array(vapidJson.publicKey);

    // 3. Gunakan Push Subscription yang ada jika VAPID key masih cocok
    // Jika VAPID key server berubah, batalkan langganan lama dan buat baru
    let subscription = await reg.pushManager.getSubscription();
    if (subscription) {
      const existingKey = (subscription as any).options?.applicationServerKey;
      if (existingKey) {
        const existingKeyArray = new Uint8Array(existingKey);
        const keysMatch =
          existingKeyArray.length === applicationServerKey.length &&
          existingKeyArray.every((byte, i) => byte === applicationServerKey[i]);
        if (!keysMatch) {
          console.log('[WebPush] VAPID Key server telah diperbarui. Memperbarui langganan perangkat...');
          await subscription.unsubscribe();
          subscription = null;
        }
      }
    }

    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as unknown as BufferSource,
      });
    }

    // 4. Ekstrak data keys
    const subJson = subscription.toJSON();
    const endpoint = subJson.endpoint;
    const p256dh = subJson.keys?.p256dh;
    const auth = subJson.keys?.auth;

    if (!endpoint || !p256dh || !auth) {
      return { success: false, error: 'Data subscription kunci tidak lengkap dari browser.' };
    }

    // Cek cache lokal: jika endpoint dan target siswa sama persis dan sudah pernah disimpan, tidak perlu kirim ulang
    const lastSavedKey = `push_reg_${endpoint.slice(-30)}_${userId || ''}_${studentId || ''}_${phone || ''}`;
    if (localStorage.getItem(lastSavedKey) === 'true') {
      return { success: true };
    }

    // 5. Kirim ke backend PHP untuk disimpan di tabel push_subscriptions
    const saveRes = await fetch(getApiEndpoint(''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'savePushSubscription',
        userId,
        studentId,
        phone,
        endpoint,
        keys: { p256dh, auth },
      }),
    });
    const saveJson = await saveRes.json();
    if (saveJson && saveJson.success) {
      localStorage.setItem(lastSavedKey, 'true');
      return { success: true };
    }
    return { success: false, error: saveJson.error || 'Gagal menyimpan langganan notifikasi di server.' };
  } catch (err: any) {
    console.warn('subscribeToWebPush error:', err);
    return { success: false, error: err.message || 'Gagal mendaftarkan Web Push.' };
  }
}

/**
 * Uji coba kirim Web Push dari server langsung ke perangkat ini
 */
export async function triggerTestPushFromServer(
  studentId?: string,
  phone?: string,
  delay: number = 0
): Promise<{ success: boolean; error?: string }> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    const endpoint = sub ? sub.endpoint : '';

    const res = await fetch(getApiEndpoint(''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'testPushNotification',
        endpoint,
        studentId,
        phone,
        delay,
      }),
    });
    const json = await res.json();
    if (json && json.success) {
      return { success: true };
    }
    return { success: false, error: json.error || 'Gagal mengirim push test dari server.' };
  } catch (err: any) {
    return { success: false, error: err.message || 'Koneksi ke server gagal.' };
  }
}

