import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
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
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [globalSearch, setGlobalSearch] = useState('');

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          if (error.message.includes('Refresh Token Not Found') || error.message.includes('invalid_grant')) {
            // Force local logout if refresh token is invalid
            await supabase.auth.signOut();
            localStorage.clear();
            setSession(null);
          } else {
            console.error('Session check error:', error);
          }
        } else {
          setSession(session);
        }
      } catch (err) {
        console.error('Unexpected session check error:', err);
      }
    };

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setSession(null);
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setSession(session);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!session) {
    return <Login />;
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard user={session.user} />;
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
        return <Settings user={session.user} />;
      default:
        return <Dashboard user={session.user} />;
    }
  };

  return (
    <Layout 
      currentView={currentView} 
      setView={setCurrentView} 
      user={session.user}
      searchTerm={globalSearch}
      setSearchTerm={setGlobalSearch}
    >
      {renderView()}
    </Layout>
  );
}
