import React, { useState, useEffect, useMemo } from 'react';
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
  AlertTriangle,
  CheckCircle2,
  Filter,
  Search,
  RefreshCw,
  FileSpreadsheet,
  Layers,
  ChefHat
} from 'lucide-react';
import { 
  format, 
  startOfDay, 
  endOfDay, 
  startOfMonth, 
  endOfMonth, 
  subDays, 
  subMonths
} from 'date-fns';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '../lib/utils';

type ReportType = 'daily' | 'monthly' | 'custom';
type RestoCategory = 'stock' | 'incoming' | 'outgoing' | 'critical';

// Helper to determine if an item/department belongs to Resto
export const isRestoDepartment = (deptName?: string | null): boolean => {
  if (!deptName) return false;
  const d = deptName.toLowerCase().trim();
  return (
    d.includes('resto') ||
    d.includes('restoran') ||
    d.includes('f&b') ||
    d.includes('food') ||
    d.includes('kitchen') ||
    d.includes('dapur') ||
    d.includes('bar') ||
    d.includes('beverage')
  );
};

export function RestoReports() {
  const [reportType, setReportType] = useState<ReportType>('monthly');
  const [activeTab, setActiveTab] = useState<RestoCategory>('stock');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  
  const [searchQuery, setSearchQuery] = useState('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [itemStats, setItemStats] = useState<Record<string, { initial: number; in: number; out: number; final: number }>>({});
  const [loading, setLoading] = useState(true);

  const getLocalStart = (type: ReportType, currDate: Date, sDateStr: string) => {
    if (type === 'daily') return startOfDay(currDate);
    if (type === 'monthly') return startOfMonth(currDate);
    const parts = sDateStr.split('-');
    if (parts.length === 3) {
      return startOfDay(new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
    }
    return startOfDay(new Date(sDateStr));
  };

  const getLocalEnd = (type: ReportType, currDate: Date, eDateStr: string) => {
    if (type === 'daily') return endOfDay(currDate);
    if (type === 'monthly') return endOfMonth(currDate);
    const parts = eDateStr.split('-');
    if (parts.length === 3) {
      return endOfDay(new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
    }
    return endOfDay(new Date(eDateStr));
  };

  const fetchData = async () => {
    setLoading(true);
    const start = getLocalStart(reportType, currentDate, startDate);
    const end = getLocalEnd(reportType, currentDate, endDate);

    try {
      // 1. Fetch Resto Items only
      const { data: allItems, error: itemsErr } = await supabase
        .from('items')
        .select('*')
        .order('name');

      if (itemsErr) throw itemsErr;

      // Filter exclusively for Resto items
      const restoItems = (allItems || []).filter(item => isRestoDepartment(item.department));
      const restoItemIds = new Set(restoItems.map(i => i.id));

      // 2. Fetch Transactions for the period and prior
      const { data: allTx, error: txErr } = await supabase
        .from('transactions')
        .select('id, item_id, type, quantity, department, notes, created_at, items(id, name, unit, department)')
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: false });

      if (txErr) throw txErr;

      // Filter transactions that belong to Resto items or marked as Resto department
      const relevantTx = (allTx || []).filter((tx: any) => {
        if (restoItemIds.has(tx.item_id)) return true;
        if (isRestoDepartment(tx.department)) return true;
        const it = Array.isArray(tx.items) ? tx.items[0] : tx.items;
        if (it && isRestoDepartment(it.department)) return true;
        return false;
      });

      // Filter transactions that fall strictly within the selected date window
      const periodTx = relevantTx.filter((tx: any) => {
        const d = new Date(tx.created_at);
        return d >= start && d <= end;
      });

      setTransactions(periodTx as unknown as Transaction[]);

      // 3. Compute Item Stats for Stock Reconciliation
      const stats: Record<string, { initial: number; in: number; out: number; final: number }> = {};

      restoItems.forEach(item => {
        let beforeIn = 0;
        let beforeOut = 0;
        let currentIn = 0;
        let currentOut = 0;

        relevantTx.forEach(tx => {
          if (tx.item_id === item.id) {
            const txDate = new Date(tx.created_at);
            const qty = Number(tx.quantity) || 0;
            if (txDate < start) {
              if (tx.type === 'IN') beforeIn += qty;
              if (tx.type === 'OUT') beforeOut += qty;
            } else if (txDate >= start && txDate <= end) {
              if (tx.type === 'IN') currentIn += qty;
              if (tx.type === 'OUT') currentOut += qty;
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

      setItems(restoItems);
      setItemStats(stats);
    } catch (error: any) {
      console.error('[RESTO REPORTS ERROR]:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [reportType, currentDate, startDate, endDate]);

  const nextPeriod = () => {
    if (reportType === 'daily') {
      setCurrentDate(prev => subDays(prev, -1));
    } else if (reportType === 'monthly') {
      setCurrentDate(prev => subMonths(prev, -1));
    }
  };

  const prevPeriod = () => {
    if (reportType === 'daily') {
      setCurrentDate(prev => subDays(prev, 1));
    } else if (reportType === 'monthly') {
      setCurrentDate(prev => subMonths(prev, 1));
    }
  };

  // Filter items by search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase().trim();
    return items.filter(it => 
      it.name.toLowerCase().includes(q) || 
      it.unit.toLowerCase().includes(q)
    );
  }, [items, searchQuery]);

  // Critical stock items (current stock <= min_stock or <= 0)
  const criticalItems = useMemo(() => {
    return items.filter(it => {
      const stats = itemStats[it.id];
      const current = stats ? stats.final : (it.current_stock ?? 0);
      return current <= (it.min_stock || 5);
    });
  }, [items, itemStats]);

  // Transactions filtered by search & active tab
  const displayedTransactions = useMemo(() => {
    let list = transactions;
    if (activeTab === 'incoming') {
      list = list.filter(t => t.type === 'IN');
    } else if (activeTab === 'outgoing') {
      list = list.filter(t => t.type === 'OUT');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(t => 
        (t.items?.name || '').toLowerCase().includes(q) || 
        (t.notes || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [transactions, activeTab, searchQuery]);

  // KPIs
  const totalRestoIn = useMemo(() => {
    return (Object.values(itemStats) as Array<{ in?: number; out?: number }>).reduce((acc, s) => acc + (s?.in || 0), 0);
  }, [itemStats]);

  const totalRestoOut = useMemo(() => {
    return (Object.values(itemStats) as Array<{ in?: number; out?: number }>).reduce((acc, s) => acc + (s?.out || 0), 0);
  }, [itemStats]);

  const totalCriticalCount = criticalItems.length;

  // Chart data for Top Resto Items (Max 8 items)
  const chartData = useMemo(() => {
    const dataWithActivity = items
      .map(it => {
        const stats = itemStats[it.id] || { initial: 0, in: 0, out: 0, final: 0 };
        return {
          name: it.name.length > 15 ? it.name.substring(0, 15) + '...' : it.name,
          fullName: it.name,
          in: stats.in,
          out: stats.out,
          totalActivity: stats.in + stats.out
        };
      })
      .filter(d => d.totalActivity > 0)
      .sort((a, b) => b.totalActivity - a.totalActivity)
      .slice(0, 8);

    return dataWithActivity;
  }, [items, itemStats]);

  // PDF Export specifically designed for Restaurant / Kitchen
  const exportToPDF = () => {
    const doc = new jsPDF();
    let periodStr = '';
    if (reportType === 'daily') periodStr = format(currentDate, 'dd MMMM yyyy');
    else if (reportType === 'monthly') periodStr = format(currentDate, 'MMMM yyyy');
    else periodStr = `${format(new Date(startDate), 'dd/MM/yyyy')} - ${format(new Date(endDate), 'dd/MM/yyyy')}`;

    let categoryTitle = 'Rekap Stok & Mutasi Restoran';
    if (activeTab === 'incoming') categoryTitle = 'Barang Masuk Restoran';
    else if (activeTab === 'outgoing') categoryTitle = 'Pemakaian & Pengeluaran Restoran';
    else if (activeTab === 'critical') categoryTitle = 'Daftar Bahan Restoran Menipis / Kritis';

    // Header Branding
    doc.setFillColor(230, 92, 0); // Hotel Alia Orange
    doc.rect(0, 0, 210, 14, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('HOTEL ALIA MATRAMAN - DEPARTEMEN RESTORAN & F&B', 14, 9);

    doc.setTextColor(33, 33, 33);
    doc.setFontSize(16);
    doc.text(`LAPORAN ${categoryTitle.toUpperCase()}`, 14, 26);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`Periode: ${periodStr}  |  Dicetak: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 33);
    doc.text(`Total Bahan Resto: ${items.length} Item  |  Total Masuk: ${totalRestoIn}  |  Total Pemakaian: ${totalRestoOut}`, 14, 39);

    if (activeTab === 'stock' || activeTab === 'critical') {
      const targetItems = activeTab === 'critical' ? criticalItems : filteredItems;
      const tableData = targetItems.map((item, idx) => {
        const stats = itemStats[item.id] || { initial: 0, in: 0, out: 0, final: 0 };
        const status = stats.final <= 0 ? 'HABIS' : stats.final <= (item.min_stock || 5) ? 'MENIPIS' : 'AMAN';
        return [
          (idx + 1).toString(),
          item.name,
          item.department || 'Resto',
          stats.initial.toString(),
          stats.in.toString(),
          stats.out.toString(),
          stats.final.toString(),
          item.unit || 'pcs',
          status
        ];
      });

      autoTable(doc, {
        startY: 46,
        head: [['No', 'Nama Barang', 'Dept', 'Awal', 'Masuk', 'Keluar', 'Akhir', 'Satuan', 'Status']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [230, 92, 0], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 8.5, cellPadding: 2.5 },
        alternateRowStyles: { fillColor: [255, 248, 240] }
      });
    } else {
      const tableData = displayedTransactions.map((tx, idx) => [
        (idx + 1).toString(),
        format(new Date(tx.created_at), 'dd/MM/yyyy HH:mm'),
        tx.items?.name || '-',
        tx.department || 'Resto',
        tx.type === 'IN' ? 'MASUK' : 'KELUAR',
        tx.quantity.toString(),
        tx.items?.unit || 'pcs',
        tx.notes || '-'
      ]);

      autoTable(doc, {
        startY: 46,
        head: [['No', 'Waktu', 'Nama Barang', 'Dept', 'Tipe', 'Jumlah', 'Satuan', 'Keterangan']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [230, 92, 0], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 8.5, cellPadding: 2.5 },
        alternateRowStyles: { fillColor: [255, 248, 240] }
      });
    }

    // Signatures
    const finalY = (doc as any).lastAutoTable?.finalY || 180;
    if (finalY < 230) {
      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);
      doc.text('Disiapkan Oleh,', 25, finalY + 20);
      doc.text('Supervisor Restoran / Chef', 25, finalY + 40);
      
      doc.text('Disetujui Oleh,', 140, finalY + 20);
      doc.text('Kepala Gudang / Logistik', 140, finalY + 40);
    }

    doc.save(`Laporan_Resto_${activeTab}_${format(currentDate, 'yyyyMMdd')}.pdf`);
  };

  // CSV Export
  const exportToCSV = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    
    if (activeTab === 'stock' || activeTab === 'critical') {
      const targetItems = activeTab === 'critical' ? criticalItems : filteredItems;
      csvContent += 'No,Nama Barang,Dept,Awal,Masuk,Keluar,Akhir,Satuan,Status\n';
      targetItems.forEach((item, idx) => {
        const stats = itemStats[item.id] || { initial: 0, in: 0, out: 0, final: 0 };
        const status = stats.final <= 0 ? 'HABIS' : stats.final <= (item.min_stock || 5) ? 'MENIPIS' : 'AMAN';
        const row = [
          idx + 1,
          `"${item.name.replace(/"/g, '""')}"`,
          `"${item.department || 'Resto'}"`,
          stats.initial,
          stats.in,
          stats.out,
          stats.final,
          `"${item.unit || 'pcs'}"`,
          `"${status}"`
        ].join(',');
        csvContent += row + '\n';
      });
    } else {
      csvContent += 'No,Waktu,Nama Barang,Dept,Tipe,Jumlah,Satuan,Keterangan\n';
      displayedTransactions.forEach((tx, idx) => {
        const row = [
          idx + 1,
          `"${format(new Date(tx.created_at), 'yyyy-MM-dd HH:mm')}"`,
          `"${(tx.items?.name || '-').replace(/"/g, '""')}"`,
          `"${tx.department || 'Resto'}"`,
          tx.type,
          tx.quantity,
          `"${tx.items?.unit || 'pcs'}"`,
          `"${(tx.notes || '-').replace(/"/g, '""')}"`
        ].join(',');
        csvContent += row + '\n';
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Laporan_Resto_${activeTab}_${format(currentDate, 'yyyyMMdd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-20 md:pb-6 font-sans">
      {/* Header Banner - Resto Dedicated */}
      <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 rounded-2xl p-4 sm:p-6 text-white shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-white/5 transform skew-x-12 pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-inner text-white shrink-0">
              <UtensilsCrossed className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md bg-white/25 text-[10px] font-black tracking-wider uppercase text-amber-100">
                  DEPARTEMEN RESTORAN
                </span>
                <span className="text-xs text-amber-100/90 font-medium">Hotel Alia Matraman</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white mt-0.5">
                Laporan Inventaris & Pemakaian Resto
              </h1>
              <p className="text-xs sm:text-sm text-amber-100 mt-1 max-w-xl font-medium">
                Rekapitulasi terpisah khusus stok bahan makanan, minuman, pasokan masuk, dan konsumsi dapur restoran.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto">
            <button
              onClick={exportToCSV}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-white/15 hover:bg-white/25 active:bg-white/30 text-white rounded-xl text-xs font-bold transition-all backdrop-blur-md border border-white/20"
              title="Download CSV"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>CSV</span>
            </button>

            <button
              onClick={exportToPDF}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white text-orange-700 hover:bg-amber-50 active:bg-amber-100 rounded-xl text-xs font-black transition-all shadow-md"
              title="Download PDF Resmi"
            >
              <Download className="w-4 h-4" />
              <span>Unduh PDF Resto</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {/* KPI 1: Total Resto Items */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200/90 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Item Restoran</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <ChefHat className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-gray-900">{items.length}</span>
            <span className="text-xs text-gray-500 font-semibold">Bahan/Barang</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1 font-medium">Terdaftar di master resto</p>
        </div>

        {/* KPI 2: Pasokan Masuk Resto */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200/90 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Bahan Masuk</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <ArrowDownCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-600">+{totalRestoIn}</span>
            <span className="text-xs text-gray-500 font-semibold">Qty</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1 font-medium">Total pasokan periode ini</p>
        </div>

        {/* KPI 3: Pemakaian Dapur */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200/90 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Pemakaian Resto</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <ArrowUpCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-blue-600">-{totalRestoOut}</span>
            <span className="text-xs text-gray-500 font-semibold">Qty</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1 font-medium">Konsumsi masak & operasional</p>
        </div>

        {/* KPI 4: Stok Kritis */}
        <div className={cn(
          "p-4 rounded-2xl border shadow-sm transition-colors",
          totalCriticalCount > 0 
            ? "bg-red-50/50 border-red-200" 
            : "bg-white border-gray-200/90"
        )}>
          <div className="flex items-center justify-between">
            <span className={cn(
              "text-xs font-bold uppercase tracking-wider",
              totalCriticalCount > 0 ? "text-red-700" : "text-gray-500"
            )}>
              Stok Kritis / Menipis
            </span>
            <div className={cn(
              "p-2 rounded-xl",
              totalCriticalCount > 0 ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-400"
            )}>
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={cn(
              "text-2xl font-black",
              totalCriticalCount > 0 ? "text-red-600" : "text-gray-900"
            )}>
              {totalCriticalCount}
            </span>
            <span className="text-xs text-gray-500 font-semibold">Item</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1 font-medium">Perlu segera restock/belanja</p>
        </div>
      </div>

      {/* Control Bar: Mode Tabs & Date Period Selector */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200/90 shadow-sm space-y-4">
        {/* Top row: Tab Categories */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-gray-100/90 rounded-xl w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('stock')}
              className={cn(
                "flex-1 sm:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                activeTab === 'stock'
                  ? "bg-white text-gray-900 shadow-sm font-extrabold"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-200/60"
              )}
            >
              <Package className="w-3.5 h-3.5 text-amber-600" />
              <span>Stok & Mutasi</span>
            </button>

            <button
              onClick={() => setActiveTab('incoming')}
              className={cn(
                "flex-1 sm:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                activeTab === 'incoming'
                  ? "bg-white text-emerald-700 shadow-sm font-extrabold"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-200/60"
              )}
            >
              <ArrowDownCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>Bahan Masuk</span>
            </button>

            <button
              onClick={() => setActiveTab('outgoing')}
              className={cn(
                "flex-1 sm:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                activeTab === 'outgoing'
                  ? "bg-white text-blue-700 shadow-sm font-extrabold"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-200/60"
              )}
            >
              <ArrowUpCircle className="w-3.5 h-3.5 text-blue-600" />
              <span>Pemakaian Dapur</span>
            </button>

            <button
              onClick={() => setActiveTab('critical')}
              className={cn(
                "flex-1 sm:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                activeTab === 'critical'
                  ? "bg-red-600 text-white shadow-sm font-extrabold"
                  : "text-gray-600 hover:text-red-600 hover:bg-red-50"
              )}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Kritis ({totalCriticalCount})</span>
            </button>
          </div>

          {/* Period Type Buttons (Daily / Monthly / Custom) */}
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl w-full sm:w-auto justify-center">
            <button
              onClick={() => setReportType('daily')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                reportType === 'daily'
                  ? "bg-white text-amber-700 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              Harian
            </button>
            <button
              onClick={() => setReportType('monthly')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                reportType === 'monthly'
                  ? "bg-white text-amber-700 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              Bulanan
            </button>
            <button
              onClick={() => setReportType('custom')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                reportType === 'custom'
                  ? "bg-white text-amber-700 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              Rentang
            </button>
          </div>
        </div>

        {/* Bottom row: Period Navigator & Search Input */}
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-3 border-t border-gray-100">
          {/* Period Nav */}
          {reportType !== 'custom' ? (
            <div className="flex items-center justify-between sm:justify-start gap-2">
              <button
                onClick={prevPeriod}
                className="p-2 hover:bg-gray-100 rounded-xl border border-gray-200 text-gray-700 transition-colors"
                title="Periode Sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs font-bold text-amber-900">
                <CalendarIcon className="w-3.5 h-3.5 text-amber-600" />
                <span>
                  {reportType === 'daily'
                    ? format(currentDate, 'dd MMMM yyyy')
                    : format(currentDate, 'MMMM yyyy')}
                </span>
              </div>
              <button
                onClick={nextPeriod}
                className="p-2 hover:bg-gray-100 rounded-xl border border-gray-200 text-gray-700 transition-colors"
                title="Periode Berikutnya"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-900 focus:outline-none focus:border-amber-500"
              />
              <span className="text-xs text-gray-400 font-bold">s/d</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-900 focus:outline-none focus:border-amber-500"
              />
            </div>
          )}

          {/* Search box */}
          <div className="relative min-w-[220px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari bahan resto..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-900 focus:outline-none focus:border-amber-500 focus:bg-white transition-all"
            />
          </div>
        </div>
      </div>

      {/* Chart Section: Top Resto Items Activity */}
      {chartData.length > 0 && (activeTab === 'stock' || activeTab === 'outgoing') && (
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-gray-200/90 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                <span>Aktivitas Bahan Restoran Paling Aktif</span>
              </h3>
              <p className="text-xs text-gray-500 mt-0.5 font-medium">Perbandingan pasokan masuk vs pemakaian dapur pada periode ini</p>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                <XAxis 
                  dataKey="name" 
                  tick={{ fontSize: 11, fill: '#6B7280' }} 
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: '1px solid #E5E7EB', 
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    fontSize: '12px' 
                  }}
                  formatter={(value: any, name: any) => [
                    `${value} item`,
                    name === 'in' ? 'Bahan Masuk' : 'Pemakaian Resto'
                  ]}
                  labelFormatter={(label, payload) => {
                    if (payload && payload[0]) {
                      return (payload[0].payload as any).fullName;
                    }
                    return label;
                  }}
                />
                <Legend 
                  verticalAlign="top" 
                  align="right"
                  wrapperStyle={{ paddingBottom: '10px', fontSize: '12px' }}
                  formatter={(value) => (value === 'in' ? 'Bahan Masuk' : 'Pemakaian Resto')}
                />
                <Bar dataKey="in" name="in" fill="#10B981" radius={[4, 4, 0, 0]} barSize={16} />
                <Bar dataKey="out" name="out" fill="#3B82F6" radius={[4, 4, 0, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Main Table View */}
      <div className="bg-white rounded-2xl border border-gray-200/90 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div>
            <h2 className="text-sm font-black text-gray-900 tracking-tight flex items-center gap-2">
              <span>
                {activeTab === 'stock' && 'Rincian Stok & Mutasi Restoran'}
                {activeTab === 'incoming' && 'Riwayat Bahan Masuk Restoran'}
                {activeTab === 'outgoing' && 'Riwayat Pemakaian & Pengeluaran Restoran'}
                {activeTab === 'critical' && 'Daftar Bahan Kritis / Menipis'}
              </span>
            </h2>
            <p className="text-[11px] text-gray-500 font-medium">
              {activeTab === 'stock' && `Menampilkan ${filteredItems.length} item bahan restoran`}
              {activeTab === 'critical' && `Menampilkan ${criticalItems.length} item berstatus stok kritis`}
              {(activeTab === 'incoming' || activeTab === 'outgoing') && `Menampilkan ${displayedTransactions.length} baris riwayat`}
            </p>
          </div>
          <button
            onClick={fetchData}
            className="p-2 hover:bg-gray-200/60 rounded-xl text-gray-600 transition-colors"
            title="Refresh Data"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin text-amber-600")} />
          </button>
        </div>

        <div className="overflow-x-auto">
          {activeTab === 'stock' || activeTab === 'critical' ? (
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-600 border-b border-gray-200 font-extrabold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-3 py-3 text-center w-12">No</th>
                  <th className="px-4 py-3">Nama Barang</th>
                  <th className="px-3 py-3 text-center">Dept</th>
                  <th className="px-4 py-3 text-center">Awal</th>
                  <th className="px-4 py-3 text-center text-emerald-600">Masuk</th>
                  <th className="px-4 py-3 text-center text-blue-600">Keluar</th>
                  <th className="px-4 py-3 text-center">Akhir</th>
                  <th className="px-3 py-3 text-center">Satuan</th>
                  <th className="px-3 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-gray-500 font-medium">
                      Memuat data inventaris restoran...
                    </td>
                  </tr>
                ) : (activeTab === 'critical' ? criticalItems : filteredItems).length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-gray-500 font-medium">
                      {activeTab === 'critical' 
                        ? '🎉 Semua stok bahan restoran dalam kondisi aman.' 
                        : 'Tidak ada bahan restoran yang cocok dengan pencarian.'}
                    </td>
                  </tr>
                ) : (
                  (activeTab === 'critical' ? criticalItems : filteredItems).map((item, idx) => {
                    const stats = itemStats[item.id] || { initial: 0, in: 0, out: 0, final: 0 };
                    const isZero = stats.final <= 0;
                    const isLow = stats.final <= (item.min_stock || 5);

                    return (
                      <tr key={item.id} className="hover:bg-amber-50/20 transition-colors">
                        <td className="px-3 py-3 text-center text-gray-400 font-medium font-mono text-[11px]">
                          {idx + 1}
                        </td>
                        <td className="px-4 py-3 font-bold text-gray-900">
                          {item.name}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-800 text-[10px] font-bold rounded-md border border-amber-200/60 uppercase">
                            {item.department || 'Resto'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600 font-semibold font-mono">
                          {stats.initial}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-emerald-600 font-mono">
                          {stats.in > 0 ? `+${stats.in}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-blue-600 font-mono">
                          {stats.out > 0 ? `-${stats.out}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-center font-black text-gray-900 font-mono text-sm">
                          {stats.final}
                        </td>
                        <td className="px-3 py-3 text-center text-gray-500 font-medium">
                          {item.unit || 'pcs'}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {isZero ? (
                            <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-black rounded-lg uppercase">
                              HABIS
                            </span>
                          ) : isLow ? (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-black rounded-lg uppercase">
                              MENIPIS
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded-lg uppercase">
                              AMAN
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-600 border-b border-gray-200 font-extrabold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-3 py-3 text-center w-12">No</th>
                  <th className="px-4 py-3">Waktu</th>
                  <th className="px-4 py-3">Nama Barang</th>
                  <th className="px-3 py-3 text-center">Dept</th>
                  <th className="px-4 py-3 text-center">Tipe</th>
                  <th className="px-4 py-3 text-center">Jumlah</th>
                  <th className="px-4 py-3">Keterangan / Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500 font-medium">
                      Memuat riwayat transaksi resto...
                    </td>
                  </tr>
                ) : displayedTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500 font-medium">
                      Tidak ada transaksi resto pada periode ini.
                    </td>
                  </tr>
                ) : (
                  displayedTransactions.map((tx, idx) => (
                    <tr key={tx.id} className="hover:bg-amber-50/20 transition-colors">
                      <td className="px-3 py-3 text-center text-gray-400 font-medium font-mono text-[11px]">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-[11px]">
                        {format(new Date(tx.created_at), 'dd/MM/yyyy HH:mm')}
                      </td>
                      <td className="px-4 py-3 font-bold text-gray-900">
                        {tx.items?.name || '-'}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="px-2 py-0.5 bg-amber-50 text-amber-800 text-[10px] font-bold rounded-md border border-amber-200/60 uppercase">
                          {tx.department || 'Resto'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          "px-2 py-0.5 rounded-lg text-[10px] font-black uppercase",
                          tx.type === 'IN'
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-blue-50 text-blue-700 border border-blue-200"
                        )}>
                          {tx.type === 'IN' ? 'MASUK' : 'KELUAR'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-black text-gray-900 font-mono text-sm">
                        {tx.quantity} <span className="text-[11px] font-normal text-gray-500">{tx.items?.unit || 'pcs'}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-xs truncate font-medium">
                        {tx.notes || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
