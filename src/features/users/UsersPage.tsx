import React, { useState, useEffect, useMemo } from 'react';
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
  UserCheck, Shield, Laptop, Trash2, KeyRound, RefreshCw, ShieldCheck, HeartHandshake, Phone, AlertCircle,
  Search, X, Users, GraduationCap, Check
} from 'lucide-react';
import {
  generateUUID,
  hashPassword,
  sanitizeInput,
  isValidUsername,
  isStrongPassword,
  normalizePhoneNumber,
} from '../../lib/utils';
import { Swal } from '../../lib/swal';
import { 
  saveUserToServer, 
  deleteUserFromServer, 
  syncAllUsersToServer, 
  fetchUsersFromServer,
  fetchParentsFromServer,
  saveParentToServer,
  deleteParentFromServer,
  markParentAsDeleted,
  clearDeletedParentId,
} from '../../services/syncService';

export interface UsersPageProps {
  initialTab?: 'STAFF' | 'PARENT';
}

export const UsersPage: React.FC<UsersPageProps> = ({ initialTab = 'STAFF' }) => {
  const users    = useLiveQuery(() => db.users.toArray(), []) || [];
  const students = useLiveQuery(() => db.students.filter((s) => s.isActive).toArray(), []) || [];

  // Tab pemisah: Petugas Admin/Operator vs Akun Orang Tua
  const [activeUserTab, setActiveUserTab] = useState<'STAFF' | 'PARENT'>(initialTab);

  const staffUsers  = users.filter((u) => u.role !== 'PARENT');
  const parentUsers = users.filter((u) => u.role === 'PARENT');

  // ── State form tambah akun ──
  const [isAddModalOpen, setIsAddModalOpen]     = useState(false);
  const [fullName, setFullName]                 = useState('');
  const [username, setUsername]                 = useState('');
  const [password, setPassword]                 = useState('');
  const [role, setRole]                         = useState<UserRole>('ADMIN_PC');
  const [assignedDeviceId, setAssignedDeviceId] = useState<DeviceAssignment>('PC-01');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [parentPhone, setParentPhone]           = useState('');
  const [addError, setAddError]                 = useState('');

  // ── State pencarian siswa (mendukung multi-pilih siswa/anak) ──
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [isStudentDropdownOpen, setIsStudentDropdownOpen] = useState(false);

  // ── State pencarian tabel akun pengguna ──
  const [tableSearchQuery, setTableSearchQuery] = useState('');

  const filteredUsers = useMemo(() => {
    const list = activeUserTab === 'STAFF' ? staffUsers : parentUsers;
    const q = tableSearchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((u) => {
      const matchName = u.fullName.toLowerCase().includes(q);
      const matchUname = u.username.toLowerCase().includes(q);
      const matchPhone = (u.phone || '').toLowerCase().includes(q);
      const matchStudentId = (u.studentId || '').toLowerCase().includes(q);

      // Pencarian anak terkait (mendukung 1 atau banyak anak bersaudara)
      const uPhoneClean = normalizePhoneNumber(u.phone || u.username || '');
      const explicitIds = new Set<string>();
      if (u.studentId) explicitIds.add(u.studentId);
      if (Array.isArray(u.studentIds)) {
        u.studentIds.forEach((id) => explicitIds.add(id));
      }

      const matchAnyChild = students.some((s) => {
        const isLinked =
          explicitIds.has(s.id) ||
          (uPhoneClean && s.whatsappNumber && normalizePhoneNumber(s.whatsappNumber) === uPhoneClean);
        if (!isLinked) return false;
        return (
          s.name.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          (s.className && s.className.toLowerCase().includes(q))
        );
      });

      return matchName || matchUname || matchPhone || matchStudentId || matchAnyChild;
    });
  }, [activeUserTab, staffUsers, parentUsers, tableSearchQuery, students]);

  // ── State reset password ──
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetTargetUser, setResetTargetUser]   = useState<UserAccount | null>(null);
  const [newPassword, setNewPassword]           = useState('');
  const [confirmPassword, setConfirmPassword]   = useState('');
  const [resetError, setResetError]             = useState('');

  const [successMessage, setSuccessMessage] = useState('');
  const [isSyncingAll, setIsSyncingAll]       = useState(false);
  const [dbStatus, setDbStatus]               = useState<'CHECKING' | 'CONNECTED' | 'DISCONNECTED'>('CHECKING');
  const [dbError, setDbError]                 = useState('');

  const checkServerStatus = async () => {
    try {
      const res = await fetchUsersFromServer();
      await fetchParentsFromServer().catch(() => {});
      if (res.success) {
        setDbStatus('CONNECTED');
        setDbError('');
      } else {
        setDbStatus('DISCONNECTED');
        setDbError(res.error || 'Server XAMPP tidak merespons');
      }
    } catch (err: unknown) {
      setDbStatus('DISCONNECTED');
      setDbError(err instanceof Error ? err.message : 'Koneksi terputus');
    }
  };

  useEffect(() => {
    checkServerStatus();
    const onFocus = () => {
      checkServerStatus();
    };
    window.addEventListener('focus', onFocus);
    const interval = setInterval(() => {
      checkServerStatus();
    }, 15000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, []);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(''), 5000);
  };

  // ── Sinkronkan seluruh akun lokal ke MySQL XAMPP ──
  const handleSyncToDatabase = async () => {
    setIsSyncingAll(true);
    try {
      const res = await syncAllUsersToServer();
      if (res.success) {
        showSuccess(`Berhasil menyinkronkan ${res.syncedCount} akun ke database MySQL XAMPP! Akun siap dipakai login di HP.`);
        checkServerStatus();
      } else {
        await Swal.error(
          'Gagal Sinkronkan ke MySQL',
          `Gagal terhubung ke MySQL XAMPP: ${res.error || 'Koneksi terputus'}.\n\nPastikan di XAMPP Control Panel:\n1. Apache: START (Hijau)\n2. MySQL: START (Hijau)`
        );
      }
    } catch (err: unknown) {
      await Swal.error('Terjadi Kesalahan', err instanceof Error ? err.message : String(err));
    } finally {
      setIsSyncingAll(false);
    }
  };

  // ── Buka modal tambah ──────────────────────────────────────────────────────
  const handleOpenAddUser = () => {
    setFullName(''); setUsername(''); setPassword('');
    setRole('ADMIN_PC'); setAssignedDeviceId('PC-01');
    setSelectedStudentIds([]);
    setParentPhone('');
    setAddError('');
    setStudentSearchQuery('');
    setIsStudentDropdownOpen(false);
    setIsAddModalOpen(true);
  };

  // Tutup dropdown saat klik di luar area pencarian
  useEffect(() => {
    if (!isStudentDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-student-search]')) {
        setIsStudentDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isStudentDropdownOpen]);

  // ── Simpan akun ──────────────────────────────────────────────────────────
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');

    const cleanUsername  = sanitizeInput(username).toLowerCase().trim();
    const cleanFullName  = sanitizeInput(fullName, 60);
    const cleanPassword  = sanitizeInput(password, 128);

    if (!cleanFullName || !cleanUsername || !cleanPassword) {
      setAddError('Semua kolom wajib diisi!');
      return;
    }

    if (activeUserTab === 'STAFF') {
      if (!isValidUsername(cleanUsername)) {
        setAddError('Username hanya boleh huruf, angka, underscore (_), atau strip (-). Panjang 3–30 karakter.');
        return;
      }
    } else {
      if (selectedStudentIds.length === 0) {
        setAddError('Silakan cari dan pilih minimal 1 siswa dari kotak pencarian "Hubungkan dengan Siswa (Anak)"!');
        return;
      }
    }

    const pwCheck = isStrongPassword(cleanPassword);
    if (!pwCheck.valid) {
      setAddError(pwCheck.message);
      return;
    }

    const existing = await db.users.where('username').equals(cleanUsername).first();
    if (existing) {
      setAddError(`Username/No.HP "${cleanUsername}" sudah digunakan oleh akun lain.`);
      return;
    }

    const passwordHash = await hashPassword(cleanPassword);

    // Deteksi seluruh anak (saudara kandung) yang dipilih langsung atau berbagi nomor WA yang sama
    const cleanParentPhone = normalizePhoneNumber(parentPhone || cleanUsername);
    const matchedSiblingIds = students
      .filter((s) => {
        if (selectedStudentIds.includes(s.id)) return true;
        if (cleanParentPhone && s.whatsappNumber && normalizePhoneNumber(s.whatsappNumber) === cleanParentPhone) {
          return true;
        }
        return false;
      })
      .map((s) => s.id);

    const allSiblingIds = Array.from(
      new Set([...selectedStudentIds, ...matchedSiblingIds])
    );
    const primaryStudentId = allSiblingIds[0] ?? '';

    const newUser: UserAccount = activeUserTab === 'PARENT' ? {
      userId:           `USR-${generateUUID().substring(0, 6).toUpperCase()}`,
      username:         cleanUsername,
      fullName:         cleanFullName,
      passwordHash,
      role:             'PARENT',
      assignedDeviceId: 'ALL',
      studentId:        primaryStudentId,
      studentIds:       allSiblingIds.length > 0 ? allSiblingIds : undefined,
      phone:            parentPhone || cleanUsername,
      status:           'ACTIVE',
      createdAt:        new Date().toISOString(),
    } : {
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
    if (activeUserTab === 'PARENT') {
      clearDeletedParentId(newUser.userId, newUser.phone || newUser.username);
      clearDeletedParentId(newUser.userId, cleanUsername);
    }
    const serverResult = activeUserTab === 'PARENT' 
      ? await saveParentToServer(newUser)
      : await saveUserToServer(newUser);
    setIsAddModalOpen(false);

    if (serverResult.success) {
      showSuccess(
        activeUserTab === 'PARENT'
          ? `Akun orang tua [${newUser.fullName}] berhasil dibuat ${
              allSiblingIds.length > 1 ? `(terhubung ke ${allSiblingIds.length} anak bersaudara) ` : ''
            }& tersimpan ke database MySQL (orang_tua)! Bisa langsung login di HP.`
          : `Akun petugas [@${newUser.username}] berhasil dibuat & tersimpan ke MySQL (users).`
      );
    } else {
      showSuccess(
        activeUserTab === 'PARENT'
          ? `Akun orang tua [${newUser.fullName}] dibuat di PC. (Catatan: Belum terhubung ke MySQL, silakan klik tombol 'Sinkronkan ke MySQL' setelah Apache & MySQL aktif).`
          : `Akun petugas [@${newUser.username}] berhasil dibuat.`
      );
    }
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
    const updatedUser = { ...resetTargetUser, passwordHash };
    if (resetTargetUser.role === 'PARENT') {
      saveParentToServer(updatedUser).catch(() => {});
    } else {
      saveUserToServer(updatedUser).catch(() => {});
    }
    setIsResetModalOpen(false);
    showSuccess(`Password akun [@${resetTargetUser.username}] berhasil diperbarui.`);
  };

  // ── Hapus Akun ───────────────────────────────────────────────────────────
  const handleDeleteUser = async (userId: string, uname: string) => {
    if (uname === 'admin') {
      await Swal.error('Tidak Dapat Dihapus', 'Akun Super Admin utama tidak dapat dihapus.');
      return;
    }
    const confirmed = await Swal.confirm(
      'Hapus Akun?',
      `Akun <b>@${uname}</b> akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.`
    );
    if (!confirmed) return;

    // Tentukan phone untuk akun PARENT (uname = nomor HP username)
    const targetUser = users.find((u) => u.userId === userId);
    const phone = targetUser?.phone || uname;
    const isParent = activeUserTab === 'PARENT' || targetUser?.role === 'PARENT';

    // 1. Hapus dari IndexedDB lokal terlebih dahulu (UI langsung update)
    await db.users.delete(userId);

    // Tandai sebagai deleted di localStorage agar tidak muncul kembali saat fetchParentsFromServer
    if (isParent) {
      markParentAsDeleted(userId, phone);
      markParentAsDeleted(userId, uname);
    }

    // 2. Hapus dari MySQL — tunggu hasilnya & tampilkan pesan yang jelas
    if (isParent) {
      const res = await deleteParentFromServer(userId, phone);
      // Hapus juga dari tabel users MySQL jika sebelumnya tersimpan di tabel users lama
      await deleteUserFromServer(userId, uname).catch(() => {});
      await deleteUserFromServer(userId, phone).catch(() => {});

      if (!res.success) {
        showSuccess(`Akun @${uname} dihapus dari PC. MySQL offline: ${res.error || 'koneksi terputus'}. Akun tidak akan muncul lagi saat reload.`);
        return;
      }
    } else {
      const res = await deleteUserFromServer(userId, uname);
      if (!res.success) {
        showSuccess(`Akun @${uname} dihapus dari PC. Gagal hapus dari MySQL: ${res.error || 'koneksi terputus'}.`);
        return;
      }
    }

    showSuccess(`Akun @${uname} berhasil dihapus permanen dari PC dan database MySQL.`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-content-primary">
            {activeUserTab === 'STAFF' ? 'Admin & Operator Komputer' : 'Akun Orang Tua Siswa (User)'}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleSyncToDatabase}
            isLoading={isSyncingAll}
            leftIcon={<RefreshCw className={`w-4 h-4 ${isSyncingAll ? 'animate-spin' : ''}`} />}
            className="text-primary-700 border-primary-200 hover:bg-primary-50 text-xs"
          >
            Sinkronkan ke MySQL (Kirim ke HP)
          </Button>
          <Button
            onClick={handleOpenAddUser}
            leftIcon={activeUserTab === 'STAFF' ? <Shield className="w-4 h-4" /> : <HeartHandshake className="w-4 h-4" />}
            className="shadow-sm"
          >
            {activeUserTab === 'STAFF' ? 'Tambah Akun Petugas' : 'Tambah Akun Orang Tua'}
          </Button>
        </div>
      </div>

      {/* Status Koneksi MySQL XAMPP */}
      {dbStatus === 'CONNECTED' ? (
        <div className="flex items-center gap-2 px-3.5 py-2 bg-emerald-50 border border-emerald-200 rounded-card text-xs text-emerald-800">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-semibold">MySQL XAMPP Terhubung</span>
        </div>
      ) : dbStatus === 'DISCONNECTED' ? (
        <div className="flex items-start gap-2.5 p-3.5 bg-amber-50 border border-amber-300 rounded-card text-xs text-amber-900 shadow-xs">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-amber-900">
              Perhatian: Server MySQL XAMPP Belum Terhubung
            </p>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              Akun yang Anda buat saat ini <strong>baru tersimpan di memori laptop</strong> dan belum masuk ke MySQL ({dbError || 'koneksi terputus'}).
            </p>
            <p className="text-[11px] text-amber-800 font-semibold pt-0.5">
              Solusi: Buka <strong>XAMPP Control Panel</strong> di laptop, pastikan tombol <strong>Apache</strong> dan <strong>MySQL</strong> keduanya sudah diklik <strong>START (Hijau)</strong>, lalu klik tombol <em>"Sinkronkan ke MySQL (Kirim ke HP)"</em> di atas.
            </p>
          </div>
        </div>
      ) : null}

      {/* Alert Sukses */}
      {successMessage && (
        <div className="p-3 bg-status-success-bg border border-status-success/30 rounded-card text-status-success text-xs font-semibold flex items-center gap-2">
          <UserCheck className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Tab Filter Pemisah: Admin / Operator Gerbang vs Akun Orang Tua Siswa */}
      <div className="flex border-b border-border gap-2">
        <button
          onClick={() => setActiveUserTab('STAFF')}
          className={`pb-3 px-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${
            activeUserTab === 'STAFF'
              ? 'border-primary-600 text-primary-700'
              : 'border-transparent text-content-secondary hover:text-content-primary'
          }`}
        >
          <Laptop className="w-4 h-4" />
          <span>Admin &amp; Operator Komputer</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-primary-100 text-primary-800 font-bold">
            {staffUsers.length}
          </span>
        </button>

        <button
          onClick={() => setActiveUserTab('PARENT')}
          className={`pb-3 px-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${
            activeUserTab === 'PARENT'
              ? 'border-primary-600 text-primary-700'
              : 'border-transparent text-content-secondary hover:text-content-primary'
          }`}
        >
          <HeartHandshake className="w-4 h-4" />
          <span>Akun Orang Tua Siswa</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-bold">
            {parentUsers.length}
          </span>
        </button>
      </div>

      {/* Tabel Pengguna */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle>
              {activeUserTab === 'STAFF' ? 'Daftar Akun Administrator & Operator' : 'Daftar Akun Orang Tua / Wali Siswa'}
            </CardTitle>
            <CardDescription>
              {activeUserTab === 'STAFF'
                ? `Menampilkan ${filteredUsers.length} dari ${staffUsers.length} akun petugas madrasah & perangkat scan.`
                : `Menampilkan ${filteredUsers.length} dari ${parentUsers.length} akun orang tua yang terhubung dengan data siswa.`}
            </CardDescription>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder={activeUserTab === 'STAFF' ? "Cari petugas / username..." : "Cari wali, no. HP, siswa, ID..."}
              value={tableSearchQuery}
              onChange={(e) => setTableSearchQuery(e.target.value)}
              className="w-full text-xs pl-8 pr-7 py-2 rounded-lg border border-border bg-surface text-content-primary focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
            />
            {tableSearchQuery && (
              <button
                type="button"
                onClick={() => setTableSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                title="Hapus pencarian"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-gray-50/75 text-[11px] font-semibold text-content-secondary uppercase tracking-wider">
                  <th className="py-3 px-4">{activeUserTab === 'STAFF' ? 'Nama & Username' : 'Orang Tua & Siswa'}</th>
                  <th className="py-3 px-4 hidden sm:table-cell">{activeUserTab === 'STAFF' ? 'Peran' : 'No. HP Login'}</th>
                  <th className="py-3 px-4 hidden md:table-cell">{activeUserTab === 'STAFF' ? 'Komputer' : 'Siswa Terhubung'}</th>
                  <th className="py-3 px-4 hidden sm:table-cell">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-xs">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-content-secondary">
                      {tableSearchQuery ? (
                        <div className="space-y-1">
                          <p className="font-semibold text-slate-700">Tidak ada akun yang cocok dengan "{tableSearchQuery}"</p>
                          <p className="text-[11px] text-slate-400">Coba gunakan kata kunci pencarian nama, ID, atau no. HP yang lain.</p>
                        </div>
                      ) : activeUserTab === 'STAFF' ? (
                        'Belum ada akun admin/operator terdaftar.'
                      ) : (
                        'Belum ada akun orang tua. Klik tombol "Tambah Akun Orang Tua" di atas untuk membuat akun baru.'
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => {
                    // Cari seluruh anak yang terhubung ke akun orang tua ini
                    const userPhoneClean = normalizePhoneNumber(user.phone || user.username || '');
                    const explicitIds = new Set<string>();
                    if (user.studentId) explicitIds.add(user.studentId);
                    if (Array.isArray(user.studentIds)) {
                      user.studentIds.forEach((id) => explicitIds.add(id));
                    }

                    const linkedStudents = students.filter((s) => {
                      if (explicitIds.has(s.id)) return true;
                      if (userPhoneClean && s.whatsappNumber && normalizePhoneNumber(s.whatsappNumber) === userPhoneClean) {
                        return true;
                      }
                      return false;
                    });

                    const primaryStudent =
                      linkedStudents[0] || (user.studentId ? students.find((s) => s.id === user.studentId) : null);
                    const isMultiChild = linkedStudents.length > 1;

                    return (
                      <tr key={user.userId} className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full font-bold flex items-center justify-center shrink-0 text-sm ${
                              user.role === 'SUPER_ADMIN' 
                                ? 'bg-purple-100 text-purple-700' 
                                : user.role === 'PARENT'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-primary-100 text-primary-700'
                            }`}>
                              {user.fullName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-content-primary">{user.fullName}</p>
                              <p className="text-content-secondary text-[11px]">@{user.username}</p>
                              {user.role === 'PARENT' && (
                                linkedStudents.length > 0 ? (
                                  <p className="text-[10px] text-emerald-700 font-semibold mt-0.5 flex items-center gap-1">
                                    {isMultiChild ? (
                                      <>
                                        <Users className="w-3 h-3 text-emerald-600 shrink-0" />
                                        <span>{linkedStudents.length} Anak: {linkedStudents.map((s) => s.name.split(' ')[0]).join(', ')}</span>
                                      </>
                                    ) : (
                                      <>
                                        <GraduationCap className="w-3 h-3 text-emerald-600 shrink-0" />
                                        <span>Anak: {primaryStudent?.name || user.studentId} {primaryStudent?.className ? `(${primaryStudent.className})` : ''}</span>
                                      </>
                                    )}
                                  </p>
                                ) : (
                                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                                    ID: {user.studentId || '—'}
                                  </p>
                                )
                              )}
                              {/* Mobile: info peran/komputer */}
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
                          ) : user.role === 'PARENT' ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium text-[11px]">
                              <Phone className="w-3 h-3 text-emerald-600" />{user.phone || user.username}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 font-medium text-[11px]">
                              <Laptop className="w-3 h-3" />Operator PC
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 hidden md:table-cell">
                          {user.role === 'PARENT' ? (
                            linkedStudents.length > 0 ? (
                              <div className="space-y-1">
                                {isMultiChild ? (
                                  <>
                                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                                      <Users className="w-3 h-3 text-emerald-700" />
                                      <span>{linkedStudents.length} Bersaudara</span>
                                    </div>
                                    <div className="space-y-0.5 pl-0.5">
                                      {linkedStudents.map((s) => (
                                        <p key={s.id} className="text-slate-800 font-medium text-[11px] truncate max-w-[240px]">
                                          &bull; {s.name} <span className="text-slate-500 font-mono text-[10px]">({s.className})</span>
                                        </p>
                                      ))}
                                    </div>
                                  </>
                                ) : (
                                  <div className="space-y-0.5">
                                    <p className="text-slate-800 font-bold text-xs">{primaryStudent?.name || '—'}</p>
                                    <p className="text-[10px] text-slate-500 font-mono">
                                      ID: {primaryStudent?.id || user.studentId} {primaryStudent?.className ? `• Kelas ${primaryStudent?.className}` : ''}
                                    </p>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-600 font-medium text-xs font-mono">
                                ID: {user.studentId || '—'}
                              </span>
                            )
                          ) : user.assignedDeviceId === 'ALL' ? (
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
                  );
                })
              )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Modal: Tambah Akun (Staff atau Orang Tua) ── */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={activeUserTab === 'PARENT' ? 'Buat Akun Orang Tua Siswa' : 'Buat Akun Admin / Operator PC Baru'}
        description={
          activeUserTab === 'PARENT'
            ? 'Buat akun login orang tua yang terhubung langsung dengan data siswa untuk monitoring kehadiran.'
            : 'Buat akun admin atau operator yang ditugaskan khusus untuk komputer tertentu.'
        }
      >
        <form onSubmit={handleSaveUser} className="space-y-4" autoComplete="off">
          {addError && (
            <div className="p-2.5 bg-status-danger-bg text-status-danger rounded-button text-xs font-medium">
              {addError}
            </div>
          )}

          {activeUserTab === 'PARENT' ? (
            <>
              <Input
                label="Nama Lengkap Orang Tua / Wali"
                placeholder="Contoh: H. Ahmad Supardi (Ayah)"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
              <Input
                label="Nomor HP / WhatsApp (Username Login)"
                placeholder="Contoh: 081234567890"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setParentPhone(e.target.value); }}
                helperText="Nomor ini akan digunakan orang tua untuk login ke portal absensi."
                required
              />
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-content-primary">
                    Hubungkan dengan Siswa (Anak) <span className="text-status-danger">*</span>
                  </label>
                  {selectedStudentIds.length > 0 && (
                    <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                      {selectedStudentIds.length} Siswa Terpilih
                    </span>
                  )}
                </div>

                {/* Search box */}
                <div className="relative" data-student-search="true">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-content-secondary pointer-events-none">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                      </svg>
                    </span>
                    <input
                      type="text"
                      placeholder="Ketik nama, ID, atau kelas siswa untuk mencari &amp; memilih..."
                      value={studentSearchQuery}
                      onChange={(e) => {
                        setStudentSearchQuery(e.target.value);
                        setIsStudentDropdownOpen(true);
                      }}
                      onFocus={() => setIsStudentDropdownOpen(true)}
                      className="w-full text-xs pl-8 pr-8 py-2.5 rounded-lg border border-border bg-surface text-content-primary focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
                      autoComplete="off"
                    />
                    {/* Clear button */}
                    {studentSearchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setStudentSearchQuery('');
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-content-secondary hover:text-status-danger transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M18 6 6 18M6 6l12 12"/>
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Dropdown hasil pencarian */}
                  {isStudentDropdownOpen && (
                    <div className="absolute z-50 w-full mt-1 bg-surface border border-border rounded-xl shadow-xl max-h-56 overflow-y-auto">
                      {(() => {
                        const q = studentSearchQuery.toLowerCase().trim();
                        const filtered = q.length === 0
                          ? students.slice(0, 25)
                          : students.filter((s) =>
                              s.name.toLowerCase().includes(q) ||
                              s.id.toLowerCase().includes(q) ||
                              (s.className || '').toLowerCase().includes(q)
                            ).slice(0, 35);

                        if (filtered.length === 0) {
                          return (
                            <div className="p-4 text-center text-xs text-content-secondary">
                              <svg className="w-6 h-6 mx-auto mb-1 opacity-40" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm6 11-4.35-4.35"/>
                              </svg>
                              Tidak ada siswa dengan nama/ID"{studentSearchQuery}"
                            </div>
                          );
                        }

                        return filtered.map((s) => {
                          const isSelected = selectedStudentIds.includes(s.id);
                          const hasAccount = parentUsers.some(
                            (u) => u.studentId === s.id || (Array.isArray(u.studentIds) && u.studentIds.includes(s.id))
                          );
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedStudentIds((prev) => prev.filter((id) => id !== s.id));
                                } else {
                                  setSelectedStudentIds((prev) => [...prev, s.id]);
                                  // Otomatis isi Nama Orang Tua jika masih kosong
                                  if (!fullName.trim()) {
                                    setFullName(s.parentName || `Wali Murid ${s.name}`);
                                  }
                                  // Otomatis isi Nomor WhatsApp/Username jika masih kosong
                                  if (!username.trim() && s.whatsappNumber) {
                                    setUsername(s.whatsappNumber);
                                    setParentPhone(s.whatsappNumber);
                                  }
                                  // Otomatis isi password default jika kosong
                                  if (!password.trim()) {
                                    setPassword('wali123');
                                  }
                                }
                              }}
                              className={`w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors border-b border-border/40 last:border-0 cursor-pointer ${
                                isSelected ? 'bg-emerald-50/90 hover:bg-emerald-100/80' : 'hover:bg-slate-50'
                              }`}
                            >
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                                isSelected ? 'bg-emerald-600 text-white font-bold' : 'bg-slate-100 text-slate-600'
                              }`}>
                                {isSelected ? (
                                  <Check className="w-4 h-4" />
                                ) : (
                                  <Users className="w-3.5 h-3.5" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-xs font-semibold text-content-primary truncate">{s.name}</p>
                                  {isSelected && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-200 text-emerald-900 shrink-0">
                                      Terpilih
                                    </span>
                                  )}
                                  {hasAccount && !isSelected && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 shrink-0">
                                      Sudah ada akun
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-content-secondary">
                                  ID: {s.id} {s.className ? `• Kelas ${s.className}` : ''} {s.parentName ? `• Wali: ${s.parentName}` : ''}
                                </p>
                              </div>
                            </button>
                          );
                        });
                      })()}
                    </div>
                  )}
                </div>

                {/* Daftar Siswa yang Dipilih (Bisa > 1 Siswa) */}
                {selectedStudentIds.length > 0 ? (
                  <div className="space-y-1.5 mt-2 p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-xl">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[11px] font-bold text-emerald-900 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Siswa Terhubung ({selectedStudentIds.length} Anak):</span>
                      </span>
                      {selectedStudentIds.length > 1 && (
                        <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900">
                          Multi-Anak
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 max-h-36 overflow-y-auto pr-0.5">
                      {selectedStudentIds.map((id, idx) => {
                        const st = students.find((s) => s.id === id);
                        return (
                          <div
                            key={id}
                            className="flex items-center justify-between p-2 rounded-lg bg-white border border-emerald-200/80 shadow-2xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                                {idx + 1}
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-800 truncate">
                                  {st?.name || id}
                                </p>
                                <p className="text-[10px] text-slate-500 font-mono">
                                  ID: {id} {st?.className ? `• Kelas ${st.className}` : ''}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedStudentIds((prev) => prev.filter((x) => x !== id))}
                              className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                              title="Hapus siswa ini"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-emerald-800 px-1 pt-0.5">
                      💡 Ketik nama anak berikutnya di kotak pencarian di atas untuk menghubungkan saudara kandung lainnya.
                    </p>
                  </div>
                ) : (
                  <p className="text-[10px] text-content-secondary mt-0.5">
                    Ketik nama siswa, ID, atau kelas untuk mencari. Anda bisa memilih lebih dari 1 siswa jika orang tua memiliki banyak anak di madrasah.
                  </p>
                )}
              </div>
              <Input
                type="password"
                label="Kata Sandi (Password Login)"
                placeholder="Minimal 6 karakter"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                leftIcon={<KeyRound className="w-4 h-4" />}
                helperText="Berikan kata sandi ini kepada orang tua untuk login."
                required
              />
            </>
          ) : (
            <>
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
            </>
          )}

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)}>Batal</Button>
            <Button type="submit">
              {activeUserTab === 'PARENT' ? 'Simpan Akun Orang Tua' : 'Simpan Akun Petugas'}
            </Button>
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
