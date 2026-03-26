import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Supplier } from '../types';
import { Plus, Search, Edit2, Trash2, Phone, User, MapPin } from 'lucide-react';

export function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    setLoading(true);
    const { data } = await supabase.from('suppliers').select('*').order('name');
    if (data) setSuppliers(data);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const supplierData = { name, contact_person: contactPerson, phone, address };

    if (editingSupplier) {
      await supabase.from('suppliers').update(supplierData).eq('id', editingSupplier.id);
    } else {
      await supabase.from('suppliers').insert([supplierData]);
    }

    setIsModalOpen(false);
    setEditingSupplier(null);
    resetForm();
    fetchSuppliers();
  };

  const resetForm = () => {
    setName('');
    setContactPerson('');
    setPhone('');
    setAddress('');
  };

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setName(supplier.name);
    setContactPerson(supplier.contact_person);
    setPhone(supplier.phone);
    setAddress(supplier.address);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Apakah Anda yakin ingin menghapus supplier ini?')) {
      await supabase.from('suppliers').delete().eq('id', id);
      fetchSuppliers();
    }
  };

  const filteredSuppliers = suppliers.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.contact_person.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-white">Data Supplier</h2>
          <p className="text-brand-text-muted">Kelola daftar vendor dan supplier hotel</p>
        </div>
        <button 
          onClick={() => { resetForm(); setEditingSupplier(null); setIsModalOpen(true); }}
          className="bg-brand-accent hover:bg-blue-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-brand-accent/20"
        >
          <Plus className="w-5 h-5" />
          Tambah Supplier
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted" />
        <input 
          type="text" 
          placeholder="Cari supplier atau kontak..." 
          className="w-full pl-10"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full text-center py-12 text-brand-text-muted">Loading...</div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="col-span-full text-center py-12 text-brand-text-muted">Tidak ada data supplier.</div>
        ) : filteredSuppliers.map((supplier) => (
          <div key={supplier.id} className="bg-brand-card p-6 rounded-2xl border border-brand-border hover:border-brand-accent transition-all group">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold text-white">{supplier.name}</h3>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleEdit(supplier)} className="p-1.5 hover:bg-brand-accent/20 text-brand-accent rounded-lg">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(supplier.id)} className="p-1.5 hover:bg-red-500/20 text-red-500 rounded-lg">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm text-brand-text-muted">
                <User className="w-4 h-4" />
                <span>{supplier.contact_person}</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-brand-text-muted">
                <Phone className="w-4 h-4" />
                <span>{supplier.phone}</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-brand-text-muted">
                <MapPin className="w-4 h-4" />
                <span className="line-clamp-1">{supplier.address}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-brand-card w-full max-w-md rounded-2xl border border-brand-border shadow-2xl animate-in zoom-in duration-200">
            <div className="p-6 border-b border-brand-border flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">{editingSupplier ? 'Edit Supplier' : 'Tambah Supplier Baru'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-brand-text-muted hover:text-white">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-brand-text-muted mb-1">Nama Perusahaan</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-text-muted mb-1">Nama Kontak</label>
                <input type="text" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className="w-full" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-text-muted mb-1">Nomor Telepon</label>
                <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-text-muted mb-1">Alamat</label>
                <textarea value={address} onChange={(e) => setAddress(e.target.value)} className="w-full h-24 resize-none" required />
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-brand-dark border border-brand-border py-3 rounded-xl font-bold text-brand-text-muted hover:text-white transition-all">Batal</button>
                <button type="submit" className="flex-1 bg-brand-accent hover:bg-blue-600 py-3 rounded-xl font-bold text-white transition-all shadow-lg shadow-brand-accent/20">
                  {editingSupplier ? 'Simpan Perubahan' : 'Tambah Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
