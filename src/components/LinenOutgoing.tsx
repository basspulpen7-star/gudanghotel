import React, { useState, useMemo } from 'react';
import { 
  ArrowUpCircle, 
  Edit2, 
  Trash2, 
  X, 
  AlertCircle, 
  Plus 
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ITEM_TYPES } from '../constants-linen';
import { LinenState, OutgoingItem, ItemType } from '../types-linen';
import { calculateCleanStockMap } from '../lib/linenUtils';

interface LinenOutgoingProps {
  state: LinenState;
  onAdd: (data: Omit<OutgoingItem, 'id'>) => Promise<void>;
  onUpdate: (id: string, data: Partial<OutgoingItem>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function LinenOutgoing({ state, onAdd, onUpdate, onDelete }: LinenOutgoingProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    itemName: ITEM_TYPES[0] as ItemType,
    quantity: 1,
    destination: 'Laundry' as 'Laundry' | 'Afkir' | 'Diambil HK',
    description: ''
  });

  const cleanStockMap = useMemo(() => calculateCleanStockMap(state), [state]);
  const filteredItems = useMemo(() => state.outgoingItems || [], [state.outgoingItems]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.quantity <= 0) {
      setErrorMessage('Jumlah harus lebih dari 0');
      return;
    }

    const currentStock = cleanStockMap[formData.itemName] || 0;
    let availableStock = currentStock;
    if (editingId) {
      const oldItem = state.outgoingItems.find(oi => oi.id === editingId);
      if (oldItem && oldItem.itemName === formData.itemName) {
        availableStock += oldItem.quantity;
      }
    }

    if (formData.quantity > availableStock) {
      setErrorMessage(`Stok bersih tidak mencukupi! Stok tersedia: ${availableStock} pcs`);
      return;
    }

    try {
      if (editingId) {
        await onUpdate(editingId, formData);
        setEditingId(null);
      } else {
        await onAdd(formData);
      }

      setFormData({
        date: format(new Date(), 'yyyy-MM-dd'),
        itemName: ITEM_TYPES[0],
        quantity: 1,
        destination: 'Laundry',
        description: ''
      });
      setErrorMessage(null);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Gagal menyimpan barang keluar');
    }
  };

  const handleEdit = (item: OutgoingItem) => {
    setEditingId(item.id);
    setFormData({
      date: item.date,
      itemName: item.itemName as ItemType,
      quantity: item.quantity,
      destination: (item.destination === 'Afkir' ? 'Afkir' : item.destination === 'Diambil HK' ? 'Diambil HK' : 'Laundry') as 'Laundry' | 'Afkir' | 'Diambil HK',
      description: item.description || ''
    });
    setErrorMessage(null);
  };

  return (
    <div className="space-y-6 font-sans">
      <div>
        <h3 className="text-xl font-black text-[#F1F3F5] tracking-tight">Barang Keluar</h3>
        <p className="text-xs text-[#8E99A6] font-medium">
          Pengiriman linen kotor ke Laundry atau pencatatan linen Afkir (rusak/tidak layak)
        </p>
      </div>

      {/* Form Card */}
      <div className="p-5 sm:p-6 rounded-2xl border border-[#343B46] bg-[#252B34] shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#343B46]">
          <div className="flex items-center gap-2">
            <ArrowUpCircle className="w-5 h-5 text-[#FB923C]" />
            <h4 className="text-sm font-black text-[#F1F3F5]">
              {editingId ? 'Edit Barang Keluar' : 'Input Pengeluaran Linen'}
            </h4>
          </div>
          {editingId && (
            <button 
              onClick={() => {
                setEditingId(null);
                setFormData({
                  date: format(new Date(), 'yyyy-MM-dd'),
                  itemName: ITEM_TYPES[0],
                  quantity: 1,
                  destination: 'Laundry',
                  description: ''
                });
              }}
              className="text-xs font-bold text-[#8E99A6] hover:text-[#F1F3F5] flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" /> Batal Edit
            </button>
          )}
        </div>

        {errorMessage && (
          <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-400 text-xs font-bold flex items-center gap-2 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-bold text-[#8E99A6] block mb-1">Tanggal</label>
            <input 
              type="date"
              required
              value={formData.date}
              onChange={e => setFormData({ ...formData, date: e.target.value })}
              className="w-full px-3 py-2 bg-[#20252D] border border-[#343B46] rounded-xl text-xs text-[#F1F3F5] focus:outline-none focus:border-[#C89B3C]"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-bold text-[#8E99A6]">Nama Barang</label>
              <span className="text-[10px] text-[#55B685] font-bold">
                Tersedia: {cleanStockMap[formData.itemName] || 0} pcs
              </span>
            </div>
            <select
              value={formData.itemName}
              onChange={e => setFormData({ ...formData, itemName: e.target.value as ItemType })}
              className="w-full px-3 py-2 bg-[#20252D] border border-[#343B46] rounded-xl text-xs text-[#F1F3F5] font-semibold focus:outline-none focus:border-[#C89B3C]"
            >
              {ITEM_TYPES.map(t => (
                <option key={t} value={t}>
                  {t} (Stok: {cleanStockMap[t] || 0})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-[#8E99A6] block mb-1">Jumlah (pcs)</label>
            <input 
              type="number"
              required
              min="1"
              value={formData.quantity}
              onChange={e => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 bg-[#20252D] border border-[#343B46] rounded-xl text-xs text-[#F1F3F5] font-bold focus:outline-none focus:border-[#C89B3C]"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[#8E99A6] block mb-1">Tujuan Pengeluaran</label>
            <div className="flex gap-2 p-1 bg-[#20252D] rounded-xl border border-[#343B46]">
              {(['Laundry', 'Afkir', 'Diambil HK'] as const).map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setFormData({ ...formData, destination: d })}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    formData.destination === d
                      ? (d === 'Laundry' ? 'bg-[#FB923C] text-[#171A1F]' : d === 'Afkir' ? 'bg-rose-500 text-white' : 'bg-blue-500 text-white')
                      : 'text-[#8E99A6] hover:text-[#F1F3F5]'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-bold text-[#8E99A6] block mb-1">Keterangan (Opsional)</label>
            <input 
              type="text"
              placeholder="Catatan tujuan atau alasan afkir..."
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 bg-[#20252D] border border-[#343B46] rounded-xl text-xs text-[#F1F3F5] placeholder:text-[#6F7985] focus:outline-none focus:border-[#C89B3C]"
            />
          </div>

          <div className="md:col-span-3 pt-2">
            <button 
              type="submit"
              className="w-full py-2.5 bg-gradient-to-r from-[#E6B85C] to-[#C89B3C] text-[#171A1F] hover:brightness-110 rounded-xl text-xs font-black shadow-md cursor-pointer transition-all flex items-center justify-center gap-2"
            >
              <ArrowUpCircle className="w-4 h-4" />
              <span>{editingId ? 'Update Barang Keluar' : 'Simpan Barang Keluar'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Outgoing Table */}
      <div className="rounded-2xl border border-[#343B46] bg-[#252B34] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
        <div className="overflow-x-auto">
          <table className="hidden md:table w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#343B46] bg-[#20252D]">
                <th className="px-5 py-3.5 text-xs font-bold text-[#8E99A6]">Tanggal</th>
                <th className="px-5 py-3.5 text-xs font-bold text-[#8E99A6]">Nama Barang</th>
                <th className="px-5 py-3.5 text-xs font-bold text-[#8E99A6]">Jumlah</th>
                <th className="px-5 py-3.5 text-xs font-bold text-[#8E99A6]">Tujuan</th>
                <th className="px-5 py-3.5 text-xs font-bold text-[#8E99A6]">Keterangan</th>
                <th className="px-5 py-3.5 text-xs font-bold text-[#8E99A6] text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#343B46]">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-xs text-[#8E99A6] italic">
                    Belum ada data barang keluar
                  </td>
                </tr>
              ) : (
                filteredItems.map(item => (
                  <tr key={item.id} className="hover:bg-[#2A303A] transition-colors">
                    <td className="px-5 py-3.5 text-xs text-[#D8DEE6]">{format(parseISO(item.date), 'dd MMM yyyy')}</td>
                    <td className="px-5 py-3.5 text-xs font-bold text-[#F1F3F5]">{item.itemName}</td>
                    <td className="px-5 py-3.5 text-xs">
                      <span className={`px-2.5 py-0.5 rounded-md font-black text-xs border ${
                        item.destination === 'Afkir' 
                          ? 'bg-rose-500/15 text-[#F87171] border-rose-500/30' 
                          : item.destination === 'Diambil HK'
                          ? 'bg-blue-500/15 text-[#60A5FA] border-blue-500/30'
                          : 'bg-orange-500/15 text-[#FB923C] border-orange-500/30'
                      }`}>
                        {item.quantity} pcs
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs">
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                        item.destination === 'Afkir' ? 'bg-rose-500/15 text-[#F87171]' : item.destination === 'Diambil HK' ? 'bg-blue-500/15 text-[#60A5FA]' : 'bg-orange-500/15 text-[#FB923C]'
                      }`}>
                        {item.destination}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-[#8E99A6]">{item.description || '-'}</td>
                    <td className="px-5 py-3.5 text-xs text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button 
                          onClick={() => handleEdit(item)}
                          className="p-1.5 rounded-lg text-[#8E99A6] hover:text-[#60A5FA] hover:bg-[#20252D]"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => setDeleteConfirmId(item.id)}
                          className="p-1.5 rounded-lg text-[#8E99A6] hover:text-rose-400 hover:bg-[#20252D]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="md:hidden divide-y divide-[#343B46]">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#8E99A6] italic">
              Belum ada data barang keluar
            </div>
          ) : (
            filteredItems.map(item => (
              <div key={item.id} className="p-4 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <h5 className="text-xs font-bold text-[#F1F3F5]">{item.itemName}</h5>
                    <p className="text-[11px] text-[#8E99A6]">{format(parseISO(item.date), 'dd MMM yyyy')}</p>
                    {item.description && <p className="text-[10px] text-[#8E99A6] italic mt-0.5">{item.description}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`px-2 py-0.5 rounded-md font-black text-xs border ${
                      item.destination === 'Afkir' ? 'bg-rose-500/15 text-[#F87171] border-rose-500/30' : item.destination === 'Diambil HK' ? 'bg-blue-500/15 text-[#60A5FA] border-blue-500/30' : 'bg-orange-500/15 text-[#FB923C] border-orange-500/30'
                    }`}>
                      {item.quantity} pcs
                    </span>
                    <span className={`text-[10px] uppercase font-bold ${item.destination === 'Afkir' ? 'text-rose-400' : item.destination === 'Diambil HK' ? 'text-blue-400' : 'text-orange-400'}`}>
                      {item.destination}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#343B46]">
                  <button 
                    onClick={() => handleEdit(item)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-[#60A5FA] bg-blue-500/10"
                  >
                    Edit
                  </button>
                  <button 
                    onClick={() => setDeleteConfirmId(item.id)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-rose-400 bg-rose-500/10"
                  >
                    Hapus
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Delete Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-[#252B34] border border-[#343B46] p-5 rounded-2xl max-w-sm w-full shadow-2xl space-y-4">
            <h4 className="text-sm font-black text-[#F1F3F5]">Konfirmasi Hapus</h4>
            <p className="text-xs text-[#8E99A6]">
              Hapus data barang keluar ini? Stok bersih akan dikembalikan.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button 
                onClick={() => setDeleteConfirmId(null)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-[#8E99A6] hover:bg-[#20252D]"
              >
                Batal
              </button>
              <button 
                onClick={async () => {
                  if (deleteConfirmId) {
                    await onDelete(deleteConfirmId);
                    setDeleteConfirmId(null);
                  }
                }}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs"
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
