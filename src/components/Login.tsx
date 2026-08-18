import React, { useState, useEffect } from 'react';
import { getFriendlyAuthErrorMessage } from '../contexts/AuthContext';
import { warehouseSupabase, warehouseUrl, warehouseKey } from '../lib/supabaseWarehouse';
import { LogIn, Hotel, Eye, EyeOff, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEmailUnconfirmed, setIsEmailUnconfirmed] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Diagnostic log when Login screen is mounted
  useEffect(() => {
    console.log('[LOGIN DATABASE]', 'https://qdsieavuhgvxrqtaytlt.supabase.co');
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsEmailUnconfirmed(false);
    setSuccessMessage(null);

    const cleanEmail = email.trim().toLowerCase();

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

    if (!warehouseUrl || !warehouseKey) {
      setError('Supabase Warehouse belum dikonfigurasi.');
      return;
    }

    setLoading(true);

    try {
      const { data, error: authError } = await warehouseSupabase.auth.signInWithPassword({
        email: cleanEmail,
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
          project: 'qdsieavuhgvxrqtaytlt'
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
      <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-gray-200/90 shadow-xl shadow-gray-200/40">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 flex items-center justify-center mb-3">
            <img src="/alia-logo.png" alt="Hotel Alia Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
          </div>
          <span className="text-[11px] font-extrabold text-amber-600 uppercase tracking-widest">HOTEL ALIA</span>
          <h1 className="text-xl font-black text-gray-900 tracking-tight mt-0.5">Warehouse System</h1>
          <p className="text-xs text-gray-500 mt-1 font-medium">Hotel Alia Matraman</p>
        </div>

        {error && (
          <div className="p-3.5 mb-5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs space-y-2.5 leading-relaxed animate-in fade-in duration-200">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <span className="font-semibold">{error}</span>
            </div>

            {isEmailUnconfirmed && (
              <div className="pt-2 border-t border-red-200 space-y-1 text-[11px] text-red-600">
                <p>
                  Email Anda belum dikonfirmasi. Silakan hubungi Administrator untuk memverifikasi akun Anda.
                </p>
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

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full text-sm"
              placeholder="Masukkan email"
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
                placeholder="Masukkan password"
                autoComplete="current-password"
                required
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
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-[#E65C00] hover:bg-[#CF5300] text-white font-extrabold py-3 rounded-xl transition-all shadow-md shadow-orange-500/20 flex items-center justify-center gap-2 disabled:opacity-50 text-sm tracking-wider uppercase"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Memproses...</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>MASUK</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

