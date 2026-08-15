import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Supplier } from '../types';
import { Plus, Search, Edit2, Trash2, Phone, User, MapPin, Activity } from 'lucide-react';

interface SuppliersProps {
  globalSearch?: string;
}

export function Suppliers({ globalSearch = '' }: SuppliersProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  // Sync local search with global search
  useEffect(() => {
    if (globalSearch) {
      setSearchTerm(globalSearch);
    }
  }, [globalSearch]);

  // Form state
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    fetchSuppliers();
    checkDatabase();
  }, []);

  const checkDatabase = async () => {
    try {
      const { error } = await supabase.from('suppliers').select('category, user_id').limit(1);
      if (error) {
        if (error.message.includes('column "category" does not exist') || error.message.includes('column "user_id" does not exist')) {
          alert(`Peringatan: Kolom "category" atau "user_id" belum ada di tabel "suppliers".\n\nSilakan jalankan SQL update di menu Database Setup.`);
        } else if (error.message.includes('does not exist') || error.message.includes('relation') || error.code === '42P01') {
          console.error('Tabel suppliers belum ada');
        }
      }
    } catch (e) {
      // Ignore
    }
  };

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, name, contact_person, phone, address, category')
        .order('name');
      if (error) throw error;
      if (data) setSuppliers(data);
    } catch (error: any) {
      console.error('Error fetching suppliers:', error);
      alert('Gagal mengambil data supplier: ' + (error.message || 'Error tidak diketahui'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('Anda harus login untuk menyimpan data.');
        setIsSubmitting(false);
        return;
      }

      const supplierData = { 
        name, 
        contact_person: contactPerson, 
        phone, 
        address, 
        category,
        user_id: user.id
      };

      if (editingSupplier) {
        const { error } = await supabase.from('suppliers').update(supplierData).eq('id', editingSupplier.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('suppliers').insert([{
          id: crypto.randomUUID(),
          ...supplierData
        }]);
        if (error) throw error;
      }

      setIsModalOpen(false);
      setEditingSupplier(null);
      resetForm();
      fetchSuppliers();
    } catch (error: any) {
      console.error('Error saving supplier:', error);
      let errorMessage = 'Gagal menyimpan data supplier: ' + (error.message || 'Error tidak diketahui');
      
      if (error.message?.includes('column "category" does not exist')) {
        errorMessage = 'Gagal menyimpan: Kolom "category" belum ada di tabel "suppliers" di Supabase. Silakan tambahkan kolom tersebut.';
      } else if (error.message?.includes('column "user_id" does not exist')) {
        errorMessage = 'Gagal menyimpan: Kolom "user_id" belum ada di tabel "suppliers" di Supabase. Silakan tambahkan kolom tersebut.';
      } else if (error.message?.includes('relation "suppliers" does not exist')) {
        errorMessage = 'Gagal menyimpan: Tabel "suppliers" belum ada di database Supabase Anda.';
      }
      
      alert(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setName('');
    setContactPerson('');
    setPhone('');
    setAddress('');
    setCategory('');
  };

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setName(supplier.name);
    setContactPerson(supplier.contact_person);
    setPhone(supplier.phone);
    setAddress(supplier.address);
    setCategory(supplier.category || '');
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Apakah Anda yakin ingin menghapus supplier ini?')) {
      try {
        await supabase.from('suppliers').delete().eq('id', id);
        fetchSuppliers();
      } catch (error) {
        console.error('Error deleting supplier:', error);
        alert('Gagal menghapus supplier.');
      }
    }
  };

  const filteredSuppliers = suppliers.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.contact_person.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.category && s.category.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 p-4 md:p-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-white">Data Supplier</h2>
          <p className="text-brand-text-muted">Kelola daftar vendor dan supplier hotel</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button 
            onClick={fetchSuppliers}
            className="flex-1 md:flex-none bg-brand-card text-white px-4 py-3 rounded-xl border border-brand-border hover:bg-brand-dark transition-all flex items-center justify-center gap-2"
          >
            <Activity className="w-5 h-5" />
            <span>Refresh</span>
          </button>
          <button 
            onClick={() => { resetForm(); setEditingSupplier(null); setIsModalOpen(true); }}
            className="flex-1 md:flex-none bg-brand-accent hover:bg-blue-600 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-brand-accent/20"
          >
            <Plus className="w-5 h-5" />
            Tambah Supplier
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted" />
        <input 
          type="text" 
          placeholder="Cari supplier atau kontak..." 
          className="w-full pl-10 py-2 text-sm bg-brand-dark border border-brand-border rounded-lg text-white focus:ring-1 focus:ring-brand-accent outline-none"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {loading ? (
          <div className="col-span-full text-center py-12 text-brand-text-muted">Loading...</div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="col-span-full text-center py-12 text-brand-text-muted">Tidak ada data supplier.</div>
        ) : filteredSuppliers.map((supplier) => (
          <div key={supplier.id} className="bg-brand-card p-6 rounded-2xl border border-brand-border hover:border-brand-accent transition-all group">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-bold text-white">{supplier.name}</h3>
                <p className="text-xs text-brand-accent font-medium mt-1">{supplier.category || 'Kategori belum diatur'}</p>
              </div>
              <div className="flex gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleEdit(supplier)} className="p-2 md:p-1.5 hover:bg-brand-accent/20 text-brand-accent rounded-lg border border-brand-border md:border-none">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(supplier.id)} className="p-2 md:p-1.5 hover:bg-red-500/20 text-red-500 rounded-lg border border-brand-border md:border-none">
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center z-[100] p-4 overflow-y-auto">
          <div className="bg-brand-card w-full max-w-md rounded-2xl border border-brand-border shadow-2xl animate-in zoom-in duration-200 overflow-hidden flex flex-col mt-4 sm:mt-0 max-h-[90vh]">
            <div className="p-6 border-b border-brand-border flex justify-between items-center bg-brand-dark/30 flex-shrink-0">
              <h3 className="text-xl font-bold text-white">{editingSupplier ? 'Edit Supplier' : 'Tambah Supplier Baru'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-brand-text-muted hover:text-white p-2">✕</button>
            </div>
            
            <form id="supplier-form" onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-grow">
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
              <div>
                <label className="block text-sm font-medium text-brand-text-muted mb-1">Keterangan Barang (Suplier barang apa)</label>
                <input 
                  type="text" 
                  value={category} 
                  onChange={(e) => setCategory(e.target.value)} 
                  className="w-full" 
                  placeholder="Contoh: Sayuran, Alat Tulis, Linen, dll"
                  required 
                />
              </div>
            </form>

            <div className="p-6 border-t border-brand-border bg-brand-dark/30 flex flex-col sm:flex-row gap-3 flex-shrink-0">
              <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-brand-dark border border-brand-border py-3 rounded-xl font-bold text-brand-text-muted hover:text-white transition-all">Batal</button>
              <button 
                type="submit" 
                form="supplier-form"
                disabled={isSubmitting}
                className="flex-1 bg-brand-accent hover:bg-blue-600 py-3 rounded-xl font-bold text-white transition-all shadow-lg shadow-brand-accent/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  editingSupplier ? 'Simpan Perubahan' : 'Tambah Supplier'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
