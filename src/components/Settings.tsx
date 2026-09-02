import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { User, Mail, Shield, Camera, Save, Loader2, LogOut, Smartphone, Download, Database, RefreshCw, HardDrive, CheckCircle2, AlertCircle } from 'lucide-react';
import { backupService } from '../services/backupService';
import { queryCache } from '../lib/queryCache';
import { migrateLinenData } from '../services/migrationService';

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

  useEffect(() => {
    console.log('[SETTINGS] Component mounted. isAdmin:', isAdmin, 'role:', role);
  }, [isAdmin, role]);

  // Migration states
  const [isMigrating, setIsMigrating] = useState(false);
  const [showMigrationConfirm, setShowMigrationConfirm] = useState(false);
  const [migrationLogs, setMigrationLogs] = useState<string[]>([]);
  const [migrationStatus, setMigrationStatus] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleLogout = async () => {
    await signOut();
  };

  const startMigration = async () => {
    console.log('[SETTINGS] startMigration triggered');
    setShowMigrationConfirm(false);
    setIsMigrating(true);
    setMigrationLogs(['Menyiapkan proses migrasi...']);
    setMigrationStatus(null);

    try {
      await migrateLinenData((msg) => {
        console.log('[MIGRATION LOG]', msg);
        setMigrationLogs(prev => [...prev, msg]);
      });
      setMigrationStatus({ type: 'success', text: 'Migrasi data linen berhasil diselesaikan!' });
    } catch (err: any) {
      console.error('[SETTINGS] Migration error:', err);
      setMigrationStatus({ type: 'error', text: `Gagal migrasi: ${err.message}` });
    } finally {
      setIsMigrating(false);
    }
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
      <div className="bg-[#252B34] p-4 md:p-6 rounded-2xl border border-[#343B46] shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
        <h2 className="text-xl md:text-2xl font-black text-[#F1F3F5] tracking-tight">Pengaturan Profil</h2>
        <p className="text-xs md:text-sm text-[#8E99A6] mt-0.5 font-medium">Kelola informasi akun dan preferensi sistem Anda</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="lg:col-span-1">
          <div className="bg-[#252B34] border border-[#343B46] rounded-2xl p-6 text-center space-y-4 shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
            <div className="relative inline-block">
              <div className="w-24 h-24 md:w-28 md:h-28 rounded-full bg-[#20252D] border-2 border-[#C89B3C] mx-auto flex items-center justify-center overflow-hidden shadow-md">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <User className="w-12 h-12 md:w-14 md:h-14 text-[#E0B85A]" />
                )}
              </div>
              <div className="absolute bottom-0 right-0 p-2 bg-gradient-to-r from-[#E6B85C] to-[#C89B3C] rounded-full border-2 border-[#252B34] text-[#171A1F] cursor-pointer hover:scale-105 transition-transform shadow-xs">
                <Camera className="w-3.5 h-3.5 md:w-4 md:h-4 stroke-[2.5]" />
              </div>
            </div>
            <div>
              <h3 className="text-lg font-black text-[#F1F3F5]">{displayName || user?.email?.split('@')[0]}</h3>
              <p className="text-[#8E99A6] text-xs mt-0.5">{user?.email}</p>
            </div>
            <div className="pt-4 border-t border-[#343B46]">
              <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1 bg-[#C89B3C]/15 text-[#E0B85A] rounded-lg text-xs font-bold border border-[#C89B3C]/30">
                <Shield className="w-3.5 h-3.5 text-[#E0B85A]" />
                <span className="uppercase tracking-wider">
                  {role === 'admin' ? 'Administrator' : role === 'hk' ? 'Staff Housekeeping' : role === 'resto' ? 'Staff Restoran' : 'Staff Gudang'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Edit Form */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-[#252B34] border border-[#343B46] rounded-2xl p-5 md:p-7 shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
            <form onSubmit={handleUpdateProfile} className="space-y-5">
              {message && (
                <div className={`p-3.5 rounded-xl text-xs font-bold ${
                  message.type === 'success' ? 'bg-[#55B685]/15 text-[#55B685] border border-[#55B685]/30' : 'bg-[#EB5757]/15 text-[#F87171] border border-[#EB5757]/30'
                }`}>
                  {message.text}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#D8DEE6] uppercase mb-1">Email Address (Read-only)</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E99A6]" />
                    <input 
                      type="email" 
                      value={user?.email} 
                      disabled 
                      className="w-full pl-10 pr-4 py-2.5 bg-[#20252D] border border-[#3A424D] rounded-xl text-[#8E99A6] text-xs font-semibold cursor-not-allowed"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#D8DEE6] uppercase mb-1">Nama Tampilan</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#E0B85A]" />
                    <input 
                      type="text" 
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Masukkan nama lengkap Anda"
                      className="w-full pl-10 pr-4 py-2.5 bg-[#20252D] border border-[#3A424D] rounded-xl text-[#F1F3F5] text-xs font-semibold placeholder:text-[#6F7985] focus:outline-none focus:border-[#C89B3C] transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#D8DEE6] uppercase mb-1">URL Foto Profil</label>
                  <div className="relative">
                    <Camera className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#E0B85A]" />
                    <input 
                      type="text" 
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="https://example.com/photo.jpg"
                      className="w-full pl-10 pr-4 py-2.5 bg-[#20252D] border border-[#3A424D] rounded-xl text-[#F1F3F5] text-xs font-semibold placeholder:text-[#6F7985] focus:outline-none focus:border-[#C89B3C] transition-all"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-[#6F7985]">Gunakan URL gambar publik (misal: dari Imgur atau hosting foto)</p>
                </div>
              </div>

              <div className="pt-2">
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="w-full md:w-auto bg-gradient-to-r from-[#E6B85C] to-[#C89B3C] hover:brightness-110 px-6 py-2.5 rounded-xl font-extrabold text-xs text-[#171A1F] transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 min-h-[44px] cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 stroke-[2.5]" />
                      <span>Simpan Perubahan</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Backup & Disaster Recovery Center */}
          <div className="bg-[#252B34] border border-[#343B46] rounded-2xl p-5 md:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.18)] space-y-4">
            <div>
              <h4 className="text-sm font-black text-[#F1F3F5] mb-0.5 flex items-center gap-2">
                <Database className="w-4 h-4 text-[#E0B85A]" />
                Pusat Backup & Disaster Recovery
              </h4>
              <p className="text-[#8E99A6] text-xs">
                Unduh salinan data lengkap database secara lokal untuk memastikan data aman dan dapat dipulihkan kapan saja.
              </p>
            </div>

            {backupNotice && (
              <div className={`p-3.5 rounded-xl text-xs font-bold flex items-center gap-2 ${
                backupNotice.type === 'success' ? 'bg-[#55B685]/15 text-[#55B685] border border-[#55B685]/30' : 'bg-[#EB5757]/15 text-[#F87171] border border-[#EB5757]/30'
              }`}>
                {backupNotice.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-[#55B685] shrink-0" /> : <AlertCircle className="w-4 h-4 text-[#EB5757] shrink-0" />}
                <span>{backupNotice.text}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                disabled={exportingJson}
                onClick={handleExportJson}
                className="flex items-center justify-center gap-2 bg-[#20252D] hover:bg-[#2A303A] text-[#F1F3F5] border border-[#3A424D] px-4 py-2.5 rounded-xl font-bold text-xs transition-all shadow-xs disabled:opacity-50 min-h-[42px] cursor-pointer"
              >
                {exportingJson ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 text-[#E0B85A]" />}
                <span>Download Full Backup (JSON)</span>
              </button>

              <button
                type="button"
                disabled={exportingCsv}
                onClick={handleExportCsv}
                className="flex items-center justify-center gap-2 bg-[#55B685]/15 hover:bg-[#55B685]/25 text-[#55B685] border border-[#55B685]/30 px-4 py-2.5 rounded-xl font-bold text-xs transition-all shadow-xs disabled:opacity-50 min-h-[42px] cursor-pointer"
              >
                {exportingCsv ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 text-[#55B685]" />}
                <span>Ekspor Stok Barang (CSV)</span>
              </button>
            </div>
          </div>

          {/* Migration Center - Admin Only */}
          {isAdmin && (
            <div className="bg-[#252B34] border border-[#343B46] rounded-2xl p-5 md:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.18)] space-y-4">
              <div>
                <h4 className="text-sm font-black text-[#F1F3F5] mb-0.5 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-[#E0B85A]" />
                  Migrasi Data Linen Lama
                </h4>
                <p className="text-[#8E99A6] text-xs">
                  Pindahkan data dari database linen terpisah (yjmjlxscvwnkoewvielo) ke database terpadu Gudang Alia.
                </p>
              </div>

              {migrationStatus && (
                <div className={`p-3.5 rounded-xl text-xs font-bold flex items-center gap-2 ${
                  migrationStatus.type === 'success' ? 'bg-[#55B685]/15 text-[#55B685] border border-[#55B685]/30' : 'bg-[#EB5757]/15 text-[#F87171] border border-[#EB5757]/30'
                }`}>
                  {migrationStatus.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-[#55B685] shrink-0" /> : <AlertCircle className="w-4 h-4 text-[#EB5757] shrink-0" />}
                  <span>{migrationStatus.text}</span>
                </div>
              )}

              {migrationLogs.length > 0 && (
                <div className="bg-[#20252D] p-3 rounded-xl border border-[#3A424D] max-h-40 overflow-y-auto font-mono text-[10px] space-y-1">
                  {migrationLogs.map((log, i) => (
                    <div key={i} className="text-[#8E99A6] border-b border-[#343B46]/30 pb-1 last:border-0">
                      <span className="text-[#E0B85A] mr-2">[{new Date().toLocaleTimeString()}]</span>
                      {log}
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-1">
                {showMigrationConfirm ? (
                  <div className="flex flex-col gap-3 p-4 bg-[#E0B85A]/10 border border-[#E0B85A]/30 rounded-xl">
                    <p className="text-xs font-bold text-[#E0B85A]">
                      Apakah Anda yakin? Data dari database lama akan ditambahkan ke database baru tanpa menghapus data yang sudah ada.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={startMigration}
                        className="flex-1 bg-[#55B685] hover:bg-[#63C794] text-white py-2 rounded-lg font-black text-[10px] transition-all"
                      >
                        Ya, Pindahkan Sekarang
                      </button>
                      <button
                        onClick={() => setShowMigrationConfirm(false)}
                        className="flex-1 bg-[#3A424D] hover:bg-[#464F5B] text-[#F1F3F5] py-2 rounded-lg font-black text-[10px] transition-all"
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isMigrating}
                    onClick={() => setShowMigrationConfirm(true)}
                    className="flex items-center justify-center gap-2 bg-[#C89B3C] hover:bg-[#E0B85A] text-[#171A1F] px-5 py-2.5 rounded-xl font-black text-xs transition-all shadow-md disabled:opacity-50 min-h-[44px] cursor-pointer"
                  >
                    {isMigrating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Sedang Memindahkan Data...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        <span>Jalankan Migrasi Sekarang</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Cache & Quota Management */}
          <div className="bg-[#252B34] border border-[#343B46] rounded-2xl p-5 md:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.18)] space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="text-sm font-black text-[#F1F3F5] mb-0.5 flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-blue-400" />
                  Manajemen Cache & Kuota Free Tier
                </h4>
                <p className="text-[#8E99A6] text-xs">
                  Aplikasi menyimpan data master secara lokal untuk mencegah pemborosan kuota API Supabase.
                </p>
              </div>
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-blue-500/15 text-blue-400 border border-blue-500/30">
                Hit Rate {cacheStats.hitRate}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-[#20252D] p-3.5 rounded-xl border border-[#3A424D] text-xs">
              <div>
                <p className="text-[#8E99A6] text-[11px]">Request Dicegah</p>
                <p className="font-black text-[#F1F3F5] text-sm">{cacheStats.totalHits} Calls</p>
              </div>
              <div>
                <p className="text-[#8E99A6] text-[11px]">Kunci Cache Aktif</p>
                <p className="font-black text-[#F1F3F5] text-sm">{cacheStats.cachedKeysCount} Data Set</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleClearCache}
                className="flex items-center gap-2 bg-[#20252D] hover:bg-[#2A303A] text-[#D8DEE6] px-4 py-2 rounded-xl font-bold text-xs border border-[#3A424D] transition-all min-h-[40px] cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#8E99A6]" />
                <span>Bersihkan Cache & Sinkron Ulang</span>
              </button>
              {cacheCleared && (
                <span className="text-xs text-[#55B685] font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Cache Dibersihkan
                </span>
              )}
            </div>
          </div>

          <div className="bg-[#252B34] border border-[#343B46] rounded-2xl p-5 md:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
            <h4 className="text-sm font-black text-[#F1F3F5] mb-1">Aplikasi Web</h4>
            <p className="text-[#8E99A6] text-xs mb-4">Pasang aplikasi di layar utama untuk akses lebih cepat dan praktis.</p>
            <button 
              onClick={() => {
                console.log('Install button clicked, deferredPrompt:', (window as any).deferredPrompt);
                (window as any).deferredPrompt?.prompt();
              }}
              className="flex items-center gap-2 bg-[#20252D] hover:bg-[#2A303A] text-[#D8DEE6] px-4 py-2 rounded-xl font-bold text-xs border border-[#3A424D] transition-all min-h-[40px] cursor-pointer"
            >
              <Smartphone className="w-4 h-4 text-[#E0B85A]" />
              <span>Pasang Aplikasi (PWA)</span>
            </button>
          </div>

          <div className="bg-[#252B34] border border-[#343B46] rounded-2xl p-5 md:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
            <h4 className="text-sm font-black text-[#F1F3F5] mb-1">Keamanan Akun</h4>
            <p className="text-[#8E99A6] text-xs mb-4">Pendaftaran dan perubahan hak akses akun dikelola oleh administrator melalui menu Manajemen Pengguna.</p>
            <div className="pt-3 border-t border-[#343B46]">
              <button 
                onClick={handleLogout}
                className="flex items-center gap-2 text-[#F87171] hover:text-red-400 font-bold text-xs transition-colors cursor-pointer"
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
