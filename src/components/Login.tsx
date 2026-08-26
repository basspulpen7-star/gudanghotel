import React, { useState, useEffect } from 'react';
import { getFriendlyAuthErrorMessage } from '../contexts/AuthContext';
import { warehouseSupabase, warehouseUrl, warehouseKey } from '../lib/supabaseWarehouse';
import { LogIn, Eye, EyeOff, AlertCircle, RefreshCw } from 'lucide-react';

export function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEmailUnconfirmed, setIsEmailUnconfirmed] = useState(false);

  // Diagnostic log when Login screen is mounted
  useEffect(() => {
    console.log('[LOGIN DATABASE]', warehouseUrl);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsEmailUnconfirmed(false);

    const cleanInput = identifier.trim();

    if (!cleanInput) {
      setError('Harap masukkan Email atau Username Anda.');
      return;
    }

    if (!password) {
      setError('Harap masukkan password Anda.');
      return;
    }

    if (!warehouseUrl || !warehouseKey) {
      setError('Supabase Warehouse belum dikonfigurasi.');
      return;
    }

    setLoading(true);

    try {
      let targetEmail = cleanInput.toLowerCase();

      // If user typed username without '@', resolve email from profiles table
      if (!cleanInput.includes('@')) {
        try {
          const { data: profileRow } = await warehouseSupabase
            .from('profiles')
            .select('email')
            .ilike('username', cleanInput)
            .maybeSingle();

          if (profileRow?.email) {
            targetEmail = profileRow.email.toLowerCase();
          } else {
            // Fallback standard hotelalia email convention
            targetEmail = `${cleanInput.toLowerCase()}@hotelalia.com`;
          }
        } catch (lookupErr) {
          console.warn('[LOGIN USERNAME RESOLVE NOTICE]:', lookupErr);
          targetEmail = `${cleanInput.toLowerCase()}@hotelalia.com`;
        }
      }

      console.log('[LOGIN ATTEMPT] Target email:', targetEmail);

      const { data, error: authError } = await warehouseSupabase.auth.signInWithPassword({
        email: targetEmail,
        password: password
      });

      if (authError) {
        console.error('Login process error:', authError);
        const errMsg = authError.message?.toLowerCase() || '';
        
        if (errMsg.includes('email not confirmed') || errMsg.includes('not verified')) {
          setIsEmailUnconfirmed(true);
        }

        const friendlyMsg = getFriendlyAuthErrorMessage(authError);
        setError(friendlyMsg);
      } else if (data.user) {
        console.log('[LOGIN SUCCESS]', {
          database: 'WAREHOUSE',
          user: data.user.id
        });
      }
    } catch (err: any) {
      console.error('Unexpected login error:', err);
      setError(getFriendlyAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F8FA] p-4 font-sans">
      <div className="max-w-md w-full bg-white p-7 md:p-8 rounded-2xl border border-gray-200/90 shadow-xl shadow-gray-200/40">
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="w-14 h-14 flex items-center justify-center mb-2.5">
            <img src="/alia-logo.png" alt="Hotel Alia Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
          </div>
          <span className="text-[11px] font-extrabold text-amber-600 uppercase tracking-widest leading-none">HOTEL ALIA</span>
          <h1 className="text-xl font-black text-gray-900 tracking-tight mt-1">Sistem Gudang & Logistik</h1>
          <p className="text-xs text-gray-500 mt-0.5 font-medium">Hotel Alia Matraman</p>
        </div>

        {error && (
          <div className="p-3.5 mb-5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs space-y-2 leading-relaxed animate-in fade-in duration-200">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 font-semibold">{error}</div>
            </div>

            {isEmailUnconfirmed && (
              <div className="pt-2 border-t border-red-200 text-[11px] text-red-600">
                Email belum dikonfirmasi. Pastikan pengaturan Supabase <em>Confirm email</em> telah dinonaktifkan atau hubungi Administrator.
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
              Email atau Username
            </label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full text-sm py-2.5 px-3.5 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="Masukkan email atau username"
              autoComplete="username"
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                Password
              </label>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full text-sm py-2.5 px-3.5 pr-10 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="Masukkan password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-[#E65C00] hover:bg-[#CF5300] text-white font-extrabold py-3 rounded-xl transition-all shadow-md shadow-orange-500/20 flex items-center justify-center gap-2 disabled:opacity-50 text-xs md:text-sm tracking-wider uppercase min-h-[44px]"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Memverifikasi...</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>MASUK KE SISTEM</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-gray-100 text-center">
          <p className="text-[11px] text-gray-400">
            Pendaftaran & pengelolaan akun hanya dapat dilakukan oleh <span className="font-semibold text-gray-600">Administrator</span> melalui menu Manajemen Pengguna.
          </p>
        </div>
      </div>
    </div>
  );
}

