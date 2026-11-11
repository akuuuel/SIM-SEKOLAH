import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/attendanceDb';
import { fetchMasterStudentsFromSheets } from '../../services/syncService';
import type { Student } from '../../types';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { UserPlus, Search, Barcode, Phone, CloudDownload, CheckCircle2, AlertCircle } from 'lucide-react';

export const StudentsPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [notification, setNotification] = useState<{ success: boolean; message: string } | null>(null);
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [className, setClassName] = useState('X MIPA 1');
  const [whatsappNumber, setWhatsappNumber] = useState('');

  const students = useLiveQuery(
    () =>
      db.students
        .filter((s) => {
          if (!searchTerm) return true;
          const term = searchTerm.toLowerCase();
          return s.name.toLowerCase().includes(term) || s.id.toLowerCase().includes(term);
        })
        .toArray(),
    [searchTerm]
  ) || [];

  const handleFetchFromSheets = async () => {
    setIsFetching(true);
    setNotification(null);

    const res = await fetchMasterStudentsFromSheets();
    setIsFetching(false);

    if (res.success) {
      setNotification({
        success: true,
        message: `Berhasil menarik ${res.total} data siswa dari Google Sheets tab PAGE!`,
      });
    } else {
      setNotification({
        success: false,
        message: `Gagal menarik data: ${res.error || 'Pastikan URL Apps Script sudah diatur di Pengaturan Sistem.'}`,
      });
    }

    setTimeout(() => setNotification(null), 5000);
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !name.trim()) return;

    const newStudent: Student = {
      id: id.trim().toUpperCase(),
      name: name.trim(),
      className: className.trim(),
      barcodeValue: id.trim().toUpperCase(),
      whatsappNumber: whatsappNumber.trim(),
      isActive: true,
      updatedAt: new Date().toISOString(),
    };

    await db.students.put(newStudent);
    setIsAddModalOpen(false);
    setId('');
    setName('');
    setWhatsappNumber('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-content-primary">Data Siswa</h2>
          <p className="text-xs text-content-secondary mt-1">
            Data master siswa yang tersimpan di cache lokal IndexedDB dan tersinkron dengan Google Sheets.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={handleFetchFromSheets}
            isLoading={isFetching}
            leftIcon={<CloudDownload className="w-4 h-4 text-primary-600" />}
            title="Sinkronkan data siswa dari Google Sheet tab PAGE"
          >
            Tarik Siswa dari Sheets
          </Button>
          <Button
            onClick={() => setIsAddModalOpen(true)}
            leftIcon={<UserPlus className="w-4 h-4" />}
          >
            Tambah Siswa Baru
          </Button>
        </div>
      </div>

      {notification && (
        <div
          className={`p-3 border rounded-card text-xs font-semibold flex items-center gap-2 ${
            notification.success
              ? 'bg-status-success-bg border-status-success/30 text-status-success'
              : 'bg-status-danger-bg border-status-danger/30 text-status-danger'
          }`}
        >
          {notification.success ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      <Card>
        <CardHeader className="flex-col sm:flex-row gap-3">
          <div>
            <CardTitle>Daftar Siswa Aktif</CardTitle>
            <CardDescription>Total {students.length} siswa terdaftar di sistem.</CardDescription>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Cari nama atau ID siswa..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-canvas text-xs rounded-button border border-border pl-9 pr-3.5 py-2 focus:outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-gray-50/75 text-[11px] font-semibold text-content-secondary uppercase tracking-wider">
                  <th className="py-3 px-6">ID / Barcode</th>
                  <th className="py-3 px-6">Nama Siswa</th>
                  <th className="py-3 px-6">Kelas</th>
                  <th className="py-3 px-6">No. WhatsApp Wali</th>
                  <th className="py-3 px-6">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {students.map((student) => (
                  <tr key={student.id} className="hover:bg-gray-50/50">
                    <td className="py-3 px-6 font-mono font-bold text-primary-700">
                      <div className="flex items-center gap-1.5">
                        <Barcode className="w-4 h-4 text-gray-400" />
                        <span>{student.id}</span>
                      </div>
                    </td>
                    <td className="py-3 px-6 font-semibold text-content-primary">
                      {student.name}
                    </td>
                    <td className="py-3 px-6 text-content-secondary">{student.className}</td>
                    <td className="py-3 px-6 font-mono text-content-secondary">
                      {student.whatsappNumber ? (
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3 h-3 text-status-success" />
                          <span>{student.whatsappNumber}</span>
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="py-3 px-6">
                      <Badge variant="success" dot>
                        {student.isActive ? 'Aktif' : 'Nonaktif'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modal Tambah Siswa */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Tambah Siswa Baru"
        description="Data siswa baru akan disimpan lokal dan disinkronkan ke master Google Sheets."
      >
        <form onSubmit={handleAddStudent} className="space-y-4">
          <Input
            label="ID Siswa / Kode Barcode"
            placeholder="Contoh: M1B-26-009"
            value={id}
            onChange={(e) => setId(e.target.value)}
            required
          />
          <Input
            label="Nama Lengkap Siswa"
            placeholder="Contoh: Muhammad Rizky"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            label="Kelas"
            placeholder="Contoh: X MIPA 1"
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            required
          />
          <Input
            label="Nomor WhatsApp Orang Tua"
            placeholder="Contoh: 081234567890"
            value={whatsappNumber}
            onChange={(e) => setWhatsappNumber(e.target.value)}
          />
          <div className="pt-3 flex justify-end gap-2 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Batal
            </Button>
            <Button type="submit">Simpan Siswa</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

