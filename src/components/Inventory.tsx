import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Item } from '../types';
import { Plus, Search, Filter, Edit2, Trash2, AlertCircle, Activity } from 'lucide-react';
import { cn } from '../lib/utils';

interface InventoryProps {
  globalSearch?: string;
}

export function Inventory({ globalSearch = '' }: InventoryProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [itemStats, setItemStats] = useState<Record<string, { initial: number, in: number, out: number, final: number }>>({});
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

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
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('Housekeeping');
  const [unit, setUnit] = useState('');
  const [initialStock, setInitialStock] = useState(0);
  const [minStock, setMinStock] = useState(0);

  const departments = ['Housekeeping', 'Resto', 'Tekhnisi', 'Front Office', 'General'];

  const [dbStatus, setDbStatus] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    fetchItems();
    checkDatabase();
  }, [selectedMonth, selectedYear]);

  const checkDatabase = async () => {
    try {
      // Check for required columns in items table
      const { error: itemsError } = await supabase.from('items').select('department, initial_stock').limit(1);
      
      if (itemsError) {
        if (itemsError.message.includes('column "initial_stock" does not exist')) {
          setDbStatus({ ok: false, message: 'Kolom "initial_stock" belum ada di tabel items. Silakan jalankan SQL update.' });
          return;
        } else if (itemsError.message.includes('column "department" does not exist')) {
          setDbStatus({ ok: false, message: 'Kolom "department" belum ada di tabel items. Silakan jalankan SQL update.' });
          return;
        } else if (itemsError.message.includes('relation "items" does not exist')) {
          setDbStatus({ ok: false, message: 'Tabel "items" belum dibuat di Supabase.' });
          return;
        } else {
          setDbStatus({ ok: false, message: 'Error database items: ' + itemsError.message });
          return;
        }
      }

      // Check for required columns in transactions table
      const { error: transError } = await supabase.from('transactions').select('department, notes').limit(1);
      if (transError) {
        if (transError.message.includes('column "department" does not exist') || transError.message.includes('column "notes" does not exist')) {
          setDbStatus({ ok: false, message: 'Kolom "department" atau "notes" belum ada di tabel transactions.' });
          return;
        }
      }

      setDbStatus({ ok: true, message: 'Database terhubung dengan benar.' });
    } catch (err) {
      setDbStatus({ ok: false, message: 'Gagal mengecek status database.' });
    }
  };

  const fetchItems = async () => {
    setLoading(true);
    try {
      const { data: itemsData, error: itemsError } = await supabase.from('items').select('*').order('name');
      if (itemsError) throw itemsError;

      const { data: transData, error: transError } = await supabase.from('transactions').select('item_id, type, quantity, created_at');
      if (transError) throw transError;

      const startDate = new Date(selectedYear, selectedMonth, 1);
      const endDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);

      const stats: Record<string, { initial: number, in: number, out: number, final: number }> = {};
      
      itemsData?.forEach(item => {
        // Calculate initial stock for the selected month
        // Initial = item.initial_stock + sum(IN before) - sum(OUT before)
        let beforeIn = 0;
        let beforeOut = 0;
        let currentIn = 0;
        let currentOut = 0;

        transData?.forEach(tx => {
          if (tx.item_id === item.id) {
            const txDate = new Date(tx.created_at);
            if (txDate < startDate) {
              if (tx.type === 'IN') beforeIn += tx.quantity;
              if (tx.type === 'OUT') beforeOut += tx.quantity;
            } else if (txDate >= startDate && txDate <= endDate) {
              if (tx.type === 'IN') currentIn += tx.quantity;
              if (tx.type === 'OUT') currentOut += tx.quantity;
            }
          }
        });

        const itemCreatedAt = new Date(item.created_at);
        const itemCreatedMonth = new Date(itemCreatedAt.getFullYear(), itemCreatedAt.getMonth(), 1);
        
        let initialForMonth = 0;
        let finalForMonth = 0;

        // Only show stock if the selected month is the same or after the creation month
        if (startDate >= itemCreatedMonth) {
          initialForMonth = (item.initial_stock || 0) + beforeIn - beforeOut;
          finalForMonth = initialForMonth + currentIn - currentOut;
        } else {
          // If month is before creation, everything is 0
          initialForMonth = 0;
          currentIn = 0;
          currentOut = 0;
          finalForMonth = 0;
        }

        stats[item.id] = {
          initial: initialForMonth,
          in: currentIn,
          out: currentOut,
          final: finalForMonth
        };
      });

      setItemStats(stats);
      if (itemsData) setItems(itemsData);
    } catch (error: any) {
      console.error('Error fetching items:', error);
      alert('Gagal mengambil data barang: ' + (error.message || 'Error tidak diketahui'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const itemData = { name, department, unit, initial_stock: initialStock, min_stock: minStock };

    try {
      if (editingItem) {
        const { error } = await supabase.from('items').update(itemData).eq('id', editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('items').insert([{ 
          id: crypto.randomUUID(),
          ...itemData, 
          current_stock: initialStock 
        }]);
        if (error) {
          throw error;
        }
      }

      setIsModalOpen(false);
      setEditingItem(null);
      resetForm();
      fetchItems();
    } catch (error: any) {
      console.error('Error saving item:', error);
      alert('Gagal menyimpan data barang: ' + (error.message || 'Error tidak diketahui') + 
            '\n\nPastikan tabel "items" sudah ada di database Supabase Anda.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setName('');
    setDepartment('Housekeeping');
    setUnit('');
    setInitialStock(0);
    setMinStock(0);
  };

  const handleEdit = (item: Item) => {
    setEditingItem(item);
    setName(item.name);
    setDepartment(item.department);
    setUnit(item.unit);
    setInitialStock(item.initial_stock || 0);
    setMinStock(item.min_stock);
    setIsModalOpen(true);
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    try {
      await supabase.from('items').delete().eq('id', itemToDelete);
      setItemToDelete(null);
      fetchItems();
    } catch (error) {
      console.error('Error deleting item:', error);
    }
  };

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 p-4 md:p-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-white">Stok Barang</h2>
          <p className="text-brand-text-muted">Kelola daftar inventaris hotel</p>
          {dbStatus && !dbStatus.ok && (
            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {dbStatus.message}
            </p>
          )}
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button 
            onClick={fetchItems}
            className="flex-1 md:flex-none bg-brand-card text-white px-4 py-3 rounded-xl border border-brand-border hover:bg-brand-dark transition-all flex items-center justify-center gap-2"
          >
            <Activity className="w-5 h-5" />
            <span>Refresh</span>
          </button>
          <button 
            onClick={() => { resetForm(); setEditingItem(null); setIsModalOpen(true); }}
            className="flex-1 md:flex-none bg-brand-accent hover:bg-blue-600 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-brand-accent/20"
          >
            <Plus className="w-5 h-5" />
            Tambah Barang
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 md:gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-text-muted" />
          <input 
            type="text" 
            placeholder="Cari barang atau departemen..." 
            className="w-full pl-9 py-1.5 md:py-2 text-xs md:text-sm bg-brand-dark border border-brand-border rounded-lg text-white focus:ring-1 focus:ring-brand-accent outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <select 
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            className="flex-1 bg-brand-dark border border-brand-border text-white text-xs md:text-sm rounded-lg px-2 md:px-3 py-1.5 md:py-2 outline-none focus:ring-1 focus:ring-brand-accent"
          >
            {months.map((month, index) => (
              <option key={index} value={index}>{month}</option>
            ))}
          </select>
          <select 
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="bg-brand-dark border border-brand-border text-white text-xs md:text-sm rounded-lg px-2 md:px-3 py-1.5 md:py-2 outline-none focus:ring-1 focus:ring-brand-accent"
          >
            {years.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <button className="bg-brand-card border border-brand-border px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-brand-text-muted hover:text-white flex items-center justify-center gap-2 text-xs md:text-sm">
            <Filter className="w-3.5 h-3.5" />
            Filter
          </button>
        </div>
      </div>

      <div className="bg-brand-card rounded-2xl border border-brand-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-brand-dark/50 text-brand-text-muted text-[10px] md:text-xs font-bold uppercase tracking-wider">
                <th className="px-3 md:px-6 py-3 md:py-4">Nama Barang</th>
                <th className="px-3 md:px-6 py-3 md:py-4">Dept</th>
                <th className="px-3 md:px-6 py-3 md:py-4">Awal</th>
                <th className="px-3 md:px-6 py-3 md:py-4">Masuk</th>
                <th className="px-3 md:px-6 py-3 md:py-4">Keluar</th>
                <th className="px-3 md:px-6 py-3 md:py-4">Akhir</th>
                <th className="px-3 md:px-6 py-3 md:py-4">Satuan</th>
                <th className="px-3 md:px-6 py-3 md:py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {loading ? (
                <tr><td colSpan={8} className="px-6 py-8 text-center text-brand-text-muted">Loading...</td></tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-brand-text-muted">Tidak ada data ditemukan.</p>
                      <div className="p-4 bg-brand-dark/50 rounded-xl border border-brand-border max-w-md text-xs text-brand-text-muted text-left">
                        <p className="font-bold text-white mb-2 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-orange-500" />
                          Tips: Data tidak muncul?
                        </p>
                        <ul className="list-disc pl-4 space-y-1 mb-4">
                          <li>Pastikan Anda sudah menjalankan SQL di Supabase SQL Editor.</li>
                          <li>Pastikan tabel "items", "suppliers", dan "transactions" sudah ada.</li>
                          <li>Cek apakah RLS (Row Level Security) sudah dikonfigurasi.</li>
                        </ul>
                        {dbStatus && !dbStatus.ok && (
                          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                            <p className="text-red-400 font-bold mb-1">Status Error:</p>
                            <p className="text-red-300 mb-2">{dbStatus.message}</p>
                            <p className="text-white font-semibold mb-1">Gunakan SQL ini untuk update:</p>
                            <pre className="bg-black/50 p-2 rounded text-[10px] overflow-x-auto text-blue-300">
{`-- Perbaiki ID tabel items agar bisa tambah banyak barang
ALTER TABLE items ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Tambahkan kolom jika belum ada
ALTER TABLE items ADD COLUMN IF NOT EXISTS department TEXT DEFAULT 'General';
ALTER TABLE items ADD COLUMN IF NOT EXISTS initial_stock NUMERIC DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS department TEXT DEFAULT 'General';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS notes TEXT;`}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : filteredItems.map((item) => {
                const stats = itemStats[item.id] || { initial: 0, in: 0, out: 0, final: 0 };
                return (
                  <tr key={item.id} className="hover:bg-brand-dark/30 transition-colors group">
                    <td className="px-3 md:px-6 py-3 md:py-4 font-medium text-white text-xs md:text-sm">{item.name}</td>
                    <td className="px-3 md:px-6 py-3 md:py-4 text-brand-text-muted">
                      <span className="px-1.5 py-0.5 bg-brand-dark rounded-md text-[9px] md:text-[10px] font-bold uppercase border border-brand-border">
                        {item.department}
                      </span>
                    </td>
                    <td className="px-3 md:px-6 py-3 md:py-4 text-brand-text-muted text-xs md:text-sm">{stats.initial}</td>
                    <td className="px-3 md:px-6 py-3 md:py-4 text-blue-400 text-xs md:text-sm">+{stats.in}</td>
                    <td className="px-3 md:px-6 py-3 md:py-4 text-purple-400 text-xs md:text-sm">-{stats.out}</td>
                    <td className="px-3 md:px-6 py-3 md:py-4">
                      <div className="flex items-center gap-1 md:gap-2">
                        <span className={cn(
                          "font-bold text-xs md:text-sm",
                          stats.final <= item.min_stock ? "text-orange-500" : "text-white"
                        )}>
                          {stats.final}
                        </span>
                        {stats.final <= item.min_stock && (
                          <AlertCircle className="w-3 h-3 md:w-4 md:h-4 text-orange-500" title={`Stok rendah! Min: ${item.min_stock}`} />
                        )}
                      </div>
                    </td>
                    <td className="px-3 md:px-6 py-3 md:py-4 text-brand-text-muted text-xs md:text-sm">{item.unit}</td>
                    <td className="px-3 md:px-6 py-3 md:py-4 text-right">
                    <div className="flex justify-end gap-1 md:gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleEdit(item)}
                        className="p-1.5 md:p-2 hover:bg-brand-accent/20 text-brand-accent rounded-lg transition-colors"
                      >
                        <Edit2 className="w-3 h-3 md:w-4 md:h-4" />
                      </button>
                      <button 
                        onClick={() => setItemToDelete(item.id)}
                        className="p-1.5 md:p-2 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3 h-3 md:w-4 md:h-4" />
                      </button>
                    </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center z-[100] p-4 overflow-y-auto">
          <div className="bg-brand-card w-full max-w-md rounded-2xl border border-brand-border shadow-2xl animate-in zoom-in duration-200 overflow-hidden flex flex-col mt-4 sm:mt-0 max-h-[90vh]">
            <div className="p-6 border-b border-brand-border flex justify-between items-center bg-brand-dark/30 flex-shrink-0">
              <h3 className="text-xl font-bold text-white">{editingItem ? 'Edit Barang' : 'Tambah Barang Baru'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-brand-text-muted hover:text-white p-2">✕</button>
            </div>
            <form id="inventory-form" onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-grow">
              <div>
                <label className="block text-sm font-medium text-brand-text-muted mb-1">Nama Barang</label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  className="w-full" 
                  required 
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  <label className="block text-sm font-medium text-brand-text-muted mb-1">Satuan</label>
                  <input 
                    type="text" 
                    value={unit} 
                    onChange={(e) => setUnit(e.target.value)} 
                    className="w-full" 
                    placeholder="Pcs, Ltr, Unit"
                    required 
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-brand-text-muted mb-1">Stok Awal</label>
                  <input 
                    type="number" 
                    value={initialStock} 
                    onChange={(e) => setInitialStock(Number(e.target.value))} 
                    className="w-full" 
                    required 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-brand-text-muted mb-1">Min. Stok (Peringatan)</label>
                  <input 
                    type="number" 
                    value={minStock} 
                    onChange={(e) => setMinStock(Number(e.target.value))} 
                    className="w-full" 
                    required 
                  />
                </div>
              </div>
            </form>
            <div className="p-6 border-t border-brand-border bg-brand-dark/30 flex flex-col sm:flex-row gap-3 flex-shrink-0">
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)}
                className="flex-1 bg-brand-dark border border-brand-border py-3 rounded-xl font-bold text-brand-text-muted hover:text-white transition-all"
              >
                Batal
              </button>
              <button 
                type="submit"
                form="inventory-form"
                disabled={isSubmitting}
                className="flex-1 bg-brand-accent hover:bg-blue-600 py-3 rounded-xl font-bold text-white transition-all shadow-lg shadow-brand-accent/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  editingItem ? 'Simpan Perubahan' : 'Tambah Barang'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-brand-card w-full max-w-sm rounded-2xl border border-brand-border shadow-2xl p-6 space-y-6 animate-in zoom-in duration-200">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-white">Hapus Barang?</h3>
              <p className="text-brand-text-muted text-sm">Tindakan ini tidak dapat dibatalkan. Semua data terkait barang ini akan dihapus.</p>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => setItemToDelete(null)}
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
