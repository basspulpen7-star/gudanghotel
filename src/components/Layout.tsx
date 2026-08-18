import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  ArrowDownCircle, 
  ArrowUpCircle, 
  ClipboardList,
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
  Database,
  Building2
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
  const { signOut, isAdmin, isHK } = useAuth();
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const notificationRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Check if current user is HK
  const isHKUser = isHK || profile?.role === 'hk' || user?.user_metadata?.role === 'hk';

  let menuItems: Array<{ id: string; label: string; icon: any }> = [];

  if (isHKUser) {
    // HK only requires Permintaan Barang HK Form
    menuItems = [
      { id: 'housekeeping_request', label: 'Form Permintaan HK', icon: ClipboardList }
    ];
  } else {
    // Default Gudang Alia navigation for Logistik, Staff, and Admin
    menuItems = [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'inventory', label: 'Stok', icon: Package },
      { id: 'incoming', label: 'Masuk', icon: ArrowDownCircle },
      { id: 'outgoing', label: 'Keluar', icon: ArrowUpCircle },
      { id: 'housekeeping_request', label: 'Permintaan Masuk HK', icon: ClipboardList },
      { id: 'purchase_orders', label: 'PO', icon: ShoppingCart },
      { id: 'suppliers', label: 'Supplier', icon: Truck },
      { id: 'reports', label: 'Laporan', icon: FileText },
    ];

    if (isAdmin) {
      menuItems.push({ id: 'database_setup', label: 'DB Setup', icon: Database });
      menuItems.push({ id: 'user_management', label: 'Users', icon: Users });
    }
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
    } catch (error: any) {
      console.warn('Notice fetching notifications:', error?.message || error);
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

  if (isHKUser) {
    return (
      <div className="min-h-screen bg-[#f7f8fa] text-gray-900 flex flex-col font-sans">
        {/* Top Header matching the screenshot */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-200/80 px-4 md:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 flex items-center justify-center">
              <img src="/alia-logo.png" alt="Hotel Alia Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold text-amber-600 tracking-wider uppercase block leading-none">
                HOTEL ALIA
              </span>
              <h1 className="text-base md:text-lg font-bold text-gray-900 leading-tight">
                Form Permintaan Barang
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs md:text-sm font-bold text-gray-800">
              HK • {profile?.full_name || user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'hk'}
            </span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar</span>
            </button>
          </div>
        </header>

        {/* View Content */}
        <main className="flex-1 p-4 md:p-6 max-w-4xl w-full mx-auto pb-16">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#F7F8FA] text-gray-900 overflow-hidden font-sans">
      {/* Sidebar - Hidden on mobile, shown on desktop */}
      <aside className={cn(
        "hidden lg:flex w-64 border-r border-gray-200/90 flex-col bg-white z-50 transition-transform duration-300 relative translate-x-0 shadow-[2px_0_10px_rgba(0,0,0,0.02)] no-print"
      )}>
        <div className="p-5 flex justify-between items-center border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 flex items-center justify-center">
              <img src="/alia-logo.png" alt="Hotel Alia Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold text-amber-600 tracking-wider uppercase block leading-none">
                HOTEL ALIA
              </span>
              <p className="text-sm font-bold text-gray-900 leading-tight">
                {isHKUser ? 'Permintaan Barang' : 'Warehouse System'}
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleSetView(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all text-sm font-semibold",
                currentView === item.id 
                  ? "bg-amber-50 text-amber-800 border-l-4 border-amber-600 rounded-l-none" 
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <item.icon className={cn("w-4 h-4", currentView === item.id ? "text-amber-600" : "text-gray-500")} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-3 space-y-1.5 border-t border-gray-100 bg-gray-50/50">
          {!isHKUser && (
            <>
              <button 
                onClick={() => handleSetView('purchase_orders')}
                className="w-full bg-[#E65C00] hover:bg-[#CF5300] text-white font-bold py-2.5 rounded-xl transition-all mb-2 flex items-center justify-center gap-2 text-xs shadow-sm shadow-orange-500/20"
              >
                <ShoppingCart className="w-4 h-4" />
                Buat Purchase Order
              </button>
              
              <button 
                onClick={() => handleSetView('settings')}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-xs font-semibold",
                  currentView === 'settings' ? "bg-amber-50 text-amber-800 font-bold" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                )}
              >
                <Settings className="w-4 h-4 text-gray-500" />
                <span>Pengaturan</span>
              </button>
            </>
          )}

          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all text-xs font-semibold"
          >
            <LogOut className="w-4 h-4" />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden bg-[#F7F8FA]">
        {/* Header */}
        <header className="h-14 md:h-16 border-b border-gray-200/80 flex items-center justify-between px-4 md:px-8 bg-white/90 backdrop-blur-md z-10 no-print">
          <div className="flex items-center gap-2 md:gap-4 flex-1">
            {isHKUser ? (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 flex items-center justify-center">
                  <img src="/alia-logo.png" alt="Hotel Alia Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                </div>
                <div>
                  <h1 className="text-xs font-bold text-gray-900">HOTEL ALIA</h1>
                  <p className="text-[10px] text-amber-600 font-semibold">Permintaan Barang HK</p>
                </div>
              </div>
            ) : (
              <>
                <div className={cn(
                  "relative md:block flex-1 max-w-md transition-all duration-300",
                  isMobileSearchOpen ? "flex" : "hidden md:flex"
                )}>
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input 
                    type="text" 
                    placeholder={`Cari di ${currentView}...`} 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 bg-gray-50/80 border border-gray-200 py-1.5 md:py-2 rounded-xl text-gray-900 focus:bg-white focus:border-[#E65C00] focus:ring-1 focus:ring-[#E65C00] outline-none transition-all text-xs md:text-sm"
                    autoFocus={isMobileSearchOpen}
                  />
                  {isMobileSearchOpen && (
                    <button 
                      onClick={() => setIsMobileSearchOpen(false)}
                      className="ml-2 p-2 md:hidden text-gray-500"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>
                
                {!isMobileSearchOpen && (
                  <button 
                    onClick={() => setIsMobileSearchOpen(true)}
                    className="md:hidden p-2 text-gray-600 hover:text-gray-900"
                  >
                    <Search className="w-5 h-5" />
                  </button>
                )}

                {!isMobileSearchOpen && (
                  <div className="md:hidden">
                    <h1 className="text-sm font-bold text-gray-900 truncate max-w-[140px]">Hotel Alia</h1>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-3 md:gap-5">
            {!isHKUser && (
              <div className="relative" ref={notificationRef}>
                <button 
                  onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                  className="relative text-gray-600 hover:text-gray-900 p-2 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  <Bell className="w-5 h-5" />
                  {notifications.length > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white text-[9px] flex items-center justify-center text-white font-bold">
                      {notifications.length}
                    </span>
                  )}
                </button>

                {isNotificationsOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-2xl shadow-xl z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-3.5 border-b border-gray-100 flex justify-between items-center">
                      <h3 className="font-bold text-sm text-gray-900">Notifikasi</h3>
                      <span className="text-xs text-gray-500 font-medium">{notifications.length} Baru</span>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length > 0 ? (
                        notifications.map((notif, idx) => (
                          <div key={idx} className="p-3.5 border-b border-gray-100 hover:bg-gray-50 transition-colors flex gap-3">
                            <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-gray-900">{notif.title}</p>
                              <p className="text-[11px] text-gray-600">{notif.message}</p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-6 text-center">
                          <Bell className="w-6 h-6 text-gray-400 mx-auto mb-2 opacity-30" />
                          <p className="text-xs text-gray-500">Tidak ada notifikasi baru</p>
                        </div>
                      )}
                    </div>
                    {notifications.length > 0 && (
                      <button 
                        onClick={() => handleSetView('inventory')}
                        className="w-full p-2.5 text-xs text-amber-700 font-bold hover:bg-amber-50 transition-colors rounded-b-2xl border-t border-gray-100"
                      >
                        Lihat Semua Stok
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            
            <div className="flex items-center gap-3 pl-3 md:pl-5 border-l border-gray-200">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-gray-900 truncate max-w-[150px]">
                  {profile?.full_name || user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'User'}
                </p>
                <p className="text-[10px] text-amber-700 font-bold uppercase tracking-wider">
                  {profile?.role === 'admin' ? 'Administrator' : isHKUser ? 'Housekeeping' : profile?.role === 'logistik' ? 'Logistik' : 'Staff Gudang'}
                </p>
              </div>

              {isHKUser ? (
                <button
                  onClick={handleLogout}
                  title="Keluar"
                  className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Keluar</span>
                </button>
              ) : (
                <button 
                  onClick={() => handleSetView('settings')}
                  className="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center overflow-hidden hover:border-amber-400 transition-all shadow-sm"
                >
                  {profile?.avatar_url || user?.user_metadata?.avatar_url ? (
                    <img 
                      src={profile?.avatar_url || user?.user_metadata?.avatar_url} 
                      alt="Profile" 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <User className="w-4 h-4 text-amber-700" />
                  )}
                </button>
              )}
            </div>
          </div>
        </header>

        {/* View Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 lg:pb-8">
          {children}
        </div>

        {/* Mobile Bottom Navigation */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-lg border-t border-gray-200 flex justify-around items-center px-2 py-2.5 z-30 shadow-[0_-2px_10px_rgba(0,0,0,0.03)] no-print">
          {isHKUser ? (
            <>
              <button
                onClick={() => handleSetView('housekeeping_request')}
                className="flex flex-col items-center gap-1 transition-all px-4 py-1 text-amber-600 font-bold"
              >
                <ClipboardList className="w-5 h-5" />
                <span className="text-[11px]">Permintaan Barang HK</span>
              </button>
              <button
                onClick={handleLogout}
                className="flex flex-col items-center gap-1 transition-all px-4 py-1 text-gray-500 hover:text-red-600"
              >
                <LogOut className="w-5 h-5" />
                <span className="text-[11px] font-semibold">Keluar</span>
              </button>
            </>
          ) : (
            <>
              {mainMobileItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSetView(item.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 transition-all px-2 min-w-[60px]",
                    currentView === item.id ? "text-amber-600 font-bold" : "text-gray-500"
                  )}
                >
                  <item.icon className={cn("w-5 h-5", currentView === item.id && "scale-110 transition-transform")} />
                  <span className="text-[10px]">{item.label}</span>
                </button>
              ))}
              
              <div className="relative" ref={moreMenuRef}>
                <button
                  onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
                  className={cn(
                    "flex flex-col items-center gap-1 transition-all px-2 min-w-[60px]",
                    isMoreMenuOpen ? "text-amber-600 font-bold" : "text-gray-500"
                  )}
                >
                  <Menu className={cn("w-5 h-5", isMoreMenuOpen && "scale-110 transition-transform")} />
                  <span className="text-[10px]">Menu</span>
                </button>

                {isMoreMenuOpen && (
                  <div className="absolute bottom-full right-0 mb-3 w-48 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
                    <div className="p-2 space-y-1">
                      {moreMobileItems.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => handleSetView(item.id)}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-xs font-semibold",
                            currentView === item.id ? "bg-amber-50 text-amber-800" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                          )}
                        >
                          <item.icon className="w-4 h-4" />
                          <span>{item.label}</span>
                        </button>
                      ))}
                      <div className="h-px bg-gray-100 my-1" />
                      <button
                        onClick={() => handleSetView('settings')}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-xs font-semibold",
                          currentView === 'settings' ? "bg-amber-50 text-amber-800" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                        )}
                      >
                        <Settings className="w-4 h-4" />
                        <span>Pengaturan</span>
                      </button>
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Keluar</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </nav>
      </main>
    </div>
  );
}
