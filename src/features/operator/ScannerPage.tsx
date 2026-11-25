import React, { useState, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, recordAttendanceOffline, bulkMarkUnrecordedAsAlfa } from '../../db/attendanceDb';
import type { 
  DeviceId, 
  UserAccount, 
  AttendanceSession, 
  AttendanceMethod, 
  AttendanceTransaction 
} from '../../types';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { 
  ScanLine, 
  Camera, 
  CheckCircle2, 
  AlertTriangle, 
  Laptop, 
  Volume2,
  RefreshCw,
  VideoOff,
  Smartphone,
  Repeat2,
  Keyboard,
  FileText,
  UserMinus
} from 'lucide-react';

// Alias SwitchCamera → Repeat2 (lucide-react ^1.16.0 tidak punya SwitchCamera)
const SwitchCamera = Repeat2;
import { formatTime, getLocalDateString } from '../../lib/utils';
import { ManualExcuseModal } from './ManualExcuseModal';
import { syncPendingTransactions } from '../../services/syncService';

// Sintesis suara feedback Web Audio API: 1x Bunyi Bersih jika Berhasil, 3x Bunyi jika Gagal / Ditolak
let sharedAudioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  try {
    if (!sharedAudioCtx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
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

// Buka kunci AudioContext pada sentuhan pertama di HP
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    getAudioContext();
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
  };
  window.addEventListener('click', unlockAudio);
  window.addEventListener('touchstart', unlockAudio);
}

function playAudioFeedback(type: 'success' | 'error') {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (type === 'success') {
      // 1x Bunyi Bersih Ringkas ("BEEP!")
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(900, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
      osc.start();
      osc.stop(ctx.currentTime + 0.16);
    } else {
      // 3x Bunyi Peringatan Cepat ("BEEP - BEEP - BEEP!")
      [0, 0.14, 0.28].forEach((delay) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'square';
        osc.frequency.setValueAtTime(350, ctx.currentTime + delay);
        gain.gain.setValueAtTime(0.3, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.09);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.09);
      });
    }
  } catch {
    // Ignore audio errors if blocked
  }
}

interface ParsedCamera {
  id: string;
  label: string;
  friendlyName: string;
  isBack: boolean;
}

const parseAndLabelCameras = (devices: Array<{ id: string; label: string }>): ParsedCamera[] => {
  return devices.map((cam, idx) => {
    const raw = (cam.label || '').toLowerCase();
    const isBack = /back|rear|environment|belakang|facing back|world|main/i.test(raw);
    const isFront = /front|user|selfie|depan|facing front/i.test(raw);

    let friendlyName = cam.label || `Lensa ${idx + 1}`;
    if (isBack) {
      if (/ultra|wide/i.test(raw)) {
        friendlyName = '📷 Kamera Belakang (Ultra-Wide)';
      } else if (/tele|zoom/i.test(raw)) {
        friendlyName = '📷 Kamera Belakang (Telephoto)';
      } else if (/macro/i.test(raw)) {
        friendlyName = '📷 Kamera Belakang (Macro)';
      } else {
        friendlyName = `📷 Kamera Belakang (${idx + 1})`;
      }
    } else if (isFront) {
      friendlyName = '  (Selfie)';
    } else {
      friendlyName = `📷 Kamera ${idx + 1}`;
    }

    return {
      id: cam.id,
      label: cam.label,
      friendlyName,
      isBack: isBack || (!isFront && idx > 0),
    };
  });
};

export interface ScannerPageProps {
  currentDeviceId: DeviceId;
  currentUser: UserAccount | null;
}

export const ScannerPage: React.FC<ScannerPageProps> = ({
  currentDeviceId,
  currentUser,
}) => {
  const [session, setSession] = useState<AttendanceSession>('MASUK');
  // Default ke USB_SCANNER (Alat Scanner Barcode / HP via USB) — Paling stabil & cepat
  const [method, setMethod] = useState<AttendanceMethod>('USB_SCANNER');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    title: string;
    message: string;
    transaction?: AttendanceTransaction;
  } | null>(null);

  // State Kamera & Scanner Live
  const [cameraError, setCameraError] = useState<string>('');
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [availableCameras, setAvailableCameras] = useState<ParsedCamera[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isExcuseModalOpen, setIsExcuseModalOpen] = useState<boolean>(false);
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);

  const html5QrCodeRef = useRef<any>(null);
  const isScanningRef = useRef<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);
  const lastScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  const today = getLocalDateString();
  const allActiveStudents = useLiveQuery(() => db.students.filter((s) => s.isActive).toArray(), []) || [];
  const todayMorningTx = useLiveQuery(
    () => db.transactions.where('attendanceDate').equals(today).and((t) => t.attendanceType === 'MASUK').toArray(),
    [today]
  ) || [];
  const recordedStudentIds = new Set(todayMorningTx.map((t) => t.studentId));
  const unrecordedStudents = allActiveStudents.filter((s) => !recordedStudentIds.has(s.id));
  const unrecordedCount = unrecordedStudents.length;

  const [isAlfaModalOpen, setIsAlfaModalOpen] = useState(false);
  const [isProcessingAlfa, setIsProcessingAlfa] = useState(false);

  const handleConfirmBulkAlfa = async () => {
    setIsProcessingAlfa(true);
    try {
      const result = await bulkMarkUnrecordedAsAlfa({
        attendanceDate: today,
        deviceId: currentDeviceId,
        operatorId: currentUser?.username || 'admin',
        operatorName: currentUser?.fullName || 'Operator Gerbang',
      });
      setIsAlfaModalOpen(false);
      setFeedback({
        type: 'success',
        title: 'Penutupan Sesi Pagi Berhasil',
        message: `Sebanyak ${result.count} siswa yang belum scan berhasil ditandai sebagai ALFA.`,
      });
      playAudioFeedback('success');
      syncPendingTransactions(currentDeviceId).catch(() => {});
    } catch (err) {
      console.error('Gagal memproses alfa:', err);
      alert('Terjadi kesalahan saat memproses data alfa.');
    } finally {
      setIsProcessingAlfa(false);
    }
  };

  const recentTransactions = useLiveQuery(
    () =>
      db.transactions
        .where('attendanceDate')
        .equals(today)
        .reverse()
        .sortBy('deviceTimestamp')
        .then((list) => list.slice(0, 10)),
    [today]
  ) || [];

  const pendingCount = useLiveQuery(
    () => db.transactions.where('syncStatus').equals('PENDING').count(),
    []
  ) || 0;

  // Hanya otomatis fokuskan kursor ke kotak scan di Desktop PC (bukan di HP/layar sentuh agar keyboard tidak otomatis muncul)
  useEffect(() => {
    const isMobile = typeof window !== 'undefined' && (window.innerWidth < 768 || 'ontouchstart' in window);
    if (!isMobile && (method === 'USB_SCANNER' || method === 'MANUAL')) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [method, isProcessing, feedback]);

  // Background auto-sync: Jika ada antrean pending, dorong otomatis ke MySQL tiap 4 detik
  useEffect(() => {
    if (pendingCount === 0) return;
    const interval = setInterval(() => {
      syncPendingTransactions(currentDeviceId).catch(() => {});
    }, 4000);
    return () => clearInterval(interval);
  }, [pendingCount, currentDeviceId]);

  // Otomatis sinkronkan seketika saat terhubung ke jaringan internet/Wi-Fi
  useEffect(() => {
    const handleOnline = () => {
      syncPendingTransactions(currentDeviceId).catch(() => {});
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [currentDeviceId]);

  // Global Key Listener: Khusus saat operator scan pakai USB Scanner tapi kursor tidak sengaja terlepas
  useEffect(() => {
    let buffer = '';
    let lastKeyTime = Date.now();

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Jika kursor SUDAH berada di input scanner, biarkan onKeyDown pada input yang menangani secara langsung
      if (document.activeElement === inputRef.current) {
        return;
      }

      // Abaikan jika fokus sedang berada di input/textarea lain (seperti modal izin/sakit)
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        return;
      }

      const now = Date.now();
      // Barcode scanner USB mengetik sangat cepat (< 100ms antar karakter)
      if (now - lastKeyTime > 120) {
        buffer = '';
      }
      lastKeyTime = now;

      if (e.key === 'Enter') {
        const clean = buffer.trim();
        buffer = '';
        if (clean.length >= 3) {
          e.preventDefault();
          handleProcessBarcode(clean);
        }
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [session, currentDeviceId, currentUser]);

  // Fungsi memproses barcode siswa secara instan & responsif
  const handleProcessBarcode = async (scannedValue: string) => {
    const cleanId = scannedValue.trim();
    if (!cleanId || isProcessingRef.current) return;

    isProcessingRef.current = true;
    setIsProcessing(true);

    try {
      const result = await recordAttendanceOffline({
        studentId: cleanId,
        session,
        method,
        deviceId: currentDeviceId,
        operatorId: currentUser?.username || 'operator',
        operatorName: currentUser?.fullName || 'Operator',
      });

      if (result.success) {
        playAudioFeedback('success'); // 1x Bunyi Bersih ("BEEP!")
        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
        setFeedback({
          type: 'success',
          title: isOffline ? 'Absensi Tersimpan di Perangkat (Offline)' : 'Absensi Berhasil Dicatat',
          message: isOffline
            ? `${result.message} Data tersimpan aman di memori perangkat dan akan otomatis disinkronkan saat terhubung internet.`
            : result.message,
          transaction: result.transaction,
        });

        // Langsung coba sinkronkan ke server MySQL; jika sedang offline data tetap aman di memori perangkat
        syncPendingTransactions(currentDeviceId).catch((err) => {
          console.warn('Auto-sync offline buffer:', err);
        });
      } else {
        playAudioFeedback('error'); // 3x Bunyi Cepat ("BEEP-BEEP-BEEP!")
        setFeedback({
          type: 'error',
          title: 'Pencatatan Ditolak / Duplikat',
          message: result.message,
          transaction: result.transaction,
        });
      }
    } catch (err: any) {
      playAudioFeedback('error');
      setFeedback({
        type: 'error',
        title: 'Terjadi Kesalahan',
        message: err.message || 'Gagal memproses absensi.',
      });
    } finally {
      setBarcodeInput('');
      if (inputRef.current) inputRef.current.value = '';

      // Jeda kilat (hanya 300ms): langsung siap memproses siswa berikutnya tanpa jeda kaku
      setTimeout(() => {
        isProcessingRef.current = false;
        setIsProcessing(false);
      }, 300);

      const isMobile = typeof window !== 'undefined' && (window.innerWidth < 768 || 'ontouchstart' in window);
      if (!isMobile && (method === 'USB_SCANNER' || method === 'MANUAL')) {
        inputRef.current?.focus();
      }
    }
  };

  // ============================================================
  // CAMERA SCANNER — Native getUserMedia + BarcodeDetector/ZXing
  // Tanpa bergantung pada html5-qrcode library (lebih handal di HP)
  // ============================================================

  // Refs untuk native camera approach
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const stopNativeScanner = () => {
    // Hentikan interval scanning
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    // Hentikan semua track stream kamera
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try { track.stop(); } catch (_) {}
      });
      streamRef.current = null;
    }
    // Bersihkan video element
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    isScanningRef.current = false;
    setIsCameraActive(false);
  };

  const startHtml5Camera = async (overrideFacing?: 'environment' | 'user', specificCamId?: string) => {
    setCameraError('');
    setIsCameraActive(false);

    // Validasi HTTPS / localhost (kamera wajib secure context)
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!window.isSecureContext && !isLocal) {
      setCameraError('Kamera hanya bisa dibuka melalui HTTPS. Gunakan link ngrok (https://...) di HP Anda.');
      return;
    }

    // Validasi MediaDevices API
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Browser ini tidak mendukung kamera. Pastikan pakai Chrome terbaru via HTTPS.');
      return;
    }

    // Hentikan scanner lama jika ada
    stopNativeScanner();
    await new Promise((r) => setTimeout(r, 150));

    const targetFacing = overrideFacing ?? facingMode;

    try {
      // -------------------------------------------------------
      // Strategi Bertingkat: Pastikan kamera pasti terbuka di HP
      // Level 1: deviceId spesifik (jika dipilih)
      // Level 2: facingMode ideal (kamera belakang)
      // Level 3: facingMode exact / string
      // Level 4: fallback video: true
      // -------------------------------------------------------
      let stream: MediaStream | null = null;

      if (specificCamId) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: specificCamId }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          });
        } catch (_) {
          // Jika deviceId gagal, fallback ke auto facing
        }
      }

      if (!stream) {
        try {
          // Coba kamera belakang ideal
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: targetFacing }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          });
        } catch (_) {
          try {
            // Coba facingMode standard
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: targetFacing },
              audio: false,
            });
          } catch (_) {
            // Fallback mutlak: buka sembarang kamera yang ada di perangkat
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          }
        }
      }

      if (!stream) {
        throw new Error('Tidak dapat memperoleh stream kamera');
      }

      streamRef.current = stream;

      // Pasang stream ke elemen video
      const videoEl = videoRef.current;
      if (!videoEl) {
        stream.getTracks().forEach((t) => t.stop());
        setCameraError('Elemen video tidak ditemukan. Coba muat ulang halaman.');
        return;
      }

      // Aktifkan display video terlebih dahulu agar browser tidak memblokir play()
      setIsCameraActive(true);
      videoEl.srcObject = stream;
      videoEl.setAttribute('playsinline', 'true');
      videoEl.muted = true;
      try {
        await videoEl.play();
      } catch (_) {}

      setFacingMode(targetFacing);
      if (specificCamId) setSelectedCameraId(specificCamId);
      isScanningRef.current = true;
      setCameraError('');

      // Callback saat barcode terdeteksi
      const onScanSuccess = (decodedText: string) => {
        const cleanCode = decodedText.trim();
        if (!cleanCode) return;
        const now = Date.now();
        const isSame = lastScanRef.current.code.toLowerCase() === cleanCode.toLowerCase();
        if (isSame && now - lastScanRef.current.time < 1800) return;
        if (!isSame && now - lastScanRef.current.time < 250) return;
        lastScanRef.current = { code: cleanCode, time: now };
        handleProcessBarcode(cleanCode);
      };

      const win = window as any;

      // ============================================================
      // Scanner Utama: BarcodeDetector (native Chrome Android — cepat)
      // ============================================================
      if ('BarcodeDetector' in win) {
        try {
          const detector = new win.BarcodeDetector({
            formats: ['code_128', 'code_39', 'code_93', 'qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'data_matrix'],
          });

          scanIntervalRef.current = setInterval(async () => {
            if (!isScanningRef.current || isProcessingRef.current) return;
            if (!videoEl || videoEl.readyState < 2 || videoEl.paused) return;
            try {
              const barcodes = await detector.detect(videoEl);
              if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                onScanSuccess(barcodes[0].rawValue);
              }
            } catch (_) {}
          }, 100);

          // Ambil daftar kamera setelah stream aktif (label sudah terbuka)
          setTimeout(async () => {
            try {
              const devices = await navigator.mediaDevices.enumerateDevices();
              const cams = devices
                .filter((d) => d.kind === 'videoinput')
                .map((d) => ({ id: d.deviceId, label: d.label }));
              if (cams.length > 0) setAvailableCameras(parseAndLabelCameras(cams));
            } catch (_) {}
          }, 800);

          return; // selesai — BarcodeDetector aktif
        } catch (_) {
          // BarcodeDetector gagal, lanjut ke ZXing
        }
      }

      // ============================================================
      // Scanner Fallback: ZXing (sudah dimuat di index.html)
      // ============================================================
      const ZXing = win.ZXing;
      if (ZXing) {
        try {
          const hints = new Map();
          hints.set(2 /* DecodeHintType.TRY_HARDER */, true);
          const reader = new ZXing.MultiFormatReader();
          reader.setHints(hints);

          const canvas = canvasRef.current ?? document.createElement('canvas');

          scanIntervalRef.current = setInterval(() => {
            if (!isScanningRef.current || isProcessingRef.current) return;
            if (!videoEl || videoEl.readyState < 2 || videoEl.paused) return;
            try {
              const w = videoEl.videoWidth || 640;
              const h = videoEl.videoHeight || 480;
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext('2d');
              if (!ctx) return;
              ctx.drawImage(videoEl, 0, 0, w, h);
              const imageData = ctx.getImageData(0, 0, w, h);
              const luminanceSource = new ZXing.RGBLuminanceSource(imageData.data, w, h);
              const binaryBitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(luminanceSource));
              const result = reader.decode(binaryBitmap);
              if (result?.getText()) {
                onScanSuccess(result.getText());
              }
            } catch (_) {
              // NotFoundException normal jika tidak ada barcode di frame ini
            }
          }, 120);

          // Ambil daftar kamera setelah stream aktif
          setTimeout(async () => {
            try {
              const devices = await navigator.mediaDevices.enumerateDevices();
              const cams = devices
                .filter((d) => d.kind === 'videoinput')
                .map((d) => ({ id: d.deviceId, label: d.label }));
              if (cams.length > 0) setAvailableCameras(parseAndLabelCameras(cams));
            } catch (_) {}
          }, 800);

          return; // selesai — ZXing aktif
        } catch (_) {
          // ZXing gagal
        }
      }

      // ============================================================
      // Scanner Fallback Terakhir: html5-qrcode (via CDN)
      // ============================================================
      // Hentikan native stream dulu karena html5-qrcode buka stream sendiri
      stopNativeScanner();
      await new Promise((r) => setTimeout(r, 100));

      if (!win.Html5Qrcode) {
        await new Promise<void>((resolve, reject) => {
          if (document.querySelector('script[src*="html5-qrcode"]')) {
            setTimeout(resolve, 600);
            return;
          }
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
          s.onload = () => resolve();
          s.onerror = () => reject(new Error('Gagal memuat library'));
          document.head.appendChild(s);
        }).catch(() => {});
        await new Promise((r) => setTimeout(r, 400));
      }

      if (win.Html5Qrcode) {
        const container = document.getElementById('html5qr-reader-fallback');
        if (!container) {
          setCameraError('Tidak ada metode scanner yang tersedia di browser ini.');
          return;
        }
        container.innerHTML = '';

        const scanConfig = { fps: 15, qrbox: { width: 280, height: 120 }, aspectRatio: 1.7777778 };
        const scanner = new win.Html5Qrcode('html5qr-reader-fallback', { verbose: false });
        html5QrCodeRef.current = scanner;

        await scanner.start({ facingMode: targetFacing }, scanConfig, onScanSuccess, () => {});
        isScanningRef.current = true;
        setIsCameraActive(true);
        setCameraError('');
      } else {
        setCameraError('Browser ini tidak mendukung scan barcode. Gunakan Chrome terbaru.');
      }

    } catch (err: any) {
      console.error('[Camera] Error membuka kamera:', err);
      const msg = String(err?.message ?? err ?? '');
      stopNativeScanner();
      if (/NotAllowedError|Permission denied/i.test(msg)) {
        setCameraError(
          'Izin kamera ditolak. Ketuk ikon 🔒 di bilah alamat browser → "Izin Kamera" → Izinkan, lalu ketuk Coba Lagi.'
        );
      } else if (/NotFoundError|DevicesNotFound|device not found/i.test(msg)) {
        setCameraError(
          'Kamera tidak ditemukan. Pastikan tidak ada aplikasi lain yang membuka kamera, lalu ketuk Coba Lagi.'
        );
      } else if (/NotReadableError|TrackStartError|could not start/i.test(msg)) {
        setCameraError(
          'Kamera sedang dipakai aplikasi lain. Tutup semua aplikasi kamera lalu ketuk Coba Lagi.'
        );
      } else if (/OverconstrainedError|Overconstrained/i.test(msg)) {
        // Constraint terlalu ketat — coba lagi tanpa constraint spesifik
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          streamRef.current = fallbackStream;
          if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream;
            videoRef.current.setAttribute('playsinline', 'true');
            videoRef.current.muted = true;
            await videoRef.current.play().catch(() => {});
          }
          isScanningRef.current = true;
          setIsCameraActive(true);
          setCameraError('');
        } catch (_) {
          setCameraError('Tidak dapat membuka kamera. Pastikan kamera tidak diblokir browser.');
        }
      } else {
        setCameraError(`Gagal membuka kamera: ${msg || 'Error tidak diketahui'}`);
      }
    }
  };

  const handleToggleCamera = () => {
    const nextFacing: 'environment' | 'user' = facingMode === 'environment' ? 'user' : 'environment';
    const targetCam = nextFacing === 'environment'
      ? availableCameras.find((c) => c.isBack)
      : availableCameras.find((c) => !c.isBack);
    startHtml5Camera(nextFacing, targetCam?.id);
  };

  // stopHtml5Scanner: alias ke stopNativeScanner + cleanup html5-qrcode fallback
  const stopHtml5Scanner = async () => {
    stopNativeScanner();
    if (html5QrCodeRef.current) {
      try { if (isScanningRef.current) await html5QrCodeRef.current.stop(); } catch (_) {}
      try { await html5QrCodeRef.current.clear(); } catch (_) {}
      html5QrCodeRef.current = null;
    }
    const fb = document.getElementById('html5qr-reader-fallback');
    if (fb) fb.innerHTML = '';
  };

  // Matikan kamera jika beralih metode
  useEffect(() => {
    if (method !== 'BARCODE_CAMERA') {
      stopHtml5Scanner();
    }
    return () => {
      stopHtml5Scanner();
    };
  }, [method]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = (e.currentTarget.value || barcodeInput).trim();
      if (val) {
        handleProcessBarcode(val);
        setBarcodeInput('');
        if (inputRef.current) inputRef.current.value = '';
      }
    }
  };

  const handleCopyOrigin = () => {
    navigator.clipboard.writeText(window.location.origin);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header Operator & Kontrol Sesi */}
      <div className="bg-surface border border-border rounded-card p-3.5 sm:p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 sm:p-3 bg-primary-100 text-primary-600 rounded-xl shrink-0">
            <ScanLine className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-content-primary truncate">Absensi MAN 1 BULUKUMBA</h2>
              <span className="px-2 py-0.5 rounded-md bg-primary-50 text-primary-700 border border-primary-200 text-[11px] sm:text-xs font-bold shrink-0">
                {currentDeviceId}
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-content-secondary mt-0.5 truncate">
              Operator: <strong>{currentUser?.fullName}</strong>
            </p>
          </div>
        </div>

        {/* Pemilihan Sesi MASUK / PULANG: Full width 2 kolom di mobile */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsExcuseModalOpen(true)}
            leftIcon={<FileText className="w-4 h-4 text-amber-600" />}
            className="border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 font-semibold"
          >
            Catat Izin / Sakit
          </Button>

          {unrecordedCount > 0 && session === 'MASUK' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAlfaModalOpen(true)}
              leftIcon={<UserMinus className="w-4 h-4 text-red-600" />}
              className="border-red-300 text-red-800 bg-red-50 hover:bg-red-100 font-semibold"
              title="Tutup sesi pagi dan tandai semua siswa yang belum scan sebagai Alfa"
            >
              Tutup Pagi ({unrecordedCount} Alfa)
            </Button>
          )}

          <div className="w-full sm:w-auto grid grid-cols-2 gap-1.5 bg-canvas p-1 rounded-button border border-border">
            <button
              onClick={() => {
                setSession('MASUK');
                const isMobile = window.innerWidth < 768 || 'ontouchstart' in window;
                if (!isMobile) inputRef.current?.focus();
              }}
              className={`py-2 px-3 text-[11px] sm:text-xs font-bold rounded-button text-center transition-all ${
                session === 'MASUK'
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              MASUK (PAGI)
            </button>
            <button
              onClick={() => {
                setSession('PULANG');
                const isMobile = window.innerWidth < 768 || 'ontouchstart' in window;
                if (!isMobile) inputRef.current?.focus();
              }}
              className={`py-2 px-3 text-[11px] sm:text-xs font-bold rounded-button text-center transition-all ${
                session === 'PULANG'
                  ? 'bg-amber-500 text-white shadow-sm hover:bg-amber-600'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              PULANG (SORE)
            </button>
          </div>
        </div>
      </div>

      {/* Grid Utama: Area Scan & Hasil Terakhir */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* Kolom Kiri: Input Pemindaian (7 Kolom) */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="border-2 border-primary-200 shadow-sm overflow-hidden">
            <CardHeader className="bg-primary-50/50 py-3 px-3 sm:px-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 w-full">
                <CardTitle className="text-xs font-bold text-primary-800 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
                  <Volume2 className="w-4 h-4 text-primary-600" />
                  <span>Pilih Sumber Pemindai:</span>
                </CardTitle>
                
                {/* 3 Tab Pilihan Sumber Pemindai yang Rapi & Presisi di Mobile */}
                <div className="grid grid-cols-3 sm:flex sm:flex-wrap bg-white rounded-xl border border-primary-200 p-1 gap-1 shadow-xs w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setCameraError('');
                      setMethod('USB_SCANNER');
                    }}
                    className={`px-2 sm:px-3 py-1.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all text-center ${
                      method === 'USB_SCANNER' 
                        ? 'bg-primary-600 text-white shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <Keyboard className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">USB Scan</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCameraError('');
                      setMethod('BARCODE_CAMERA');
                      startHtml5Camera('environment');
                    }}
                    className={`px-2 sm:px-3 py-1.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all text-center ${
                      method === 'BARCODE_CAMERA' 
                        ? 'bg-primary-600 text-white shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <Camera className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Kamera HP</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCameraError('');
                      setMethod('MANUAL');
                    }}
                    className={`px-2 sm:px-3 py-1.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all text-center ${
                      method === 'MANUAL' 
                        ? 'bg-primary-600 text-white shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <span className="truncate">Manual</span>
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-3 sm:p-6">
              {/* SUMBER 1 (UTAMA): ALAT SCANNER BARCODE USB / HP VIA KABEL USB */}
              {method === 'USB_SCANNER' && (
                <div className="text-center py-3 space-y-4">
                  {/* Indikator Status Scanner Siap */}
                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-bold">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>STATUS: SCANNER AKTIF & SIAP MEMINDAI</span>
                  </div>

                  

                  {/* Kotak Input Pemindaian Utama */}
                  <div className="relative max-w-md mx-auto">
                    <input
                      ref={inputRef}
                      type="text"
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={isProcessing}
                      placeholder="Langsung tembak barcode..."
                      className="w-full text-center text-xl font-mono font-bold tracking-widest py-4 px-4 rounded-xl border-2 border-primary-500 focus:border-primary-700 focus:outline-none focus:ring-4 focus:ring-primary-100 bg-white placeholder:text-gray-300 shadow-sm transition-all"
                    />
                    {isProcessing && (
                      <div className="absolute inset-0 bg-white/80 rounded-xl flex items-center justify-center gap-2 text-primary-700 font-bold text-xs">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Memproses data siswa...</span>
                      </div>
                    )}
                  </div>

                </div>
              )}

              {/* SUMBER 2: KAMERA LAPTOP / WEBCAM / KAMERA HP */}
              {method === 'BARCODE_CAMERA' && (
                <div className="space-y-4">
                  {cameraError && (
                    <div className="p-3.5 bg-red-50 text-red-900 rounded-xl text-xs space-y-2 border border-red-200">
                      <div className="flex items-center gap-2 font-bold text-sm text-red-800">
                        <VideoOff className="w-4 h-4 shrink-0 text-red-600" />
                        <span>Kamera Belum Aktif</span>
                      </div>
                      <p className="leading-relaxed text-red-700">{cameraError}</p>
                      <div className="pt-1 flex gap-2">
                        <Button
                          size="sm"
                          className="bg-primary-600 hover:bg-primary-700 text-white font-bold"
                          leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                          onClick={() => startHtml5Camera('environment')}
                        >
                          Coba Lagi
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {/* Viewfinder Container: Presisi, Center & Lebar Penuh di HP */}
                    <div className="relative w-full max-w-lg mx-auto rounded-2xl sm:rounded-3xl overflow-hidden border-2 border-slate-700 bg-black shadow-xl aspect-[4/3] sm:aspect-video flex items-center justify-center">
                      {/* Video Element Native untuk Kamera: Mengisi Penuh 100% & Center Presisi */}
                      <video
                        ref={videoRef}
                        playsInline
                        muted
                        autoPlay
                        className="scanner-video-preview absolute inset-0 w-full h-full object-cover object-center"
                        style={{ display: isCameraActive ? 'block' : 'none' }}
                      />

                      {/* Canvas tersembunyi untuk proses ZXing frame capture */}
                      <canvas ref={canvasRef} className="hidden" />

                      {/* Container Fallback jika metode html5-qrcode terpakai */}
                      <div
                        id="html5qr-reader-fallback"
                        className="absolute inset-0 w-full h-full"
                        style={{ display: isCameraActive && !streamRef.current ? 'block' : 'none' }}
                      ></div>

                      {/* Laser & Corner Overlay saat Kamera Aktif: Tepat di Tengah (Center & Presisi) */}
                      {isCameraActive && (
                        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4 z-10">
                          <div className="w-[85%] max-w-[300px] h-32 sm:h-36 border-2 border-white/50 rounded-2xl relative shadow-[0_0_24px_rgba(0,0,0,0.6)]">
                            <div className="absolute -top-1 -left-1 w-6 h-6 border-t-2 border-l-2 border-emerald-400 rounded-tl-xl shadow-[0_0_8px_#34d399]"></div>
                            <div className="absolute -top-1 -right-1 w-6 h-6 border-t-2 border-r-2 border-emerald-400 rounded-tr-xl shadow-[0_0_8px_#34d399]"></div>
                            <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-2 border-l-2 border-emerald-400 rounded-bl-xl shadow-[0_0_8px_#34d399]"></div>
                            <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-2 border-r-2 border-emerald-400 rounded-br-xl shadow-[0_0_8px_#34d399]"></div>
                            <div className="absolute top-1/2 left-2 right-2 h-0.5 bg-emerald-400 shadow-[0_0_12px_#10B981] animate-pulse -translate-y-1/2"></div>
                          </div>
                          <span className="text-[11px] text-white/95 bg-black/80 backdrop-blur-md px-3.5 py-1 rounded-full mt-3 font-semibold shadow-md border border-white/20">
                            Arahkan barcode kartu siswa ke dalam kotak
                          </span>
                        </div>
                      )}

                      {/* Tampilan Bersih Saat Kamera Belum Dinyalakan */}
                      {!isCameraActive && (
                        <div className="relative z-10 py-8 px-4 sm:py-10 sm:px-6 flex flex-col items-center justify-center text-center text-white space-y-3 sm:space-y-4">
                          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-md">
                            <Camera className="w-8 h-8" />
                          </div>
                          <div>
                            <p className="text-sm sm:text-base font-bold text-white">Kamera Scanner Siswa</p>
                            <p className="text-xs text-slate-300 mt-1 max-w-xs leading-relaxed mx-auto">
                              Gunakan kamera belakang HP untuk membaca barcode kartu siswa secara otomatis.
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="md"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2.5 shadow-lg active:scale-95"
                            leftIcon={<Camera className="w-5 h-5" />}
                            onClick={() => startHtml5Camera('environment')}
                          >
                            Nyalakan Kamera Sekarang
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Kontrol Saat Kamera Aktif */}
                    {isCameraActive && (
                      <div className="space-y-2.5 max-w-lg mx-auto">
                        {/* Bar Status Kamera Aktif & Tombol Cepat */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-2xl shadow-xs">
                          <div className="flex items-center gap-2 px-1">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span className="text-xs font-bold text-slate-800">
                              {facingMode === 'environment' ? ' Kamera Belakang Aktif' : '  Aktif'}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={handleToggleCamera}
                              leftIcon={<SwitchCamera className="w-4 h-4 text-primary-600" />}
                              className="text-xs font-bold bg-white border-primary-300 hover:bg-primary-50 text-primary-800 shadow-xs"
                            >
                              {facingMode === 'environment' ? 'Ganti Depan' : 'Ganti Belakang'}
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => stopHtml5Scanner()}
                              className="text-xs text-red-600 border-red-200 hover:bg-red-50"
                            >
                              Matikan
                            </Button>
                          </div>
                        </div>

                        {/* Dropdown Pemilihan Lensa Fisik jika HP memiliki Multi-Kamera */}
                        {availableCameras.length > 1 && (
                          <div className="flex items-center gap-2 bg-white border border-primary-200 rounded-xl p-2.5 shadow-xs">
                            <label className="text-[11px] font-bold text-slate-600 shrink-0">
                              Pilih Lensa HP:
                            </label>
                            <select
                              value={selectedCameraId}
                              onChange={(e) => {
                                const camId = e.target.value;
                                setSelectedCameraId(camId);
                                const chosen = availableCameras.find((c) => c.id === camId);
                                startHtml5Camera(chosen?.isBack ? 'environment' : 'user', camId);
                              }}
                              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-primary-500 truncate"
                            >
                              {availableCameras.map((cam) => (
                                <option key={cam.id} value={cam.id}>
                                  {cam.friendlyName}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        <p className="text-[11px] text-center text-content-secondary">
                          Arahkan kamera belakang ke barcode kartu siswa. Sistem akan <strong>otomatis mendeteksi dan membunyikan Bip</strong>.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SUMBER 3: KETIK MANUAL */}
              {method === 'MANUAL' && (
                <div className="text-center py-4 space-y-3">
                  <p className="text-xs text-content-secondary">
                    Ketik ID atau kode barcode siswa secara manual lalu tekan tombol Enter atau Simpan:
                  </p>
                  <div className="flex gap-2 max-w-md mx-auto">
                    <input
                      ref={inputRef}
                      type="text"
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Masukkan ID siswa (cth: M1B-26-005)"
                      className="flex-1 text-sm font-mono font-semibold py-2 px-3 rounded-button border border-border focus:outline-none focus:border-primary-600"
                    />
                    <Button onClick={() => handleProcessBarcode(barcodeInput)}>
                      Simpan
                    </Button>
                  </div>
                </div>
              )}

            </CardContent>
          </Card>

          {/* Banner Feedback Hasil Scan Terakhir */}
          {feedback && (
            <div
              className={`p-4 rounded-card border shadow-sm transition-all ${
                feedback.type === 'success'
                  ? 'bg-status-success-bg border-status-success/30 text-emerald-950 flash-success'
                  : 'bg-status-danger-bg border-status-danger/30 text-red-950 flash-danger'
              }`}
            >
              <div className="flex items-start gap-3">
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-5 h-5 text-status-success shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-status-danger shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <h4 className="text-xs font-bold uppercase tracking-wide">
                    {feedback.title}
                  </h4>
                  <p className="text-xs mt-0.5">{feedback.message}</p>

                  {feedback.transaction && (
                    <div className="mt-3 pt-3 border-t border-black/10 flex flex-wrap items-center justify-between text-xs font-medium">
                      <div>
                        Siswa: <strong>{feedback.transaction.studentName}</strong> ({feedback.transaction.className})
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge attendanceStatus={feedback.transaction.attendanceStatus} />
                        <span className="text-[11px] text-gray-600">
                          {formatTime(feedback.transaction.deviceTimestamp)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Kolom Kanan: Riwayat Scan Terbaru Hari Ini (5 Kolom) */}
        <div className="lg:col-span-5 space-y-4">
          <Card>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between w-full">
                <CardTitle className="text-xs font-bold">Riwayat Scan Terakhir (Lokal)</CardTitle>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-status-warning-bg text-status-warning font-semibold">
                  {pendingCount} Pending Sync
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {recentTransactions.length === 0 ? (
                <div className="p-8 text-center text-xs text-content-secondary">
                  Belum ada transaksi scan pada perangkat ini hari ini.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {recentTransactions.map((trx) => (
                    <div key={trx.transactionId} className="p-3.5 hover:bg-gray-50/60 flex items-center justify-between text-xs transition-colors">
                      <div className="space-y-0.5">
                        <p className="font-semibold text-content-primary">
                          {trx.studentName || trx.studentId}
                        </p>
                        <p className="text-[11px] text-content-secondary">
                          {trx.className} • ID: <span className="font-mono">{trx.studentId}</span>
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {trx.attendanceType} • {formatTime(trx.deviceTimestamp)} • oleh @{trx.operatorId}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge attendanceStatus={trx.attendanceStatus} />
                        <Badge syncStatus={trx.syncStatus} dot />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modal Izin / Sakit / Alfa Manual */}
      <ManualExcuseModal
        isOpen={isExcuseModalOpen}
        onClose={() => setIsExcuseModalOpen(false)}
        currentDeviceId={currentDeviceId}
        currentUser={currentUser}
        onSuccess={(msg) => {
          setFeedback({
            type: 'success',
            title: 'Keterangan Tercatat',
            message: msg,
          });
        }}
      />

      {/* Modal Konfirmasi Tutup Pagi & Bulk Alfa */}
      <Modal
        isOpen={isAlfaModalOpen}
        onClose={() => setIsAlfaModalOpen(false)}
        title="Tutup Absensi Pagi & Tandai Alfa"
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Konfirmasi Tutup Gerbang Pagi</p>
              <p className="mt-1 text-red-800 leading-relaxed">
                Terdapat <strong>{unrecordedCount} siswa</strong> yang belum melakukan scan masuk hari ini. Apakah Anda ingin menandai mereka semua sebagai <strong>ALFA (Tanpa Keterangan)</strong>?
              </p>
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto border border-border rounded-xl divide-y divide-border bg-canvas">
            {unrecordedStudents.map((s, idx) => (
              <div key={s.id} className="p-2 flex items-center justify-between text-xs hover:bg-surface">
                <span className="truncate font-semibold text-content-primary">
                  {idx + 1}. {s.name}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                  {s.className}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-border flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAlfaModalOpen(false)}
              disabled={isProcessingAlfa}
            >
              Batal
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmBulkAlfa}
              disabled={isProcessingAlfa}
              className="bg-red-600 hover:bg-red-700 text-white font-bold"
            >
              {isProcessingAlfa ? 'Memproses...' : `Ya, Set ${unrecordedCount} Siswa Alfa`}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
