import React, { useState, useMemo } from 'react';
import { useLinenData } from '../hooks/useLinenData';
import { ITEM_TYPES } from '../constants-linen';
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
  BedDouble,
  AlertTriangle,
  Search,
  RefreshCw,
  FileSpreadsheet,
  Layers
} from 'lucide-react';
import { 
  format, 
  startOfDay, 
  endOfDay, 
  startOfMonth, 
  endOfMonth, 
  subDays, 
  subMonths,
  isWithinInterval
} from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '../lib/utils';
import { IncomingItem, OutgoingItem } from '../types-linen';

type ReportType = 'daily' | 'monthly' | 'custom';
type LaundryCategory = 'stock' | 'incoming' | 'outgoing' | 'critical';

export function LaundryReports() {
  const { state, loading, refresh } = useLinenData();
  const [reportType, setReportType] = useState<ReportType>('monthly');
  const [activeTab, setActiveTab] = useState<LaundryCategory>('stock');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [searchQuery, setSearchQuery] = useState('');

  const dateInterval = useMemo(() => {
    let start: Date;
    let end: Date;

    if (reportType === 'daily') {
      start = startOfDay(currentDate);
      end = endOfDay(currentDate);
    } else if (reportType === 'monthly') {
      start = startOfMonth(currentDate);
      end = endOfMonth(currentDate);
    } else {
      start = startOfDay(new Date(startDate));
      end = endOfDay(new Date(endDate));
    }

    return { start, end };
  }, [reportType, currentDate, startDate, endDate]);

  const filterByDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return isWithinInterval(d, dateInterval);
  };

  const filteredIncoming = useMemo(() => {
    return (state.incomingItems || []).filter(item => filterByDate(item.date));
  }, [state.incomingItems, dateInterval]);

  const filteredOutgoing = useMemo(() => {
    return (state.outgoingItems || []).filter(item => filterByDate(item.date));
  }, [state.outgoingItems, dateInterval]);

  const itemStats = useMemo(() => {
    const stats: Record<string, { initial: number; in: number; outLaundry: number; outHk: number; outAfkir: number; outTotal: number; final: number }> = {};
    
    ITEM_TYPES.forEach(type => {
      // Calculate transactions before the start of the period
      const inBefore = (state.incomingItems || [])
        .filter(i => i.itemName === type && new Date(i.date) < dateInterval.start)
        .reduce((acc, i) => acc + Number(i.quantity || 0), 0);
      
      const outBefore = (state.outgoingItems || [])
        .filter(o => o.itemName === type && new Date(o.date) < dateInterval.start)
        .reduce((acc, o) => acc + Number(o.quantity || 0), 0);
      
      // Calculate transactions during the period
      const inPeriod = (state.incomingItems || [])
        .filter(i => i.itemName === type && filterByDate(i.date))
        .reduce((acc, i) => acc + Number(i.quantity || 0), 0);
      
      const outLaundryPeriod = (state.outgoingItems || [])
        .filter(o => o.itemName === type && filterByDate(o.date) && o.destination === 'Laundry')
        .reduce((acc, o) => acc + Number(o.quantity || 0), 0);

      const outHkPeriod = (state.outgoingItems || [])
        .filter(o => o.itemName === type && filterByDate(o.date) && o.destination === 'Diambil HK')
        .reduce((acc, o) => acc + Number(o.quantity || 0), 0);

      const outAfkirPeriod = (state.outgoingItems || [])
        .filter(o => o.itemName === type && filterByDate(o.date) && o.destination === 'Afkir')
        .reduce((acc, o) => acc + Number(o.quantity || 0), 0);

      const outTotalPeriod = outLaundryPeriod + outHkPeriod + outAfkirPeriod;

      // Current Clean Stock
      const cleanItem = state.cleanItems.find(ci => ci.itemName === type);
      const currentQty = cleanItem ? Number(cleanItem.quantity || 0) : 0;
      
      const inAfter = (state.incomingItems || [])
        .filter(i => i.itemName === type && new Date(i.date) > dateInterval.end)
        .reduce((acc, i) => acc + Number(i.quantity || 0), 0);
      
      const outAfter = (state.outgoingItems || [])
        .filter(o => o.itemName === type && new Date(o.date) > dateInterval.end)
        .reduce((acc, o) => acc + Number(o.quantity || 0), 0);

      // Reconstruct historical final stock for the selected period
      const finalStockForPeriod = currentQty - inAfter + outAfter;
      const initialStockForPeriod = finalStockForPeriod - inPeriod + outTotalPeriod;

      stats[type] = {
        initial: initialStockForPeriod,
        in: inPeriod,
        outLaundry: outLaundryPeriod,
        outHk: outHkPeriod,
        outAfkir: outAfkirPeriod,
        outTotal: outTotalPeriod,
        final: finalStockForPeriod
      };
    });

    return stats;
  }, [state, dateInterval, filterByDate]);

  const displayedItems = useMemo(() => {
    let list = ITEM_TYPES.map(type => ({
      name: type,
      ...itemStats[type]
    }));

    if (activeTab === 'critical') {
      list = list.filter(it => it.final <= 5);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(it => it.name.toLowerCase().includes(q));
    }

    return list;
  }, [itemStats, activeTab, searchQuery]);

  const displayedTransactions = useMemo(() => {
    let list: (IncomingItem | OutgoingItem & { type: 'IN' | 'OUT' })[] = [];
    
    if (activeTab === 'incoming') {
      list = filteredIncoming.map(i => ({ ...i, type: 'IN' as const }));
    } else if (activeTab === 'outgoing') {
      list = filteredOutgoing.map(o => ({ ...o, type: 'OUT' as const }));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(t => 
        t.itemName.toLowerCase().includes(q) || 
        (t.description || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [filteredIncoming, filteredOutgoing, activeTab, searchQuery]);

  const nextPeriod = () => {
    if (reportType === 'daily') setCurrentDate(prev => subDays(prev, -1));
    else if (reportType === 'monthly') setCurrentDate(prev => subMonths(prev, -1));
  };

  const prevPeriod = () => {
    if (reportType === 'daily') setCurrentDate(prev => subDays(prev, 1));
    else if (reportType === 'monthly') setCurrentDate(prev => subMonths(prev, 1));
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    let periodStr = '';
    if (reportType === 'daily') periodStr = format(currentDate, 'dd MMMM yyyy');
    else if (reportType === 'monthly') periodStr = format(currentDate, 'MMMM yyyy');
    else periodStr = `${format(new Date(startDate), 'dd/MM/yyyy')} - ${format(new Date(endDate), 'dd/MM/yyyy')}`;

    const categoryTitle = activeTab === 'incoming' ? 'Barang Masuk Linen' :
                         activeTab === 'outgoing' ? 'Barang Keluar Linen' :
                         activeTab === 'critical' ? 'Linen Kritis' : 'Rekonsiliasi Stok Linen';

    doc.setFillColor(59, 130, 246);
    doc.rect(0, 0, 210, 14, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('HOTEL ALIA MATRAMAN - LAPORAN LINEN (SUMBER: LINEN MASTER)', 14, 9);

    doc.setTextColor(33, 33, 33);
    doc.setFontSize(15);
    doc.text(categoryTitle.toUpperCase(), 14, 26);

    doc.setFontSize(9.5);
    doc.text(`Periode: ${periodStr}  |  Dicetak: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 33);

    if (activeTab === 'stock' || activeTab === 'critical') {
      const tableData = displayedItems.map((item, idx) => [
        (idx + 1).toString(),
        item.name,
        item.initial.toString(),
        item.in.toString(),
        item.outLaundry.toString(),
        item.outHk.toString(),
        item.outAfkir.toString(),
        item.final.toString(),
        item.final <= 5 ? 'KRITIS' : 'AMAN'
      ]);

      autoTable(doc, {
        startY: 40,
        head: [['No', 'Nama Linen', 'Awal', 'Masuk', 'Lndry', 'HK', 'Afkir', 'Akhir', 'Status']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [42, 48, 58] },
        columnStyles: {
          2: { halign: 'center' },
          3: { halign: 'center' },
          4: { halign: 'center' },
          5: { halign: 'center' },
          6: { halign: 'center' },
          7: { halign: 'center' },
        }
      });
    } else {
      const tableData = displayedTransactions.map((tx, idx) => [
        (idx + 1).toString(),
        format(new Date(tx.date), 'dd/MM/yyyy'),
        tx.itemName,
        tx.type === 'IN' ? 'MASUK' : 'KELUAR',
        tx.quantity.toString(),
        'pcs',
        tx.description || '-'
      ]);

      autoTable(doc, {
        startY: 40,
        head: [['No', 'Tanggal', 'Nama Linen', 'Tipe', 'Jumlah', 'Satuan', 'Keterangan']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [42, 48, 58] }
      });
    }

    doc.save(`Laporan_Laundry_Linen_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  const exportToCSV = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    if (activeTab === 'stock' || activeTab === 'critical') {
      csvContent += 'No,Nama Linen,Awal,Masuk,Laundry,HK,Afkir,Akhir,Status\n';
      displayedItems.forEach((item, idx) => {
        csvContent += `${idx + 1},${item.name},${item.initial},${item.in},${item.outLaundry},${item.outHk},${item.outAfkir},${item.final},${item.final <= 5 ? 'KRITIS' : 'AMAN'}\n`;
      });
    } else {
      csvContent += 'No,Tanggal,Nama Linen,Tipe,Jumlah,Satuan,Keterangan\n';
      displayedTransactions.forEach((tx, idx) => {
        csvContent += `${idx + 1},${tx.date},${tx.itemName},${tx.type},${tx.quantity},pcs,${tx.description || '-'}\n`;
      });
    }
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Laporan_Laundry_Linen_${format(new Date(), 'yyyyMMdd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-20 md:pb-6 font-sans">
      <div className="bg-gradient-to-r from-blue-900/90 via-[#252B34] to-[#252B34] p-6 rounded-2xl border border-blue-500/20 shadow-[0_4px_20px_rgba(0,0,0,0.18)] flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-md bg-blue-500/20 text-blue-300 text-xs font-bold uppercase tracking-wider border border-blue-500/30">
              Sourced from Linen Master
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <BedDouble className="w-7 h-7 text-blue-400" />
            Laporan Linen & Laundry
          </h1>
          <p className="text-xs sm:text-sm text-[#8E99A6] mt-1">
            Data mutasi dan stok linen diambil secara otomatis dari modul Linen Master.
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
          <button onClick={exportToCSV} className="flex-1 md:flex-none bg-[#1D2128] hover:bg-[#343B46] text-[#F1F3F5] px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border border-[#343B46] cursor-pointer">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>CSV</span>
          </button>
          <button onClick={exportToPDF} className="flex-1 md:flex-none bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 cursor-pointer">
            <Download className="w-4 h-4" />
            <span>PDF</span>
          </button>
        </div>
      </div>

      <div className="bg-[#252B34] p-4 rounded-2xl border border-[#343B46] shadow-sm flex flex-col lg:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-1.5 bg-[#1D2128] p-1 rounded-xl border border-[#343B46] w-full lg:w-auto">
          {(['daily', 'monthly', 'custom'] as ReportType[]).map(type => (
            <button
              key={type}
              onClick={() => setReportType(type)}
              className={cn(
                "flex-1 lg:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer capitalize",
                reportType === type ? "bg-blue-600 text-white shadow" : "text-[#8E99A6] hover:text-white"
              )}
            >
              {type === 'daily' ? 'Harian' : type === 'monthly' ? 'Bulanan' : 'Kustom'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-end">
          {reportType !== 'custom' ? (
            <>
              <button onClick={prevPeriod} className="p-2 rounded-xl bg-[#1D2128] border border-[#343B46] text-[#F1F3F5] hover:bg-[#343B46] cursor-pointer">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1D2128] border border-[#343B46] text-sm font-bold text-[#F1F3F5]">
                <CalendarIcon className="w-4 h-4 text-blue-400" />
                <span>{reportType === 'daily' ? format(currentDate, 'dd MMM yyyy') : format(currentDate, 'MMM yyyy')}</span>
              </div>
              <button onClick={nextPeriod} className="p-2 rounded-xl bg-[#1D2128] border border-[#343B46] text-[#F1F3F5] hover:bg-[#343B46] cursor-pointer">
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-[#1D2128] border border-[#343B46] rounded-xl px-3 py-1.5 text-xs text-white" />
              <span className="text-[#8E99A6]">-</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-[#1D2128] border border-[#343B46] rounded-xl px-3 py-1.5 text-xs text-white" />
            </div>
          )}
          <button onClick={refresh} className="p-2.5 rounded-xl bg-[#1D2128] border border-[#343B46] text-[#F1F3F5] hover:bg-[#343B46] cursor-pointer">
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin text-blue-400")} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#252B34] p-5 rounded-2xl border border-[#343B46]">
          <p className="text-xs font-semibold text-[#8E99A6] uppercase tracking-wider">Linen Aktif</p>
          <h3 className="text-2xl font-black text-white mt-1">{ITEM_TYPES.length} <span className="text-xs font-normal text-[#8E99A6]">Jenis</span></h3>
        </div>
        <div className="bg-[#252B34] p-5 rounded-2xl border border-[#343B46]">
          <p className="text-xs font-semibold text-[#8E99A6] uppercase tracking-wider">Masuk (Periode)</p>
          <h3 className="text-2xl font-black text-emerald-400 mt-1">+{filteredIncoming.reduce((acc, i) => acc + i.quantity, 0)} <span className="text-xs font-normal text-[#8E99A6]">pcs</span></h3>
        </div>
        <div className="bg-[#252B34] p-5 rounded-2xl border border-[#343B46]">
          <p className="text-xs font-semibold text-[#8E99A6] uppercase tracking-wider">Keluar (Periode)</p>
          <h3 className="text-2xl font-black text-amber-400 mt-1">-{filteredOutgoing.reduce((acc, o) => acc + o.quantity, 0)} <span className="text-xs font-normal text-[#8E99A6]">pcs</span></h3>
        </div>
        <div className="bg-[#252B34] p-5 rounded-2xl border border-[#343B46]">
          <p className="text-xs font-semibold text-[#8E99A6] uppercase tracking-wider">Kritis</p>
          <h3 className="text-2xl font-black text-rose-400 mt-1">{Object.values(itemStats).filter((s: any) => s.final <= 5).length} <span className="text-xs font-normal text-[#8E99A6]">Item</span></h3>
        </div>
      </div>

      <div className="bg-[#252B34] p-4 rounded-2xl border border-[#343B46] shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-1 bg-[#1D2128] p-1 rounded-xl border border-[#343B46] w-full md:w-auto overflow-x-auto">
          {(['stock', 'incoming', 'outgoing', 'critical'] as LaundryCategory[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2",
                activeTab === tab ? "bg-blue-600 text-white shadow" : "text-[#8E99A6] hover:text-white"
              )}
            >
              {tab === 'stock' && <Package className="w-3.5 h-3.5" />}
              {tab === 'incoming' && <ArrowDownCircle className="w-3.5 h-3.5" />}
              {tab === 'outgoing' && <ArrowUpCircle className="w-3.5 h-3.5" />}
              {tab === 'critical' && <AlertTriangle className="w-3.5 h-3.5" />}
              <span className="capitalize">{tab === 'stock' ? 'Stok & Mutasi' : tab === 'incoming' ? 'Barang Masuk' : tab === 'outgoing' ? 'Barang Keluar' : 'Stok Kritis'}</span>
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E99A6]" />
          <input
            type="text"
            placeholder="Cari linen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#1D2128] border border-[#343B46] rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#F1F3F5] placeholder-[#8E99A6] focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <div className="bg-[#252B34] rounded-2xl border border-[#343B46] shadow-sm overflow-hidden">
        <div className="p-4 border-b border-[#343B46] flex justify-between items-center">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-tight">
            <Layers className="w-4 h-4 text-blue-400" />
            {activeTab === 'stock' ? 'Rekonsiliasi Mutasi Linen' : activeTab === 'incoming' ? 'Riwayat Masuk' : activeTab === 'outgoing' ? 'Riwayat Keluar' : 'Daftar Kritis'}
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#1D2128]/70 border-b border-[#343B46] text-[#8E99A6] text-[11px] font-bold uppercase tracking-wider">
                <th className="py-3 px-4">No</th>
                {activeTab === 'stock' || activeTab === 'critical' ? (
                  <>
                    <th className="py-3 px-4">Nama Linen</th>
                    <th className="py-3 px-4 text-center">Awal</th>
                    <th className="py-3 px-4 text-center text-emerald-400">Masuk</th>
                    <th className="py-3 px-4 text-center text-[#FB923C]">Laundry</th>
                    <th className="py-3 px-4 text-center text-blue-400">HK</th>
                    <th className="py-3 px-4 text-center text-rose-400">Afkir</th>
                    <th className="py-3 px-4 text-center text-white bg-blue-600/20">Akhir</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </>
                ) : (
                  <>
                    <th className="py-3 px-4">Tanggal</th>
                    <th className="py-3 px-4">Nama Linen</th>
                    <th className="py-3 px-4 text-center">Jumlah</th>
                    <th className="py-3 px-4">Keterangan</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#343B46] text-xs text-[#F1F3F5]">
              {activeTab === 'stock' || activeTab === 'critical' ? (
                displayedItems.map((item, idx) => (
                  <tr key={item.name} className="hover:bg-[#1D2128]/40 transition-all">
                    <td className="py-3 px-4 text-[#8E99A6]">{idx + 1}</td>
                    <td className="py-3 px-4 font-bold">{item.name}</td>
                    <td className="py-3 px-4 text-center">{item.initial}</td>
                    <td className="py-3 px-4 text-center text-emerald-400 font-bold">+{item.in}</td>
                    <td className="py-3 px-4 text-center text-[#FB923C] font-bold">-{item.outLaundry}</td>
                    <td className="py-3 px-4 text-center text-blue-400 font-bold">-{item.outHk}</td>
                    <td className="py-3 px-4 text-center text-rose-400 font-bold">-{item.outAfkir}</td>
                    <td className="py-3 px-4 text-center text-[#F1F3F5] font-black bg-blue-600/10">{item.final}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-bold",
                        item.final <= 5 ? "bg-rose-500/20 text-rose-400" : "bg-emerald-500/20 text-emerald-400"
                      )}>
                        {item.final <= 5 ? 'KRITIS' : 'AMAN'}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                displayedTransactions.map((tx, idx) => (
                  <tr key={tx.id} className="hover:bg-[#1D2128]/40 transition-all">
                    <td className="py-3 px-4 text-[#8E99A6]">{idx + 1}</td>
                    <td className="py-3 px-4 text-[#8E99A6]">{format(new Date(tx.date), 'dd/MM/yyyy')}</td>
                    <td className="py-3 px-4 font-bold">{tx.itemName}</td>
                    <td className={cn(
                      "py-3 px-4 text-center font-black",
                      tx.type === 'IN' ? "text-emerald-400" : "text-amber-400"
                    )}>
                      {tx.type === 'IN' ? '+' : '-'}{tx.quantity}
                    </td>
                    <td className="py-3 px-4 text-[#8E99A6]">{tx.description || '-'}</td>
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

