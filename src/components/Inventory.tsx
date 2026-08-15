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
  Package, 
  X,
  Layers
} from 'lucide-react';
import { inventoryService } from '../services/inventoryService';
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
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('Housekeeping');
  const [unit, setUnit] = useState('pcs');
  const [initialStock, setInitialStock] = useState<number | ''>(0);
  const [minStock, setMinStock] = useState<number | ''>(5);

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
  };

  const openAddItemModal = () => {
    setEditingItem(null);
    resetForm();
    setIsModalOpen(true);
  };

  const openEditItemModal = (item: Item) => {
    setEditingItem(item);
    setName(item.name);
    setDepartment(item.department || 'Housekeeping');
    setUnit(item.unit || 'pcs');
    setInitialStock(item.initial_stock || 0);
    setMinStock(item.min_stock || 0);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError('Nama barang tidak boleh kosong.');
      return;
    }

    const numInitial = typeof initialStock === 'number' ? initialStock : parseInt(initialStock || '0', 10);
    const numMin = typeof minStock === 'number' ? minStock : parseInt(minStock || '0', 10);

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

  const getStockBadge = (current: number, min: number) => {
    if (current <= 0) {
      return (
        <span className="px-2 py-0.5 bg-red-50 text-red-600 border border-red-200 text-[10px] font-black rounded-lg uppercase">
          HABIS
        </span>
      );
    }
    if (current <= min) {
      return (
        <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-black rounded-lg uppercase">
          MENIPIS
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black rounded-lg uppercase">
        AMAN
      </span>
    );
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300 pb-20 md:pb-6 font-sans">
      {/* Header & Main Button */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 md:p-6 rounded-2xl border border-gray-200/90 shadow-sm">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">Stok Barang (Inventory)</h1>
          <p className="text-xs md:text-sm text-gray-500 mt-0.5 font-medium">Daftar lengkap ketersediaan item inventaris hotel</p>
        </div>

        <div className="flex gap-2 w-full md:w-auto">
          <button
            onClick={fetchItemsData}
            className="bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-900 p-2.5 rounded-xl border border-gray-200 transition-all flex items-center justify-center min-h-[44px]"
            title="Refresh Data"
          >
            <Activity className={cn("w-5 h-5", loading && "animate-spin text-amber-600")} />
          </button>

          <button
            onClick={openAddItemModal}
            className="flex-1 md:flex-none bg-[#E65C00] hover:bg-[#CF5300] text-white font-extrabold py-2.5 px-5 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-sm shadow-orange-500/20 min-h-[44px]"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Tambah Barang</span>
          </button>
        </div>
      </div>

      {/* Search & Department Filters */}
      <div className="bg-white p-3 md:p-4 rounded-2xl border border-gray-200/90 shadow-sm space-y-3">
        {/* Search Bar */}
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Cari barang / departemen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500 focus:bg-white min-h-[40px] transition-colors"
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

        {/* Department Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          <span className="text-gray-500 text-[10px] font-extrabold uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3" /> Dept:
          </span>
          {['Semua', ...departments].map((dept) => (
            <button
              key={dept}
              onClick={() => { setSelectedDept(dept); setPage(1); }}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all border shrink-0",
                selectedDept === dept
                  ? "bg-amber-500/10 border-amber-500 text-amber-700"
                  : "bg-gray-100 border-gray-200 text-gray-600 hover:text-gray-900"
              )}
            >
              {dept}
            </button>
          ))}
        </div>
      </div>

      {/* Main Stock Display */}
      <div className="bg-white rounded-2xl border border-gray-200/90 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-xs text-gray-500 animate-pulse font-medium">Memuat daftar barang...</div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-xs text-gray-500 font-medium">Tidak ada barang ditemukan.</div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50/80 text-gray-500 uppercase text-[10px] font-extrabold border-b border-gray-200">
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
                <tbody className="divide-y divide-gray-100">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-amber-50/30 transition-colors">
                      <td className="p-4 font-bold text-gray-900 text-sm">{item.name}</td>
                      <td className="p-4 text-gray-600 font-medium">{item.department || 'General'}</td>
                      <td className="p-4 text-center">
                        {getStockBadge(item.current_stock, item.min_stock)}
                      </td>
                      <td className="p-4 text-right text-gray-500 font-semibold">{item.initial_stock || 0}</td>
                      <td className="p-4 text-right font-black text-sm text-gray-900">{item.current_stock}</td>
                      <td className="p-4 text-right text-gray-500 font-medium">{item.min_stock}</td>
                      <td className="p-4 text-center text-gray-600 font-medium">{item.unit || 'pcs'}</td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openEditItemModal(item)}
                            className="p-1.5 hover:bg-amber-50 text-amber-600 rounded-lg transition-colors"
                            title="Edit Barang"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setItemToDelete(item.id)}
                            className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
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

            {/* Mobile Cards View (One-hand optimized, no horizontal scroll) */}
            <div className="block md:hidden divide-y divide-gray-100">
              {items.map((item) => (
                <div key={item.id} className="p-3.5 space-y-2 hover:bg-amber-50/20 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 leading-tight">{item.name}</h3>
                      <p className="text-[10px] text-gray-500 mt-0.5 font-medium">{item.department || 'General'}</p>
                    </div>
                    <div>{getStockBadge(item.current_stock, item.min_stock)}</div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-gray-100 text-xs">
                    <div className="flex items-center gap-3">
                      <div>
                        <span className="text-[9px] text-gray-400 font-extrabold uppercase block">Stok Saat Ini</span>
                        <span className="font-black text-gray-900 text-sm">
                          {item.current_stock} <span className="text-xs font-normal text-gray-500">{item.unit}</span>
                        </span>
                      </div>
                      <div className="border-l border-gray-200 pl-3">
                        <span className="text-[9px] text-gray-400 font-extrabold uppercase block">Batas Min.</span>
                        <span className="font-semibold text-gray-600 text-xs">{item.min_stock} {item.unit}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditItemModal(item)}
                        className="p-2 bg-gray-50 rounded-xl text-amber-600 border border-gray-200 active:scale-95 hover:bg-amber-50"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setItemToDelete(item.id)}
                        className="p-2 bg-gray-50 rounded-xl text-red-600 border border-gray-200 active:scale-95 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            <div className="p-3 md:p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-xs text-gray-600 font-medium">
              <span>Total {totalItemsCount} SKU</span>
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

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl border border-gray-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom duration-300">
            {/* Modal Header */}
            <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <h3 className="text-base font-black text-gray-900 tracking-tight">
                {editingItem ? 'Edit Data Barang' : 'Tambah Barang Baru'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-2">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form id="item-form" onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Nama Barang *</label>
                <input
                  type="text"
                  placeholder="Contoh: Handuk Mandi Standard"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:outline-none focus:border-amber-500 focus:bg-white min-h-[44px]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Departemen *</label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:outline-none focus:border-amber-500 focus:bg-white min-h-[44px]"
                    required
                  >
                    {departments.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Satuan *</label>
                  <input
                    type="text"
                    placeholder="pcs, unit, kg"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:outline-none focus:border-amber-500 focus:bg-white min-h-[44px]"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Stok Awal *</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="0"
                    value={initialStock}
                    onChange={(e) => setInitialStock(e.target.value ? parseInt(e.target.value, 10) : '')}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:outline-none focus:border-amber-500 focus:bg-white min-h-[44px]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Min. Stok Alert *</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="5"
                    value={minStock}
                    onChange={(e) => setMinStock(e.target.value ? parseInt(e.target.value, 10) : '')}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:outline-none focus:border-amber-500 focus:bg-white min-h-[44px]"
                    required
                  />
                </div>
              </div>
            </form>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex-1 bg-white border border-gray-200 py-3 rounded-xl font-bold text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all min-h-[44px]"
              >
                Batal
              </button>
              <button
                type="submit"
                form="item-form"
                disabled={isSubmitting}
                className="flex-1 bg-[#E65C00] hover:bg-[#CF5300] font-extrabold text-xs text-white py-3 rounded-xl transition-all shadow-sm shadow-orange-500/20 min-h-[44px]"
              >
                {isSubmitting ? 'Menyimpan...' : editingItem ? 'Simpan Perubahan' : 'Tambah Barang'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-[110] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl border border-gray-200 p-6 text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto border border-red-100">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black text-gray-900">Hapus Barang dari Inventaris?</h3>
            <p className="text-xs text-gray-500 font-medium">Tindakan ini tidak dapat dibatalkan.</p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setItemToDelete(null)}
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
