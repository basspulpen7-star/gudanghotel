import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Supplier } from '../types';
import { Plus, Search, Edit2, Trash2, Phone, User, MapPin, Activity } from 'lucide-react';
import { queryCache } from '../lib/queryCache';
import { useAuth } from '../contexts/AuthContext';

interface SuppliersProps {
  globalSearch?: string;
}

export function Suppliers({ globalSearch = '' }: SuppliersProps) {
  const { user } = useAuth();
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
  }, []);

  const fetchSuppliers = async (forceRefresh = false) => {
    setLoading(true);
    try {
      const data = await queryCache.fetchWithCache<Supplier[]>(
        'suppliers:all',
        async () => {
          const { data: res, error } = await supabase
            .from('suppliers')
            .select('id, name, contact_person, phone, address, category, user_id, created_at')
            .order('name');
          if (error) throw error;
          return (res || []) as Supplier[];
        },
        60000,
        forceRefresh
      );
      if (data) setSuppliers(data);
    } catch (error: any) {
      console.error('Error fetching suppliers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
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

      queryCache.invalidate('suppliers');
      setIsModalOpen(false);
      setEditingSupplier(null);
      resetForm();
      fetchSuppliers(true);
    } catch (error: any) {
      console.error('Error saving supplier:', error);
      alert('Gagal menyimpan data supplier: ' + (error.message || 'Error tidak diketahui'));
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
        queryCache.invalidate('suppliers');
        fetchSuppliers(true);
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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#252B34] p-4 md:p-6 rounded-2xl border border-[#343B46] shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-[#F1F3F5] tracking-tight">Data Supplier</h2>
          <p className="text-xs md:text-sm text-[#8E99A6] mt-0.5 font-medium">Kelola daftar vendor dan supplier mitra Hotel Alia</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button 
            onClick={fetchSuppliers}
            className="flex-1 md:flex-none bg-[#20252D] text-[#D8DEE6] hover:text-[#F1F3F5] px-4 py-2.5 rounded-xl border border-[#3A424D] hover:bg-[#2A303A] transition-all flex items-center justify-center gap-2 text-xs font-bold min-h-[44px] cursor-pointer"
          >
            <Activity className="w-4 h-4 text-[#E0B85A]" />
            <span>Refresh</span>
          </button>
          <button 
            onClick={() => { resetForm(); setEditingSupplier(null); setIsModalOpen(true); }}
            className="flex-1 md:flex-none bg-gradient-to-r from-[#E6B85C] to-[#C89B3C] hover:brightness-110 text-[#171A1F] px-5 py-2.5 rounded-xl font-extrabold flex items-center justify-center gap-2 transition-all shadow-sm text-xs sm:text-sm min-h-[44px] cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Tambah Supplier</span>
          </button>
        </div>
      </div>

      <div className="bg-[#252B34] p-4 rounded-2xl border border-[#343B46] shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E99A6]" />
          <input 
            type="text" 
            placeholder="Cari supplier, PIC, atau kategori..." 
            className="w-full pl-10 pr-3 py-2 text-xs bg-[#20252D] border border-[#3A424D] rounded-xl text-[#F1F3F5] placeholder:text-[#6F7985] focus:outline-none focus:border-[#C89B3C] transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {loading ? (
          <div className="col-span-full text-center py-12 text-[#8E99A6] font-medium text-xs">Memuat data...</div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="col-span-full bg-[#252B34] p-12 rounded-2xl border border-[#343B46] text-center shadow-sm">
            <p className="text-xs text-[#8E99A6] font-medium">Tidak ada data supplier yang ditemukan.</p>
          </div>
        ) : filteredSuppliers.map((supplier) => (
          <div key={supplier.id} className="bg-[#252B34] p-5 rounded-2xl border border-[#343B46] shadow-[0_4px_20px_rgba(0,0,0,0.18)] hover:border-[#C89B3C]/50 transition-all group">
            <div className="flex justify-between items-start mb-3.5">
              <div>
                <h3 className="text-base font-black text-[#F1F3F5]">{supplier.name}</h3>
                <span className="inline-block px-2 py-0.5 bg-[#C89B3C]/15 text-[#E0B85A] rounded-md text-[10px] font-bold uppercase border border-[#C89B3C]/30 mt-1">
                  {supplier.category || 'General Vendor'}
                </span>
              </div>
              <div className="flex gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleEdit(supplier)} className="p-1.5 hover:bg-[#20252D] text-[#E0B85A] rounded-lg transition-colors cursor-pointer">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(supplier.id)} className="p-1.5 hover:bg-[#EB5757]/20 text-[#EB5757] rounded-lg transition-colors cursor-pointer">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="space-y-2 pt-2 border-t border-[#343B46]">
              <div className="flex items-center gap-2.5 text-xs text-[#D8DEE6]">
                <User className="w-3.5 h-3.5 text-[#E0B85A] flex-shrink-0" />
                <span className="font-semibold">{supplier.contact_person || '-'}</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-[#D8DEE6]">
                <Phone className="w-3.5 h-3.5 text-[#E0B85A] flex-shrink-0" />
                <span className="font-mono text-[#8E99A6]">{supplier.phone || '-'}</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-[#8E99A6]">
                <MapPin className="w-3.5 h-3.5 text-[#8E99A6] flex-shrink-0" />
                <span className="line-clamp-1">{supplier.address || '-'}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-start sm:items-center justify-center z-[100] p-4 overflow-y-auto">
          <div className="bg-[#252B34] w-full max-w-md rounded-2xl border border-[#343B46] shadow-2xl animate-in zoom-in duration-200 overflow-hidden flex flex-col mt-4 sm:mt-0 max-h-[90vh]">
            <div className="p-5 border-b border-[#343B46] flex justify-between items-center bg-[#20252D] flex-shrink-0">
              <h3 className="text-base font-black text-[#F1F3F5]">{editingSupplier ? 'Edit Supplier' : 'Tambah Supplier Baru'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-[#8E99A6] hover:text-[#F1F3F5] p-1 cursor-pointer">✕</button>
            </div>
            
            <form id="supplier-form" onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-grow text-xs">
              <div>
                <label className="block text-xs font-bold text-[#D8DEE6] uppercase mb-1">Nama Perusahaan / Vendor</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-[#20252D] border border-[#3A424D] rounded-xl p-3 text-sm text-[#F1F3F5] focus:outline-none focus:border-[#C89B3C] min-h-[44px]" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#D8DEE6] uppercase mb-1">Nama Kontak / PIC</label>
                <input type="text" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className="w-full bg-[#20252D] border border-[#3A424D] rounded-xl p-3 text-sm text-[#F1F3F5] focus:outline-none focus:border-[#C89B3C] min-h-[44px]" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#D8DEE6] uppercase mb-1">Nomor Telepon</label>
                <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full bg-[#20252D] border border-[#3A424D] rounded-xl p-3 text-sm text-[#F1F3F5] focus:outline-none focus:border-[#C89B3C] min-h-[44px]" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#D8DEE6] uppercase mb-1">Alamat</label>
                <textarea value={address} onChange={(e) => setAddress(e.target.value)} className="w-full bg-[#20252D] border border-[#3A424D] rounded-xl p-3 text-sm text-[#F1F3F5] focus:outline-none focus:border-[#C89B3C] h-20 resize-none" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#D8DEE6] uppercase mb-1">Keterangan Barang / Kategori</label>
                <input 
                  type="text" 
                  value={category} 
                  onChange={(e) => setCategory(e.target.value)} 
                  className="w-full bg-[#20252D] border border-[#3A424D] rounded-xl p-3 text-sm text-[#F1F3F5] focus:outline-none focus:border-[#C89B3C] min-h-[44px]" 
                  placeholder="Contoh: Sayuran, Alat Tulis, Linen, dll"
                  required 
                />
              </div>
            </form>

            <div className="p-4 border-t border-[#343B46] bg-[#20252D] flex flex-col sm:flex-row gap-2.5 flex-shrink-0">
              <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-[#252B34] border border-[#3A424D] py-2.5 rounded-xl font-bold text-xs text-[#D8DEE6] hover:bg-[#2A303A] transition-all min-h-[44px] cursor-pointer">Batal</button>
              <button 
                type="submit" 
                form="supplier-form"
                disabled={isSubmitting}
                className="flex-1 bg-gradient-to-r from-[#E6B85C] to-[#C89B3C] hover:brightness-110 py-2.5 rounded-xl font-extrabold text-xs text-[#171A1F] transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px] cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-[#171A1F]/30 border-t-[#171A1F] rounded-full animate-spin" />
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
