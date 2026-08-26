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
  Building2,
  UtensilsCrossed,
  ShoppingBag,
  Clock
} from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { inventoryService } from '../services/inventoryService';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { WifiOff } from 'lucide-react';

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
  const { signOut, isAdmin, isHK, isResto } = useAuth();
  const { isOnline } = useNetworkStatus();
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const notificationRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Check if current user is HK or Resto
  const isHKUser = isHK || profile?.role === 'hk' || user?.user_metadata?.role === 'hk';
  const isRestoUser = isResto || profile?.role === 'resto' || user?.user_metadata?.role === 'resto';

  let menuItems: Array<{ id: string; label: string; icon: any }> = [];

  if (isHKUser) {
    // HK only requires Permintaan Barang HK Form
    menuItems = [
      { id: 'housekeeping_request', label: 'Form Permintaan HK', icon: ClipboardList }
    ];
  } else if (isRestoUser) {
    // Resto user navigation
    menuItems = [
      { id: 'resto_take', label: 'Ambil Barang Resto', icon: UtensilsCrossed },
      { id: 'resto_history', label: 'Riwayat Pengambilan', icon: Clock },
      { id: 'resto_reports', label: 'Laporan Resto', icon: FileText }
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
      { id: 'resto_reports', label: 'Laporan Resto', icon: UtensilsCrossed },
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
      const lowStockItems = await inventoryService.getLowStockNotifications();
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
      <div className="min-h-screen bg-[#171A1F] text-[#F1F3F5] flex flex-col font-sans">
        {/* Top Header matching the screenshot */}
        <header className="sticky top-0 z-30 bg-[#1D2128]/95 backdrop-blur-md border-b border-[#303640] px-4 md:px-8 py-3.5 flex items-center justify-between shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 flex items-center justify-center">
              <img src="/alia-logo.png" alt="Hotel Alia Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold text-[#C89B3C] tracking-wider uppercase block leading-none">
                HOTEL ALIA
              </span>
              <h1 className="text-base md:text-lg font-bold text-[#F1F3F5] leading-tight">
                Form Permintaan Barang
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {!isOnline && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#E5A138]/10 border border-[#E5A138]/30 text-[#E5A138] rounded-lg text-xs font-bold animate-pulse">
                <WifiOff className="w-3.5 h-3.5 text-[#E5A138]" />
                Offline
              </span>
            )}
            <span className="text-xs md:text-sm font-bold text-[#C1C7D0]">
              HK • {profile?.full_name || user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'hk'}
            </span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2A303A] border border-[#3A424D] rounded-xl text-xs font-semibold text-[#D8DEE6] hover:bg-[#343D49] hover:text-[#F1F3F5] transition-colors"
            >
              <LogOut className="w-3.5 h-3.5 text-[#E05D52]" />
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

  if (isRestoUser) {
    const restoNavItems = [
      { id: 'resto_take', label: 'Ambil Barang', icon: ShoppingBag },
      { id: 'resto_history', label: 'Riwayat', icon: Clock },
      { id: 'resto_reports', label: 'Laporan', icon: FileText },
      { id: 'settings', label: 'Profil', icon: User },
    ];

    return (
      <div className="min-h-screen bg-[#171A1F] text-[#F1F3F5] flex flex-col font-sans">
        {/* Top Header */}
        <header className="sticky top-0 z-30 bg-[#1D2128]/95 backdrop-blur-md border-b border-[#303640] px-4 md:px-8 py-3 flex items-center justify-between no-print shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 flex items-center justify-center">
              <img src="/alia-logo.png" alt="Hotel Alia Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold text-[#C89B3C] tracking-wider uppercase block leading-none">
                HOTEL ALIA MATRAMAN
              </span>
              <h1 className="text-base font-black text-[#F1F3F5] leading-tight">
                Pengambilan Resto
              </h1>
            </div>
          </div>

          {/* Desktop Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-[#16191E] p-1 rounded-xl border border-[#303640]">
            {restoNavItems.map(item => (
              <button
                key={item.id}
                onClick={() => handleSetView(item.id)}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all",
                  currentView === item.id 
                    ? "bg-[#C89B3C]/15 text-[#E6B85C] border border-[#C89B3C]/30 shadow-xs" 
                    : "text-[#AEB7C2] hover:text-[#F1F3F5] hover:bg-[#252B34]"
                )}
              >
                <item.icon className={cn("w-3.5 h-3.5", currentView === item.id ? "text-[#D9A441]" : "text-[#8B96A3]")} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2.5">
            {!isOnline && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#E5A138]/10 border border-[#E5A138]/30 text-[#E5A138] rounded-lg text-xs font-bold animate-pulse">
                <WifiOff className="w-3.5 h-3.5 text-[#E5A138]" />
                Offline
              </span>
            )}
            <span className="text-xs font-bold text-[#C1C7D0] hidden sm:inline-block">
              Resto • {profile?.full_name || user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'resto'}
            </span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2A303A] border border-[#3A424D] rounded-xl text-xs font-semibold text-[#D8DEE6] hover:bg-[#343D49] hover:text-[#F1F3F5] transition-colors"
              title="Keluar dari Aplikasi"
            >
              <LogOut className="w-3.5 h-3.5 text-[#E05D52]" />
              <span>Keluar</span>
            </button>
          </div>
        </header>

        {/* View Content */}
        <main className="flex-1 p-3.5 md:p-6 max-w-4xl w-full mx-auto pb-20 md:pb-12">
          {children}
        </main>

        {/* Mobile Bottom Navigation Bar */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#1D2128]/95 backdrop-blur-md border-t border-[#303640] px-2 py-1.5 flex items-center justify-around no-print shadow-lg">
          {restoNavItems.map(item => {
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSetView(item.id)}
                className={cn(
                  "flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all min-w-[64px]",
                  isActive ? "text-[#E6B85C] font-extrabold" : "text-[#8B96A3] font-semibold hover:text-[#C1C7D0]"
                )}
              >
                <item.icon className={cn("w-5 h-5 mb-0.5", isActive ? "text-[#D9A441] stroke-[2.5]" : "text-[#8B96A3]")} />
                <span className="text-[10px] leading-none">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#171A1F] text-[#F1F3F5] overflow-hidden font-sans">
      {/* Sidebar - Hidden on mobile, shown on desktop */}
      <aside className={cn(
        "hidden lg:flex w-64 border-r border-[#303640] flex-col bg-[#16191E] z-50 transition-transform duration-300 relative translate-x-0 shadow-[4px_0_24px_rgba(0,0,0,0.25)] no-print"
      )}>
        <div className="p-5 flex justify-between items-center border-b border-[#303640]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 flex items-center justify-center">
              <img src="/alia-logo.png" alt="Hotel Alia Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold text-[#C89B3C] tracking-wider uppercase block leading-none">
                HOTEL ALIA
              </span>
              <p className="text-sm font-bold text-[#F1F3F5] leading-tight">
                {isHKUser ? 'Permintaan Barang' : 'Warehouse System'}
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          {menuItems.map((item) => {
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSetView(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all text-sm font-semibold relative",
                  isActive 
                    ? "bg-[rgba(201,154,52,0.12)] text-[#E6B85C] border-l-[3px] border-[#C89B3C] rounded-l-none" 
                    : "text-[#AEB7C2] hover:bg-[#252B34] hover:text-[#F1F3F5]"
                )}
              >
                <item.icon className={cn("w-4 h-4 transition-colors", isActive ? "text-[#D9A441]" : "text-[#8B96A3]")} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 space-y-1.5 border-t border-[#303640] bg-[#16191E]">
          {!isHKUser && (
            <>
              <button 
                onClick={() => handleSetView('purchase_orders')}
                className="w-full bg-[#C89B3C] hover:bg-[#D6AA4B] text-[#171A1F] font-bold py-2.5 rounded-xl transition-all mb-2 flex items-center justify-center gap-2 text-xs shadow-md shadow-[#C89B3C]/10 cursor-pointer"
              >
                <ShoppingCart className="w-4 h-4 stroke-[2.5]" />
                Buat Purchase Order
              </button>
              
              <button 
                onClick={() => handleSetView('settings')}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-xs font-semibold",
                  currentView === 'settings' ? "bg-[rgba(201,154,52,0.12)] text-[#E6B85C] font-bold" : "text-[#AEB7C2] hover:text-[#F1F3F5] hover:bg-[#252B34]"
                )}
              >
                <Settings className={cn("w-4 h-4", currentView === 'settings' ? "text-[#D9A441]" : "text-[#8B96A3]")} />
                <span>Pengaturan</span>
              </button>
            </>
          )}

          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 text-[#E05D52] hover:text-[#F1F3F5] hover:bg-[#2A303A] rounded-xl transition-all text-xs font-semibold"
          >
            <LogOut className="w-4 h-4 text-[#E05D52]" />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden bg-[#171A1F]">
        {/* Header */}
        <header className="h-14 md:h-16 border-b border-[#303640] flex items-center justify-between px-4 md:px-8 bg-[#1D2128]/95 backdrop-blur-md z-10 no-print shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
          <div className="flex items-center gap-2 md:gap-4 flex-1">
            {isHKUser ? (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 flex items-center justify-center">
                  <img src="/alia-logo.png" alt="Hotel Alia Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                </div>
                <div>
                  <h1 className="text-xs font-bold text-[#F1F3F5]">HOTEL ALIA</h1>
                  <p className="text-[10px] text-[#C89B3C] font-semibold">Permintaan Barang HK</p>
                </div>
              </div>
            ) : (
              <>
                <div className={cn(
                  "relative md:block flex-1 max-w-md transition-all duration-300",
                  isMobileSearchOpen ? "flex" : "hidden md:flex"
                )}>
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7F8A97]" />
                  <input 
                    type="text" 
                    placeholder={`Cari di ${currentView}...`} 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 bg-[#252B34] border border-[#353D48] py-1.5 md:py-2 rounded-xl text-[#E5E9EE] placeholder:text-[#7F8A97] focus:bg-[#2A303A] focus:border-[#C89B3C] focus:ring-1 focus:ring-[#C89B3C] outline-none transition-all text-xs md:text-sm"
                    autoFocus={isMobileSearchOpen}
                  />
                  {isMobileSearchOpen && (
                    <button 
                      onClick={() => setIsMobileSearchOpen(false)}
                      className="ml-2 p-2 md:hidden text-[#AEB7C2]"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>
                
                {!isMobileSearchOpen && (
                  <button 
                    onClick={() => setIsMobileSearchOpen(true)}
                    className="md:hidden p-2 text-[#AEB7C2] hover:text-[#F1F3F5]"
                  >
                    <Search className="w-5 h-5" />
                  </button>
                )}

                {!isMobileSearchOpen && (
                  <div className="md:hidden flex items-center gap-2">
                    <div className="w-6 h-6 flex items-center justify-center">
                      <img src="/alia-logo.png" alt="Hotel Alia Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                    </div>
                    <h1 className="text-sm font-bold text-[#F1F3F5] truncate max-w-[140px]">Hotel Alia</h1>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-3 md:gap-5">
            {!isOnline && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#E5A138]/10 border border-[#E5A138]/30 text-[#E5A138] rounded-xl text-xs font-bold animate-pulse">
                <WifiOff className="w-3.5 h-3.5 text-[#E5A138]" />
                <span className="hidden sm:inline">Koneksi Offline (Cache Aktif)</span>
                <span className="sm:hidden">Offline</span>
              </span>
            )}

            {!isHKUser && (
              <div className="relative" ref={notificationRef}>
                <button 
                  onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                  className="relative text-[#AEB7C2] hover:text-[#F1F3F5] p-2 rounded-xl hover:bg-[#252B34] transition-colors"
                >
                  <Bell className="w-5 h-5" />
                  {notifications.length > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 bg-[#E05D52] rounded-full border-2 border-[#1D2128] text-[9px] flex items-center justify-center text-white font-bold">
                      {notifications.length}
                    </span>
                  )}
                </button>

                {isNotificationsOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-[#252B34] border border-[#343B46] rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.4)] z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-3.5 border-b border-[#343B46] flex justify-between items-center bg-[#1D2128] rounded-t-2xl">
                      <h3 className="font-bold text-sm text-[#F1F3F5]">Notifikasi</h3>
                      <span className="text-xs text-[#C89B3C] font-semibold">{notifications.length} Baru</span>
                    </div>
                    <div className="max-h-80 overflow-y-auto divide-y divide-[#343B46]">
                      {notifications.length > 0 ? (
                        notifications.map((notif, idx) => (
                          <div key={idx} className="p-3.5 hover:bg-[#2C333E] transition-colors flex gap-3">
                            <div className="w-7 h-7 rounded-lg bg-[rgba(201,154,52,0.15)] border border-[#C89B3C]/30 flex items-center justify-center flex-shrink-0">
                              <AlertTriangle className="w-3.5 h-3.5 text-[#E6B85C]" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-[#F1F3F5]">{notif.title}</p>
                              <p className="text-[11px] text-[#AEB7C2]">{notif.message}</p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-6 text-center">
                          <Bell className="w-6 h-6 text-[#6F7985] mx-auto mb-2 opacity-50" />
                          <p className="text-xs text-[#8E99A6]">Tidak ada notifikasi baru</p>
                        </div>
                      )}
                    </div>
                    {notifications.length > 0 && (
                      <button 
                        onClick={() => handleSetView('inventory')}
                        className="w-full p-2.5 text-xs text-[#E6B85C] font-bold hover:bg-[#2A303A] transition-colors rounded-b-2xl border-t border-[#343B46]"
                      >
                        Lihat Semua Stok
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            
            <div className="flex items-center gap-3 pl-3 md:pl-5 border-l border-[#303640]">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-[#F1F3F5] truncate max-w-[150px]">
                  {profile?.full_name || user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'User'}
                </p>
                <p className="text-[10px] text-[#C89B3C] font-bold uppercase tracking-wider">
                  {profile?.role === 'admin' ? 'Administrator' : isHKUser ? 'Housekeeping' : profile?.role === 'logistik' ? 'Logistik' : 'Staff Gudang'}
                </p>
              </div>

              {isHKUser ? (
                <button
                  onClick={handleLogout}
                  title="Keluar"
                  className="px-2.5 py-1.5 bg-[#2A303A] border border-[#3A424D] rounded-xl text-xs font-semibold text-[#D8DEE6] hover:bg-[#343D49] hover:text-[#F1F3F5] transition-colors flex items-center gap-1"
                >
                  <LogOut className="w-3.5 h-3.5 text-[#E05D52]" />
                  <span className="hidden sm:inline">Keluar</span>
                </button>
              ) : (
                <button 
                  onClick={() => handleSetView('settings')}
                  className="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-[#252B34] border border-[#343B46] flex items-center justify-center overflow-hidden hover:border-[#C89B3C] transition-all shadow-sm"
                >
                  {profile?.avatar_url || user?.user_metadata?.avatar_url ? (
                    <img 
                      src={profile?.avatar_url || user?.user_metadata?.avatar_url} 
                      alt="Profile" 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <User className="w-4 h-4 text-[#C89B3C]" />
                  )}
                </button>
              )}
            </div>
          </div>
        </header>

        {/* View Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 lg:pb-8 bg-[#171A1F]">
          {children}
        </div>

        {/* Mobile Bottom Navigation */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#1D2128]/95 backdrop-blur-lg border-t border-[#303640] flex justify-around items-center px-2 py-2.5 z-30 shadow-[0_-4px_20px_rgba(0,0,0,0.3)] no-print">
          {isHKUser ? (
            <>
              <button
                onClick={() => handleSetView('housekeeping_request')}
                className="flex flex-col items-center gap-1 transition-all px-4 py-1 text-[#E6B85C] font-bold"
              >
                <ClipboardList className="w-5 h-5" />
                <span className="text-[11px]">Permintaan Barang HK</span>
              </button>
              <button
                onClick={handleLogout}
                className="flex flex-col items-center gap-1 transition-all px-4 py-1 text-[#8B96A3] hover:text-[#E05D52]"
              >
                <LogOut className="w-5 h-5" />
                <span className="text-[11px] font-semibold">Keluar</span>
              </button>
            </>
          ) : (
            <>
              {mainMobileItems.map((item) => {
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSetView(item.id)}
                    className={cn(
                      "flex flex-col items-center gap-1 transition-all px-2 min-w-[60px]",
                      isActive ? "text-[#E6B85C] font-bold" : "text-[#8B96A3] hover:text-[#AEB7C2]"
                    )}
                  >
                    <item.icon className={cn("w-5 h-5", isActive && "scale-110 text-[#D9A441] transition-transform")} />
                    <span className="text-[10px]">{item.label}</span>
                  </button>
                );
              })}
              
              <div className="relative" ref={moreMenuRef}>
                <button
                  onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
                  className={cn(
                    "flex flex-col items-center gap-1 transition-all px-2 min-w-[60px]",
                    isMoreMenuOpen ? "text-[#E6B85C] font-bold" : "text-[#8B96A3] hover:text-[#AEB7C2]"
                  )}
                >
                  <Menu className={cn("w-5 h-5", isMoreMenuOpen && "scale-110 text-[#D9A441] transition-transform")} />
                  <span className="text-[10px]">Menu</span>
                </button>

                {isMoreMenuOpen && (
                  <div className="absolute bottom-full right-0 mb-3 w-48 bg-[#252B34] border border-[#343B46] rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.4)] overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
                    <div className="p-2 space-y-1">
                      {moreMobileItems.map((item) => {
                        const isActive = currentView === item.id;
                        return (
                          <button
                            key={item.id}
                            onClick={() => handleSetView(item.id)}
                            className={cn(
                              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-xs font-semibold",
                              isActive ? "bg-[rgba(201,154,52,0.15)] text-[#E6B85C]" : "text-[#AEB7C2] hover:bg-[#2A303A] hover:text-[#F1F3F5]"
                            )}
                          >
                            <item.icon className={cn("w-4 h-4", isActive ? "text-[#D9A441]" : "text-[#8B96A3]")} />
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                      <div className="h-px bg-[#343B46] my-1" />
                      <button
                        onClick={() => handleSetView('settings')}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-xs font-semibold",
                          currentView === 'settings' ? "bg-[rgba(201,154,52,0.15)] text-[#E6B85C]" : "text-[#AEB7C2] hover:bg-[#2A303A] hover:text-[#F1F3F5]"
                        )}
                      >
                        <Settings className="w-4 h-4 text-[#8B96A3]" />
                        <span>Pengaturan</span>
                      </button>
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-xs font-semibold text-[#E05D52] hover:bg-[#2A303A]"
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
