import React, { useState } from 'react';
import { useAuth, getFriendlyAuthErrorMessage } from '../contexts/AuthContext';
import { supabase, supabaseUrl, supabaseKey } from '../lib/supabase';
import { LogIn, Hotel, UserPlus, Eye, EyeOff, AlertCircle, CheckCircle2, RefreshCw, Send, Mail } from 'lucide-react';

export function Login() {
  const { signIn, signUp } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEmailUnconfirmed, setIsEmailUnconfirmed] = useState(false);
  const [isInvalidCredentials, setIsInvalidCredentials] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsEmailUnconfirmed(false);
    setIsInvalidCredentials(false);
    setIsRateLimited(false);
    setSuccessMessage(null);

    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setError('Harap masukkan alamat email Anda.');
      return;
    }

    if (!cleanEmail.includes('@')) {
      setError('Harap gunakan format alamat email yang valid (contoh: user@hotelalia.com).');
      return;
    }

    if (!password) {
      setError('Harap masukkan password Anda.');
      return;
    }

    if (!supabaseUrl || !supabaseKey) {
      setError('Konfigurasi sistem belum lengkap. Hubungi administrator.');
      return;
    }

    setLoading(true);

    try {
      const { error: authError } = await signIn(cleanEmail, password);

      if (authError) {
        console.error('Login process error:', authError);
        const errMsg = authError.message?.toLowerCase() || '';
        
        if (errMsg.includes('email not confirmed') || errMsg.includes('not verified')) {
          setIsEmailUnconfirmed(true);
        } else if (errMsg.includes('invalid login credentials') || errMsg.includes('invalid_grant')) {
          setIsInvalidCredentials(true);
        }

        const friendlyMsg = getFriendlyAuthErrorMessage(authError);
        setError(friendlyMsg);
      }
    } catch (err: any) {
      console.error('Unexpected login error:', err);
      setError(getFriendlyAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Masukkan alamat email yang valid terlebih dahulu.');
      return;
    }

    setResendingEmail(true);
    try {
      const { error: resendErr } = await supabase.auth.resend({
        type: 'signup',
        email: cleanEmail,
      });

      if (resendErr) {
        console.error('Error resending confirmation:', resendErr);
        setError('Gagal mengirim ulang email verifikasi: ' + resendErr.message);
      } else {
        setSuccessMessage('Email verifikasi baru telah dikirimkan ke ' + cleanEmail + '. Silakan periksa kotak masuk atau folder spam Anda.');
        setError(null);
        setIsEmailUnconfirmed(false);
      }
    } catch (err: any) {
      console.error('Resend catch error:', err);
      setError('Terjadi kesalahan saat mengirim email verifikasi.');
    } finally {
      setResendingEmail(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsEmailUnconfirmed(false);
    setIsInvalidCredentials(false);
    setSuccessMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    const cleanFullName = fullName.trim();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Harap masukkan format email yang valid.');
      return;
    }

    if (password.length < 6) {
      setError('Password minimal harus 6 karakter.');
      return;
    }

    if (!supabaseUrl || !supabaseKey) {
      setError('Konfigurasi sistem belum lengkap. Hubungi administrator.');
      return;
    }

    setLoading(true);

    try {
      const { error: authError, session } = await signUp(cleanEmail, password, cleanFullName);

      if (authError) {
        console.error('Registration process error:', authError);
        const errMsg = (authError.message || '').toLowerCase();
        if (errMsg.includes('rate limit') || errMsg.includes('rate_limit') || (authError as any).status === 429) {
          setIsRateLimited(true);
        }
        setError(getFriendlyAuthErrorMessage(authError));
      } else {
        if (session) {
          setSuccessMessage('Akun berhasil dibuat dan Anda berhasil masuk!');
        } else {
          // Attempt immediate login in case Supabase returns user without session
          const { error: loginErr } = await signIn(cleanEmail, password);
          if (!loginErr) {
            setSuccessMessage('Pendaftaran berhasil! Mengalihkan ke dashboard...');
          } else {
            setSuccessMessage('Pendaftaran berhasil! Silakan masukkan email dan password Anda untuk masuk.');
            setIsSignUp(false);
            setPassword('');
          }
        }
      }
    } catch (err: any) {
      console.error('Unexpected signup error:', err);
      const errMsg = (err?.message || '').toLowerCase();
      if (errMsg.includes('rate limit') || errMsg.includes('rate_limit') || err?.status === 429) {
        setIsRateLimited(true);
      }
      setError(getFriendlyAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-dark p-4">
      <div className="max-w-md w-full bg-brand-card p-8 rounded-2xl border border-brand-border shadow-2xl">
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 bg-brand-accent rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-brand-accent/20">
            <Hotel className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Hotel Alia Matraman</h1>
          <p className="text-sm text-brand-text-muted mt-1">Warehouse Management System</p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-brand-dark p-1 rounded-xl mb-6 border border-brand-border">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(false);
              setError(null);
              setSuccessMessage(null);
            }}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
              !isSignUp
                ? 'bg-brand-accent text-white shadow-md'
                : 'text-brand-text-muted hover:text-white'
            }`}
          >
            <LogIn className="w-4 h-4" />
            Masuk
          </button>
          <button
            type="button"
            onClick={() => {
              setIsSignUp(true);
              setError(null);
              setSuccessMessage(null);
            }}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
              isSignUp
                ? 'bg-brand-accent text-white shadow-md'
                : 'text-brand-text-muted hover:text-white'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            Daftar Baru
          </button>
        </div>

        {error && (
          <div className="p-3.5 mb-5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs space-y-2.5 leading-relaxed animate-in fade-in duration-200">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>

            {isEmailUnconfirmed && (
              <div className="pt-2 border-t border-red-500/20 space-y-2 text-[11px] text-red-300">
                <p>
                  <strong>Cara menonaktifkan konfirmasi email:</strong> Buka Supabase Dashboard &rarr; <strong>Authentication</strong> &rarr; <strong>Providers</strong> &rarr; <strong>Email</strong> &rarr; matikan toggle <strong>"Confirm email"</strong> &rarr; <strong>Save</strong>.
                </p>
                <p className="text-[10px] text-red-400">
                  Untuk akun yang sudah terdaftar tapi belum dikonfirmasi: buka menu <strong>Authentication &rarr; Users</strong> di Supabase, klik ikon <strong>...</strong> pada user lalu pilih <strong>"Confirm user"</strong>.
                </p>
              </div>
            )}

            {isRateLimited && (
              <div className="pt-2 border-t border-red-500/20 space-y-2 text-[11px] text-red-300">
                <p className="font-semibold text-red-200">
                  Solusi Cepat Mengatasi Batas Rate Limit Supabase:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-[10px] text-red-300">
                  <li>Buka <strong>Supabase Dashboard</strong> &rarr; <strong>Authentication</strong> &rarr; <strong>Providers</strong> &rarr; <strong>Email</strong>.</li>
                  <li>Matikan toggle <strong>"Confirm email"</strong> &rarr; klik <strong>Save</strong> (setelah dimatikan, pendaftaran tidak akan memicu pengiriman email sehingga tidak akan terkena batas rate limit).</li>
                  <li>Atau tambahkan pengguna secara instan melalui menu <strong>Authentication</strong> &rarr; <strong>Users</strong> &rarr; <strong>Add User</strong> &rarr; <strong>Create User</strong> (isi Email & Password, centang Auto Confirm).</li>
                </ol>
              </div>
            )}

            {isInvalidCredentials && !isSignUp && (
              <div className="pt-2 border-t border-red-500/20 flex items-center justify-between text-[11px]">
                <span className="text-red-300">Belum memiliki akun?</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(true);
                    setError(null);
                    setIsInvalidCredentials(false);
                  }}
                  className="font-bold underline text-white hover:text-brand-accent transition-colors ml-2"
                >
                  Daftar Sekarang
                </button>
              </div>
            )}
          </div>
        )}

        {successMessage && (
          <div className="p-3.5 mb-5 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-xs flex items-start gap-2.5 leading-relaxed animate-in fade-in duration-200">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={isSignUp ? handleSignUp : handleLogin} className="space-y-4">
          {isSignUp && (
            <div>
              <label className="block text-xs font-semibold text-brand-text-muted mb-1.5 uppercase tracking-wider">
                Nama Lengkap
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full text-sm"
                placeholder="Contoh: Budi Santoso"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-brand-text-muted mb-1.5 uppercase tracking-wider">
              Alamat Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full text-sm"
              placeholder="user@hotelalia.com"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-brand-text-muted mb-1.5 uppercase tracking-wider">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full text-sm pr-10"
                placeholder="••••••••"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-muted hover:text-white"
                aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {isSignUp && (
              <p className="text-[11px] text-brand-text-muted mt-1">Minimal 6 karakter.</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-brand-accent hover:bg-blue-600 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-brand-accent/20 flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>{isSignUp ? 'Mendaftarkan...' : 'Memproses Masuk...'}</span>
              </>
            ) : isSignUp ? (
              <>
                <UserPlus className="w-4 h-4" />
                <span>Daftar Akun Baru</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>Masuk ke Sistem</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
