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
  Inbox,
  UtensilsCrossed,
  ArrowRight
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

type ReportType = 'daily' | 'monthly' | 'custom';
type ReportCategory = 'stock' | 'incoming' | 'outgoing';

interface ReportsProps {
  onNavigateToResto?: () => void;
}

export function Reports({ onNavigateToResto }: ReportsProps) {
  const [reportType, setReportType] = useState<ReportType>('daily');
  const [reportCategory, setReportCategory] = useState<ReportCategory>('stock');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [itemStats, setItemStats] = useState<Record<string, { initial: number; in: number; out: number; final: number }>>({});
  const [loading, setLoading] = useState(true);

  const getLocalStart = (type: ReportType, currDate: Date, sDateStr: string) => {
    if (type === 'daily') return startOfDay(currDate);
    if (type === 'monthly') return startOfMonth(currDate);
    const parts = sDateStr.split('-');
    if (parts.length === 3) {
      return startOfDay(new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
    }
    return startOfDay(new Date(sDateStr));
  };

  const getLocalEnd = (type: ReportType, currDate: Date, eDateStr: string) => {
    if (type === 'daily') return endOfDay(currDate);
    if (type === 'monthly') return endOfMonth(currDate);
    const parts = eDateStr.split('-');
    if (parts.length === 3) {
      return endOfDay(new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
    }
    return endOfDay(new Date(eDateStr));
  };

  useEffect(() => {
    if (reportCategory === 'stock') {
      fetchStockData();
    } else {
      fetchTransactions();
    }
  }, [reportType, currentDate, reportCategory, startDate, endDate]);

  const fetchStockData = async () => {
    setLoading(true);
    const start = getLocalStart(reportType, currentDate, startDate);
    const end = getLocalEnd(reportType, currentDate, endDate);

    try {
      // Try RPC get_stock_report first for fast DB-side calculation
      const { data, error } = await supabase.rpc('get_stock_report', {
        p_start: start.toISOString(),
        p_end: end.toISOString()
      });

      if (!error && data && Array.isArray(data)) {
        const mappedItems: Item[] = [];
        const stats: Record<string, { initial: number; in: number; out: number; final: number }> = {};

        data.forEach((row: any) => {
          mappedItems.push({
            id: row.item_id,
            name: row.item_name,
            department: row.department,
            unit: row.unit,
          } as Item);

          stats[row.item_id] = {
            initial: Number(row.initial_stock || 0),
            in: Number(row.in_qty || 0),
            out: Number(row.out_qty || 0),
            final: Number(row.final_stock || 0)
          };
        });

        setItems(mappedItems);
        setItemStats(stats as any);
        return;
      }

      // If RPC is missing or failed, use client-side calculation fallback
      if (error) {
        console.warn('[REPORTS] RPC get_stock_report not available, using client-side fallback:', error.message);
      }

      // Client-side Fallback: Fetch required fields
      const { data: itemsData, error: itemsError } = await supabase
        .from('items')
        .select('id, name, department, unit, initial_stock, created_at')
        .order('name');

      if (itemsError) throw itemsError;

      const { data: transData, error: transError } = await supabase
        .from('transactions')
        .select('item_id, type, quantity, created_at')
        .lte('created_at', end.toISOString());

      if (transError) throw transError;

      const stats: Record<string, { initial: number; in: number; out: number; final: number }> = {};

      itemsData?.forEach(item => {
        let beforeIn = 0;
        let beforeOut = 0;
        let currentIn = 0;
        let currentOut = 0;

        transData?.forEach(tx => {
          if (tx.item_id === item.id) {
            const txDate = new Date(tx.created_at);
            if (txDate < start) {
              if (tx.type === 'IN') beforeIn += (Number(tx.quantity) || 0);
              if (tx.type === 'OUT') beforeOut += (Number(tx.quantity) || 0);
            } else if (txDate >= start && txDate <= end) {
              if (tx.type === 'IN') currentIn += (Number(tx.quantity) || 0);
              if (tx.type === 'OUT') currentOut += (Number(tx.quantity) || 0);
            }
          }
        });

        const initialForPeriod = (Number(item.initial_stock) || 0) + beforeIn - beforeOut;
        const finalForPeriod = initialForPeriod + currentIn - currentOut;

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
      alert('Gagal mengambil data stok: ' + (error.message || 'Error tidak diketahui'));
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async () => {
    setLoading(true);
    const start = getLocalStart(reportType, currentDate, startDate);
    const end = getLocalEnd(reportType, currentDate, endDate);

    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, item_id, type, quantity, notes, created_at, items(id, name, unit)')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: false });

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

  const totalIn = reportCategory === 'stock'
    ? (Object.values(itemStats) as Array<{ in?: number; out?: number }>).reduce((acc, s) => acc + (s?.in || 0), 0)
    : transactions.filter(t => t.type === 'IN').reduce((acc, t) => acc + (t.quantity || 0), 0);

  const totalOut = reportCategory === 'stock'
    ? (Object.values(itemStats) as Array<{ in?: number; out?: number }>).reduce((acc, s) => acc + (s?.out || 0), 0)
    : transactions.filter(t => t.type === 'OUT').reduce((acc, t) => acc + (t.quantity || 0), 0);

  const displayedTransactions = transactions.filter(tx => {
    if (reportCategory === 'incoming') return tx.type === 'IN';
    if (reportCategory === 'outgoing') return tx.type === 'OUT';
    return true;
  });

  const exportToPDF = () => {
    const doc = new jsPDF();
    let periodStr = '';
    if (reportType === 'daily') periodStr = format(currentDate, 'dd MMMM yyyy');
    else if (reportType === 'monthly') periodStr = format(currentDate, 'MMMM yyyy');
    else periodStr = `${format(new Date(startDate), 'dd/MM/yy')} - ${format(new Date(endDate), 'dd/MM/yy')}`;

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
      const count = reportCategory === 'incoming' ? totalIn : totalOut;
      doc.text(`Total ${reportCategory === 'incoming' ? 'Masuk' : 'Keluar'}: ${count} items`, 14, 40);
      
      const tableData = displayedTransactions.map(tx => [
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

  // Prepare chart data
  const chartData = (reportCategory === 'stock'
    ? items.map(it => ({
        name: it.name,
        in: (itemStats[it.id] as any)?.in || 0,
        out: (itemStats[it.id] as any)?.out || 0
      }))
    : transactions.reduce((acc: any[], t) => {
        const itemName = t.items?.name || 'Unknown';
        const existing = acc.find(item => item.name === itemName);
        if (existing) {
          if (t.type === 'IN') existing.in += t.quantity;
          else existing.out += t.quantity;
        } else {
          acc.push({ name: itemName, in: t.type === 'IN' ? t.quantity : 0, out: t.type === 'OUT' ? t.quantity : 0 });
        }
        return acc;
      }, [])
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-20 md:pb-6 font-sans">
      {/* Resto Specialized Report Banner / Shortcut */}
      {onNavigateToResto && (
        <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/5 border border-amber-200/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-xs shrink-0">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-black text-amber-950 uppercase tracking-wider">Laporan Khusus Restoran</h4>
              <p className="text-xs text-amber-800/80 font-medium">Lihat laporan stok bahan makanan, minuman, barang masuk, dan pemakaian dapur restoran secara terpisah.</p>
            </div>
          </div>
          <button
            onClick={onNavigateToResto}
            className="w-full sm:w-auto px-4 py-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-xs shrink-0"
          >
            <span>Buka Laporan Resto</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 md:p-6 rounded-2xl border border-gray-200/90 shadow-sm">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">Laporan Inventaris</h2>
          <p className="text-xs md:text-sm text-gray-500 mt-0.5 font-medium">Analisis pergerakan mutasi dan riwayat stok barang</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2.5 w-full md:w-auto">
          <div className="flex gap-1.5 bg-gray-100 p-1 rounded-xl border border-gray-200 w-full sm:w-auto">
            <button 
              onClick={() => setReportCategory('stock')}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 ${reportCategory === 'stock' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'}`}
            >
              <Package className="w-3.5 h-3.5" />
              Stok
            </button>
            <button 
              onClick={() => setReportCategory('incoming')}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 ${reportCategory === 'incoming' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'}`}
            >
              <Inbox className="w-3.5 h-3.5" />
              Masuk
            </button>
            <button 
              onClick={() => setReportCategory('outgoing')}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 ${reportCategory === 'outgoing' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'}`}
            >
              <ArrowUpCircle className="w-3.5 h-3.5" />
              Keluar
            </button>
          </div>
          <div className="flex gap-1.5 bg-gray-100 p-1 rounded-xl border border-gray-200 w-full sm:w-auto">
            <button 
              onClick={() => setReportType('daily')}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-extrabold transition-all ${reportType === 'daily' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Harian
            </button>
            <button 
              onClick={() => setReportType('monthly')}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-extrabold transition-all ${reportType === 'monthly' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Bulanan
            </button>
            <button 
              onClick={() => setReportType('custom')}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-extrabold transition-all ${reportType === 'custom' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Custom
            </button>
          </div>
        </div>
      </div>

      {/* Date Selector */}
      <div className="flex flex-col sm:flex-row items-center justify-between bg-white p-4 rounded-2xl border border-gray-200/90 shadow-sm gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
          {reportType !== 'custom' && (
            <button onClick={prevPeriod} className="p-2 bg-gray-50 border border-gray-200 hover:bg-gray-100 rounded-xl text-gray-600 hover:text-gray-900 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          
          <div className="relative flex-grow sm:flex-grow-0">
            {reportType === 'custom' ? (
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <div className="relative w-full sm:w-auto">
                  <input 
                    type="date"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-xs font-bold focus:outline-none focus:border-amber-500 focus:bg-white"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <span className="text-gray-400 text-xs font-bold">s/d</span>
                <div className="relative w-full sm:w-auto">
                  <input 
                    type="date"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-xs font-bold focus:outline-none focus:border-amber-500 focus:bg-white"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <label className="flex items-center gap-2.5 text-gray-900 font-extrabold cursor-pointer hover:text-amber-600 transition-colors bg-gray-50 border border-gray-200 px-4 py-2 rounded-xl text-xs sm:text-sm">
                <CalendarIcon className="w-4 h-4 text-amber-600" />
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
            )}
          </div>

          {reportType !== 'custom' && (
            <button onClick={nextPeriod} className="p-2 bg-gray-50 border border-gray-200 hover:bg-gray-100 rounded-xl text-gray-600 hover:text-gray-900 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
        <button 
          onClick={exportToPDF}
          className="w-full sm:w-auto bg-[#E65C00] hover:bg-[#CF5300] text-white px-4 py-2.5 rounded-xl font-extrabold flex items-center justify-center gap-2 transition-all shadow-sm shadow-orange-500/20 text-xs"
        >
          <Download className="w-4 h-4 stroke-[3]" />
          <span>Export PDF</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
        <div className="bg-white p-4 md:p-5 rounded-2xl border border-gray-200/90 shadow-sm">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <ArrowDownCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase font-extrabold tracking-wider">Total Barang Masuk</p>
              <p className="text-xl font-black text-gray-900">{totalIn} <span className="text-xs font-medium text-gray-500">Items</span></p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 md:p-5 rounded-2xl border border-gray-200/90 shadow-sm">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
              <ArrowUpCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase font-extrabold tracking-wider">Total Barang Keluar</p>
              <p className="text-xl font-black text-gray-900">{totalOut} <span className="text-xs font-medium text-gray-500">Items</span></p>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Table */}
      <div className="bg-white rounded-2xl border border-gray-200/90 shadow-sm overflow-hidden">
        <div className="p-4 md:p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h3 className="font-black text-sm text-gray-900">
            {reportCategory === 'stock' ? 'Rincian Stok Barang' : 
             reportCategory === 'incoming' ? 'Rincian Barang Masuk' : 'Rincian Barang Keluar'}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px] text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-[10px] font-extrabold uppercase tracking-wider border-b border-gray-200">
                {reportCategory === 'stock' ? (
                  <>
                    <th className="px-4 py-3">Nama Barang</th>
                    <th className="px-4 py-3">Dept</th>
                    <th className="px-4 py-3">Awal</th>
                    <th className="px-4 py-3">Masuk</th>
                    <th className="px-4 py-3">Keluar</th>
                    <th className="px-4 py-3">Akhir</th>
                    <th className="px-4 py-3">Satuan</th>
                  </>
                ) : (
                  <>
                    <th className="px-4 py-3">Waktu</th>
                    <th className="px-4 py-3">Barang</th>
                    <th className="px-4 py-3">Jumlah</th>
                    <th className="px-4 py-3">Catatan</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={reportCategory === 'stock' ? 7 : 4} className="px-6 py-8 text-center text-gray-500 font-medium">Memuat data laporan...</td></tr>
              ) : (reportCategory === 'stock' ? items : displayedTransactions).length === 0 ? (
                <tr><td colSpan={reportCategory === 'stock' ? 7 : 4} className="px-6 py-8 text-center text-gray-500 font-medium">Tidak ada data di periode ini.</td></tr>
              ) : reportCategory === 'stock' ? (
                items.map((item) => {
                  const stats = itemStats[item.id] as any || { initial: 0, in: 0, out: 0, final: 0 };
                  return (
                    <tr key={item.id} className="hover:bg-amber-50/20 transition-colors">
                      <td className="px-4 py-3 font-bold text-gray-900">{item.name}</td>
                      <td className="px-4 py-3 text-gray-500 font-medium">{item.department}</td>
                      <td className="px-4 py-3 text-gray-600 font-semibold">{stats.initial}</td>
                      <td className="px-4 py-3 text-emerald-600 font-bold">+{stats.in}</td>
                      <td className="px-4 py-3 text-red-600 font-bold">-{stats.out}</td>
                      <td className="px-4 py-3 font-black text-gray-900">{stats.final}</td>
                      <td className="px-4 py-3 text-gray-500">{item.unit}</td>
                    </tr>
                  );
                })
              ) : (
                displayedTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-amber-50/20 transition-colors">
                    <td className="px-4 py-3 text-gray-500 font-mono text-[11px]">
                      {format(new Date(tx.created_at), 'dd/MM HH:mm')}
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-900">{tx.items?.name}</td>
                    <td className="px-4 py-3 font-black text-gray-900">
                      <span className={tx.type === 'IN' ? 'text-emerald-600' : 'text-red-600'}>
                        {tx.type === 'IN' ? '+' : '-'}{tx.quantity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 italic">{tx.notes || '-'}</td>
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
