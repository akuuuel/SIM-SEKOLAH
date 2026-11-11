import React, { useState, useEffect } from 'react';
import { db } from '../../db/attendanceDb';
import {
  getAppsScriptUrl, setAppsScriptUrl,
  getAppsScriptToken, setAppsScriptToken,
} from '../../services/syncService';
import type { DeviceId } from '../../types';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import {
  Settings,
  Clock,
  Link2,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Database,
  Laptop,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';

export interface SettingsPageProps {
  currentDeviceId: DeviceId;
  onDeviceChange: (id: DeviceId) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  currentDeviceId,
  onDeviceChange,
}) => {
  const [scriptUrl, setScriptUrlState] = useState('');
  const [scriptToken, setScriptTokenState] = useState('');
  const [urlError, setUrlError] = useState('');
  const [entryTimeLimit, setEntryTimeLimit] = useState('07:15');
  const [dismissalTime, setDismissalTime] = useState('15:00');
  const [timeZone, setTimeZone] = useState('Asia/Makassar');

  const [testStatus, setTestStatus] = useState<{
    loading: boolean;
    success?: boolean;
    message?: string;
  }>({ loading: false });

  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    setScriptUrlState(getAppsScriptUrl());
    setScriptTokenState(getAppsScriptToken());
    const savedLimit = localStorage.getItem('school_entry_limit');
    if (savedLimit) setEntryTimeLimit(savedLimit);
    const savedDismissal = localStorage.getItem('school_dismissal_time');
    if (savedDismissal) setDismissalTime(savedDismissal);
    const savedTz = localStorage.getItem('school_timezone');
    if (savedTz) setTimeZone(savedTz);
  }, []);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setUrlError('');

    // Validasi URL — hanya izinkan domain Google Apps Script
    if (scriptUrl.trim() && !scriptUrl.trim().startsWith('https://script.google.com/')) {
      setUrlError('URL tidak valid. Harus diawali dengan https://script.google.com/');
      return;
    }

    try {
      setAppsScriptUrl(scriptUrl);
    } catch (err: unknown) {
      setUrlError(err instanceof Error ? err.message : 'URL tidak valid.');
      return;
    }

    setAppsScriptToken(scriptToken);
    localStorage.setItem('school_entry_limit', entryTimeLimit);
    localStorage.setItem('school_dismissal_time', dismissalTime);
    localStorage.setItem('school_timezone', timeZone);

    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleTestConnection = async () => {
    if (!scriptUrl.trim()) {
      setTestStatus({
        loading: false,
        success: false,
        message: 'Masukkan URL Google Apps Script Web App terlebih dahulu.',
      });
      return;
    }

    if (!scriptUrl.trim().startsWith('https://script.google.com/')) {
      setTestStatus({
        loading: false,
        success: false,
        message: 'URL tidak valid. Harus diawali dengan https://script.google.com/',
      });
      return;
    }

    setTestStatus({ loading: true });

    try {
      const tokenParam = scriptToken.trim()
        ? `&token=${encodeURIComponent(scriptToken.trim())}`
        : '';
      const res = await fetch(`${scriptUrl.trim()}?action=ping${tokenParam}`);
      const json = await res.json();

      if (json && json.success) {
        setTestStatus({
          loading: false,
          success: true,
          message: 'Koneksi berhasil! Google Apps Script aktif dan terhubung ke spreadsheet.',
        });
      } else {
        setTestStatus({
          loading: false,
          success: false,
          message: json.error || 'Server Apps Script merespons tetapi mengembalikan error.',
        });
      }
    } catch {
      setTestStatus({
        loading: false,
        success: false,
        message: 'Gagal terhubung. Pastikan URL benar dan izin deployment diatur ke "Anyone".',
      });
    }
  };

  const handleClearSyncedData = async () => {
    if (confirm('Apakah Anda ingin membersihkan transaksi yang SUDAH TERSINKRON? Data pending tidak akan dihapus.')) {
      await db.transactions.where('syncStatus').equals('SYNCED').delete();
      alert('Data tersinkron berhasil dibersihkan dari penyimpanan lokal.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Halaman */}
      <div>
        <h2 className="text-xl font-bold text-content-primary">Pengaturan Sistem Absensi</h2>
        <p className="text-xs text-content-secondary mt-1">
          Konfigurasi jadwal sekolah, batas keterlambatan, dan integrasi backend Google Sheets.
        </p>
      </div>

      {savedSuccess && (
        <div className="p-3 bg-status-success-bg border border-status-success/30 rounded-card text-status-success text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Pengaturan sistem berhasil disimpan!</span>
        </div>
      )}

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* 1. Pengaturan Jam & Batas Keterlambatan */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary-600" />
              <CardTitle>Jadwal Sekolah &amp; Toleransi Absensi</CardTitle>
            </div>
            <CardDescription>
              Menentukan batas waktu otomatis status Hadir vs Terlambat.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="Batas Jam Masuk (Tepat Waktu)"
                type="time"
                value={entryTimeLimit}
                onChange={(e) => setEntryTimeLimit(e.target.value)}
                helperText="Lewat dari jam ini otomatis TERLAMBAT"
                required
              />
              <Input
                label="Jam Mulai Kepulangan Siswa"
                type="time"
                value={dismissalTime}
                onChange={(e) => setDismissalTime(e.target.value)}
                helperText="Waktu awal pembukaan sesi PULANG"
                required
              />
              <Select
                label="Zona Waktu Operasional"
                value={timeZone}
                onChange={(e) => setTimeZone(e.target.value)}
                helperText="WITA digunakan sebagai konfigurasi awal"
              >
                <option value="Asia/Makassar">WITA (Asia/Makassar - UTC+8)</option>
                <option value="Asia/Jakarta">WIB (Asia/Jakarta - UTC+7)</option>
                <option value="Asia/Jayapura">WIT (Asia/Jayapura - UTC+9)</option>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* 2. Integrasi Google Apps Script */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-primary-600" />
              <CardTitle>Integrasi Google Sheets &amp; Apps Script</CardTitle>
            </div>
            <CardDescription>
              Masukkan URL dan Token rahasia agar transaksi 3 PC tersinkron secara aman ke Google Sheets.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="URL Google Apps Script Web App"
              placeholder="https://script.google.com/macros/s/AKfycb.../exec"
              value={scriptUrl}
              onChange={(e) => { setScriptUrlState(e.target.value); setUrlError(''); }}
              helperText="Dapatkan URL ini setelah Deploy → Web App di Google Spreadsheet."
              error={urlError}
            />

            {/* Token rahasia untuk autentikasi */}
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-button">
              <div className="flex items-start gap-2 mb-2">
                <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-amber-800">Token Keamanan Backend</p>
                  <p className="text-[10px] text-amber-700 mt-0.5">
                    Token ini dikirim ke Apps Script setiap kali sinkronisasi. 
                    Harus sama dengan SECRET_TOKEN di file Code.gs Anda. Kosongkan jika belum dikonfigurasi.
                  </p>
                </div>
              </div>
              <Input
                label="Secret Token Apps Script"
                type="password"
                placeholder="Masukkan token rahasia yang sama dengan Code.gs"
                value={scriptToken}
                onChange={(e) => setScriptTokenState(e.target.value)}
                leftIcon={<KeyRound className="w-4 h-4" />}
                helperText="Contoh: a3f9b2c1-d4e5-6789-f012-abcdef012345"
              />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                isLoading={testStatus.loading}
              >
                Uji Koneksi ke Google Sheets
              </Button>

              {testStatus.message && (
                <div
                  className={`text-xs p-2 rounded-button flex items-center gap-1.5 ${
                    testStatus.success
                      ? 'bg-status-success-bg text-status-success'
                      : 'bg-status-danger-bg text-status-danger'
                  }`}
                >
                  {testStatus.success ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{testStatus.message}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 3. Pengaturan Komputer Ini */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Laptop className="w-4 h-4 text-primary-600" />
              <CardTitle>Identitas Fisik Komputer Ini</CardTitle>
            </div>
            <CardDescription>
              Pengenal yang disematkan pada setiap catatan transaksi absensi dari browser ini.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-w-xs">
              <Select
                label="Identitas Perangkat Aktif"
                value={currentDeviceId}
                onChange={(e) => onDeviceChange(e.target.value as DeviceId)}
              >
                <option value="PC-01">PC-01 (Komputer Gerbang Utama)</option>
                <option value="PC-02">PC-02 (Komputer Gerbang Barat)</option>
                <option value="PC-03">PC-03 (Komputer Ruang Piket)</option>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Tombol Simpan */}
        <div className="flex justify-end">
          <Button type="submit" size="lg" className="shadow-sm">
            Simpan Seluruh Pengaturan
          </Button>
        </div>
      </form>

      {/* 4. Pemeliharaan Data Lokal */}
      <Card className="border-red-200">
        <CardHeader className="bg-red-50/50">
          <div className="flex items-center gap-2 text-status-danger">
            <Database className="w-4 h-4" />
            <CardTitle className="text-status-danger">Pemeliharaan &amp; Pembersihan Ruang Penyimpanan</CardTitle>
          </div>
          <CardDescription>
            Tindakan pembersihan cache IndexedDB lokal pada komputer ini.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h4 className="text-xs font-bold text-content-primary">Bersihkan Riwayat Tersinkron</h4>
              <p className="text-[11px] text-content-secondary mt-0.5">
                Hanya menghapus transaksi lokal yang sudah aman tercatat di server Google Sheets.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClearSyncedData}
              className="text-status-danger border-red-200 hover:bg-red-50"
              leftIcon={<Trash2 className="w-4 h-4" />}
            >
              Bersihkan Cache Tersinkron
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
