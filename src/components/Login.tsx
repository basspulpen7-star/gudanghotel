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
    <div className="min-h-screen flex items-center justify-center bg-[#F7F8FA] p-4 font-sans">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-gray-200/90 shadow-xl shadow-gray-200/40">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center mb-3 text-amber-600 shadow-xs">
            <Hotel className="w-8 h-8" />
          </div>
          <span className="text-[11px] font-extrabold text-amber-600 uppercase tracking-widest">HOTEL ALIA</span>
          <h1 className="text-xl font-black text-gray-900 tracking-tight mt-0.5">Warehouse System</h1>
          <p className="text-xs text-gray-500 mt-1 font-medium">Hotel Alia Matraman</p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-gray-100 p-1 rounded-xl mb-6 border border-gray-200/80">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(false);
              setError(null);
              setSuccessMessage(null);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              !isSignUp
                ? 'bg-white text-gray-900 shadow-sm border border-gray-200/60'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            Masuk
          </button>
          <button
            type="button"
            onClick={() => {
              setIsSignUp(true);
              setError(null);
              setSuccessMessage(null);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              isSignUp
                ? 'bg-white text-gray-900 shadow-sm border border-gray-200/60'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Daftar Baru
          </button>
        </div>

        {error && (
          <div className="p-3.5 mb-5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs space-y-2.5 leading-relaxed animate-in fade-in duration-200">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <span className="font-semibold">{error}</span>
            </div>

            {isEmailUnconfirmed && (
              <div className="pt-2 border-t border-red-200 space-y-2 text-[11px] text-red-600">
                <p>
                  <strong>Cara menonaktifkan konfirmasi email:</strong> Buka Supabase Dashboard &rarr; <strong>Authentication</strong> &rarr; <strong>Providers</strong> &rarr; <strong>Email</strong> &rarr; matikan toggle <strong>"Confirm email"</strong> &rarr; <strong>Save</strong>.
                </p>
                <p className="text-[10px] text-red-500">
                  Untuk akun yang sudah terdaftar tapi belum dikonfirmasi: buka menu <strong>Authentication &rarr; Users</strong> di Supabase, klik ikon <strong>...</strong> pada user lalu pilih <strong>"Confirm user"</strong>.
                </p>
              </div>
            )}

            {isRateLimited && (
              <div className="pt-2 border-t border-red-200 space-y-2 text-[11px] text-red-600">
                <p className="font-semibold text-red-800">
                  Solusi Cepat Mengatasi Batas Rate Limit Supabase:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-[10px] text-red-700">
                  <li>Buka <strong>Supabase Dashboard</strong> &rarr; <strong>Authentication</strong> &rarr; <strong>Providers</strong> &rarr; <strong>Email</strong>.</li>
                  <li>Matikan toggle <strong>"Confirm email"</strong> &rarr; klik <strong>Save</strong>.</li>
                  <li>Atau tambahkan pengguna secara instan melalui menu <strong>Authentication</strong> &rarr; <strong>Users</strong> &rarr; <strong>Add User</strong>.</li>
                </ol>
              </div>
            )}

            {isInvalidCredentials && !isSignUp && (
              <div className="pt-2 border-t border-red-200 flex items-center justify-between text-[11px]">
                <span className="text-red-700">Belum memiliki akun?</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(true);
                    setError(null);
                    setIsInvalidCredentials(false);
                  }}
                  className="font-bold underline text-amber-700 hover:text-amber-800 transition-colors ml-2"
                >
                  Daftar Sekarang
                </button>
              </div>
            )}
          </div>
        )}

        {successMessage && (
          <div className="p-3.5 mb-5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-start gap-2.5 leading-relaxed animate-in fade-in duration-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <span className="font-semibold">{successMessage}</span>
          </div>
        )}

        <form onSubmit={isSignUp ? handleSignUp : handleLogin} className="space-y-4">
          {isSignUp && (
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
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
            <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
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
            <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
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
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {isSignUp && (
              <p className="text-[11px] text-gray-500 mt-1">Minimal 6 karakter.</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-[#E65C00] hover:bg-[#CF5300] text-white font-extrabold py-3 rounded-xl transition-all shadow-md shadow-orange-500/20 flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
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
