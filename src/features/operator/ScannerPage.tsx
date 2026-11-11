import React, { useState, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, recordAttendanceOffline } from '../../db/attendanceDb';
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
  SwitchCamera,
  Keyboard,
  FileText
} from 'lucide-react';
import { formatTime } from '../../lib/utils';
import { ManualExcuseModal } from './ManualExcuseModal';

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
  const [availableCameras, setAvailableCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isExcuseModalOpen, setIsExcuseModalOpen] = useState<boolean>(false);
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);

  const html5QrCodeRef = useRef<any>(null);
  const isScanningRef = useRef<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);
  const lastScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  const today = new Date().toISOString().split('T')[0];
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

  // Selalu otomatis fokuskan kursor ke kotak scan
  useEffect(() => {
    if (method === 'USB_SCANNER' || method === 'MANUAL') {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [method, isProcessing, feedback]);

  // Global Key Listener: Jika operator scan pakai USB Scanner saat kursor tidak sengaja terlepas
  useEffect(() => {
    let buffer = '';
    let lastKeyTime = Date.now();

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Abaikan jika fokus sedang berada di input lain (seperti modal izin/sakit)
      const activeEl = document.activeElement;
      if (activeEl && activeEl !== inputRef.current && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        return;
      }

      const now = Date.now();
      // Barcode scanner USB mengetik sangat cepat (< 50ms antar karakter)
      if (now - lastKeyTime > 150) {
        buffer = '';
      }
      lastKeyTime = now;

      if (e.key === 'Enter') {
        if (buffer.length >= 3) {
          e.preventDefault();
          handleProcessBarcode(buffer);
          buffer = '';
        }
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [session, currentDeviceId, currentUser]);

  // Fungsi memproses barcode siswa
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
        setFeedback({
          type: 'success',
          title: 'Absensi Berhasil Dicatat',
          message: result.message,
          transaction: result.transaction,
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
      // Berikan jeda 2.5 detik sebelum siap memindai barcode berikutnya
      setTimeout(() => {
        isProcessingRef.current = false;
        setIsProcessing(false);
      }, 2500);

      if (method === 'USB_SCANNER' || method === 'MANUAL') {
        inputRef.current?.focus();
      }
    }
  };

  // Lifecycle Live Camera Scanner dengan Html5Qrcode
  const startHtml5Camera = async (overrideFacing?: 'environment' | 'user', specificCamId?: string) => {
    setCameraError('');
    setIsCameraActive(false);

    const win = window as any;
    if (!win.Html5Qrcode) {
      setCameraError('Library scanner belum selesai dimuat. Harap periksa koneksi internet atau refresh halaman.');
      return;
    }

    try {
      // Hentikan scanner aktif sebelumnya jika ada
      await stopHtml5Scanner();

      // Pastikan elemen DOM container tersedia
      const container = document.getElementById('html5qr-reader');
      if (!container) {
        setCameraError('Elemen kamera tidak ditemukan di halaman.');
        return;
      }

      // Bersihkan isi container jika ada sisa video lama
      container.innerHTML = '';

      const scanner = new win.Html5Qrcode('html5qr-reader');
      html5QrCodeRef.current = scanner;

      const allSupportedFormats = [
        win.Html5QrcodeSupportedFormats?.CODE_128,
        win.Html5QrcodeSupportedFormats?.CODE_39,
        win.Html5QrcodeSupportedFormats?.CODE_93,
        win.Html5QrcodeSupportedFormats?.CODABAR,
        win.Html5QrcodeSupportedFormats?.EAN_13,
        win.Html5QrcodeSupportedFormats?.EAN_8,
        win.Html5QrcodeSupportedFormats?.UPC_A,
        win.Html5QrcodeSupportedFormats?.UPC_E,
        win.Html5QrcodeSupportedFormats?.ITF,
        win.Html5QrcodeSupportedFormats?.QR_CODE,
        win.Html5QrcodeSupportedFormats?.DATA_MATRIX,
      ].filter(Boolean);

      // Konfigurasi Turbo: 25 FPS, tanpa crop sempit agar barcode miring/terbalik tetap terbaca 100%
      const config = {
        fps: 25,
        aspectRatio: 1.333333,
        disableFlip: false,
        formatsToSupport: allSupportedFormats,
        videoConstraints: {
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
        },
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true,
        },
      };

      const targetMode = overrideFacing || facingMode;
      // Gunakan string specificCamId JIKA dipilih manual, jika tidak gunakan murni { facingMode: targetMode }
      const cameraIdOrConfig = specificCamId ? specificCamId : { facingMode: targetMode };

      const onScanSuccess = (decodedText: string) => {
        const cleanCode = decodedText.trim();
        if (!cleanCode) return;

        const now = Date.now();
        if (lastScanRef.current.code === cleanCode && (now - lastScanRef.current.time) < 2500) {
          return;
        }

        lastScanRef.current = { code: cleanCode, time: now };
        handleProcessBarcode(cleanCode);
      };

      await scanner.start(
        cameraIdOrConfig,
        config,
        onScanSuccess,
        () => {}
      );

      // Perbarui daftar kamera setelah izin aktif
      try {
        const postDevices = await win.Html5Qrcode.getCameras();
        if (postDevices && postDevices.length > 0) {
          setAvailableCameras(postDevices);
        }
      } catch (e) {}

      // Akselerasi Tambahan: Hubungkan Native BarcodeDetector (GPU Google) jika tersedia untuk respon instan < 10ms
      if ('BarcodeDetector' in win) {
        try {
          const nativeDetector = new win.BarcodeDetector({
            formats: ['code_128', 'code_39', 'code_93', 'codabar', 'ean_13', 'ean_8', 'qr_code', 'upc_a', 'upc_e', 'itf']
          });

          const videoEl = container.querySelector('video');
          if (videoEl) {
            let turboActive = true;
            const detectTurboLoop = async () => {
              if (!turboActive || !isScanningRef.current) return;
              if (videoEl.readyState >= 2 && !isProcessingRef.current) {
                try {
                  const detected = await nativeDetector.detect(videoEl);
                  if (detected && detected.length > 0 && detected[0].rawValue) {
                    onScanSuccess(detected[0].rawValue);
                  }
                } catch (e) {
                  // ignore
                }
              }
              if (turboActive && isScanningRef.current) {
                requestAnimationFrame(detectTurboLoop);
              }
            };
            requestAnimationFrame(detectTurboLoop);
          }
        } catch (e) {}
      }

      isScanningRef.current = true;
      setIsCameraActive(true);
      setCameraError('');
    } catch (err: any) {
      console.error('Html5Qrcode Start Error:', err);
      const msg = String(err?.message || err);
      if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
        setCameraError('Izin kamera ditolak oleh browser. Klik ikon gembok 🔒 di samping alamat web pada browser HP Anda, lalu ubah Izin Kamera menjadi "Izinkan".');
      } else if (msg.includes('NotFoundError') || msg.includes('DevicesNotFoundError')) {
        setCameraError('Tidak ditemukan kamera atau webcam pada perangkat ini.');
      } else {
        setCameraError(`Gagal membuka kamera: ${msg}`);
      }
      setIsCameraActive(false);
    }
  };

  const handleToggleCamera = () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);
    setSelectedCameraId('');
    startHtml5Camera(nextFacing);
  };

  const stopHtml5Scanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        if (isScanningRef.current) {
          await html5QrCodeRef.current.stop();
        }
      } catch (e) {
        // ignore
      }
      try {
        await html5QrCodeRef.current.clear();
      } catch (e) {
        // ignore
      }
      isScanningRef.current = false;
      setIsCameraActive(false);
      html5QrCodeRef.current = null;
    }
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
      handleProcessBarcode(barcodeInput);
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

          <div className="w-full sm:w-auto grid grid-cols-2 gap-1.5 bg-canvas p-1 rounded-button border border-border">
            <button
              onClick={() => {
                setSession('MASUK');
                inputRef.current?.focus();
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
                inputRef.current?.focus();
              }}
              className={`py-2 px-3 text-[11px] sm:text-xs font-bold rounded-button text-center transition-all ${
                session === 'PULANG'
                  ? 'bg-emerald-600 text-white shadow-sm'
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
            <CardHeader className="bg-primary-50/50 py-3 px-4 sm:px-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
                <CardTitle className="text-xs font-bold text-primary-800 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
                  <Volume2 className="w-4 h-4 text-primary-600" />
                  <span>Pilih Sumber Pemindai:</span>
                </CardTitle>
                
                {/* 3 Tab Pilihan Sumber Pemindai yang Jelas & Besar */}
                <div className="flex flex-wrap bg-white rounded-xl border border-primary-200 p-1 gap-1 shadow-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setCameraError('');
                      setMethod('USB_SCANNER');
                    }}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all ${
                      method === 'USB_SCANNER' 
                        ? 'bg-primary-600 text-white shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <Keyboard className="w-4 h-4" />
                    <span>Alat Scanner USB / HP (USB)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCameraError('');
                      setMethod('BARCODE_CAMERA');
                    }}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all ${
                      method === 'BARCODE_CAMERA' 
                        ? 'bg-primary-600 text-white shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <Camera className="w-4 h-4" />
                    <span>Kamera / Webcam</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCameraError('');
                      setMethod('MANUAL');
                    }}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all ${
                      method === 'MANUAL' 
                        ? 'bg-primary-600 text-white shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <span>Ketik Manual</span>
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {/* SUMBER 1 (UTAMA): ALAT SCANNER BARCODE USB / HP VIA KABEL USB */}
              {method === 'USB_SCANNER' && (
                <div className="text-center py-3 space-y-4">
                  {/* Indikator Status Scanner Siap */}
                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-bold">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>STATUS: SCANNER AKTIF & SIAP MEMINDAI</span>
                  </div>

                  <p className="text-xs text-content-secondary max-w-md mx-auto leading-relaxed">
                    Arahkan <strong>alat pistol scanner barcode USB</strong> atau <strong>HP yang disambungkan via USB</strong> ke kartu barcode siswa. Hasil scan akan otomatis tercatat dan membunyikan bip.
                  </p>

                  {/* Kotak Input Pemindaian Utama */}
                  <div className="relative max-w-md mx-auto">
                    <input
                      ref={inputRef}
                      type="text"
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={isProcessing}
                      autoFocus
                      placeholder="Langsung tembak barcode... (cth: M1B-26-001)"
                      className="w-full text-center text-xl font-mono font-bold tracking-widest py-4 px-4 rounded-xl border-2 border-primary-500 focus:border-primary-700 focus:outline-none focus:ring-4 focus:ring-primary-100 bg-white placeholder:text-gray-300 shadow-sm transition-all"
                    />
                    {isProcessing && (
                      <div className="absolute inset-0 bg-white/80 rounded-xl flex items-center justify-center gap-2 text-primary-700 font-bold text-xs">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Memproses data siswa...</span>
                      </div>
                    )}
                  </div>

                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg max-w-md mx-auto text-left text-[11px] text-slate-600 space-y-1">
                    <p className="font-semibold text-slate-800">💡 Cara Penggunaan:</p>
                    <p>• <strong>Alat Scanner USB:</strong> Colok kabel USB scanner ke laptop, lalu langsung tembak kartu barcode siswa.</p>
                    <p>• <strong>HP via Kabel USB:</strong> Sambungkan HP ke laptop (gunakan mode Keyboard USB / aplikasi Barcode to PC), lalu scan lewat HP.</p>
                    <p>• Sistem memiliki <em>auto-listener</em>, jadi scan tetap terbaca meskipun kursor tidak sengaja keluar.</p>
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
                          onClick={() => startHtml5Camera()}
                        >
                          Coba Lagi
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {/* Viewfinder Html5Qrcode Auto-Scan — Elemen ini selalu ada di DOM */}
                    <div className="relative w-full max-w-md mx-auto rounded-xl overflow-hidden border-2 border-primary-500 shadow-md bg-black">
                      <div id="html5qr-reader" className="w-full"></div>

                      {/* Laser & Corner Overlay saat Kamera Aktif */}
                      {isCameraActive && (
                        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
                          <div className="w-64 h-40 border border-white/40 rounded-xl relative">
                            <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-primary-400"></div>
                            <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-primary-400"></div>
                            <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-primary-400"></div>
                            <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-primary-400"></div>
                            {/* Garis laser hijau tipis aktif */}
                            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-emerald-400 shadow-[0_0_10px_#10B981] animate-pulse"></div>
                          </div>
                          <span className="text-[10px] text-white/90 bg-black/60 px-3 py-1 rounded-full mt-2 font-mono">
                            Auto-Detect: Miring / Terbalik / 360°
                          </span>
                        </div>
                      )}

                      {!isCameraActive && (
                        <div className="py-12 flex flex-col items-center justify-center text-center p-6 text-white space-y-3">
                          <div className="p-4 rounded-full bg-primary-600/30 text-primary-300">
                            <Camera className="w-10 h-10" />
                          </div>
                          <div>
                            <p className="text-sm font-bold">Kamera Belum Dinyalakan</p>
                            <p className="text-xs text-gray-300 mt-1 max-w-xs">
                              Klik tombol di bawah untuk meminta izin browser dan langsung menyalakan kamera live auto-scan.
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="md"
                            className="bg-primary-600 hover:bg-primary-700 text-white font-bold px-6 py-2.5 shadow-lg"
                            leftIcon={<Camera className="w-5 h-5" />}
                            onClick={() => startHtml5Camera()}
                          >
                            Nyalakan Kamera Sekarang
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Kontrol Saat Kamera Aktif */}
                    {isCameraActive && (
                      <div className="space-y-2 max-w-md mx-auto">
                        <div className="flex flex-wrap items-center justify-between text-xs px-1 gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={handleToggleCamera}
                            leftIcon={<SwitchCamera className="w-4 h-4 text-primary-600" />}
                            className="text-xs font-bold bg-white border-primary-300 hover:bg-primary-50 text-primary-800 shadow-xs"
                          >
                            {facingMode === 'environment' ? 'Balik ke Kamera Depan' : 'Balik ke Kamera Belakang'}
                          </Button>

                          {availableCameras.length > 1 && (
                            <select
                              value={selectedCameraId}
                              onChange={(e) => {
                                setSelectedCameraId(e.target.value);
                                startHtml5Camera(undefined, e.target.value);
                              }}
                              className="bg-canvas border border-border rounded-button px-2 py-1 text-[11px] font-medium max-w-[150px] truncate"
                            >
                              {availableCameras.map((cam, idx) => (
                                <option key={cam.id || idx} value={cam.id}>
                                  {cam.label || `Lensa ${idx + 1}`}
                                </option>
                              ))}
                            </select>
                          )}

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => stopHtml5Scanner()}
                            className="text-xs text-red-600 border-red-200 hover:bg-red-50 ml-auto"
                          >
                            Matikan
                          </Button>
                        </div>

                        <p className="text-[11px] text-center text-content-secondary">
                          Arahkan kamera ke barcode siswa. Sistem akan <strong>otomatis mendeteksi dan membunyikan Bip</strong>.
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

              {/* Contoh ID Cepat untuk Pengujian */}
              <div className="pt-4 border-t border-border">
                <p className="text-[11px] text-content-secondary mb-2 text-center">
                  Atau klik cepat ID simulasi di bawah untuk menguji pencatatan:
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {['M1B-26-001', 'M1B-26-002', 'M1B-26-003', 'M1B-26-005'].map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleProcessBarcode(id)}
                      className="px-2.5 py-1 rounded bg-gray-100 hover:bg-primary-50 hover:text-primary-700 border border-border text-xs font-mono font-semibold transition-colors"
                    >
                      {id}
                    </button>
                  ))}
                </div>
              </div>
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
    </div>
  );
};
