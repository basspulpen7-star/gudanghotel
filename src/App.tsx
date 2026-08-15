import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
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
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { Hotel, ShieldAlert } from 'lucide-react';

type View = 
  | 'dashboard' 
  | 'inventory' 
  | 'suppliers' 
  | 'incoming' 
  | 'outgoing' 
  | 'reports' 
  | 'settings' 
  | 'purchase_orders' 
  | 'user_management' 
  | 'database_setup';

function MainApp() {
  const { session, user, profile, role, isAdmin, loading, refreshProfile } = useAuth();
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [globalSearch, setGlobalSearch] = useState('');

  // Safeguard: If non-admin user is on an admin-only view, redirect back to dashboard
  useEffect(() => {
    if (!loading && session && !isAdmin) {
      if (currentView === 'user_management' || currentView === 'database_setup') {
        console.warn(`[ACCESS DENIED] User with role '${role}' attempted to access '${currentView}'. Redirecting to dashboard.`);
        setCurrentView('dashboard');
      }
    }
  }, [isAdmin, role, currentView, session, loading]);

  // Loading Screen while verifying session
  if (loading) {
    return (
      <div className="min-h-screen bg-brand-dark flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-brand-accent flex items-center justify-center shadow-lg shadow-brand-accent/20 animate-pulse">
            <Hotel className="w-6 h-6 text-white" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-white font-bold text-base tracking-tight">Hotel Alia Matraman</h2>
            <p className="text-brand-text-muted text-xs">Memuat...</p>
            <button
              onClick={() => window.location.reload()}
              className="text-[11px] text-brand-accent hover:underline pt-2 block mx-auto"
            >
              Muat ulang jika terlalu lama?
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Unauthenticated -> Show Login
  if (!session || !user) {
    return <Login />;
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard user={user} profile={profile} onNavigate={(v) => setCurrentView(v as View)} />;
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
        if (!isAdmin) {
          return (
            <div className="p-8 text-center bg-brand-card rounded-2xl border border-brand-border space-y-3">
              <ShieldAlert className="w-12 h-12 text-red-400 mx-auto" />
              <h3 className="text-lg font-bold text-white">Akses Ditolak</h3>
              <p className="text-sm text-brand-text-muted">Halaman ini hanya dapat diakses oleh Administrator.</p>
              <button 
                onClick={() => setCurrentView('dashboard')}
                className="mt-2 px-4 py-2 bg-brand-accent text-white rounded-xl text-sm font-semibold hover:bg-blue-600 transition-all"
              >
                Kembali ke Dashboard
              </button>
            </div>
          );
        }
        return <UserManagement />;
      case 'database_setup':
        if (!isAdmin) {
          return (
            <div className="p-8 text-center bg-brand-card rounded-2xl border border-brand-border space-y-3">
              <ShieldAlert className="w-12 h-12 text-red-400 mx-auto" />
              <h3 className="text-lg font-bold text-white">Akses Ditolak</h3>
              <p className="text-sm text-brand-text-muted">Halaman ini hanya dapat diakses oleh Administrator.</p>
              <button 
                onClick={() => setCurrentView('dashboard')}
                className="mt-2 px-4 py-2 bg-brand-accent text-white rounded-xl text-sm font-semibold hover:bg-blue-600 transition-all"
              >
                Kembali ke Dashboard
              </button>
            </div>
          );
        }
        return <DatabaseSetup />;
      case 'settings':
        return (
          <Settings 
            user={user} 
            profile={profile} 
            onProfileUpdate={refreshProfile} 
          />
        );
      default:
        return <Dashboard user={user} profile={profile} onNavigate={(v) => setCurrentView(v as View)} />;
    }
  };

  return (
    <Layout 
      currentView={currentView} 
      setView={(v) => setCurrentView(v as View)} 
      user={user}
      profile={profile}
      searchTerm={globalSearch}
      setSearchTerm={setGlobalSearch}
    >
      {renderView()}
      <PWAInstallPrompt />
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
