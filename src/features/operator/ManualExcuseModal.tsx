import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/attendanceDb';
import type { AttendanceStatus, DeviceId, UserAccount, AttendanceTransaction, Student } from '../../types';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { generateUUID } from '../../lib/utils';
import { FileText, CheckCircle2, AlertCircle, Search, UserCheck, X } from 'lucide-react';

export interface ManualExcuseModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDeviceId: DeviceId;
  currentUser: UserAccount | null;
  onSuccess?: (msg: string) => void;
}

export const ManualExcuseModal: React.FC<ManualExcuseModalProps> = ({
  isOpen,
  onClose,
  currentDeviceId,
  currentUser,
  onSuccess,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [status, setStatus] = useState<AttendanceStatus>('IZIN');
  const [note, setNote] = useState('');
  const [attendanceDate, setAttendanceDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const allStudents = useLiveQuery(() => db.students.filter((s) => s.isActive).toArray(), []) || [];

  // Filter daftar siswa secara instan berdasarkan ID atau Nama
  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return allStudents
      .filter((s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || s.className.toLowerCase().includes(q))
      .slice(0, 8); // Tampilkan 8 saran teratas agar ringkas dan cepat
  }, [allStudents, searchQuery]);

  const handleSelectStudent = (student: Student) => {
    setSelectedStudent(student);
    setSearchQuery('');
    setError('');
  };

  const handleClearSelectedStudent = () => {
    setSelectedStudent(null);
    setSearchQuery('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!selectedStudent) {
      setError('Silakan cari dan pilih siswa terlebih dahulu.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Periksa apakah siswa sudah memiliki catatan izin/sakit/BK pada tanggal ini
      const existing = await db.transactions
        .where('studentId')
        .equals(selectedStudent.id)
        .and((t) => t.attendanceDate === attendanceDate && t.attendanceType === 'MASUK')
        .first();

      if (existing && (existing.attendanceStatus === 'IZIN' || existing.attendanceStatus === 'SAKIT' || existing.attendanceStatus === 'BK')) {
        setError(`Siswa [${selectedStudent.name}] sudah tercatat [${existing.attendanceStatus}] pada tanggal ini.`);
        setIsSubmitting(false);
        return;
      }

      const now = new Date();
      const transaction: AttendanceTransaction = {
        transactionId: generateUUID(),
        studentId: selectedStudent.id,
        studentName: selectedStudent.name,
        className: selectedStudent.className,
        attendanceDate,
        attendanceType: 'MASUK', // Dicatat pada sesi masuk
        method: 'MANUAL',
        attendanceStatus: status,
        deviceId: currentDeviceId,
        operatorId: currentUser?.username || 'admin',
        operatorName: currentUser?.fullName || 'Petugas Piket',
        deviceTimestamp: now.toISOString(),
        syncStatus: 'PENDING',
        note: note.trim() || undefined,
      };

      await db.transactions.add(transaction);

      if (onSuccess) {
        onSuccess(`Pencatatan [${status}] untuk [${selectedStudent.name}] berhasil disimpan.`);
      }

      // Reset form
      handleClearSelectedStudent();
      setNote('');
      setStatus('IZIN');
      onClose();
    } catch {
      setError('Gagal menyimpan catatan keterangan.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        handleClearSelectedStudent();
        onClose();
      }}
      title="Catat Izin, Sakit, Alfa, atau BK"
      description="Pencatatan cepat keterangan ketidakhadiran siswa dengan pencarian Nama atau ID siswa."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-status-danger-bg text-status-danger rounded-button text-xs font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 1. KOTAK PENCARIAN SISWA INTERAKTIF */}
        <div>
          <label className="block text-xs font-semibold text-content-primary mb-1">
            Cari Nama atau ID Siswa
          </label>

          {selectedStudent ? (
            // Tampilan Siswa yang Sudah Dipilih
            <div className="flex items-center justify-between p-3 rounded-card bg-primary-50 border border-primary-200">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-primary-900 leading-tight">
                    {selectedStudent.name}
                  </p>
                  <p className="text-[11px] text-primary-700">
                    Kelas: <strong>{selectedStudent.className}</strong> • ID: <span className="font-mono">{selectedStudent.id}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClearSelectedStudent}
                className="p-1 rounded-lg text-primary-700 hover:text-primary-900 hover:bg-primary-100 transition-colors"
                title="Ganti Siswa"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            // Kolom Input Pencarian Siswa
            <div className="relative">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Ketik Nama atau ID siswa (contoh: Nurul / M1B-26)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                  className="w-full bg-surface text-content-primary text-xs rounded-button border border-border pl-9 pr-3.5 py-2.5 focus:outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600 shadow-xs"
                />
              </div>

              {/* Hasil Saran Dropdown Pencarian */}
              {searchQuery.trim() && (
                <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white rounded-button border border-border shadow-lg z-50 divide-y divide-border">
                  {filteredStudents.length === 0 ? (
                    <div className="p-3 text-center text-xs text-content-secondary">
                      Tidak ditemukan siswa dengan kata kunci "{searchQuery}"
                    </div>
                  ) : (
                    filteredStudents.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleSelectStudent(s)}
                        className="w-full text-left p-2.5 hover:bg-primary-50 transition-colors flex items-center justify-between text-xs"
                      >
                        <div>
                          <p className="font-semibold text-content-primary">{s.name}</p>
                          <p className="text-[11px] text-content-secondary">
                            Kelas {s.className} • ID: <span className="font-mono">{s.id}</span>
                          </p>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 font-medium text-gray-600">
                          Pilih
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 2. TANGGAL & STATUS KETERANGAN */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-content-primary mb-1">
              Tanggal Kehadiran
            </label>
            <input
              type="date"
              value={attendanceDate}
              onChange={(e) => setAttendanceDate(e.target.value)}
              className="w-full bg-surface text-content-primary text-xs rounded-button border border-border px-3 py-2 focus:outline-none focus:border-primary-600"
              required
            />
          </div>

          <Select
            label="Status Keterangan"
            value={status}
            onChange={(e) => setStatus(e.target.value as AttendanceStatus)}
          >
            <option value="IZIN">Izin (Urusan Keluarga/Dinas)</option>
            <option value="SAKIT">Sakit (Surat Dokter / Pemberitahuan)</option>
            <option value="ALFA">Alfa (Tanpa Keterangan)</option>
            <option value="BK">BK (Bimbingan Konseling / Penanganan Khusus)</option>
          </Select>
        </div>

        {/* 3. ALASAN / CATATAN */}
        <div>
          <label className="block text-xs font-semibold text-content-primary mb-1">
            Catatan / Alasan
          </label>
          <textarea
            rows={3}
            placeholder="Contoh: Sakit demam ada surat dokter / Izin acara keluarga / Pembinaan wali kelas..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full bg-surface text-content-primary text-xs rounded-button border border-border p-3 focus:outline-none focus:border-primary-600 placeholder:text-gray-400"
          />
        </div>

        {/* 4. TOMBOL SIMPAN */}
        <div className="pt-3 flex justify-end gap-2 border-t border-border">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              handleClearSelectedStudent();
              onClose();
            }}
          >
            Batal
          </Button>
          <Button type="submit" isLoading={isSubmitting} disabled={!selectedStudent}>
            Simpan Keterangan
          </Button>
        </div>
      </form>
    </Modal>
  );
};
