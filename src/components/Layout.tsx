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
  AlertTriangle,
  Users,
  ShoppingCart,
  Database
} from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface LayoutProps {
  children: React.ReactNode;
  currentView: string;
  setView: (view: any) => void;
  user: any;
  profile: any;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
}

export function Layout({ children, currentView, setView, user, profile, searchTerm, setSearchTerm }: LayoutProps) {
  const { signOut, isAdmin } = useAuth();
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const notificationRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'inventory', label: 'Stok', icon: Package },
    { id: 'incoming', label: 'Masuk', icon: ArrowDownCircle },
    { id: 'outgoing', label: 'Keluar', icon: ArrowUpCircle },
    { id: 'purchase_orders', label: 'PO', icon: ShoppingCart },
    { id: 'suppliers', label: 'Supplier', icon: Truck },
    { id: 'reports', label: 'Laporan', icon: FileText },
    { id: 'database_setup', label: 'DB Setup', icon: Database },
  ];

  if (isAdmin) {
    if (!menuItems.find(m => m.id === 'user_management')) {
      menuItems.push({ id: 'user_management', label: 'Users', icon: Users });
    }
  } else {
    const adminOnly = ['user_management', 'database_setup'];
    const filtered = menuItems.filter(item => !adminOnly.includes(item.id));
    menuItems.length = 0;
    menuItems.push(...filtered);
  }

  // Define main items for bottom nav (max 4)
  const mainMobileItems = menuItems.slice(0, 4);
  const moreMobileItems = menuItems.slice(4);

  useEffect(() => {
    fetchNotifications();
    
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchNotifications = async () => {
    try {
      const { data: items, error: itemsError } = await supabase.from('items').select('id, name, unit, min_stock, current_stock');
      if (itemsError) throw itemsError;

      const lowStockItems = items?.filter(item => (item.current_stock ?? 0) <= (item.min_stock ?? 0))
        .map(item => ({
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
    await signOut();
  };

  const handleSetView = (view: string) => {
    setView(view);
    setIsMoreMenuOpen(false);
    setIsMobileSearchOpen(false);
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

        <div className="p-3 space-y-1 border-t border-brand-border">
          <button 
            onClick={() => handleSetView('purchase_orders')}
            className="w-full bg-brand-accent hover:bg-blue-600 text-white font-bold py-2.5 rounded-xl transition-all mb-3 shadow-lg shadow-brand-accent/20 flex items-center justify-center gap-2 text-sm"
          >
            <ShoppingCart className="w-4 h-4" />
            Buat Purchase Order
          </button>
          
          <button 
            onClick={() => handleSetView('settings')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-2 rounded-xl transition-all text-sm",
              currentView === 'settings' ? "text-white bg-brand-card" : "text-brand-text-muted hover:text-white"
            )}
          >
            <Settings className="w-4 h-4" />
            <span>Settings</span>
          </button>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2 text-brand-text-muted hover:text-red-400 transition-all text-sm"
          >
            <LogOut className="w-4 h-4" />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 md:h-16 border-b border-brand-border flex items-center justify-between px-3 md:px-8 bg-brand-dark/50 backdrop-blur-md z-10">
          <div className="flex items-center gap-2 md:gap-4 flex-1">
            <div className={cn(
              "relative md:block flex-1 max-w-md transition-all duration-300",
              isMobileSearchOpen ? "flex" : "hidden md:flex"
            )}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted" />
              <input 
                type="text" 
                placeholder={`Cari di ${currentView}...`} 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 bg-brand-card/50 border border-brand-border/50 py-1.5 md:py-2 rounded-lg text-white focus:ring-1 focus:ring-brand-accent outline-none transition-all text-xs md:text-sm"
                autoFocus={isMobileSearchOpen}
              />
              {isMobileSearchOpen && (
                <button 
                  onClick={() => setIsMobileSearchOpen(false)}
                  className="ml-2 p-2 md:hidden text-brand-text-muted"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
            
            {!isMobileSearchOpen && (
              <button 
                onClick={() => setIsMobileSearchOpen(true)}
                className="md:hidden p-2 text-brand-text-muted hover:text-white"
              >
                <Search className="w-5 h-5" />
              </button>
            )}

            {!isMobileSearchOpen && (
              <div className="md:hidden">
                <h1 className="text-sm font-bold text-white truncate max-w-[120px]">Hotel Alia</h1>
              </div>
            )}
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
                  {profile?.full_name || user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'User'}
                </p>
                <p className="text-xs text-brand-text-muted uppercase tracking-wider">
                  {profile?.role === 'admin' ? 'Administrator' : 'Staff Gudang'}
                </p>
              </div>
              <button 
                onClick={() => handleSetView('settings')}
                className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-brand-accent flex items-center justify-center overflow-hidden border-2 border-transparent hover:border-brand-accent transition-all"
              >
                {profile?.avatar_url || user?.user_metadata?.avatar_url ? (
                  <img 
                    src={profile?.avatar_url || user?.user_metadata?.avatar_url} 
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
          {mainMobileItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleSetView(item.id)}
              className={cn(
                "flex flex-col items-center gap-1 transition-all px-2 min-w-[60px]",
                currentView === item.id ? "text-brand-accent" : "text-brand-text-muted"
              )}
            >
              <item.icon className={cn("w-6 h-6", currentView === item.id && "animate-in zoom-in duration-300")} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          ))}
          
          <div className="relative" ref={moreMenuRef}>
            <button
              onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
              className={cn(
                "flex flex-col items-center gap-1 transition-all px-2 min-w-[60px]",
                isMoreMenuOpen ? "text-brand-accent" : "text-brand-text-muted"
              )}
            >
              <Menu className={cn("w-6 h-6", isMoreMenuOpen && "animate-in zoom-in duration-300")} />
              <span className="text-[10px] font-medium">Menu</span>
            </button>

            {isMoreMenuOpen && (
              <div className="absolute bottom-full right-0 mb-4 w-48 bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
                <div className="p-2 space-y-1">
                  {moreMobileItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleSetView(item.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm",
                        currentView === item.id ? "bg-brand-accent text-white" : "text-brand-text-muted hover:bg-brand-dark hover:text-white"
                      )}
                    >
                      <item.icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </button>
                  ))}
                  <div className="h-px bg-brand-border my-1" />
                  <button
                    onClick={() => handleSetView('settings')}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm",
                      currentView === 'settings' ? "bg-brand-accent text-white" : "text-brand-text-muted hover:bg-brand-dark hover:text-white"
                    )}
                  >
                    <Settings className="w-4 h-4" />
                    <span>Settings</span>
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm text-red-400 hover:bg-red-400/10"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Keluar</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </nav>
      </main>
    </div>
  );
}
