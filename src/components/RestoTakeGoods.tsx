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
      <div className="bg-[#252B34] rounded-2xl p-4 md:p-5 border border-[#343B46] shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-black text-[#E0B85A] uppercase tracking-wider block">
              GUDANG ALIA • OPERASIONAL RESTO
            </span>
            <h2 className="text-xl font-black text-[#F1F3F5] tracking-tight">Ambil Barang</h2>
            <p className="text-xs text-[#8E99A6] font-medium mt-0.5">Pengambilan barang langsung dari Gudang</p>
          </div>
          <button
            onClick={() => {
              loadItems(true);
              loadTodayActivity();
            }}
            disabled={loading}
            title="Muat Ulang Stok"
            className="p-2 text-[#8E99A6] hover:text-[#E0B85A] hover:bg-[#2A303A] rounded-xl transition-all cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#E0B85A]' : ''}`} />
          </button>
        </div>

        {/* Compact Daily Activity Counter */}
        <div className="mt-3.5 pt-3 border-t border-[#343B46] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-[#8E99A6] font-semibold">
            <Clock className="w-3.5 h-3.5 text-[#E0B85A]" />
            <span>Hari ini: <strong className="text-[#F1F3F5]">{todaySummary.count} transaksi</strong></span>
          </div>
          <span className="bg-[#C89B3C]/15 text-[#E0B85A] text-[11px] font-bold px-2.5 py-0.5 rounded-md border border-[#C89B3C]/30">
            Total keluar: {todaySummary.totalQty} item
          </span>
        </div>
      </div>

      {/* Success Confirmation Card */}
      {successInfo && (
        <div className="bg-[#55B685]/15 border border-[#55B685]/30 rounded-2xl p-4 text-[#55B685] shadow-xs animate-in zoom-in-95 duration-200 flex items-start gap-3">
          <div className="p-2 bg-[#55B685] text-[#171A1F] rounded-xl shadow-xs shrink-0 mt-0.5">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-[#55B685]">
                Berhasil Diambil
              </h4>
              <button 
                onClick={() => setSuccessInfo(null)}
                className="text-[#55B685] hover:text-[#74cf9f] p-0.5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-base font-black text-[#F1F3F5] mt-0.5 truncate">
              {successInfo.itemName}
            </p>
            <p className="text-xs text-[#D8DEE6] font-semibold mt-0.5">
              Jumlah: <span className="font-extrabold text-[#55B685] text-sm">{successInfo.takenQty} {successInfo.unit}</span>
            </p>
            <p className="text-xs text-[#8E99A6] mt-1 font-medium pt-1 border-t border-[#55B685]/20">
              Sisa stok Gudang: <strong className="text-[#F1F3F5] font-bold">{successInfo.remainingStock} {successInfo.unit}</strong>
            </p>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {errorMessage && (
        <div className="bg-[#EB5757]/15 border border-[#EB5757]/30 rounded-2xl p-4 text-[#F87171] flex items-start gap-3 shadow-xs animate-in shake duration-200">
          <AlertCircle className="w-5 h-5 text-[#EB5757] shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#EB5757]">Peringatan</h4>
            <p className="text-xs font-bold text-[#F87171] mt-0.5">{errorMessage}</p>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-[#8E99A6] hover:text-[#F1F3F5] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Active Form: When an item is selected */}
      {selectedItem ? (
        <div className="bg-[#252B34] rounded-2xl border-2 border-[#C89B3C] shadow-lg p-4 md:p-5 space-y-4 animate-in zoom-in-95 duration-150">
          <div className="flex items-start justify-between gap-2 border-b border-[#343B46] pb-3">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-black text-[#E0B85A] uppercase tracking-wider block">
                Barang Dipilih
              </span>
              <h3 className="text-lg font-black text-[#F1F3F5] leading-snug break-words">
                {selectedItem.name}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-[#8E99A6] font-medium">Stok Gudang:</span>
                <span className={`text-xs font-extrabold px-2.5 py-0.5 rounded-md border ${
                  selectedItem.current_stock <= 0
                    ? 'bg-[#EB5757]/15 text-[#EB5757] border-[#EB5757]/30'
                    : selectedItem.current_stock <= (selectedItem.min_stock || 0)
                    ? 'bg-[#C89B3C]/15 text-[#E0B85A] border-[#C89B3C]/30'
                    : 'bg-[#55B685]/15 text-[#55B685] border-[#55B685]/30'
                }`}>
                  {selectedItem.current_stock} {selectedItem.unit || 'pcs'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClearSelection}
              className="p-1.5 text-[#8E99A6] hover:text-[#F1F3F5] hover:bg-[#2A303A] rounded-xl transition-all cursor-pointer"
              title="Ganti Barang"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmitTakeGoods} className="space-y-4">
            {/* Quantity Stepper & Direct Input */}
            <div>
              <label className="block text-xs font-black text-[#D8DEE6] uppercase mb-1.5">
                Jumlah yang Diambil ({selectedItem.unit || 'pcs'})
              </label>
              
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleStepQty(-1)}
                  disabled={Number(quantity) <= 1 || submitting}
                  className="w-12 h-12 rounded-xl bg-[#20252D] hover:bg-[#2A303A] active:bg-[#303741] disabled:opacity-40 text-[#F1F3F5] font-black flex items-center justify-center text-lg border border-[#3A424D] transition-all shrink-0 cursor-pointer"
                >
                  <Minus className="w-5 h-5" />
                </button>

                <input
                  type="number"
                  min="1"
                  max={selectedItem.current_stock}
                  value={quantity === 0 ? '' : quantity}
                  placeholder="0"
                  onChange={(e) => handleQuantityChange(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  onBlur={() => {
                    if (quantity === '' || Number(quantity) <= 0) {
                      setQuantity(1);
                    }
                  }}
                  disabled={submitting}
                  className="flex-1 h-12 text-center text-xl font-black text-[#F1F3F5] bg-[#20252D] border-2 border-[#3A424D] focus:border-[#C89B3C] rounded-xl focus:outline-none transition-all"
                  required
                />

                <button
                  type="button"
                  onClick={() => handleStepQty(1)}
                  disabled={Number(quantity) >= selectedItem.current_stock || submitting}
                  className="w-12 h-12 rounded-xl bg-[#20252D] hover:bg-[#2A303A] active:bg-[#303741] disabled:opacity-40 text-[#F1F3F5] font-black flex items-center justify-center text-lg border border-[#3A424D] transition-all shrink-0 cursor-pointer"
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
                    className="px-3 py-1 bg-[#20252D] hover:bg-[#2A303A] hover:text-[#E0B85A] hover:border-[#C89B3C] border border-[#3A424D] rounded-lg text-xs font-bold text-[#D8DEE6] transition-all shrink-0 disabled:opacity-30 cursor-pointer"
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
                    className="px-3 py-1 bg-[#C89B3C]/15 hover:bg-[#C89B3C]/25 text-[#E0B85A] border border-[#C89B3C]/40 rounded-lg text-xs font-bold transition-all shrink-0 ml-auto cursor-pointer"
                  >
                    Semua ({selectedItem.current_stock})
                  </button>
                )}
              </div>
            </div>

            {/* Optional Note for Kitchen */}
            <div>
              <label className="block text-[11px] font-bold text-[#8E99A6] uppercase mb-1">
                Catatan Pengambilan (Opsional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Contoh: Masak Sarapan / Event Buffet"
                disabled={submitting}
                className="w-full text-xs font-semibold px-3 py-2.5 bg-[#20252D] border border-[#3A424D] text-[#F1F3F5] placeholder:text-[#6F7985] rounded-xl focus:border-[#C89B3C] focus:outline-none"
              />
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={handleClearSelection}
                disabled={submitting}
                className="w-1/3 py-3.5 px-3 bg-[#2A303A] hover:bg-[#343D49] text-[#D8DEE6] rounded-xl text-xs font-bold transition-all border border-[#3A424D] cursor-pointer"
              >
                Batal
              </button>

              <button
                type="submit"
                disabled={submitting || selectedItem.current_stock <= 0}
                className="w-2/3 py-3.5 px-4 bg-gradient-to-r from-[#E6B85C] to-[#C89B3C] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed text-[#171A1F] rounded-xl text-sm font-black transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-[#171A1F]" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <>
                    <ArrowDownRight className="w-5 h-5 stroke-[2.5]" />
                    <span>AMBIL BARANG</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* Search & Item List */
        <div className="bg-[#252B34] rounded-2xl border border-[#343B46] shadow-[0_4px_20px_rgba(0,0,0,0.18)] p-4 md:p-5 space-y-3.5">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8E99A6]" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari bahan/barang resto (contoh: beras, telur, minyak, gula)..."
              className="w-full pl-10 pr-9 py-3 bg-[#20252D] border border-[#3A424D] rounded-xl text-xs md:text-sm font-semibold text-[#F1F3F5] placeholder:text-[#6F7985] focus:outline-none focus:border-[#C89B3C] transition-all"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8E99A6] hover:text-[#F1F3F5] p-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Item List Header */}
          <div className="flex items-center justify-between text-xs text-[#8E99A6] font-semibold px-1">
            <span className="flex items-center gap-1.5 font-bold text-[#D8DEE6]">
              <span className="w-2 h-2 rounded-full bg-[#E0B85A]"></span>
              Barang Khusus Resto:
            </span>
            <span className="bg-[#C89B3C]/15 text-[#E0B85A] font-black px-2.5 py-0.5 rounded-md border border-[#C89B3C]/30 text-[11px]">
              {filteredItems.length} bahan
            </span>
          </div>

          {/* Items List */}
          {loading ? (
            <div className="py-8 text-center space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-[#E0B85A] mx-auto" />
              <p className="text-xs text-[#8E99A6] font-medium">Memuat daftar bahan resto...</p>
            </div>
          ) : restoItems.length === 0 ? (
            <div className="py-8 px-4 text-center space-y-2 bg-[#20252D] rounded-xl border border-dashed border-[#3A424D]">
              <Package className="w-8 h-8 text-[#E0B85A] mx-auto opacity-70" />
              <p className="text-xs font-black text-[#F1F3F5]">Belum Ada Barang Resto</p>
              <p className="text-[11px] text-[#8E99A6] max-w-xs mx-auto">
                Belum ada barang di Gudang dengan kategori <strong>Resto</strong>. Hubungi Tim Logistik atau Admin untuk menambahkan barang di Master Inventaris dengan departemen "Resto".
              </p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-8 text-center space-y-2 bg-[#20252D] rounded-xl border border-dashed border-[#3A424D]">
              <Package className="w-8 h-8 text-[#6F7985] mx-auto" />
              <p className="text-xs font-bold text-[#F1F3F5]">Bahan resto tidak ditemukan</p>
              <p className="text-[11px] text-[#8E99A6]">Coba kata kunci pencarian bahan lain</p>
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
                    className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between gap-3 cursor-pointer ${
                      isOutOfStock 
                        ? 'bg-[#20252D]/60 border-[#2C333E] opacity-50 cursor-not-allowed'
                        : 'bg-[#20252D] hover:bg-[#2A303A] hover:border-[#C89B3C]/60 border-[#3A424D] active:scale-[0.99] shadow-xs'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs md:text-sm font-extrabold text-[#F1F3F5] truncate">
                        {item.name}
                      </h4>
                      <p className="text-[11px] text-[#8E99A6] font-medium truncate mt-0.5 flex items-center gap-1.5">
                        <span className="text-[#E0B85A] font-bold bg-[#C89B3C]/15 px-1.5 py-0.2 rounded border border-[#C89B3C]/30 text-[10px]">
                          {item.department || 'Resto'}
                        </span>
                        <span>• Satuan: {item.unit || 'pcs'}</span>
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-black border ${
                        isOutOfStock 
                          ? 'bg-[#EB5757]/15 text-[#EB5757] border-[#EB5757]/30' 
                          : item.current_stock <= (item.min_stock || 0)
                          ? 'bg-[#C89B3C]/15 text-[#E0B85A] border-[#C89B3C]/30'
                          : 'bg-[#55B685]/15 text-[#55B685] border-[#55B685]/30'
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
        <div className="bg-[#252B34] rounded-2xl border border-[#343B46] shadow-[0_4px_20px_rgba(0,0,0,0.18)] p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black text-[#F1F3F5] uppercase tracking-wider flex items-center gap-1.5">
              <ShoppingBag className="w-3.5 h-3.5 text-[#E0B85A]" />
              <span>Pengambilan Terakhir Resto</span>
            </h4>
            {onNavigateToHistory && (
              <button
                onClick={onNavigateToHistory}
                className="text-[11px] font-bold text-[#E0B85A] hover:underline cursor-pointer"
              >
                Lihat Semua →
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            {recentTakes.map(tx => (
              <div 
                key={tx.id}
                className="p-2.5 bg-[#20252D] rounded-xl border border-[#343B46] flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-extrabold text-[#F1F3F5] truncate">
                    {(tx.items as any)?.name || 'Barang'}
                  </p>
                  <p className="text-[10px] text-[#8E99A6]">
                    {format(new Date(tx.created_at), 'dd MMM yyyy • HH:mm', { locale: localeId })}
                    {tx.notes ? ` • ${tx.notes}` : ''}
                  </p>
                </div>
                <span className="text-xs font-black text-[#E0B85A] shrink-0 bg-[#C89B3C]/15 px-2 py-0.5 rounded-md border border-[#C89B3C]/30">
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
