import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Transaction } from '../types';
import { 
  Search, 
  Clock, 
  ArrowUpRight, 
  Calendar, 
  User, 
  RefreshCw, 
  Package, 
  Filter,
  FileText,
  Sparkles,
  UtensilsCrossed
} from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

interface RestoHistoryProps {
  onNavigateToTakeGoods?: () => void;
}

export function RestoHistory({ onNavigateToTakeGoods }: RestoHistoryProps) {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [userProfiles, setUserProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | '7days' | '30days'>('all');

  useEffect(() => {
    fetchRestoHistory();
  }, []);

  const fetchRestoHistory = async () => {
    setLoading(true);
    try {
      // 1. Fetch profiles for user name display
      const { data: profData } = await supabase
        .from('profiles')
        .select('id, full_name, username');

      if (profData) {
        const profMap: Record<string, string> = {};
        profData.forEach(p => {
          profMap[p.id] = p.full_name || p.username || 'Staff Resto';
        });
        setUserProfiles(profMap);
      }

      // 2. Fetch OUT transactions for Resto department
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          id,
          item_id,
          type,
          quantity,
          department,
          notes,
          created_at,
          user_id,
          items:items (
            id,
            name,
            unit,
            department
          )
        `)
        .eq('type', 'OUT')
        .ilike('department', '%resto%')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch (err: any) {
      console.error('Error fetching resto history:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredTransactions = useMemo(() => {
    let result = transactions;

    // Time filter
    const now = new Date();
    if (timeFilter === 'today') {
      const todayStart = startOfDay(now);
      result = result.filter(tx => new Date(tx.created_at) >= todayStart);
    } else if (timeFilter === '7days') {
      const sevenDaysAgo = subDays(now, 7);
      result = result.filter(tx => new Date(tx.created_at) >= sevenDaysAgo);
    } else if (timeFilter === '30days') {
      const thirtyDaysAgo = subDays(now, 30);
      result = result.filter(tx => new Date(tx.created_at) >= thirtyDaysAgo);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(tx => {
        const itemName = (tx.items?.name || '').toLowerCase();
        const notes = (tx.notes || '').toLowerCase();
        const userName = (userProfiles[tx.user_id] || '').toLowerCase();
        return itemName.includes(q) || notes.includes(q) || userName.includes(q);
      });
    }

    return result;
  }, [transactions, timeFilter, searchQuery, userProfiles]);

  const totalItemsTaken = useMemo(() => {
    return filteredTransactions.reduce((acc, tx) => acc + (Number(tx.quantity) || 0), 0);
  }, [filteredTransactions]);

  return (
    <div className="space-y-4 max-w-xl mx-auto pb-12 font-sans animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-[#252B34] rounded-2xl p-4 md:p-5 border border-[#343B46] shadow-[0_4px_20px_rgba(0,0,0,0.18)] flex items-center justify-between gap-3">
        <div>
          <span className="text-[10px] font-black text-[#E0B85A] uppercase tracking-wider block">
            HISTORI PENGAMBILAN
          </span>
          <h2 className="text-xl font-black text-[#F1F3F5] tracking-tight">Riwayat Resto</h2>
          <p className="text-xs text-[#8E99A6] font-medium mt-0.5">Daftar barang yang telah diambil oleh bagian Restoran</p>
        </div>
        <button
          onClick={fetchRestoHistory}
          disabled={loading}
          title="Segarkan Riwayat"
          className="p-2 text-[#8E99A6] hover:text-[#E0B85A] hover:bg-[#C89B3C]/15 rounded-xl transition-all cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#E0B85A]' : ''}`} />
        </button>
      </div>

      {/* Summary KPI Pills */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#252B34] p-3.5 rounded-2xl border border-[#343B46] shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
          <p className="text-[11px] font-bold text-[#8E99A6] uppercase">Total Transaksi</p>
          <p className="text-xl font-black text-[#F1F3F5] mt-1">{filteredTransactions.length}</p>
        </div>
        <div className="bg-[#252B34] p-3.5 rounded-2xl border border-[#343B46] shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
          <p className="text-[11px] font-bold text-[#8E99A6] uppercase">Total Kuantitas Keluar</p>
          <p className="text-xl font-black text-[#E0B85A] mt-1">{totalItemsTaken} item</p>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="bg-[#252B34] rounded-2xl border border-[#343B46] shadow-[0_4px_20px_rgba(0,0,0,0.18)] p-3.5 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8E99A6]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari barang, catatan, atau petugas..."
            className="w-full pl-10 pr-4 py-2.5 bg-[#20252D] border border-[#3A424D] rounded-xl text-xs font-semibold text-[#F1F3F5] placeholder:text-[#6F7985] focus:outline-none focus:border-[#C89B3C] transition-all"
          />
        </div>

        {/* Time Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {[
            { id: 'all', label: 'Semua' },
            { id: 'today', label: 'Hari Ini' },
            { id: '7days', label: '7 Hari Terakhir' },
            { id: '30days', label: '30 Hari Terakhir' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setTimeFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                timeFilter === tab.id
                  ? 'bg-[#C89B3C] text-[#171A1F] shadow-xs'
                  : 'bg-[#20252D] text-[#8E99A6] hover:text-[#D8DEE6] border border-[#3A424D]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* History Items List */}
      <div className="space-y-2.5">
        {loading ? (
          <div className="py-12 text-center bg-[#252B34] rounded-2xl border border-[#343B46] shadow-[0_4px_20px_rgba(0,0,0,0.18)] space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin text-[#E0B85A] mx-auto" />
            <p className="text-xs text-[#8E99A6] font-medium">Memuat riwayat transaksi...</p>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="py-12 text-center bg-[#252B34] rounded-2xl border border-dashed border-[#343B46] p-6 space-y-3">
            <UtensilsCrossed className="w-10 h-10 text-[#6F7985] mx-auto" />
            <div>
              <p className="text-sm font-bold text-[#F1F3F5]">Belum ada riwayat pengambilan</p>
              <p className="text-xs text-[#8E99A6] mt-0.5">Transaksi pengambilan barang akan tercatat otomatis di sini.</p>
            </div>
            {onNavigateToTakeGoods && (
              <button
                onClick={onNavigateToTakeGoods}
                className="mt-2 px-4 py-2 bg-gradient-to-r from-[#E6B85C] to-[#C89B3C] text-[#171A1F] rounded-xl text-xs font-black shadow-xs hover:brightness-110 transition-all cursor-pointer"
              >
                Ambil Barang Sekarang
              </button>
            )}
          </div>
        ) : (
          filteredTransactions.map(tx => {
            const userName = userProfiles[tx.user_id] || 'Staff Resto';
            const txDate = new Date(tx.created_at);
            const itemName = tx.items?.name || 'Barang Gudang';
            const unit = tx.items?.unit || 'pcs';

            return (
              <div 
                key={tx.id}
                className="bg-[#252B34] p-4 rounded-2xl border border-[#343B46] shadow-[0_4px_20px_rgba(0,0,0,0.18)] space-y-2 hover:border-[#C89B3C]/50 transition-all"
              >
                <div className="flex items-center justify-between text-[11px] text-[#8E99A6] font-semibold border-b border-[#343B46] pb-2">
                  <div className="flex items-center gap-1.5 text-[#8E99A6]">
                    <Calendar className="w-3.5 h-3.5 text-[#E0B85A]" />
                    <span>{format(txDate, 'dd MMMM yyyy • HH:mm', { locale: localeId })}</span>
                  </div>
                  <span className="bg-[#C89B3C]/15 text-[#E0B85A] px-2 py-0.5 rounded-md font-extrabold border border-[#C89B3C]/30 uppercase text-[10px]">
                    OUT • Resto
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 pt-0.5">
                  <div className="min-w-0">
                    <h4 className="text-sm font-black text-[#F1F3F5] truncate">
                      {itemName}
                    </h4>
                    {tx.notes && (
                      <p className="text-xs text-[#8E99A6] font-medium italic mt-0.5">
                        "{tx.notes}"
                      </p>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-base font-black text-[#E0B85A]">
                      -{tx.quantity} <span className="text-xs font-bold text-[#8E99A6]">{unit}</span>
                    </span>
                  </div>
                </div>

                <div className="pt-1.5 flex items-center justify-between text-[11px] text-[#6F7985] border-t border-[#343B46]">
                  <div className="flex items-center gap-1 text-[#8E99A6] font-medium">
                    <User className="w-3 h-3 text-[#6F7985]" />
                    <span>Diambil oleh: <strong className="text-[#F1F3F5]">{userName}</strong></span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
