import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Item, Transaction, UserProfile } from '../types';
import { transactionService } from '../services/transactionService';
import { inventoryService } from '../services/inventoryService';
import { 
  Search, 
  Package, 
  CheckCircle2, 
  AlertCircle, 
  Minus, 
  Plus, 
  ArrowDownRight, 
  Clock, 
  X, 
  RefreshCw,
  ShoppingBag,
  Sparkles
} from 'lucide-react';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

interface RestoTakeGoodsProps {
  user: any;
  profile?: UserProfile | null;
  onNavigateToHistory?: () => void;
}

// Helper to determine if an item/department belongs to Resto
export const isRestoDepartment = (deptName?: string | null): boolean => {
  if (!deptName) return false;
  const d = deptName.toLowerCase().trim();
  return (
    d.includes('resto') ||
    d.includes('restoran') ||
    d.includes('f&b') ||
    d.includes('food') ||
    d.includes('kitchen') ||
    d.includes('dapur') ||
    d.includes('beverage') ||
    d.includes('bar')
  );
};

export function RestoTakeGoods({ user, profile, onNavigateToHistory }: RestoTakeGoodsProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [quantity, setQuantity] = useState<number | string>(1);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Success state for instant feedback
  const [successInfo, setSuccessInfo] = useState<{
    itemName: string;
    takenQty: number;
    unit: string;
    remainingStock: number;
  } | null>(null);

  // Today's summary and recent 3 transactions
  const [todaySummary, setTodaySummary] = useState<{ count: number; totalQty: number }>({ count: 0, totalQty: 0 });
  const [recentTakes, setRecentTakes] = useState<Transaction[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadItems();
    loadTodayActivity();
  }, []);

  const loadItems = async (forceRefresh = false) => {
    setLoading(true);
    try {
      const allItems = await inventoryService.getCachedItems(forceRefresh);
      setItems(allItems);
    } catch (err: any) {
      console.error('Error loading items:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadTodayActivity = async () => {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

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
            unit
          )
        `)
        .eq('type', 'OUT')
        .ilike('department', '%resto%')
        .order('created_at', { ascending: false });

      if (!error && data) {
        // Filter today's transactions
        const todayTx = data.filter(t => new Date(t.created_at) >= todayStart);
        const count = todayTx.length;
        const totalQty = todayTx.reduce((sum, t) => sum + (Number(t.quantity) || 0), 0);
        setTodaySummary({ count, totalQty });

        // Keep 3 most recent takes
        setRecentTakes((data.slice(0, 3) || []) as unknown as Transaction[]);
      }
    } catch (err) {
      console.warn('Notice loading today activity:', err);
    }
  };

  // Filter exclusively items belonging to Resto / Kitchen / F&B department
  const restoItems = useMemo(() => {
    return items.filter(it => isRestoDepartment(it.department));
  }, [items]);

  // Filter Resto items matching search
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) {
      return restoItems;
    }
    const q = searchQuery.toLowerCase().trim();
    return restoItems.filter(it => 
      it.name.toLowerCase().includes(q) || 
      (it.unit && it.unit.toLowerCase().includes(q))
    );
  }, [restoItems, searchQuery]);

  const handleSelectItem = (item: Item) => {
    setSelectedItem(item);
    setQuantity(1);
    setNotes('');
    setErrorMessage(null);
    setSuccessInfo(null);
  };

  const handleClearSelection = () => {
    setSelectedItem(null);
    setQuantity(1);
    setNotes('');
    setErrorMessage(null);
  };

  const handleQuantityChange = (val: number | string) => {
    if (val === '') {
      setQuantity('');
      setErrorMessage(null);
      return;
    }
    const num = Number(val);
    if (isNaN(num)) return;
    setQuantity(num);
    setErrorMessage(null);
  };

  const handleStepQty = (delta: number) => {
    const current = Number(quantity) || 0;
    const nextVal = Math.max(1, current + delta);
    setQuantity(nextVal);
    setErrorMessage(null);
  };

  const handleQuickAdd = (amount: number) => {
    const current = Number(quantity) || 0;
    setQuantity(current + amount);
    setErrorMessage(null);
  };

  const handleSubmitTakeGoods = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

    const numQty = Number(quantity);
    if (!numQty || numQty <= 0) {
      setErrorMessage('Jumlah pengambilan harus lebih dari 0.');
      return;
    }

    if (numQty > (selectedItem.current_stock || 0)) {
      setErrorMessage(
        `Stok tidak mencukupi. Stok tersedia di Gudang hanya ${selectedItem.current_stock} ${selectedItem.unit || 'pcs'}.`
      );
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      // Atomic transaction using existing transactionService
      await transactionService.createTransaction({
        itemId: selectedItem.id,
        type: 'OUT',
        quantity: numQty,
        department: 'Resto',
        notes: notes.trim() || undefined,
        userId: user?.id
      });

      const remainingStock = Math.max(0, (selectedItem.current_stock || 0) - numQty);

      // Set instant success info
      setSuccessInfo({
        itemName: selectedItem.name,
        takenQty: numQty,
        unit: selectedItem.unit || 'pcs',
        remainingStock
      });

      // Update local state items immediately
      setItems(prev => prev.map(it => it.id === selectedItem.id ? { ...it, current_stock: remainingStock } : it));

      // Reset form selection
      setSelectedItem(null);
      setQuantity(1);
      setNotes('');
      setSearchQuery('');

      // Refresh activity & cache in background
      loadTodayActivity();
      inventoryService.invalidateCache();
    } catch (err: any) {
      console.error('Error taking goods for resto:', err);
      setErrorMessage(err.message || 'Gagal memproses pengambilan barang. Silakan coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 max-w-xl mx-auto pb-12 font-sans animate-in fade-in duration-200">
      
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-4 md:p-5 border border-gray-200/90 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-black text-amber-600 uppercase tracking-wider block">
              GUDANG ALIA • OPERASIONAL RESTO
            </span>
            <h2 className="text-xl font-black text-gray-900 tracking-tight">Ambil Barang</h2>
            <p className="text-xs text-gray-500 font-medium mt-0.5">Pengambilan barang langsung dari Gudang</p>
          </div>
          <button
            onClick={() => {
              loadItems(true);
              loadTodayActivity();
            }}
            disabled={loading}
            title="Muat Ulang Stok"
            className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-600' : ''}`} />
          </button>
        </div>

        {/* Compact Daily Activity Counter */}
        <div className="mt-3.5 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-gray-600 font-semibold">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>Hari ini: <strong className="text-gray-900">{todaySummary.count} transaksi</strong></span>
          </div>
          <span className="bg-amber-50 text-amber-800 text-[11px] font-bold px-2 py-0.5 rounded-md border border-amber-200/60">
            Total keluar: {todaySummary.totalQty} item
          </span>
        </div>
      </div>

      {/* Success Confirmation Card */}
      {successInfo && (
        <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-4 text-emerald-900 shadow-xs animate-in zoom-in-95 duration-200 flex items-start gap-3">
          <div className="p-2 bg-emerald-500 text-white rounded-xl shadow-xs shrink-0 mt-0.5">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-emerald-800">
                Berhasil Diambil
              </h4>
              <button 
                onClick={() => setSuccessInfo(null)}
                className="text-emerald-500 hover:text-emerald-800 p-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-base font-black text-emerald-950 mt-0.5 truncate">
              {successInfo.itemName}
            </p>
            <p className="text-xs text-emerald-800 font-semibold mt-0.5">
              Jumlah: <span className="font-extrabold text-emerald-950 text-sm">{successInfo.takenQty} {successInfo.unit}</span>
            </p>
            <p className="text-xs text-emerald-700 mt-1 font-medium pt-1 border-t border-emerald-200/60">
              Sisa stok Gudang: <strong className="text-emerald-900 font-bold">{successInfo.remainingStock} {successInfo.unit}</strong>
            </p>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-900 flex items-start gap-3 shadow-xs animate-in shake duration-200">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-xs font-black uppercase tracking-wider text-red-800">Peringatan</h4>
            <p className="text-xs font-bold text-red-900 mt-0.5">{errorMessage}</p>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Active Form: When an item is selected */}
      {selectedItem ? (
        <div className="bg-white rounded-2xl border-2 border-amber-500 shadow-md p-4 md:p-5 space-y-4 animate-in zoom-in-95 duration-150">
          <div className="flex items-start justify-between gap-2 border-b border-gray-100 pb-3">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-black text-amber-600 uppercase tracking-wider block">
                Barang Dipilih
              </span>
              <h3 className="text-lg font-black text-gray-900 leading-snug break-words">
                {selectedItem.name}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-500 font-medium">Stok Gudang:</span>
                <span className={`text-xs font-extrabold px-2 py-0.5 rounded-md border ${
                  selectedItem.current_stock <= 0
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : selectedItem.current_stock <= (selectedItem.min_stock || 0)
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}>
                  {selectedItem.current_stock} {selectedItem.unit || 'pcs'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClearSelection}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
              title="Ganti Barang"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmitTakeGoods} className="space-y-4">
            {/* Quantity Stepper & Direct Input */}
            <div>
              <label className="block text-xs font-black text-gray-700 uppercase mb-1.5">
                Jumlah yang Diambil ({selectedItem.unit || 'pcs'})
              </label>
              
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleStepQty(-1)}
                  disabled={Number(quantity) <= 1 || submitting}
                  className="w-12 h-12 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 disabled:opacity-40 text-gray-800 font-black flex items-center justify-center text-lg transition-all shrink-0"
                >
                  <Minus className="w-5 h-5" />
                </button>

                <input
                  type="number"
                  min="1"
                  max={selectedItem.current_stock}
                  value={quantity}
                  onChange={(e) => handleQuantityChange(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  onBlur={() => {
                    if (quantity === '' || Number(quantity) <= 0) {
                      setQuantity(1);
                    }
                  }}
                  disabled={submitting}
                  className="flex-1 h-12 text-center text-xl font-black text-gray-900 bg-gray-50 border-2 border-gray-200 focus:border-amber-500 focus:bg-white rounded-xl focus:outline-none transition-all"
                  required
                />

                <button
                  type="button"
                  onClick={() => handleStepQty(1)}
                  disabled={Number(quantity) >= selectedItem.current_stock || submitting}
                  className="w-12 h-12 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 disabled:opacity-40 text-gray-800 font-black flex items-center justify-center text-lg transition-all shrink-0"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              {/* Quick Add Chips */}
              <div className="flex items-center gap-1.5 mt-2 overflow-x-auto pb-1">
                {[1, 2, 5, 10].map(amt => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => handleQuickAdd(amt)}
                    disabled={submitting || (Number(quantity) + amt) > selectedItem.current_stock}
                    className="px-3 py-1 bg-gray-100 hover:bg-amber-50 hover:text-amber-800 hover:border-amber-300 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 transition-all shrink-0 disabled:opacity-30"
                  >
                    +{amt}
                  </button>
                ))}
                {selectedItem.current_stock > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuantity(selectedItem.current_stock);
                      setErrorMessage(null);
                    }}
                    disabled={submitting}
                    className="px-3 py-1 bg-amber-100/70 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold transition-all shrink-0 ml-auto"
                  >
                    Semua ({selectedItem.current_stock})
                  </button>
                )}
              </div>
            </div>

            {/* Optional Note for Kitchen */}
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                Catatan Pengambilan (Opsional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Contoh: Masak Sarapan / Event Buffet"
                disabled={submitting}
                className="w-full text-xs font-semibold px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:border-amber-500 focus:bg-white focus:outline-none"
              />
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={handleClearSelection}
                disabled={submitting}
                className="w-1/3 py-3.5 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-all"
              >
                Batal
              </button>

              <button
                type="submit"
                disabled={submitting || selectedItem.current_stock <= 0}
                className="w-2/3 py-3.5 px-4 bg-[#E65C00] hover:bg-[#CF5300] active:bg-[#B34700] disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl text-sm font-black transition-all shadow-md shadow-orange-500/20 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <>
                    <ArrowDownRight className="w-5 h-5" />
                    <span>AMBIL BARANG</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* Search & Item List */
        <div className="bg-white rounded-2xl border border-gray-200/90 shadow-xs p-4 md:p-5 space-y-3.5">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari bahan/barang resto (contoh: beras, telur, minyak, gula)..."
              className="w-full pl-10 pr-9 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs md:text-sm font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500 focus:bg-white transition-all"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Item List Header */}
          <div className="flex items-center justify-between text-xs text-gray-500 font-semibold px-1">
            <span className="flex items-center gap-1.5 font-bold text-gray-700">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              Barang Khusus Resto:
            </span>
            <span className="bg-amber-50 text-amber-900 font-black px-2 py-0.5 rounded-md border border-amber-200/60 text-[11px]">
              {filteredItems.length} bahan
            </span>
          </div>

          {/* Items List */}
          {loading ? (
            <div className="py-8 text-center space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-amber-600 mx-auto" />
              <p className="text-xs text-gray-500 font-medium">Memuat daftar bahan resto...</p>
            </div>
          ) : restoItems.length === 0 ? (
            <div className="py-8 px-4 text-center space-y-2 bg-amber-50/50 rounded-xl border border-dashed border-amber-200/80">
              <Package className="w-8 h-8 text-amber-400 mx-auto" />
              <p className="text-xs font-black text-amber-950">Belum Ada Barang Resto</p>
              <p className="text-[11px] text-amber-800/90 max-w-xs mx-auto">
                Belum ada barang di Gudang dengan kategori <strong>Resto</strong>. Hubungi Tim Logistik atau Admin untuk menambahkan barang di Master Inventaris dengan departemen "Resto".
              </p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-8 text-center space-y-2 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              <Package className="w-8 h-8 text-gray-300 mx-auto" />
              <p className="text-xs font-bold text-gray-700">Bahan resto tidak ditemukan</p>
              <p className="text-[11px] text-gray-400">Coba kata kunci pencarian bahan lain</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {filteredItems.map(item => {
                const isOutOfStock = (item.current_stock || 0) <= 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => !isOutOfStock && handleSelectItem(item)}
                    disabled={isOutOfStock}
                    className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                      isOutOfStock 
                        ? 'bg-gray-50/60 border-gray-100 opacity-60 cursor-not-allowed'
                        : 'bg-white hover:bg-amber-50/60 hover:border-amber-300 border-gray-200/80 active:scale-[0.99] shadow-2xs'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs md:text-sm font-extrabold text-gray-900 truncate">
                        {item.name}
                      </h4>
                      <p className="text-[11px] text-gray-400 font-medium truncate mt-0.5 flex items-center gap-1.5">
                        <span className="text-amber-700 font-bold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200/60 text-[10px]">
                          {item.department || 'Resto'}
                        </span>
                        <span>• Satuan: {item.unit || 'pcs'}</span>
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-black border ${
                        isOutOfStock 
                          ? 'bg-red-50 text-red-700 border-red-200' 
                          : item.current_stock <= (item.min_stock || 0)
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      }`}>
                        Stok {item.current_stock} {item.unit || 'pcs'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Recent 3 Takes Section */}
      {recentTakes.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200/90 shadow-xs p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
              <ShoppingBag className="w-3.5 h-3.5 text-amber-600" />
              <span>Pengambilan Terakhir Resto</span>
            </h4>
            {onNavigateToHistory && (
              <button
                onClick={onNavigateToHistory}
                className="text-[11px] font-bold text-amber-700 hover:text-amber-800"
              >
                Lihat Semua →
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            {recentTakes.map(tx => (
              <div 
                key={tx.id}
                className="p-2.5 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-extrabold text-gray-900 truncate">
                    {(tx.items as any)?.name || 'Barang'}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {format(new Date(tx.created_at), 'dd MMM yyyy • HH:mm', { locale: localeId })}
                    {tx.notes ? ` • ${tx.notes}` : ''}
                  </p>
                </div>
                <span className="text-xs font-black text-orange-600 shrink-0 bg-orange-50 px-2 py-0.5 rounded-md border border-orange-200/60">
                  -{tx.quantity} {(tx.items as any)?.unit || 'pcs'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
