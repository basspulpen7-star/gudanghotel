import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Item, Transaction } from '../types';
import { ArrowUpCircle, Search, Plus, Package, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

export function OutgoingGoods() {
  const [items, setItems] = useState<Item[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form state
  const [selectedItemId, setSelectedItemId] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [department, setDepartment] = useState('Housekeeping');
  const [notes, setNotes] = useState('');

  const departments = ['Housekeeping', 'Resto', 'Tekhnisi', 'Front Office', 'General'];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: itemsData } = await supabase.from('items').select('*').order('name');
    const { data: transData } = await supabase
      .from('transactions')
      .select('*, items(*)')
      .eq('type', 'OUT')
      .order('created_at', { ascending: false });

    if (itemsData) setItems(itemsData);
    if (transData) setTransactions(transData);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId || quantity <= 0) return;

    const item = items.find(i => i.id === selectedItemId);
    if (!item || item.current_stock < quantity) {
      alert('Stok tidak mencukupi!');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 1. Record transaction
    const { error: transError } = await supabase.from('transactions').insert([{
      item_id: selectedItemId,
      type: 'OUT',
      quantity,
      department,
      notes,
      user_id: user.id
    }]);

    if (transError) {
      alert('Error recording transaction: ' + transError.message);
      return;
    }

    // 2. Update stock
    await supabase.from('items').update({
      current_stock: item.current_stock - quantity
    }).eq('id', item.id);

    setIsModalOpen(false);
    setSelectedItemId('');
    setQuantity(0);
    setDepartment('Housekeeping');
    setNotes('');
    fetchData();
  };

  const selectedItem = items.find(i => i.id === selectedItemId);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-white">Barang Keluar</h2>
          <p className="text-brand-text-muted">Catat distribusi barang ke departemen/lantai</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-brand-accent hover:bg-blue-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-brand-accent/20"
        >
          <Plus className="w-5 h-5" />
          Catat Barang Keluar
        </button>
      </div>

      <div className="bg-brand-card rounded-2xl border border-brand-border overflow-hidden">
        <div className="p-6 border-b border-brand-border flex justify-between items-center bg-brand-dark/20">
          <h3 className="font-bold text-white flex items-center gap-2">
            <ArrowUpCircle className="w-5 h-5 text-purple-500" />
            Riwayat Distribusi
          </h3>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted" />
              <input type="text" placeholder="Cari distribusi..." className="pl-10 py-1.5 text-sm" />
            </div>
          </div>
        </div>
        
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-brand-dark/50 text-brand-text-muted text-xs font-bold uppercase tracking-wider">
              <th className="px-6 py-4">Tanggal</th>
              <th className="px-6 py-4">Nama Barang</th>
              <th className="px-6 py-4">Departemen</th>
              <th className="px-6 py-4">Jumlah</th>
              <th className="px-6 py-4">Satuan</th>
              <th className="px-6 py-4">Tujuan / Catatan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border">
            {loading ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-brand-text-muted">Loading...</td></tr>
            ) : transactions.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-brand-text-muted">Belum ada transaksi keluar.</td></tr>
            ) : transactions.map((tx) => (
              <tr key={tx.id} className="hover:bg-brand-dark/30 transition-colors">
                <td className="px-6 py-4 text-brand-text-muted font-mono text-sm">
                  {format(new Date(tx.created_at), 'dd MMM yyyy HH:mm')}
                </td>
                <td className="px-6 py-4 font-medium text-white">{tx.items?.name}</td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 bg-brand-dark rounded-md text-[10px] font-bold uppercase border border-brand-border">
                    {tx.department || 'General'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-purple-500 font-bold">-{tx.quantity}</span>
                </td>
                <td className="px-6 py-4 text-brand-text-muted">{tx.items?.unit}</td>
                <td className="px-6 py-4 text-brand-text-muted text-sm italic">{tx.notes || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-brand-card w-full max-w-md rounded-2xl border border-brand-border shadow-2xl animate-in zoom-in duration-200">
            <div className="p-6 border-b border-brand-border flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">Catat Barang Keluar</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-brand-text-muted hover:text-white">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-brand-text-muted mb-1">Pilih Barang</label>
                <select 
                  value={selectedItemId} 
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  className="w-full"
                  required
                >
                  <option value="">-- Pilih Barang --</option>
                  {items.map(item => (
                    <option key={item.id} value={item.id} disabled={item.current_stock === 0}>
                      {item.name} ({item.current_stock} {item.unit} tersedia)
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-brand-text-muted mb-1">Departemen</label>
                <select 
                  value={department} 
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full"
                  required
                >
                  {departments.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>

              {selectedItem && (
                <div className="p-3 bg-brand-dark/50 rounded-lg border border-brand-border flex items-center gap-3">
                  <Package className="w-5 h-5 text-brand-accent" />
                  <div>
                    <p className="text-xs text-brand-text-muted uppercase">Stok Tersedia</p>
                    <p className="font-bold text-white">{selectedItem.current_stock} {selectedItem.unit}</p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-brand-text-muted mb-1">Jumlah Keluar</label>
                <input 
                  type="number" 
                  value={quantity} 
                  onChange={(e) => setQuantity(Number(e.target.value))} 
                  className="w-full" 
                  min="1"
                  max={selectedItem?.current_stock}
                  required 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-text-muted mb-1">Tujuan / Departemen</label>
                <textarea 
                  value={notes} 
                  onChange={(e) => setNotes(e.target.value)} 
                  className="w-full h-24 resize-none"
                  placeholder="Contoh: Lantai 4 - Housekeeping"
                />
              </div>
              
              {selectedItem && quantity > selectedItem.current_stock && (
                <div className="flex items-center gap-2 text-red-500 text-xs">
                  <AlertCircle className="w-4 h-4" />
                  <span>Jumlah melebihi stok yang tersedia!</span>
                </div>
              )}

              <div className="pt-4 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-brand-dark border border-brand-border py-3 rounded-xl font-bold text-brand-text-muted hover:text-white transition-all"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  disabled={!selectedItem || quantity <= 0 || quantity > selectedItem.current_stock}
                  className="flex-1 bg-brand-accent hover:bg-blue-600 py-3 rounded-xl font-bold text-white transition-all shadow-lg shadow-brand-accent/20 disabled:opacity-50"
                >
                  Simpan Transaksi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
