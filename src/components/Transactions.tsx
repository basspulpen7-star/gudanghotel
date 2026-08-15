import React, { useState, useEffect, useCallback, useTransition } from 'react';
import { 
  ArrowDownCircle, 
  ArrowUpCircle, 
  Plus, 
  Minus, 
  Search, 
  X, 
  AlertTriangle, 
  CheckCircle, 
  ChevronLeft, 
  ChevronRight, 
  Trash2,
  Calendar,
  Filter
} from 'lucide-react';
import { transactionService } from '../services/transactionService';
import { inventoryService } from '../services/inventoryService';
import { supabase } from '../lib/supabase';
import { Transaction, Item } from '../types';
import { format } from 'date-fns';
import { cn } from '../lib/utils';

interface TransactionsProps {
  initialType?: 'IN' | 'OUT' | 'ALL';
  globalSearch?: string;
  user: any;
}

export function Transactions({ initialType = 'ALL', globalSearch = '', user }: TransactionsProps) {
  const [filterType, setFilterType] = useState<'ALL' | 'IN' | 'OUT'>(initialType === 'IN' || initialType === 'OUT' ? initialType : 'ALL');
  const [selectedDept, setSelectedDept] = useState<string>('Semua');
  const [searchQuery, setSearchQuery] = useState(globalSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(globalSearch);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [transType, setTransType] = useState<'IN' | 'OUT'>('IN');
  const [items, setItems] = useState<Item[]>([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [department, setDepartment] = useState('Housekeeping');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const departments = ['Housekeeping', 'Resto', 'Teknik', 'Front Office', 'General', 'Pembelian PO'];

  // Sync initialType or globalSearch if props change
  useEffect(() => {
    if (initialType === 'IN' || initialType === 'OUT') {
      setFilterType(initialType);
    }
  }, [initialType]);

  // Search debounce timer
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load items for select dropdown
  const loadItems = async () => {
    try {
      const res = await inventoryService.getItems({ limit: 0 }); // fetch all active items
      setItems(res.data);
    } catch (err) {
      console.error('Error loading items for select:', err);
    }
  };

  // Fetch transactions using transactionService
  const fetchTransactionsData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await transactionService.getTransactions({
        type: filterType,
        department: selectedDept,
        search: debouncedSearch,
        page,
        limit: 15
      });

      setTransactions(result.data);
      setTotalItems(result.total);
      setTotalPages(result.totalPages);
    } catch (err: any) {
      console.error('Error fetching transactions:', err);
    } finally {
      setLoading(false);
    }
  }, [filterType, selectedDept, debouncedSearch, page]);

  useEffect(() => {
    fetchTransactionsData();
  }, [fetchTransactionsData]);

  // Selected item object for real-time stock check
  const selectedItem = items.find(i => i.id === selectedItemId);

  // Open transaction modal
  const openNewTransaction = (type: 'IN' | 'OUT') => {
    setTransType(type);
    setSelectedItemId('');
    setQuantity('');
    setNotes('');
    setFormError(null);
    setIsModalOpen(true);
    loadItems();
  };

  // Validate quantity for OUT transactions
  const numQty = typeof quantity === 'number' ? quantity : parseInt(quantity || '0', 10);
  const isStockInsufficient = transType === 'OUT' && selectedItem && numQty > selectedItem.current_stock;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedItemId) {
      setFormError('Silakan pilih barang terlebih dahulu.');
      return;
    }

    if (!numQty || numQty <= 0) {
      setFormError('Jumlah harus lebih dari 0.');
      return;
    }

    if (transType === 'OUT' && selectedItem && numQty > selectedItem.current_stock) {
      setFormError(`Stok tidak mencukupi! Stok tersedia saat ini: ${selectedItem.current_stock} ${selectedItem.unit}`);
      return;
    }

    setIsSubmitting(true);
    try {
      await transactionService.createTransaction({
        itemId: selectedItemId,
        type: transType,
        quantity: numQty,
        department,
        notes,
        userId: user.id
      });

      setIsModalOpen(false);
      fetchTransactionsData();
    } catch (err: any) {
      console.error('Submit transaction error:', err);
      setFormError(err.message || 'Gagal menyimpan transaksi');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (tx: Transaction) => {
    if (confirm(`Hapus catatan transaksi ${tx.items?.name || 'barang'}? Stok akan dikembalikan.`)) {
      try {
        await transactionService.deleteTransaction(tx);
        fetchTransactionsData();
      } catch (err: any) {
        alert('Gagal menghapus transaksi: ' + err.message);
      }
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300 pb-20 md:pb-6 font-sans">
      {/* Header & Quick Action Buttons */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 md:p-6 rounded-2xl border border-gray-200/90 shadow-sm">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">Transaksi Gudang</h1>
          <p className="text-xs md:text-sm text-gray-500 mt-0.5 font-medium">Catat alur masuk dan distribusi keluar stok barang</p>
        </div>

        <div className="flex gap-2 w-full md:w-auto">
          <button
            onClick={() => openNewTransaction('IN')}
            className="flex-1 md:flex-none bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-sm shadow-emerald-600/20 active:scale-95 min-h-[44px]"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Barang Masuk</span>
          </button>

          <button
            onClick={() => openNewTransaction('OUT')}
            className="flex-1 md:flex-none bg-[#E65C00] hover:bg-[#CF5300] text-white font-extrabold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-sm shadow-orange-500/20 active:scale-95 min-h-[44px]"
          >
            <Minus className="w-4 h-4 stroke-[3]" />
            <span>Barang Keluar</span>
          </button>
        </div>
      </div>

      {/* Filter Chips & Search Bar */}
      <div className="bg-white p-3 md:p-4 rounded-2xl border border-gray-200/90 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          {/* Type Filter Tabs */}
          <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200">
            <button
              onClick={() => { setFilterType('ALL'); setPage(1); }}
              className={cn(
                "flex-1 px-4 py-1.5 rounded-lg text-xs font-extrabold transition-all min-h-[36px]",
                filterType === 'ALL' ? "bg-white text-gray-900 shadow-xs" : "text-gray-600 hover:text-gray-900"
              )}
            >
              Semua
            </button>
            <button
              onClick={() => { setFilterType('IN'); setPage(1); }}
              className={cn(
                "flex-1 px-4 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 min-h-[36px]",
                filterType === 'IN' ? "bg-emerald-600 text-white shadow-xs" : "text-gray-600 hover:text-emerald-700"
              )}
            >
              <ArrowDownCircle className="w-3.5 h-3.5" />
              <span>Masuk</span>
            </button>
            <button
              onClick={() => { setFilterType('OUT'); setPage(1); }}
              className={cn(
                "flex-1 px-4 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 min-h-[36px]",
                filterType === 'OUT' ? "bg-[#E65C00] text-white shadow-xs" : "text-gray-600 hover:text-orange-700"
              )}
            >
              <ArrowUpCircle className="w-3.5 h-3.5" />
              <span>Keluar</span>
            </button>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Cari transaksi / catatan / departemen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2 text-xs text-gray-900 font-semibold focus:outline-none focus:border-amber-500 focus:bg-white min-h-[40px]"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Department Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3 text-amber-600" /> Dept:
          </span>
          {['Semua', ...departments].map((dept) => (
            <button
              key={dept}
              onClick={() => { setSelectedDept(dept); setPage(1); }}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all border shrink-0",
                selectedDept === dept
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-700"
                  : "bg-gray-50 border-gray-200 text-gray-600 hover:text-gray-900"
              )}
            >
              {dept}
            </button>
          ))}
        </div>
      </div>

      {/* Transaction List */}
      <div className="bg-white rounded-2xl border border-gray-200/90 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-xs text-gray-500 animate-pulse font-medium">Memuat riwayat transaksi...</div>
        ) : transactions.length === 0 ? (
          <div className="py-12 text-center text-xs text-gray-500 font-medium">Tidak ada riwayat transaksi ditemukan.</div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 uppercase text-[10px] font-extrabold border-b border-gray-200">
                    <th className="p-3.5">Jenis</th>
                    <th className="p-3.5">Barang</th>
                    <th className="p-3.5">Departemen</th>
                    <th className="p-3.5 text-right">Jumlah</th>
                    <th className="p-3.5">Catatan</th>
                    <th className="p-3.5">Waktu</th>
                    <th className="p-3.5 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-amber-50/20 transition-colors">
                      <td className="p-3.5">
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-black text-[10px] border",
                          tx.type === 'IN' 
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                            : "bg-amber-50 text-amber-700 border-amber-200"
                        )}>
                          {tx.type === 'IN' ? <ArrowDownCircle className="w-3.5 h-3.5" /> : <ArrowUpCircle className="w-3.5 h-3.5" />}
                          <span>{tx.type === 'IN' ? 'MASUK' : 'KELUAR'}</span>
                        </span>
                      </td>
                      <td className="p-3.5 font-bold text-gray-900">{tx.items?.name || '-'}</td>
                      <td className="p-3.5 text-gray-500 font-medium">{tx.department || 'General'}</td>
                      <td className="p-3.5 text-right font-black text-xs">
                        <span className={tx.type === 'IN' ? "text-emerald-600" : "text-amber-600"}>
                          {tx.type === 'IN' ? '+' : '-'}{tx.quantity} {tx.items?.unit || 'pcs'}
                        </span>
                      </td>
                      <td className="p-3.5 text-gray-500 italic max-w-xs truncate">{tx.notes || '-'}</td>
                      <td className="p-3.5 text-gray-500 font-mono text-[11px] whitespace-nowrap">
                        {format(new Date(tx.created_at), 'dd/MM/yyyy HH:mm')}
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          onClick={() => handleDelete(tx)}
                          className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
                          title="Hapus Transaksi"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View */}
            <div className="block md:hidden divide-y divide-gray-100">
              {transactions.map((tx) => (
                <div key={tx.id} className="p-3.5 flex items-center justify-between gap-3 hover:bg-amber-50/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border",
                      tx.type === 'IN' 
                        ? "bg-emerald-50 text-emerald-600 border-emerald-200" 
                        : "bg-amber-50 text-amber-600 border-amber-200"
                    )}>
                      {tx.type === 'IN' ? <ArrowDownCircle className="w-5 h-5" /> : <ArrowUpCircle className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-900">{tx.items?.name || 'Barang'}</p>
                      <p className="text-[10px] text-gray-400 font-medium">
                        {tx.department || 'General'} • {format(new Date(tx.created_at), 'dd/MM HH:mm')}
                      </p>
                      {tx.notes && <p className="text-[10px] text-gray-500 italic line-clamp-1 mt-0.5">{tx.notes}</p>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-xs font-black",
                      tx.type === 'IN' ? "text-emerald-600" : "text-amber-600"
                    )}>
                      {tx.type === 'IN' ? '+' : '-'}{tx.quantity} {tx.items?.unit || 'pcs'}
                    </span>
                    <button
                      onClick={() => handleDelete(tx)}
                      className="p-1.5 text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            <div className="p-3 md:p-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between text-xs text-gray-500">
              <span>Menampilkan {transactions.length} dari {totalItems} data</span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-100 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-bold text-gray-900">Hal {page} / {totalPages || 1}</span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-100 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Transaction Modal / Bottom Sheet */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl border border-gray-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom duration-300">
            {/* Header */}
            <div className={cn(
              "p-4 border-b border-gray-100 flex items-center justify-between",
              transType === 'IN' ? "bg-emerald-50" : "bg-orange-50"
            )}>
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white shadow-xs",
                  transType === 'IN' ? "bg-emerald-600" : "bg-[#E65C00]"
                )}>
                  {transType === 'IN' ? <Plus className="w-4 h-4 stroke-[3]" /> : <Minus className="w-4 h-4 stroke-[3]" />}
                </div>
                <div>
                  <h3 className="text-sm font-black text-gray-900">
                    {transType === 'IN' ? 'Input Barang Masuk' : 'Input Barang Keluar'}
                  </h3>
                  <p className="text-[10px] text-gray-500">
                    {transType === 'IN' ? 'Penambahan stok dari supplier' : 'Distribusi stok ke departemen hotel'}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <form id="transaction-form" onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-3.5 overflow-y-auto text-xs">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold flex items-start gap-2 animate-shake">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Item Dropdown */}
              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1">Pilih Barang *</label>
                <select
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 font-semibold focus:outline-none focus:border-amber-500 focus:bg-white min-h-[44px]"
                  required
                >
                  <option value="">-- Pilih Barang dari Gudang --</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} (Stok: {i.current_stock} {i.unit})
                    </option>
                  ))}
                </select>
              </div>

              {/* Selected Item Stock Info */}
              {selectedItem && (
                <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/80 flex items-center justify-between text-xs">
                  <span className="text-gray-600 font-medium">Stok Tersedia Saat Ini:</span>
                  <span className="font-black text-gray-900 text-sm">
                    {selectedItem.current_stock} {selectedItem.unit}
                  </span>
                </div>
              )}

              {/* Quantity Input */}
              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1">Jumlah (Qty) *</label>
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min="1"
                  placeholder="Masukkan jumlah barang..."
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value ? parseInt(e.target.value, 10) : '')}
                  className={cn(
                    "w-full bg-gray-50 border rounded-xl px-3.5 py-2.5 text-xs text-gray-900 font-bold focus:outline-none min-h-[44px]",
                    isStockInsufficient ? "border-red-500 focus:border-red-500 text-red-600 bg-red-50/30" : "border-gray-200 focus:border-amber-500 focus:bg-white"
                  )}
                  required
                />
              </div>

              {/* Immediate Stock Warning for Outgoing Transactions */}
              {isStockInsufficient && (
                <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>Stok tidak mencukupi! Maksimal yang dapat dikeluarkan: {selectedItem?.current_stock} {selectedItem?.unit}</span>
                </div>
              )}

              {/* Department */}
              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1">Departemen Tuju / Asal *</label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 font-semibold focus:outline-none focus:border-amber-500 focus:bg-white min-h-[44px]"
                  required
                >
                  {departments.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1">Catatan / Vendor / No. Nota (Opsional)</label>
                <input
                  type="text"
                  placeholder="Contoh: Diterima dari Supplier A / Untuk Kamar 201"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 font-semibold focus:outline-none focus:border-amber-500 focus:bg-white min-h-[44px]"
                />
              </div>
            </form>

            {/* Sticky Footer */}
            <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex-1 bg-white border border-gray-200 hover:bg-gray-100 py-2.5 rounded-xl font-bold text-xs text-gray-700 transition-all min-h-[44px]"
              >
                Batal
              </button>
              <button
                type="submit"
                form="transaction-form"
                disabled={isSubmitting || !!isStockInsufficient}
                className={cn(
                  "flex-1 font-extrabold text-xs text-white py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 min-h-[44px]",
                  isStockInsufficient || isSubmitting
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed shadow-none"
                    : transType === 'IN'
                      ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20"
                      : "bg-[#E65C00] hover:bg-[#CF5300] shadow-orange-500/20"
                )}
              >
                {isSubmitting ? 'Menyimpan...' : transType === 'IN' ? 'Simpan Barang Masuk' : 'Simpan Barang Keluar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
