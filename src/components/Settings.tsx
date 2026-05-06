import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { User, Mail, Shield, Camera, Save, Loader2, LogOut, Smartphone } from 'lucide-react';

interface SettingsProps {
  user: any;
  profile: any;
  onProfileUpdate: () => void;
}

export function Settings({ user, profile, onProfileUpdate }: SettingsProps) {
  const [displayName, setDisplayName] = useState(profile?.full_name || user?.user_metadata?.display_name || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || user?.user_metadata?.avatar_url || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    try {
      const { error: authError } = await supabase.auth.updateUser({
        data: { 
          display_name: displayName,
          avatar_url: avatarUrl
        }
      });

      if (authError) throw authError;

      // Also update the profiles table
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ 
          full_name: displayName,
          avatar_url: avatarUrl 
        })
        .eq('id', user.id);

      if (profileError) {
        console.error('Error updating profiles table:', profileError);
        // We don't throw here because auth update succeeded, but we should log it
      }

      onProfileUpdate();
      setMessage({ type: 'success', text: 'Profil berhasil diperbarui!' });
    } catch (error: any) {
      console.error('Error updating profile:', error);
      setMessage({ type: 'error', text: error.message || 'Gagal memperbarui profil' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold text-white">Pengaturan Profil</h2>
        <p className="text-brand-text-muted">Kelola informasi akun dan preferensi Anda</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Profile Card */}
        <div className="lg:col-span-1">
          <div className="bg-brand-card border border-brand-border rounded-2xl p-6 text-center space-y-4">
            <div className="relative inline-block">
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-brand-accent mx-auto flex items-center justify-center overflow-hidden border-4 border-brand-dark shadow-xl">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <User className="w-12 h-12 md:w-16 md:h-16 text-white" />
                )}
              </div>
              <div className="absolute bottom-0 right-0 p-2 bg-brand-accent rounded-full border-2 border-brand-dark text-white cursor-pointer hover:scale-110 transition-transform">
                <Camera className="w-4 h-4 md:w-5 md:h-5" />
              </div>
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">{displayName || user?.email?.split('@')[0]}</h3>
              <p className="text-brand-text-muted text-sm">{user?.email}</p>
            </div>
            <div className="pt-4 border-t border-brand-border">
              <div className="flex items-center justify-center gap-2 text-brand-accent">
                <Shield className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  {user?.email === 'admin@hotelalia.com' ? 'Administrator' : 'Staff Gudang'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Edit Form */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-brand-card border border-brand-border rounded-2xl p-6 md:p-8">
            <form onSubmit={handleUpdateProfile} className="space-y-6">
              {message && (
                <div className={`p-4 rounded-xl text-sm font-medium ${
                  message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                  {message.text}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-brand-text-muted mb-2">Email Address (Read-only)</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-text-muted/50" />
                    <input 
                      type="email" 
                      value={user?.email} 
                      disabled 
                      className="w-full pl-12 pr-4 py-3 bg-brand-dark/50 border border-brand-border rounded-xl text-brand-text-muted cursor-not-allowed"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-brand-text-muted mb-2">Nama Tampilan</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-accent" />
                    <input 
                      type="text" 
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Masukkan nama lengkap Anda"
                      className="w-full pl-12 pr-4 py-3 bg-brand-dark border border-brand-border rounded-xl text-white focus:ring-2 focus:ring-brand-accent focus:border-transparent outline-none transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-brand-text-muted mb-2">URL Foto Profil</label>
                  <div className="relative">
                    <Camera className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-accent" />
                    <input 
                      type="text" 
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="https://example.com/photo.jpg"
                      className="w-full pl-12 pr-4 py-3 bg-brand-dark border border-brand-border rounded-xl text-white focus:ring-2 focus:ring-brand-accent focus:border-transparent outline-none transition-all"
                    />
                  </div>
                  <p className="mt-2 text-xs text-brand-text-muted">Gunakan URL gambar publik (misal: dari Imgur atau Google Photos)</p>
                </div>
              </div>

              <div className="pt-4">
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="w-full md:w-auto bg-brand-accent hover:bg-blue-600 px-8 py-3 rounded-xl font-bold text-white transition-all shadow-lg shadow-brand-accent/20 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      <span>Simpan Perubahan</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          <div className="bg-brand-card border border-brand-border rounded-2xl p-6 md:p-8">
            <h4 className="text-lg font-bold text-white mb-4">Aplikasi</h4>
            <p className="text-brand-text-muted text-sm mb-6">Pasang aplikasi di layar utama untuk akses lebih cepat.</p>
            <button 
              onClick={() => {
                console.log('Install button clicked, deferredPrompt:', (window as any).deferredPrompt);
                (window as any).deferredPrompt?.prompt();
              }}
              className="flex items-center gap-2 bg-brand-accent/10 text-brand-accent hover:bg-brand-accent hover:text-white px-4 py-2 rounded-xl font-bold transition-all"
            >
              <Smartphone className="w-5 h-5" />
              <span>Pasang Aplikasi</span>
            </button>
          </div>

          <div className="bg-brand-card border border-brand-border rounded-2xl p-6 md:p-8">
            <h4 className="text-lg font-bold text-white mb-4">Keamanan Akun</h4>
            <p className="text-brand-text-muted text-sm mb-6">Untuk mengubah kata sandi, silakan hubungi administrator sistem atau gunakan fitur reset password di halaman login.</p>
            <div className="pt-4 border-t border-brand-border">
              <button 
                onClick={handleLogout}
                className="flex items-center gap-2 text-red-400 hover:text-red-300 font-semibold transition-colors"
              >
                <LogOut className="w-5 h-5" />
                <span>Keluar dari Akun</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
