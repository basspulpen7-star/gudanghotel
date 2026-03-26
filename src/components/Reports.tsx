import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Transaction } from '../types';
import { 
  FileText, 
  Download, 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight,
  TrendingUp,
  TrendingDown,
  ArrowDownCircle,
  ArrowUpCircle
} from 'lucide-react';
import { 
  format, 
  startOfDay, 
  endOfDay, 
  startOfMonth, 
  endOfMonth, 
  subDays, 
  subMonths,
  isSameDay,
  isSameMonth
} from 'date-fns';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';

type ReportType = 'daily' | 'monthly';

export function Reports() {
  const [reportType, setReportType] = useState<ReportType>('daily');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTransactions();
  }, [reportType, currentDate]);

  const fetchTransactions = async () => {
    setLoading(true);
    let start, end;

    if (reportType === 'daily') {
      start = startOfDay(currentDate);
      end = endOfDay(currentDate);
    } else {
      start = startOfMonth(currentDate);
      end = endOfMonth(currentDate);
    }

    const { data } = await supabase
      .from('transactions')
      .select('*, items(*)')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .order('created_at', { ascending: false });

    if (data) setTransactions(data);
    setLoading(false);
  };

  const nextPeriod = () => {
    if (reportType === 'daily') {
      setCurrentDate(prev => subDays(prev, -1));
    } else {
      setCurrentDate(prev => subMonths(prev, -1));
    }
  };

  const prevPeriod = () => {
    if (reportType === 'daily') {
      setCurrentDate(prev => subDays(prev, 1));
    } else {
      setCurrentDate(prev => subMonths(prev, 1));
    }
  };

  const totalIn = transactions.filter(t => t.type === 'IN').reduce((acc, t) => acc + t.quantity, 0);
  const totalOut = transactions.filter(t => t.type === 'OUT').reduce((acc, t) => acc + t.quantity, 0);

  // Prepare chart data
  const chartData = transactions.reduce((acc: any[], t) => {
    const itemName = t.items?.name || 'Unknown';
    const existing = acc.find(item => item.name === itemName);
    if (existing) {
      if (t.type === 'IN') existing.in += t.quantity;
      else existing.out += t.quantity;
    } else {
      acc.push({ name: itemName, in: t.type === 'IN' ? t.quantity : 0, out: t.type === 'OUT' ? t.quantity : 0 });
    }
    return acc;
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-white">Laporan Inventaris</h2>
          <p className="text-brand-text-muted">Analisis pergerakan stok barang</p>
        </div>
        <div className="flex gap-2 bg-brand-card p-1 rounded-xl border border-brand-border">
          <button 
            onClick={() => setReportType('daily')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${reportType === 'daily' ? 'bg-brand-accent text-white' : 'text-brand-text-muted hover:text-white'}`}
          >
            Harian
          </button>
          <button 
            onClick={() => setReportType('monthly')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${reportType === 'monthly' ? 'bg-brand-accent text-white' : 'text-brand-text-muted hover:text-white'}`}
          >
            Bulanan
          </button>
        </div>
      </div>

      {/* Date Selector */}
      <div className="flex items-center justify-between bg-brand-card p-4 rounded-2xl border border-brand-border">
        <div className="flex items-center gap-4">
          <button onClick={prevPeriod} className="p-2 hover:bg-brand-dark rounded-lg text-brand-text-muted hover:text-white">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="relative">
            <label className="flex items-center gap-2 text-white font-bold cursor-pointer hover:text-brand-accent transition-colors">
              <CalendarIcon className="w-5 h-5 text-brand-accent" />
              {reportType === 'daily' ? format(currentDate, 'dd MMMM yyyy') : format(currentDate, 'MMMM yyyy')}
              <input 
                type={reportType === 'daily' ? "date" : "month"}
                className="absolute inset-0 opacity-0 cursor-pointer"
                value={reportType === 'daily' ? format(currentDate, 'yyyy-MM-dd') : format(currentDate, 'yyyy-MM')}
                onChange={(e) => {
                  if (e.target.value) setCurrentDate(new Date(e.target.value));
                }}
              />
            </label>
          </div>
          <button onClick={nextPeriod} className="p-2 hover:bg-brand-dark rounded-lg text-brand-text-muted hover:text-white">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <button className="bg-brand-accent/10 text-brand-accent hover:bg-brand-accent hover:text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-all">
          <Download className="w-4 h-4" />
          Export PDF
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-brand-card p-6 rounded-2xl border border-brand-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-500">
              <ArrowDownCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-brand-text-muted uppercase font-bold">Total Barang Masuk</p>
              <p className="text-2xl font-bold text-white">{totalIn} <span className="text-sm font-normal text-brand-text-muted">Items</span></p>
            </div>
          </div>
        </div>
        <div className="bg-brand-card p-6 rounded-2xl border border-brand-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-500">
              <ArrowUpCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-brand-text-muted uppercase font-bold">Total Barang Keluar</p>
              <p className="text-2xl font-bold text-white">{totalOut} <span className="text-sm font-normal text-brand-text-muted">Items</span></p>
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-brand-card p-6 rounded-2xl border border-brand-border">
        <h3 className="font-bold text-white mb-6">Visualisasi Pergerakan Barang</h3>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px' }}
                itemStyle={{ color: '#fff' }}
              />
              <Bar dataKey="in" name="Masuk" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="out" name="Keluar" fill="#a855f7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detailed Table */}
      <div className="bg-brand-card rounded-2xl border border-brand-border overflow-hidden">
        <div className="p-6 border-b border-brand-border">
          <h3 className="font-bold text-white">Rincian Transaksi</h3>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-brand-dark/50 text-brand-text-muted text-xs font-bold uppercase tracking-wider">
              <th className="px-6 py-4">Waktu</th>
              <th className="px-6 py-4">Barang</th>
              <th className="px-6 py-4">Tipe</th>
              <th className="px-6 py-4">Jumlah</th>
              <th className="px-6 py-4">Catatan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border">
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-brand-text-muted">Loading...</td></tr>
            ) : transactions.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-brand-text-muted">Tidak ada transaksi di periode ini.</td></tr>
            ) : transactions.map((tx) => (
              <tr key={tx.id} className="hover:bg-brand-dark/30 transition-colors">
                <td className="px-6 py-4 text-brand-text-muted font-mono text-sm">
                  {format(new Date(tx.created_at), 'dd/MM HH:mm')}
                </td>
                <td className="px-6 py-4 font-medium text-white">{tx.items?.name}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${
                    tx.type === 'IN' ? 'bg-blue-500/20 text-blue-500' : 'bg-purple-500/20 text-purple-500'
                  }`}>
                    {tx.type === 'IN' ? 'Masuk' : 'Keluar'}
                  </span>
                </td>
                <td className="px-6 py-4 font-bold text-white">
                  {tx.type === 'IN' ? '+' : '-'}{tx.quantity}
                </td>
                <td className="px-6 py-4 text-brand-text-muted text-sm italic">{tx.notes || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
