import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { LogIn, Hotel } from 'lucide-react';

export function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    let loginEmail = identifier;

    // If identifier doesn't look like an email, try to resolve it from a profiles table
    if (!identifier.includes('@')) {
      try {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('email')
          .eq('username', identifier)
          .single();
        
        if (profileError) {
          // If profile not found, we'll still try to log in with the identifier as email
          // (it will likely fail, but that's the expected behavior for invalid credentials)
          console.warn('Profile not found for username:', identifier);
        } else if (profile?.email) {
          loginEmail = profile.email;
        }
      } catch (err) {
        console.error('Error resolving username:', err);
      }
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password,
    });

    if (error) {
      setError(error.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-dark p-4">
      <div className="max-w-md w-full bg-brand-card p-8 rounded-2xl border border-brand-border shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-brand-accent rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-brand-accent/20">
            <Hotel className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Hotel Alia Matraman</h1>
          <p className="text-brand-text-muted">Warehouse Management System</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-brand-text-muted mb-2">Email atau Nama Pengguna</label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full"
              placeholder="admin atau admin@hotelalia.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-text-muted mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-accent hover:bg-blue-600 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : (
              <>
                <LogIn className="w-5 h-5" />
                Sign In
              </>
            )}
          </button>

          <div className="pt-4 border-t border-brand-border mt-6">
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
                localStorage.clear();
                window.location.reload();
              }}
              className="w-full text-xs text-brand-text-muted hover:text-white transition-all underline"
            >
              Masalah Login? Reset Sesi
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
