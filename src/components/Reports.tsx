import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Transaction, Item } from '../types';
import { 
  FileText, 
  Download, 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight,
  TrendingUp,
  TrendingDown,
  ArrowDownCircle,
  ArrowUpCircle,
  Package,
  Inbox
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
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type ReportType = 'daily' | 'monthly';
type ReportCategory = 'stock' | 'incoming' | 'outgoing';

export function Reports() {
  const [reportType, setReportType] = useState<ReportType>('daily');
  const [reportCategory, setReportCategory] = useState<ReportCategory>('stock');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [itemStats, setItemStats] = useState<Record<string, { in: number, out: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (reportCategory === 'stock') {
      fetchStockData();
    } else {
      fetchTransactions();
    }
  }, [reportType, currentDate, reportCategory]);

  const fetchStockData = async () => {
    setLoading(true);
    let start, end;

    if (reportType === 'daily') {
      start = startOfDay(currentDate);
      end = endOfDay(currentDate);
    } else {
      start = startOfMonth(currentDate);
      end = endOfMonth(currentDate);
    }

    try {
      // Fetch all items
      const { data: itemsData, error: itemsError } = await supabase
        .from('items')
        .select('*')
        .order('name');

      if (itemsError) throw itemsError;

      // Fetch all transactions to calculate historical stock correctly
      const { data: transData, error: transError } = await supabase
        .from('transactions')
        .select('item_id, type, quantity, created_at');

      if (transError) throw transError;

      const stats: Record<string, { initial: number, in: number, out: number, final: number }> = {};
      
      itemsData?.forEach(item => {
        let beforeIn = 0;
        let beforeOut = 0;
        let currentIn = 0;
        let currentOut = 0;

        transData?.forEach(tx => {
          if (tx.item_id === item.id) {
            const txDate = new Date(tx.created_at);
            if (txDate < start) {
              if (tx.type === 'IN') beforeIn += tx.quantity;
              if (tx.type === 'OUT') beforeOut += tx.quantity;
            } else if (txDate >= start && txDate <= end) {
              if (tx.type === 'IN') currentIn += tx.quantity;
              if (tx.type === 'OUT') currentOut += tx.quantity;
            }
          }
        });

        const itemCreatedAt = new Date(item.created_at);
        const itemCreatedMonth = startOfMonth(itemCreatedAt);
        
        let initialForPeriod = 0;
        let finalForPeriod = 0;

        // Only show stock if the selected period is the same or after the creation month
        if (start >= itemCreatedMonth) {
          initialForPeriod = (item.initial_stock || 0) + beforeIn - beforeOut;
          finalForPeriod = initialForPeriod + currentIn - currentOut;
        } else {
          initialForPeriod = 0;
          currentIn = 0;
          currentOut = 0;
          finalForPeriod = 0;
        }

        stats[item.id] = {
          initial: initialForPeriod,
          in: currentIn,
          out: currentOut,
          final: finalForPeriod
        };
      });

      setItems(itemsData || []);
      setItemStats(stats as any);
    } catch (error: any) {
      console.error('Error fetching stock data:', error);
      alert('Gagal mengambil data stok: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

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

    try {
      let query = supabase
        .from('transactions')
        .select('*, items(*)')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: false });

      if (reportCategory === 'incoming') {
        query = query.eq('type', 'IN');
      } else if (reportCategory === 'outgoing') {
        query = query.eq('type', 'OUT');
      }

      const { data, error } = await query;

      if (error) throw error;
      if (data) setTransactions(data);
    } catch (error: any) {
      console.error('Error fetching transactions:', error);
      alert('Gagal mengambil data laporan: ' + (error.message || 'Error tidak diketahui'));
    } finally {
      setLoading(false);
    }
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

  const exportToPDF = () => {
    const doc = new jsPDF();
    const periodStr = reportType === 'daily' ? format(currentDate, 'dd MMMM yyyy') : format(currentDate, 'MMMM yyyy');
    let categoryStr = '';
    if (reportCategory === 'stock') categoryStr = 'Stok Barang';
    else if (reportCategory === 'incoming') categoryStr = 'Barang Masuk';
    else categoryStr = 'Barang Keluar';

    const title = `Laporan ${categoryStr} - ${periodStr}`;
    
    doc.setFontSize(18);
    doc.text('Gudang Alia', 14, 22);
    doc.setFontSize(12);
    doc.text(title, 14, 30);

    if (reportCategory === 'stock') {
      const tableData = items.map(item => {
        const stats = itemStats[item.id] as any || { initial: 0, in: 0, out: 0, final: 0 };
        return [
          item.name,
          item.department,
          stats.initial.toString(),
          stats.in.toString(),
          stats.out.toString(),
          stats.final.toString(),
          item.unit
        ];
      });

      autoTable(doc, {
        startY: 40,
        head: [['Nama Barang', 'Dept', 'Awal', 'Masuk', 'Keluar', 'Akhir', 'Satuan']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [59, 130, 246] },
      });
    } else {
      doc.text(`Total ${reportCategory === 'incoming' ? 'Masuk' : 'Keluar'}: ${reportCategory === 'incoming' ? totalIn : totalOut} items`, 14, 40);
      
      const tableData = transactions.map(tx => [
        format(new Date(tx.created_at), 'dd/MM HH:mm'),
        tx.items?.name || '-',
        tx.quantity.toString(),
        tx.notes || '-'
      ]);

      autoTable(doc, {
        startY: 50,
        head: [['Waktu', 'Barang', 'Jumlah', 'Catatan']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [59, 130, 246] },
      });
    }

    doc.save(`Laporan_${categoryStr}_${format(currentDate, 'yyyyMMdd')}.pdf`);
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
    <div className="space-y-6 animate-in fade-in duration-500 p-4 md:p-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-white">Laporan Inventaris</h2>
          <p className="text-brand-text-muted">Analisis pergerakan stok barang</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
          <div className="flex gap-2 bg-brand-card p-1 rounded-xl border border-brand-border w-full sm:w-auto">
            <button 
              onClick={() => setReportCategory('stock')}
              className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${reportCategory === 'stock' ? 'bg-brand-accent text-white' : 'text-brand-text-muted hover:text-white'}`}
            >
              <Package className="w-4 h-4" />
              Stok
            </button>
            <button 
              onClick={() => setReportCategory('incoming')}
              className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${reportCategory === 'incoming' ? 'bg-brand-accent text-white' : 'text-brand-text-muted hover:text-white'}`}
            >
              <Inbox className="w-4 h-4" />
              Masuk
            </button>
            <button 
              onClick={() => setReportCategory('outgoing')}
              className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${reportCategory === 'outgoing' ? 'bg-brand-accent text-white' : 'text-brand-text-muted hover:text-white'}`}
            >
              <ArrowUpCircle className="w-4 h-4" />
              Keluar
            </button>
          </div>
          <div className="flex gap-2 bg-brand-card p-1 rounded-xl border border-brand-border w-full sm:w-auto">
            <button 
              onClick={() => setReportType('daily')}
              className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-all ${reportType === 'daily' ? 'bg-brand-accent text-white' : 'text-brand-text-muted hover:text-white'}`}
            >
              Harian
            </button>
            <button 
              onClick={() => setReportType('monthly')}
              className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-all ${reportType === 'monthly' ? 'bg-brand-accent text-white' : 'text-brand-text-muted hover:text-white'}`}
            >
              Bulanan
            </button>
          </div>
        </div>
      </div>

      {/* Date Selector */}
      <div className="flex flex-col sm:flex-row items-center justify-between bg-brand-card p-4 rounded-2xl border border-brand-border gap-4">
        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start">
          <button onClick={prevPeriod} className="p-2 hover:bg-brand-dark rounded-lg text-brand-text-muted hover:text-white">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="relative">
            <label className="flex items-center gap-2 text-white font-bold cursor-pointer hover:text-brand-accent transition-colors">
              <CalendarIcon className="w-5 h-5 text-brand-accent" />
              {reportType === 'daily' ? format(currentDate, 'dd MMMM yyyy') : format(currentDate, 'MMMM yyyy')}
              <input 
                type={reportType === 'daily' ? "date" : "month"}
                className="absolute inset-0 opacity-0 cursor-pointer w-full"
                value={reportType === 'daily' ? format(currentDate, 'yyyy-MM-dd') : format(currentDate, 'yyyy-MM')}
                onChange={(e) => {
                  if (e.target.value) {
                    const newDate = new Date(e.target.value);
                    if (!isNaN(newDate.getTime())) {
                      setCurrentDate(newDate);
                    }
                  }
                }}
              />
            </label>
          </div>
          <button onClick={nextPeriod} className="p-2 hover:bg-brand-dark rounded-lg text-brand-text-muted hover:text-white">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <button 
          onClick={exportToPDF}
          className="w-full sm:w-auto bg-brand-accent/10 text-brand-accent hover:bg-brand-accent hover:text-white px-4 py-2 rounded-lg font-bold flex items-center justify-center gap-2 transition-all"
        >
          <Download className="w-4 h-4" />
          Export PDF
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
        <div className="bg-brand-card p-4 md:p-6 rounded-2xl border border-brand-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-500">
              <ArrowDownCircle className="w-5 h-5 md:w-6 md:h-6" />
            </div>
            <div>
              <p className="text-[9px] md:text-[10px] text-brand-text-muted uppercase font-bold tracking-wider">Total Barang Masuk</p>
              <p className="text-lg md:text-2xl font-bold text-white">{totalIn} <span className="text-xs md:text-sm font-normal text-brand-text-muted">Items</span></p>
            </div>
          </div>
        </div>
        <div className="bg-brand-card p-4 md:p-6 rounded-2xl border border-brand-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-500">
              <ArrowUpCircle className="w-5 h-5 md:w-6 md:h-6" />
            </div>
            <div>
              <p className="text-[9px] md:text-[10px] text-brand-text-muted uppercase font-bold tracking-wider">Total Barang Keluar</p>
              <p className="text-lg md:text-2xl font-bold text-white">{totalOut} <span className="text-xs md:text-sm font-normal text-brand-text-muted">Items</span></p>
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-brand-card p-4 md:p-6 rounded-2xl border border-brand-border">
        <h3 className="font-bold text-white mb-6">Visualisasi Pergerakan Barang</h3>
        <div className="h-64 md:h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
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
        <div className="p-4 md:p-6 border-b border-brand-border flex justify-between items-center">
          <h3 className="font-bold text-white">
            {reportCategory === 'stock' ? 'Rincian Stok Barang' : 
             reportCategory === 'incoming' ? 'Rincian Barang Masuk' : 'Rincian Barang Keluar'}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-brand-dark/50 text-brand-text-muted text-[10px] md:text-xs font-bold uppercase tracking-wider">
                {reportCategory === 'stock' ? (
                  <>
                    <th className="px-3 md:px-6 py-3 md:py-4">Nama Barang</th>
                    <th className="px-3 md:px-6 py-3 md:py-4">Dept</th>
                    <th className="px-3 md:px-6 py-3 md:py-4">Awal</th>
                    <th className="px-3 md:px-6 py-3 md:py-4">Masuk</th>
                    <th className="px-3 md:px-6 py-3 md:py-4">Keluar</th>
                    <th className="px-3 md:px-6 py-3 md:py-4">Akhir</th>
                    <th className="px-3 md:px-6 py-3 md:py-4">Satuan</th>
                  </>
                ) : (
                  <>
                    <th className="px-3 md:px-6 py-3 md:py-4">Waktu</th>
                    <th className="px-3 md:px-6 py-3 md:py-4">Barang</th>
                    <th className="px-3 md:px-6 py-3 md:py-4">Jumlah</th>
                    <th className="px-3 md:px-6 py-3 md:py-4">Catatan</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {loading ? (
                <tr><td colSpan={reportCategory === 'stock' ? 7 : 4} className="px-6 py-8 text-center text-brand-text-muted">Loading...</td></tr>
              ) : (reportCategory === 'stock' ? items : transactions).length === 0 ? (
                <tr><td colSpan={reportCategory === 'stock' ? 7 : 4} className="px-6 py-8 text-center text-brand-text-muted">Tidak ada data di periode ini.</td></tr>
              ) : reportCategory === 'stock' ? (
                items.map((item) => {
                  const stats = itemStats[item.id] as any || { initial: 0, in: 0, out: 0, final: 0 };
                  return (
                    <tr key={item.id} className="hover:bg-brand-dark/30 transition-colors">
                      <td className="px-3 md:px-6 py-3 md:py-4 font-medium text-white text-xs md:text-sm">{item.name}</td>
                      <td className="px-3 md:px-6 py-3 md:py-4 text-brand-text-muted text-xs md:text-sm">{item.department}</td>
                      <td className="px-3 md:px-6 py-3 md:py-4 text-brand-text-muted text-xs md:text-sm">{stats.initial}</td>
                      <td className="px-3 md:px-6 py-3 md:py-4 text-blue-400 text-xs md:text-sm">+{stats.in}</td>
                      <td className="px-3 md:px-6 py-3 md:py-4 text-purple-400 text-xs md:text-sm">-{stats.out}</td>
                      <td className="px-3 md:px-6 py-3 md:py-4 font-bold text-white text-xs md:text-sm">{stats.final}</td>
                      <td className="px-3 md:px-6 py-3 md:py-4 text-brand-text-muted text-xs md:text-sm">{item.unit}</td>
                    </tr>
                  );
                })
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-brand-dark/30 transition-colors">
                    <td className="px-3 md:px-6 py-3 md:py-4 text-brand-text-muted font-mono text-[10px] md:text-sm">
                      {format(new Date(tx.created_at), 'dd/MM HH:mm')}
                    </td>
                    <td className="px-3 md:px-6 py-3 md:py-4 font-medium text-white text-xs md:text-sm">{tx.items?.name}</td>
                    <td className="px-3 md:px-6 py-3 md:py-4 font-bold text-white text-xs md:text-sm">
                      {tx.type === 'IN' ? '+' : '-'}{tx.quantity}
                    </td>
                    <td className="px-3 md:px-6 py-3 md:py-4 text-brand-text-muted text-xs md:text-sm italic">{tx.notes || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
