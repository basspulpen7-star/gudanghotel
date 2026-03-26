import React, { useState, useEffect, useRef } from 'react';
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
  X,
  AlertTriangle
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
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const notificationRef = useRef<HTMLDivElement>(null);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'inventory', label: 'Stok Barang', icon: Package },
    { id: 'suppliers', label: 'Data Supplier', icon: Truck },
    { id: 'incoming', label: 'Barang Masuk', icon: ArrowDownCircle },
    { id: 'outgoing', label: 'Barang Keluar', icon: ArrowUpCircle },
    { id: 'reports', label: 'Laporan', icon: FileText },
  ];

  useEffect(() => {
    fetchNotifications();
    
    // Close notifications when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchNotifications = async () => {
    try {
      // Fetch items and transactions to calculate current stock
      const { data: items, error: itemsError } = await supabase.from('items').select('*');
      if (itemsError) throw itemsError;

      const { data: transactions, error: transError } = await supabase.from('transactions').select('item_id, type, quantity');
      if (transError) throw transError;

      const lowStockItems = items?.filter(item => {
        const itemTransactions = transactions?.filter(t => t.item_id === item.id) || [];
        const currentStock = (item.initial_stock || 0) + 
          itemTransactions.reduce((acc, t) => t.type === 'IN' ? acc + t.quantity : acc - t.quantity, 0);
        
        return currentStock <= (item.min_stock || 0);
      }).map(item => ({
        id: item.id,
        title: 'Stok Rendah',
        message: `${item.name} sisa sedikit (${item.unit})`,
        type: 'warning'
      })) || [];

      setNotifications(lowStockItems);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleSetView = (view: string) => {
    setView(view);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="flex h-screen bg-brand-dark overflow-hidden">
      {/* Sidebar - Hidden on mobile, shown on desktop */}
      <aside className={cn(
        "hidden lg:flex w-64 border-r border-brand-border flex-col bg-brand-dark z-50 transition-transform duration-300 relative translate-x-0"
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
            <div className="relative md:block w-full md:w-64 lg:w-96">
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
            <div className="relative" ref={notificationRef}>
              <button 
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className="relative text-brand-text-muted hover:text-white p-2 rounded-lg hover:bg-brand-card transition-colors"
              >
                <Bell className="w-5 h-5" />
                {notifications.length > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-brand-dark text-[10px] flex items-center justify-center text-white font-bold">
                    {notifications.length}
                  </span>
                )}
              </button>

              {isNotificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-brand-card border border-brand-border rounded-xl shadow-2xl z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="p-4 border-b border-brand-border flex justify-between items-center">
                    <h3 className="font-bold text-white">Notifikasi</h3>
                    <span className="text-xs text-brand-text-muted">{notifications.length} Baru</span>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length > 0 ? (
                      notifications.map((notif, idx) => (
                        <div key={idx} className="p-4 border-b border-brand-border/50 hover:bg-brand-dark/30 transition-colors flex gap-3">
                          <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                            <AlertTriangle className="w-4 h-4 text-orange-500" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white">{notif.title}</p>
                            <p className="text-xs text-brand-text-muted">{notif.message}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center">
                        <Bell className="w-8 h-8 text-brand-text-muted mx-auto mb-2 opacity-20" />
                        <p className="text-sm text-brand-text-muted">Tidak ada notifikasi baru</p>
                      </div>
                    )}
                  </div>
                  {notifications.length > 0 && (
                    <button 
                      onClick={() => handleSetView('inventory')}
                      className="w-full p-3 text-xs text-brand-accent font-bold hover:bg-brand-dark/50 transition-colors rounded-b-xl"
                    >
                      Lihat Semua Stok
                    </button>
                  )}
                </div>
              )}
            </div>
            
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
        <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 lg:pb-8">
          {children}
        </div>

        {/* Mobile Bottom Navigation */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-brand-card/90 backdrop-blur-lg border-t border-brand-border flex justify-around items-center px-2 py-3 z-50">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleSetView(item.id)}
              className={cn(
                "flex flex-col items-center gap-1 transition-all px-2",
                currentView === item.id ? "text-brand-accent" : "text-brand-text-muted"
              )}
            >
              <item.icon className={cn("w-6 h-6", currentView === item.id && "animate-in zoom-in duration-300")} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          ))}
          <button
            onClick={() => handleSetView('settings')}
            className={cn(
              "flex flex-col items-center gap-1 transition-all px-2",
              currentView === 'settings' ? "text-brand-accent" : "text-brand-text-muted"
            )}
          >
            <Settings className={cn("w-6 h-6", currentView === 'settings' && "animate-in zoom-in duration-300")} />
            <span className="text-[10px] font-medium">Settings</span>
          </button>
        </nav>
      </main>
    </div>
  );
}
