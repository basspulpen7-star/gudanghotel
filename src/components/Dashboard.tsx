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
import { transactionService } from '../services/transactionService';
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
      const [kpiData, lowStockData, txData] = await Promise.all([
        inventoryService.getDashboardKPIs(),
        inventoryService.getLowStockItems(5),
        transactionService.getTransactions({ page: 1, limit: 5 })
      ]);

      setKpis(kpiData);
      setLowStockItems(lowStockData);
      setRecentTransactions(txData.data);
    } catch (error) {
      console.error('[DASHBOARD FETCH ERROR]:', error);
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
    <div className="space-y-4 md:space-y-6 animate-in fade-in duration-300 pb-20 md:pb-6">
      {/* Header & Greeting */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-brand-card p-4 md:p-6 rounded-2xl border border-brand-border">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold text-white flex items-center gap-2">
            <span>{getGreeting()}, {userName}!</span>
          </h1>
          <p className="text-xs md:text-sm text-brand-text-muted mt-1">
            Berikut kondisi gudang Hotel Alia Matraman hari ini.
          </p>
        </div>
        <button 
          onClick={fetchDashboardData}
          className="flex items-center gap-2 bg-brand-dark/80 hover:bg-brand-dark text-brand-text-muted hover:text-white px-3 py-2 rounded-xl border border-brand-border text-xs font-semibold transition-all self-end sm:self-auto"
        >
          <Activity className={cn("w-4 h-4", loading && "animate-spin text-brand-accent")} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Quick Action Buttons (Primary CTAs for mobile & desktop) */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => onNavigate('transactions', 'IN')}
          className="bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 p-4 rounded-2xl flex items-center justify-between transition-all group active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
              <Plus className="w-6 h-6 stroke-[3]" />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-white">+ Barang Masuk</p>
              <p className="text-[10px] text-emerald-400/80">Input stok dari vendor</p>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-emerald-400 opacity-60 group-hover:translate-x-1 transition-transform hidden sm:block" />
        </button>

        <button
          onClick={() => onNavigate('transactions', 'OUT')}
          className="bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-400 p-4 rounded-2xl flex items-center justify-between transition-all group active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
              <Minus className="w-6 h-6 stroke-[3]" />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-white">- Barang Keluar</p>
              <p className="text-[10px] text-purple-400/80">Distribusi ke departemen</p>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-purple-400 opacity-60 group-hover:translate-x-1 transition-transform hidden sm:block" />
        </button>
      </div>

      {/* 4 Compact KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* KPI 1: Low Stock */}
        <div 
          onClick={() => onNavigate('inventory')}
          className="bg-brand-card p-4 rounded-2xl border border-brand-border hover:border-amber-500/50 cursor-pointer transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-brand-text-muted uppercase tracking-wider">Stok Menipis</span>
            <AlertTriangle className={cn("w-4 h-4", kpis.lowStockCount > 0 ? "text-amber-500" : "text-brand-text-muted")} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className={cn("text-2xl font-black", kpis.lowStockCount > 0 ? "text-amber-400" : "text-white")}>
              {kpis.lowStockCount}
            </span>
            <span className="text-xs text-brand-text-muted">Item</span>
          </div>
        </div>

        {/* KPI 2: Today Incoming */}
        <div 
          onClick={() => onNavigate('transactions', 'IN')}
          className="bg-brand-card p-4 rounded-2xl border border-brand-border hover:border-emerald-500/50 cursor-pointer transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-brand-text-muted uppercase tracking-wider">Barang Masuk</span>
            <ArrowDownCircle className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-400">{kpis.todayInQty}</span>
            <span className="text-xs text-brand-text-muted">Pcs hari ini</span>
          </div>
        </div>

        {/* KPI 3: Today Outgoing */}
        <div 
          onClick={() => onNavigate('transactions', 'OUT')}
          className="bg-brand-card p-4 rounded-2xl border border-brand-border hover:border-purple-500/50 cursor-pointer transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-brand-text-muted uppercase tracking-wider">Barang Keluar</span>
            <ArrowUpCircle className="w-4 h-4 text-purple-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-purple-400">{kpis.todayOutQty}</span>
            <span className="text-xs text-brand-text-muted">Pcs hari ini</span>
          </div>
        </div>

        {/* KPI 4: Total SKU */}
        <div 
          onClick={() => onNavigate('inventory')}
          className="bg-brand-card p-4 rounded-2xl border border-brand-border hover:border-blue-500/50 cursor-pointer transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-brand-text-muted uppercase tracking-wider">Total Barang</span>
            <Layers className="w-4 h-4 text-blue-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">{kpis.totalItems}</span>
            <span className="text-xs text-brand-text-muted">SKU aktif</span>
          </div>
        </div>
      </div>

      {/* Main Content Grid: Low Stock Alert & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Stok Perlu Perhatian */}
        <div className="bg-brand-card p-4 md:p-5 rounded-2xl border border-brand-border flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <h2 className="text-sm md:text-base font-bold text-white">Stok Perlu Perhatian</h2>
              </div>
              <button 
                onClick={() => onNavigate('inventory')}
                className="text-xs font-bold text-brand-accent hover:underline flex items-center gap-1"
              >
                <span>Lihat Stok</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-brand-text-muted animate-pulse">Memuat data stok...</div>
            ) : lowStockItems.length === 0 ? (
              <div className="py-8 text-center flex flex-col items-center justify-center text-emerald-400 gap-2 bg-emerald-500/5 rounded-xl border border-emerald-500/20">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                <p className="text-xs font-bold">Semua stok aman!</p>
                <p className="text-[10px] text-brand-text-muted">Tidak ada barang yang menyentuh batas minimum.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {lowStockItems.map((item) => (
                  <div 
                    key={item.id}
                    onClick={() => onNavigate('inventory')}
                    className="p-3 bg-brand-dark/60 hover:bg-brand-dark rounded-xl border border-brand-border flex items-center justify-between cursor-pointer transition-all"
                  >
                    <div>
                      <p className="text-xs md:text-sm font-bold text-white">{item.name}</p>
                      <p className="text-[10px] text-brand-text-muted">{item.department || 'General'}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-xs font-black text-amber-400">{item.current_stock} {item.unit}</span>
                        <p className="text-[9px] text-brand-text-muted">Min: {item.min_stock}</p>
                      </div>
                      <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[9px] font-black rounded-md uppercase">
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
        <div className="bg-brand-card p-4 md:p-5 rounded-2xl border border-brand-border flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-brand-accent" />
                <h2 className="text-sm md:text-base font-bold text-white">Aktivitas Terbaru</h2>
              </div>
              <button 
                onClick={() => onNavigate('transactions')}
                className="text-xs font-bold text-brand-accent hover:underline flex items-center gap-1"
              >
                <span>Lihat Semua</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-brand-text-muted animate-pulse">Memuat aktivitas...</div>
            ) : recentTransactions.length === 0 ? (
              <div className="py-8 text-center text-xs text-brand-text-muted italic">Belum ada transaksi recorded.</div>
            ) : (
              <div className="space-y-2.5">
                {recentTransactions.map((tx) => (
                  <div 
                    key={tx.id}
                    className="p-3 bg-brand-dark/60 rounded-xl border border-brand-border flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                        tx.type === 'IN' ? "bg-emerald-500/20 text-emerald-400" : "bg-purple-500/20 text-purple-400"
                      )}>
                        {tx.type === 'IN' ? <ArrowDownCircle className="w-4 h-4" /> : <ArrowUpCircle className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white line-clamp-1">
                          {tx.items?.name || 'Barang'}
                        </p>
                        <p className="text-[10px] text-brand-text-muted">
                          {tx.department || 'General'} • {formatDistanceToNow(new Date(tx.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <span className={cn(
                      "text-xs font-extrabold shrink-0 ml-2",
                      tx.type === 'IN' ? "text-emerald-400" : "text-purple-400"
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
