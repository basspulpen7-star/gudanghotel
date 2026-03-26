import React from 'react';
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
  Truck
} from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';

interface LayoutProps {
  children: React.ReactNode;
  currentView: string;
  setView: (view: any) => void;
  user: any;
}

export function Layout({ children, currentView, setView, user }: LayoutProps) {
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

  return (
    <div className="flex h-screen bg-brand-dark overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-brand-border flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-bold text-white">Hotel Alia Matraman</h1>
          <p className="text-xs text-brand-text-muted">Warehouse Management</p>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
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
            onClick={() => setView('reports')}
            className="w-full bg-brand-accent/10 text-brand-accent hover:bg-brand-accent hover:text-white font-semibold py-3 rounded-xl transition-all mb-4"
          >
            Buat Laporan
          </button>
          
          <button className="w-full flex items-center gap-3 px-4 py-2 text-brand-text-muted hover:text-white transition-all">
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
        <header className="h-16 border-b border-brand-border flex items-center justify-between px-8 bg-brand-dark/50 backdrop-blur-md z-10">
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted" />
            <input 
              type="text" 
              placeholder="Cari stok housekeeping..." 
              className="w-full pl-10 bg-brand-card/50 border-none"
            />
          </div>

          <div className="flex items-center gap-6">
            <button className="relative text-brand-text-muted hover:text-white">
              <Bell className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-brand-dark"></span>
            </button>
            <button className="text-brand-text-muted hover:text-white">
              <HelpCircle className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-3 pl-6 border-l border-brand-border">
              <div className="text-right">
                <p className="text-sm font-semibold text-white">Warehouse Mgr</p>
                <p className="text-xs text-brand-text-muted">Housekeeping</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-brand-accent flex items-center justify-center">
                <User className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        </header>

        {/* View Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
