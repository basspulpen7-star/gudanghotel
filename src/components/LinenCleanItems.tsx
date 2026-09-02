import React, { useMemo, useState } from 'react';
import { PackageCheck, CheckCircle2, ArrowLeftRight } from 'lucide-react';
import { ITEM_TYPES } from '../constants-linen';
import { LinenState } from '../types-linen';
import { calculateCleanStockMap } from '../lib/linenUtils';
import { LinenReconciliationModal } from './LinenReconciliationModal';

interface LinenCleanItemsProps {
  state: LinenState;
  onRefresh?: () => void;
}

export function LinenCleanItems({ state, onRefresh }: LinenCleanItemsProps) {
  const [isReconModalOpen, setIsReconModalOpen] = useState(false);

  const cleanItemsList = useMemo(() => {
    const cleanStockMap = calculateCleanStockMap(state);
    return ITEM_TYPES.map(type => ({
      itemName: type,
      quantity: cleanStockMap[type] || 0
    }));
  }, [state]);

  const totalClean = cleanItemsList.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-black text-[#F1F3F5] tracking-tight">Stok Barang Bersih</h3>
          <p className="text-xs text-[#8E99A6] font-medium">
            Linen bersih siap pakai (terhitung otomatis dari transaksi masuk &amp; keluar)
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setIsReconModalOpen(true)}
            className="px-3.5 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 rounded-xl text-xs font-black text-amber-400 flex items-center gap-1.5 transition-all shadow-sm"
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span>Sinkron Ulang Stok Laundry</span>
          </button>
          <div className="px-3.5 py-1.5 bg-[#55B685]/15 border border-[#55B685]/30 rounded-xl text-xs font-black text-[#55B685] flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            <span>Total: {totalClean.toLocaleString()} pcs</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cleanItemsList.map((item) => (
          <div 
            key={item.itemName}
            className="p-4 sm:p-5 rounded-2xl border border-[#343B46] bg-[#252B34] flex items-center justify-between shadow-[0_4px_20px_rgba(0,0,0,0.18)] hover:border-[#55B685]/40 transition-all group"
          >
            <div className="min-w-0 pr-3">
              <p className="text-xs font-bold uppercase tracking-wider text-[#8E99A6] truncate">{item.itemName}</p>
              <h4 className="text-2xl sm:text-3xl font-black mt-1 text-[#55B685] tracking-tight">
                {item.quantity} <span className="text-xs font-bold text-[#8E99A6]">pcs</span>
              </h4>
            </div>
            <div className="w-12 h-12 rounded-xl bg-[#55B685]/15 border border-[#55B685]/30 text-[#55B685] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <PackageCheck className="w-6 h-6" />
            </div>
          </div>
        ))}
      </div>

      <LinenReconciliationModal
        isOpen={isReconModalOpen}
        onClose={() => setIsReconModalOpen(false)}
        onSuccess={() => {
          if (onRefresh) onRefresh();
        }}
      />
    </div>
  );
}
