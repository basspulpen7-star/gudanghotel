import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { supabase, supabaseUrl, supabaseKey } from '../lib/supabase';
import { UserProfile } from '../types';
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
  Sparkles
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
  const [role, setRole] = useState<'admin' | 'staff'>('staff');
  const [password, setPassword] = useState(''); // For new users
  const [showPassword, setShowPassword] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name');
      
      if (error) {
        if (error.message.includes('does not exist')) {
          throw new Error('Tabel "profiles" belum ada. Silakan buka menu "Database Setup" untuk membuat tabel.');
        }
        throw error;
      }
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

        // 1. Create user in Supabase Auth using a temporary un-persisted client
        // This ensures the current admin user is NOT logged out
        if (supabaseUrl && supabaseKey) {
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
            console.warn('Auth signup error:', authError);
            if (authError.message.toLowerCase().includes('already registered')) {
              throw new Error(`Email "${email}" sudah terdaftar di sistem. Gunakan email lain.`);
            }
            throw new Error(`Gagal mendaftarkan akun di Auth: ${authError.message}`);
          }

          if (authData.user) {
            newUserId = authData.user.id;
          }
        }

        // 2. Insert or Upsert into profiles table
        if (newUserId) {
          const { error: profileError } = await supabase
            .from('profiles')
            .upsert({
              id: newUserId,
              full_name: fullName.trim(),
              username: username.trim(),
              email: email.trim().toLowerCase(),
              role,
              created_at: new Date().toISOString()
            }, { onConflict: 'id' });

          if (profileError) {
            console.error('Profile upsert error:', profileError);
            if (profileError.message.includes('profiles_id_fkey')) {
              throw new Error('Gagal menyimpan profil karena ID belum terdaftar di tabel auth.users. Pastikan user terdaftar di Supabase Auth.');
            }
            throw profileError;
          }
        } else {
          // Fallback if auth is not connected or standalone
          const fallbackId = crypto.randomUUID();
          const { error: fallbackError } = await supabase
            .from('profiles')
            .insert([{
              id: fallbackId,
              full_name: fullName.trim(),
              username: username.trim(),
              email: email.trim().toLowerCase(),
              role,
              created_at: new Date().toISOString()
            }]);

          if (fallbackError) {
            if (fallbackError.message.includes('profiles_id_fkey')) {
              throw new Error('Database mewajibkan User terdaftar di Supabase Auth. Silakan masukkan password untuk membuat akun Auth bersamaan.');
            }
            throw fallbackError;
          }
        }

        setNotification({ type: 'success', message: `User "${fullName}" berhasil didaftarkan dan siap login!` });
      }

      setIsModalOpen(false);
      resetForm();
      fetchProfiles();
    } catch (error: any) {
      console.error('Error saving profile:', error);
      setNotification({ type: 'error', message: 'Gagal menyimpan user: ' + error.message });
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
    setShowPassword(false);
    setEditingProfile(null);
  };

  const handleEdit = (profile: UserProfile) => {
    setEditingProfile(profile);
    setFullName(profile.full_name || '');
    setUsername(profile.username || '');
    setEmail(profile.email || '');
    setRole(profile.role || 'staff');
    setPassword('');
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Apakah Anda yakin ingin menghapus profil user ini?')) {
      try {
        const { error } = await supabase.from('profiles').delete().eq('id', id);
        if (error) throw error;
        setNotification({ type: 'success', message: 'User berhasil dihapus dari daftar.' });
        fetchProfiles();
      } catch (error: any) {
        setNotification({ type: 'error', message: 'Gagal menghapus user: ' + error.message });
      }
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 p-4 md:p-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-white">Manajemen User</h2>
          <p className="text-brand-text-muted">Kelola administrator dan staff gudang</p>
        </div>
        <button 
          onClick={() => { resetForm(); setIsModalOpen(true); }}
          className="w-full md:w-auto bg-brand-accent hover:bg-blue-600 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-brand-accent/20"
        >
          <UserPlus className="w-5 h-5" />
          Daftarkan User Baru
        </button>
      </div>

      {notification && (
        <div className={`p-4 rounded-xl flex items-center gap-3 text-sm font-medium ${
          notification.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-green-400" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-400" />
          )}
          <span className="flex-grow">{notification.message}</span>
          <button onClick={() => setNotification(null)} className="text-xs opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full text-center py-12 text-brand-text-muted flex items-center justify-center gap-2">
            <Activity className="w-5 h-5 animate-spin text-brand-accent" />
            <span>Memuat data user...</span>
          </div>
        ) : profiles.length === 0 ? (
          <div className="col-span-full text-center py-12 text-brand-text-muted">Belum ada data user.</div>
        ) : profiles.map((profile) => (
          <div key={profile.id} className="bg-brand-card p-6 rounded-2xl border border-brand-border hover:border-brand-accent transition-all group relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => handleEdit(profile)} title="Edit User" className="p-2 hover:bg-brand-accent/20 text-brand-accent rounded-lg">
                <Edit2 className="w-4 h-4" />
              </button>
              <button onClick={() => handleDelete(profile.id)} title="Hapus User" className="p-2 hover:bg-red-500/20 text-red-500 rounded-lg">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-brand-accent flex items-center justify-center text-white shadow-lg shadow-brand-accent/20 flex-shrink-0">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.full_name} className="w-full h-full object-cover rounded-2xl" />
                ) : (
                  <UserIcon className="w-8 h-8" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold text-white truncate">{profile.full_name || 'Tanpa Nama'}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${profile.role === 'admin' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
                    {profile.role || 'staff'}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm text-brand-text-muted">
                <Mail className="w-4 h-4 flex-shrink-0 text-brand-accent/70" />
                <span className="truncate">{profile.email || '-'}</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-brand-text-muted">
                <Shield className="w-4 h-4 flex-shrink-0 text-brand-accent/70" />
                <span className="truncate">Username: {profile.username || '-'}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal User */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center z-[100] p-4 overflow-y-auto">
          <div className="bg-brand-card w-full max-w-md rounded-2xl border border-brand-border shadow-2xl animate-in zoom-in duration-200 overflow-hidden flex flex-col mt-4 sm:mt-0 max-h-[90vh]">
            <div className="p-6 border-b border-brand-border flex justify-between items-center bg-brand-dark/30">
              <h3 className="text-xl font-bold text-white">{editingProfile ? 'Edit User' : 'Daftarkan User Baru'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-brand-text-muted hover:text-white p-2">✕</button>
            </div>
            
            <form id="user-form" onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-grow">
              <div>
                <label className="block text-sm font-medium text-brand-text-muted mb-1">Nama Lengkap</label>
                <input 
                  type="text" 
                  value={fullName} 
                  onChange={(e) => setFullName(e.target.value)} 
                  placeholder="Contoh: Budi Santoso"
                  className="w-full" 
                  required 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-text-muted mb-1">Username</label>
                <input 
                  type="text" 
                  value={username} 
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))} 
                  placeholder="Contoh: budi_gudang"
                  className="w-full" 
                  required 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-text-muted mb-1">Email</label>
                <input 
                  type="email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  placeholder="Contoh: budi@hotelalia.com"
                  className="w-full" 
                  required 
                />
              </div>

              {!editingProfile && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-brand-text-muted">Password Akun Baru</label>
                    <button 
                      type="button" 
                      onClick={generateRandomPassword}
                      className="text-xs text-brand-accent hover:underline flex items-center gap-1"
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
                      className="w-full pr-10" 
                      required 
                      minLength={6}
                    />
                    <button 
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-muted hover:text-white"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-brand-text-muted mt-1">Password ini digunakan staf untuk login langsung ke aplikasi.</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-brand-text-muted mb-1">Role / Peran</label>
                <select value={role} onChange={(e) => setRole(e.target.value as any)} className="w-full">
                  <option value="staff">Staff Gudang</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
            </form>

            <div className="p-6 border-t border-brand-border bg-brand-dark/30 flex flex-col sm:flex-row gap-3">
              <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-brand-dark border border-brand-border py-3 rounded-xl font-bold text-brand-text-muted hover:text-white transition-all">Batal</button>
              <button 
                type="submit" 
                form="user-form"
                disabled={isSubmitting}
                className="flex-1 bg-brand-accent hover:bg-blue-600 py-3 rounded-xl font-bold text-white transition-all shadow-lg shadow-brand-accent/20 disabled:opacity-50 flex items-center justify-center gap-2"
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
    </div>
  );
}
