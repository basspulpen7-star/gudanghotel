import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Item, Transaction } from '../types';
import { ArrowUpCircle, Search, Plus, Package, AlertCircle, Activity, Edit2, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

interface OutgoingGoodsProps {
  globalSearch?: string;
}

export function OutgoingGoods({ globalSearch = '' }: OutgoingGoodsProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Month & Year Filter
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  // Sync local search with global search
  useEffect(() => {
    if (globalSearch) {
      setSearchTerm(globalSearch);
    }
  }, [globalSearch]);

  // Form state
  const [selectedItemId, setSelectedItemId] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [department, setDepartment] = useState('Housekeeping');
  const [notes, setNotes] = useState('');

  const departments = ['Housekeeping', 'Resto', 'Tekhnisi', 'Front Office', 'General'];

  const [dbStatus, setDbStatus] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    fetchData();
    checkDatabase();
  }, []);

  const checkDatabase = async () => {
    try {
      const { error } = await supabase.from('transactions').select('department, notes').limit(1);
      if (error) {
        if (error.message.includes('column "department" does not exist') || error.message.includes('column "notes" does not exist')) {
          setDbStatus({ ok: false, message: 'Kolom "department" atau "notes" belum ada di tabel transactions. Silakan jalankan SQL update.' });
        } else if (error.message.includes('does not exist') || error.message.includes('relation') || error.code === '42P01') {
          setDbStatus({ ok: false, message: 'Tabel "transactions" belum dibuat di Supabase.' });
        } else {
          setDbStatus({ ok: false, message: 'Error database: ' + error.message });
        }
      } else {
        setDbStatus({ ok: true, message: 'Database terhubung dengan benar.' });
      }
    } catch (err) {
      setDbStatus({ ok: false, message: 'Gagal mengecek status database.' });
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: itemsData } = await supabase.from('items').select('*').order('name');
      const { data: transData } = await supabase
        .from('transactions')
        .select('*, items(*)')
        .eq('type', 'OUT')
        .order('created_at', { ascending: false });

      if (itemsData) setItems(itemsData);
      if (transData) setTransactions(transData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId || quantity <= 0) return;

    const item = items.find(i => i.id === selectedItemId);
    if (!item) return;

    // Check stock availability
    const oldQuantity = editingTransaction?.quantity || 0;
    const availableStock = item.current_stock + oldQuantity;
    if (availableStock < quantity) {
      alert('Stok tidak mencukupi!');
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsSubmitting(false);
        return;
      }

      if (editingTransaction) {
        // 1. Update transaction
        const { error: transError } = await supabase.from('transactions').update({
          item_id: selectedItemId,
          quantity,
          department,
          notes
        }).eq('id', editingTransaction.id);

        if (transError) throw transError;

        // 2. Update stock (revert old, subtract new)
        const diff = quantity - editingTransaction.quantity;
        const { error: updateError } = await supabase.from('items').update({
          current_stock: item.current_stock - diff
        }).eq('id', item.id);
        if (updateError) throw updateError;
      } else {
        // 1. Record transaction
        const { error: transError } = await supabase.from('transactions').insert([{
          id: crypto.randomUUID(),
          item_id: selectedItemId,
          type: 'OUT',
          quantity,
          department,
          notes,
          user_id: user.id
        }]);

        if (transError) throw transError;

        // 2. Update stock
        const { error: updateError } = await supabase.from('items').update({
          current_stock: item.current_stock - quantity
        }).eq('id', item.id);
        if (updateError) throw updateError;
      }

      setIsModalOpen(false);
      setEditingTransaction(null);
      resetForm();
      fetchData();
    } catch (error: any) {
      console.error('Submit error:', error);
      alert('Gagal menyimpan transaksi: ' + (error.message || 'Error tidak diketahui'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedItemId('');
    setQuantity(0);
    setDepartment('Housekeeping');
    setNotes('');
  };

  const handleEdit = (tx: Transaction) => {
    setEditingTransaction(tx);
    setSelectedItemId(tx.item_id);
    setQuantity(tx.quantity);
    setDepartment(tx.department || 'Housekeeping');
    setNotes(tx.notes || '');
    setIsModalOpen(true);
  };

  const handleDelete = async () => {
    if (!transactionToDelete) return;
    try {
      // 1. Delete transaction
      const { error: deleteError } = await supabase.from('transactions').delete().eq('id', transactionToDelete.id);
      if (deleteError) throw deleteError;

      // 2. Revert stock
      const item = items.find(i => i.id === transactionToDelete.item_id);
      if (item) {
        const { error: updateError } = await supabase.from('items').update({
          current_stock: item.current_stock + transactionToDelete.quantity
        }).eq('id', item.id);
        if (updateError) throw updateError;
      }

      setTransactionToDelete(null);
      fetchData();
    } catch (error: any) {
      console.error('Delete error:', error);
      alert('Gagal menghapus transaksi: ' + error.message);
    }
  };

  const selectedItem = items.find(i => i.id === selectedItemId);

  const filteredTransactions = transactions.filter(tx => {
    const txDate = new Date(tx.created_at);
    const matchesMonth = txDate.getMonth() === selectedMonth && txDate.getFullYear() === selectedYear;
    const matchesSearch = tx.items?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         tx.department?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         tx.notes?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesMonth && matchesSearch;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-20 md:pb-6 font-sans">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 md:p-6 rounded-2xl border border-gray-200/90 shadow-sm">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">Barang Keluar</h2>
          <p className="text-xs md:text-sm text-gray-500 mt-0.5 font-medium">Catat distribusi barang ke departemen / operasional</p>
          {dbStatus && !dbStatus.ok && (
            <p className="text-xs text-red-600 mt-1 flex items-center gap-1 font-medium">
              <AlertCircle className="w-3.5 h-3.5" />
              {dbStatus.message}
            </p>
          )}
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button 
            onClick={fetchData}
            className="flex-1 md:flex-none bg-gray-100 text-gray-700 hover:text-gray-900 px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-200 transition-all flex items-center justify-center gap-2 text-xs font-bold min-h-[44px]"
          >
            <Activity className="w-4 h-4 text-amber-600" />
            <span>Refresh</span>
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex-1 md:flex-none bg-[#E65C00] hover:bg-[#CF5300] text-white px-5 py-2.5 rounded-xl font-extrabold flex items-center justify-center gap-2 transition-all shadow-sm shadow-orange-500/20 text-xs sm:text-sm min-h-[44px]"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Catat Barang Keluar</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200/90 shadow-sm overflow-hidden">
        <div className="p-4 md:p-5 border-b border-gray-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-50/80">
          <h3 className="font-black text-gray-900 flex items-center gap-2 text-sm md:text-base">
            <ArrowUpCircle className="w-5 h-5 text-amber-600" />
            Riwayat Distribusi
          </h3>
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Cari distribusi..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full md:w-60 pl-9 pr-3 py-2 text-xs bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500 transition-colors" 
              />
            </div>
            <div className="flex items-center gap-2">
              <select 
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="bg-white border border-gray-200 text-gray-800 text-xs font-semibold rounded-xl px-3 py-2 outline-none focus:border-amber-500"
              >
                {months.map((month, index) => (
                  <option key={index} value={index}>{month}</option>
                ))}
              </select>
              <select 
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="bg-white border border-gray-200 text-gray-800 text-xs font-semibold rounded-xl px-3 py-2 outline-none focus:border-amber-500"
              >
                {years.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px] text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-[10px] font-extrabold uppercase tracking-wider border-b border-gray-200">
                <th className="px-5 py-3.5">Tanggal</th>
                <th className="px-5 py-3.5">Nama Barang</th>
                <th className="px-5 py-3.5">Departemen</th>
                <th className="px-5 py-3.5">Jumlah</th>
                <th className="px-5 py-3.5">Satuan</th>
                <th className="px-5 py-3.5">Tujuan / Catatan</th>
                <th className="px-5 py-3.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-500 font-medium">Memuat data...</td></tr>
              ) : filteredTransactions.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-500 font-medium">Belum ada transaksi keluar.</td></tr>
              ) : filteredTransactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-amber-50/30 transition-colors group">
                  <td className="px-5 py-3.5 text-gray-600 font-mono text-xs">
                    {format(new Date(tx.created_at), 'dd MMM yyyy HH:mm')}
                  </td>
                  <td className="px-5 py-3.5 font-bold text-gray-900 text-sm">{tx.items?.name}</td>
                  <td className="px-5 py-3.5">
                    <span className="px-2 py-0.5 bg-amber-500/10 text-amber-700 rounded-md text-[10px] font-bold uppercase border border-amber-500/20">
                      {tx.department || 'General'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-amber-700 font-black text-sm">-{tx.quantity}</span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-600 font-medium">{tx.items?.unit}</td>
                  <td className="px-5 py-3.5 text-gray-500 italic">{tx.notes || '-'}</td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex justify-end gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleEdit(tx)}
                        className="p-1.5 hover:bg-amber-50 text-amber-600 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setTransactionToDelete(tx)}
                        className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
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
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-start sm:items-center justify-center z-[100] p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-md rounded-2xl border border-gray-200 shadow-2xl animate-in zoom-in duration-200 overflow-hidden flex flex-col mt-4 sm:mt-0 max-h-[90vh]">
            <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-gray-50 flex-shrink-0">
              <h3 className="text-base font-black text-gray-900">{editingTransaction ? 'Edit Barang Keluar' : 'Catat Barang Keluar'}</h3>
              <button onClick={() => { setIsModalOpen(false); setEditingTransaction(null); resetForm(); }} className="text-gray-400 hover:text-gray-600 p-1">✕</button>
            </div>
            <form id="outgoing-form" onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-grow">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Pilih Barang</label>
                <select 
                  value={selectedItemId} 
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:outline-none focus:border-amber-500 focus:bg-white min-h-[44px]"
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
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Departemen</label>
                <select 
                  value={department} 
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:outline-none focus:border-amber-500 focus:bg-white min-h-[44px]"
                  required
                >
                  {departments.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>

              {selectedItem && (
                <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200 flex items-center gap-3">
                  <Package className="w-5 h-5 text-amber-600" />
                  <div>
                    <p className="text-[10px] text-gray-500 font-extrabold uppercase">Stok Tersedia</p>
                    <p className="font-black text-gray-900 text-sm">
                      {selectedItem.current_stock + (editingTransaction?.quantity || 0)} {selectedItem.unit}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Jumlah Keluar</label>
                <input 
                  type="number" 
                  value={quantity} 
                  onChange={(e) => setQuantity(Number(e.target.value))} 
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:outline-none focus:border-amber-500 focus:bg-white min-h-[44px]" 
                  min="1"
                  max={selectedItem ? selectedItem.current_stock + (editingTransaction?.quantity || 0) : undefined}
                  required 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Tujuan / Catatan</label>
                <textarea 
                  value={notes} 
                  onChange={(e) => setNotes(e.target.value)} 
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:outline-none focus:border-amber-500 focus:bg-white h-24 resize-none"
                  placeholder="Contoh: Lantai 4 - Housekeeping"
                />
              </div>
              
              {selectedItem && quantity > (selectedItem.current_stock + (editingTransaction?.quantity || 0)) && (
                <div className="flex items-center gap-2 text-red-600 text-xs font-medium">
                  <AlertCircle className="w-4 h-4" />
                  <span>Jumlah melebihi stok yang tersedia!</span>
                </div>
              )}
            </form>
            <div className="p-4 border-t border-gray-200 bg-gray-50 flex flex-col sm:flex-row gap-2.5 flex-shrink-0">
              <button 
                type="button" 
                onClick={() => { setIsModalOpen(false); setEditingTransaction(null); resetForm(); }}
                className="flex-1 bg-white border border-gray-200 py-2.5 rounded-xl font-bold text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all min-h-[44px]"
              >
                Batal
              </button>
              <button 
                type="submit"
                form="outgoing-form"
                disabled={isSubmitting || !selectedItem || quantity <= 0 || quantity > (selectedItem.current_stock + (editingTransaction?.quantity || 0))}
                className="flex-1 bg-[#E65C00] hover:bg-[#CF5300] py-2.5 rounded-xl font-extrabold text-xs text-white transition-all shadow-sm shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px]"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  editingTransaction ? 'Simpan Perubahan' : 'Simpan Transaksi'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {transactionToDelete && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-[110] p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl border border-gray-200 shadow-2xl p-6 space-y-4 animate-in zoom-in duration-200 text-center">
            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto border border-red-100">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-gray-900">Hapus Transaksi?</h3>
              <p className="text-xs text-gray-500 mt-1 font-medium">Stok barang akan ditambah kembali sesuai jumlah transaksi ini.</p>
            </div>
            <div className="flex gap-2 pt-2">
              <button 
                onClick={() => setTransactionToDelete(null)}
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
