import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { supabase, supabaseUrl, supabaseKey } from '../lib/supabase';
import { UserProfile } from '../types';
import { queryCache } from '../lib/queryCache';
import { 
  Plus, 
  Search, 
  UserPlus, 
  Shield, 
  Trash2, 
  Edit2, 
  UserCheck, 
  UserX,
  Mail,
  User as UserIcon,
  Activity,
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Terminal,
  Copy,
  Check,
  UtensilsCrossed
} from 'lucide-react';

export function UserManagement() {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingProfile, setEditingProfile] = useState<UserProfile | null>(null);

  // Form state
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'staff' | 'hk' | 'logistik' | 'resto'>('staff');
  const [password, setPassword] = useState(''); // For new users
  const [showPassword, setShowPassword] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string; isFkError?: boolean } | null>(null);
  const [showSqlFixModal, setShowSqlFixModal] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  const fixSqlScript = `-- Jalankan perintah ini di Supabase SQL Editor untuk memperbaiki Foreign Key tabel Profiles:
ALTER TABLE IF EXISTS profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE IF EXISTS profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'staff';
ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;`;

  const copySqlFix = () => {
    navigator.clipboard.writeText(fixSqlScript);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async (forceRefresh = false) => {
    setLoading(true);
    try {
      const data = await queryCache.fetchWithCache<UserProfile[]>(
        'profiles:all',
        async () => {
          const { data: res, error } = await supabase
            .from('profiles')
            .select('id, full_name, username, email, role, avatar_url, created_at')
            .order('full_name');
          
          if (error) {
            if (error.message.includes('does not exist')) {
              throw new Error('Tabel "profiles" belum ada. Silakan buka menu "Database Setup" untuk membuat tabel.');
            }
            throw error;
          }
          return res || [];
        },
        60000,
        forceRefresh
      );
      setProfiles(data || []);
    } catch (error: any) {
      console.error('Error fetching profiles:', error);
      setNotification({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
    let pass = '';
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(pass);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setNotification(null);

    try {
      if (editingProfile) {
        // UPDATE EXISTING USER PROFILE
        const { error } = await supabase
          .from('profiles')
          .update({
            full_name: fullName.trim(),
            username: username.trim(),
            email: email.trim().toLowerCase(),
            role
          })
          .eq('id', editingProfile.id);
        
        if (error) throw error;
        setNotification({ type: 'success', message: 'Data user berhasil diperbarui.' });
      } else {
        // CREATE NEW USER
        if (!password || password.length < 6) {
          throw new Error('Password wajib diisi minimal 6 karakter untuk akun baru.');
        }

        let newUserId: string | null = null;
        let authRegistered = false;

        // 1. Create user in Supabase Auth using a temporary un-persisted client
        if (supabaseUrl && supabaseKey) {
          try {
            const tempClient = createClient(supabaseUrl, supabaseKey, {
              auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false
              }
            });

            const { data: authData, error: authError } = await tempClient.auth.signUp({
              email: email.trim().toLowerCase(),
              password: password,
              options: {
                data: {
                  full_name: fullName.trim(),
                  username: username.trim(),
                  role: role
                }
              }
            });

            if (authError) {
              console.warn('[AUTH REGISTER NOTE]:', authError.message);
            } else if (authData.user) {
              newUserId = authData.user.id;
              authRegistered = true;
            }
          } catch (authErr) {
            console.warn('[AUTH REGISTER EXCEPTION]:', authErr);
          }
        }

        // 2. Insert into profiles table
        const profilePayload: any = {
          full_name: fullName.trim(),
          username: username.trim(),
          email: email.trim().toLowerCase(),
          role: role
        };

        if (newUserId) {
          profilePayload.id = newUserId;
        }

        const { error: profileError } = await supabase
          .from('profiles')
          .insert([profilePayload]);

        if (profileError) {
          if (profileError.message.includes('foreign key') || profileError.message.includes('fkey')) {
            setNotification({ 
              type: 'error', 
              message: 'Tabel profiles memiliki kunci relasi Foreign Key yang mengunci ID.',
              isFkError: true 
            });
            return;
          }
          throw profileError;
        }

        setNotification({ 
          type: 'success', 
          message: `Akun ${fullName} (${username}) berhasil didaftarkan sebagai ${role.toUpperCase()}!` 
        });
      }

      setIsModalOpen(false);
      resetForm();
      queryCache.invalidate('profiles');
      fetchProfiles(true);
    } catch (error: any) {
      console.error('Error saving user:', error);
      setNotification({ type: 'error', message: error.message || 'Gagal menyimpan user.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFullName('');
    setUsername('');
    setEmail('');
    setRole('staff');
    setPassword('');
    setEditingProfile(null);
  };

  const handleQuickPresetResto = () => {
    resetForm();
    setFullName('Staff Restoran Alia');
    setUsername('resto');
    setEmail('resto@hotelalia.com');
    setRole('resto');
    setPassword('resto123');
    setIsModalOpen(true);
  };

  const handleEdit = (profile: UserProfile) => {
    setEditingProfile(profile);
    setFullName(profile.full_name || '');
    setUsername(profile.username || '');
    setEmail(profile.email || '');
    setRole(profile.role as any || 'staff');
    setPassword('');
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Apakah Anda yakin ingin menghapus profil user ini?')) {
      try {
        const { error } = await supabase.from('profiles').delete().eq('id', id);
        if (error) throw error;
        setNotification({ type: 'success', message: 'User berhasil dihapus dari daftar.' });
        queryCache.invalidate('profiles');
        fetchProfiles(true);
      } catch (error: any) {
        setNotification({ type: 'error', message: 'Gagal menghapus user: ' + error.message });
      }
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-20 md:pb-6 font-sans">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#252B34] p-4 md:p-6 rounded-2xl border border-[#343B46] shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-[#F1F3F5] tracking-tight">Manajemen Pengguna</h2>
          <p className="text-xs md:text-sm text-[#8E99A6] mt-0.5 font-medium">Pendaftaran akun hanya dilakukan oleh Administrator (Admin, Staff Gudang, Logistik, HK, Resto)</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto">
          <button 
            onClick={handleQuickPresetResto}
            className="bg-[#20252D] hover:bg-[#2A303A] text-[#E0B85A] border border-[#C89B3C]/40 px-4 py-2.5 rounded-xl font-extrabold flex items-center justify-center gap-2 transition-all text-xs min-h-[44px] cursor-pointer"
          >
            <UtensilsCrossed className="w-4 h-4 text-[#E0B85A]" />
            <span>+ Akun Resto Cepat</span>
          </button>
          <button 
            onClick={() => { resetForm(); setIsModalOpen(true); }}
            className="bg-gradient-to-r from-[#E6B85C] to-[#C89B3C] hover:brightness-110 text-[#171A1F] px-5 py-2.5 rounded-xl font-extrabold flex items-center justify-center gap-2 transition-all shadow-sm text-xs min-h-[44px] cursor-pointer"
          >
            <UserPlus className="w-4 h-4 stroke-[2.5]" />
            <span>Daftar Pengguna Baru</span>
          </button>
        </div>
      </div>

      {notification && (
        <div className={`p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-bold border shadow-xs ${
          notification.type === 'success' ? 'bg-[#55B685]/15 text-[#55B685] border-[#55B685]/30' : 'bg-[#EB5757]/15 text-[#F87171] border-[#EB5757]/30'
        }`}>
          <div className="flex items-start sm:items-center gap-3">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-[#55B685] mt-0.5 sm:mt-0" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-[#EB5757] mt-0.5 sm:mt-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {notification.isFkError && (
              <button
                onClick={() => setShowSqlFixModal(true)}
                className="px-3 py-1.5 bg-[#EB5757]/20 hover:bg-[#EB5757]/30 text-[#F87171] rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Terminal className="w-3.5 h-3.5" />
                Lihat Solusi SQL
              </button>
            )}
            <button onClick={() => setNotification(null)} className="text-xs opacity-70 hover:opacity-100 p-1 cursor-pointer">✕</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {loading ? (
          <div className="col-span-full text-center py-12 text-[#8E99A6] flex items-center justify-center gap-2 font-medium">
            <Activity className="w-5 h-5 animate-spin text-[#E0B85A]" />
            <span>Memuat data pengguna...</span>
          </div>
        ) : profiles.length === 0 ? (
          <div className="col-span-full text-center py-12 bg-[#252B34] rounded-2xl border border-[#343B46] text-[#8E99A6] font-medium">Belum ada data user.</div>
        ) : profiles.map((profile) => (
          <div key={profile.id} className="bg-[#252B34] p-5 rounded-2xl border border-[#343B46] hover:border-[#C89B3C]/50 transition-all group relative shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
            <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => handleEdit(profile)} title="Edit User" className="p-1.5 hover:bg-[#20252D] text-[#E0B85A] rounded-lg cursor-pointer">
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => handleDelete(profile.id)} title="Hapus User" className="p-1.5 hover:bg-[#EB5757]/20 text-[#EB5757] rounded-lg cursor-pointer">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-3.5 mb-4">
              <div className="w-12 h-12 rounded-xl bg-[#20252D] border border-[#3A424D] flex items-center justify-center text-[#E0B85A] shadow-xs flex-shrink-0">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.full_name} className="w-full h-full object-cover rounded-xl" />
                ) : (
                  <UserIcon className="w-6 h-6" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-black text-[#F1F3F5] truncate">{profile.full_name || 'Tanpa Nama'}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${
                    profile.role === 'admin' 
                      ? 'bg-purple-500/15 text-purple-400 border-purple-500/30' 
                      : profile.role === 'hk'
                      ? 'bg-[#C89B3C]/15 text-[#E0B85A] border-[#C89B3C]/30'
                      : profile.role === 'resto'
                      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                      : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                  }`}>
                    {profile.role === 'hk' ? 'Housekeeping' : profile.role === 'resto' ? 'Restoran' : profile.role || 'staff'}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-[#343B46] text-xs">
              <div className="flex items-center gap-2.5 text-[#8E99A6] font-medium">
                <Mail className="w-3.5 h-3.5 flex-shrink-0 text-[#E0B85A]" />
                <span className="truncate">{profile.email || '-'}</span>
              </div>
              <div className="flex items-center gap-2.5 text-[#8E99A6] font-medium">
                <Shield className="w-3.5 h-3.5 flex-shrink-0 text-[#E0B85A]" />
                <span className="truncate">Username: <strong className="text-[#F1F3F5]">{profile.username || '-'}</strong></span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal User */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-[100] p-4 overflow-y-auto">
          <div className="bg-[#252B34] w-full max-w-md rounded-2xl border border-[#343B46] shadow-2xl animate-in zoom-in duration-200 overflow-hidden flex flex-col my-auto max-h-[90vh]">
            <div className="p-5 border-b border-[#343B46] flex justify-between items-center bg-[#20252D]">
              <h3 className="text-base font-black text-[#F1F3F5]">{editingProfile ? 'Edit Pengguna' : 'Daftar Pengguna Baru'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-[#8E99A6] hover:text-[#F1F3F5] p-1.5 rounded-lg cursor-pointer">✕</button>
            </div>
            
            <form id="user-form" onSubmit={handleSubmit} className="p-5 space-y-3.5 overflow-y-auto flex-grow text-xs">
              <div>
                <label className="block font-bold text-[#D8DEE6] uppercase mb-1">Nama Lengkap</label>
                <input 
                  type="text" 
                  value={fullName} 
                  onChange={(e) => setFullName(e.target.value)} 
                  placeholder="Contoh: Budi Santoso"
                  className="w-full bg-[#20252D] border border-[#3A424D] rounded-xl px-3.5 py-2.5 text-[#F1F3F5] text-xs font-semibold focus:outline-none focus:border-[#C89B3C]" 
                  required 
                />
              </div>
              <div>
                <label className="block font-bold text-[#D8DEE6] uppercase mb-1">Username</label>
                <input 
                  type="text" 
                  value={username} 
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))} 
                  placeholder="Contoh: budi_gudang"
                  className="w-full bg-[#20252D] border border-[#3A424D] rounded-xl px-3.5 py-2.5 text-[#F1F3F5] text-xs font-semibold focus:outline-none focus:border-[#C89B3C]" 
                  required 
                />
              </div>
              <div>
                <label className="block font-bold text-[#D8DEE6] uppercase mb-1">Email</label>
                <input 
                  type="email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  placeholder="Contoh: budi@hotelalia.com"
                  className="w-full bg-[#20252D] border border-[#3A424D] rounded-xl px-3.5 py-2.5 text-[#F1F3F5] text-xs font-semibold focus:outline-none focus:border-[#C89B3C]" 
                  required 
                />
              </div>

              {!editingProfile && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-[#D8DEE6] uppercase">Password Akun Baru</label>
                    <button 
                      type="button" 
                      onClick={generateRandomPassword}
                      className="text-[11px] text-[#E0B85A] hover:text-[#C89B3C] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" /> Acak Password
                    </button>
                  </div>
                  <div className="relative">
                    <input 
                      type={showPassword ? 'text' : 'password'} 
                      value={password} 
                      onChange={(e) => setPassword(e.target.value)} 
                      placeholder="Minimal 6 karakter"
                      className="w-full bg-[#20252D] border border-[#3A424D] rounded-xl px-3.5 py-2.5 pr-10 text-[#F1F3F5] text-xs font-semibold focus:outline-none focus:border-[#C89B3C]" 
                      required 
                      minLength={6}
                    />
                    <button 
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8E99A6] hover:text-[#F1F3F5] cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-[#8E99A6] mt-1">Password ini digunakan staf untuk login langsung ke aplikasi.</p>
                </div>
              )}

              <div>
                <label className="block font-bold text-[#D8DEE6] uppercase mb-1">Role / Peran</label>
                <select 
                  value={role} 
                  onChange={(e) => setRole(e.target.value as any)} 
                  className="w-full bg-[#20252D] border border-[#3A424D] rounded-xl px-3.5 py-2.5 text-[#F1F3F5] text-xs font-semibold focus:outline-none focus:border-[#C89B3C]"
                >
                  <option value="staff">Staff Gudang</option>
                  <option value="logistik">Logistik</option>
                  <option value="hk">Housekeeping (HK)</option>
                  <option value="resto">Restoran (Resto)</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
            </form>

            <div className="p-4 border-t border-[#343B46] bg-[#20252D] flex flex-col sm:flex-row gap-2.5">
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)} 
                className="flex-1 bg-[#252B34] border border-[#3A424D] hover:bg-[#2A303A] py-2.5 rounded-xl font-bold text-[#D8DEE6] text-xs transition-all min-h-[40px] cursor-pointer"
              >
                Batal
              </button>
              <button 
                type="submit" 
                form="user-form"
                disabled={isSubmitting}
                className="flex-1 bg-gradient-to-r from-[#E6B85C] to-[#C89B3C] hover:brightness-110 py-2.5 rounded-xl font-extrabold text-[#171A1F] text-xs transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 min-h-[40px] cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Activity className="w-4 h-4 animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (editingProfile ? 'Simpan Perubahan' : 'Daftarkan User')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Perbaikan Foreign Key Database */}
      {showSqlFixModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-[110] p-4">
          <div className="bg-[#252B34] w-full max-w-lg rounded-2xl border border-[#343B46] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in duration-200">
            <div className="p-5 border-b border-[#343B46] bg-[#20252D] flex justify-between items-center">
              <div className="flex items-center gap-2.5 text-[#F87171] font-black text-sm">
                <Terminal className="w-4 h-4" />
                <span>Perbaiki Relasi Foreign Key Database</span>
              </div>
              <button onClick={() => setShowSqlFixModal(false)} className="text-[#8E99A6] hover:text-[#F1F3F5] p-1 cursor-pointer">✕</button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <p className="text-[#D8DEE6] leading-relaxed">
                Tabel <code className="text-[#E0B85A] bg-[#20252D] px-1.5 py-0.5 rounded border border-[#3A424D]">profiles</code> Anda saat ini masih mengunci ID ke <code className="text-[#E0B85A] bg-[#20252D] px-1.5 py-0.5 rounded border border-[#3A424D]">auth.users</code>. Untuk mengizinkan manajemen staf & user langsung dari aplikasi tanpa error:
              </p>

              <ol className="list-decimal list-inside space-y-1 text-xs text-[#8E99A6] bg-[#20252D] p-3 rounded-xl border border-[#3A424D]">
                <li>Buka dashboard <strong>Supabase &gt; SQL Editor</strong>.</li>
                <li>Salin perintah SQL di bawah ini dan paste ke SQL Editor.</li>
                <li>Klik tombol <strong>Run</strong> di Supabase.</li>
              </ol>

              <div className="relative">
                <pre className="bg-[#171A1F] text-[#55B685] p-4 rounded-xl text-xs font-mono overflow-x-auto border border-[#343B46] max-h-48">
                  {fixSqlScript}
                </pre>
                <button
                  onClick={copySqlFix}
                  className="absolute top-2.5 right-2.5 bg-gradient-to-r from-[#E6B85C] to-[#C89B3C] text-[#171A1F] px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                >
                  {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedSql ? 'Tersalin!' : 'Salin SQL'}
                </button>
              </div>
            </div>
            <div className="p-4 border-t border-[#343B46] bg-[#20252D] flex justify-end gap-3">
              <button
                onClick={() => setShowSqlFixModal(false)}
                className="bg-gradient-to-r from-[#E6B85C] to-[#C89B3C] text-[#171A1F] px-5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer"
              >
                Saya Mengerti / Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
