import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Package, 
  Clock,
  ArrowRight,
  Activity,
  ArrowDownCircle,
  ArrowUpCircle,
  Layers,
  ShoppingCart
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Item, Transaction } from '../types';
import { formatDistanceToNow, startOfDay, endOfDay } from 'date-fns';
import { cn } from '../lib/utils';

export function Dashboard({ user }: { user: any }) {
  const [items, setItems] = useState<Item[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [todayStats, setTodayStats] = useState({ in: 0, out: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: itemsData, error: itemsError } = await supabase.from('items').select('*');
      if (itemsError) throw itemsError;

      const { data: transData, error: transError } = await supabase
        .from('transactions')
        .select('*, items(*)')
        .order('created_at', { ascending: false })
        .limit(10);
      if (transError) throw transError;

      // Fetch today's stats
      const today = new Date();
      const start = startOfDay(today).toISOString();
      const end = endOfDay(today).toISOString();

      const { data: todayTrans, error: todayError } = await supabase
        .from('transactions')
        .select('type, quantity')
        .gte('created_at', start)
        .lte('created_at', end);
      if (todayError) throw todayError;

      if (itemsData) setItems(itemsData);
      if (transData) setRecentTransactions(transData);
      
      if (todayTrans) {
        const stats = todayTrans.reduce((acc, curr) => {
          if (curr.type === 'IN') acc.in += curr.quantity;
          else acc.out += curr.quantity;
          return acc;
        }, { in: 0, out: 0 });
        setTodayStats(stats);
      }
    } catch (error: any) {
      console.error('Error fetching dashboard data:', error);
      // We don't alert here to avoid spamming the user on every dashboard load, 
      // but we could show an error state in the UI.
    } finally {
      setLoading(false);
    }
  };

  const lowStockItems = items.filter(item => item.current_stock <= item.min_stock);
  const totalStock = items.reduce((acc, item) => acc + item.current_stock, 0);
  const totalItems = items.length;

  const mainStats = [
    { label: 'TOTAL SKU', value: totalItems.toLocaleString(), unit: 'Items', icon: Layers, color: 'text-blue-500' },
    { label: 'TOTAL STOK', value: totalStock.toLocaleString(), unit: 'Pcs', icon: Package, color: 'text-brand-accent' },
    { label: 'STOK RENDAH', value: lowStockItems.length.toLocaleString(), unit: 'Items', icon: AlertTriangle, color: 'text-orange-500' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-accent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500 p-4 md:p-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-white">
            Halo, {user?.user_metadata?.display_name || user?.email?.split('@')[0]}!
          </h2>
          <p className="text-brand-text-muted">Ringkasan operasional Hotel Alia Matraman hari ini</p>
        </div>
        <div className="flex flex-col md:flex-row items-start md:items-center gap-2">
          <button 
            onClick={fetchData}
            className="bg-brand-card hover:bg-brand-border p-2 rounded-lg border border-brand-border text-brand-text-muted transition-all"
            title="Refresh Data"
          >
            <Activity className={cn("w-5 h-5", loading && "animate-spin text-brand-accent")} />
          </button>
          <div className="bg-brand-card px-4 py-2 rounded-lg border border-brand-border text-sm text-brand-text-muted">
            Terakhir diperbarui: {new Date().toLocaleTimeString()}
          </div>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {mainStats.map((stat, i) => (
          <div key={i} className="bg-brand-card p-6 rounded-2xl border border-brand-border hover:border-brand-accent transition-all group">
            <div className="flex justify-between items-start mb-4">
              <p className="text-xs font-bold text-brand-text-muted tracking-wider uppercase">{stat.label}</p>
              <stat.icon className={cn("w-5 h-5 opacity-50 group-hover:opacity-100 transition-opacity", stat.color)} />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl md:text-4xl font-bold text-white">{stat.value}</span>
              <span className="text-brand-text-muted text-sm">{stat.unit}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        {/* Today's Activity Summary */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Daily Distribution */}
          <div className="bg-brand-card p-6 rounded-2xl border border-brand-border flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-purple-500" />
                  <h3 className="font-bold text-white">Barang Keluar Hari Ini</h3>
                </div>
                <span className="text-2xl font-bold text-purple-500">{todayStats.out} <span className="text-sm font-normal text-brand-text-muted">Pcs</span></span>
              </div>
              <p className="text-sm text-brand-text-muted mb-4">Total barang yang didistribusikan ke departemen hari ini.</p>
            </div>
            <div className="pt-4 border-t border-brand-border">
              <div className="flex items-center gap-2 text-xs text-brand-text-muted">
                <Clock className="w-3 h-3" />
                <span>Berdasarkan transaksi hari ini</span>
              </div>
            </div>
          </div>

          {/* Incoming Goods */}
          <div className="bg-brand-card p-6 rounded-2xl border border-brand-border flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-5 h-5 text-blue-500" />
                  <h3 className="font-bold text-white">Barang Masuk Hari Ini</h3>
                </div>
                <span className="text-2xl font-bold text-blue-500">{todayStats.in} <span className="text-sm font-normal text-brand-text-muted">Pcs</span></span>
              </div>
              <p className="text-sm text-brand-text-muted mb-4">Total stok baru yang diterima dari vendor hari ini.</p>
            </div>
            <div className="pt-4 border-t border-brand-border">
              <div className="flex items-center gap-2 text-xs text-brand-text-muted">
                <Clock className="w-3 h-3" />
                <span>Berdasarkan transaksi hari ini</span>
              </div>
            </div>
          </div>

          {/* Low Stock Detailed List */}
          <div className="md:col-span-2 bg-brand-card p-6 rounded-2xl border border-brand-border border-l-4 border-l-orange-500">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
                <h3 className="font-bold text-white">Peringatan Stok Rendah</h3>
              </div>
              <span className="px-2 py-1 bg-orange-500/10 text-orange-500 text-[10px] font-bold rounded uppercase">Perlu Perhatian</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {lowStockItems.length > 0 ? lowStockItems.slice(0, 4).map((item) => (
                <div key={item.id} className="bg-brand-dark/50 p-4 rounded-xl border border-brand-border flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-white text-sm">{item.name}</p>
                    <p className="text-xs text-orange-500">Sisa {item.current_stock} {item.unit} (Min: {item.min_stock})</p>
                  </div>
                  <ShoppingCart className="w-4 h-4 text-brand-text-muted" />
                </div>
              )) : (
                <div className="col-span-2 py-4 text-center text-brand-text-muted italic text-sm">
                  Semua stok dalam level aman.
                </div>
              )}
            </div>
            {lowStockItems.length > 4 && (
              <p className="mt-4 text-center text-xs text-brand-text-muted">
                Dan {lowStockItems.length - 4} barang lainnya...
              </p>
            )}
          </div>
        </div>

        {/* Recent Activity Sidebar */}
        <div className="bg-brand-card p-6 rounded-2xl border border-brand-border">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-white">Aktivitas Terkini</h3>
            <Activity className="w-4 h-4 text-brand-accent" />
          </div>
          <div className="space-y-6 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-px before:bg-brand-border">
            {recentTransactions.length > 0 ? recentTransactions.map((tx) => (
              <div key={tx.id} className="relative pl-10">
                <div className={cn(
                  "absolute left-0 top-0 w-8 h-8 rounded-lg flex items-center justify-center border border-brand-border",
                  tx.type === 'IN' ? "bg-blue-500/20 text-blue-500" : "bg-purple-500/20 text-purple-500"
                )}>
                  {tx.type === 'IN' ? <ArrowDownCircle className="w-4 h-4" /> : <ArrowUpCircle className="w-4 h-4" />}
                </div>
                <div>
                  <p className="text-sm text-white leading-tight">
                    <span className="font-bold">{tx.type === 'IN' ? 'Masuk' : 'Keluar'}</span> {tx.items?.name}
                  </p>
                  <p className="text-[10px] text-brand-text-muted mt-1 uppercase tracking-wider">
                    {formatDistanceToNow(new Date(tx.created_at), { addSuffix: true })} • Qty: {tx.quantity}
                  </p>
                </div>
              </div>
            )) : (
              <p className="text-sm text-brand-text-muted italic text-center py-8">Belum ada aktivitas.</p>
            )}
          </div>
          <button className="w-full mt-6 py-3 text-xs font-bold text-brand-text-muted hover:text-white border border-brand-border rounded-xl transition-all hover:bg-brand-dark/50">
            LIHAT SEMUA LOG
          </button>
        </div>
      </div>
    </div>
  );
}
