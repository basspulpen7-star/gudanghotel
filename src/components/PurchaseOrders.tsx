import React, { useState, useEffect } from 'react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { purchaseOrderService } from '../services/purchaseOrderService';
import { inventoryService } from '../services/inventoryService';
import { queryCache } from '../lib/queryCache';
import { useAuth } from '../contexts/AuthContext';
import { Supplier, Item, PurchaseOrder } from '../types';
import { 
  Plus, 
  Search, 
  Trash2, 
  ShoppingCart, 
  CheckCircle2, 
  XCircle, 
  Clock,
  ChevronDown,
  ChevronUp,
  Download,
  Printer,
  Eye,
  X,
  Edit2,
  AlertTriangle
} from 'lucide-react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import { PurchaseOrderDocument } from './PurchaseOrderDocument';

export function PurchaseOrders() {
  const { user } = useAuth();
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedPo, setExpandedPo] = useState<string | null>(null);
  const [viewingPo, setViewingPo] = useState<PurchaseOrder | null>(null);
  const [editingPoId, setEditingPoId] = useState<string | null>(null);
  const [deleteConfirmationPoId, setDeleteConfirmationPoId] = useState<string | null>(null);
  const [filterMonth, setFilterMonth] = useState<number>(new Date().getMonth());
  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState('');

  // Form state
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [poItems, setPoItems] = useState<{ item_id: string; quantity: number; price: number }[]>([
    { item_id: '', quantity: 1, price: 0 }
  ]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (forceRefresh = false) => {
    setLoading(true);
    try {
      const [posData, suppliersData, itemsData] = await Promise.all([
        purchaseOrderService.getPurchaseOrders(forceRefresh),
        queryCache.fetchWithCache<Supplier[]>(
          'suppliers:all',
          async () => {
            const { data: res, error } = await supabase
              .from('suppliers')
              .select('id, name, contact_person, phone, address, category')
              .order('name');
            if (error) throw error;
            return (res || []) as Supplier[];
          },
          60000,
          forceRefresh
        ),
        inventoryService.getCachedItems(forceRefresh)
      ]);

      setPos(posData);
      setSuppliers(suppliersData || []);
      setItems(itemsData || []);
    } catch (error: any) {
      console.error('Error fetching PO data:', error);
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

  const resetForm = () => {
    setSelectedSupplierId('');
    setPoItems([{ item_id: '', quantity: 1, price: 0 }]);
    setEditingPoId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId) {
      alert('Pilih supplier terlebih dahulu');
      return;
    }

    const invalidItems = poItems.some(item => !item.item_id || item.quantity <= 0);
    if (invalidItems) {
      alert('Pastikan semua item dipilih dan memiliki jumlah > 0');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingPoId) {
        await purchaseOrderService.updatePurchaseOrder(
          editingPoId,
          selectedSupplierId,
          poItems
        );
      } else {
        await purchaseOrderService.createPurchaseOrder(
          selectedSupplierId,
          poItems,
          user?.id || ''
        );
      }
      
      setIsModalOpen(false);
      resetForm();
      fetchData(true);
    } catch (error: any) {
      console.error('Error saving PO:', error);
      alert('Gagal menyimpan Purchase Order: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (po: PurchaseOrder) => {
    setEditingPoId(po.id);
    setSelectedSupplierId(po.supplier_id);
    if (po.items && po.items.length > 0) {
      setPoItems(po.items.map(item => ({
        item_id: item.item_id,
        quantity: item.quantity,
        price: item.price
      })));
    } else {
      setPoItems([{ item_id: '', quantity: 1, price: 0 }]);
    }
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setDeleteConfirmationPoId(id);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmationPoId) return;
    try {
      await purchaseOrderService.deletePurchaseOrder(deleteConfirmationPoId);
      setDeleteConfirmationPoId(null);
      fetchData(true);
    } catch (error: any) {
      alert('Gagal menghapus Purchase Order: ' + error.message);
    }
  };

  const updateStatus = async (po: PurchaseOrder, newStatus: 'completed' | 'cancelled') => {
    try {
      await purchaseOrderService.updateStatus(po.id, newStatus);
      fetchData(true);
    } catch (error: any) {
      alert('Gagal mengubah status PO: ' + error.message);
    }
  };

  const exportToPDF = (po: PurchaseOrder) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const supplier = suppliers.find(s => s.id === po.supplier_id);
    const poNumber = po.po_number || po.id.replace(/[^0-9]/g, '').slice(0, 12);

    doc.setFont('helvetica');

    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text('HOTEL ALIA MATRAMAN', 15, 20);
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text('Jl. Matraman Raya No.224', 15, 25);
    doc.text('Jakarta Timur, 13150', 15, 30);
    doc.text('Phone: (021) 8590 5555', 15, 35);
    
    doc.setFontSize(24);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(33, 41, 54);
    doc.text('PURCHASE ORDER', 195, 25, { align: 'right' });
    doc.setTextColor(0, 0, 0);

    doc.setFontSize(10);
    doc.setLineWidth(0.2);
    
    doc.rect(15, 45, 93, 35);
    doc.rect(108, 45, 93, 35);

    doc.setFont(undefined, 'bold');
    doc.text('To:', 17, 50);
    doc.text('Ship To:', 110, 50);
    
    doc.setFont(undefined, 'normal');
    doc.text(`Name: ${supplier?.contact_person || '-'}`, 17, 55);
    doc.text(`Company: ${supplier?.name || '-'}`, 17, 60);
    doc.text(`Address: ${supplier?.address || '-'}`, 17, 65);
    doc.text(`Phone: ${supplier?.phone || '-'}`, 17, 70);
    
    doc.text(`Name: ${po.user_profile?.full_name || '-'}`, 110, 55);
    doc.text(`Company: Hotel Alia Matraman`, 110, 60);
    doc.text(`Address: Jl. Matraman Raya No.224`, 110, 65);
    doc.text(`City, State, Zip: Jakarta Timur, 13150`, 110, 70);
    doc.text(`Phone: (021) 8590 5555`, 110, 75);

    doc.setFillColor(230, 230, 230);
    doc.rect(15, 85, 186, 8, 'F');
    doc.rect(15, 85, 186, 16);
    
    doc.setFont(undefined, 'bold');
    doc.text('Date', 25, 90);
    doc.text('Requisitioned By', 70, 90);
    doc.text('F.O.B Point', 125, 90);
    doc.text('Terms', 170, 90);
    
    doc.setFont(undefined, 'normal');
    doc.text(format(new Date(po.created_at), 'dd/MM/yyyy'), 25, 97);
    doc.text(po.user_profile?.full_name || '-', 70, 97);
    doc.text('-', 125, 97);
    doc.text('-', 170, 97);

    doc.setFont(undefined, 'bold');
    doc.setFillColor(230, 230, 230);
    doc.rect(15, 105, 186, 8, 'F');
    doc.rect(15, 105, 186, 100);
    
    doc.text('Quantity', 20, 110);
    doc.text('Description', 70, 110);
    doc.text('Unit Price', 145, 110, { align: 'right' });
    doc.text('Total', 195, 110, { align: 'right' });
    
    doc.line(15, 113, 201, 113);
    
    doc.setFont(undefined, 'normal');
    let yPos = 120;
    (po.items || []).forEach(item => {
      doc.text(`${item.quantity} PCS`, 20, yPos);
      doc.text(item.item?.name || 'Unknown', 40, yPos);
      doc.text(`Rp ${item.price.toLocaleString()}`, 150, yPos, { align: 'right' });
      doc.text(`Rp ${(item.quantity * item.price).toLocaleString()}`, 195, yPos, { align: 'right' });
      yPos += 7;
    });

    const footerY = 210;
    doc.rect(15, footerY, 110, 30);
    doc.setFont(undefined, 'bold');
    doc.text('COMMENTS:', 17, footerY + 5);
    doc.setFont(undefined, 'italic');
    doc.text('Please deliver during business hours.', 17, footerY + 12);
    
    doc.rect(125, footerY, 76, 30);
    doc.setFont(undefined, 'bold');
    doc.text('Subtotal:', 130, footerY + 7);
    doc.text('Tax:', 130, footerY + 14);
    doc.text('Shipping:', 130, footerY + 21);
    doc.text('Total:', 130, footerY + 28);
    
    doc.setFont(undefined, 'normal');
    doc.text(`Rp ${po.total_amount.toLocaleString()}`, 198, footerY + 7, { align: 'right' });
    doc.text('Rp 0', 198, footerY + 14, { align: 'right' });
    doc.text('Rp 0', 198, footerY + 21, { align: 'right' });
    doc.setFont(undefined, 'bold');
    doc.text(`Rp ${po.total_amount.toLocaleString()}`, 198, footerY + 28, { align: 'right' });

    doc.save(`PO_${poNumber}.pdf`);
  };

  const handlePrint = () => {
    const printContent = document.getElementById('po-document');
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Purchase Order - ${viewingPo?.id.slice(0, 8)}</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @media print {
              body { margin: 0; padding: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body class="bg-white p-0">
          ${printContent.outerHTML}
          <script>
            window.onload = () => {
              window.print();
              window.onafterprint = () => window.close();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const filteredPos = pos.filter(po => {
    const poDate = new Date(po.created_at);
    const matchesMonth = filterMonth === -1 || poDate.getMonth() === filterMonth;
    const matchesYear = filterYear === -1 || poDate.getFullYear() === filterYear;
    const matchesSearch = searchTerm === '' || 
      po.supplier?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      po.id.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesMonth && matchesYear && matchesSearch;
  });

  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-20 md:pb-6 font-sans">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#252B34] p-4 md:p-6 rounded-2xl border border-[#343B46] shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-[#F1F3F5] tracking-tight">Purchase Orders</h2>
          <p className="text-xs md:text-sm text-[#8E99A6] mt-0.5 font-medium">Kelola pesanan barang ke supplier & vendor Hotel Alia</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="w-full md:w-auto bg-gradient-to-r from-[#E6B85C] to-[#C89B3C] hover:brightness-110 text-[#171A1F] px-5 py-2.5 rounded-xl font-extrabold flex items-center justify-center gap-2 transition-all shadow-sm text-xs sm:text-sm min-h-[44px] cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Buat PO Baru</span>
        </button>
      </div>

      <div className="bg-[#252B34] p-4 rounded-2xl border border-[#343B46] shadow-[0_4px_20px_rgba(0,0,0,0.18)] flex flex-col md:flex-row gap-3 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E99A6]" />
          <input 
            type="text"
            placeholder="Cari PO atau Supplier..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#20252D] border border-[#3A424D] rounded-xl py-2 pl-10 pr-3 text-xs text-[#F1F3F5] placeholder:text-[#6F7985] focus:outline-none focus:border-[#C89B3C] transition-all"
          />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <select 
            value={filterMonth}
            onChange={(e) => setFilterMonth(parseInt(e.target.value))}
            className="flex-1 md:w-36 bg-[#20252D] border border-[#3A424D] rounded-xl py-2 px-3 text-xs font-semibold text-[#D8DEE6] focus:outline-none focus:border-[#C89B3C] transition-all"
          >
            <option value={-1} className="bg-[#20252D] text-[#F1F3F5]">Semua Bulan</option>
            {months.map((month, index) => (
              <option key={month} value={index} className="bg-[#20252D] text-[#F1F3F5]">{month}</option>
            ))}
          </select>
          <select 
            value={filterYear}
            onChange={(e) => setFilterYear(parseInt(e.target.value))}
            className="flex-1 md:w-32 bg-[#20252D] border border-[#3A424D] rounded-xl py-2 px-3 text-xs font-semibold text-[#D8DEE6] focus:outline-none focus:border-[#C89B3C] transition-all"
          >
            <option value={-1} className="bg-[#20252D] text-[#F1F3F5]">Semua Tahun</option>
            {years.map((year) => (
              <option key={year} value={year} className="bg-[#20252D] text-[#F1F3F5]">{year}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {loading ? (
          <div className="text-center py-12 text-[#8E99A6] font-medium text-xs">Memuat data...</div>
        ) : filteredPos.length === 0 ? (
          <div className="bg-[#252B34] p-12 rounded-2xl border border-[#343B46] text-center shadow-sm">
            <ShoppingCart className="w-10 h-10 text-[#6F7985] mx-auto mb-3" />
            <p className="text-xs text-[#8E99A6] font-medium">Tidak ada data Purchase Order yang sesuai filter.</p>
          </div>
        ) : filteredPos.map((po) => (
          <div key={po.id} className="bg-[#252B34] rounded-2xl border border-[#343B46] shadow-[0_4px_20px_rgba(0,0,0,0.18)] overflow-hidden transition-all hover:border-[#C89B3C]/50">
            <div 
              className="p-4 md:p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 cursor-pointer hover:bg-[#20252D]/60 transition-colors"
              onClick={() => setExpandedPo(expandedPo === po.id ? null : po.id)}
            >
              <div className="flex items-center gap-3.5">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs border",
                  po.status === 'completed' ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
                  po.status === 'cancelled' ? "bg-rose-500/15 text-rose-400 border-rose-500/30" :
                  "bg-[#C89B3C]/15 text-[#E0B85A] border-[#C89B3C]/30"
                )}>
                  {po.status === 'completed' ? <CheckCircle2 className="w-5 h-5" /> :
                   po.status === 'cancelled' ? <XCircle className="w-5 h-5" /> :
                   <Clock className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-sm md:text-base font-black text-[#F1F3F5]">{po.supplier?.name || 'Unknown Supplier'}</h3>
                  <div className="flex items-center gap-2 text-[10px] text-[#8E99A6] font-medium mt-0.5">
                    <span className="font-mono bg-[#20252D] px-1.5 py-0.5 rounded text-[#D8DEE6] font-bold border border-[#3A424D]">#{po.po_number || po.id.slice(0, 8).toUpperCase()}</span>
                    <span>•</span>
                    <span>{format(new Date(po.created_at), 'dd MMM yyyy HH:mm')}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                <div className="text-right">
                  <p className="text-[10px] text-[#8E99A6] uppercase font-extrabold tracking-wider">Total Nilai</p>
                  <p className="text-base font-black text-[#F1F3F5]">Rp {po.total_amount.toLocaleString()}</p>
                </div>
                {expandedPo === po.id ? <ChevronUp className="w-4 h-4 text-[#8E99A6]" /> : <ChevronDown className="w-4 h-4 text-[#8E99A6]" />}
              </div>
            </div>

            {expandedPo === po.id && (
              <div className="px-4 md:px-5 pb-5 border-t border-[#343B46] pt-4 bg-[#20252D]/40">
                <div className="overflow-x-auto mb-4 bg-[#20252D] rounded-xl border border-[#3A424D] overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#252B34] text-[#8E99A6] text-[10px] font-extrabold uppercase tracking-wider border-b border-[#343B46]">
                        <th className="px-4 py-2.5">Item</th>
                        <th className="px-4 py-2.5">Qty</th>
                        <th className="px-4 py-2.5">Harga</th>
                        <th className="px-4 py-2.5 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#343B46]">
                      {po.items?.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-2.5 text-[#F1F3F5] font-bold">{item.item?.name}</td>
                          <td className="px-4 py-2.5 text-[#D8DEE6] font-medium">{item.quantity} {item.item?.unit}</td>
                          <td className="px-4 py-2.5 text-[#D8DEE6]">Rp {item.price.toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-[#E0B85A] font-black text-right">Rp {(item.quantity * item.price).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap gap-2 justify-end">
                  <button 
                    onClick={() => setViewingPo(po)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#252B34] border border-[#3A424D] rounded-xl text-xs font-bold text-[#D8DEE6] hover:bg-[#2A303A] transition-all shadow-xs cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Lihat Detail
                  </button>
                  <button 
                    onClick={() => handleEdit(po)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#C89B3C]/15 border border-[#C89B3C]/30 rounded-xl text-xs font-bold text-[#E0B85A] hover:bg-[#C89B3C]/25 transition-all shadow-xs cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit PO
                  </button>
                  <button 
                    onClick={() => handleDelete(po.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#EB5757]/15 border border-[#EB5757]/30 rounded-xl text-xs font-bold text-[#EB5757] hover:bg-[#EB5757]/25 transition-all shadow-xs cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Hapus
                  </button>
                  <button 
                    onClick={() => exportToPDF(po)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#20252D] border border-[#3A424D] rounded-xl text-xs font-bold text-[#D8DEE6] hover:bg-[#2A303A] transition-all shadow-xs cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download PDF
                  </button>
                  <button 
                    onClick={() => setViewingPo(po)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#20252D] border border-[#3A424D] rounded-xl text-xs font-bold text-[#D8DEE6] hover:bg-[#2A303A] transition-all shadow-xs cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Cetak
                  </button>
                  {po.status === 'pending' && (
                    <>
                      <button 
                        onClick={() => updateStatus(po, 'cancelled')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#EB5757] text-white rounded-xl text-xs font-bold hover:brightness-110 transition-all shadow-xs cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Batalkan
                      </button>
                      <button 
                        onClick={() => updateStatus(po, 'completed')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#27AE60] text-white rounded-xl text-xs font-bold hover:brightness-110 transition-all shadow-xs cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
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

      {/* Modal Preview PO */}
      {viewingPo && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-[110] p-4 overflow-y-auto">
          <div className="bg-[#252B34] w-full max-w-4xl rounded-2xl shadow-2xl animate-in zoom-in duration-200 overflow-hidden flex flex-col max-h-[95vh] border border-[#343B46]">
            <div className="p-4 bg-[#20252D] border-b border-[#343B46] flex justify-between items-center no-print">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-black text-[#F1F3F5]">Preview Purchase Order</h3>
                <span className="px-2.5 py-0.5 bg-[#C89B3C]/15 text-[#E0B85A] rounded-lg text-xs font-bold border border-[#C89B3C]/30">
                  #{viewingPo.po_number || viewingPo.id.slice(0, 8).toUpperCase()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => exportToPDF(viewingPo)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-[#252B34] border border-[#3A424D] text-[#D8DEE6] rounded-xl hover:bg-[#2A303A] transition-all font-bold text-xs cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
                <button 
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#E6B85C] to-[#C89B3C] hover:brightness-110 text-[#171A1F] rounded-xl transition-all font-extrabold text-xs shadow-xs cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  Cetak / Print
                </button>
                <button 
                  onClick={() => setViewingPo(null)} 
                  className="p-1.5 text-[#8E99A6] hover:text-[#F1F3F5] rounded-lg transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="flex-grow overflow-y-auto p-4 md:p-8 bg-neutral-900">
              <PurchaseOrderDocument 
                po={viewingPo} 
                supplier={suppliers.find(s => s.id === viewingPo.supplier_id)} 
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal Buat PO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-start sm:items-center justify-center z-[100] p-4 overflow-y-auto">
          <div className="bg-[#252B34] w-full max-w-2xl rounded-2xl border border-[#343B46] shadow-2xl animate-in zoom-in duration-200 overflow-hidden flex flex-col mt-4 sm:mt-0 max-h-[90vh]">
            <div className="p-5 border-b border-[#343B46] flex justify-between items-center bg-[#20252D]">
              <h3 className="text-base font-black text-[#F1F3F5]">
                {editingPoId ? 'Edit Purchase Order' : 'Buat Purchase Order Baru'}
              </h3>
              <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="text-[#8E99A6] hover:text-[#F1F3F5] p-1 cursor-pointer">✕</button>
            </div>
            
            <form id="po-form" onSubmit={handleSubmit} className="p-5 space-y-5 overflow-y-auto flex-grow text-xs">
              <div>
                <label className="block text-xs font-bold text-[#D8DEE6] uppercase mb-1">Pilih Supplier</label>
                <select 
                  value={selectedSupplierId} 
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  className="w-full bg-[#20252D] border border-[#3A424D] rounded-xl p-3 text-sm text-[#F1F3F5] focus:outline-none focus:border-[#C89B3C] min-h-[44px]"
                  required
                >
                  <option value="" className="bg-[#20252D] text-[#8E99A6]">-- Pilih Supplier --</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id} className="bg-[#20252D] text-[#F1F3F5]">{s.name} ({s.category})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-bold text-[#D8DEE6] uppercase">Daftar Barang</label>
                  <button 
                    type="button" 
                    onClick={addPoItem}
                    className="text-xs text-[#E0B85A] font-extrabold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah Baris
                  </button>
                </div>
                
                {poItems.map((poItem, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2.5 items-end bg-[#20252D] p-3 rounded-xl border border-[#3A424D]">
                    <div className="col-span-12 sm:col-span-5">
                      <label className="block text-[10px] text-[#8E99A6] uppercase font-extrabold mb-1">Nama Barang</label>
                      <select 
                        value={poItem.item_id} 
                        onChange={(e) => updatePoItem(index, 'item_id', e.target.value)}
                        className="w-full text-xs bg-[#252B34] text-[#F1F3F5] border border-[#3A424D] rounded-lg p-2 focus:border-[#C89B3C] focus:outline-none"
                        required
                      >
                        <option value="" className="bg-[#252B34] text-[#8E99A6]">-- Pilih Barang --</option>
                        {items.map(i => (
                          <option key={i.id} value={i.id} className="bg-[#252B34] text-[#F1F3F5]">{i.name} ({i.unit})</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <label className="block text-[10px] text-[#8E99A6] uppercase font-extrabold mb-1">Jumlah</label>
                      <input 
                        type="number" 
                        value={poItem.quantity} 
                        onChange={(e) => updatePoItem(index, 'quantity', parseInt(e.target.value))}
                        className="w-full text-xs bg-[#252B34] text-[#F1F3F5] border border-[#3A424D] rounded-lg p-2 focus:border-[#C89B3C] focus:outline-none"
                        min="1"
                        required
                      />
                    </div>
                    <div className="col-span-6 sm:col-span-4">
                      <label className="block text-[10px] text-[#8E99A6] uppercase font-extrabold mb-1">Harga Satuan (Rp)</label>
                      <input 
                        type="number" 
                        value={poItem.price} 
                        onChange={(e) => updatePoItem(index, 'price', parseInt(e.target.value))}
                        className="w-full text-xs bg-[#252B34] text-[#F1F3F5] border border-[#3A424D] rounded-lg p-2 focus:border-[#C89B3C] focus:outline-none"
                        min="0"
                        required
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-1 flex justify-center">
                      <button 
                        type="button" 
                        onClick={() => removePoItem(index)}
                        disabled={poItems.length === 1}
                        className="p-2 text-[#EB5757] hover:bg-[#EB5757]/20 rounded-lg disabled:opacity-20 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-[#20252D] p-4 rounded-xl border border-[#3A424D] flex justify-between items-center">
                <span className="text-xs text-[#E0B85A] font-extrabold uppercase">Total Estimasi:</span>
                <span className="text-lg font-black text-[#F1F3F5]">
                  Rp {poItems.reduce((acc, item) => acc + (item.quantity * item.price), 0).toLocaleString()}
                </span>
              </div>
            </form>

            <div className="p-4 border-t border-[#343B46] bg-[#20252D] flex flex-col sm:flex-row gap-2.5">
              <button type="button" onClick={() => { setIsModalOpen(false); resetForm(); }} className="flex-1 bg-[#252B34] border border-[#3A424D] py-2.5 rounded-xl font-bold text-xs text-[#D8DEE6] hover:bg-[#2A303A] transition-all min-h-[44px] cursor-pointer">Batal</button>
              <button 
                type="submit" 
                form="po-form"
                disabled={isSubmitting}
                className="flex-1 bg-gradient-to-r from-[#E6B85C] to-[#C89B3C] hover:brightness-110 py-2.5 rounded-xl font-extrabold text-xs text-[#171A1F] transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px] cursor-pointer"
              >
                {isSubmitting ? 'Menyimpan...' : 'Simpan & Cetak PO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Hapus */}
      {deleteConfirmationPoId && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-[120] p-4">
          <div className="bg-[#252B34] w-full max-w-sm rounded-2xl border border-[#343B46] shadow-2xl p-6 space-y-4 animate-in zoom-in duration-200 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#EB5757]/15 border border-[#EB5757]/30 flex items-center justify-center text-[#EB5757] mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-[#F1F3F5]">Hapus Purchase Order?</h3>
              <p className="text-xs text-[#8E99A6] font-medium mt-1">Tindakan ini tidak dapat dibatalkan.</p>
            </div>
            <div className="flex gap-2 pt-2">
              <button 
                onClick={() => setDeleteConfirmationPoId(null)}
                className="flex-1 bg-[#20252D] border border-[#3A424D] py-2.5 rounded-xl text-xs font-bold text-[#D8DEE6] hover:bg-[#2A303A] cursor-pointer"
              >
                Batal
              </button>
              <button 
                onClick={confirmDelete}
                className="flex-1 bg-[#EB5757] hover:bg-rose-700 py-2.5 rounded-xl text-xs font-bold text-white shadow-sm cursor-pointer"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
