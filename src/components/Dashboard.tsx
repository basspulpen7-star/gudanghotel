import React, { useState, useEffect, useCallback } from 'react';
import { 
  AlertTriangle, 
  Package, 
  ArrowRight, 
  Activity, 
  ArrowDownCircle, 
  ArrowUpCircle, 
  Plus, 
  Minus, 
  CheckCircle2, 
  Layers 
} from 'lucide-react';
import { inventoryService } from '../services/inventoryService';
import { Item, Transaction } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '../lib/utils';

interface DashboardProps {
  user: any;
  profile: any;
  onNavigate: (view: string, subMode?: string) => void;
}

export function Dashboard({ user, profile, onNavigate }: DashboardProps) {
  const [kpis, setKpis] = useState({
    totalItems: 0,
    lowStockCount: 0,
    todayInQty: 0,
    todayOutQty: 0
  });
  const [lowStockItems, setLowStockItems] = useState<Partial<Item>[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Time greeting based on current hour
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 11) return 'Selamat Pagi';
    if (hour < 15) return 'Selamat Siang';
    if (hour < 18) return 'Selamat Sore';
    return 'Selamat Malam';
  };

  const fetchDashboardData = useCallback(async () => {
    // Battery Drain Guard: pause fetch if page is backgrounded
    if (document.visibilityState === 'hidden') return;

    setLoading(true);
    try {
      const summary = await inventoryService.getDashboardSummary(5, 5);
      setKpis(summary.kpis);
      setLowStockItems(summary.lowStockItems);
      setRecentTransactions(summary.recentTransactions);
    } catch (error: any) {
      console.warn('[DASHBOARD FETCH NOTICE]:', error?.message || error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();

    // Listen for visibility change to avoid polling in background
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchDashboardData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchDashboardData]);

  const userName = profile?.full_name || user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Staff';

  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in duration-300 pb-20 md:pb-6 font-sans">
      {/* Header & Greeting */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#252B34] p-4 md:p-6 rounded-2xl border border-[#343B46] shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#1D2128] border border-[#343B46] p-2 flex items-center justify-center shrink-0 shadow-inner">
            <img src="/alia-logo.png" alt="Hotel Alia Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold text-[#F1F3F5] flex items-center gap-2">
              <span>{getGreeting()}, {userName}!</span>
            </h1>
            <p className="text-xs md:text-sm text-[#8E99A6] mt-0.5 font-medium">
              Berikut kondisi gudang Hotel Alia Matraman hari ini.
            </p>
          </div>
        </div>
        <button 
          onClick={fetchDashboardData}
          className="flex items-center gap-2 bg-[#2A303A] hover:bg-[#343D49] text-[#D8DEE6] hover:text-[#F1F3F5] px-3.5 py-2 rounded-xl border border-[#3A424D] text-xs font-bold transition-all self-end sm:self-auto shadow-sm cursor-pointer"
        >
          <Activity className={cn("w-4 h-4", loading && "animate-spin text-[#C89B3C]")} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Quick Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={() => onNavigate('incoming')}
          className="bg-[#252B34] hover:bg-[#2C333E] border border-[#343B46] hover:border-[#55B685]/50 p-4 rounded-2xl flex items-center justify-between transition-all group active:scale-[0.99] shadow-[0_4px_20px_rgba(0,0,0,0.18)] cursor-pointer text-left"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-[#55B685]/10 border border-[#55B685]/30 flex items-center justify-center text-[#55B685] group-hover:scale-105 transition-transform shadow-xs">
              <Plus className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#F1F3F5]">+ Barang Masuk</p>
              <p className="text-xs text-[#8E99A6] font-medium">Input stok dari vendor / supplier</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-[#6F7985] group-hover:text-[#F1F3F5] group-hover:translate-x-1 transition-all hidden sm:block" />
        </button>

        <button
          onClick={() => onNavigate('outgoing')}
          className="bg-[#252B34] hover:bg-[#2C333E] border border-[#343B46] hover:border-[#C89B3C]/50 p-4 rounded-2xl flex items-center justify-between transition-all group active:scale-[0.99] shadow-[0_4px_20px_rgba(0,0,0,0.18)] cursor-pointer text-left"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-[#C89B3C]/10 border border-[#C89B3C]/30 flex items-center justify-center text-[#E0B85A] group-hover:scale-105 transition-transform shadow-xs">
              <Minus className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#F1F3F5]">- Barang Keluar</p>
              <p className="text-xs text-[#8E99A6] font-medium">Distribusi ke Housekeeping & Departemen</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-[#6F7985] group-hover:text-[#F1F3F5] group-hover:translate-x-1 transition-all hidden sm:block" />
        </button>
      </div>

      {/* 4 Compact KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* KPI 1: Low Stock */}
        <div 
          onClick={() => onNavigate('inventory')}
          className="bg-[#252B34] p-4 rounded-2xl border border-[#343B46] hover:border-[#E5A138]/60 cursor-pointer transition-all shadow-[0_4px_20px_rgba(0,0,0,0.18)] group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-[#8E99A6] uppercase tracking-wider">Stok Menipis</span>
            <div className="w-7 h-7 rounded-lg bg-[#E5A138]/10 border border-[#E5A138]/25 flex items-center justify-center text-[#E5A138]">
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={cn("text-2xl font-black", kpis.lowStockCount > 0 ? "text-[#E5A138]" : "text-[#F1F3F5]")}>
              {kpis.lowStockCount}
            </span>
            <span className="text-xs font-semibold text-[#8E99A6]">Item</span>
          </div>
        </div>

        {/* KPI 2: Today Incoming */}
        <div 
          onClick={() => onNavigate('incoming')}
          className="bg-[#252B34] p-4 rounded-2xl border border-[#343B46] hover:border-[#55B685]/60 cursor-pointer transition-all shadow-[0_4px_20px_rgba(0,0,0,0.18)] group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-[#8E99A6] uppercase tracking-wider">Barang Masuk</span>
            <div className="w-7 h-7 rounded-lg bg-[#55B685]/10 border border-[#55B685]/25 flex items-center justify-center text-[#55B685]">
              <ArrowDownCircle className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-[#55B685]">{kpis.todayInQty}</span>
            <span className="text-xs font-semibold text-[#8E99A6]">Pcs hari ini</span>
          </div>
        </div>

        {/* KPI 3: Today Outgoing */}
        <div 
          onClick={() => onNavigate('outgoing')}
          className="bg-[#252B34] p-4 rounded-2xl border border-[#343B46] hover:border-[#9B7EDB]/60 cursor-pointer transition-all shadow-[0_4px_20px_rgba(0,0,0,0.18)] group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-[#8E99A6] uppercase tracking-wider">Barang Keluar</span>
            <div className="w-7 h-7 rounded-lg bg-[#9B7EDB]/10 border border-[#9B7EDB]/25 flex items-center justify-center text-[#9B7EDB]">
              <ArrowUpCircle className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-[#9B7EDB]">{kpis.todayOutQty}</span>
            <span className="text-xs font-semibold text-[#8E99A6]">Pcs hari ini</span>
          </div>
        </div>

        {/* KPI 4: Total SKU */}
        <div 
          onClick={() => onNavigate('inventory')}
          className="bg-[#252B34] p-4 rounded-2xl border border-[#343B46] hover:border-[#6D9EEB]/60 cursor-pointer transition-all shadow-[0_4px_20px_rgba(0,0,0,0.18)] group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-[#8E99A6] uppercase tracking-wider">Total Barang</span>
            <div className="w-7 h-7 rounded-lg bg-[#6D9EEB]/10 border border-[#6D9EEB]/25 flex items-center justify-center text-[#6D9EEB]">
              <Layers className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-[#F1F3F5]">{kpis.totalItems}</span>
            <span className="text-xs font-semibold text-[#8E99A6]">SKU aktif</span>
          </div>
        </div>
      </div>

      {/* Main Content Grid: Low Stock Alert & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Stok Perlu Perhatian */}
        <div className="bg-[#252B34] p-4 md:p-5 rounded-2xl border border-[#343B46] shadow-[0_4px_20px_rgba(0,0,0,0.18)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#E5A138]/10 border border-[#E5A138]/25 flex items-center justify-center text-[#E5A138]">
                  <AlertTriangle className="w-3.5 h-3.5" />
                </div>
                <h2 className="text-sm md:text-base font-bold text-[#F1F3F5]">Stok Perlu Perhatian</h2>
              </div>
              <button 
                onClick={() => onNavigate('inventory')}
                className="text-xs font-bold text-[#E6B85C] hover:text-[#E0B85A] flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span>Lihat Stok</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-[#8E99A6] animate-pulse font-medium">Memuat data stok...</div>
            ) : lowStockItems.length === 0 ? (
              <div className="py-8 text-center flex flex-col items-center justify-center text-[#55B685] gap-2 bg-[#55B685]/10 rounded-xl border border-[#55B685]/25">
                <CheckCircle2 className="w-7 h-7 text-[#55B685]" />
                <p className="text-xs font-bold">Semua stok aman!</p>
                <p className="text-[11px] text-[#8E99A6]">Tidak ada barang yang menyentuh batas minimum.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {lowStockItems.map((item) => (
                  <div 
                    key={item.id}
                    onClick={() => onNavigate('inventory')}
                    className="p-3 bg-[#242A33] hover:bg-[#2C333E] rounded-xl border border-[#353D47] flex items-center justify-between cursor-pointer transition-all"
                  >
                    <div>
                      <p className="text-xs md:text-sm font-bold text-[#F1F3F5]">{item.name}</p>
                      <p className="text-[10px] text-[#8E99A6] font-medium">{item.department || 'General'}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-xs font-black text-[#E5A138]">{item.current_stock} {item.unit}</span>
                        <p className="text-[9px] text-[#6F7985] font-medium">Min: {item.min_stock}</p>
                      </div>
                      <span className="px-2 py-0.5 bg-[#E5A138]/15 text-[#E5A138] border border-[#E5A138]/30 text-[9px] font-black rounded-md uppercase">
                        MENIPIS
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Aktivitas Terbaru */}
        <div className="bg-[#252B34] p-4 md:p-5 rounded-2xl border border-[#343B46] shadow-[0_4px_20px_rgba(0,0,0,0.18)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#6D9EEB]/10 border border-[#6D9EEB]/25 flex items-center justify-center text-[#6D9EEB]">
                  <Activity className="w-3.5 h-3.5" />
                </div>
                <h2 className="text-sm md:text-base font-bold text-[#F1F3F5]">Aktivitas Terbaru</h2>
              </div>
              <button 
                onClick={() => onNavigate('incoming')}
                className="text-xs font-bold text-[#E6B85C] hover:text-[#E0B85A] flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span>Lihat Semua</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-[#8E99A6] animate-pulse font-medium">Memuat aktivitas...</div>
            ) : recentTransactions.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#8E99A6] italic">Belum ada transaksi recorded.</div>
            ) : (
              <div className="space-y-2.5">
                {recentTransactions.map((tx) => (
                  <div 
                    key={tx.id}
                    className="p-3 bg-[#242A33] hover:bg-[#2C333E] rounded-xl border border-[#353D47] flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border",
                        tx.type === 'IN' 
                          ? "bg-[#55B685]/10 border-[#55B685]/30 text-[#55B685]" 
                          : "bg-[#9B7EDB]/10 border-[#9B7EDB]/30 text-[#9B7EDB]"
                      )}>
                        {tx.type === 'IN' ? <ArrowDownCircle className="w-4 h-4" /> : <ArrowUpCircle className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[#F1F3F5] line-clamp-1">
                          {tx.items?.name || 'Barang'}
                        </p>
                        <p className="text-[10px] text-[#8E99A6] font-medium">
                          {tx.department || 'General'} • {formatDistanceToNow(new Date(tx.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <span className={cn(
                      "text-xs font-extrabold shrink-0 ml-2",
                      tx.type === 'IN' ? "text-[#55B685]" : "text-[#9B7EDB]"
                    )}>
                      {tx.type === 'IN' ? '+' : '-'}{tx.quantity} {tx.items?.unit || 'pcs'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
