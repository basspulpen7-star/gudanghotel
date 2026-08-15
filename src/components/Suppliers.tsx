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
    <div className="space-y-6 animate-in fade-in duration-300 pb-20 md:pb-6 font-sans">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 md:p-6 rounded-2xl border border-gray-200/90 shadow-sm">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">Data Supplier</h2>
          <p className="text-xs md:text-sm text-gray-500 mt-0.5 font-medium">Kelola daftar vendor dan supplier mitra hotel</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button 
            onClick={fetchSuppliers}
            className="flex-1 md:flex-none bg-gray-100 text-gray-700 hover:text-gray-900 px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-200 transition-all flex items-center justify-center gap-2 text-xs font-bold min-h-[44px]"
          >
            <Activity className="w-4 h-4 text-amber-600" />
            <span>Refresh</span>
          </button>
          <button 
            onClick={() => { resetForm(); setEditingSupplier(null); setIsModalOpen(true); }}
            className="flex-1 md:flex-none bg-[#E65C00] hover:bg-[#CF5300] text-white px-5 py-2.5 rounded-xl font-extrabold flex items-center justify-center gap-2 transition-all shadow-sm shadow-orange-500/20 text-xs sm:text-sm min-h-[44px]"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Tambah Supplier</span>
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-gray-200/90 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            type="text" 
            placeholder="Cari supplier atau kontak..." 
            className="w-full pl-9 pr-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500 focus:bg-white transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {loading ? (
          <div className="col-span-full text-center py-12 text-gray-500 font-medium text-xs">Memuat data...</div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="col-span-full bg-white p-12 rounded-2xl border border-gray-200/90 text-center shadow-sm">
            <p className="text-xs text-gray-500 font-medium">Tidak ada data supplier yang ditemukan.</p>
          </div>
        ) : filteredSuppliers.map((supplier) => (
          <div key={supplier.id} className="bg-white p-5 rounded-2xl border border-gray-200/90 shadow-sm hover:border-amber-500/50 transition-all group">
            <div className="flex justify-between items-start mb-3.5">
              <div>
                <h3 className="text-base font-black text-gray-900">{supplier.name}</h3>
                <span className="inline-block px-2 py-0.5 bg-amber-500/10 text-amber-700 rounded-md text-[10px] font-bold uppercase border border-amber-500/20 mt-1">
                  {supplier.category || 'General Vendor'}
                </span>
              </div>
              <div className="flex gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleEdit(supplier)} className="p-1.5 hover:bg-amber-50 text-amber-600 rounded-lg transition-colors">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(supplier.id)} className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <div className="flex items-center gap-2.5 text-xs text-gray-700">
                <User className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                <span className="font-semibold">{supplier.contact_person || '-'}</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-gray-700">
                <Phone className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                <span className="font-mono text-gray-600">{supplier.phone || '-'}</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-gray-500">
                <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="line-clamp-1">{supplier.address || '-'}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-start sm:items-center justify-center z-[100] p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-md rounded-2xl border border-gray-200 shadow-2xl animate-in zoom-in duration-200 overflow-hidden flex flex-col mt-4 sm:mt-0 max-h-[90vh]">
            <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-gray-50 flex-shrink-0">
              <h3 className="text-base font-black text-gray-900">{editingSupplier ? 'Edit Supplier' : 'Tambah Supplier Baru'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1">✕</button>
            </div>
            
            <form id="supplier-form" onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-grow">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Nama Perusahaan / Vendor</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:outline-none focus:border-amber-500 focus:bg-white min-h-[44px]" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Nama Kontak / PIC</label>
                <input type="text" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:outline-none focus:border-amber-500 focus:bg-white min-h-[44px]" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Nomor Telepon</label>
                <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:outline-none focus:border-amber-500 focus:bg-white min-h-[44px]" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Alamat</label>
                <textarea value={address} onChange={(e) => setAddress(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:outline-none focus:border-amber-500 focus:bg-white h-20 resize-none" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Keterangan Barang / Kategori</label>
                <input 
                  type="text" 
                  value={category} 
                  onChange={(e) => setCategory(e.target.value)} 
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:outline-none focus:border-amber-500 focus:bg-white min-h-[44px]" 
                  placeholder="Contoh: Sayuran, Alat Tulis, Linen, dll"
                  required 
                />
              </div>
            </form>

            <div className="p-4 border-t border-gray-200 bg-gray-50 flex flex-col sm:flex-row gap-2.5 flex-shrink-0">
              <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-white border border-gray-200 py-2.5 rounded-xl font-bold text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all min-h-[44px]">Batal</button>
              <button 
                type="submit" 
                form="supplier-form"
                disabled={isSubmitting}
                className="flex-1 bg-[#E65C00] hover:bg-[#CF5300] py-2.5 rounded-xl font-extrabold text-xs text-white transition-all shadow-sm shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px]"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
