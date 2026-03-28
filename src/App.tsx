import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { UserProfile } from './types';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Inventory } from './components/Inventory';
import { Suppliers } from './components/Suppliers';
import { IncomingGoods } from './components/IncomingGoods';
import { OutgoingGoods } from './components/OutgoingGoods';
import { Reports } from './components/Reports';
import { PurchaseOrders } from './components/PurchaseOrders';
import { UserManagement } from './components/UserManagement';
import { DatabaseSetup } from './components/DatabaseSetup';
import { Settings } from './components/Settings';
import { Login } from './components/Login';

type View = 'dashboard' | 'inventory' | 'suppliers' | 'incoming' | 'outgoing' | 'reports' | 'settings' | 'purchase_orders' | 'user_management' | 'database_setup';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [globalSearch, setGlobalSearch] = useState('');

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching profile:', error);
        return;
      }
      
      if (data) {
        setProfile(data);
      }
    } catch (err) {
      console.error('Unexpected error in fetchProfile:', err);
    }
  };

  useEffect(() => {
    const ensureProfile = async (user: any) => {
      if (!user) return;
      
      try {
        const { data: existingProfile, error: checkError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();
        
        if (checkError) {
          console.error('Error checking profile in App:', checkError);
          return;
        }
        
        if (!existingProfile) {
          console.log('Creating missing profile for user in App:', user.id);
          const newProfile = {
            id: user.id,
            full_name: user.user_metadata?.full_name || user.user_metadata?.display_name || user.email?.split('@')[0] || 'User',
            email: user.email,
            role: 'staff'
          };
          const { error: insertError } = await supabase.from('profiles').insert([newProfile]);
          
          if (insertError) {
            console.error('Failed to create profile in App:', insertError);
          } else {
            setProfile(newProfile as UserProfile);
          }
        } else {
          setProfile(existingProfile);
        }
      } catch (err) {
        console.error('Unexpected error in ensureProfile:', err);
      }
    };

    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          if (error.message.includes('Refresh Token Not Found') || error.message.includes('invalid_grant')) {
            // Force local logout if refresh token is invalid
            await supabase.auth.signOut();
            localStorage.clear();
            setSession(null);
            setProfile(null);
          } else {
            console.error('Session check error:', error);
          }
        } else {
          setSession(session);
          if (session?.user) {
            ensureProfile(session.user);
            setupProfileSubscription(session.user.id);
          }
        }
      } catch (err) {
        console.error('Unexpected session check error:', err);
      }
    };

    checkSession();

    let profileSubscription: any = null;

    const setupProfileSubscription = (userId: string) => {
      if (profileSubscription) profileSubscription.unsubscribe();
      
      profileSubscription = supabase
        .channel(`profile-${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${userId}`
          },
          (payload) => {
            console.log('Profile changed in real-time:', payload);
            if (payload.new) {
              setProfile(payload.new as UserProfile);
            }
          }
        )
        .subscribe();
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setProfile(null);
        if (profileSubscription) profileSubscription.unsubscribe();
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setSession(session);
        if (session?.user) {
          ensureProfile(session.user);
          setupProfileSubscription(session.user.id);
        }
      } else if (event === 'USER_UPDATED') {
        if (session?.user) fetchProfile(session.user.id);
      }
    });

    return () => {
      subscription.unsubscribe();
      if (profileSubscription) profileSubscription.unsubscribe();
    };
  }, []);

  if (!session) {
    return <Login />;
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard user={session.user} profile={profile} />;
      case 'inventory':
        return <Inventory globalSearch={globalSearch} />;
      case 'suppliers':
        return <Suppliers globalSearch={globalSearch} />;
      case 'incoming':
        return <IncomingGoods globalSearch={globalSearch} />;
      case 'outgoing':
        return <OutgoingGoods globalSearch={globalSearch} />;
      case 'reports':
        return <Reports />;
      case 'purchase_orders':
        return <PurchaseOrders />;
      case 'user_management':
        return <UserManagement />;
      case 'database_setup':
        return <DatabaseSetup />;
      case 'settings':
        return <Settings user={session.user} profile={profile} onProfileUpdate={() => session.user && fetchProfile(session.user.id)} />;
      default:
        return <Dashboard user={session.user} profile={profile} />;
    }
  };

  return (
    <Layout 
      currentView={currentView} 
      setView={setCurrentView} 
      user={session.user}
      profile={profile}
      searchTerm={globalSearch}
      setSearchTerm={setGlobalSearch}
    >
      {renderView()}
    </Layout>
  );
}
