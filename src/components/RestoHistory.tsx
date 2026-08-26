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
      <div className="bg-white rounded-2xl p-4 md:p-5 border border-gray-200/90 shadow-xs flex items-center justify-between gap-3">
        <div>
          <span className="text-[10px] font-black text-amber-600 uppercase tracking-wider block">
            HISTORI PENGAMBILAN
          </span>
          <h2 className="text-xl font-black text-gray-900 tracking-tight">Riwayat Resto</h2>
          <p className="text-xs text-gray-500 font-medium mt-0.5">Daftar barang yang telah diambil oleh bagian Restoran</p>
        </div>
        <button
          onClick={fetchRestoHistory}
          disabled={loading}
          title="Segarkan Riwayat"
          className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-600' : ''}`} />
        </button>
      </div>

      {/* Summary KPI Pills */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-gray-200/90 shadow-xs">
          <p className="text-[11px] font-bold text-gray-500 uppercase">Total Transaksi</p>
          <p className="text-xl font-black text-gray-900 mt-1">{filteredTransactions.length}</p>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-gray-200/90 shadow-xs">
          <p className="text-[11px] font-bold text-gray-500 uppercase">Total Kuantitas Keluar</p>
          <p className="text-xl font-black text-amber-600 mt-1">{totalItemsTaken} item</p>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="bg-white rounded-2xl border border-gray-200/90 shadow-xs p-3.5 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari barang, catatan, atau petugas..."
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500 focus:bg-white transition-all"
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
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                timeFilter === tab.id
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
          <div className="py-12 text-center bg-white rounded-2xl border border-gray-200/90 shadow-xs space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin text-amber-600 mx-auto" />
            <p className="text-xs text-gray-500 font-medium">Memuat riwayat transaksi...</p>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="py-12 text-center bg-white rounded-2xl border border-dashed border-gray-200 p-6 space-y-3">
            <UtensilsCrossed className="w-10 h-10 text-gray-300 mx-auto" />
            <div>
              <p className="text-sm font-bold text-gray-700">Belum ada riwayat pengambilan</p>
              <p className="text-xs text-gray-400 mt-0.5">Transaksi pengambilan barang akan tercatat otomatis di sini.</p>
            </div>
            {onNavigateToTakeGoods && (
              <button
                onClick={onNavigateToTakeGoods}
                className="mt-2 px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-black shadow-xs hover:bg-amber-700 transition-all"
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
                className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-xs space-y-2 hover:border-amber-300 transition-all"
              >
                <div className="flex items-center justify-between text-[11px] text-gray-400 font-semibold border-b border-gray-100 pb-2">
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <Calendar className="w-3.5 h-3.5 text-amber-600" />
                    <span>{format(txDate, 'dd MMMM yyyy • HH:mm', { locale: localeId })}</span>
                  </div>
                  <span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded-md font-extrabold border border-orange-200/60 uppercase text-[10px]">
                    OUT • Resto
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 pt-0.5">
                  <div className="min-w-0">
                    <h4 className="text-sm font-black text-gray-900 truncate">
                      {itemName}
                    </h4>
                    {tx.notes && (
                      <p className="text-xs text-gray-500 font-medium italic mt-0.5">
                        "{tx.notes}"
                      </p>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-base font-black text-orange-600">
                      {tx.quantity} <span className="text-xs font-bold text-gray-600">{unit}</span>
                    </span>
                  </div>
                </div>

                <div className="pt-1.5 flex items-center justify-between text-[11px] text-gray-400 border-t border-gray-50">
                  <div className="flex items-center gap-1 text-gray-500 font-medium">
                    <User className="w-3 h-3 text-gray-400" />
                    <span>Diambil oleh: <strong className="text-gray-700">{userName}</strong></span>
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
