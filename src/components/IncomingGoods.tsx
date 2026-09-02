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

  const departments = ['Housekeeping', 'Resto', 'Tekhnisi', 'Front Office', 'General', 'Laundry'];

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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#252B34] p-4 md:p-6 rounded-2xl border border-[#343B46] shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-[#F1F3F5] tracking-tight">Barang Masuk</h2>
          <p className="text-xs md:text-sm text-[#8E99A6] mt-0.5 font-medium">Catat penerimaan barang dari vendor / supplier</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button 
            onClick={() => fetchData(true)}
            className="flex-1 md:flex-none bg-[#2A303A] text-[#D8DEE6] hover:text-[#F1F3F5] px-4 py-2.5 rounded-xl border border-[#3A424D] hover:bg-[#343D49] transition-all flex items-center justify-center gap-2 text-xs font-bold min-h-[44px] cursor-pointer shadow-xs"
          >
            <Activity className="w-4 h-4 text-[#C89B3C]" />
            <span>Refresh</span>
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex-1 md:flex-none bg-gradient-to-r from-[#E6B85C] to-[#C89B3C] hover:brightness-110 text-[#171A1F] px-5 py-2.5 rounded-xl font-extrabold flex items-center justify-center gap-2 transition-all shadow-sm text-xs sm:text-sm min-h-[44px] cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Catat Barang Masuk</span>
          </button>
        </div>
      </div>

      <div className="bg-[#252B34] rounded-2xl border border-[#343B46] shadow-[0_4px_20px_rgba(0,0,0,0.18)] overflow-hidden">
        <div className="p-4 md:p-5 border-b border-[#343B46] flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#20252D]">
          <div className="flex items-center gap-2">
            <h3 className="font-black text-[#F1F3F5] flex items-center gap-2 text-sm md:text-base">
              <ArrowDownCircle className="w-5 h-5 text-[#55B685]" />
              Riwayat Penerimaan
            </h3>
            <span className="text-xs bg-[#55B685]/15 text-[#55B685] border border-[#55B685]/30 px-2.5 py-0.5 rounded-full font-bold">
              {totalCount} Total
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E99A6]" />
              <input 
                type="text" 
                placeholder="Cari transaksi..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full md:w-60 pl-9 pr-3 py-2 text-xs bg-[#252B34] border border-[#3A424D] rounded-xl text-[#F1F3F5] placeholder:text-[#6F7985] focus:outline-none focus:border-[#C89B3C] transition-colors" 
              />
            </div>
            <div className="flex items-center gap-2">
              <select 
                value={selectedMonth}
                onChange={(e) => { setSelectedMonth(parseInt(e.target.value)); setPage(1); }}
                className="bg-[#252B34] border border-[#3A424D] text-[#F1F3F5] text-xs font-semibold rounded-xl px-3 py-2 outline-none focus:border-[#C89B3C] cursor-pointer"
              >
                {months.map((month, index) => (
                  <option key={index} value={index} className="bg-[#252B34] text-[#F1F3F5]">{month}</option>
                ))}
              </select>
              <select 
                value={selectedYear}
                onChange={(e) => { setSelectedYear(parseInt(e.target.value)); setPage(1); }}
                className="bg-[#252B34] border border-[#3A424D] text-[#F1F3F5] text-xs font-semibold rounded-xl px-3 py-2 outline-none focus:border-[#C89B3C] cursor-pointer"
              >
                {years.map((year) => (
                  <option key={year} value={year} className="bg-[#252B34] text-[#F1F3F5]">{year}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs md:text-sm">
            <thead>
              <tr className="border-b border-[#343B46] bg-[#20252D] text-[#8E99A6] font-bold uppercase tracking-wider text-[11px]">
                <th className="px-5 py-3">Tanggal & Waktu</th>
                <th className="px-5 py-3">Nama Barang</th>
                <th className="px-5 py-3">Departemen</th>
                <th className="px-5 py-3">Jumlah</th>
                <th className="px-5 py-3">Satuan</th>
                <th className="px-5 py-3">Catatan / Vendor</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2C333E]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-[#8E99A6]">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-[#C89B3C] border-t-transparent mb-2" />
                    <p className="text-xs font-medium">Memuat riwayat transaksi...</p>
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-[#8E99A6]">
                    <Package className="w-10 h-10 mx-auto mb-2 text-[#6F7985]" />
                    <p className="text-xs font-medium">Tidak ada data barang masuk untuk filter ini</p>
                  </td>
                </tr>
              ) : transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-[#2A303A]/70 transition-colors group">
                  <td className="px-5 py-3.5 whitespace-nowrap text-[#8E99A6] font-medium text-xs">
                    {format(new Date(tx.created_at), 'dd MMM yyyy HH:mm')}
                  </td>
                  <td className="px-5 py-3.5 font-bold text-[#F1F3F5]">
                    {tx.items?.name || 'Barang Dihapus'}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="px-2.5 py-1 bg-[#20252D] text-[#D8DEE6] rounded-lg text-xs font-semibold border border-[#3A424D]">
                      {tx.department || 'General'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-[#55B685] font-black text-sm">+{tx.quantity}</span>
                  </td>
                  <td className="px-5 py-3.5 text-[#8E99A6] font-medium">{tx.items?.unit}</td>
                  <td className="px-5 py-3.5 text-[#8E99A6] italic">{tx.notes || '-'}</td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex justify-end gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleEdit(tx)}
                        className="p-1.5 hover:bg-[#C89B3C]/15 text-[#E0B85A] rounded-lg transition-colors cursor-pointer"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setTransactionToDelete(tx)}
                        className="p-1.5 hover:bg-[#EB5757]/15 text-[#EB5757] rounded-lg transition-colors cursor-pointer"
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

        {/* Mobile Cards View (Tampilan Khusus HP - Tanpa Perlu Geser) */}
        <div className="block md:hidden divide-y divide-[#2C333E]">
          {loading ? (
            <div className="py-12 text-center text-[#8E99A6]">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-[#C89B3C] border-t-transparent mb-2" />
              <p className="text-xs font-medium">Memuat riwayat transaksi...</p>
            </div>
          ) : transactions.length === 0 ? (
            <div className="py-12 text-center text-[#8E99A6] px-4 space-y-2">
              <Package className="w-10 h-10 mx-auto text-[#6F7985]" />
              <p className="text-xs font-medium">Tidak ada data barang masuk untuk filter ini</p>
            </div>
          ) : (
            transactions.map((tx) => (
              <div key={tx.id} className="p-3.5 space-y-2.5 hover:bg-[#2A303A]/50 transition-colors">
                {/* Header Card: Nama & Jumlah Masuk Langsung Terlihat */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-[#F1F3F5] leading-tight">
                      {tx.items?.name || 'Barang Dihapus'}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1 text-[10px] text-[#8E99A6] flex-wrap">
                      <span className="px-2 py-0.5 bg-[#20252D] text-[#D8DEE6] rounded-md font-semibold border border-[#3A424D]">
                        {tx.department || 'General'}
                      </span>
                      <span>•</span>
                      <span>{format(new Date(tx.created_at), 'dd MMM yyyy, HH:mm')}</span>
                    </div>
                  </div>

                  {/* Highlight Jumlah Masuk */}
                  <div className="shrink-0 text-right">
                    <span className="px-2.5 py-1 bg-[#55B685]/15 border border-[#55B685]/30 text-[#55B685] rounded-xl text-xs font-black inline-flex items-center gap-1">
                      +{tx.quantity} <span className="text-[10px] font-bold text-[#8E99A6]">{tx.items?.unit || 'pcs'}</span>
                    </span>
                  </div>
                </div>

                {/* Catatan / Vendor */}
                {tx.notes && (
                  <p className="text-xs text-[#8E99A6] italic bg-[#20252D] p-2 rounded-xl border border-[#2C333E] break-words">
                    <span className="not-italic font-semibold text-[#6F7985]">Catatan: </span>
                    {tx.notes}
                  </p>
                )}

                {/* Footer Card: Aksi */}
                <div className="flex items-center justify-between pt-1 border-t border-[#343B46] text-xs">
                  <span className="text-[10px] text-[#6F7985] font-mono">
                    ID: #{tx.id.slice(0, 8)}
                  </span>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => handleEdit(tx)}
                      className="p-1.5 bg-[#2A303A] rounded-lg text-[#E0B85A] border border-[#3A424D] active:scale-95 hover:bg-[#C89B3C]/15 cursor-pointer"
                      title="Edit Transaksi"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => setTransactionToDelete(tx)}
                      className="p-1.5 bg-[#2A303A] rounded-lg text-[#EB5757] border border-[#3A424D] active:scale-95 hover:bg-[#EB5757]/15 cursor-pointer"
                      title="Hapus Transaksi"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Server-Side Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-[#343B46] bg-[#20252D] flex items-center justify-between">
            <span className="text-xs text-[#8E99A6] font-medium">
              Halaman <span className="font-bold text-[#F1F3F5]">{page}</span> dari <span className="font-bold text-[#F1F3F5]">{totalPages}</span> ({totalCount} transaksi)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 rounded-lg border border-[#3A424D] bg-[#2A303A] text-[#D8DEE6] text-xs font-bold hover:bg-[#343D49] hover:text-[#F1F3F5] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-all cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Sebelumnya
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-lg border border-[#3A424D] bg-[#2A303A] text-[#D8DEE6] text-xs font-bold hover:bg-[#343D49] hover:text-[#F1F3F5] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-all cursor-pointer"
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
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-start sm:items-center justify-center z-[100] p-4 overflow-y-auto">
          <div className="bg-[#252B34] w-full max-w-md rounded-2xl border border-[#343B46] shadow-2xl animate-in zoom-in duration-200 overflow-hidden flex flex-col mt-4 sm:mt-0 max-h-[90vh]">
            <div className="p-5 border-b border-[#343B46] flex justify-between items-center bg-[#20252D] flex-shrink-0">
              <h3 className="text-base font-black text-[#F1F3F5]">{editingTransaction ? 'Edit Barang Masuk' : 'Catat Barang Masuk'}</h3>
              <button onClick={() => { setIsModalOpen(false); setEditingTransaction(null); resetForm(); }} className="text-[#8E99A6] hover:text-[#F1F3F5] p-1 cursor-pointer">✕</button>
            </div>
            <form id="incoming-form" onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-grow">
              <div>
                <label className="block text-xs font-bold text-[#D8DEE6] uppercase mb-1">Pilih Barang</label>
                <select 
                  value={selectedItemId} 
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  className="w-full bg-[#20252D] border border-[#3A424D] rounded-xl p-3 text-sm text-[#F1F3F5] focus:outline-none focus:border-[#C89B3C] min-h-[44px]"
                  required
                >
                  <option value="" className="bg-[#252B34] text-[#F1F3F5]">-- Pilih Barang --</option>
                  {items.map(item => (
                    <option key={item.id} value={item.id} className="bg-[#252B34] text-[#F1F3F5]">{item.name} ({item.current_stock} {item.unit})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#D8DEE6] uppercase mb-1">Departemen</label>
                <select 
                  value={department} 
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full bg-[#20252D] border border-[#3A424D] rounded-xl p-3 text-sm text-[#F1F3F5] focus:outline-none focus:border-[#C89B3C] min-h-[44px]"
                  required
                >
                  {departments.map(dept => (
                    <option key={dept} value={dept} className="bg-[#252B34] text-[#F1F3F5]">{dept}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#D8DEE6] uppercase mb-1">Jumlah Masuk</label>
                <input 
                  type="number" 
                  value={quantity || ''} 
                  onChange={(e) => setQuantity(Number(e.target.value))} 
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="w-full bg-[#20252D] border border-[#3A424D] rounded-xl p-3 text-sm text-[#F1F3F5] focus:outline-none focus:border-[#C89B3C] min-h-[44px]" 
                  min="1"
                  required 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#D8DEE6] uppercase mb-1">Catatan / Vendor</label>
                <textarea 
                  value={notes} 
                  onChange={(e) => setNotes(e.target.value)} 
                  className="w-full bg-[#20252D] border border-[#3A424D] rounded-xl p-3 text-sm text-[#F1F3F5] placeholder:text-[#6F7985] focus:outline-none focus:border-[#C89B3C] h-24 resize-none"
                  placeholder="Contoh: Vendor XYZ - PO #123"
                />
              </div>
            </form>
            <div className="p-4 border-t border-[#343B46] bg-[#20252D] flex flex-col sm:flex-row gap-2.5 flex-shrink-0">
              <button 
                type="button" 
                onClick={() => { setIsModalOpen(false); setEditingTransaction(null); resetForm(); }}
                className="flex-1 bg-[#2A303A] border border-[#3A424D] py-2.5 rounded-xl font-bold text-xs text-[#D8DEE6] hover:text-[#F1F3F5] hover:bg-[#343D49] transition-all min-h-[44px] cursor-pointer"
              >
                Batal
              </button>
              <button 
                type="submit"
                form="incoming-form"
                disabled={isSubmitting}
                className="flex-1 bg-gradient-to-r from-[#E6B85C] to-[#C89B3C] hover:brightness-110 py-2.5 rounded-xl font-extrabold text-xs text-[#171A1F] transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px] cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-[#171A1F]/30 border-t-[#171A1F] rounded-full animate-spin" />
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
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-[110] p-4">
          <div className="bg-[#252B34] w-full max-w-sm rounded-2xl border border-[#343B46] shadow-2xl p-6 space-y-4 animate-in zoom-in duration-200 text-center">
            <div className="w-12 h-12 bg-[#EB5757]/15 text-[#EB5757] rounded-2xl flex items-center justify-center mx-auto border border-[#EB5757]/30">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-[#F1F3F5]">Hapus Transaksi?</h3>
              <p className="text-xs text-[#8E99A6] mt-1 font-medium">Stok barang akan dikurangi kembali sesuai jumlah transaksi ini.</p>
            </div>
            <div className="flex gap-2 pt-2">
              <button 
                onClick={() => setTransactionToDelete(null)}
                className="flex-1 bg-[#2A303A] border border-[#3A424D] py-2.5 rounded-xl text-xs font-bold text-[#D8DEE6] hover:text-[#F1F3F5] cursor-pointer"
              >
                Batal
              </button>
              <button 
                onClick={handleDelete}
                className="flex-1 bg-[#EB5757] hover:bg-[#D94545] py-2.5 rounded-xl text-xs font-bold text-white shadow-sm cursor-pointer"
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
