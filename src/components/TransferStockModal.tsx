import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  ArrowLeftRight, 
  CheckCircle2, 
  AlertCircle, 
  Package, 
  Search,
  Building2,
  ArrowRight,
  Plus
} from 'lucide-react';
import { inventoryService } from '../services/inventoryService';
import { supabase } from '../lib/supabase';
import { Item } from '../types';

interface TransferStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultSourceDept?: string;
  defaultTargetDept?: string;
}

export function TransferStockModal({
  isOpen,
  onClose,
  onSuccess,
  defaultSourceDept = 'Housekeeping',
  defaultTargetDept = 'Resto'
}: TransferStockModalProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // Form State
  const [sourceDept, setSourceDept] = useState(defaultSourceDept);
  const [targetDept, setTargetDept] = useState(defaultTargetDept);
  const [selectedSourceItemId, setSelectedSourceItemId] = useState('');
  const [selectedTargetItemId, setSelectedTargetItemId] = useState('AUTO'); // 'AUTO' or specific target item ID
  const [quantity, setQuantity] = useState<number | ''>(1);
  const [notes, setNotes] = useState('');
  const [sourceSearch, setSourceSearch] = useState('');

  // Status State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const departments = ['Housekeeping', 'Resto', 'Front Office', 'Teknisi', 'General'];

  useEffect(() => {
    if (isOpen) {
      loadAllItems();
      setSourceDept(defaultSourceDept);
      setTargetDept(defaultTargetDept);
      setSelectedSourceItemId('');
      setSelectedTargetItemId('AUTO');
      setQuantity(1);
      setNotes('');
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [isOpen, defaultSourceDept, defaultTargetDept]);

  const loadAllItems = async () => {
    setLoadingItems(true);
    try {
      const data = await inventoryService.getCachedItems(true);
      setItems(data);
    } catch (err: any) {
      console.error('Failed to load items for transfer:', err);
    } finally {
      setLoadingItems(false);
    }
  };

  // Filter items in Source Department
  const sourceItems = useMemo(() => {
    return items.filter(it => {
      if (sourceDept === 'Semua') return true;
      const dept = (it.department || '').toLowerCase();
      const target = sourceDept.toLowerCase();
      if (target.includes('hk') || target.includes('housekeeping')) {
        return dept.includes('housekeeping') || dept.includes('hk');
      }
      if (target.includes('resto')) {
        return dept.includes('resto') || dept.includes('restoran') || dept.includes('f&b') || dept.includes('kitchen') || dept.includes('dapur');
      }
      return dept.includes(target);
    });
  }, [items, sourceDept]);

  // Filtered Source Items by search
  const filteredSourceItems = useMemo(() => {
    if (!sourceSearch.trim()) return sourceItems;
    const q = sourceSearch.toLowerCase().trim();
    return sourceItems.filter(it => it.name.toLowerCase().includes(q));
  }, [sourceItems, sourceSearch]);

  // Source item object
  const selectedSourceItem = useMemo(() => {
    return items.find(it => it.id === selectedSourceItemId) || null;
  }, [items, selectedSourceItemId]);

  // Filter items in Target Department
  const targetItems = useMemo(() => {
    return items.filter(it => {
      const dept = (it.department || '').toLowerCase();
      const target = targetDept.toLowerCase();
      if (target.includes('hk') || target.includes('housekeeping')) {
        return dept.includes('housekeeping') || dept.includes('hk');
      }
      if (target.includes('resto')) {
        return dept.includes('resto') || dept.includes('restoran') || dept.includes('f&b') || dept.includes('kitchen') || dept.includes('dapur');
      }
      return dept.includes(target);
    });
  }, [items, targetDept]);

  // Auto-match target item by name when source item is selected
  useEffect(() => {
    if (selectedSourceItem && targetItems.length > 0) {
      const matched = targetItems.find(it => 
        it.name.toLowerCase().trim() === selectedSourceItem.name.toLowerCase().trim()
      );
      if (matched) {
        setSelectedTargetItemId(matched.id);
      } else {
        setSelectedTargetItemId('AUTO');
      }
    }
  }, [selectedSourceItem, targetItems]);

  const handleStepQty = (delta: number) => {
    const current = Number(quantity) || 0;
    setQuantity(Math.max(1, current + delta));
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSourceItem) {
      setErrorMessage('Silakan pilih barang asal yang akan ditransfer.');
      return;
    }

    const numQty = Number(quantity);
    if (!numQty || numQty <= 0) {
      setErrorMessage('Jumlah transfer harus lebih dari 0.');
      return;
    }

    if (numQty > (selectedSourceItem.current_stock || 0)) {
      setErrorMessage(`Stok barang asal tidak mencukupi. Stok tersedia: ${selectedSourceItem.current_stock} ${selectedSourceItem.unit || 'pcs'}.`);
      return;
    }

    if (sourceDept === targetDept && selectedSourceItemId === selectedTargetItemId) {
      setErrorMessage('Departemen dan barang asal tidak boleh sama dengan barang tujuan.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const result = await inventoryService.transferStock({
        sourceItemId: selectedSourceItem.id,
        targetDepartment: targetDept,
        targetItemId: selectedTargetItemId === 'AUTO' ? undefined : selectedTargetItemId,
        quantity: numQty,
        notes: notes.trim() || undefined,
        userId: user?.id || 'system'
      });

      setSuccessMessage(
        `Berhasil mentransfer ${numQty} ${selectedSourceItem.unit || 'pcs'} ${selectedSourceItem.name} dari ${selectedSourceItem.department} ke ${result.destinationItem.department}!`
      );

      if (onSuccess) onSuccess();

      setTimeout(() => {
        onClose();
      }, 1800);
    } catch (err: any) {
      console.error('Transfer stock error:', err);
      setErrorMessage(err.message || 'Gagal memproses transfer stok.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-[#252B34] border border-[#343B46] rounded-2xl w-full max-w-lg shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden font-sans">
        
        {/* Modal Header */}
        <div className="p-4 md:p-5 border-b border-[#343B46] bg-[#20252D] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#C89B3C]/15 border border-[#C89B3C]/30 text-[#E0B85A] rounded-xl shadow-xs">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-[#F1F3F5] tracking-tight">Transfer Stok antar Departemen</h3>
              <p className="text-xs text-[#8E99A6] font-medium">Pindahkan stok barang (misal: Air Galon HK ke Resto)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#8E99A6] hover:text-[#F1F3F5] hover:bg-[#2A303A] rounded-xl transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleTransferSubmit} className="p-4 md:p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          
          {/* Success Banner */}
          {successMessage && (
            <div className="p-3.5 bg-[#55B685]/15 border border-[#55B685]/30 rounded-xl text-[#55B685] text-xs font-bold flex items-center gap-2.5 animate-in zoom-in-95 duration-150">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3.5 bg-[#EB5757]/15 border border-[#EB5757]/30 rounded-xl text-[#F87171] text-xs font-bold flex items-center gap-2.5 animate-in shake duration-150">
              <AlertCircle className="w-4 h-4 shrink-0 text-[#EB5757]" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Department Flow Overview */}
          <div className="grid grid-cols-2 gap-3 bg-[#20252D] p-3 rounded-xl border border-[#343B46]">
            <div>
              <label className="text-[10px] font-black text-[#8E99A6] uppercase tracking-wider block mb-1">
                Dari (Departemen Asal)
              </label>
              <select
                value={sourceDept}
                onChange={(e) => {
                  setSourceDept(e.target.value);
                  setSelectedSourceItemId('');
                }}
                className="w-full bg-[#252B34] border border-[#3A424D] rounded-lg px-2.5 py-1.5 text-xs text-[#F1F3F5] font-bold focus:outline-none focus:border-[#C89B3C]"
              >
                {departments.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-black text-[#8E99A6] uppercase tracking-wider block mb-1">
                Ke (Departemen Tujuan)
              </label>
              <select
                value={targetDept}
                onChange={(e) => setTargetDept(e.target.value)}
                className="w-full bg-[#252B34] border border-[#3A424D] rounded-lg px-2.5 py-1.5 text-xs text-[#F1F3F5] font-bold focus:outline-none focus:border-[#C89B3C]"
              >
                {departments.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Source Item Selector */}
          <div>
            <label className="text-xs font-bold text-[#D8DEE6] block mb-1.5">
              Pilih Barang Asal ({sourceDept}) <span className="text-rose-400">*</span>
            </label>
            
            {/* Quick Search */}
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#8E99A6]" />
              <input
                type="text"
                placeholder={`Cari barang ${sourceDept}...`}
                value={sourceSearch}
                onChange={(e) => setSourceSearch(e.target.value)}
                className="w-full bg-[#20252D] border border-[#3A424D] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#F1F3F5] placeholder:text-[#6F7985] focus:outline-none focus:border-[#C89B3C]"
              />
            </div>

            <div className="max-h-36 overflow-y-auto space-y-1 pr-1 border border-[#3A424D] rounded-xl p-1 bg-[#20252D]">
              {loadingItems ? (
                <div className="p-4 text-center text-xs text-[#8E99A6]">Memuat daftar barang...</div>
              ) : filteredSourceItems.length === 0 ? (
                <div className="p-4 text-center text-xs text-[#8E99A6]">
                  Tidak ada barang ditemukan di departemen {sourceDept}
                </div>
              ) : (
                filteredSourceItems.map(item => {
                  const isSelected = selectedSourceItemId === item.id;
                  const isOutOfStock = (item.current_stock || 0) <= 0;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={isOutOfStock}
                      onClick={() => {
                        setSelectedSourceItemId(item.id);
                        setErrorMessage(null);
                      }}
                      className={`w-full text-left p-2 rounded-lg text-xs flex items-center justify-between transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#C89B3C]/20 border border-[#C89B3C] text-[#F1F3F5]'
                          : isOutOfStock
                          ? 'opacity-40 bg-transparent text-[#6F7985] cursor-not-allowed'
                          : 'hover:bg-[#2A303A] text-[#D8DEE6]'
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <span className="font-bold block truncate">{item.name}</span>
                        <span className="text-[10px] text-[#8E99A6]">{item.department || sourceDept}</span>
                      </div>
                      <span className={`text-[11px] font-black px-2 py-0.5 rounded-md ${
                        item.current_stock <= 0
                          ? 'bg-rose-500/15 text-rose-400'
                          : 'bg-[#55B685]/15 text-[#55B685]'
                      }`}>
                        Stok: {item.current_stock} {item.unit}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Target Item Selector */}
          {selectedSourceItem && (
            <div className="space-y-1.5 pt-1 animate-in fade-in duration-150">
              <label className="text-xs font-bold text-[#D8DEE6] block">
                Tujuan di Departemen {targetDept}
              </label>
              <select
                value={selectedTargetItemId}
                onChange={(e) => setSelectedTargetItemId(e.target.value)}
                className="w-full bg-[#20252D] border border-[#3A424D] rounded-xl px-3 py-2 text-xs text-[#F1F3F5] font-medium focus:outline-none focus:border-[#C89B3C]"
              >
                <option value="AUTO">
                  ✨ Samakan Nama: "{selectedSourceItem.name}" (Buat barang baru jika belum ada)
                </option>
                {targetItems.map(it => (
                  <option key={it.id} value={it.id}>
                    {it.name} (Stok saat ini: {it.current_stock} {it.unit})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Quantity & Quick Add */}
          <div>
            <label className="text-xs font-bold text-[#D8DEE6] block mb-1">
              Jumlah Transfer <span className="text-rose-400">*</span>
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleStepQty(-1)}
                className="p-2.5 bg-[#20252D] border border-[#3A424D] hover:bg-[#2A303A] rounded-xl text-[#F1F3F5] font-black transition-all cursor-pointer"
              >
                -
              </button>
              <input
                type="number"
                min="1"
                max={selectedSourceItem ? selectedSourceItem.current_stock : 9999}
                value={quantity}
                onChange={(e) => {
                  const val = e.target.value === '' ? '' : Number(e.target.value);
                  setQuantity(val);
                }}
                className="flex-1 text-center bg-[#20252D] border border-[#3A424D] rounded-xl py-2 text-sm font-black text-[#F1F3F5] focus:outline-none focus:border-[#C89B3C]"
              />
              <button
                type="button"
                onClick={() => handleStepQty(1)}
                className="p-2.5 bg-[#20252D] border border-[#3A424D] hover:bg-[#2A303A] rounded-xl text-[#F1F3F5] font-black transition-all cursor-pointer"
              >
                +
              </button>
            </div>

            {/* Quick Add Buttons */}
            <div className="flex gap-1.5 mt-2">
              {[1, 5, 10, 20].map(amt => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setQuantity(amt)}
                  className="flex-1 py-1 bg-[#20252D] border border-[#3A424D] hover:border-[#C89B3C] text-[11px] font-extrabold text-[#D8DEE6] rounded-lg transition-all cursor-pointer"
                >
                  +{amt}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-bold text-[#D8DEE6] block mb-1">
              Catatan / Keperluan (Opsional)
            </label>
            <input
              type="text"
              placeholder={`Misal: ${targetDept} ambil persediaan galon dari ${sourceDept}`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-[#20252D] border border-[#3A424D] rounded-xl px-3 py-2 text-xs text-[#F1F3F5] placeholder:text-[#6F7985] focus:outline-none focus:border-[#C89B3C]"
            />
          </div>

          {/* Submit Button */}
          <div className="pt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 bg-[#20252D] hover:bg-[#2A303A] border border-[#3A424D] text-[#D8DEE6] rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedSourceItemId}
              className="flex-2 py-2.5 px-4 bg-gradient-to-r from-[#E6B85C] to-[#C89B3C] hover:brightness-110 text-[#171A1F] rounded-xl text-xs font-black transition-all shadow-md cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <ArrowLeftRight className="w-4 h-4" />
              <span>{isSubmitting ? 'Memproses Transfer...' : 'Konfirmasi Transfer Stok'}</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
