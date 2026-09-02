import React, { useState } from 'react';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  X, 
  BedDouble, 
  AlertCircle, 
  CheckCircle2, 
  Search 
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ITEM_TYPES } from '../constants-linen';
import { LinenState, RoomItem, ItemType } from '../types-linen';

interface LinenRoomItemsProps {
  state: LinenState;
  onAdd: (data: Omit<RoomItem, 'id'>) => Promise<void>;
  onUpdate: (id: string, data: Partial<RoomItem>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function LinenRoomItems({ state, onAdd, onUpdate, onDelete }: LinenRoomItemsProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    itemName: ITEM_TYPES[0] as ItemType,
    quantity: 1,
    roomNumber: ''
  });

  const filteredItems = state.roomItems.filter(item => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return item.itemName.toLowerCase().includes(q) || item.roomNumber.toLowerCase().includes(q);
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.quantity <= 0) {
      setErrorMessage('Jumlah linen harus lebih dari 0');
      return;
    }
    if (!formData.roomNumber.trim()) {
      setErrorMessage('Nomor kamar wajib diisi');
      return;
    }

    try {
      if (editingId) {
        await onUpdate(editingId, formData);
        setEditingId(null);
      } else {
        await onAdd(formData);
      }

      setIsFormOpen(false);
      setFormData({
        date: format(new Date(), 'yyyy-MM-dd'),
        itemName: ITEM_TYPES[0],
        quantity: 1,
        roomNumber: ''
      });
      setErrorMessage(null);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Terjadi kesalahan saat menyimpan data');
    }
  };

  const startEdit = (item: RoomItem) => {
    setEditingId(item.id);
    setFormData({
      date: item.date,
      itemName: item.itemName,
      quantity: item.quantity,
      roomNumber: item.roomNumber
    });
    setIsFormOpen(true);
    setErrorMessage(null);
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-black text-[#F1F3F5] tracking-tight">Barang Terpasang di Kamar</h3>
          <p className="text-xs text-[#8E99A6] font-medium">Catatan linen yang saat ini terpasang di kamar hotel</p>
        </div>
        <button 
          onClick={() => {
            setIsFormOpen(true);
            setEditingId(null);
            setFormData({
              date: format(new Date(), 'yyyy-MM-dd'),
              itemName: ITEM_TYPES[0],
              quantity: 1,
              roomNumber: ''
            });
            setErrorMessage(null);
          }}
          className="bg-gradient-to-r from-[#E6B85C] to-[#C89B3C] text-[#171A1F] px-4 py-2.5 rounded-xl flex items-center gap-2 font-black text-xs hover:brightness-110 transition-all shadow-md cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Pemasangan</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8E99A6]" />
        <input 
          type="text"
          placeholder="Cari nama linen atau nomor kamar..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-[#252B34] border border-[#343B46] rounded-xl text-xs text-[#F1F3F5] placeholder:text-[#6F7985] focus:outline-none focus:border-[#C89B3C]"
        />
      </div>

      {/* Form Modal / Inline Box */}
      {isFormOpen && (
        <div className="p-5 sm:p-6 rounded-2xl border border-[#C89B3C]/40 bg-[#252B34] shadow-[0_8px_32px_rgba(0,0,0,0.3)] animate-in fade-in duration-150">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#343B46]">
            <div className="flex items-center gap-2">
              <BedDouble className="w-5 h-5 text-[#E0B85A]" />
              <h4 className="text-sm font-black text-[#F1F3F5]">
                {editingId ? 'Edit Data Pemasangan' : 'Input Pemasangan Linen di Kamar'}
              </h4>
            </div>
            <button 
              onClick={() => setIsFormOpen(false)}
              className="p-1 text-[#8E99A6] hover:text-[#F1F3F5] rounded-lg hover:bg-[#20252D]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {errorMessage && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-400 text-xs font-bold flex items-center gap-2 mb-4">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
              <label className="text-xs font-bold text-[#8E99A6] block mb-1">Nama Barang</label>
              <select
                value={formData.itemName}
                onChange={e => setFormData({ ...formData, itemName: e.target.value as ItemType })}
                className="w-full px-3 py-2 bg-[#20252D] border border-[#343B46] rounded-xl text-xs text-[#F1F3F5] font-semibold focus:outline-none focus:border-[#C89B3C]"
              >
                {ITEM_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
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
              <label className="text-xs font-bold text-[#8E99A6] block mb-1">Nomor Kamar</label>
              <input 
                type="text"
                required
                placeholder="Contoh: 101, 205..."
                value={formData.roomNumber}
                onChange={e => setFormData({ ...formData, roomNumber: e.target.value })}
                className="w-full px-3 py-2 bg-[#20252D] border border-[#343B46] rounded-xl text-xs text-[#F1F3F5] focus:outline-none focus:border-[#C89B3C]"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-4 pt-2 flex items-center justify-end gap-2">
              <button 
                type="button" 
                onClick={() => setIsFormOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-[#8E99A6] hover:bg-[#20252D] border border-[#343B46]"
              >
                Batal
              </button>
              <button 
                type="submit"
                className="px-5 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-[#E6B85C] to-[#C89B3C] text-[#171A1F] hover:brightness-110 shadow-md cursor-pointer"
              >
                {editingId ? 'Simpan Perubahan' : 'Simpan Pemasangan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table Desktop / Cards Mobile */}
      <div className="rounded-2xl border border-[#343B46] bg-[#252B34] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
        <div className="overflow-x-auto">
          <table className="hidden md:table w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#343B46] bg-[#20252D]">
                <th className="px-5 py-3.5 text-xs font-bold text-[#8E99A6]">Tanggal</th>
                <th className="px-5 py-3.5 text-xs font-bold text-[#8E99A6]">Nama Barang</th>
                <th className="px-5 py-3.5 text-xs font-bold text-[#8E99A6]">Jumlah</th>
                <th className="px-5 py-3.5 text-xs font-bold text-[#8E99A6]">Nomor Kamar</th>
                <th className="px-5 py-3.5 text-xs font-bold text-[#8E99A6] text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#343B46]">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-xs text-[#8E99A6] italic">
                    Belum ada data barang terpasang
                  </td>
                </tr>
              ) : (
                filteredItems.map(item => (
                  <tr key={item.id} className="hover:bg-[#2A303A] transition-colors">
                    <td className="px-5 py-3.5 text-xs text-[#D8DEE6]">
                      {format(parseISO(item.date), 'dd MMM yyyy')}
                    </td>
                    <td className="px-5 py-3.5 text-xs font-bold text-[#F1F3F5]">
                      {item.itemName}
                    </td>
                    <td className="px-5 py-3.5 text-xs">
                      <span className="px-2.5 py-0.5 rounded-md font-black bg-[#C89B3C]/15 text-[#E0B85A] border border-[#C89B3C]/30">
                        {item.quantity} pcs
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs font-bold text-[#60A5FA]">
                      Kamar {item.roomNumber}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button 
                          onClick={() => startEdit(item)}
                          className="p-1.5 rounded-lg text-[#8E99A6] hover:text-[#60A5FA] hover:bg-[#20252D]"
                          title="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => setDeleteConfirmId(item.id)}
                          className="p-1.5 rounded-lg text-[#8E99A6] hover:text-rose-400 hover:bg-[#20252D]"
                          title="Hapus"
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
              Belum ada data barang terpasang
            </div>
          ) : (
            filteredItems.map(item => (
              <div key={item.id} className="p-4 space-y-2.5">
                <div className="flex justify-between items-start">
                  <div>
                    <h5 className="text-xs font-bold text-[#F1F3F5]">{item.itemName}</h5>
                    <p className="text-[11px] text-[#8E99A6]">
                      {format(parseISO(item.date), 'dd MMM yyyy')} • <span className="text-[#60A5FA] font-bold">Kamar {item.roomNumber}</span>
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded-md font-black text-xs bg-[#C89B3C]/15 text-[#E0B85A] border border-[#C89B3C]/30">
                    {item.quantity} pcs
                  </span>
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#343B46]">
                  <button 
                    onClick={() => startEdit(item)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-[#60A5FA] bg-blue-500/10 border border-blue-500/20"
                  >
                    Edit
                  </button>
                  <button 
                    onClick={() => setDeleteConfirmId(item.id)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20"
                  >
                    Hapus
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-[#252B34] border border-[#343B46] p-5 rounded-2xl max-w-sm w-full shadow-2xl space-y-4">
            <h4 className="text-sm font-black text-[#F1F3F5]">Konfirmasi Hapus</h4>
            <p className="text-xs text-[#8E99A6]">
              Apakah Anda yakin ingin menghapus data pemasangan linen ini?
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
