import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Item } from '../types';
import { Plus, Search, Filter, Edit2, Trash2, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

export function Inventory() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('Housekeeping');
  const [unit, setUnit] = useState('');
  const [minStock, setMinStock] = useState(0);

  const departments = ['Housekeeping', 'Resto', 'Tekhnisi', 'Front Office', 'General'];

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    const { data } = await supabase.from('items').select('*').order('name');
    if (data) setItems(data);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const itemData = { name, department, unit, min_stock: minStock };

    if (editingItem) {
      await supabase.from('items').update(itemData).eq('id', editingItem.id);
    } else {
      await supabase.from('items').insert([{ ...itemData, current_stock: 0 }]);
    }

    setIsModalOpen(false);
    setEditingItem(null);
    resetForm();
    fetchItems();
  };

  const resetForm = () => {
    setName('');
    setDepartment('Housekeeping');
    setUnit('');
    setMinStock(0);
  };

  const handleEdit = (item: Item) => {
    setEditingItem(item);
    setName(item.name);
    setDepartment(item.department);
    setUnit(item.unit);
    setMinStock(item.min_stock);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Apakah Anda yakin ingin menghapus barang ini?')) {
      await supabase.from('items').delete().eq('id', id);
      fetchItems();
    }
  };

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-white">Stok Barang</h2>
          <p className="text-brand-text-muted">Kelola daftar inventaris hotel</p>
        </div>
        <button 
          onClick={() => { resetForm(); setEditingItem(null); setIsModalOpen(true); }}
          className="bg-brand-accent hover:bg-blue-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-brand-accent/20"
        >
          <Plus className="w-5 h-5" />
          Tambah Barang
        </button>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted" />
          <input 
            type="text" 
            placeholder="Cari barang atau departemen..." 
            className="w-full pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="bg-brand-card border border-brand-border px-4 py-2 rounded-lg text-brand-text-muted hover:text-white flex items-center gap-2">
          <Filter className="w-4 h-4" />
          Filter
        </button>
      </div>

      <div className="bg-brand-card rounded-2xl border border-brand-border overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-brand-dark/50 text-brand-text-muted text-xs font-bold uppercase tracking-wider">
              <th className="px-6 py-4">Nama Barang</th>
              <th className="px-6 py-4">Departemen</th>
              <th className="px-6 py-4">Stok Saat Ini</th>
              <th className="px-6 py-4">Min. Stok</th>
              <th className="px-6 py-4">Satuan</th>
              <th className="px-6 py-4 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border">
            {loading ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-brand-text-muted">Loading...</td></tr>
            ) : filteredItems.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-brand-text-muted">Tidak ada data ditemukan.</td></tr>
            ) : filteredItems.map((item) => (
              <tr key={item.id} className="hover:bg-brand-dark/30 transition-colors group">
                <td className="px-6 py-4 font-medium text-white">{item.name}</td>
                <td className="px-6 py-4 text-brand-text-muted">
                  <span className="px-2 py-1 bg-brand-dark rounded-md text-[10px] font-bold uppercase border border-brand-border">
                    {item.department}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "font-bold",
                      item.current_stock <= item.min_stock ? "text-orange-500" : "text-white"
                    )}>
                      {item.current_stock}
                    </span>
                    {item.current_stock <= item.min_stock && (
                      <AlertCircle className="w-4 h-4 text-orange-500" />
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-brand-text-muted">{item.min_stock}</td>
                <td className="px-6 py-4 text-brand-text-muted">{item.unit}</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => handleEdit(item)}
                      className="p-2 hover:bg-brand-accent/20 text-brand-accent rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDelete(item.id)}
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

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-brand-card w-full max-w-md rounded-2xl border border-brand-border shadow-2xl animate-in zoom-in duration-200">
            <div className="p-6 border-b border-brand-border flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">{editingItem ? 'Edit Barang' : 'Tambah Barang Baru'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-brand-text-muted hover:text-white">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
              <div className="grid grid-cols-2 gap-4">
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
                  className="flex-1 bg-brand-accent hover:bg-blue-600 py-3 rounded-xl font-bold text-white transition-all shadow-lg shadow-brand-accent/20"
                >
                  {editingItem ? 'Simpan Perubahan' : 'Tambah Barang'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
