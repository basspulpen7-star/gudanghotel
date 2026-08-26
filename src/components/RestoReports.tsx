import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Transaction, Item } from '../types';
import { useAuth } from '../contexts/AuthContext';
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
  const { role, profile } = useAuth();
  const isStaffGudang = role === 'staff' || role === 'logistik' || (profile?.role && ['staff', 'logistik'].includes(profile.role));

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

    let categoryTitle = 'Laporan Stok & Mutasi Barang Resto';
    if (activeTab === 'incoming') categoryTitle = 'Barang Masuk Restoran';
    else if (activeTab === 'outgoing') categoryTitle = 'Pemakaian & Pengeluaran Restoran';
    else if (activeTab === 'critical') categoryTitle = 'Daftar Bahan Restoran Menipis / Kritis';

    // Header Branding
    doc.setFillColor(200, 155, 60); // Gold tone
    doc.rect(0, 0, 210, 14, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('HOTEL ALIA MATRAMAN - LAPORAN BARANG RESTORAN', 14, 9);

    doc.setTextColor(33, 33, 33);
    doc.setFontSize(15);
    doc.text(categoryTitle.toUpperCase(), 14, 26);

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`Periode: ${periodStr}  |  Dicetak: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 33);
    doc.text(`Total Barang Resto: ${items.length} Item  |  Total Masuk: ${totalRestoIn}  |  Total Keluar: ${totalRestoOut}`, 14, 39);

    if (activeTab === 'stock' || activeTab === 'critical' || isStaffGudang) {
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
        headStyles: { fillColor: [42, 48, 58], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 8.5, cellPadding: 2.5 },
        alternateRowStyles: { fillColor: [245, 246, 248] }
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
        headStyles: { fillColor: [42, 48, 58], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 8.5, cellPadding: 2.5 },
        alternateRowStyles: { fillColor: [245, 246, 248] }
      });
    }

    // Signatures
    const finalY = (doc as any).lastAutoTable?.finalY || 180;
    if (finalY < 230) {
      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);
      doc.text('Disiapkan Oleh,', 25, finalY + 20);
      doc.text('Petugas Gudang / Resto', 25, finalY + 40);
      
      doc.text('Disetujui Oleh,', 140, finalY + 20);
      doc.text('Kepala Gudang / Logistik', 140, finalY + 40);
    }

    doc.save(`Laporan_Barang_Resto_${format(currentDate, 'yyyyMMdd')}.pdf`);
  };

  // CSV Export
  const exportToCSV = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    
    if (activeTab === 'stock' || activeTab === 'critical' || isStaffGudang) {
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
    link.setAttribute('download', `Laporan_Barang_Resto_${format(currentDate, 'yyyyMMdd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-20 md:pb-6 font-sans">
      {/* Header Banner */}
      <div className="bg-[#252B34] rounded-2xl p-4 sm:p-6 text-[#F1F3F5] border border-[#343B46] shadow-[0_4px_20px_rgba(0,0,0,0.18)] relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#1D2128] border border-[#343B46] p-2 flex items-center justify-center shrink-0 shadow-inner">
              <img src="/alia-logo.png" alt="Hotel Alia Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md bg-[#C89B3C]/20 text-[10px] font-black tracking-wider uppercase text-[#E0B85A] border border-[#C89B3C]/30">
                  DEPARTEMEN RESTORAN
                </span>
                <span className="text-xs text-[#8E99A6] font-medium">Hotel Alia Matraman</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#F1F3F5] mt-1">
                Laporan Barang Resto
              </h1>
              <p className="text-xs sm:text-sm text-[#8E99A6] mt-0.5 max-w-xl font-medium">
                Rekapitulasi stok barang resto: nama barang, departemen, saldo awal, barang masuk, barang keluar, dan saldo akhir.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto">
            <button
              onClick={exportToCSV}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-[#20252D] hover:bg-[#2A303A] text-[#D8DEE6] rounded-xl text-xs font-bold transition-all border border-[#3A424D] cursor-pointer"
              title="Download CSV"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#8E99A6]" />
              <span>CSV</span>
            </button>

            <button
              onClick={exportToPDF}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-[#E6B85C] to-[#C89B3C] hover:brightness-110 text-[#171A1F] rounded-xl text-xs font-black transition-all shadow-sm cursor-pointer"
              title="Download PDF"
            >
              <Download className="w-4 h-4 stroke-[2.5]" />
              <span>Unduh PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {/* KPI 1: Total Resto Items */}
        <div className="bg-[#252B34] p-4 rounded-2xl border border-[#343B46] shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#8E99A6] uppercase tracking-wider">Item Resto</span>
            <div className="p-2 bg-[#C89B3C]/15 text-[#E0B85A] rounded-xl">
              <ChefHat className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-[#F1F3F5]">{items.length}</span>
            <span className="text-xs text-[#8E99A6] font-semibold">Bahan/Barang</span>
          </div>
          <p className="text-[11px] text-[#6F7985] mt-1 font-medium">Terdaftar di departemen Resto</p>
        </div>

        {/* KPI 2: Pasokan Masuk Resto */}
        <div className="bg-[#252B34] p-4 rounded-2xl border border-[#343B46] shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#8E99A6] uppercase tracking-wider">Barang Masuk</span>
            <div className="p-2 bg-[#55B685]/15 text-[#55B685] rounded-xl">
              <ArrowDownCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-[#55B685]">+{totalRestoIn}</span>
            <span className="text-xs text-[#8E99A6] font-semibold">Qty</span>
          </div>
          <p className="text-[11px] text-[#6F7985] mt-1 font-medium">Total pasokan masuk periode ini</p>
        </div>

        {/* KPI 3: Pemakaian Resto */}
        <div className="bg-[#252B34] p-4 rounded-2xl border border-[#343B46] shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#8E99A6] uppercase tracking-wider">Barang Keluar</span>
            <div className="p-2 bg-[#C89B3C]/15 text-[#E0B85A] rounded-xl">
              <ArrowUpCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-[#E0B85A]">-{totalRestoOut}</span>
            <span className="text-xs text-[#8E99A6] font-semibold">Qty</span>
          </div>
          <p className="text-[11px] text-[#6F7985] mt-1 font-medium">Total pengambilan / pemakaian</p>
        </div>

        {/* KPI 4: Stok Kritis */}
        <div className={cn(
          "p-4 rounded-2xl border shadow-[0_4px_20px_rgba(0,0,0,0.18)] transition-colors",
          totalCriticalCount > 0 
            ? "bg-[#252B34] border-[#EB5757]/40" 
            : "bg-[#252B34] border-[#343B46]"
        )}>
          <div className="flex items-center justify-between">
            <span className={cn(
              "text-xs font-bold uppercase tracking-wider",
              totalCriticalCount > 0 ? "text-[#F87171]" : "text-[#8E99A6]"
            )}>
              Stok Kritis / Menipis
            </span>
            <div className={cn(
              "p-2 rounded-xl",
              totalCriticalCount > 0 ? "bg-[#EB5757]/20 text-[#F87171]" : "bg-[#20252D] text-[#8E99A6]"
            )}>
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={cn(
              "text-2xl font-black",
              totalCriticalCount > 0 ? "text-[#F87171]" : "text-[#F1F3F5]"
            )}>
              {totalCriticalCount}
            </span>
            <span className="text-xs text-[#8E99A6] font-semibold">Item</span>
          </div>
          <p className="text-[11px] text-[#6F7985] mt-1 font-medium">Perlu segera restock</p>
        </div>
      </div>

      {/* Control Bar: Mode Tabs & Date Period Selector */}
      <div className="bg-[#252B34] p-4 rounded-2xl border border-[#343B46] shadow-[0_4px_20px_rgba(0,0,0,0.18)] space-y-4">
        {/* Top row: Tab Categories (Staff Gudang focuses on Stock Report) */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          {!isStaffGudang ? (
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#20252D] rounded-xl w-full sm:w-auto border border-[#3A424D]">
              <button
                onClick={() => setActiveTab('stock')}
                className={cn(
                  "flex-1 sm:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                  activeTab === 'stock'
                    ? "bg-[#2A303A] text-[#F1F3F5] shadow-xs font-extrabold border border-[#3A424D]"
                    : "text-[#8E99A6] hover:text-[#F1F3F5] hover:bg-[#2A303A]/50"
                )}
              >
                <Package className="w-3.5 h-3.5 text-[#E0B85A]" />
                <span>Stok & Mutasi</span>
              </button>

              <button
                onClick={() => setActiveTab('incoming')}
                className={cn(
                  "flex-1 sm:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                  activeTab === 'incoming'
                    ? "bg-[#2A303A] text-[#55B685] shadow-xs font-extrabold border border-[#3A424D]"
                    : "text-[#8E99A6] hover:text-[#F1F3F5] hover:bg-[#2A303A]/50"
                )}
              >
                <ArrowDownCircle className="w-3.5 h-3.5 text-[#55B685]" />
                <span>Bahan Masuk</span>
              </button>

              <button
                onClick={() => setActiveTab('outgoing')}
                className={cn(
                  "flex-1 sm:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                  activeTab === 'outgoing'
                    ? "bg-[#2A303A] text-[#E0B85A] shadow-xs font-extrabold border border-[#3A424D]"
                    : "text-[#8E99A6] hover:text-[#F1F3F5] hover:bg-[#2A303A]/50"
                )}
              >
                <ArrowUpCircle className="w-3.5 h-3.5 text-[#E0B85A]" />
                <span>Pemakaian Resto</span>
              </button>

              <button
                onClick={() => setActiveTab('critical')}
                className={cn(
                  "flex-1 sm:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                  activeTab === 'critical'
                    ? "bg-[#EB5757] text-[#171A1F] shadow-xs font-extrabold"
                    : "text-[#8E99A6] hover:text-[#F87171] hover:bg-[#EB5757]/10"
                )}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Kritis ({totalCriticalCount})</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 bg-[#C89B3C]/15 text-[#E0B85A] text-xs font-bold rounded-xl border border-[#C89B3C]/30 flex items-center gap-2">
                <Package className="w-4 h-4 text-[#E0B85A]" />
                <span>Laporan Khusus Barang Resto (Staff Gudang)</span>
              </span>
            </div>
          )}

          {/* Period Type Buttons (Daily / Monthly / Custom) */}
          <div className="flex items-center gap-1 bg-[#20252D] p-1 rounded-xl w-full sm:w-auto justify-center border border-[#3A424D]">
            <button
              onClick={() => setReportType('daily')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                reportType === 'daily'
                  ? "bg-[#2A303A] text-[#E0B85A] shadow-xs border border-[#3A424D]"
                  : "text-[#8E99A6] hover:text-[#F1F3F5]"
              )}
            >
              Harian
            </button>
            <button
              onClick={() => setReportType('monthly')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                reportType === 'monthly'
                  ? "bg-[#2A303A] text-[#E0B85A] shadow-xs border border-[#3A424D]"
                  : "text-[#8E99A6] hover:text-[#F1F3F5]"
              )}
            >
              Bulanan
            </button>
            <button
              onClick={() => setReportType('custom')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                reportType === 'custom'
                  ? "bg-[#2A303A] text-[#E0B85A] shadow-xs border border-[#3A424D]"
                  : "text-[#8E99A6] hover:text-[#F1F3F5]"
              )}
            >
              Rentang
            </button>
          </div>
        </div>

        {/* Bottom row: Period Navigator & Search Input */}
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-3 border-t border-[#343B46]">
          {/* Period Nav */}
          {reportType !== 'custom' ? (
            <div className="flex items-center justify-between sm:justify-start gap-2">
              <button
                onClick={prevPeriod}
                className="p-2 hover:bg-[#2A303A] rounded-xl border border-[#3A424D] text-[#8E99A6] hover:text-[#F1F3F5] transition-colors cursor-pointer"
                title="Periode Sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 px-3.5 py-1.5 bg-[#20252D] border border-[#3A424D] rounded-xl text-xs font-bold text-[#E0B85A]">
                <CalendarIcon className="w-3.5 h-3.5 text-[#E0B85A]" />
                <span>
                  {reportType === 'daily'
                    ? format(currentDate, 'dd MMMM yyyy')
                    : format(currentDate, 'MMMM yyyy')}
                </span>
              </div>
              <button
                onClick={nextPeriod}
                className="p-2 hover:bg-[#2A303A] rounded-xl border border-[#3A424D] text-[#8E99A6] hover:text-[#F1F3F5] transition-colors cursor-pointer"
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
                className="px-3 py-1.5 bg-[#20252D] border border-[#3A424D] rounded-xl text-xs font-medium text-[#F1F3F5] focus:outline-none focus:border-[#C89B3C]"
              />
              <span className="text-xs text-[#8E99A6] font-bold">s/d</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-1.5 bg-[#20252D] border border-[#3A424D] rounded-xl text-xs font-medium text-[#F1F3F5] focus:outline-none focus:border-[#C89B3C]"
              />
            </div>
          )}

          {/* Search box */}
          <div className="relative min-w-[220px]">
            <Search className="w-4 h-4 text-[#8E99A6] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari nama barang resto..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[#20252D] border border-[#3A424D] rounded-xl text-xs font-medium text-[#F1F3F5] placeholder:text-[#6F7985] focus:outline-none focus:border-[#C89B3C] transition-all"
            />
          </div>
        </div>
      </div>

      {/* Chart Section: Top Resto Items Activity */}
      {chartData.length > 0 && (activeTab === 'stock' || isStaffGudang) && (
        <div className="bg-[#252B34] p-4 sm:p-6 rounded-2xl border border-[#343B46] shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-black text-[#F1F3F5] flex items-center gap-2">
                <span>Aktivitas Barang Resto Teratas</span>
              </h3>
              <p className="text-xs text-[#8E99A6] mt-0.5 font-medium">Perbandingan pasokan masuk vs pemakaian resto pada periode ini</p>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#343B46" />
                <XAxis 
                  dataKey="name" 
                  tick={{ fontSize: 11, fill: '#8E99A6' }} 
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis tick={{ fontSize: 11, fill: '#8E99A6' }} />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: '1px solid #3A424D', 
                    backgroundColor: '#20252D',
                    color: '#F1F3F5',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
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
                <Bar dataKey="in" name="in" fill="#55B685" radius={[4, 4, 0, 0]} barSize={16} />
                <Bar dataKey="out" name="out" fill="#E0B85A" radius={[4, 4, 0, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Main Table View */}
      <div className="bg-[#252B34] rounded-2xl border border-[#343B46] shadow-[0_4px_20px_rgba(0,0,0,0.18)] overflow-hidden">
        <div className="p-4 border-b border-[#343B46] flex items-center justify-between bg-[#20252D]">
          <div>
            <h2 className="text-sm font-black text-[#F1F3F5] tracking-tight flex items-center gap-2">
              <span>
                {(activeTab === 'stock' || isStaffGudang) && 'Rincian Stok Barang Resto (Awal, Masuk, Keluar, Akhir)'}
                {!isStaffGudang && activeTab === 'incoming' && 'Riwayat Bahan Masuk Restoran'}
                {!isStaffGudang && activeTab === 'outgoing' && 'Riwayat Pemakaian & Pengeluaran Restoran'}
                {!isStaffGudang && activeTab === 'critical' && 'Daftar Bahan Kritis / Menipis'}
              </span>
            </h2>
            <p className="text-[11px] text-[#8E99A6] font-medium">
              {(activeTab === 'stock' || isStaffGudang) && `Menampilkan ${filteredItems.length} item bahan/barang resto`}
              {!isStaffGudang && activeTab === 'critical' && `Menampilkan ${criticalItems.length} item berstatus stok kritis`}
              {!isStaffGudang && (activeTab === 'incoming' || activeTab === 'outgoing') && `Menampilkan ${displayedTransactions.length} baris riwayat`}
            </p>
          </div>
          <button
            onClick={fetchData}
            className="p-2 hover:bg-[#2A303A] rounded-xl text-[#8E99A6] hover:text-[#F1F3F5] transition-colors cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin text-[#E0B85A]")} />
          </button>
        </div>

        <div className="overflow-x-auto">
          {activeTab === 'stock' || activeTab === 'critical' || isStaffGudang ? (
            <table className="w-full text-left text-xs">
              <thead className="bg-[#20252D] text-[#8E99A6] border-b border-[#343B46] font-extrabold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-3 py-3 text-center w-12">No</th>
                  <th className="px-4 py-3">Nama Barang</th>
                  <th className="px-3 py-3 text-center">Dept</th>
                  <th className="px-4 py-3 text-center">Awal</th>
                  <th className="px-4 py-3 text-center text-[#55B685]">Masuk</th>
                  <th className="px-4 py-3 text-center text-[#E0B85A]">Keluar</th>
                  <th className="px-4 py-3 text-center">Akhir</th>
                  <th className="px-3 py-3 text-center">Satuan</th>
                  <th className="px-3 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#343B46]">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-[#8E99A6] font-medium">
                      Memuat data inventaris restoran...
                    </td>
                  </tr>
                ) : (activeTab === 'critical' && !isStaffGudang ? criticalItems : filteredItems).length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-[#8E99A6] font-medium">
                      {activeTab === 'critical' 
                        ? 'Semua stok bahan restoran dalam kondisi aman.' 
                        : 'Tidak ada bahan restoran yang cocok dengan pencarian.'}
                    </td>
                  </tr>
                ) : (
                  (activeTab === 'critical' && !isStaffGudang ? criticalItems : filteredItems).map((item, idx) => {
                    const stats = itemStats[item.id] || { initial: 0, in: 0, out: 0, final: 0 };
                    const isZero = stats.final <= 0;
                    const isLow = stats.final <= (item.min_stock || 5);

                    return (
                      <tr key={item.id} className="hover:bg-[#2A303A]/70 transition-colors">
                        <td className="px-3 py-3 text-center text-[#6F7985] font-medium font-mono text-[11px]">
                          {idx + 1}
                        </td>
                        <td className="px-4 py-3 font-bold text-[#F1F3F5]">
                          {item.name}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="px-2 py-0.5 bg-[#C89B3C]/15 text-[#E0B85A] text-[10px] font-bold rounded-md border border-[#C89B3C]/30 uppercase">
                            {item.department || 'Resto'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-[#D8DEE6] font-semibold font-mono">
                          {stats.initial}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-[#55B685] font-mono">
                          {stats.in > 0 ? `+${stats.in}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-[#E0B85A] font-mono">
                          {stats.out > 0 ? `-${stats.out}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-center font-black text-[#F1F3F5] font-mono text-sm">
                          {stats.final}
                        </td>
                        <td className="px-3 py-3 text-center text-[#8E99A6] font-medium">
                          {item.unit || 'pcs'}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {isZero ? (
                            <span className="px-2 py-0.5 bg-[#EB5757]/15 text-[#EB5757] border border-[#EB5757]/30 text-[10px] font-black rounded-lg uppercase">
                              HABIS
                            </span>
                          ) : isLow ? (
                            <span className="px-2 py-0.5 bg-[#C89B3C]/15 text-[#E0B85A] border border-[#C89B3C]/30 text-[10px] font-black rounded-lg uppercase">
                              MENIPIS
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-[#55B685]/15 text-[#55B685] border border-[#55B685]/30 text-[10px] font-black rounded-lg uppercase">
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
              <thead className="bg-[#20252D] text-[#8E99A6] border-b border-[#343B46] font-extrabold uppercase tracking-wider text-[10px]">
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
              <tbody className="divide-y divide-[#343B46]">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-[#8E99A6] font-medium">
                      Memuat riwayat transaksi resto...
                    </td>
                  </tr>
                ) : displayedTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-[#8E99A6] font-medium">
                      Tidak ada transaksi resto pada periode ini.
                    </td>
                  </tr>
                ) : (
                  displayedTransactions.map((tx, idx) => (
                    <tr key={tx.id} className="hover:bg-[#2A303A]/70 transition-colors">
                      <td className="px-3 py-3 text-center text-[#6F7985] font-medium font-mono text-[11px]">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3 text-[#8E99A6] font-mono text-[11px]">
                        {format(new Date(tx.created_at), 'dd/MM/yyyy HH:mm')}
                      </td>
                      <td className="px-4 py-3 font-bold text-[#F1F3F5]">
                        {tx.items?.name || '-'}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="px-2 py-0.5 bg-[#C89B3C]/15 text-[#E0B85A] text-[10px] font-bold rounded-md border border-[#C89B3C]/30 uppercase">
                          {tx.department || 'Resto'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          "px-2 py-0.5 rounded-lg text-[10px] font-black uppercase",
                          tx.type === 'IN'
                            ? "bg-[#55B685]/15 text-[#55B685] border border-[#55B685]/30"
                            : "bg-[#C89B3C]/15 text-[#E0B85A] border border-[#C89B3C]/30"
                        )}>
                          {tx.type === 'IN' ? 'MASUK' : 'KELUAR'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-black text-[#F1F3F5] font-mono text-sm">
                        {tx.quantity} <span className="text-[11px] font-normal text-[#8E99A6]">{tx.items?.unit || 'pcs'}</span>
                      </td>
                      <td className="px-4 py-3 text-[#D8DEE6] max-w-xs truncate font-medium">
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
