import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, 
  RotateCw, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowLeftRight, 
  Sparkles, 
  Check, 
  Building2,
  PackageCheck,
  HelpCircle
} from 'lucide-react';
import { laundrySyncService, ReconciliationItem } from '../services/laundrySyncService';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

interface LinenReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function LinenReconciliationModal({
  isOpen,
  onClose,
  onSuccess
}: LinenReconciliationModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [items, setItems] = useState<ReconciliationItem[]>([]);
  const [decisions, setDecisions] = useState<Record<string, 'gudang' | 'linen'>>({});
  const [showAllItems, setShowAllItems] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const data = await laundrySyncService.getReconciliationData();
      setItems(data);

      // Pre-populate decisions for items with diff
      const initialDecisions: Record<string, 'gudang' | 'linen'> = {};
      data.forEach(item => {
        if (item.diff !== 0) {
          // Default choice: no preset, user must consciously pick
        }
      });
      setDecisions(initialDecisions);
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `Gagal memuat data rekonsiliasi: ${err?.message || err}`
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  if (!isOpen) return null;

  const diffItems = items.filter(i => i.diff !== 0);
  const matchedItems = items.filter(i => i.diff === 0);

  const handleSelectDecision = (itemName: string, choice: 'gudang' | 'linen') => {
    setDecisions(prev => ({
      ...prev,
      [itemName]: choice
    }));
  };

  const handleBulkSelect = (choice: 'gudang' | 'linen') => {
    const updated: Record<string, 'gudang' | 'linen'> = {};
    diffItems.forEach(item => {
      updated[item.linenItemName] = choice;
    });
    setDecisions(updated);
  };

  const handleApply = async () => {
    const decisionList = diffItems
      .filter(item => decisions[item.linenItemName])
      .map(item => ({
        linenItemName: item.linenItemName,
        gudangAliaItemId: item.gudangAliaItemId,
        chosenSource: decisions[item.linenItemName],
        gudangAliaStock: item.gudangAliaStock,
        linenStock: item.linenStock
      }));

    if (decisionList.length === 0) {
      setStatusMessage({
        type: 'error',
        text: 'Pilih sumber stok (Gudang Alia atau Linen) untuk item yang memiliki selisih.'
      });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const res = await laundrySyncService.applyReconciliation(
        decisionList,
        user?.id || 'system-reconciliation'
      );

      if (res.errors.length > 0) {
        setStatusMessage({
          type: 'error',
          text: `Sebagian rekonsiliasi gagal (${res.errors.length} error): ${res.errors[0]}`
        });
      } else {
        setStatusMessage({
          type: 'success',
          text: `Berhasil merekonsiliasi ${res.successCount} item!`
        });
        if (onSuccess) {
          onSuccess();
        }
        setTimeout(() => {
          onClose();
        }, 1200);
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `Gagal menerapkan rekonsiliasi: ${err?.message || err}`
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCount = diffItems.filter(i => decisions[i.linenItemName]).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-[#1E232B] border border-[#343B46] w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden my-8 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-[#343B46] flex items-center justify-between bg-[#252B34]/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-[#F1F3F5] tracking-tight">
                Sinkron Ulang Stok Laundry &amp; Linen
              </h3>
              <p className="text-xs text-[#8E99A6]">
                Bandingkan dan selaraskan stok Gudang Alia dengan Stok Bersih Modul Linen
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={loading || isSubmitting}
              className="p-2 text-[#8E99A6] hover:text-white hover:bg-[#343B46] rounded-lg transition-colors"
              title="Muat Ulang Data"
            >
              <RotateCw className={cn("w-4 h-4", loading && "animate-spin text-[#55B685]")} />
            </button>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="p-2 text-[#8E99A6] hover:text-white hover:bg-[#343B46] rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status Banner */}
        {statusMessage && (
          <div className={cn(
            "p-3.5 px-6 text-xs font-semibold flex items-center gap-2 border-b shrink-0",
            statusMessage.type === 'success' 
              ? "bg-[#55B685]/15 text-[#55B685] border-[#55B685]/30" 
              : "bg-rose-500/15 text-rose-400 border-rose-500/30"
          )}>
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
          {loading ? (
            <div className="py-16 text-center">
              <RotateCw className="w-8 h-8 text-[#55B685] animate-spin mx-auto mb-3" />
              <p className="text-sm font-semibold text-[#8E99A6]">Memeriksa stok Gudang Alia &amp; Linen...</p>
            </div>
          ) : (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl border border-[#343B46] bg-[#252B34]">
                  <p className="text-[11px] font-bold text-[#8E99A6] uppercase tracking-wider">Total Item</p>
                  <p className="text-xl font-black text-[#F1F3F5] mt-0.5">{items.length}</p>
                </div>
                <div className="p-3.5 rounded-xl border border-[#55B685]/30 bg-[#55B685]/10">
                  <p className="text-[11px] font-bold text-[#55B685] uppercase tracking-wider">Stok Cocok</p>
                  <p className="text-xl font-black text-[#55B685] mt-0.5">{matchedItems.length}</p>
                </div>
                <div className={cn(
                  "p-3.5 rounded-xl border",
                  diffItems.length > 0
                    ? "border-amber-500/30 bg-amber-500/10"
                    : "border-[#343B46] bg-[#252B34]"
                )}>
                  <p className={cn(
                    "text-[11px] font-bold uppercase tracking-wider",
                    diffItems.length > 0 ? "text-amber-400" : "text-[#8E99A6]"
                  )}>
                    Ada Selisih
                  </p>
                  <p className={cn(
                    "text-xl font-black mt-0.5",
                    diffItems.length > 0 ? "text-amber-400" : "#F1F3F5"
                  )}>
                    {diffItems.length}
                  </p>
                </div>
              </div>

              {/* Difference List Section */}
              {diffItems.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-black text-[#F1F3F5] flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        Ditemukan {diffItems.length} Item Berselisih
                      </h4>
                      <p className="text-xs text-[#8E99A6]">
                        Tentukan angka stok yang benar untuk setiap item berikut:
                      </p>
                    </div>

                    {/* Bulk Action Buttons */}
                    <div className="flex items-center gap-1.5 self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => handleBulkSelect('gudang')}
                        className="px-2.5 py-1 text-[11px] font-bold bg-[#343B46] hover:bg-[#404956] text-[#F1F3F5] rounded-lg transition-colors"
                      >
                        Semua Gudang Alia
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBulkSelect('linen')}
                        className="px-2.5 py-1 text-[11px] font-bold bg-[#55B685]/20 hover:bg-[#55B685]/30 text-[#55B685] rounded-lg transition-colors border border-[#55B685]/30"
                      >
                        Semua Linen
                      </button>
                    </div>
                  </div>

                  {/* Items list with comparison */}
                  <div className="space-y-3">
                    {diffItems.map(item => {
                      const selected = decisions[item.linenItemName];
                      return (
                        <div 
                          key={item.linenItemName}
                          className="p-4 rounded-xl border border-[#343B46] bg-[#252B34] space-y-3"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                            <span className="text-sm font-black text-[#F1F3F5]">
                              {item.linenItemName}
                            </span>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400 self-start sm:self-auto">
                              Selisih: {item.diff > 0 ? `+${item.diff}` : item.diff} pcs
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {/* Option 1: Gudang Alia */}
                            <button
                              type="button"
                              onClick={() => handleSelectDecision(item.linenItemName, 'gudang')}
                              className={cn(
                                "p-3 rounded-xl border text-left transition-all flex items-center justify-between",
                                selected === 'gudang'
                                  ? "border-blue-500 bg-blue-500/15 shadow-sm"
                                  : "border-[#343B46] bg-[#1E232B] hover:border-blue-500/40"
                              )}
                            >
                              <div>
                                <p className="text-[11px] font-bold text-[#8E99A6] flex items-center gap-1.5">
                                  <Building2 className="w-3.5 h-3.5 text-blue-400" />
                                  Pakai Angka Gudang Alia
                                </p>
                                <p className="text-lg font-black text-[#F1F3F5] mt-0.5">
                                  {item.gudangAliaStock} <span className="text-xs font-medium text-[#8E99A6]">pcs</span>
                                </p>
                              </div>
                              <div className={cn(
                                "w-6 h-6 rounded-full flex items-center justify-center border",
                                selected === 'gudang'
                                  ? "bg-blue-500 border-blue-400 text-white"
                                  : "border-[#343B46] text-transparent"
                              )}>
                                <Check className="w-3.5 h-3.5" />
                              </div>
                            </button>

                            {/* Option 2: Linen */}
                            <button
                              type="button"
                              onClick={() => handleSelectDecision(item.linenItemName, 'linen')}
                              className={cn(
                                "p-3 rounded-xl border text-left transition-all flex items-center justify-between",
                                selected === 'linen'
                                  ? "border-[#55B685] bg-[#55B685]/15 shadow-sm"
                                  : "border-[#343B46] bg-[#1E232B] hover:border-[#55B685]/40"
                              )}
                            >
                              <div>
                                <p className="text-[11px] font-bold text-[#8E99A6] flex items-center gap-1.5">
                                  <PackageCheck className="w-3.5 h-3.5 text-[#55B685]" />
                                  Pakai Angka Linen Bersih
                                </p>
                                <p className="text-lg font-black text-[#55B685] mt-0.5">
                                  {item.linenStock} <span className="text-xs font-medium text-[#8E99A6]">pcs</span>
                                </p>
                              </div>
                              <div className={cn(
                                "w-6 h-6 rounded-full flex items-center justify-center border",
                                selected === 'linen'
                                  ? "bg-[#55B685] border-[#55B685] text-white"
                                  : "border-[#343B46] text-transparent"
                              )}>
                                <Check className="w-3.5 h-3.5" />
                              </div>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* No Difference State */
                <div className="p-6 rounded-2xl border border-[#55B685]/30 bg-[#55B685]/10 text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-[#55B685]/20 text-[#55B685] flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h4 className="text-base font-black text-[#55B685]">
                    Semua Stok Laundry &amp; Linen Sudah Sinkron!
                  </h4>
                  <p className="text-xs text-[#8E99A6] max-w-md mx-auto">
                    Tidak ditemukan selisih antara saldo item Laundry di Gudang Alia dan Stok Bersih Modul Linen.
                  </p>
                </div>
              )}

              {/* Matched Items Toggle */}
              {matchedItems.length > 0 && (
                <div className="pt-2 border-t border-[#343B46]">
                  <button
                    type="button"
                    onClick={() => setShowAllItems(prev => !prev)}
                    className="text-xs font-bold text-[#8E99A6] hover:text-[#F1F3F5] transition-colors flex items-center gap-1.5"
                  >
                    <span>{showAllItems ? 'Sembunyikan' : 'Tampilkan'} {matchedItems.length} item yang sudah cocok</span>
                  </button>

                  {showAllItems && (
                    <div className="mt-3 divide-y divide-[#343B46] border border-[#343B46] rounded-xl overflow-hidden bg-[#252B34]">
                      {matchedItems.map(item => (
                        <div key={item.linenItemName} className="p-3 px-4 flex items-center justify-between text-xs">
                          <span className="font-semibold text-[#F1F3F5]">{item.linenItemName}</span>
                          <div className="flex items-center gap-4 text-[#8E99A6]">
                            <span>Gudang Alia: <strong className="text-[#F1F3F5]">{item.gudangAliaStock} pcs</strong></span>
                            <span>Linen: <strong className="text-[#55B685]">{item.linenStock} pcs</strong></span>
                            <span className="text-[#55B685] font-bold flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" /> Cocok
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-[#343B46] bg-[#252B34]/60 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 text-xs font-bold text-[#8E99A6] hover:text-white hover:bg-[#343B46] rounded-xl transition-colors"
          >
            Tutup
          </button>

          {diffItems.length > 0 && (
            <button
              type="button"
              onClick={handleApply}
              disabled={isSubmitting || selectedCount === 0}
              className="px-5 py-2.5 text-xs font-black bg-[#55B685] hover:bg-[#48a375] text-[#12161A] rounded-xl transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  <span>Menerapkan...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Terapkan Rekonsiliasi ({selectedCount} Dipilih)</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
