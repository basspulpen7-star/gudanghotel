import React, { useMemo } from 'react';
import { 
  ArrowDownCircle, 
  ArrowUpCircle, 
  Trash2, 
  PackageCheck, 
  BedDouble, 
  FileText, 
  Sparkles,
  Plus
} from 'lucide-react';
import { format } from 'date-fns';
import { ITEM_TYPES } from '../constants-linen';
import { LinenState } from '../types-linen';
import { calculateCleanStockMap, calculateNewStockMap } from '../lib/linenUtils';

interface LinenDashboardProps {
  state: LinenState;
  onNavigate: (tab: 'dashboard' | 'transactions' | 'room' | 'clean' | 'new' | 'incoming' | 'outgoing' | 'reports') => void;
}

export function LinenDashboard({ state, onNavigate }: LinenDashboardProps) {
  const cleanStockMap = useMemo(() => calculateCleanStockMap(state), [state]);
  const newStockMap = useMemo(() => calculateNewStockMap(state), [state]);

  const { totalClean, totalNew, totalIncoming, totalLaundry, totalTakenHk, totalAfkir } = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const totalClean = Object.values(cleanStockMap).reduce((acc: number, qty: number) => acc + qty, 0);
    const totalNew = Object.values(newStockMap).reduce((acc: number, qty: number) => acc + qty, 0);
    const totalIncoming = (state.incomingItems || [])
      .filter((item: any) => item.date === today)
      .reduce((acc: number, item: any) => acc + Number(item.quantity || 0), 0);
    const totalLaundry = (state.outgoingItems || [])
      .filter((item: any) => (item.destination === 'Laundry' || (item.destination || '').toLowerCase().includes('laundry')) && item.date === today)
      .reduce((acc: number, item: any) => acc + Number(item.quantity || 0), 0);
    const totalTakenHk = (state.outgoingItems || [])
      .filter((item: any) => (item.destination === 'Diambil HK' || item.destination === 'HK' || item.destination === 'Housekeeping' || (item.destination || '').toLowerCase().includes('hk')) && item.date === today)
      .reduce((acc: number, item: any) => acc + Number(item.quantity || 0), 0);
    const totalAfkir = (state.outgoingItems || [])
      .filter((item: any) => (item.destination === 'Afkir' || (item.destination || '').toLowerCase().includes('afkir')) && item.date === today)
      .reduce((acc: number, item: any) => acc + Number(item.quantity || 0), 0);

    return { totalClean, totalNew, totalIncoming, totalLaundry, totalTakenHk, totalAfkir };
  }, [state, cleanStockMap, newStockMap]);

  const topItems = useMemo(() => {
    return ITEM_TYPES.map(type => ({
      itemName: type,
      quantity: cleanStockMap[type] || 0
    })).sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  }, [cleanStockMap]);

  return (
    <div className="space-y-6 pb-10 font-sans">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Main Content Area - 8 cols */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* Header & Date */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-[#C89B3C] tracking-wider uppercase bg-[#C89B3C]/10 px-2 py-0.5 rounded-md border border-[#C89B3C]/20">
                  Linen Management
                </span>
                <span className="text-xs text-[#8E99A6] font-medium">Hotel Alia</span>
              </div>
              <h2 className="text-2xl font-black text-[#F1F3F5] tracking-tight mt-1">Ringkasan Linen Hari Ini</h2>
              <p className="text-xs text-[#8E99A6] font-medium">
                Aktivitas &amp; pergerakan linen per {format(new Date(), 'dd MMMM yyyy')}
              </p>
            </div>
          </div>

          {/* Today's Activity Hero Card */}
          <div className="p-6 sm:p-7 rounded-2xl border border-[#343B46] bg-[#252B34] relative overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
            <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-6 sm:gap-4 relative z-10">
              <div className="flex-1">
                <p className="text-xs font-black uppercase tracking-wider text-[#8E99A6] mb-4 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#E0B85A]" />
                  Aktivitas Hari Ini
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                  <div className="bg-[#20252D] p-3.5 rounded-xl border border-[#343B46]">
                    <div className="flex items-center gap-1.5 mb-1 text-[#60A5FA]">
                      <ArrowDownCircle className="w-4 h-4" />
                      <span className="text-[10px] font-black tracking-wider uppercase">MASUK</span>
                    </div>
                    <h3 className="text-2xl sm:text-3xl font-black text-[#F1F3F5] tracking-tight">{totalIncoming}</h3>
                    <p className="text-[10px] text-[#8E99A6] mt-0.5 whitespace-nowrap">Linen masuk</p>
                  </div>

                  <div className="bg-[#20252D] p-3.5 rounded-xl border border-[#343B46]">
                    <div className="flex items-center gap-1.5 mb-1 text-[#FB923C]">
                      <ArrowUpCircle className="w-4 h-4" />
                      <span className="text-[10px] font-black tracking-wider uppercase">LAUNDRY</span>
                    </div>
                    <h3 className="text-2xl sm:text-3xl font-black text-[#F1F3F5] tracking-tight">{totalLaundry}</h3>
                    <p className="text-[10px] text-[#8E99A6] mt-0.5 whitespace-nowrap">Ke Laundry</p>
                  </div>

                  <div className="bg-[#20252D] p-3.5 rounded-xl border border-[#343B46]">
                    <div className="flex items-center gap-1.5 mb-1 text-[#60A5FA]">
                      <FileText className="w-4 h-4" />
                      <span className="text-[10px] font-black tracking-wider uppercase">DIAMBIL HK</span>
                    </div>
                    <h3 className="text-2xl sm:text-3xl font-black text-[#F1F3F5] tracking-tight">{totalTakenHk}</h3>
                    <p className="text-[10px] text-[#8E99A6] mt-0.5 whitespace-nowrap">Oleh HK</p>
                  </div>

                  <div className="bg-[#20252D] p-3.5 rounded-xl border border-[#343B46]">
                    <div className="flex items-center gap-1.5 mb-1 text-[#F87171]">
                      <Trash2 className="w-4 h-4" />
                      <span className="text-[10px] font-black tracking-wider uppercase">AFKIR</span>
                    </div>
                    <h3 className="text-2xl sm:text-3xl font-black text-[#F1F3F5] tracking-tight">{totalAfkir}</h3>
                    <p className="text-[10px] text-[#8E99A6] mt-0.5 whitespace-nowrap">Rusak/Afkir</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div>
            <h4 className="text-sm font-black text-[#F1F3F5] mb-3">Akses Cepat Modul Linen</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button 
                onClick={() => onNavigate('incoming')}
                className="p-4 rounded-xl border border-[#343B46] bg-[#252B34] hover:bg-[#2C333E] hover:border-[#C89B3C]/50 flex flex-col items-center justify-center gap-2.5 transition-all group cursor-pointer shadow-xs"
              >
                <div className="w-11 h-11 rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <ArrowDownCircle className="w-5 h-5" />
                </div>
                <span className="font-bold text-xs text-[#D8DEE6] group-hover:text-[#F1F3F5]">Catat Masuk</span>
              </button>
              
              <button 
                onClick={() => onNavigate('outgoing')}
                className="p-4 rounded-xl border border-[#343B46] bg-[#252B34] hover:bg-[#2C333E] hover:border-[#C89B3C]/50 flex flex-col items-center justify-center gap-2.5 transition-all group cursor-pointer shadow-xs"
              >
                <div className="w-11 h-11 rounded-xl bg-orange-500/15 text-orange-400 border border-orange-500/30 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <ArrowUpCircle className="w-5 h-5" />
                </div>
                <span className="font-bold text-xs text-[#D8DEE6] group-hover:text-[#F1F3F5]">Catat Keluar</span>
              </button>

              <button 
                onClick={() => onNavigate('room')}
                className="p-4 rounded-xl border border-[#343B46] bg-[#252B34] hover:bg-[#2C333E] hover:border-[#C89B3C]/50 flex flex-col items-center justify-center gap-2.5 transition-all group cursor-pointer shadow-xs"
              >
                <div className="w-11 h-11 rounded-xl bg-[#C89B3C]/15 text-[#E0B85A] border border-[#C89B3C]/30 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <BedDouble className="w-5 h-5" />
                </div>
                <span className="font-bold text-xs text-[#D8DEE6] group-hover:text-[#F1F3F5] text-center">Brg Terpasang</span>
              </button>

              <button 
                onClick={() => onNavigate('reports')}
                className="p-4 rounded-xl border border-[#343B46] bg-[#252B34] hover:bg-[#2C333E] hover:border-[#C89B3C]/50 flex flex-col items-center justify-center gap-2.5 transition-all group cursor-pointer shadow-xs"
              >
                <div className="w-11 h-11 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <FileText className="w-5 h-5" />
                </div>
                <span className="font-bold text-xs text-[#D8DEE6] group-hover:text-[#F1F3F5]">Laporan Set</span>
              </button>
            </div>
          </div>
        </div>

        {/* Total Inventory Side Bar - 4 cols */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="p-6 rounded-2xl border border-[#343B46] bg-[#252B34] flex flex-col shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[#343B46]">
              <div className="w-10 h-10 rounded-xl bg-[#C89B3C]/15 border border-[#C89B3C]/30 text-[#E0B85A] flex items-center justify-center">
                <PackageCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-[#F1F3F5] tracking-tight">Total Inventaris Linen</h3>
                <p className="text-[11px] text-[#8E99A6]">Stok bersih &amp; stok baru</p>
              </div>
            </div>
            
            <div className="space-y-4 flex-1">
              <div className="p-4 rounded-xl bg-[#20252D] border border-[#343B46]">
                <p className="text-[10px] font-black uppercase tracking-wider text-[#8E99A6] mb-1">Barang Bersih Siap Pakai</p>
                <div className="flex items-baseline justify-between">
                  <p className="text-3xl sm:text-4xl font-black text-[#55B685] tracking-tight">
                    {totalClean.toLocaleString()}
                  </p>
                  <span className="text-xs font-bold text-[#8E99A6]">pcs</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#20252D] border border-[#343B46]">
                <p className="text-[10px] font-black uppercase tracking-wider text-[#8E99A6] mb-1">Barang Baru di Gudang</p>
                <div className="flex items-baseline justify-between">
                  <p className="text-3xl sm:text-4xl font-black text-[#E0B85A] tracking-tight">
                    {totalNew.toLocaleString()}
                  </p>
                  <span className="text-xs font-bold text-[#8E99A6]">pcs</span>
                </div>
              </div>
            </div>

            {/* Top Clean Items preview */}
            {topItems.length > 0 && (
              <div className="mt-6 pt-4 border-t border-[#343B46]">
                <p className="text-[10px] font-black uppercase tracking-wider text-[#8E99A6] mb-3">Stok Bersih Terbanyak</p>
                <div className="space-y-2">
                  {topItems.map((item) => (
                    <div key={item.itemName} className="flex justify-between items-center text-xs py-1 px-2 rounded-lg hover:bg-[#20252D]">
                      <span className="text-[#D8DEE6] font-medium truncate pr-2">{item.itemName}</span>
                      <span className="font-black text-[#55B685] bg-[#55B685]/10 px-2 py-0.5 rounded-md text-[11px] shrink-0">
                        {item.quantity} pcs
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
