import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, supabaseUrl, supabaseKey } from '../lib/supabase';
import { UserProfile } from '../types';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  role: 'admin' | 'staff';
  isAdmin: boolean;
  loading: boolean;
  profileLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null; user?: User }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null; session?: Session | null; user?: User | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper function to map error messages to human-friendly text
export function getFriendlyAuthErrorMessage(error: any): string {
  if (!error) return 'Terjadi kesalahan pada sistem autentikasi.';
  
  const rawMsg = (error.message || '').toLowerCase();
  const status = error.status;

  if (
    rawMsg.includes('invalid login credentials') ||
    rawMsg.includes('invalid_grant') ||
    rawMsg.includes('invalid email or password') ||
    status === 400
  ) {
    return 'Email atau password salah.';
  }

  if (
    rawMsg.includes('rate limit') ||
    rawMsg.includes('rate_limit') ||
    rawMsg.includes('too many requests') ||
    status === 429
  ) {
    return 'Batas pengiriman email Supabase terlampaui (Rate limit exceeded). Hal ini terjadi karena fitur "Confirm email" masih aktif di Supabase. Silakan nonaktifkan "Confirm email" di Supabase Dashboard (Authentication -> Providers -> Email) agar pendaftaran langsung aktif tanpa mengirim email.';
  }

  if (rawMsg.includes('email not confirmed') || rawMsg.includes('not verified')) {
    return 'Konfirmasi email masih aktif di Supabase. Nonaktifkan "Confirm email" di Dashboard Supabase (Authentication -> Providers -> Email).';
  }

  if (rawMsg.includes('already registered') || rawMsg.includes('user already exists')) {
    return 'Email sudah terdaftar. Silakan login atau gunakan email lain.';
  }

  if (
    rawMsg.includes('fetch') ||
    rawMsg.includes('network') ||
    rawMsg.includes('connection') ||
    rawMsg.includes('failed to fetch')
  ) {
    return 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.';
  }

  if (!supabaseUrl || !supabaseKey) {
    return 'Konfigurasi sistem belum lengkap. Hubungi administrator.';
  }

  if (rawMsg.includes('profile not found')) {
    return 'Akun berhasil login, tetapi data profil belum tersedia. Hubungi administrator.';
  }

  return error.message || 'Terjadi kesalahan. Silakan coba lagi nanti.';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [profileLoading, setProfileLoading] = useState<boolean>(false);

  // Fetch profile by profiles.id = user.id
  const fetchProfile = useCallback(async (userId: string, currentUser?: User | null) => {
    if (!userId) {
      setProfile(null);
      return;
    }

    setProfileLoading(true);
    console.log('[PROFILE FETCH] Fetching profile for user ID:', userId);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('[PROFILE FETCH ERROR]:', error);
      }

      if (data) {
        console.log('[PROFILE FOUND] Role:', data.role || 'staff');
        setProfile(data as UserProfile);
      } else {
        console.warn('[PROFILE NOT FOUND] Profile row missing for ID:', userId);
        // Fallback: create default profile row if missing to prevent broken state
        const targetUser = currentUser || user;
        const fallbackName = targetUser?.user_metadata?.full_name || 
                             targetUser?.user_metadata?.display_name || 
                             targetUser?.email?.split('@')[0] || 
                             'User';
        
        const fallbackProfile: UserProfile = {
          id: userId,
          full_name: fallbackName,
          email: targetUser?.email || '',
          role: 'staff',
          created_at: new Date().toISOString()
        };

        try {
          const { error: insertErr } = await supabase
            .from('profiles')
            .upsert(fallbackProfile, { onConflict: 'id' });
          
          if (!insertErr) {
            setProfile(fallbackProfile);
            console.log('[PROFILE CREATED FALLBACK] Role:', fallbackProfile.role);
          } else {
            console.warn('[PROFILE FALLBACK INSERT NOTICE]:', insertErr.message);
            setProfile(fallbackProfile);
          }
        } catch (insertCatchErr) {
          console.error('[PROFILE FALLBACK CATCH]:', insertCatchErr);
          setProfile(fallbackProfile);
        }
      }
    } catch (err) {
      console.error('[PROFILE UNEXPECTED ERROR]:', err);
    } finally {
      setProfileLoading(false);
    }
  }, [user]);

  // Refresh current user's profile
  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await fetchProfile(user.id, user);
    }
  }, [user, fetchProfile]);

  // Initialize Session on mount
  useEffect(() => {
    console.log('[AUTH INIT] Checking initial session...');
    let isMounted = true;

    async function initAuth() {
      try {
        const { data: { session: initialSession }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('[AUTH INIT ERROR]:', error);
          if (error.message.includes('Refresh Token Not Found') || error.message.includes('invalid_grant')) {
            await supabase.auth.signOut();
            if (isMounted) {
              setSession(null);
              setUser(null);
              setProfile(null);
            }
          }
        } else if (initialSession?.user) {
          console.log('[SESSION FOUND] User authenticated:', initialSession.user.id);
          if (isMounted) {
            setSession(initialSession);
            setUser(initialSession.user);
            await fetchProfile(initialSession.user.id, initialSession.user);
          }
        } else {
          console.log('[AUTH INIT] No active session found.');
          if (isMounted) {
            setSession(null);
            setUser(null);
            setProfile(null);
          }
        }
      } catch (err) {
        console.error('[AUTH INIT CATCH]:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    initAuth();

    // Listen for Auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      console.log('[AUTH STATE CHANGE] Event:', event);

      if (event === 'SIGNED_OUT') {
        console.log('[LOGOUT] Session cleared.');
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        console.log('[SESSION FOUND] Event:', event, 'User:', newSession?.user?.id);
        setSession(newSession);
        setUser(newSession?.user || null);
        if (newSession?.user) {
          await fetchProfile(newSession.user.id, newSession.user);
        }
        setLoading(false);
      } else if (event === 'USER_UPDATED') {
        setUser(newSession?.user || null);
        if (newSession?.user) {
          await fetchProfile(newSession.user.id, newSession.user);
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  // Sign In using Email + Password only
  const signIn = async (email: string, password: string) => {
    console.log('[LOGIN START] Attempting login for email:', email.trim().toLowerCase());
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: password,
      });

      if (error) {
        console.error('[LOGIN ERROR]:', error.message);
        return { error };
      }

      if (data.session && data.user) {
        console.log('[LOGIN SUCCESS] User ID:', data.user.id);
        setSession(data.session);
        setUser(data.user);
        await fetchProfile(data.user.id, data.user);
        return { error: null, user: data.user };
      }

      return { error: null, user: data.user || undefined };
    } catch (err: any) {
      console.error('[LOGIN CATCH]:', err);
      return { error: err };
    }
  };

  // Sign Up with default role 'staff'
  const signUp = async (email: string, password: string, fullName: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = fullName.trim() || cleanEmail.split('@')[0];

    console.log('[SIGNUP START] Registering user:', cleanEmail);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: password,
        options: {
          data: {
            full_name: cleanName,
            role: 'staff' // Default role is strictly staff
          }
        }
      });

      if (error) {
        console.error('[SIGNUP ERROR]:', error.message);
        return { error };
      }

      if (data.user) {
        console.log('[SIGNUP SUCCESS] Auth user created ID:', data.user.id);

        // Attempt to create or upsert profile row if immediate session exists or client-permitted
        try {
          const profileData: UserProfile = {
            id: data.user.id,
            full_name: cleanName,
            email: cleanEmail,
            role: 'staff',
            created_at: new Date().toISOString()
          };

          await supabase
            .from('profiles')
            .upsert(profileData, { onConflict: 'id' });
        } catch (profErr) {
          console.warn('[SIGNUP PROFILE WARNING]:', profErr);
        }

        if (data.session) {
          setSession(data.session);
          setUser(data.user);
          await fetchProfile(data.user.id, data.user);
        }
      }

      return { error: null, session: data.session, user: data.user };
    } catch (err: any) {
      console.error('[SIGNUP CATCH]:', err);
      return { error: err };
    }
  };

  // Sign Out
  const signOut = async () => {
    console.log('[LOGOUT START] Signing out...');
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('[LOGOUT ERROR]:', err);
    } finally {
      setSession(null);
      setUser(null);
      setProfile(null);
      localStorage.clear();
      console.log('[LOGOUT] Completed.');
    }
  };

  // Role resolution
  const userRole: 'admin' | 'staff' = 
    profile?.role === 'admin' || user?.email === 'admin@hotelalia.com' 
      ? 'admin' 
      : 'staff';

  const isAdmin = userRole === 'admin';

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        role: userRole,
        isAdmin,
        loading,
        profileLoading,
        signIn,
        signUp,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
