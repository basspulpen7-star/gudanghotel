import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { User, Mail, Shield, Camera, Save, Loader2, LogOut, Smartphone, Download, Database, RefreshCw, HardDrive, CheckCircle2, AlertCircle } from 'lucide-react';
import { backupService } from '../services/backupService';
import { queryCache } from '../lib/queryCache';

interface SettingsProps {
  user: any;
  profile: any;
  onProfileUpdate: () => void;
}

export function Settings({ user, profile, onProfileUpdate }: SettingsProps) {
  const { signOut, role, isAdmin } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.full_name || user?.user_metadata?.display_name || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || user?.user_metadata?.avatar_url || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Backup & Cache states
  const [exportingJson, setExportingJson] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [backupNotice, setBackupNotice] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [cacheStats, setCacheStats] = useState(queryCache.getStats());
  const [cacheCleared, setCacheCleared] = useState(false);

  const handleLogout = async () => {
    await signOut();
  };

  const handleExportJson = async () => {
    setExportingJson(true);
    setBackupNotice(null);
    try {
      await backupService.exportFullBackupJson();
      setBackupNotice({ type: 'success', text: 'Full Backup JSON berhasil diunduh!' });
    } catch (err: any) {
      setBackupNotice({ type: 'error', text: err.message || 'Gagal membuat backup JSON' });
    } finally {
      setExportingJson(false);
    }
  };

  const handleExportCsv = async () => {
    setExportingCsv(true);
    setBackupNotice(null);
    try {
      await backupService.exportItemsCsv();
      setBackupNotice({ type: 'success', text: 'Data Stok CSV berhasil diekspor!' });
    } catch (err: any) {
      setBackupNotice({ type: 'error', text: err.message || 'Gagal mengekspor data CSV' });
    } finally {
      setExportingCsv(false);
    }
  };

  const handleClearCache = () => {
    queryCache.invalidate();
    setCacheStats(queryCache.getStats());
    setCacheCleared(true);
    setTimeout(() => setCacheCleared(false), 3000);
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
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300 pb-20 md:pb-6 font-sans">
      <div className="bg-white p-4 md:p-6 rounded-2xl border border-gray-200/90 shadow-sm">
        <h2 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">Pengaturan Profil</h2>
        <p className="text-xs md:text-sm text-gray-500 mt-0.5 font-medium">Kelola informasi akun dan preferensi Anda</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-gray-200/90 rounded-2xl p-6 text-center space-y-4 shadow-sm">
            <div className="relative inline-block">
              <div className="w-24 h-24 md:w-28 md:h-28 rounded-full bg-amber-500 mx-auto flex items-center justify-center overflow-hidden border-4 border-white shadow-md">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <User className="w-12 h-12 md:w-14 md:h-14 text-white" />
                )}
              </div>
              <div className="absolute bottom-0 right-0 p-2 bg-[#E65C00] rounded-full border-2 border-white text-white cursor-pointer hover:scale-105 transition-transform shadow-sm">
                <Camera className="w-3.5 h-3.5 md:w-4 md:h-4" />
              </div>
            </div>
            <div>
              <h3 className="text-lg font-black text-gray-900">{displayName || user?.email?.split('@')[0]}</h3>
              <p className="text-gray-500 text-xs mt-0.5">{user?.email}</p>
            </div>
            <div className="pt-4 border-t border-gray-100">
              <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1 bg-amber-500/10 text-amber-700 rounded-lg text-xs font-bold border border-amber-500/20">
                <Shield className="w-3.5 h-3.5 text-amber-600" />
                <span className="uppercase tracking-wider">
                  {role === 'admin' ? 'Administrator' : role === 'hk' ? 'Staff Housekeeping' : 'Staff Gudang'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Edit Form */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white border border-gray-200/90 rounded-2xl p-5 md:p-7 shadow-sm">
            <form onSubmit={handleUpdateProfile} className="space-y-5">
              {message && (
                <div className={`p-3.5 rounded-xl text-xs font-bold ${
                  message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {message.text}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Email Address (Read-only)</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                      type="email" 
                      value={user?.email} 
                      disabled 
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-500 text-xs font-semibold cursor-not-allowed"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Nama Tampilan</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-600" />
                    <input 
                      type="text" 
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Masukkan nama lengkap Anda"
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-xs font-semibold focus:outline-none focus:border-amber-500 focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">URL Foto Profil</label>
                  <div className="relative">
                    <Camera className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-600" />
                    <input 
                      type="text" 
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="https://example.com/photo.jpg"
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-xs font-semibold focus:outline-none focus:border-amber-500 focus:bg-white transition-all"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-gray-400">Gunakan URL gambar publik (misal: dari Imgur atau hosting foto)</p>
                </div>
              </div>

              <div className="pt-2">
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="w-full md:w-auto bg-[#E65C00] hover:bg-[#CF5300] px-6 py-2.5 rounded-xl font-extrabold text-xs text-white transition-all shadow-sm shadow-orange-500/20 flex items-center justify-center gap-2 disabled:opacity-50 min-h-[44px]"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 stroke-[3]" />
                      <span>Simpan Perubahan</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Backup & Disaster Recovery Center */}
          <div className="bg-white border border-gray-200/90 rounded-2xl p-5 md:p-6 shadow-sm space-y-4">
            <div>
              <h4 className="text-sm font-black text-gray-900 mb-0.5 flex items-center gap-2">
                <Database className="w-4 h-4 text-[#E65C00]" />
                Pusat Backup & Disaster Recovery
              </h4>
              <p className="text-gray-500 text-xs">
                Unduh salinan data lengkap database secara lokal untuk memastikan data aman tanpa biaya tambahan pada Supabase Free Tier.
              </p>
            </div>

            {backupNotice && (
              <div className={`p-3.5 rounded-xl text-xs font-bold flex items-center gap-2 ${
                backupNotice.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
              }`}>
                {backupNotice.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
                <span>{backupNotice.text}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                disabled={exportingJson}
                onClick={handleExportJson}
                className="flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-4 py-2.5 rounded-xl font-bold text-xs transition-all shadow-xs disabled:opacity-50 min-h-[42px]"
              >
                {exportingJson ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 text-emerald-400" />}
                <span>Download Full Backup (JSON)</span>
              </button>

              <button
                type="button"
                disabled={exportingCsv}
                onClick={handleExportCsv}
                className="flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 px-4 py-2.5 rounded-xl font-bold text-xs transition-all shadow-xs disabled:opacity-50 min-h-[42px]"
              >
                {exportingCsv ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 text-emerald-600" />}
                <span>Ekspor Stok Barang (CSV)</span>
              </button>
            </div>
          </div>

          {/* Cache & Quota Management */}
          <div className="bg-white border border-gray-200/90 rounded-2xl p-5 md:p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="text-sm font-black text-gray-900 mb-0.5 flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-blue-600" />
                  Manajemen Cache & Kuota Free Tier
                </h4>
                <p className="text-gray-500 text-xs">
                  Aplikasi menyimpan data master secara lokal untuk mencegah pemborosan kuota API Supabase.
                </p>
              </div>
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                Hit Rate {cacheStats.hitRate}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-gray-50 p-3.5 rounded-xl border border-gray-200/70 text-xs">
              <div>
                <p className="text-gray-500 text-[11px]">Request Dicegah</p>
                <p className="font-black text-gray-900 text-sm">{cacheStats.totalHits} Calls</p>
              </div>
              <div>
                <p className="text-gray-500 text-[11px]">Kunci Cache Aktif</p>
                <p className="font-black text-gray-900 text-sm">{cacheStats.cachedKeysCount} Data Set</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleClearCache}
                className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-xl font-bold text-xs border border-gray-200 transition-all min-h-[40px]"
              >
                <RefreshCw className="w-3.5 h-3.5 text-gray-600" />
                <span>Bersihkan Cache & Sinkron Ulang</span>
              </button>
              {cacheCleared && (
                <span className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Cache Dibersihkan
                </span>
              )}
            </div>
          </div>

          <div className="bg-white border border-gray-200/90 rounded-2xl p-5 md:p-6 shadow-sm">
            <h4 className="text-sm font-black text-gray-900 mb-1">Aplikasi Web</h4>
            <p className="text-gray-500 text-xs mb-4">Pasang aplikasi di layar utama untuk akses lebih cepat dan praktis.</p>
            <button 
              onClick={() => {
                console.log('Install button clicked, deferredPrompt:', (window as any).deferredPrompt);
                (window as any).deferredPrompt?.prompt();
              }}
              className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-xl font-bold text-xs border border-gray-200 transition-all min-h-[40px]"
            >
              <Smartphone className="w-4 h-4 text-amber-600" />
              <span>Pasang Aplikasi (PWA)</span>
            </button>
          </div>

          <div className="bg-white border border-gray-200/90 rounded-2xl p-5 md:p-6 shadow-sm">
            <h4 className="text-sm font-black text-gray-900 mb-1">Keamanan Akun</h4>
            <p className="text-gray-500 text-xs mb-4">Untuk mengubah kata sandi, silakan hubungi administrator sistem atau gunakan fitur reset password.</p>
            <div className="pt-3 border-t border-gray-100">
              <button 
                onClick={handleLogout}
                className="flex items-center gap-2 text-red-600 hover:text-red-700 font-bold text-xs transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Keluar dari Akun</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
