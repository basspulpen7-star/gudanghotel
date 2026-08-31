import React, { useState, useEffect, useCallback } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  Edit2, 
  Trash2, 
  AlertCircle, 
  Activity, 
  ChevronLeft, 
  ChevronRight, 
  X,
  SlidersHorizontal,
  CheckCircle2,
  RotateCw,
  ArrowLeftRight
} from 'lucide-react';
import { TransferStockModal } from './TransferStockModal';
import { inventoryService } from '../services/inventoryService';
import { transactionService } from '../services/transactionService';
import { supabase } from '../lib/supabase';
import { Item } from '../types';
import { cn } from '../lib/utils';

interface InventoryProps {
  globalSearch?: string;
}

export function Inventory({ globalSearch = '' }: InventoryProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>('Semua');
  const [searchQuery, setSearchQuery] = useState(globalSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(globalSearch);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItemsCount, setTotalItemsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Form & Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editingItemHasTx, setEditingItemHasTx] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('Housekeeping');
  const [unit, setUnit] = useState('pcs');
  const [initialStock, setInitialStock] = useState<number | ''>(0);
  const [minStock, setMinStock] = useState<number | ''>(5);

  // Koreksi Stok (Stock Adjustment) State
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [adjustmentItem, setAdjustmentItem] = useState<Item | null>(null);
  const [physicalStockInput, setPhysicalStockInput] = useState<number | ''>(0);
  const [adjustmentNotes, setAdjustmentNotes] = useState('');
  const [isSubmittingAdjustment, setIsSubmittingAdjustment] = useState(false);
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);
  const [adjustmentSuccess, setAdjustmentSuccess] = useState<string | null>(null);

  // Transfer Stok State
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);

  // Sync / Recalculate State
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusBanner, setSyncStatusBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const departments = ['Housekeeping', 'Resto', 'Teknik', 'Front Office', 'General'];

  // Sync initial search query
  useEffect(() => {
    if (globalSearch) {
      setSearchQuery(globalSearch);
    }
  }, [globalSearch]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch Items
  const fetchItemsData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inventoryService.getItems({
        department: selectedDept,
        search: debouncedSearch,
        page,
        limit: 15
      });

      setItems(res.data);
      setTotalPages(res.totalPages);
      setTotalItemsCount(res.total);
    } catch (err: any) {
      console.error('Error fetching inventory items:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedDept, debouncedSearch, page]);

  useEffect(() => {
    fetchItemsData();
  }, [fetchItemsData]);

  const resetForm = () => {
    setName('');
    setDepartment('Housekeeping');
    setUnit('pcs');
    setInitialStock(0);
    setMinStock(5);
    setFormError(null);
    setEditingItemHasTx(false);
  };

  const openAddItemModal = () => {
    setEditingItem(null);
    resetForm();
    setIsModalOpen(true);
  };

  const openEditItemModal = async (item: Item) => {
    setEditingItem(item);
    setName(item.name);
    setDepartment(item.department || 'Housekeeping');
    setUnit(item.unit || 'pcs');
    setInitialStock(item.initial_stock ?? 0);
    setMinStock(item.min_stock ?? 0);
    setFormError(null);

    // Check if item has transactions
    const hasTx = await inventoryService.hasTransactions(item.id);
    setEditingItemHasTx(hasTx);

    setIsModalOpen(true);
  };

  const openAdjustmentModal = (item?: Item) => {
    const targetItem = item || (items.length > 0 ? items[0] : null);
    setAdjustmentItem(targetItem);
    setPhysicalStockInput(targetItem ? targetItem.current_stock : 0);
    setAdjustmentNotes('');
    setAdjustmentError(null);
    setAdjustmentSuccess(null);
    setIsAdjustmentModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError('Nama barang tidak boleh kosong.');
      return;
    }

    const parsedInitial = typeof initialStock === 'number' ? initialStock : parseInt(String(initialStock || '0'), 10);
    const parsedMin = typeof minStock === 'number' ? minStock : parseInt(String(minStock || '0'), 10);
    const numInitial = isNaN(parsedInitial) ? 0 : Math.max(0, parsedInitial);
    const numMin = isNaN(parsedMin) ? 0 : Math.max(0, parsedMin);

    setIsSubmitting(true);
    try {
      await inventoryService.saveItem(
        {
          name: name.trim(),
          department,
          unit: unit.trim() || 'pcs',
          initial_stock: numInitial,
          min_stock: numMin
        },
        editingItem?.id
      );

      setIsModalOpen(false);
      resetForm();
      fetchItemsData();
    } catch (err: any) {
      console.error('Save item error:', err);
      setFormError(err.message || 'Gagal menyimpan barang');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdjustmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdjustmentError(null);
    setAdjustmentSuccess(null);

    if (!adjustmentItem) {
      setAdjustmentError('Pilih barang yang ingin dikoreksi.');
      return;
    }

    const currentSys = adjustmentItem.current_stock;
    const parsedPhysical = typeof physicalStockInput === 'number' ? physicalStockInput : parseInt(String(physicalStockInput || '0'), 10);
    const targetPhysical = isNaN(parsedPhysical) ? 0 : Math.max(0, parsedPhysical);
    const diff = targetPhysical - currentSys;

    if (diff === 0) {
      setAdjustmentError('Stok fisik sama dengan stok sistem. Tidak ada selisih yang perlu dikoreksi.');
      return;
    }

    setIsSubmittingAdjustment(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const type = diff > 0 ? 'IN' : 'OUT';
      const quantity = Math.abs(diff);
      const noteText = adjustmentNotes.trim() 
        ? `Koreksi Stok (Penyesuaian Fisik): ${adjustmentNotes.trim()}` 
        : `Koreksi Stok (Penyesuaian Fisik dari ${currentSys} ke ${targetPhysical})`;

      await transactionService.createTransaction({
        itemId: adjustmentItem.id,
        type,
        quantity,
        department: adjustmentItem.department || 'General',
        notes: noteText,
        userId: user?.id
      });

      setAdjustmentSuccess(`Koreksi stok berhasil! Stok ${adjustmentItem.name} kini disesuaikan menjadi ${targetPhysical} ${adjustmentItem.unit}.`);
      fetchItemsData();

      setTimeout(() => {
        setIsAdjustmentModalOpen(false);
        setAdjustmentSuccess(null);
      }, 1500);
    } catch (err: any) {
      console.error('Stock adjustment error:', err);
      setAdjustmentError(err.message || 'Gagal melakukan koreksi stok.');
    } finally {
      setIsSubmittingAdjustment(false);
    }
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    try {
      await inventoryService.deleteItem(itemToDelete);
      setItemToDelete(null);
      fetchItemsData();
    } catch (err: any) {
      alert('Gagal menghapus barang: ' + err.message);
    }
  };

  const handleSyncAllStocks = async () => {
    setIsSyncing(true);
    setSyncStatusBanner(null);
    try {
      const res = await inventoryService.recalculateAllStocks();
      await fetchItemsData();
      setSyncStatusBanner({
        type: 'success',
        message: `Sinkronisasi berhasil! ${res.updated > 0 ? `${res.updated} barang diperbaiki nilainya.` : 'Semua stok sudah akurat sesuai rumus (Stok Awal + Masuk - Keluar).'}`
      });
      setTimeout(() => {
        setSyncStatusBanner(null);
      }, 5000);
    } catch (err: any) {
      console.error('Error syncing stocks:', err);
      setSyncStatusBanner({
        type: 'error',
        message: 'Gagal melakukan sinkronisasi stok: ' + (err.message || 'Error')
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const getStockBadge = (current: number, min: number) => {
    if (current <= 0) {
      return (
        <span className="px-2.5 py-0.5 bg-[#EB5757]/15 text-[#EB5757] border border-[#EB5757]/30 text-[10px] font-black rounded-lg uppercase tracking-wider">
          HABIS
        </span>
      );
    }
    if (current <= min) {
      return (
        <span className="px-2.5 py-0.5 bg-[#E5A138]/15 text-[#E5A138] border border-[#E5A138]/30 text-[10px] font-black rounded-lg uppercase tracking-wider">
          MENIPIS
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 bg-[#55B685]/15 text-[#55B685] border border-[#55B685]/30 text-[10px] font-black rounded-lg uppercase tracking-wider">
        AMAN
      </span>
    );
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300 pb-20 md:pb-6 font-sans">
      {/* Header & Main Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#252B34] p-4 md:p-6 rounded-2xl border border-[#343B46] shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-[#F1F3F5] tracking-tight">Stok Barang (Inventory)</h1>
          <p className="text-xs md:text-sm text-[#8E99A6] mt-0.5 font-medium">Daftar lengkap ketersediaan item inventaris hotel</p>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap gap-2 w-full md:w-auto">
          <button
            onClick={fetchItemsData}
            className="bg-[#2A303A] hover:bg-[#343D49] text-[#D8DEE6] hover:text-[#F1F3F5] p-2.5 rounded-xl border border-[#3A424D] transition-all flex items-center justify-center min-h-[44px] cursor-pointer shadow-xs"
            title="Refresh Data"
          >
            <Activity className={cn("w-5 h-5", loading && "animate-spin text-[#C89B3C]")} />
          </button>

          <button
            onClick={handleSyncAllStocks}
            disabled={isSyncing}
            className="flex-1 md:flex-none bg-[#55B685]/10 hover:bg-[#55B685]/20 text-[#55B685] font-extrabold py-2.5 px-3.5 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 transition-all border border-[#55B685]/30 min-h-[44px] cursor-pointer disabled:opacity-50"
            title="Sinkronkan & Audit Seluruh Stok dengan Mutasi Transaksi"
          >
            <RotateCw className={cn("w-4 h-4", isSyncing && "animate-spin")} />
            <span>{isSyncing ? 'Sinkronisasi...' : 'Sinkronisasi Stok'}</span>
          </button>

          <button
            onClick={() => setIsTransferModalOpen(true)}
            className="flex-1 md:flex-none bg-[#C89B3C]/10 hover:bg-[#C89B3C]/20 text-[#E0B85A] font-extrabold py-2.5 px-4 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 transition-all border border-[#C89B3C]/30 min-h-[44px] cursor-pointer"
            title="Transfer Stok antar Departemen (misal: HK ke Resto)"
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span>Transfer Stok</span>
          </button>

          <button
            onClick={() => openAdjustmentModal()}
            className="flex-1 md:flex-none bg-[#6D9EEB]/10 hover:bg-[#6D9EEB]/20 text-[#6D9EEB] font-extrabold py-2.5 px-4 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 transition-all border border-[#6D9EEB]/30 min-h-[44px] cursor-pointer"
            title="Koreksi Stok Fisik"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Koreksi Stok</span>
          </button>

          <button
            onClick={openAddItemModal}
            className="flex-1 md:flex-none bg-gradient-to-r from-[#E6B85C] to-[#C89B3C] hover:brightness-110 text-[#171A1F] font-extrabold py-2.5 px-5 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-sm min-h-[44px] cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Tambah Barang</span>
          </button>
        </div>
      </div>

      {syncStatusBanner && (
        <div className={cn(
          "p-4 rounded-xl text-xs font-bold flex items-center gap-2.5 animate-in fade-in slide-in-from-top-2 border",
          syncStatusBanner.type === 'success' 
            ? "bg-[#55B685]/10 text-[#55B685] border-[#55B685]/30" 
            : "bg-[#EB5757]/10 text-[#EB5757] border-[#EB5757]/30"
        )}>
          {syncStatusBanner.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{syncStatusBanner.message}</span>
        </div>
      )}

      {/* Search & Department Filters */}
      <div className="bg-[#252B34] p-3 md:p-4 rounded-2xl border border-[#343B46] shadow-[0_4px_20px_rgba(0,0,0,0.18)] space-y-3">
        {/* Search Bar */}
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E99A6]" />
          <input
            type="text"
            placeholder="Cari barang / departemen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#20252D] border border-[#3A424D] rounded-xl pl-9 pr-3 py-2 text-xs text-[#F1F3F5] placeholder:text-[#6F7985] focus:outline-none focus:border-[#C89B3C] focus:bg-[#20252D] min-h-[40px] transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8E99A6] hover:text-[#F1F3F5]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Department Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          <span className="text-[#8E99A6] text-[10px] font-extrabold uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3 text-[#C89B3C]" /> Dept:
          </span>
          {['Semua', ...departments].map((dept) => (
            <button
              key={dept}
              onClick={() => { setSelectedDept(dept); setPage(1); }}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all border shrink-0 cursor-pointer",
                selectedDept === dept
                  ? "bg-[#C89B3C]/15 border-[#C89B3C] text-[#E0B85A]"
                  : "bg-[#20252D] border-[#3A424D] text-[#8E99A6] hover:text-[#D8DEE6] hover:border-[#4A5462]"
              )}
            >
              {dept}
            </button>
          ))}
        </div>
      </div>

      {/* Main Stock Display */}
      <div className="bg-[#252B34] rounded-2xl border border-[#343B46] shadow-[0_4px_20px_rgba(0,0,0,0.18)] overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-xs text-[#8E99A6] animate-pulse font-medium">Memuat daftar barang...</div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#8E99A6] font-medium">Tidak ada barang ditemukan.</div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#20252D] text-[#8E99A6] uppercase text-[10px] font-extrabold border-b border-[#343B46]">
                    <th className="p-4">Nama Barang</th>
                    <th className="p-4">Departemen</th>
                    <th className="p-4 text-center">Status</th>
                    <th className="p-4 text-right">Stok Awal</th>
                    <th className="p-4 text-right">Stok Saat Ini</th>
                    <th className="p-4 text-right">Min. Stok</th>
                    <th className="p-4 text-center">Satuan</th>
                    <th className="p-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2C333E]">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-[#2A303A]/70 transition-colors">
                      <td className="p-4 font-bold text-[#F1F3F5] text-sm">{item.name}</td>
                      <td className="p-4 text-[#8E99A6] font-medium">{item.department || 'General'}</td>
                      <td className="p-4 text-center">
                        {getStockBadge(item.current_stock, item.min_stock)}
                      </td>
                      <td className="p-4 text-right text-[#8E99A6] font-semibold">{item.initial_stock ?? 0}</td>
                      <td className="p-4 text-right font-black text-sm text-[#F1F3F5]">{item.current_stock}</td>
                      <td className="p-4 text-right text-[#6F7985] font-medium">{item.min_stock}</td>
                      <td className="p-4 text-center text-[#8E99A6] font-medium">{item.unit || 'pcs'}</td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openAdjustmentModal(item)}
                            className="p-1.5 hover:bg-[#6D9EEB]/15 text-[#6D9EEB] rounded-lg transition-colors cursor-pointer"
                            title="Koreksi Stok"
                          >
                            <SlidersHorizontal className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openEditItemModal(item)}
                            className="p-1.5 hover:bg-[#C89B3C]/15 text-[#E0B85A] rounded-lg transition-colors cursor-pointer"
                            title="Edit Barang"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setItemToDelete(item.id)}
                            className="p-1.5 hover:bg-[#EB5757]/15 text-[#EB5757] rounded-lg transition-colors cursor-pointer"
                            title="Hapus Barang"
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

            {/* Mobile Cards View */}
            <div className="block md:hidden divide-y divide-[#2C333E]">
              {items.map((item) => (
                <div key={item.id} className="p-3.5 space-y-2 hover:bg-[#2A303A]/50 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-[#F1F3F5] leading-tight">{item.name}</h3>
                      <p className="text-[10px] text-[#8E99A6] mt-0.5 font-medium">{item.department || 'General'}</p>
                    </div>
                    <div>{getStockBadge(item.current_stock, item.min_stock)}</div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-[#343B46] text-xs">
                    <div className="flex items-center gap-3">
                      <div>
                        <span className="text-[9px] text-[#6F7985] font-extrabold uppercase block">Stok Saat Ini</span>
                        <span className="font-black text-[#F1F3F5] text-sm">
                          {item.current_stock} <span className="text-xs font-normal text-[#8E99A6]">{item.unit}</span>
                        </span>
                      </div>
                      <div className="border-l border-[#3A424D] pl-3">
                        <span className="text-[9px] text-[#6F7985] font-extrabold uppercase block">Batas Min.</span>
                        <span className="font-semibold text-[#8E99A6] text-xs">{item.min_stock} {item.unit}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openAdjustmentModal(item)}
                        className="p-2 bg-[#6D9EEB]/10 rounded-xl text-[#6D9EEB] border border-[#6D9EEB]/30 active:scale-95 cursor-pointer"
                        title="Koreksi Stok"
                      >
                        <SlidersHorizontal className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEditItemModal(item)}
                        className="p-2 bg-[#2A303A] rounded-xl text-[#E0B85A] border border-[#3A424D] active:scale-95 hover:bg-[#C89B3C]/15 cursor-pointer"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setItemToDelete(item.id)}
                        className="p-2 bg-[#2A303A] rounded-xl text-[#EB5757] border border-[#3A424D] active:scale-95 hover:bg-[#EB5757]/15 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            <div className="p-3 md:p-4 border-t border-[#343B46] bg-[#20252D] flex items-center justify-between text-xs text-[#8E99A6] font-medium">
              <span>Total {totalItemsCount} SKU</span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg border border-[#3A424D] bg-[#2A303A] hover:bg-[#343D49] text-[#D8DEE6] disabled:opacity-40 disabled:cursor-not-allowed shadow-xs cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-bold text-[#F1F3F5]">Hal {page} / {totalPages || 1}</span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="p-1.5 rounded-lg border border-[#3A424D] bg-[#2A303A] hover:bg-[#343D49] text-[#D8DEE6] disabled:opacity-40 disabled:cursor-not-allowed shadow-xs cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-[#252B34] w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl border border-[#343B46] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom duration-300">
            {/* Modal Header */}
            <div className="p-4 border-b border-[#343B46] flex items-center justify-between bg-[#20252D]">
              <h3 className="text-base font-black text-[#F1F3F5] tracking-tight">
                {editingItem ? 'Edit Data Barang' : 'Tambah Barang Baru'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-[#8E99A6] hover:text-[#F1F3F5] p-2 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form id="item-form" onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto">
              {formError && (
                <div className="p-3 bg-[#EB5757]/15 border border-[#EB5757]/30 text-[#EB5757] rounded-xl text-xs flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 text-[#EB5757]" />
                  <span>{formError}</span>
                </div>
              )}

              {/* 1. Nama Barang */}
              <div>
                <label className="block text-xs font-bold text-[#D8DEE6] uppercase mb-1">Nama Barang *</label>
                <input
                  type="text"
                  placeholder="Contoh: Handuk Mandi Standard"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#20252D] border border-[#3A424D] rounded-xl p-3 text-sm text-[#F1F3F5] placeholder:text-[#6F7985] focus:outline-none focus:border-[#C89B3C] min-h-[44px]"
                  required
                />
              </div>

              {/* 2. Departemen & 3. Satuan */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#D8DEE6] uppercase mb-1">Departemen *</label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full bg-[#20252D] border border-[#3A424D] rounded-xl p-3 text-sm text-[#F1F3F5] focus:outline-none focus:border-[#C89B3C] min-h-[44px]"
                    required
                  >
                    {departments.map((d) => (
                      <option key={d} value={d} className="bg-[#252B34] text-[#F1F3F5]">{d}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#D8DEE6] uppercase mb-1">Satuan *</label>
                  <input
                    type="text"
                    placeholder="pcs, unit, kg"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full bg-[#20252D] border border-[#3A424D] rounded-xl p-3 text-sm text-[#F1F3F5] placeholder:text-[#6F7985] focus:outline-none focus:border-[#C89B3C] min-h-[44px]"
                    required
                  />
                </div>
              </div>

              {/* 4. Stok Awal & 5. Minimum Stok Alert */}
              <div className="space-y-4 pt-1 border-t border-[#343B46]">
                <div>
                  <label className="block text-xs font-bold text-[#D8DEE6] uppercase mb-0.5">Stok Awal *</label>
                  <p className="text-[11px] text-[#8E99A6] mb-1.5 font-medium">Jumlah barang yang tersedia saat barang pertama kali dicatat.</p>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="0"
                    value={initialStock}
                    disabled={Boolean(editingItem && editingItemHasTx)}
                    onChange={(e) => {
                      const val = e.target.value;
                      setInitialStock(val === '' ? '' : parseInt(val, 10));
                    }}
                    className={cn(
                      "w-full border rounded-xl p-3 text-sm font-bold min-h-[44px] transition-colors",
                      editingItem && editingItemHasTx
                        ? "bg-[#1D2128] text-[#6F7985] border-[#2C333E] cursor-not-allowed"
                        : "bg-[#20252D] border-[#3A424D] text-[#F1F3F5] placeholder:text-[#6F7985] focus:outline-none focus:border-[#C89B3C]"
                    )}
                    required
                  />
                  {editingItem && editingItemHasTx && (
                    <p className="text-[11px] text-[#E0B85A] bg-[#C89B3C]/10 p-2.5 rounded-lg border border-[#C89B3C]/30 mt-2 font-medium">
                      🔒 <strong>Stok Awal terkunci:</strong> Barang ini sudah memiliki riwayat transaksi. Stok saat ini berjalan otomatis melalui Barang Masuk/Keluar atau fitur Koreksi Stok.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#D8DEE6] uppercase mb-0.5">Minimum Stok Alert *</label>
                  <p className="text-[11px] text-[#8E99A6] mb-1.5 font-medium">Batas minimum stok sebelum muncul peringatan status MENIPIS.</p>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="5"
                    value={minStock}
                    onChange={(e) => {
                      const val = e.target.value;
                      setMinStock(val === '' ? '' : parseInt(val, 10));
                    }}
                    className="w-full bg-[#20252D] border border-[#3A424D] rounded-xl p-3 text-sm text-[#F1F3F5] placeholder:text-[#6F7985] focus:outline-none focus:border-[#C89B3C] min-h-[44px]"
                    required
                  />
                </div>
              </div>
            </form>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[#343B46] bg-[#20252D] flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex-1 bg-[#2A303A] border border-[#3A424D] py-3 rounded-xl font-bold text-xs text-[#D8DEE6] hover:text-[#F1F3F5] hover:bg-[#343D49] transition-all min-h-[44px] cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                form="item-form"
                disabled={isSubmitting}
                className="flex-1 bg-gradient-to-r from-[#E6B85C] to-[#C89B3C] hover:brightness-110 font-extrabold text-xs text-[#171A1F] py-3 rounded-xl transition-all shadow-sm min-h-[44px] cursor-pointer"
              >
                {isSubmitting ? 'Menyimpan...' : editingItem ? 'Simpan Perubahan' : 'Tambah Barang'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Koreksi Stok (Stock Adjustment) Modal */}
      {isAdjustmentModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-[#252B34] w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl border border-[#343B46] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom duration-300">
            {/* Modal Header */}
            <div className="p-4 border-b border-[#343B46] flex items-center justify-between bg-[#20252D]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#6D9EEB]/15 border border-[#6D9EEB]/30 flex items-center justify-center text-[#6D9EEB]">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[#F1F3F5] tracking-tight">Koreksi Stok Fisik</h3>
                  <p className="text-[11px] text-[#8E99A6] font-medium">Sesuaikan stok sistem dengan hasil perhitungan fisik (Stock Opname)</p>
                </div>
              </div>
              <button onClick={() => setIsAdjustmentModalOpen(false)} className="text-[#8E99A6] hover:text-[#F1F3F5] p-2 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form id="adjustment-form" onSubmit={handleAdjustmentSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto">
              {adjustmentError && (
                <div className="p-3 bg-[#EB5757]/15 border border-[#EB5757]/30 text-[#EB5757] rounded-xl text-xs flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 text-[#EB5757]" />
                  <span>{adjustmentError}</span>
                </div>
              )}

              {adjustmentSuccess && (
                <div className="p-3 bg-[#55B685]/15 border border-[#55B685]/30 text-[#55B685] rounded-xl text-xs flex items-center gap-2 font-bold">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-[#55B685]" />
                  <span>{adjustmentSuccess}</span>
                </div>
              )}

              {/* Pilih Barang */}
              <div>
                <label className="block text-xs font-bold text-[#D8DEE6] uppercase mb-1">Pilih Barang *</label>
                <select
                  value={adjustmentItem?.id || ''}
                  onChange={(e) => {
                    const found = items.find(i => i.id === e.target.value);
                    if (found) {
                      setAdjustmentItem(found);
                      setPhysicalStockInput(found.current_stock);
                    }
                  }}
                  className="w-full bg-[#20252D] border border-[#3A424D] rounded-xl p-3 text-sm text-[#F1F3F5] focus:outline-none focus:border-[#C89B3C] min-h-[44px]"
                  required
                >
                  {items.map(i => (
                    <option key={i.id} value={i.id} className="bg-[#252B34] text-[#F1F3F5]">
                      {i.name} ({i.department}) — Stok Sistem: {i.current_stock} {i.unit}
                    </option>
                  ))}
                </select>
              </div>

              {adjustmentItem && (
                <>
                  <div className="p-3.5 bg-[#20252D] rounded-xl border border-[#343B46] space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[#8E99A6] font-bold uppercase">Stok Saat Ini (Sistem):</span>
                      <span className="font-black text-[#F1F3F5] text-sm">
                        {adjustmentItem.current_stock} {adjustmentItem.unit}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs border-t border-[#343B46] pt-2">
                      <span className="text-[#8E99A6] font-bold uppercase">Selisih Koreksi:</span>
                      {(() => {
                        const parsedP = typeof physicalStockInput === 'number' ? physicalStockInput : parseInt(String(physicalStockInput || '0'), 10);
                        const numP = isNaN(parsedP) ? 0 : Math.max(0, parsedP);
                        const diff = numP - adjustmentItem.current_stock;
                        if (diff > 0) {
                          return <span className="font-black text-[#55B685] text-xs">+{diff} {adjustmentItem.unit} (Penambahan)</span>;
                        } else if (diff < 0) {
                          return <span className="font-black text-[#EB5757] text-xs">{diff} {adjustmentItem.unit} (Pengurangan)</span>;
                        }
                        return <span className="font-bold text-[#8E99A6] text-xs">0 {adjustmentItem.unit} (Sesuai)</span>;
                      })()}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#D8DEE6] uppercase mb-1">Stok Fisik Hasil Cek (Jumlah Nyata) *</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      placeholder="Masukkan stok fisik aktual"
                      value={physicalStockInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPhysicalStockInput(val === '' ? '' : parseInt(val, 10));
                      }}
                      className="w-full bg-[#20252D] border border-[#3A424D] rounded-xl p-3 text-sm font-black text-[#F1F3F5] placeholder:text-[#6F7985] focus:outline-none focus:border-[#C89B3C] min-h-[44px]"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#D8DEE6] uppercase mb-1">Catatan / Alasan Koreksi</label>
                    <input
                      type="text"
                      placeholder="Contoh: Hasil Stock Opname, Barang Rusak, Hilang"
                      value={adjustmentNotes}
                      onChange={(e) => setAdjustmentNotes(e.target.value)}
                      className="w-full bg-[#20252D] border border-[#3A424D] rounded-xl p-3 text-sm text-[#F1F3F5] placeholder:text-[#6F7985] focus:outline-none focus:border-[#C89B3C] min-h-[44px]"
                    />
                  </div>
                </>
              )}
            </form>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[#343B46] bg-[#20252D] flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsAdjustmentModalOpen(false)}
                className="flex-1 bg-[#2A303A] border border-[#3A424D] py-3 rounded-xl font-bold text-xs text-[#D8DEE6] hover:text-[#F1F3F5] hover:bg-[#343D49] transition-all min-h-[44px] cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                form="adjustment-form"
                disabled={isSubmittingAdjustment}
                className="flex-1 bg-[#6D9EEB] hover:bg-[#5B8CD9] font-extrabold text-xs text-[#171A1F] py-3 rounded-xl transition-all shadow-sm min-h-[44px] cursor-pointer"
              >
                {isSubmittingAdjustment ? 'Proses Koreksi...' : 'Simpan Koreksi Stok'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-[110] flex items-center justify-center p-4">
          <div className="bg-[#252B34] w-full max-w-sm rounded-2xl border border-[#343B46] p-6 text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 bg-[#EB5757]/15 text-[#EB5757] rounded-2xl flex items-center justify-center mx-auto border border-[#EB5757]/30">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black text-[#F1F3F5]">Hapus Barang dari Inventaris?</h3>
            <p className="text-xs text-[#8E99A6] font-medium">Tindakan ini tidak dapat dibatalkan.</p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setItemToDelete(null)}
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

      {/* Transfer Stock Modal */}
      <TransferStockModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        defaultSourceDept="Housekeeping"
        defaultTargetDept="Resto"
        onSuccess={() => fetchItemsData()}
      />
    </div>
  );
}
