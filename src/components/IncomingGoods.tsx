import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Item, Transaction } from '../types';
import { ArrowDownCircle, Search, Plus, Calendar as CalendarIcon, Package, Activity, AlertCircle, Edit2, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

interface IncomingGoodsProps {
  globalSearch?: string;
}

export function IncomingGoods({ globalSearch = '' }: IncomingGoodsProps) {
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
        .eq('type', 'IN')
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

        // 2. Update stock (revert old, add new)
        const item = items.find(i => i.id === selectedItemId);
        if (item) {
          const diff = quantity - editingTransaction.quantity;
          const { error: updateError } = await supabase.from('items').update({
            current_stock: item.current_stock + diff
          }).eq('id', item.id);
          if (updateError) throw updateError;
        }
      } else {
        // 1. Record transaction
        const { error: transError } = await supabase.from('transactions').insert([{
          id: crypto.randomUUID(),
          item_id: selectedItemId,
          type: 'IN',
          quantity,
          department,
          notes,
          user_id: user.id
        }]);

        if (transError) throw transError;

        // 2. Update stock
        const item = items.find(i => i.id === selectedItemId);
        if (item) {
          const { error: updateError } = await supabase.from('items').update({
            current_stock: item.current_stock + quantity
          }).eq('id', item.id);
          if (updateError) throw updateError;
        }
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
          current_stock: item.current_stock - transactionToDelete.quantity
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

  const filteredTransactions = transactions.filter(tx => {
    const txDate = new Date(tx.created_at);
    const matchesMonth = txDate.getMonth() === selectedMonth && txDate.getFullYear() === selectedYear;
    const matchesSearch = tx.items?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         tx.department?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         tx.notes?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesMonth && matchesSearch;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500 p-4 md:p-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-white">Barang Masuk</h2>
          <p className="text-brand-text-muted">Catat penerimaan barang dari vendor</p>
          {dbStatus && !dbStatus.ok && (
            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {dbStatus.message}
            </p>
          )}
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button 
            onClick={fetchData}
            className="flex-1 md:flex-none bg-brand-card text-white px-4 py-3 rounded-xl border border-brand-border hover:bg-brand-dark transition-all flex items-center justify-center gap-2"
          >
            <Activity className="w-5 h-5" />
            <span>Refresh</span>
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex-1 md:flex-none bg-brand-accent hover:bg-blue-600 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-brand-accent/20"
          >
            <Plus className="w-5 h-5" />
            Catat Barang Masuk
          </button>
        </div>
      </div>

      <div className="bg-brand-card rounded-2xl border border-brand-border overflow-hidden">
        <div className="p-4 md:p-6 border-b border-brand-border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-brand-dark/20">
          <h3 className="font-bold text-white flex items-center gap-2">
            <ArrowDownCircle className="w-5 h-5 text-blue-500" />
            Riwayat Penerimaan
          </h3>
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted" />
              <input 
                type="text" 
                placeholder="Cari transaksi..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full md:w-64 pl-10 py-2 text-sm bg-brand-dark border border-brand-border rounded-lg text-white focus:ring-1 focus:ring-brand-accent outline-none" 
              />
            </div>
            <div className="flex items-center gap-2">
              <select 
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="bg-brand-dark border border-brand-border text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-brand-accent"
              >
                {months.map((month, index) => (
                  <option key={index} value={index}>{month}</option>
                ))}
              </select>
              <select 
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="bg-brand-dark border border-brand-border text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-brand-accent"
              >
                {years.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-brand-dark/50 text-brand-text-muted text-xs font-bold uppercase tracking-wider">
                <th className="px-6 py-4">Tanggal</th>
                <th className="px-6 py-4">Nama Barang</th>
                <th className="px-6 py-4">Departemen</th>
                <th className="px-6 py-4">Jumlah</th>
                <th className="px-6 py-4">Satuan</th>
                <th className="px-6 py-4">Catatan</th>
                <th className="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {loading ? (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-brand-text-muted">Loading...</td></tr>
              ) : filteredTransactions.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-brand-text-muted">Belum ada transaksi masuk.</td></tr>
              ) : filteredTransactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-brand-dark/30 transition-colors group">
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
                    <span className="text-blue-500 font-bold">+{tx.quantity}</span>
                  </td>
                  <td className="px-6 py-4 text-brand-text-muted">{tx.items?.unit}</td>
                  <td className="px-6 py-4 text-brand-text-muted text-sm italic">{tx.notes || '-'}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleEdit(tx)}
                        className="p-2 hover:bg-brand-accent/20 text-brand-accent rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setTransactionToDelete(tx)}
                        className="p-2 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors"
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center z-[100] p-4 overflow-y-auto">
          <div className="bg-brand-card w-full max-w-md rounded-2xl border border-brand-border shadow-2xl animate-in zoom-in duration-200 overflow-hidden flex flex-col mt-4 sm:mt-0 max-h-[90vh]">
            <div className="p-6 border-b border-brand-border flex justify-between items-center bg-brand-dark/30 flex-shrink-0">
              <h3 className="text-xl font-bold text-white">{editingTransaction ? 'Edit Barang Masuk' : 'Catat Barang Masuk'}</h3>
              <button onClick={() => { setIsModalOpen(false); setEditingTransaction(null); resetForm(); }} className="text-brand-text-muted hover:text-white p-2">✕</button>
            </div>
            <form id="incoming-form" onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-grow">
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
                    <option key={item.id} value={item.id}>{item.name} ({item.current_stock} {item.unit})</option>
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
              <div>
                <label className="block text-sm font-medium text-brand-text-muted mb-1">Jumlah Masuk</label>
                <input 
                  type="number" 
                  value={quantity} 
                  onChange={(e) => setQuantity(Number(e.target.value))} 
                  className="w-full" 
                  min="1"
                  required 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-text-muted mb-1">Catatan / Vendor</label>
                <textarea 
                  value={notes} 
                  onChange={(e) => setNotes(e.target.value)} 
                  className="w-full h-24 resize-none"
                  placeholder="Contoh: Vendor XYZ - PO #123"
                />
              </div>
            </form>
            <div className="p-6 border-t border-brand-border bg-brand-dark/30 flex flex-col sm:flex-row gap-3 flex-shrink-0">
              <button 
                type="button" 
                onClick={() => { setIsModalOpen(false); setEditingTransaction(null); resetForm(); }}
                className="flex-1 bg-brand-dark border border-brand-border py-3 rounded-xl font-bold text-brand-text-muted hover:text-white transition-all"
              >
                Batal
              </button>
              <button 
                type="submit"
                form="incoming-form"
                disabled={isSubmitting}
                className="flex-1 bg-brand-accent hover:bg-blue-600 py-3 rounded-xl font-bold text-white transition-all shadow-lg shadow-brand-accent/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-brand-card w-full max-w-sm rounded-2xl border border-brand-border shadow-2xl p-6 space-y-6 animate-in zoom-in duration-200">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-white">Hapus Transaksi?</h3>
              <p className="text-brand-text-muted text-sm">Stok barang akan dikurangi kembali sesuai jumlah transaksi ini.</p>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => setTransactionToDelete(null)}
                className="flex-1 bg-brand-dark border border-brand-border py-3 rounded-xl font-bold text-brand-text-muted hover:text-white transition-all"
              >
                Batal
              </button>
              <button 
                onClick={handleDelete}
                className="flex-1 bg-red-500 hover:bg-red-600 py-3 rounded-xl font-bold text-white transition-all shadow-lg shadow-red-500/20"
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
