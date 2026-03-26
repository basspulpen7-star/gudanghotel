import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  ArrowDownCircle, 
  ArrowUpCircle, 
  FileText, 
  Settings, 
  LogOut,
  Search,
  Bell,
  HelpCircle,
  User,
  Truck,
  Menu,
  X
} from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';

interface LayoutProps {
  children: React.ReactNode;
  currentView: string;
  setView: (view: any) => void;
  user: any;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
}

export function Layout({ children, currentView, setView, user, searchTerm, setSearchTerm }: LayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'inventory', label: 'Stok Barang', icon: Package },
    { id: 'suppliers', label: 'Data Supplier', icon: Truck },
    { id: 'incoming', label: 'Barang Masuk', icon: ArrowDownCircle },
    { id: 'outgoing', label: 'Barang Keluar', icon: ArrowUpCircle },
    { id: 'reports', label: 'Laporan', icon: FileText },
  ];

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleSetView = (view: string) => {
    setView(view);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="flex h-screen bg-brand-dark overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 w-64 border-r border-brand-border flex flex-col bg-brand-dark z-50 transition-transform duration-300 lg:relative lg:translate-x-0",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-white">Hotel Alia Matraman</h1>
            <p className="text-xs text-brand-text-muted">Warehouse Management</p>
          </div>
          <button className="lg:hidden text-brand-text-muted" onClick={() => setIsMobileMenuOpen(false)}>
            <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleSetView(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                currentView === item.id 
                  ? "bg-brand-accent text-white shadow-lg shadow-brand-accent/20" 
                  : "text-brand-text-muted hover:bg-brand-card hover:text-white"
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 space-y-2 border-t border-brand-border">
          <button 
            onClick={() => handleSetView('reports')}
            className="w-full bg-brand-accent/10 text-brand-accent hover:bg-brand-accent hover:text-white font-semibold py-3 rounded-xl transition-all mb-4"
          >
            Buat Laporan
          </button>
          
          <button 
            onClick={() => handleSetView('settings')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-2 rounded-xl transition-all",
              currentView === 'settings' ? "text-white bg-brand-card" : "text-brand-text-muted hover:text-white"
            )}
          >
            <Settings className="w-5 h-5" />
            <span>Settings</span>
          </button>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2 text-brand-text-muted hover:text-red-400 transition-all"
          >
            <LogOut className="w-5 h-5" />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-brand-border flex items-center justify-between px-4 md:px-8 bg-brand-dark/50 backdrop-blur-md z-10">
          <div className="flex items-center gap-4">
            <button 
              className="lg:hidden text-brand-text-muted hover:text-white p-2"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="relative hidden md:block w-64 lg:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted" />
              <input 
                type="text" 
                placeholder={`Cari di ${currentView}...`} 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 bg-brand-card/50 border border-brand-border/50 py-2 rounded-lg text-white focus:ring-1 focus:ring-brand-accent outline-none transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 md:gap-6">
            <button className="relative text-brand-text-muted hover:text-white">
              <Bell className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-brand-dark"></span>
            </button>
            
            <div className="flex items-center gap-3 pl-3 md:pl-6 border-l border-brand-border">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-white truncate max-w-[150px]">
                  {user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'User'}
                </p>
                <p className="text-xs text-brand-text-muted uppercase tracking-wider">
                  {user?.email === 'admin@hotelalia.com' ? 'Administrator' : 'Staff Gudang'}
                </p>
              </div>
              <button 
                onClick={() => handleSetView('settings')}
                className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-brand-accent flex items-center justify-center overflow-hidden border-2 border-transparent hover:border-brand-accent transition-all"
              >
                {user?.user_metadata?.avatar_url ? (
                  <img 
                    src={user.user_metadata.avatar_url} 
                    alt="Profile" 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <User className="w-5 h-5 md:w-6 md:h-6 text-white" />
                )}
              </button>
            </div>
          </div>
        </header>

        {/* View Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
