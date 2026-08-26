import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Item, Transaction } from '../types';
import { 
  ArrowDownCircle, 
  Search, 
  Plus, 
  Calendar as CalendarIcon, 
  Package, 
  Activity, 
  AlertCircle, 
  Edit2, 
  Trash2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { format } from 'date-fns';
import { inventoryService } from '../services/inventoryService';
import { transactionService } from '../services/transactionService';
import { useAuth } from '../contexts/AuthContext';

interface IncomingGoodsProps {
  globalSearch?: string;
}

export function IncomingGoods({ globalSearch = '' }: IncomingGoodsProps) {
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);
  const [searchTerm, setSearchTerm] = useState(globalSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(globalSearch);

  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 15;

  // Month & Year Filter
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  // Sync local search with global search
  useEffect(() => {
    if (globalSearch !== searchTerm) {
      setSearchTerm(globalSearch);
    }
  }, [globalSearch]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Form state
  const [selectedItemId, setSelectedItemId] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [department, setDepartment] = useState('Housekeeping');
  const [notes, setNotes] = useState('');

  const departments = ['Housekeeping', 'Resto', 'Tekhnisi', 'Front Office', 'General'];

  // Load dropdown items
  useEffect(() => {
    inventoryService.getCachedItems().then(data => {
      if (data) setItems(data);
    });
  }, []);

  const fetchData = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    try {
      if (forceRefresh) {
        inventoryService.invalidateCache();
        const freshItems = await inventoryService.getCachedItems(true);
        if (freshItems) setItems(freshItems);
      }

      const result = await transactionService.getTransactions({
        type: 'IN',
        search: debouncedSearch,
        month: selectedMonth,
        year: selectedYear,
        page,
        limit: pageSize
      });

      setTransactions(result.data);
      setTotalCount(result.total);
      setTotalPages(result.totalPages);
    } catch (error) {
      console.error('Error fetching incoming transactions:', error);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, selectedMonth, selectedYear, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId || quantity <= 0) return;
    setIsSubmitting(true);

    try {
      const currentUserId = user?.id;
      if (!currentUserId) {
        setIsSubmitting(false);
        return;
      }

      if (editingTransaction) {
        // 1. Update transaction
        const { error: transError } = await supabase.from('transactions').update({
          item_id: selectedItemId,
          quantity,
          department,
          notes
        }).eq('id', editingTransaction.id);

        if (transError) throw transError;

        // 2. Update stock (revert old, add new)
        const item = items.find(i => i.id === selectedItemId);
        if (item) {
          const diff = quantity - editingTransaction.quantity;
          const { error: updateError } = await supabase.from('items').update({
            current_stock: item.current_stock + diff
          }).eq('id', item.id);
          if (updateError) throw updateError;
        }
      } else {
        await transactionService.createTransaction({
          itemId: selectedItemId,
          type: 'IN',
          quantity,
          department,
          notes,
          userId: currentUserId
        });
      }

      inventoryService.invalidateCache();
      setIsModalOpen(false);
      setEditingTransaction(null);
      resetForm();
      fetchData(true);
    } catch (error: any) {
      console.error('Submit error:', error);
      alert('Gagal menyimpan transaksi: ' + (error.message || 'Error tidak diketahui'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedItemId('');
    setQuantity(0);
    setDepartment('Housekeeping');
    setNotes('');
  };

  const handleEdit = (tx: Transaction) => {
    setEditingTransaction(tx);
    setSelectedItemId(tx.item_id);
    setQuantity(tx.quantity);
    setDepartment(tx.department || 'Housekeeping');
    setNotes(tx.notes || '');
    setIsModalOpen(true);
  };

  const handleDelete = async () => {
    if (!transactionToDelete) return;
    try {
      await transactionService.deleteTransaction(transactionToDelete);
      setTransactionToDelete(null);
      fetchData(true);
    } catch (error: any) {
      console.error('Delete error:', error);
      alert('Gagal menghapus transaksi: ' + error.message);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-20 md:pb-6 font-sans">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 md:p-6 rounded-2xl border border-gray-200/90 shadow-sm">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">Barang Masuk</h2>
          <p className="text-xs md:text-sm text-gray-500 mt-0.5 font-medium">Catat penerimaan barang dari vendor / supplier</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button 
            onClick={() => fetchData(true)}
            className="flex-1 md:flex-none bg-gray-100 text-gray-700 hover:text-gray-900 px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-200 transition-all flex items-center justify-center gap-2 text-xs font-bold min-h-[44px]"
          >
            <Activity className="w-4 h-4 text-amber-600" />
            <span>Refresh</span>
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex-1 md:flex-none bg-[#E65C00] hover:bg-[#CF5300] text-white px-5 py-2.5 rounded-xl font-extrabold flex items-center justify-center gap-2 transition-all shadow-sm shadow-orange-500/20 text-xs sm:text-sm min-h-[44px]"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Catat Barang Masuk</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200/90 shadow-sm overflow-hidden">
        <div className="p-4 md:p-5 border-b border-gray-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-50/80">
          <div className="flex items-center gap-2">
            <h3 className="font-black text-gray-900 flex items-center gap-2 text-sm md:text-base">
              <ArrowDownCircle className="w-5 h-5 text-emerald-600" />
              Riwayat Penerimaan
            </h3>
            <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
              {totalCount} Total
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Cari transaksi..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full md:w-60 pl-9 pr-3 py-2 text-xs bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500 transition-colors" 
              />
            </div>
            <div className="flex items-center gap-2">
              <select 
                value={selectedMonth}
                onChange={(e) => { setSelectedMonth(parseInt(e.target.value)); setPage(1); }}
                className="bg-white border border-gray-200 text-gray-800 text-xs font-semibold rounded-xl px-3 py-2 outline-none focus:border-amber-500"
              >
                {months.map((month, index) => (
                  <option key={index} value={index}>{month}</option>
                ))}
              </select>
              <select 
                value={selectedYear}
                onChange={(e) => { setSelectedYear(parseInt(e.target.value)); setPage(1); }}
                className="bg-white border border-gray-200 text-gray-800 text-xs font-semibold rounded-xl px-3 py-2 outline-none focus:border-amber-500"
              >
                {years.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs md:text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-100/70 text-gray-600 font-bold uppercase tracking-wider text-[11px]">
                <th className="px-5 py-3">Tanggal & Waktu</th>
                <th className="px-5 py-3">Nama Barang</th>
                <th className="px-5 py-3">Departemen</th>
                <th className="px-5 py-3">Jumlah</th>
                <th className="px-5 py-3">Satuan</th>
                <th className="px-5 py-3">Catatan / Vendor</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-amber-500 border-t-transparent mb-2" />
                    <p className="text-xs font-medium">Memuat riwayat transaksi...</p>
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    <Package className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    <p className="text-xs font-medium">Tidak ada data barang masuk untuk filter ini</p>
                  </td>
                </tr>
              ) : transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-amber-50/30 transition-colors group">
                  <td className="px-5 py-3.5 whitespace-nowrap text-gray-600 font-medium text-xs">
                    {format(new Date(tx.created_at), 'dd MMM yyyy HH:mm')}
                  </td>
                  <td className="px-5 py-3.5 font-bold text-gray-900">
                    {tx.items?.name || 'Barang Dihapus'}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold border border-gray-200">
                      {tx.department || 'General'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-emerald-600 font-black text-sm">+{tx.quantity}</span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-600 font-medium">{tx.items?.unit}</td>
                  <td className="px-5 py-3.5 text-gray-500 italic">{tx.notes || '-'}</td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex justify-end gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleEdit(tx)}
                        className="p-1.5 hover:bg-amber-50 text-amber-600 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setTransactionToDelete(tx)}
                        className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Server-Side Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
            <span className="text-xs text-gray-500 font-medium">
              Halaman <span className="font-bold text-gray-800">{page}</span> dari <span className="font-bold text-gray-800">{totalPages}</span> ({totalCount} transaksi)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 text-xs font-bold hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-all"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Sebelumnya
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 text-xs font-bold hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-all"
              >
                Selanjutnya
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-start sm:items-center justify-center z-[100] p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-md rounded-2xl border border-gray-200 shadow-2xl animate-in zoom-in duration-200 overflow-hidden flex flex-col mt-4 sm:mt-0 max-h-[90vh]">
            <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-gray-50 flex-shrink-0">
              <h3 className="text-base font-black text-gray-900">{editingTransaction ? 'Edit Barang Masuk' : 'Catat Barang Masuk'}</h3>
              <button onClick={() => { setIsModalOpen(false); setEditingTransaction(null); resetForm(); }} className="text-gray-400 hover:text-gray-600 p-1">✕</button>
            </div>
            <form id="incoming-form" onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-grow">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Pilih Barang</label>
                <select 
                  value={selectedItemId} 
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:outline-none focus:border-amber-500 focus:bg-white min-h-[44px]"
                  required
                >
                  <option value="">-- Pilih Barang --</option>
                  {items.map(item => (
                    <option key={item.id} value={item.id}>{item.name} ({item.current_stock} {item.unit})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Departemen</label>
                <select 
                  value={department} 
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:outline-none focus:border-amber-500 focus:bg-white min-h-[44px]"
                  required
                >
                  {departments.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Jumlah Masuk</label>
                <input 
                  type="number" 
                  value={quantity} 
                  onChange={(e) => setQuantity(Number(e.target.value))} 
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:outline-none focus:border-amber-500 focus:bg-white min-h-[44px]" 
                  min="1"
                  required 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Catatan / Vendor</label>
                <textarea 
                  value={notes} 
                  onChange={(e) => setNotes(e.target.value)} 
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:outline-none focus:border-amber-500 focus:bg-white h-24 resize-none"
                  placeholder="Contoh: Vendor XYZ - PO #123"
                />
              </div>
            </form>
            <div className="p-4 border-t border-gray-200 bg-gray-50 flex flex-col sm:flex-row gap-2.5 flex-shrink-0">
              <button 
                type="button" 
                onClick={() => { setIsModalOpen(false); setEditingTransaction(null); resetForm(); }}
                className="flex-1 bg-white border border-gray-200 py-2.5 rounded-xl font-bold text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all min-h-[44px]"
              >
                Batal
              </button>
              <button 
                type="submit"
                form="incoming-form"
                disabled={isSubmitting}
                className="flex-1 bg-[#E65C00] hover:bg-[#CF5300] py-2.5 rounded-xl font-extrabold text-xs text-white transition-all shadow-sm shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px]"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  editingTransaction ? 'Simpan Perubahan' : 'Simpan Transaksi'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {transactionToDelete && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-[110] p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl border border-gray-200 shadow-2xl p-6 space-y-4 animate-in zoom-in duration-200 text-center">
            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto border border-red-100">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-gray-900">Hapus Transaksi?</h3>
              <p className="text-xs text-gray-500 mt-1 font-medium">Stok barang akan dikurangi kembali sesuai jumlah transaksi ini.</p>
            </div>
            <div className="flex gap-2 pt-2">
              <button 
                onClick={() => setTransactionToDelete(null)}
                className="flex-1 bg-gray-100 border border-gray-200 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:text-gray-900"
              >
                Batal
              </button>
              <button 
                onClick={handleDelete}
                className="flex-1 bg-red-600 hover:bg-red-700 py-2.5 rounded-xl text-xs font-bold text-white shadow-sm"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
