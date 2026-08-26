import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Inventory } from './components/Inventory';
import { Suppliers } from './components/Suppliers';
import { IncomingGoods } from './components/IncomingGoods';
import { OutgoingGoods } from './components/OutgoingGoods';
import { Reports } from './components/Reports';
import { RestoReports } from './components/RestoReports';
import { RestoTakeGoods } from './components/RestoTakeGoods';
import { RestoHistory } from './components/RestoHistory';
import { RestoReportView } from './components/RestoReportView';
import { PurchaseOrders } from './components/PurchaseOrders';
import { UserManagement } from './components/UserManagement';
import { DatabaseSetup } from './components/DatabaseSetup';
import { Settings } from './components/Settings';
import { HousekeepingRequest } from './components/HousekeepingRequest';
import { Login } from './components/Login';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { Hotel, ShieldAlert } from 'lucide-react';

type View = 
  | 'dashboard' 
  | 'inventory' 
  | 'suppliers' 
  | 'incoming' 
  | 'outgoing' 
  | 'housekeeping_request'
  | 'reports' 
  | 'resto_reports'
  | 'resto_take'
  | 'resto_history'
  | 'settings' 
  | 'purchase_orders' 
  | 'user_management' 
  | 'database_setup';

function MainApp() {
  const { session, user, profile, role, isAdmin, isHK, isResto, loading, refreshProfile } = useAuth();
  const isHKUser = isHK || role === 'hk' || profile?.role === 'hk' || user?.user_metadata?.role === 'hk';
  const isRestoUser = isResto || role === 'resto' || profile?.role === 'resto' || user?.user_metadata?.role === 'resto';
  
  const [currentView, setCurrentView] = useState<View>(
    isHKUser ? 'housekeeping_request' : isRestoUser ? 'resto_take' : 'dashboard'
  );
  const [globalSearch, setGlobalSearch] = useState('');

  // Safeguard: Role-based view authorization and initial routing
  useEffect(() => {
    if (!loading && session) {
      if (isHKUser) {
        // HK role is strictly restricted to housekeeping_request
        if (currentView !== 'housekeeping_request') {
          setCurrentView('housekeeping_request');
        }
      } else if (isRestoUser) {
        // Resto user is restricted strictly to resto views and settings
        const allowedRestoViews: View[] = ['resto_take', 'resto_history', 'resto_reports', 'settings'];
        if (!allowedRestoViews.includes(currentView)) {
          console.warn(`[ACCESS RESTRICTED] Resto user attempted to access '${currentView}'. Redirecting to resto_take.`);
          setCurrentView('resto_take');
        }
      } else if (!isAdmin) {
        // Staff/Logistik cannot access admin-only views
        if (currentView === 'user_management' || currentView === 'database_setup') {
          console.warn(`[ACCESS DENIED] User with role '${role}' attempted to access '${currentView}'. Redirecting to dashboard.`);
          setCurrentView('dashboard');
        }
      }
    }
  }, [isAdmin, isHKUser, isRestoUser, role, currentView, session, loading]);

  // Loading Screen while verifying session
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] flex flex-col items-center justify-center p-4 font-sans">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-[#E65C00] flex items-center justify-center shadow-lg shadow-orange-500/20 animate-pulse">
            <Hotel className="w-6 h-6 text-white" />
          </div>
          <div className="text-center space-y-1.5">
            <h2 className="text-gray-900 font-black text-base tracking-tight">Hotel Alia Matraman</h2>
            <p className="text-gray-500 text-xs font-medium">Memuat data...</p>
            <button
              onClick={() => window.location.reload()}
              className="text-xs text-amber-700 font-bold hover:underline pt-2 block mx-auto"
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
      case 'housekeeping_request':
        return <HousekeepingRequest globalSearch={globalSearch} />;
      case 'reports':
        return <Reports onNavigateToResto={() => setCurrentView('resto_reports')} />;
      case 'resto_reports':
        return <RestoReports />;
      case 'resto_take':
        return (
          <RestoTakeGoods 
            user={user} 
            profile={profile} 
            onNavigateToHistory={() => setCurrentView('resto_history')} 
          />
        );
      case 'resto_history':
        return (
          <RestoHistory 
            onNavigateToTakeGoods={() => setCurrentView('resto_take')} 
          />
        );
      case 'purchase_orders':
        return <PurchaseOrders />;
      case 'user_management':
        if (!isAdmin) {
          return (
            <div className="p-8 text-center bg-white rounded-2xl border border-gray-200/90 shadow-sm space-y-3 font-sans">
              <ShieldAlert className="w-12 h-12 text-red-500 mx-auto" />
              <h3 className="text-lg font-black text-gray-900">Akses Ditolak</h3>
              <p className="text-xs text-gray-500 font-medium">Halaman ini hanya dapat diakses oleh Administrator.</p>
              <button 
                onClick={() => setCurrentView('dashboard')}
                className="mt-2 px-5 py-2.5 bg-[#E65C00] hover:bg-[#CF5300] text-white rounded-xl text-xs font-extrabold shadow-sm transition-all"
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
            <div className="p-8 text-center bg-white rounded-2xl border border-gray-200/90 shadow-sm space-y-3 font-sans">
              <ShieldAlert className="w-12 h-12 text-red-500 mx-auto" />
              <h3 className="text-lg font-black text-gray-900">Akses Ditolak</h3>
              <p className="text-xs text-gray-500 font-medium">Halaman ini hanya dapat diakses oleh Administrator.</p>
              <button 
                onClick={() => setCurrentView('dashboard')}
                className="mt-2 px-5 py-2.5 bg-[#E65C00] hover:bg-[#CF5300] text-white rounded-xl text-xs font-extrabold shadow-sm transition-all"
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
