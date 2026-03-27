import React, { useState, useEffect } from 'react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { Supplier, Item, PurchaseOrder, PurchaseOrderItem } from '../types';
import { 
  Plus, 
  Search, 
  FileText, 
  Trash2, 
  ShoppingCart, 
  CheckCircle2, 
  XCircle, 
  Clock,
  ChevronDown,
  ChevronUp,
  Download,
  Printer
} from 'lucide-react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function PurchaseOrders() {
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedPo, setExpandedPo] = useState<string | null>(null);

  // Form state
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [poItems, setPoItems] = useState<{ item_id: string; quantity: number; price: number }[]>([
    { item_id: '', quantity: 1, price: 0 }
  ]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [posRes, suppliersRes, itemsRes] = await Promise.all([
        supabase.from('purchase_orders').select('*, supplier:suppliers(*)').order('created_at', { ascending: false }),
        supabase.from('suppliers').select('*').order('name'),
        supabase.from('items').select('*').order('name')
      ]);

      if (posRes.error) {
        if (posRes.error.message.includes('does not exist')) {
          throw new Error('Tabel "purchase_orders" belum ada. Silakan buka menu "Database Setup" untuk membuat tabel.');
        }
        throw posRes.error;
      }
      if (suppliersRes.error) throw suppliersRes.error;
      if (itemsRes.error) throw itemsRes.error;

      // Fetch items for each PO
      const posWithItems = await Promise.all((posRes.data || []).map(async (po) => {
        const { data: poItemsData } = await supabase
          .from('purchase_order_items')
          .select('*, item:items(*)')
          .eq('purchase_order_id', po.id);
        return { ...po, items: poItemsData || [] };
      }));

      setPos(posWithItems);
      setSuppliers(suppliersRes.data || []);
      setItems(itemsRes.data || []);
    } catch (error: any) {
      console.error('Error fetching PO data:', error);
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const addPoItem = () => {
    setPoItems([...poItems, { item_id: '', quantity: 1, price: 0 }]);
  };

  const removePoItem = (index: number) => {
    setPoItems(poItems.filter((_, i) => i !== index));
  };

  const updatePoItem = (index: number, field: string, value: any) => {
    const newItems = [...poItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setPoItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId || poItems.some(i => !i.item_id)) {
      alert('Mohon lengkapi data PO');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const totalAmount = poItems.reduce((acc, item) => acc + (item.quantity * item.price), 0);
      const poId = crypto.randomUUID();

      // 1. Create PO
      const { error: poError } = await supabase.from('purchase_orders').insert([{
        id: poId,
        supplier_id: selectedSupplierId,
        user_id: user.id,
        total_amount: totalAmount,
        status: 'pending'
      }]);

      if (poError) throw poError;

      // 2. Create PO Items
      const { error: itemsError } = await supabase.from('purchase_order_items').insert(
        poItems.map(item => ({
          id: crypto.randomUUID(),
          purchase_order_id: poId,
          ...item
        }))
      );

      if (itemsError) throw itemsError;

      setIsModalOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      console.error('Error saving PO:', error);
      alert('Gagal menyimpan PO: ' + error.message + '\n\nPastikan tabel "purchase_orders" dan "purchase_order_items" sudah ada.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedSupplierId('');
    setPoItems([{ item_id: '', quantity: 1, price: 0 }]);
  };

  const updateStatus = async (id: string, status: 'completed' | 'cancelled') => {
    try {
      const { error } = await supabase.from('purchase_orders').update({ status }).eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (error: any) {
      alert('Gagal update status: ' + error.message);
    }
  };

  const exportToPDF = (po: PurchaseOrder) => {
    const doc = new jsPDF();
    const supplier = suppliers.find(s => s.id === po.supplier_id);
    
    doc.setFontSize(20);
    doc.text('PURCHASE ORDER', 105, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.text('Hotel Alia Matraman', 14, 35);
    doc.text('Jl. Matraman Raya No.224', 14, 40);
    doc.text('Jakarta Timur', 14, 45);
    
    doc.text(`PO Number: ${po.id.slice(0, 8).toUpperCase()}`, 140, 35);
    doc.text(`Date: ${format(new Date(po.created_at), 'dd/MM/yyyy')}`, 140, 40);
    doc.text(`Status: ${po.status.toUpperCase()}`, 140, 45);

    doc.setFontSize(12);
    doc.text('Supplier:', 14, 60);
    doc.setFontSize(10);
    doc.text(supplier?.name || 'Unknown', 14, 65);
    doc.text(supplier?.address || '-', 14, 70);
    doc.text(supplier?.phone || '-', 14, 75);

    const tableData = (po.items || []).map(item => [
      item.item?.name || 'Unknown',
      item.quantity.toString(),
      item.item?.unit || '-',
      `Rp ${item.price.toLocaleString()}`,
      `Rp ${(item.quantity * item.price).toLocaleString()}`
    ]);

    autoTable(doc, {
      startY: 85,
      head: [['Nama Barang', 'Qty', 'Unit', 'Harga Satuan', 'Total']],
      body: tableData,
      foot: [['', '', '', 'GRAND TOTAL', `Rp ${po.total_amount.toLocaleString()}`]],
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] },
      footStyles: { fillColor: [241, 245, 249], textColor: [0, 0, 0], fontStyle: 'bold' }
    });

    doc.save(`PO_${po.id.slice(0, 8)}.pdf`);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 p-4 md:p-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-white">Purchase Orders</h2>
          <p className="text-brand-text-muted">Kelola pesanan barang ke supplier</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="w-full md:w-auto bg-brand-accent hover:bg-blue-600 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-brand-accent/20"
        >
          <Plus className="w-5 h-5" />
          Buat PO Baru
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <div className="text-center py-12 text-brand-text-muted">Loading...</div>
        ) : pos.length === 0 ? (
          <div className="bg-brand-card p-12 rounded-2xl border border-brand-border text-center">
            <ShoppingCart className="w-12 h-12 text-brand-text-muted mx-auto mb-4 opacity-20" />
            <p className="text-brand-text-muted">Belum ada data Purchase Order.</p>
          </div>
        ) : pos.map((po) => (
          <div key={po.id} className="bg-brand-card rounded-2xl border border-brand-border overflow-hidden transition-all hover:border-brand-accent/50">
            <div 
              className="p-4 md:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 cursor-pointer"
              onClick={() => setExpandedPo(expandedPo === po.id ? null : po.id)}
            >
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center",
                  po.status === 'completed' ? "bg-green-500/10 text-green-500" :
                  po.status === 'cancelled' ? "bg-red-500/10 text-red-500" :
                  "bg-blue-500/10 text-blue-500"
                )}>
                  {po.status === 'completed' ? <CheckCircle2 className="w-6 h-6" /> :
                   po.status === 'cancelled' ? <XCircle className="w-6 h-6" /> :
                   <Clock className="w-6 h-6" />}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{po.supplier?.name || 'Unknown Supplier'}</h3>
                  <div className="flex items-center gap-2 text-xs text-brand-text-muted">
                    <span className="font-mono">#{po.id.slice(0, 8).toUpperCase()}</span>
                    <span>•</span>
                    <span>{format(new Date(po.created_at), 'dd MMM yyyy HH:mm')}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
                <div className="text-right">
                  <p className="text-xs text-brand-text-muted uppercase font-bold tracking-wider">Total Amount</p>
                  <p className="text-xl font-bold text-white">Rp {po.total_amount.toLocaleString()}</p>
                </div>
                {expandedPo === po.id ? <ChevronUp className="w-5 h-5 text-brand-text-muted" /> : <ChevronDown className="w-5 h-5 text-brand-text-muted" />}
              </div>
            </div>

            {expandedPo === po.id && (
              <div className="px-4 md:px-6 pb-6 border-t border-brand-border pt-6 animate-in slide-in-from-top-2 duration-200">
                <div className="overflow-x-auto mb-6">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="text-brand-text-muted text-xs font-bold uppercase tracking-wider">
                        <th className="pb-4">Item</th>
                        <th className="pb-4">Qty</th>
                        <th className="pb-4">Price</th>
                        <th className="pb-4 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-border/50">
                      {po.items?.map((item) => (
                        <tr key={item.id}>
                          <td className="py-3 text-white font-medium">{item.item?.name}</td>
                          <td className="py-3 text-brand-text-muted">{item.quantity} {item.item?.unit}</td>
                          <td className="py-3 text-brand-text-muted">Rp {item.price.toLocaleString()}</td>
                          <td className="py-3 text-white font-bold text-right">Rp {(item.quantity * item.price).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap gap-3 justify-end">
                  <button 
                    onClick={() => exportToPDF(po)}
                    className="flex items-center gap-2 px-4 py-2 bg-brand-dark border border-brand-border rounded-lg text-white hover:bg-brand-card transition-all"
                  >
                    <Printer className="w-4 h-4" />
                    Cetak PO
                  </button>
                  {po.status === 'pending' && (
                    <>
                      <button 
                        onClick={() => updateStatus(po.id, 'cancelled')}
                        className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-all"
                      >
                        <XCircle className="w-4 h-4" />
                        Batalkan
                      </button>
                      <button 
                        onClick={() => updateStatus(po.id, 'completed')}
                        className="flex items-center gap-2 px-4 py-2 bg-green-500/10 text-green-500 hover:bg-green-500 hover:text-white rounded-lg transition-all"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Selesaikan
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Modal Buat PO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center z-[100] p-4 overflow-y-auto">
          <div className="bg-brand-card w-full max-w-2xl rounded-2xl border border-brand-border shadow-2xl animate-in zoom-in duration-200 overflow-hidden flex flex-col mt-4 sm:mt-0 max-h-[90vh]">
            <div className="p-6 border-b border-brand-border flex justify-between items-center bg-brand-dark/30">
              <h3 className="text-xl font-bold text-white">Buat Purchase Order Baru</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-brand-text-muted hover:text-white p-2">✕</button>
            </div>
            
            <form id="po-form" onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto flex-grow">
              <div>
                <label className="block text-sm font-medium text-brand-text-muted mb-2">Pilih Supplier</label>
                <select 
                  value={selectedSupplierId} 
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  className="w-full"
                  required
                >
                  <option value="">-- Pilih Supplier --</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.category})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="block text-sm font-medium text-brand-text-muted">Daftar Barang</label>
                  <button 
                    type="button" 
                    onClick={addPoItem}
                    className="text-xs text-brand-accent font-bold hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Tambah Baris
                  </button>
                </div>
                
                {poItems.map((poItem, index) => (
                  <div key={index} className="grid grid-cols-12 gap-3 items-end bg-brand-dark/30 p-3 rounded-xl border border-brand-border/50">
                    <div className="col-span-12 sm:col-span-5">
                      <label className="block text-[10px] text-brand-text-muted uppercase font-bold mb-1">Nama Barang</label>
                      <select 
                        value={poItem.item_id} 
                        onChange={(e) => updatePoItem(index, 'item_id', e.target.value)}
                        className="w-full text-sm bg-brand-card text-white border-brand-border focus:ring-brand-accent"
                        required
                      >
                        <option value="">-- Pilih Barang --</option>
                        {items.map(i => (
                          <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <label className="block text-[10px] text-brand-text-muted uppercase font-bold mb-1">Jumlah</label>
                      <input 
                        type="number" 
                        value={poItem.quantity} 
                        onChange={(e) => updatePoItem(index, 'quantity', parseInt(e.target.value))}
                        className="w-full text-sm"
                        min="1"
                        required
                      />
                    </div>
                    <div className="col-span-6 sm:col-span-4">
                      <label className="block text-[10px] text-brand-text-muted uppercase font-bold mb-1">Harga Satuan (Rp)</label>
                      <input 
                        type="number" 
                        value={poItem.price} 
                        onChange={(e) => updatePoItem(index, 'price', parseInt(e.target.value))}
                        className="w-full text-sm"
                        min="0"
                        required
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-1 flex justify-center">
                      <button 
                        type="button" 
                        onClick={() => removePoItem(index)}
                        disabled={poItems.length === 1}
                        className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg disabled:opacity-20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-brand-dark p-4 rounded-xl border border-brand-border flex justify-between items-center">
                <span className="text-brand-text-muted font-bold">Total Estimasi:</span>
                <span className="text-xl font-bold text-white">
                  Rp {poItems.reduce((acc, item) => acc + (item.quantity * item.price), 0).toLocaleString()}
                </span>
              </div>
            </form>

            <div className="p-6 border-t border-brand-border bg-brand-dark/30 flex flex-col sm:flex-row gap-3">
              <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-brand-dark border border-brand-border py-3 rounded-xl font-bold text-brand-text-muted hover:text-white transition-all">Batal</button>
              <button 
                type="submit" 
                form="po-form"
                disabled={isSubmitting}
                className="flex-1 bg-brand-accent hover:bg-blue-600 py-3 rounded-xl font-bold text-white transition-all shadow-lg shadow-brand-accent/20 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? 'Menyimpan...' : 'Simpan & Cetak PO'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
