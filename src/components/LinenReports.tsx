import React, { useState, useMemo } from 'react';
import { 
  ArrowDownCircle, 
  PackageCheck, 
  Plus, 
  Trash2, 
  FileText, 
  Info,
  Calendar,
  Filter
} from 'lucide-react';
import { format, parseISO, isWithinInterval } from 'date-fns';
import { ITEM_TYPES } from '../constants-linen';
import { LinenState } from '../types-linen';
import { calculateCleanStockMap, calculateNewStockMap, downloadPDF } from '../lib/linenUtils';

interface LinenReportsProps {
  state: LinenState;
}

export function LinenReports({ state }: LinenReportsProps) {
  const [activeReport, setActiveReport] = useState<'incoming' | 'clean' | 'new' | 'afkir' | 'takenHk' | 'total'>('incoming');

  const reports = [
    { id: 'incoming', label: 'Barang Masuk', icon: ArrowDownCircle },
    { id: 'clean', label: 'Barang Bersih', icon: PackageCheck },
    { id: 'new', label: 'Barang Baru', icon: Plus },
    { id: 'afkir', label: 'Barang Afkir', icon: Trash2 },
    { id: 'takenHk', label: 'Diambil HK', icon: FileText },
    { id: 'total', label: 'Total Aset & PAR', icon: FileText },
  ];

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-black text-[#F1F3F5] tracking-tight">Laporan Linen</h3>
          <p className="text-xs text-[#8E99A6] font-medium">Rekapitulasi sirkulasi &amp; aset linen hotel</p>
        </div>
      </div>

      {/* Report Sub-Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-[#20252D] border border-[#343B46] w-full sm:w-fit">
        {reports.map((report) => {
          const Icon = report.icon;
          const isActive = activeReport === report.id;
          return (
            <button
              key={report.id}
              onClick={() => setActiveReport(report.id as any)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive
                  ? 'bg-[#C89B3C] text-[#171A1F] shadow-xs'
                  : 'text-[#8E99A6] hover:text-[#F1F3F5] hover:bg-[#252B34]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{report.label}</span>
            </button>
          );
        })}
      </div>

      {/* Render Active Report View */}
      {activeReport === 'incoming' && <ReportIncomingTab state={state} />}
      {activeReport === 'clean' && <ReportCleanTab state={state} />}
      {activeReport === 'new' && <ReportNewTab state={state} />}
      {activeReport === 'afkir' && <ReportAfkirTab state={state} />}
      {activeReport === 'takenHk' && <ReportTakenHkTab state={state} />}
      {activeReport === 'total' && <ReportTotalTab state={state} />}
    </div>
  );
}

// 1. Report Incoming Tab
function ReportIncomingTab({ state }: { state: LinenState }) {
  const [filter, setFilter] = useState({
    type: 'daily' as 'range' | 'daily' | 'monthly',
    startDate: '',
    endDate: '',
    selectedDate: format(new Date(), 'yyyy-MM-dd'),
    selectedMonth: format(new Date(), 'yyyy-MM'),
    itemName: 'Semua'
  });

  const filteredItems = useMemo(() => {
    return state.incomingItems.filter((item: any) => {
      const nameMatch = filter.itemName === 'Semua' || item.itemName === filter.itemName;
      let dateMatch = true;

      if (filter.type === 'range') {
        dateMatch = (!filter.startDate || item.date >= filter.startDate) &&
                    (!filter.endDate || item.date <= filter.endDate);
      } else if (filter.type === 'daily') {
        dateMatch = item.date === filter.selectedDate;
      } else if (filter.type === 'monthly') {
        dateMatch = item.date.startsWith(filter.selectedMonth);
      }

      return nameMatch && dateMatch;
    });
  }, [state, filter]);

  const total = filteredItems.reduce((acc, item) => acc + item.quantity, 0);

  const handleDownload = () => {
    const headers = [['Tanggal', 'Nama Barang', 'Jumlah', 'Sumber', 'Keterangan']];
    const data = filteredItems.map((item: any) => [
      format(parseISO(item.date), 'dd/MM/yyyy'),
      item.itemName,
      item.quantity.toString(),
      item.source,
      item.description || '-'
    ]);
    downloadPDF('Laporan Barang Masuk Linen', headers, data);
  };

  return (
    <div className="space-y-4">
      <FilterCard 
        filter={filter} 
        setFilter={setFilter} 
        onDownload={handleDownload} 
      />

      <div className="rounded-2xl border border-[#343B46] bg-[#252B34] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
        <div className="p-4 bg-[#20252D] border-b border-[#343B46] flex items-center justify-between">
          <span className="text-xs font-bold text-[#8E99A6]">Total Linen Masuk:</span>
          <span className="text-sm font-black text-[#60A5FA]">{total} pcs</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#343B46] bg-[#20252D]">
                <th className="px-5 py-3 text-xs font-bold text-[#8E99A6]">Tanggal</th>
                <th className="px-5 py-3 text-xs font-bold text-[#8E99A6]">Nama Barang</th>
                <th className="px-5 py-3 text-xs font-bold text-[#8E99A6]">Jumlah</th>
                <th className="px-5 py-3 text-xs font-bold text-[#8E99A6]">Sumber</th>
                <th className="px-5 py-3 text-xs font-bold text-[#8E99A6]">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#343B46]">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-xs text-[#8E99A6] italic">
                    Tidak ada data untuk periode ini
                  </td>
                </tr>
              ) : (
                filteredItems.map(item => (
                  <tr key={item.id} className="hover:bg-[#2A303A]">
                    <td className="px-5 py-3 text-xs text-[#D8DEE6]">{format(parseISO(item.date), 'dd MMM yyyy')}</td>
                    <td className="px-5 py-3 text-xs font-bold text-[#F1F3F5]">{item.itemName}</td>
                    <td className="px-5 py-3 text-xs font-black text-[#60A5FA]">{item.quantity} pcs</td>
                    <td className="px-5 py-3 text-xs text-[#E0B85A]">{item.source}</td>
                    <td className="px-5 py-3 text-xs text-[#8E99A6]">{item.description || '-'}</td>
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

// 2. Report Clean Tab
function ReportCleanTab({ state }: { state: LinenState }) {
  const [filter, setFilter] = useState({
    type: 'daily' as 'range' | 'daily' | 'monthly',
    startDate: '',
    endDate: '',
    selectedDate: format(new Date(), 'yyyy-MM-dd'),
    selectedMonth: format(new Date(), 'yyyy-MM'),
    itemName: 'Semua'
  });

  const reportData = useMemo(() => {
    return ITEM_TYPES.filter(type => filter.itemName === 'Semua' || type === filter.itemName).map(type => {
      const cleanItem = state.cleanItems.find((item: any) => item.itemName === type);
      const currentStock = cleanItem ? Number(cleanItem.quantity || 0) : 0;

      const isItemInPeriod = (item: any) => {
        if (!item || !item.date) return false;
        const itemDate = String(item.date).trim().slice(0, 10);
        if (filter.type === 'range') {
          return (!filter.startDate || itemDate >= filter.startDate) &&
                 (!filter.endDate || itemDate <= filter.endDate);
        } else if (filter.type === 'daily') {
          return itemDate === filter.selectedDate;
        } else if (filter.type === 'monthly') {
          return itemDate.startsWith(filter.selectedMonth);
        }
        return true;
      };

      const isItemAfterPeriod = (item: any) => {
        if (!item || !item.date) return false;
        const itemDate = String(item.date).trim().slice(0, 10);
        if (filter.type === 'range') {
          return Boolean(filter.endDate && itemDate > filter.endDate);
        } else if (filter.type === 'daily') {
          return itemDate > filter.selectedDate;
        } else if (filter.type === 'monthly') {
          return itemDate.slice(0, 7) > filter.selectedMonth;
        }
        return false;
      };

      const getQuantity = (items: any[], filterFn: (item: any) => boolean) => {
        if (!Array.isArray(items)) return 0;
        return items.filter(item => item.itemName === type && filterFn(item))
                    .reduce((acc, item) => acc + Number(item.quantity || 0), 0);
      };

      const incoming = getQuantity(state.incomingItems, isItemInPeriod);
      const outgoingLaundry = getQuantity(state.outgoingItems, item => isItemInPeriod(item) && (
        item.destination === 'Laundry' || (item.destination || '').toLowerCase().includes('laundry')
      ));
      const outgoingAfkir = getQuantity(state.outgoingItems, item => isItemInPeriod(item) && (
        item.destination === 'Afkir' || (item.destination || '').toLowerCase().includes('afkir')
      ));
      const outgoingTakenHk = getQuantity(state.outgoingItems, item => isItemInPeriod(item) && (
        item.destination === 'Diambil HK' || item.destination === 'HK' || item.destination === 'Housekeeping' || (item.destination || '').toLowerCase().includes('hk')
      ));
      const roomUsage = getQuantity(state.roomItems, isItemInPeriod);
      const outgoingTotal = outgoingLaundry + outgoingAfkir + outgoingTakenHk;

      const incomingAfter = getQuantity(state.incomingItems, isItemAfterPeriod);
      const outgoingAfter = getQuantity(state.outgoingItems, item => isItemAfterPeriod(item) && (
        item.destination === 'Laundry' || 
        item.destination === 'Afkir' || 
        item.destination === 'Diambil HK' || 
        item.destination === 'HK' || 
        item.destination === 'Housekeeping' || 
        (item.destination || '').toLowerCase().includes('hk') ||
        (item.destination || '').toLowerCase().includes('laundry') ||
        (item.destination || '').toLowerCase().includes('afkir')
      ));
      const roomUsageAfter = getQuantity(state.roomItems, isItemAfterPeriod);

      const total = currentStock - incomingAfter + outgoingAfter + roomUsageAfter;
      const initial = total - incoming + outgoingTotal + roomUsage;

      return {
        name: type,
        initial,
        incoming,
        outgoingLaundry,
        outgoingAfkir,
        outgoingTakenHk,
        roomUsage,
        total: Math.max(0, total)
      };
    });
  }, [state, filter]);

  const grandTotal = reportData.reduce((acc, item) => acc + item.total, 0);

  const handleDownload = () => {
    const headers = [['Nama Barang', 'Stok Awal', 'Masuk (+)', 'Pasang Kamar (-)', 'Laundry (-)', 'Afkir (-)', 'Diambil HK (-)', 'Total Bersih']];
    const data = reportData.map(item => [
      item.name,
      item.initial.toString(),
      `+${item.incoming}`,
      `-${item.roomUsage}`,
      `-${item.outgoingLaundry}`,
      `-${item.outgoingAfkir}`,
      `-${item.outgoingTakenHk}`,
      item.total.toString()
    ]);
    downloadPDF('Laporan Barang Bersih Linen', headers, data);
  };

  return (
    <div className="space-y-4">
      <FilterCard filter={filter} setFilter={setFilter} onDownload={handleDownload} />

      <div className="rounded-2xl border border-[#343B46] bg-[#252B34] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
        <div className="p-4 bg-[#20252D] border-b border-[#343B46] flex items-center justify-between">
          <span className="text-xs font-bold text-[#8E99A6]">Total Stok Bersih:</span>
          <span className="text-sm font-black text-[#55B685]">{grandTotal} pcs</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#343B46] bg-[#20252D]">
                <th className="px-4 py-3 text-xs font-bold text-[#8E99A6]">Nama Barang</th>
                <th className="px-4 py-3 text-xs font-bold text-[#8E99A6]">Awal</th>
                <th className="px-4 py-3 text-xs font-bold text-[#8E99A6]">Masuk (+)</th>
                <th className="px-4 py-3 text-xs font-bold text-[#8E99A6]">Pasang Kamar (-)</th>
                <th className="px-4 py-3 text-xs font-bold text-[#8E99A6]">Laundry (-)</th>
                <th className="px-4 py-3 text-xs font-bold text-[#8E99A6]">Afkir (-)</th>
                <th className="px-4 py-3 text-xs font-bold text-[#8E99A6]">Diambil HK (-)</th>
                <th className="px-4 py-3 text-xs font-bold text-[#8E99A6] text-right">Total Bersih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#343B46]">
              {reportData.map(item => (
                <tr key={item.name} className="hover:bg-[#2A303A]">
                  <td className="px-4 py-3 text-xs font-bold text-[#F1F3F5]">{item.name}</td>
                  <td className="px-4 py-3 text-xs text-[#8E99A6]">{item.initial}</td>
                  <td className="px-4 py-3 text-xs font-bold text-[#60A5FA]">+{item.incoming}</td>
                  <td className="px-4 py-3 text-xs font-bold text-[#E0B85A]">-{item.roomUsage}</td>
                  <td className="px-4 py-3 text-xs font-bold text-[#FB923C]">-{item.outgoingLaundry}</td>
                  <td className="px-4 py-3 text-xs font-bold text-[#F87171]">-{item.outgoingAfkir}</td>
                  <td className="px-4 py-3 text-xs font-bold text-[#60A5FA]">-{item.outgoingTakenHk}</td>
                  <td className="px-4 py-3 text-xs font-black text-[#55B685] text-right">{item.total} pcs</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// 3. Report New Tab
function ReportNewTab({ state }: { state: LinenState }) {
  const [filter, setFilter] = useState({
    type: 'daily' as 'range' | 'daily' | 'monthly',
    startDate: '',
    endDate: '',
    selectedDate: format(new Date(), 'yyyy-MM-dd'),
    selectedMonth: format(new Date(), 'yyyy-MM'),
    itemName: 'Semua'
  });

  const filteredData = useMemo(() => {
    return state.newItemTransactions.filter((item: any) => {
      const nameMatch = filter.itemName === 'Semua' || item.itemName === filter.itemName;
      const itemDate = parseISO(item.date);
      let dateMatch = true;
      if (filter.type === 'daily') {
        dateMatch = format(itemDate, 'yyyy-MM-dd') === filter.selectedDate;
      } else if (filter.type === 'monthly') {
        dateMatch = format(itemDate, 'yyyy-MM') === filter.selectedMonth;
      } else {
        if (!filter.startDate || !filter.endDate) dateMatch = true;
        else dateMatch = isWithinInterval(itemDate, {
          start: parseISO(filter.startDate),
          end: parseISO(filter.endDate)
        });
      }
      return nameMatch && dateMatch;
    });
  }, [state.newItemTransactions, filter]);

  const handleDownload = () => {
    const headers = [['Tanggal', 'Nama Barang', 'Jumlah', 'Jenis', 'Keterangan']];
    const data = filteredData.map((item: any) => [
      format(parseISO(item.date), 'dd MMM yyyy'),
      item.itemName,
      item.quantity.toString(),
      item.type === 'Stock In' ? 'Stok Masuk' : 'Ambil ke Bersih',
      item.description || '-'
    ]);
    downloadPDF('Laporan Barang Baru Linen', headers, data);
  };

  return (
    <div className="space-y-4">
      <FilterCard filter={filter} setFilter={setFilter} onDownload={handleDownload} />

      <div className="rounded-2xl border border-[#343B46] bg-[#252B34] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#343B46] bg-[#20252D]">
                <th className="px-5 py-3 text-xs font-bold text-[#8E99A6]">Tanggal</th>
                <th className="px-5 py-3 text-xs font-bold text-[#8E99A6]">Nama Barang</th>
                <th className="px-5 py-3 text-xs font-bold text-[#8E99A6]">Jumlah</th>
                <th className="px-5 py-3 text-xs font-bold text-[#8E99A6]">Jenis</th>
                <th className="px-5 py-3 text-xs font-bold text-[#8E99A6]">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#343B46]">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-xs text-[#8E99A6] italic">
                    Tidak ada data barang baru untuk periode ini
                  </td>
                </tr>
              ) : (
                filteredData.map(item => (
                  <tr key={item.id} className="hover:bg-[#2A303A]">
                    <td className="px-5 py-3 text-xs text-[#D8DEE6]">{format(parseISO(item.date), 'dd MMM yyyy')}</td>
                    <td className="px-5 py-3 text-xs font-bold text-[#F1F3F5]">{item.itemName}</td>
                    <td className="px-5 py-3 text-xs font-black text-[#E0B85A]">{item.quantity} pcs</td>
                    <td className="px-5 py-3 text-xs">
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                        item.type === 'Stock In' ? 'bg-blue-500/15 text-[#60A5FA]' : 'bg-[#C89B3C]/15 text-[#E0B85A]'
                      }`}>
                        {item.type === 'Stock In' ? 'Stok Masuk' : 'Ambil ke Bersih'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-[#8E99A6]">{item.description || '-'}</td>
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

// 4. Report Afkir Tab
function ReportAfkirTab({ state }: { state: LinenState }) {
  const [filter, setFilter] = useState({
    type: 'daily' as 'range' | 'daily' | 'monthly',
    startDate: '',
    endDate: '',
    selectedDate: format(new Date(), 'yyyy-MM-dd'),
    selectedMonth: format(new Date(), 'yyyy-MM'),
    itemName: 'Semua'
  });

  const afkirItems = useMemo(() => {
    return state.outgoingItems.filter((item: any) => {
      const isAfkir = item.destination === 'Afkir' || (item.destination || '').toLowerCase().includes('afkir');
      const nameMatch = filter.itemName === 'Semua' || item.itemName === filter.itemName;

      let dateMatch = true;
      if (filter.type === 'range') {
        dateMatch = (!filter.startDate || item.date >= filter.startDate) &&
                    (!filter.endDate || item.date <= filter.endDate);
      } else if (filter.type === 'daily') {
        dateMatch = item.date === filter.selectedDate;
      } else if (filter.type === 'monthly') {
        dateMatch = item.date.startsWith(filter.selectedMonth);
      }

      return isAfkir && nameMatch && dateMatch;
    });
  }, [state, filter]);

  const totalAfkir = afkirItems.reduce((acc, item) => acc + item.quantity, 0);

  const handleDownload = () => {
    const headers = [['Tanggal', 'Nama Barang', 'Jumlah', 'Keterangan']];
    const data = afkirItems.map((item: any) => [
      format(parseISO(item.date), 'dd/MM/yyyy'),
      item.itemName,
      item.quantity.toString(),
      item.description || '-'
    ]);
    downloadPDF('Laporan Barang Afkir Linen', headers, data);
  };

  return (
    <div className="space-y-4">
      <FilterCard filter={filter} setFilter={setFilter} onDownload={handleDownload} />

      <div className="rounded-2xl border border-[#343B46] bg-[#252B34] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
        <div className="p-4 bg-[#20252D] border-b border-[#343B46] flex items-center justify-between">
          <span className="text-xs font-bold text-[#8E99A6]">Total Afkir:</span>
          <span className="text-sm font-black text-[#F87171]">{totalAfkir} pcs</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#343B46] bg-[#20252D]">
                <th className="px-5 py-3 text-xs font-bold text-[#8E99A6]">Tanggal</th>
                <th className="px-5 py-3 text-xs font-bold text-[#8E99A6]">Nama Barang</th>
                <th className="px-5 py-3 text-xs font-bold text-[#8E99A6]">Jumlah</th>
                <th className="px-5 py-3 text-xs font-bold text-[#8E99A6]">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#343B46]">
              {afkirItems.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-xs text-[#8E99A6] italic">
                    Tidak ada data barang afkir untuk periode ini
                  </td>
                </tr>
              ) : (
                afkirItems.map(item => (
                  <tr key={item.id} className="hover:bg-[#2A303A]">
                    <td className="px-5 py-3 text-xs text-[#D8DEE6]">{format(parseISO(item.date), 'dd MMM yyyy')}</td>
                    <td className="px-5 py-3 text-xs font-bold text-[#F1F3F5]">{item.itemName}</td>
                    <td className="px-5 py-3 text-xs font-black text-[#F87171]">{item.quantity} pcs</td>
                    <td className="px-5 py-3 text-xs text-[#8E99A6]">{item.description || '-'}</td>
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

// 5. Report Taken HK Tab
function ReportTakenHkTab({ state }: { state: LinenState }) {
  const [filter, setFilter] = useState({
    type: 'daily' as 'range' | 'daily' | 'monthly',
    startDate: '',
    endDate: '',
    selectedDate: format(new Date(), 'yyyy-MM-dd'),
    selectedMonth: format(new Date(), 'yyyy-MM'),
    itemName: 'Semua'
  });

  const takenHkItems = useMemo(() => {
    return state.outgoingItems.filter((item: any) => {
      const isTakenHk = item.destination === 'Diambil HK' || 
                        item.destination === 'HK' || 
                        item.destination === 'Housekeeping' || 
                        (item.destination || '').toLowerCase().includes('hk');
      const nameMatch = filter.itemName === 'Semua' || item.itemName === filter.itemName;

      let dateMatch = true;
      if (filter.type === 'range') {
        dateMatch = (!filter.startDate || item.date >= filter.startDate) &&
                    (!filter.endDate || item.date <= filter.endDate);
      } else if (filter.type === 'daily') {
        dateMatch = item.date === filter.selectedDate;
      } else if (filter.type === 'monthly') {
        dateMatch = item.date.startsWith(filter.selectedMonth);
      }

      return isTakenHk && nameMatch && dateMatch;
    });
  }, [state, filter]);

  const totalTakenHk = takenHkItems.reduce((acc, item) => acc + item.quantity, 0);

  const handleDownload = () => {
    const headers = [['Tanggal', 'Nama Barang', 'Jumlah', 'Keterangan']];
    const data = takenHkItems.map((item: any) => [
      format(parseISO(item.date), 'dd/MM/yyyy'),
      item.itemName,
      item.quantity.toString(),
      item.description || '-'
    ]);
    downloadPDF('Laporan Barang Diambil HK (Housekeeping)', headers, data);
  };

  return (
    <div className="space-y-4">
      <FilterCard filter={filter} setFilter={setFilter} onDownload={handleDownload} />

      <div className="rounded-2xl border border-[#343B46] bg-[#252B34] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
        <div className="p-4 bg-[#20252D] border-b border-[#343B46] flex items-center justify-between">
          <span className="text-xs font-bold text-[#8E99A6]">Total Diambil HK:</span>
          <span className="text-sm font-black text-[#60A5FA]">{totalTakenHk} pcs</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#343B46] bg-[#20252D]">
                <th className="px-5 py-3 text-xs font-bold text-[#8E99A6]">Tanggal</th>
                <th className="px-5 py-3 text-xs font-bold text-[#8E99A6]">Nama Barang</th>
                <th className="px-5 py-3 text-xs font-bold text-[#8E99A6]">Jumlah</th>
                <th className="px-5 py-3 text-xs font-bold text-[#8E99A6]">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#343B46]">
              {takenHkItems.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-xs text-[#8E99A6] italic">
                    Tidak ada data barang diambil HK untuk periode ini
                  </td>
                </tr>
              ) : (
                takenHkItems.map(item => (
                  <tr key={item.id} className="hover:bg-[#2A303A]">
                    <td className="px-5 py-3 text-xs text-[#D8DEE6]">{format(parseISO(item.date), 'dd MMM yyyy')}</td>
                    <td className="px-5 py-3 text-xs font-bold text-[#F1F3F5]">{item.itemName}</td>
                    <td className="px-5 py-3 text-xs font-black text-[#60A5FA]">{item.quantity} pcs</td>
                    <td className="px-5 py-3 text-xs text-[#8E99A6]">{item.description || '-'}</td>
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

// 6. Report Total Asset & PAR Tab
function ReportTotalTab({ state }: { state: LinenState }) {
  const [itemName, setItemName] = useState('Semua');

  const cleanStockMap = useMemo(() => calculateCleanStockMap(state), [state]);
  const newStockMap = useMemo(() => calculateNewStockMap(state), [state]);

  const totalData = useMemo(() => {
    return ITEM_TYPES.filter(type => itemName === 'Semua' || type === itemName).map(type => {
      const bersih = cleanStockMap[type] || 0;
      const barangBaruStock = newStockMap[type] || 0;
      const terpasang = (state.roomItems || [])
        .filter(ri => ri.itemName === type)
        .reduce((acc, ri) => acc + Number(ri.quantity || 0), 0);

      const laundryItems = (state.outgoingItems || []).filter(item => item.itemName === type && (
        item.destination === 'Laundry' || (item.destination || '').toLowerCase().includes('laundry')
      ));
      let diLaundry = 0;
      if (laundryItems.length > 0) {
        const latestDate = laundryItems[0].date;
        diLaundry = laundryItems
          .filter(item => item.date === latestDate)
          .reduce((acc, item) => acc + Number(item.quantity || 0), 0);
      }

      const afkir = (state.outgoingItems || [])
        .filter(item => item.itemName === type && (
          item.destination === 'Afkir' || (item.destination || '').toLowerCase().includes('afkir')
        ))
        .reduce((acc, item) => acc + Number(item.quantity || 0), 0);

      const takenHk = (state.outgoingItems || [])
        .filter(item => item.itemName === type && (
          item.destination === 'Diambil HK' || 
          item.destination === 'HK' || 
          item.destination === 'Housekeeping' || 
          (item.destination || '').toLowerCase().includes('hk')
        ))
        .reduce((acc, item) => acc + Number(item.quantity || 0), 0);

      const totalAset = terpasang + bersih + diLaundry + takenHk + barangBaruStock - afkir;
      let parDivider = 1;
      if (['Sheet double', 'Duvet double', 'Bath towel', 'Sheet Topper 340x300'].includes(type)) {
        parDivider = 2;
      } else if (type === 'Pillowcase') {
        parDivider = 4;
      }

      return {
        name: type,
        bersih,
        terpasang,
        diLaundry,
        takenHk,
        barangBaru: barangBaruStock,
        afkir,
        total: Math.max(0, totalAset),
        par: Math.max(0, totalAset / (98 * parDivider))
      };
    });
  }, [state, itemName, cleanStockMap, newStockMap]);

  const grandTotal = totalData.reduce((acc, item) => acc + item.total, 0);
  const grandTotalPar = totalData.length > 0 ? (totalData.reduce((acc, item) => acc + item.par, 0) / totalData.length) : 0;

  const handleDownload = () => {
    const headers = [['Nama Barang', 'Bersih', 'Terpasang', 'Di Laundry', 'Diambil HK', 'Barang Baru', 'Afkir (-)', 'Total Aset', 'Jumlah PAR']];
    const data = totalData.map(item => [
      item.name,
      item.bersih.toString(),
      item.terpasang.toString(),
      item.diLaundry.toString(),
      item.takenHk.toString(),
      item.barangBaru.toString(),
      `-${item.afkir}`,
      item.total.toString(),
      item.par.toFixed(2)
    ]);
    downloadPDF('Laporan Total Aset dan PAR Linen', headers, data);
  };

  return (
    <div className="space-y-4">
      <div className="p-4 sm:p-5 rounded-2xl border border-[#343B46] bg-[#252B34] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <label className="text-xs font-bold text-[#8E99A6]">Filter Barang:</label>
          <select
            value={itemName}
            onChange={e => setItemName(e.target.value)}
            className="px-3 py-1.5 bg-[#20252D] border border-[#343B46] rounded-xl text-xs text-[#F1F3F5] font-semibold focus:outline-none focus:border-[#C89B3C]"
          >
            <option value="Semua">Semua Linen</option>
            {ITEM_TYPES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <button 
          onClick={handleDownload}
          className="px-4 py-2 bg-[#C89B3C] hover:bg-[#E0B85A] text-[#171A1F] rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-xs self-start sm:self-auto cursor-pointer"
        >
          <FileText className="w-4 h-4" />
          <span>Download PDF</span>
        </button>
      </div>

      <div className="rounded-2xl border border-[#343B46] bg-[#252B34] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
        <div className="p-4 bg-[#20252D] border-b border-[#343B46] flex items-center justify-between">
          <span className="text-xs font-bold text-[#8E99A6]">Total Aset: <strong className="text-[#F1F3F5]">{grandTotal} pcs</strong></span>
          <span className="text-xs font-bold text-[#8E99A6]">Rata-rata PAR: <strong className="text-[#E0B85A]">{grandTotalPar.toFixed(2)}</strong></span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#343B46] bg-[#20252D]">
                <th className="px-4 py-3 text-xs font-bold text-[#8E99A6]">Nama Barang</th>
                <th className="px-4 py-3 text-xs font-bold text-[#8E99A6]">Bersih</th>
                <th className="px-4 py-3 text-xs font-bold text-[#8E99A6]">Terpasang</th>
                <th className="px-4 py-3 text-xs font-bold text-[#8E99A6]">Di Laundry</th>
                <th className="px-4 py-3 text-xs font-bold text-[#8E99A6]">Diambil HK</th>
                <th className="px-4 py-3 text-xs font-bold text-[#8E99A6]">Baru</th>
                <th className="px-4 py-3 text-xs font-bold text-[#8E99A6]">Afkir (-)</th>
                <th className="px-4 py-3 text-xs font-bold text-[#8E99A6]">Total Aset</th>
                <th className="px-4 py-3 text-xs font-bold text-[#8E99A6] text-right">PAR Level</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#343B46]">
              {totalData.map(item => (
                <tr key={item.name} className="hover:bg-[#2A303A]">
                  <td className="px-4 py-3 text-xs font-bold text-[#F1F3F5]">{item.name}</td>
                  <td className="px-4 py-3 text-xs text-[#55B685] font-bold">{item.bersih}</td>
                  <td className="px-4 py-3 text-xs text-[#60A5FA] font-bold">{item.terpasang}</td>
                  <td className="px-4 py-3 text-xs text-[#FB923C] font-bold">{item.diLaundry}</td>
                  <td className="px-4 py-3 text-xs text-[#60A5FA] font-bold">{item.takenHk}</td>
                  <td className="px-4 py-3 text-xs text-[#E0B85A] font-bold">+{item.barangBaru}</td>
                  <td className="px-4 py-3 text-xs text-[#F87171] font-bold">-{item.afkir}</td>
                  <td className="px-4 py-3 text-xs font-black text-[#F1F3F5]">{item.total}</td>
                  <td className="px-4 py-3 text-xs text-right font-black text-[#E0B85A]">
                    {item.par.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Guide Note */}
      <div className="p-4 rounded-xl border border-[#343B46] bg-[#20252D] text-xs text-[#8E99A6] flex items-start gap-2.5">
        <Info className="w-4 h-4 text-[#E0B85A] shrink-0 mt-0.5" />
        <div>
          <strong className="text-[#F1F3F5] block mb-1">Rumus Perhitungan Total Aset:</strong>
          Total Aset = Terpasang + Bersih + Laundry + Baru - Afkir. <br />
          PAR dihitung berdasarkan standar kapasitas 98 kamar (Sheet/Duvet/Towel ÷ 196, Pillowcase ÷ 392, Lainnya ÷ 98).
        </div>
      </div>
    </div>
  );
}

// Shared Filter Component for Reports
function FilterCard({ filter, setFilter, onDownload }: any) {
  return (
    <div className="p-4 sm:p-5 rounded-2xl border border-[#343B46] bg-[#252B34] shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="text-[10px] font-black uppercase text-[#8E99A6] block mb-1">Tipe Periode</label>
            <div className="flex gap-1 p-1 bg-[#20252D] rounded-xl border border-[#343B46]">
              {(['daily', 'monthly', 'range'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setFilter({ ...filter, type: t })}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    filter.type === t
                      ? 'bg-[#C89B3C] text-[#171A1F]'
                      : 'text-[#8E99A6] hover:text-[#F1F3F5]'
                  }`}
                >
                  {t === 'daily' ? 'Harian' : t === 'monthly' ? 'Bulanan' : 'Rentang'}
                </button>
              ))}
            </div>
          </div>

          {filter.type === 'daily' && (
            <div>
              <label className="text-[10px] font-black uppercase text-[#8E99A6] block mb-1">Pilih Tanggal</label>
              <input
                type="date"
                value={filter.selectedDate}
                onChange={e => setFilter({ ...filter, selectedDate: e.target.value })}
                className="px-3 py-1.5 bg-[#20252D] border border-[#343B46] rounded-xl text-xs text-[#F1F3F5] focus:outline-none focus:border-[#C89B3C]"
              />
            </div>
          )}

          {filter.type === 'monthly' && (
            <div>
              <label className="text-[10px] font-black uppercase text-[#8E99A6] block mb-1">Pilih Bulan</label>
              <input
                type="month"
                value={filter.selectedMonth}
                onChange={e => setFilter({ ...filter, selectedMonth: e.target.value })}
                className="px-3 py-1.5 bg-[#20252D] border border-[#343B46] rounded-xl text-xs text-[#F1F3F5] focus:outline-none focus:border-[#C89B3C]"
              />
            </div>
          )}

          {filter.type === 'range' && (
            <div className="flex items-center gap-2">
              <div>
                <label className="text-[10px] font-black uppercase text-[#8E99A6] block mb-1">Mulai</label>
                <input
                  type="date"
                  value={filter.startDate}
                  onChange={e => setFilter({ ...filter, startDate: e.target.value })}
                  className="px-3 py-1.5 bg-[#20252D] border border-[#343B46] rounded-xl text-xs text-[#F1F3F5] focus:outline-none focus:border-[#C89B3C]"
                />
              </div>
              <span className="text-[#8E99A6] text-xs pt-4">s/d</span>
              <div>
                <label className="text-[10px] font-black uppercase text-[#8E99A6] block mb-1">Sampai</label>
                <input
                  type="date"
                  value={filter.endDate}
                  onChange={e => setFilter({ ...filter, endDate: e.target.value })}
                  className="px-3 py-1.5 bg-[#20252D] border border-[#343B46] rounded-xl text-xs text-[#F1F3F5] focus:outline-none focus:border-[#C89B3C]"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-[10px] font-black uppercase text-[#8E99A6] block mb-1">Filter Barang</label>
            <select
              value={filter.itemName}
              onChange={e => setFilter({ ...filter, itemName: e.target.value })}
              className="px-3 py-1.5 bg-[#20252D] border border-[#343B46] rounded-xl text-xs text-[#F1F3F5] font-semibold focus:outline-none focus:border-[#C89B3C]"
            >
              <option value="Semua">Semua Barang</option>
              {ITEM_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={onDownload}
          className="px-4 py-2 bg-[#C89B3C] hover:bg-[#E0B85A] text-[#171A1F] rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer"
        >
          <FileText className="w-4 h-4" />
          <span>Download PDF</span>
        </button>
      </div>
    </div>
  );
}
