import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Package, 
  Clock,
  ArrowRight,
  Activity
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Item, Transaction } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '../lib/utils';

export function Dashboard() {
  const [items, setItems] = useState<Item[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: itemsData } = await supabase.from('items').select('*');
    const { data: transData } = await supabase
      .from('transactions')
      .select('*, items(*)')
      .order('created_at', { ascending: false })
      .limit(5);

    if (itemsData) setItems(itemsData);
    if (transData) setRecentTransactions(transData);
    setLoading(false);
  };

  const lowStockItems = items.filter(item => item.current_stock <= item.min_stock);
  const totalStock = items.reduce((acc, item) => acc + item.current_stock, 0);

  // Mock data for display to match the image
  const stats = [
    { label: 'TOTAL LINEN', value: '2,480', unit: 'Pcs', trend: '+ 12% vs last week', icon: Package },
    { label: 'LIQUID SOAP', value: '850', unit: 'Ltrs', trend: '4% usage spike', icon: Activity },
    { label: 'SHAMPOO KITS', value: '1,240', unit: 'Units', trend: 'Optimum level', icon: TrendingUp },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-white">Ringkasan Stok Utama</h2>
          <p className="text-brand-text-muted">Data inventaris housekeeping aktif</p>
        </div>
        <div className="bg-brand-card px-4 py-2 rounded-lg border border-brand-border text-sm text-brand-text-muted">
          Updated 2m ago
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Stats */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-6">
          {stats.map((stat, i) => (
            <div key={i} className="bg-brand-card p-6 rounded-2xl border border-brand-border hover:border-brand-accent transition-all group">
              <div className="flex justify-between items-start mb-4">
                <p className="text-xs font-bold text-brand-text-muted tracking-wider uppercase">{stat.label}</p>
                <stat.icon className="w-5 h-5 text-brand-accent opacity-50 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-4xl font-bold text-white">{stat.value}</span>
                <span className="text-brand-text-muted text-sm">{stat.unit}</span>
              </div>
              <p className="text-xs text-brand-accent flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                {stat.trend}
              </p>
            </div>
          ))}
        </div>

        {/* Low Stock Alerts */}
        <div className="bg-brand-card/50 p-6 rounded-2xl border border-brand-border border-l-4 border-l-orange-500">
          <div className="flex items-center gap-2 mb-6">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            <h3 className="font-bold text-white">Peringatan Stok Rendah</h3>
          </div>
          <div className="space-y-4">
            {lowStockItems.length > 0 ? lowStockItems.map((item) => (
              <div key={item.id} className="bg-brand-dark/50 p-4 rounded-xl border border-brand-border flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white">{item.name}</p>
                  <p className="text-xs text-orange-500">Sisa {item.current_stock} {item.unit}</p>
                </div>
                <button className="text-xs font-bold text-brand-accent hover:underline">RESTOCK</button>
              </div>
            )) : (
              <p className="text-sm text-brand-text-muted italic">Semua stok dalam level aman.</p>
            )}
          </div>
          <p className="mt-6 text-xs text-brand-text-muted italic">
            Kebutuhan mendesak untuk okupansi akhir pekan (94%)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Daily Distribution */}
        <div className="bg-brand-card p-6 rounded-2xl border border-brand-border">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-brand-accent" />
              <h3 className="font-bold text-white">Barang Keluar Hari Ini</h3>
            </div>
            <span className="text-2xl font-bold">412 <span className="text-sm font-normal text-brand-text-muted">Items</span></span>
          </div>
          
          <div className="h-2 bg-brand-dark rounded-full overflow-hidden mb-6">
            <div className="h-full bg-brand-accent w-[75%]"></div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-xs text-brand-text-muted uppercase mb-1">Target harian:</p>
              <p className="font-bold">550</p>
            </div>
            <div>
              <p className="text-xs text-brand-text-muted uppercase mb-1">75%</p>
              <p className="font-bold">Terdistribusi</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {['Floor 2: 85', 'Floor 4: 120', 'Floor 5: 92'].map((tag, i) => (
              <span key={i} className="px-3 py-1 bg-brand-dark border border-brand-border rounded-lg text-xs text-brand-text-muted">
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Incoming Goods */}
        <div className="bg-brand-card p-6 rounded-2xl border border-brand-border">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-brand-accent" />
              <h3 className="font-bold text-white">Barang Masuk</h3>
            </div>
            <span className="text-2xl font-bold">8 <span className="text-sm font-normal text-brand-text-muted">Vendor</span></span>
          </div>

          <div className="space-y-4">
            {[
              { label: '500 Mini Shampoos', time: '09:15' },
              { label: '200 Cotton Towels', time: '10:30' },
              { label: 'Laundry Chemicals (Pending)', time: '14:00', muted: true },
            ].map((item, i) => (
              <div key={i} className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-accent"></div>
                  <span className={item.muted ? 'text-brand-text-muted' : 'text-white'}>{item.label}</span>
                </div>
                <span className="text-brand-text-muted font-mono">{item.time}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-brand-card p-6 rounded-2xl border border-brand-border">
          <h3 className="font-bold text-white mb-6">Aktivitas Terkini</h3>
          <div className="space-y-6 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-px before:bg-brand-border">
            {recentTransactions.map((tx) => (
              <div key={tx.id} className="relative pl-10">
                <div className={cn(
                  "absolute left-0 top-0 w-8 h-8 rounded-lg flex items-center justify-center border border-brand-border",
                  tx.type === 'IN' ? "bg-blue-500/20 text-blue-500" : "bg-purple-500/20 text-purple-500"
                )}>
                  {tx.type === 'IN' ? <ArrowDownCircle className="w-4 h-4" /> : <ArrowUpCircle className="w-4 h-4" />}
                </div>
                <div>
                  <p className="text-sm text-white">
                    <span className="font-bold">{tx.type === 'IN' ? 'Restock' : 'Distribution'}</span> {tx.items?.name}
                  </p>
                  <p className="text-xs text-brand-text-muted mt-1">
                    {formatDistanceToNow(new Date(tx.created_at))} ago • Qty: {tx.quantity}
                  </p>
                </div>
              </div>
            ))}
            <button className="w-full py-2 text-xs font-bold text-brand-text-muted hover:text-white border border-brand-border rounded-lg transition-all">
              LIHAT SEMUA LOG
            </button>
          </div>
        </div>
      </div>

      {/* Health Score Section */}
      <div className="bg-brand-card p-8 rounded-2xl border border-brand-border flex flex-col md:flex-row gap-8 items-center">
        <div className="w-full md:w-1/3 h-48 rounded-xl overflow-hidden">
          <img 
            src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&q=80&w=800" 
            alt="Warehouse" 
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1">
          <h3 className="text-2xl font-bold text-white mb-2">Health Score Warehouse</h3>
          <p className="text-brand-text-muted mb-8 max-w-2xl">
            Kapasitas penyimpanan saat ini 68%. Sirkulasi barang kategori Linen sangat tinggi minggu ini.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { label: 'Turnover Rate', value: '4.2x / mo' },
              { label: 'Stock Accuracy', value: '99.4%' },
              { label: 'Expiring Soon', value: '12 SKUs' },
              { label: 'Pending Orders', value: '3 POs' },
            ].map((stat, i) => (
              <div key={i} className="bg-brand-dark/50 p-4 rounded-xl border border-brand-border">
                <p className="text-[10px] font-bold text-brand-text-muted uppercase mb-1">{stat.label}</p>
                <p className="text-lg font-bold text-white">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const ArrowDownCircle = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m8 12 4 4 4-4"/><path d="M12 8v8"/></svg>
);

const ArrowUpCircle = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m16 12-4-4-4 4"/><path d="M12 16V8"/></svg>
);
