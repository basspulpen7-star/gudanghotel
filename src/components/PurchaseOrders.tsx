import React, { useState, useEffect } from 'react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { purchaseOrderService } from '../services/purchaseOrderService';
import { inventoryService } from '../services/inventoryService';
import { queryCache } from '../lib/queryCache';
import { useAuth } from '../contexts/AuthContext';
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
  Printer,
  Eye,
  X,
  Edit2,
  AlertTriangle
} from 'lucide-react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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
      alert(error.message || 'Gagal memuat data Purchase Orders');
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

  const generatePoNumber = async () => {
    try {
      const today = new Date();
      const dateStr = format(today, 'yyyyMMdd');
      
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('po_number')
        .ilike('po_number', `${dateStr}%`)
        .order('po_number', { ascending: false })
        .limit(1);

      if (error) {
        // If column doesn't exist yet, we'll return a timestamp-based number
        if (error.message.includes('column "po_number" does not exist')) {
          return format(new Date(), 'yyyyMMddHHmmss');
        }
        throw error;
      }

      if (data && data.length > 0 && data[0].po_number) {
        const lastPart = data[0].po_number.slice(8);
        const lastNumber = parseInt(lastPart) || 0;
        const nextNumber = (lastNumber + 1).toString().padStart(4, '0');
        return `${dateStr}${nextNumber}`;
      }

      return `${dateStr}0001`;
    } catch (err) {
      console.error('Error generating PO number:', err);
      return format(new Date(), 'yyyyMMddHHmmss');
    }
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

      // Double check profile exists to avoid FK error
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (!profile) {
        await supabase.from('profiles').insert([{
          id: user.id,
          full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
          email: user.email,
          role: 'staff'
        }]);
      }

      const totalAmount = poItems.reduce((acc, item) => acc + (item.quantity * item.price), 0);
      
      if (editingPoId) {
        // UPDATE EXISTING PO
        const { error: poError } = await supabase.from('purchase_orders').update({
          supplier_id: selectedSupplierId,
          total_amount: totalAmount,
        }).eq('id', editingPoId);

        if (poError) throw poError;

        await supabase.from('purchase_order_items').delete().eq('purchase_order_id', editingPoId);

        const { error: itemsError } = await supabase.from('purchase_order_items').insert(
          poItems.map(item => ({
            id: crypto.randomUUID(),
            purchase_order_id: editingPoId,
            ...item
          }))
        );

        if (itemsError) throw itemsError;
      } else {
        // CREATE NEW PO
        const poId = crypto.randomUUID();
        const poNumber = await generatePoNumber();

        // 1. Create PO
        const { error: poError } = await supabase.from('purchase_orders').insert([{
          id: poId,
          po_number: poNumber,
          supplier_id: selectedSupplierId,
          user_id: user.id,
          total_amount: totalAmount,
          status: 'pending'
        }]);

        if (poError) {
          // Fallback if po_number column missing
          if (poError.message.includes('column "po_number" does not exist')) {
            const { error: fallbackError } = await supabase.from('purchase_orders').insert([{
              id: poId,
              supplier_id: selectedSupplierId,
              user_id: user.id,
              total_amount: totalAmount,
              status: 'pending'
            }]);
            if (fallbackError) throw fallbackError;
          } else {
            throw poError;
          }
        }

        // 2. Create PO Items
        const { error: itemsError } = await supabase.from('purchase_order_items').insert(
          poItems.map(item => ({
            id: crypto.randomUUID(),
            purchase_order_id: poId,
            ...item
          }))
        );

        if (itemsError) throw itemsError;
      }

      setIsModalOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      console.error('Error saving PO:', error);
      alert('Gagal menyimpan PO: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedSupplierId('');
    setPoItems([{ item_id: '', quantity: 1, price: 0 }]);
    setEditingPoId(null);
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

  const handleDelete = async (id: string) => {
    setDeleteConfirmationPoId(id);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmationPoId) return;

    try {
      // Items will be deleted automatically if cascade is set, 
      // but let's be explicit just in case
      await supabase.from('purchase_order_items').delete().eq('purchase_order_id', deleteConfirmationPoId);
      const { error } = await supabase.from('purchase_orders').delete().eq('id', deleteConfirmationPoId);
      
      if (error) throw error;
      setDeleteConfirmationPoId(null);
      fetchData();
    } catch (error: any) {
      alert('Gagal menghapus PO: ' + error.message);
    }
  };

  const updateStatus = async (po: PurchaseOrder, status: 'completed' | 'cancelled') => {
    try {
      if (status === 'completed') {
        await purchaseOrderService.completePurchaseOrder(po, user?.id);
      } else {
        const { error } = await supabase.from('purchase_orders').update({ status }).eq('id', po.id);
        if (error) throw error;
      }
      fetchData(true);
    } catch (error: any) {
      alert('Gagal update status: ' + error.message);
    }
  };

  const exportToPDF = (po: PurchaseOrder) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const supplier = suppliers.find(s => s.id === po.supplier_id);
    
    // PO number - use po_number if available, else numeric-only version of ID
    const poNumber = po.po_number || po.id.replace(/[^0-9]/g, '').slice(0, 12);

    // Font setup
    doc.setFont('helvetica');

    // 1. Header (Left: Company, Right: PO Title)
    // Left
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text('HOTEL ALIA MATRAMAN', 15, 20);
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text('Jl. Matraman Raya No.224', 15, 25);
    doc.text('Jakarta Timur, 13150', 15, 30);
    doc.text('Phone: (021) 8590 5555', 15, 35);
    
    // Right
    doc.setFontSize(24);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(33, 41, 54);
    doc.text('PURCHASE ORDER', 195, 25, { align: 'right' });
    doc.setTextColor(0, 0, 0);

    // 2. To & Ship To Section
    doc.setFontSize(10);
    doc.setLineWidth(0.2);
    
    // Rectangles
    doc.rect(15, 45, 93, 35); // To
    doc.rect(108, 45, 93, 35); // Ship To

    // Labels
    doc.setFont(undefined, 'bold');
    doc.text('To:', 17, 50);
    doc.text('Ship To:', 110, 50);
    
    // Content
    doc.setFont(undefined, 'normal');
    // To
    doc.text(`Name: ${supplier?.contact_person || '-'}`, 17, 55);
    doc.text(`Company: ${supplier?.name || '-'}`, 17, 60);
    doc.text(`Address: ${supplier?.address || '-'}`, 17, 65);
    doc.text(`Phone: ${supplier?.phone || '-'}`, 17, 70);
    
    // Ship To
    doc.text(`Name: ${po.user_profile?.full_name || '-'}`, 110, 55);
    doc.text(`Company: Hotel Alia Matraman`, 110, 60);
    doc.text(`Address: Jl. Matraman Raya No.224`, 110, 65);
    doc.text(`City, State, Zip: Jakarta Timur, 13150`, 110, 70);
    doc.text(`Phone: (021) 8590 5555`, 110, 75);

    // 3. Order Info Section (4 columns)
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

    // 4. Items Table
    doc.setFont(undefined, 'bold');
    doc.setFillColor(230, 230, 230);
    doc.rect(15, 105, 186, 8, 'F');
    doc.rect(15, 105, 186, 100); // Table body outline
    
    doc.text('Quantity', 20, 110);
    doc.text('Description', 70, 110);
    doc.text('Unit Price', 145, 110, { align: 'right' });
    doc.text('Total', 195, 110, { align: 'right' });
    
    // Line separator
    doc.line(15, 113, 201, 113);
    
    // Items
    doc.setFont(undefined, 'normal');
    let yPos = 120;
    (po.items || []).forEach(item => {
      doc.text(`${item.quantity} PCS`, 20, yPos);
      doc.text(item.item?.name || 'Unknown', 40, yPos);
      doc.text(`Rp ${item.price.toLocaleString()}`, 150, yPos, { align: 'right' });
      doc.text(`Rp ${(item.quantity * item.price).toLocaleString()}`, 195, yPos, { align: 'right' });
      yPos += 7;
    });

    // 5. Footer (Comments + Totals)
    const footerY = 210;
    doc.rect(15, footerY, 110, 30); // Comments Box
    doc.setFont(undefined, 'bold');
    doc.text('COMMENTS:', 17, footerY + 5);
    doc.setFont(undefined, 'italic');
    doc.text('Please deliver during business hours.', 17, footerY + 12);
    
    // Totals Box
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

  const OLD_exportToPDF = (po: PurchaseOrder) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const supplier = suppliers.find(s => s.id === po.supplier_id);
    
    // Header
    doc.setFontSize(22);
    doc.setFont(undefined, 'bold');
    doc.text('Hotel Alia Matraman', 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text('Jl. Matraman Raya No.224, Jakarta Timur, 13150', 105, 26, { align: 'center' });
    doc.text('Phone: (021) 8590 5555', 105, 31, { align: 'center' });

    doc.setLineWidth(0.5);
    doc.line(14, 35, 196, 35); // Horizontal line
    
    doc.setFontSize(20);
    doc.setFont(undefined, 'bold');
    doc.text('PURCHASE ORDER', 105, 45, { align: 'center' });

    // PO Details Table
    doc.setDrawColor(150);
    doc.rect(14, 52, 182, 10);
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text(`PO Number: #${po.id.slice(0, 8).toUpperCase()}`, 16, 58);
    // Masih menggunakan tanggal, nanti kita tambahkan field lain jika ada di data
    doc.text(`Date: ${format(new Date(po.created_at), 'dd/MM/yyyy')}`, 106, 58);
    
    // Grid details baru sesuai contoh
    doc.rect(14, 65, 182, 10);
    doc.setFontSize(9);
    doc.text('Date', 30, 71);
    doc.text('Requisitioned By', 80, 71);
    doc.text('F.O.B Point', 130, 71);
    doc.text('Terms', 170, 71);
    
    doc.rect(14, 75, 45, 8); // Date val
    doc.rect(59, 75, 45, 8); // Req By val
    doc.rect(14, 75, 45, 8); // Date val
    doc.rect(59, 75, 45, 8); // Req By val
    doc.rect(104, 75, 45, 8); // FOB val
    doc.rect(149, 75, 47, 8); // Terms val
    
    doc.setFont(undefined, 'normal');
    doc.text(`${format(new Date(po.created_at), 'dd/MM/yyyy')}`, 30, 80);
    doc.text(`${po.user_profile?.full_name || 'Staff'}`, 80, 80);
    doc.text('-', 130, 80);
    doc.text('-', 170, 80);

    // Supplier & Ship To
    doc.rect(14, 85, 91, 35);
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('To:', 16, 90);
    doc.setFont(undefined, 'normal');
    doc.text(`${supplier?.name || '-'}`, 16, 95);
    doc.text(`${supplier?.address || '-'}`, 16, 100);

    doc.rect(105, 85, 91, 35);
    doc.setFont(undefined, 'bold');
    doc.text('Ship To:', 107, 90);
    doc.setFont(undefined, 'normal');
    doc.text(`Hotel Alia Matraman`, 107, 95);
    doc.text(`Jl. Matraman Raya No.224`, 107, 100);

    // Items
    const tableData = (po.items || []).map(item => [
      item.quantity.toString() + ' ' + (item.item?.unit || ''),
      item.item?.name || 'Unknown',
      `Rp ${item.price.toLocaleString()}`,
      `Rp ${(item.quantity * item.price).toLocaleString()}`
    ]);

    autoTable(doc, {
      startY: 125,
      head: [['Quantity', 'Description', 'Unit Price', 'Total']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0], fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 2, lineColor: [0, 0, 0] },
    });

    const finalY = (doc as any).lastAutoTable.finalY;
    
    // Comments & Totals
    doc.rect(14, finalY, 115, 25);
    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    doc.text('COMMENTS:', 16, finalY + 5);
    doc.setFont(undefined, 'italic');
    doc.text('Please deliver during business hours.', 16, finalY + 10);

    doc.rect(129, finalY, 67, 25); // Totals box
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('Subtotal:', 140, finalY + 6);
    doc.text(`Rp ${po.total_amount.toLocaleString()}`, 190, finalY + 6, { align: 'right' });
    doc.text('Tax:', 140, finalY + 11);
    doc.text('Rp 0', 190, finalY + 11, { align: 'right' });
    doc.text('Shipping:', 140, finalY + 16);
    doc.text('Rp 0', 190, finalY + 16, { align: 'right' });
    doc.text('Total:', 140, finalY + 21);
    doc.text(`Rp ${po.total_amount.toLocaleString()}`, 190, finalY + 21, { align: 'right' });

    doc.save(`PO_${po.id.slice(0, 8)}.pdf`);
  };

  const handlePrint = () => {
    const printContent = document.getElementById('po-document');
    if (!printContent) return;

    const originalContents = document.body.innerHTML;
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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 md:p-6 rounded-2xl border border-gray-200/90 shadow-sm">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">Purchase Orders</h2>
          <p className="text-xs md:text-sm text-gray-500 mt-0.5 font-medium">Kelola pesanan barang ke supplier & vendor</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="w-full md:w-auto bg-[#E65C00] hover:bg-[#CF5300] text-white px-5 py-2.5 rounded-xl font-extrabold flex items-center justify-center gap-2 transition-all shadow-sm shadow-orange-500/20 text-xs sm:text-sm min-h-[44px]"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>Buat PO Baru</span>
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-gray-200/90 shadow-sm flex flex-col md:flex-row gap-3 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            type="text"
            placeholder="Cari PO atau Supplier..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2 pl-9 pr-3 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500 focus:bg-white transition-all"
          />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <select 
            value={filterMonth}
            onChange={(e) => setFilterMonth(parseInt(e.target.value))}
            className="flex-1 md:w-36 bg-gray-50 border border-gray-200 rounded-xl py-2 px-3 text-xs font-semibold text-gray-800 focus:outline-none focus:border-amber-500 focus:bg-white transition-all"
          >
            <option value={-1}>Semua Bulan</option>
            {months.map((month, index) => (
              <option key={month} value={index}>{month}</option>
            ))}
          </select>
          <select 
            value={filterYear}
            onChange={(e) => setFilterYear(parseInt(e.target.value))}
            className="flex-1 md:w-32 bg-gray-50 border border-gray-200 rounded-xl py-2 px-3 text-xs font-semibold text-gray-800 focus:outline-none focus:border-amber-500 focus:bg-white transition-all"
          >
            <option value={-1}>Semua Tahun</option>
            {years.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {loading ? (
          <div className="text-center py-12 text-gray-500 font-medium text-xs">Memuat data...</div>
        ) : filteredPos.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl border border-gray-200/90 text-center shadow-sm">
            <ShoppingCart className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-xs text-gray-500 font-medium">Tidak ada data Purchase Order yang sesuai filter.</p>
          </div>
        ) : filteredPos.map((po) => (
          <div key={po.id} className="bg-white rounded-2xl border border-gray-200/90 shadow-sm overflow-hidden transition-all hover:border-amber-500/50">
            <div 
              className="p-4 md:p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 cursor-pointer hover:bg-amber-50/20"
              onClick={() => setExpandedPo(expandedPo === po.id ? null : po.id)}
            >
              <div className="flex items-center gap-3.5">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs border",
                  po.status === 'completed' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                  po.status === 'cancelled' ? "bg-red-50 text-red-700 border-red-200" :
                  "bg-amber-50 text-amber-700 border-amber-200"
                )}>
                  {po.status === 'completed' ? <CheckCircle2 className="w-5 h-5" /> :
                   po.status === 'cancelled' ? <XCircle className="w-5 h-5" /> :
                   <Clock className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-sm md:text-base font-black text-gray-900">{po.supplier?.name || 'Unknown Supplier'}</h3>
                  <div className="flex items-center gap-2 text-[10px] text-gray-500 font-medium mt-0.5">
                    <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 font-bold">#{po.po_number || po.id.slice(0, 8).toUpperCase()}</span>
                    <span>•</span>
                    <span>{format(new Date(po.created_at), 'dd MMM yyyy HH:mm')}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                <div className="text-right">
                  <p className="text-[10px] text-gray-400 uppercase font-extrabold tracking-wider">Total Nilai</p>
                  <p className="text-base font-black text-gray-900">Rp {po.total_amount.toLocaleString()}</p>
                </div>
                {expandedPo === po.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </div>
            </div>

            {expandedPo === po.id && (
              <div className="px-4 md:px-5 pb-5 border-t border-gray-100 pt-4 bg-gray-50/50">
                <div className="overflow-x-auto mb-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 text-[10px] font-extrabold uppercase tracking-wider border-b border-gray-200">
                        <th className="px-4 py-2.5">Item</th>
                        <th className="px-4 py-2.5">Qty</th>
                        <th className="px-4 py-2.5">Harga</th>
                        <th className="px-4 py-2.5 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {po.items?.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-2.5 text-gray-900 font-bold">{item.item?.name}</td>
                          <td className="px-4 py-2.5 text-gray-600 font-medium">{item.quantity} {item.item?.unit}</td>
                          <td className="px-4 py-2.5 text-gray-600">Rp {item.price.toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-gray-900 font-black text-right">Rp {(item.quantity * item.price).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap gap-2 justify-end">
                  <button 
                    onClick={() => setViewingPo(po)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-100 transition-all shadow-xs"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Lihat Detail
                  </button>
                  <button 
                    onClick={() => handleEdit(po)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-700 hover:bg-amber-100 transition-all shadow-xs"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit PO
                  </button>
                  <button 
                    onClick={() => handleDelete(po.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-600 hover:bg-red-100 transition-all shadow-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Hapus
                  </button>
                  <button 
                    onClick={() => exportToPDF(po)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 hover:bg-gray-200 transition-all shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download PDF
                  </button>
                  <button 
                    onClick={() => setViewingPo(po)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 hover:bg-gray-200 transition-all shadow-xs"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Cetak
                  </button>
                  {po.status === 'pending' && (
                    <>
                      <button 
                        onClick={() => updateStatus(po, 'cancelled')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700 transition-all shadow-xs"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Batalkan
                      </button>
                      <button 
                        onClick={() => updateStatus(po, 'completed')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all shadow-xs"
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[110] p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl animate-in zoom-in duration-200 overflow-hidden flex flex-col max-h-[95vh] border border-gray-200">
            <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center no-print">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-black text-gray-900">Preview Purchase Order</h3>
                <span className="px-2.5 py-0.5 bg-amber-500/10 text-amber-700 rounded-lg text-xs font-bold border border-amber-500/20">
                  #{viewingPo.po_number || viewingPo.id.slice(0, 8).toUpperCase()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => exportToPDF(viewingPo)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 border border-gray-200 text-gray-800 rounded-xl hover:bg-gray-200 transition-all font-bold text-xs"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
                <button 
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#E65C00] text-white rounded-xl hover:bg-[#CF5300] transition-all font-extrabold text-xs shadow-xs"
                >
                  <Printer className="w-4 h-4" />
                  Cetak / Print
                </button>
                <button 
                  onClick={() => setViewingPo(null)} 
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="flex-grow overflow-y-auto p-4 md:p-8 bg-gray-100">
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
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-start sm:items-center justify-center z-[100] p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-2xl border border-gray-200 shadow-2xl animate-in zoom-in duration-200 overflow-hidden flex flex-col mt-4 sm:mt-0 max-h-[90vh]">
            <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h3 className="text-base font-black text-gray-900">
                {editingPoId ? 'Edit Purchase Order' : 'Buat Purchase Order Baru'}
              </h3>
              <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="text-gray-400 hover:text-gray-600 p-1">✕</button>
            </div>
            
            <form id="po-form" onSubmit={handleSubmit} className="p-5 space-y-5 overflow-y-auto flex-grow">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Pilih Supplier</label>
                <select 
                  value={selectedSupplierId} 
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:outline-none focus:border-amber-500 focus:bg-white min-h-[44px]"
                  required
                >
                  <option value="">-- Pilih Supplier --</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.category})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-bold text-gray-700 uppercase">Daftar Barang</label>
                  <button 
                    type="button" 
                    onClick={addPoItem}
                    className="text-xs text-[#E65C00] font-extrabold hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah Baris
                  </button>
                </div>
                
                {poItems.map((poItem, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2.5 items-end bg-gray-50 p-3 rounded-xl border border-gray-200">
                    <div className="col-span-12 sm:col-span-5">
                      <label className="block text-[10px] text-gray-500 uppercase font-extrabold mb-1">Nama Barang</label>
                      <select 
                        value={poItem.item_id} 
                        onChange={(e) => updatePoItem(index, 'item_id', e.target.value)}
                        className="w-full text-xs bg-white text-gray-900 border border-gray-200 rounded-lg p-2 focus:border-amber-500 focus:outline-none"
                        required
                      >
                        <option value="">-- Pilih Barang --</option>
                        {items.map(i => (
                          <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <label className="block text-[10px] text-gray-500 uppercase font-extrabold mb-1">Jumlah</label>
                      <input 
                        type="number" 
                        value={poItem.quantity} 
                        onChange={(e) => updatePoItem(index, 'quantity', parseInt(e.target.value))}
                        className="w-full text-xs bg-white text-gray-900 border border-gray-200 rounded-lg p-2 focus:border-amber-500 focus:outline-none"
                        min="1"
                        required
                      />
                    </div>
                    <div className="col-span-6 sm:col-span-4">
                      <label className="block text-[10px] text-gray-500 uppercase font-extrabold mb-1">Harga Satuan (Rp)</label>
                      <input 
                        type="number" 
                        value={poItem.price} 
                        onChange={(e) => updatePoItem(index, 'price', parseInt(e.target.value))}
                        className="w-full text-xs bg-white text-gray-900 border border-gray-200 rounded-lg p-2 focus:border-amber-500 focus:outline-none"
                        min="0"
                        required
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-1 flex justify-center">
                      <button 
                        type="button" 
                        onClick={() => removePoItem(index)}
                        disabled={poItems.length === 1}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200 flex justify-between items-center">
                <span className="text-xs text-amber-900 font-extrabold uppercase">Total Estimasi:</span>
                <span className="text-lg font-black text-gray-900">
                  Rp {poItems.reduce((acc, item) => acc + (item.quantity * item.price), 0).toLocaleString()}
                </span>
              </div>
            </form>

            <div className="p-4 border-t border-gray-200 bg-gray-50 flex flex-col sm:flex-row gap-2.5">
              <button type="button" onClick={() => { setIsModalOpen(false); resetForm(); }} className="flex-1 bg-white border border-gray-200 py-2.5 rounded-xl font-bold text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all min-h-[44px]">Batal</button>
              <button 
                type="submit" 
                form="po-form"
                disabled={isSubmitting}
                className="flex-1 bg-[#E65C00] hover:bg-[#CF5300] py-2.5 rounded-xl font-extrabold text-xs text-white transition-all shadow-sm shadow-orange-500/20 disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
              >
                {isSubmitting ? 'Menyimpan...' : 'Simpan & Cetak PO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Hapus */}
      {deleteConfirmationPoId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-[120] p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl border border-gray-200 shadow-2xl p-6 space-y-4 animate-in zoom-in duration-200 text-center">
            <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center text-red-600 mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-gray-900">Hapus Purchase Order?</h3>
              <p className="text-xs text-gray-500 font-medium mt-1">Tindakan ini tidak dapat dibatalkan.</p>
            </div>
            <div className="flex gap-2 pt-2">
              <button 
                onClick={() => setDeleteConfirmationPoId(null)}
                className="flex-1 bg-gray-100 border border-gray-200 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:text-gray-900"
              >
                Batal
              </button>
              <button 
                onClick={confirmDelete}
                className="flex-1 bg-red-600 hover:bg-red-700 py-2.5 rounded-xl text-xs font-bold text-white shadow-sm"
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
