import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/attendanceDb';
import type { UserAccount, DeviceAssignment, UserRole } from '../../types';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import {
  UserPlus, UserCheck, Shield, Laptop, Trash2, KeyRound, RefreshCw, ShieldCheck
} from 'lucide-react';
import {
  generateUUID,
  hashPassword,
  sanitizeInput,
  isValidUsername,
  isStrongPassword,
} from '../../lib/utils';

export const UsersPage: React.FC = () => {
  const users = useLiveQuery(() => db.users.toArray(), []) || [];

  // --- State: Tambah Akun ---
  const [isAddModalOpen, setIsAddModalOpen]   = useState(false);
  const [fullName, setFullName]               = useState('');
  const [username, setUsername]               = useState('');
  const [password, setPassword]               = useState('');
  const [role, setRole]                       = useState<UserRole>('ADMIN_PC');
  const [assignedDeviceId, setAssignedDeviceId] = useState<DeviceAssignment>('PC-01');
  const [addError, setAddError]               = useState('');

  // --- State: Reset Password ---
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetTargetUser, setResetTargetUser]   = useState<UserAccount | null>(null);
  const [newPassword, setNewPassword]           = useState('');
  const [confirmPassword, setConfirmPassword]   = useState('');
  const [resetError, setResetError]             = useState('');

  const [successMessage, setSuccessMessage] = useState('');

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(''), 4000);
  };

  // ── Tambah Akun ──────────────────────────────────────────────────────────
  const handleOpenAddUser = () => {
    setFullName(''); setUsername(''); setPassword('');
    setRole('ADMIN_PC'); setAssignedDeviceId('PC-01');
    setAddError('');
    setIsAddModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');

    const cleanUsername  = sanitizeInput(username).toLowerCase();
    const cleanFullName  = sanitizeInput(fullName, 60);
    const cleanPassword  = sanitizeInput(password, 128);

    if (!cleanFullName || !cleanUsername || !cleanPassword) {
      setAddError('Semua kolom wajib diisi!');
      return;
    }

    if (!isValidUsername(cleanUsername)) {
      setAddError('Username hanya boleh huruf, angka, underscore (_), atau strip (-). Panjang 3–30 karakter.');
      return;
    }

    const pwCheck = isStrongPassword(cleanPassword);
    if (!pwCheck.valid) {
      setAddError(pwCheck.message);
      return;
    }

    const existing = await db.users.where('username').equals(cleanUsername).first();
    if (existing) {
      setAddError(`Username "${cleanUsername}" sudah digunakan.`);
      return;
    }

    const passwordHash = await hashPassword(cleanPassword);

    const newUser: UserAccount = {
      userId:           `USR-${generateUUID().substring(0, 6).toUpperCase()}`,
      username:         cleanUsername,
      fullName:         cleanFullName,
      passwordHash,
      role,
      assignedDeviceId,
      status:           'ACTIVE',
      createdAt:        new Date().toISOString(),
    };

    await db.users.add(newUser);
    setIsAddModalOpen(false);
    showSuccess(`Akun [@${newUser.username}] untuk [${newUser.assignedDeviceId}] berhasil dibuat.`);
  };

  // ── Reset Password ────────────────────────────────────────────────────────
  const handleOpenReset = (user: UserAccount) => {
    setResetTargetUser(user);
    setNewPassword(''); setConfirmPassword(''); setResetError('');
    setIsResetModalOpen(true);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');

    if (!resetTargetUser) return;

    const cleanNew     = sanitizeInput(newPassword, 128);
    const cleanConfirm = sanitizeInput(confirmPassword, 128);

    const pwCheck = isStrongPassword(cleanNew);
    if (!pwCheck.valid) {
      setResetError(pwCheck.message);
      return;
    }

    if (cleanNew !== cleanConfirm) {
      setResetError('Konfirmasi password tidak cocok.');
      return;
    }

    const passwordHash = await hashPassword(cleanNew);
    await db.users.update(resetTargetUser.userId, { passwordHash });
    setIsResetModalOpen(false);
    showSuccess(`Password akun [@${resetTargetUser.username}] berhasil diperbarui.`);
  };

  // ── Hapus Akun ───────────────────────────────────────────────────────────
  const handleDeleteUser = async (userId: string, uname: string) => {
    if (uname === 'admin') {
      alert('Akun Super Admin utama tidak dapat dihapus.');
      return;
    }
    if (confirm(`Apakah Anda yakin ingin menghapus akun @${uname}? Tindakan ini tidak dapat dibatalkan.`)) {
      await db.users.delete(userId);
      showSuccess(`Akun @${uname} berhasil dihapus.`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-content-primary">Manajemen Pengguna &amp; Akun PC</h2>
          <p className="text-xs text-content-secondary mt-1">
            Buat dan kelola akun login operator serta admin khusus untuk masing-masing komputer.
          </p>
        </div>
        <Button
          onClick={handleOpenAddUser}
          leftIcon={<UserPlus className="w-4 h-4" />}
          className="shadow-sm"
        >
          Tambah Akun PC Baru
        </Button>
      </div>

      {/* Alert Sukses */}
      {successMessage && (
        <div className="p-3 bg-status-success-bg border border-status-success/30 rounded-card text-status-success text-xs font-semibold flex items-center gap-2">
          <UserCheck className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Info keamanan */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-card text-xs text-blue-800">
        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
        <span>
          Semua password disimpan dalam bentuk <strong>SHA-256 hash</strong> — tidak ada yang bisa membaca password asli, termasuk administrator.
          Gunakan fitur Reset Password jika operator lupa kata sandi.
        </span>
      </div>

      {/* Tabel Pengguna */}
      <Card>
        <CardHeader>
          <CardTitle>Daftar Akun Pengguna</CardTitle>
          <CardDescription>
            Menampilkan {users.length} akun terdaftar pada sistem lokal.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-gray-50/75 text-[11px] font-semibold text-content-secondary uppercase tracking-wider">
                  <th className="py-3 px-4">Pengguna</th>
                  <th className="py-3 px-4 hidden sm:table-cell">Peran</th>
                  <th className="py-3 px-4 hidden md:table-cell">Komputer</th>
                  <th className="py-3 px-4 hidden sm:table-cell">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-xs">
                {users.map((user) => (
                  <tr key={user.userId} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 font-bold flex items-center justify-center shrink-0 text-sm">
                          {user.fullName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-content-primary">{user.fullName}</p>
                          <p className="text-content-secondary text-[11px]">@{user.username}</p>
                          {/* Mobile: tampilkan info PC di baris ini */}
                          <p className="text-[10px] text-content-secondary md:hidden mt-0.5">
                            {user.assignedDeviceId === 'ALL' ? 'Semua PC' : user.assignedDeviceId}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 hidden sm:table-cell">
                      {user.role === 'SUPER_ADMIN' ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium text-[11px]">
                          <Shield className="w-3 h-3" />Super Admin
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium text-[11px]">
                          <Laptop className="w-3 h-3" />Operator PC
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell">
                      {user.assignedDeviceId === 'ALL' ? (
                        <span className="px-2 py-1 rounded-md bg-gray-100 text-gray-700 font-medium text-[11px]">
                          Semua PC (Bebas)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary-50 text-primary-700 border border-primary-200 font-bold text-[11px]">
                          <Laptop className="w-3 h-3" />{user.assignedDeviceId}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 hidden sm:table-cell">
                      <Badge variant={user.status === 'ACTIVE' ? 'success' : 'danger'} dot>
                        {user.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* Reset Password */}
                        <button
                          onClick={() => handleOpenReset(user)}
                          className="p-1.5 text-gray-400 hover:text-primary-600 rounded-md hover:bg-gray-100 transition-colors"
                          title="Reset password akun ini"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                        {/* Hapus */}
                        {user.username !== 'admin' && (
                          <button
                            onClick={() => handleDeleteUser(user.userId, user.username)}
                            className="p-1.5 text-gray-400 hover:text-status-danger rounded-md hover:bg-gray-100 transition-colors"
                            title="Hapus akun"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Modal: Tambah Akun ── */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Buat Akun PC Baru"
        description="Buat akun admin atau operator yang ditugaskan khusus untuk komputer tertentu."
      >
        <form onSubmit={handleSaveUser} className="space-y-4" autoComplete="off">
          {addError && (
            <div className="p-2.5 bg-status-danger-bg text-status-danger rounded-button text-xs font-medium">
              {addError}
            </div>
          )}

          <Input
            label="Nama Lengkap Operator / Penanggung Jawab"
            placeholder="Contoh: Operator Gerbang Barat"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />

          <Input
            label="Username Login"
            placeholder="Contoh: admin_pc02"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            helperText="Huruf kecil, angka, underscore (_), atau strip (-). 3–30 karakter."
            required
          />

          <Input
            type="password"
            label="Password"
            placeholder="Minimal 6 karakter"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            leftIcon={<KeyRound className="w-4 h-4" />}
            helperText="Password akan di-hash SHA-256 sebelum disimpan."
            required
          />

          <Select
            label="Peran Akun (Role)"
            value={role}
            onChange={(e) => {
              const r = e.target.value as UserRole;
              setRole(r);
              if (r === 'SUPER_ADMIN') setAssignedDeviceId('ALL');
              else if (assignedDeviceId === 'ALL') setAssignedDeviceId('PC-01');
            }}
          >
            <option value="ADMIN_PC">Admin / Operator Komputer Tertentu</option>
            <option value="SUPER_ADMIN">Super Admin (Akses Penuh Semua Menu)</option>
          </Select>

          {/* Penugasan PC */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-content-primary">
              Penugasan Komputer (Assigned PC)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['PC-01', 'PC-02', 'PC-03', 'ALL'] as DeviceAssignment[]).map((pc) => (
                <label
                  key={pc}
                  className={`flex items-center gap-2 p-2.5 rounded-button border text-xs cursor-pointer transition-colors ${
                    assignedDeviceId === pc
                      ? 'border-primary-600 bg-primary-50/60 font-semibold text-primary-800'
                      : 'border-border hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="assignedPc"
                    checked={assignedDeviceId === pc}
                    onChange={() => setAssignedDeviceId(pc)}
                    className="text-primary-600"
                  />
                  <span>
                    {pc === 'ALL'   && <><strong>Semua PC</strong> (Bebas)</>}
                    {pc === 'PC-01' && <><strong>PC-01</strong> — Gerbang Utama</>}
                    {pc === 'PC-02' && <><strong>PC-02</strong> — Gerbang Barat</>}
                    {pc === 'PC-03' && <><strong>PC-03</strong> — Ruang Piket</>}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)}>Batal</Button>
            <Button type="submit">Simpan Akun</Button>
          </div>
        </form>
      </Modal>

      {/* ── Modal: Reset Password ── */}
      <Modal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        title="Reset Password Akun"
        description={`Atur password baru untuk akun @${resetTargetUser?.username ?? ''}.`}
      >
        <form onSubmit={handleResetPassword} className="space-y-4" autoComplete="off">
          {resetError && (
            <div className="p-2.5 bg-status-danger-bg text-status-danger rounded-button text-xs font-medium">
              {resetError}
            </div>
          )}

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-button text-xs text-amber-800 flex items-start gap-2">
            <Shield className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
            <span>
              Password lama akan langsung digantikan. Pastikan operator sudah diberitahu password baru mereka.
            </span>
          </div>

          <Input
            type="password"
            label="Password Baru"
            placeholder="Minimal 6 karakter"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            leftIcon={<KeyRound className="w-4 h-4" />}
            required
          />

          <Input
            type="password"
            label="Konfirmasi Password Baru"
            placeholder="Ketik ulang password baru"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            leftIcon={<KeyRound className="w-4 h-4" />}
            required
          />

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsResetModalOpen(false)}>Batal</Button>
            <Button type="submit" variant="primary">
              Simpan Password Baru
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
