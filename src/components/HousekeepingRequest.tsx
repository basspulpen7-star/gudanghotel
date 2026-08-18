import React, { useState, useEffect, useMemo } from 'react';
import { 
  Building2, 
  Plus, 
  Minus, 
  Trash2, 
  Send, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  AlertCircle, 
  Printer, 
  Calendar, 
  FileText, 
  RefreshCw,
  Search,
  Eye,
  Filter,
  ClipboardList,
  Package
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { HKRequest, HKRequestItem, Item } from '../types';
import { requestService } from '../services/requestService';
import { inventoryService } from '../services/inventoryService';
import { HousekeepingRequestDocument } from './HousekeepingRequestDocument';
import { cn } from '../lib/utils';
import { format, parseISO } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

interface HousekeepingRequestProps {
  globalSearch?: string;
}

export function HousekeepingRequest({ globalSearch = '' }: HousekeepingRequestProps) {
  const { user, profile, isHK } = useAuth();

  // Role check: HK users see the Form Permintaan HK, Logistik/Admin see the Permintaan Masuk list
  const isHKUser = isHK || profile?.role === 'hk' || user?.user_metadata?.role === 'hk';

  // Filter for Logistik incoming requests
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Master Items directly from Warehouse Database
  const [masterItems, setMasterItems] = useState<Item[]>([]);
  const [loadingMaster, setLoadingMaster] = useState<boolean>(false);

  // Occupancy & Date states (Occupancy is read-only information)
  const todayIso = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [occupancyRooms, setOccupancyRooms] = useState<number>(0);
  const [guestCount, setGuestCount] = useState<number>(0);
  const [occupancyConnected, setOccupancyConnected] = useState<boolean>(true);
  const [loadingOccupancy, setLoadingOccupancy] = useState<boolean>(false);

  // Form quantities (map of item id -> quantity, default 0)
  const [quantities, setQuantities] = useState<{ [key: string]: number }>({});
  
  // Custom items added via "+ Tambah Barang Lain"
  const [customItems, setCustomItems] = useState<Array<{
    id: string;
    item_id?: string;
    item_name: string;
    quantity: number;
    unit: string;
    stock?: number;
    notes?: string;
  }>>([]);

  const [isAddingCustom, setIsAddingCustom] = useState<boolean>(false);
  const [addCustomTab, setAddCustomTab] = useState<'warehouse' | 'manual'>('warehouse');
  const [masterSearchQuery, setMasterSearchQuery] = useState('');
  const [selectedMasterItem, setSelectedMasterItem] = useState<Item | null>(null);
  const [selectedCustomQty, setSelectedCustomQty] = useState<number>(1);

  // Manual Custom Item Input States
  const [manualItemName, setManualItemName] = useState('');
  const [manualItemQty, setManualItemQty] = useState<number>(1);
  const [manualItemUnit, setManualItemUnit] = useState('pcs');

  // Notes & Submission
  const [requestNotes, setRequestNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Daily Occupancy Order Lock
  const [occupancyAlreadyOrdered, setOccupancyAlreadyOrdered] = useState<boolean>(false);
  const [sentOccupancyRequest, setSentOccupancyRequest] = useState<HKRequest | null>(null);

  // History & Requests
  const [requests, setRequests] = useState<HKRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<HKRequest | null>(null);

  // Logistics fulfillment adjustment in detail modal
  const [fulfilledQuantities, setFulfilledQuantities] = useState<{ [itemKey: string]: number }>({});

  useEffect(() => {
    loadMasterItems();
    loadRequests();
    fetchOccupancy(selectedDate);
  }, []);

  useEffect(() => {
    if (selectedRequest && selectedRequest.items) {
      const initialFulfilled: { [key: string]: number } = {};
      selectedRequest.items.forEach(it => {
        const key = it.id || it.item_name;
        initialFulfilled[key] = it.quantity;
      });
      setFulfilledQuantities(initialFulfilled);
    }
  }, [selectedRequest]);

  const loadMasterItems = async () => {
    setLoadingMaster(true);
    try {
      const res = await inventoryService.getItems({ limit: 1000 });
      if (res && res.data) {
        setMasterItems(res.data);
      }
    } catch (e) {
      console.warn('Error loading master items:', e);
    } finally {
      setLoadingMaster(false);
    }
  };

  // Dynamically group items from Warehouse Master database by department
  const groupedMasterItems = useMemo(() => {
    const groups: { [dept: string]: Item[] } = {};
    masterItems.forEach(item => {
      const dept = (item.department || 'BARANG GUDANG').toUpperCase().trim();
      if (!groups[dept]) {
        groups[dept] = [];
      }
      groups[dept].push(item);
    });
    return groups;
  }, [masterItems]);

  const masterCategories = useMemo(() => {
    return Object.keys(groupedMasterItems).sort();
  }, [groupedMasterItems]);

  const checkTodayOrder = async (dateStr: string) => {
    try {
      const status = await requestService.checkTodayOccupancyOrder(dateStr);
      setOccupancyAlreadyOrdered(status.ordered);
      setSentOccupancyRequest(status.request || null);
    } catch (e) {
      console.warn('Error checking today order:', e);
    }
  };

  const loadRequests = async () => {
    try {
      const data = await requestService.getRequests();
      setRequests(data);
      await checkTodayOrder(selectedDate);
    } catch (e: any) {
      console.warn('Error loading requests:', e?.message || e);
    }
  };

  const fetchOccupancy = async (dateStr: string) => {
    setLoadingOccupancy(true);
    try {
      await requestService.testBreakfastConnection();
      const occ = await requestService.getOccupancyData(dateStr);
      setOccupancyRooms(occ.roomsOccupied);
      setGuestCount(occ.guestCount);
      setOccupancyConnected(occ.connected);

      await checkTodayOrder(dateStr);
    } catch (e: any) {
      console.warn('Failed to fetch occupancy:', e);
      setOccupancyRooms(0);
      setGuestCount(0);
      setOccupancyConnected(false);
    } finally {
      setLoadingOccupancy(false);
    }
  };

  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
    fetchOccupancy(newDate);
  };

  const updateQuantity = (id: string, delta: number) => {
    setQuantities(prev => {
      const current = prev[id] || 0;
      const nextVal = Math.max(0, current + delta);
      return { ...prev, [id]: nextVal };
    });
  };

  const setDirectQuantity = (id: string, val: number) => {
    const safeVal = isNaN(val) ? 0 : Math.max(0, val);
    setQuantities(prev => ({ ...prev, [id]: safeVal }));
  };

  const updateCustomQuantity = (id: string, delta: number) => {
    setCustomItems(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, quantity: Math.max(1, item.quantity + delta) };
      }
      return item;
    }));
  };

  const updateCustomQuantityDirect = (id: string, val: number) => {
    const safeVal = isNaN(val) ? 0 : Math.max(0, val);
    setCustomItems(prev => prev.map(item => item.id === id ? { ...item, quantity: safeVal } : item));
  };

  const handleRemoveCustomItem = (id: string) => {
    setCustomItems(customItems.filter(i => i.id !== id));
  };

  const handleAddCustomMasterItem = () => {
    if (!selectedMasterItem) return;

    const existingIdx = customItems.findIndex(c => c.item_id === selectedMasterItem.id || c.item_name.toLowerCase() === selectedMasterItem.name.toLowerCase());

    if (existingIdx !== -1) {
      setCustomItems(prev => prev.map((item, idx) => 
        idx === existingIdx ? { ...item, quantity: item.quantity + selectedCustomQty } : item
      ));
    } else {
      setCustomItems(prev => [...prev, {
        id: selectedMasterItem.id,
        item_id: selectedMasterItem.id,
        item_name: selectedMasterItem.name,
        quantity: Math.max(1, selectedCustomQty),
        unit: selectedMasterItem.unit || 'pcs',
        stock: selectedMasterItem.current_stock,
        notes: 'Barang Tambahan'
      }]);
    }

    setIsAddingCustom(false);
    setSelectedMasterItem(null);
    setMasterSearchQuery('');
    setSelectedCustomQty(1);
  };

  const handleAddManualCustomItem = () => {
    const name = manualItemName.trim();
    if (!name) return;

    const existingIdx = customItems.findIndex(c => c.item_name.toLowerCase() === name.toLowerCase());

    if (existingIdx !== -1) {
      setCustomItems(prev => prev.map((item, idx) => 
        idx === existingIdx ? { ...item, quantity: item.quantity + Math.max(1, manualItemQty) } : item
      ));
    } else {
      setCustomItems(prev => [...prev, {
        id: `manual-${Date.now()}`,
        item_name: name,
        quantity: Math.max(1, manualItemQty),
        unit: manualItemUnit.trim() || 'pcs',
        stock: 0,
        notes: 'Barang Tambahan (Luar Stok Gudang)'
      }]);
    }

    setIsAddingCustom(false);
    setManualItemName('');
    setManualItemQty(1);
    setManualItemUnit('pcs');
    setAddCustomTab('warehouse');
  };

  // Submit Request
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (submitting) return;

    setSubmitting(true);
    setNotification(null);

    const requesterName = profile?.full_name || user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'hk';

    try {
      const itemsToSubmit: Array<{
        item_id?: string;
        item_name: string;
        quantity: number;
        unit: string;
        notes?: string;
      }> = [];

      if (!occupancyAlreadyOrdered) {
        // Iterate over master items from Warehouse DB
        masterItems.forEach(item => {
          const qty = quantities[item.id] || 0;
          if (qty > 0) {
            itemsToSubmit.push({
              item_id: item.id,
              item_name: item.name,
              quantity: qty,
              unit: item.unit || 'pcs',
              notes: item.department || 'Utama'
            });
          }
        });

        // Include any custom items added via "+ TAMBAH BARANG LAIN"
        customItems.forEach(c => {
          if (c.quantity > 0) {
            itemsToSubmit.push({
              item_id: c.item_id && !c.id.startsWith('manual-') ? c.item_id : undefined,
              item_name: c.item_name,
              quantity: c.quantity,
              unit: c.unit,
              notes: c.notes || 'Barang Tambahan'
            });
          }
        });

        if (itemsToSubmit.length === 0) {
          setNotification({ 
            type: 'error', 
            message: 'Harap masukkan minimal 1 barang dengan jumlah lebih dari 0.' 
          });
          setSubmitting(false);
          return;
        }

        const created = await requestService.createRequest({
          department: 'Housekeeping',
          requester_name: requesterName,
          occupancy_count: occupancyRooms,
          breakfast_pax: guestCount,
          notes: requestNotes.trim(),
          request_type: 'occupancy',
          items: itemsToSubmit
        });

        setNotification({
          type: 'success',
          message: 'Permintaan barang HK berhasil dikirim ke Logistik!'
        });

        setRequestNotes('');
        setCustomItems([]);
        setQuantities({});
        setOccupancyAlreadyOrdered(true);
        setSentOccupancyRequest(created);
        await loadRequests();
      } else {
        // Additional request when main request already sent
        customItems.forEach(c => {
          if (c.quantity > 0) {
            itemsToSubmit.push({
              item_id: c.item_id || c.id,
              item_name: c.item_name,
              quantity: c.quantity,
              unit: c.unit,
              notes: 'Barang Tambahan'
            });
          }
        });

        if (itemsToSubmit.length === 0) {
          setNotification({
            type: 'error',
            message: 'Harap tambahkan minimal 1 barang tambahan dengan jumlah lebih dari 0 (+ Tambah Barang Lain).'
          });
          setSubmitting(false);
          return;
        }

        await requestService.createRequest({
          department: 'Housekeeping',
          requester_name: requesterName,
          occupancy_count: occupancyRooms,
          breakfast_pax: guestCount,
          notes: requestNotes.trim(),
          request_type: 'manual',
          items: itemsToSubmit
        });

        setNotification({
          type: 'success',
          message: 'Permintaan barang tambahan berhasil dikirim ke Logistik!'
        });

        setRequestNotes('');
        setCustomItems([]);
        await loadRequests();
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: 'Gagal mengirim: ' + (err.message || 'Error server') });
    } finally {
      setSubmitting(false);
    }
  };

  // Status handler for Logistik/Admin
  const handleUpdateStatus = async (requestId: string, newStatus: 'MENUNGGU' | 'DIPROSES' | 'SELESAI' | 'DITOLAK') => {
    setProcessingId(requestId);
    try {
      if (newStatus === 'SELESAI' && selectedRequest) {
        const fulfilledPayload = selectedRequest.items?.map(it => {
          const key = it.id || it.item_name;
          const qty = fulfilledQuantities[key] !== undefined ? fulfilledQuantities[key] : it.quantity;
          return {
            ...it,
            quantity: qty
          };
        });

        await requestService.completeAndFulfill(selectedRequest, true, fulfilledPayload);
      } else {
        await requestService.updateStatus(requestId, newStatus);
      }

      await loadRequests();
      if (selectedRequest && selectedRequest.id === requestId) {
        setSelectedRequest(prev => prev ? { ...prev, status: newStatus } : null);
      }

      setNotification({
        type: 'success',
        message: `Status tiket berhasil diubah menjadi ${newStatus}`
      });
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: 'Gagal memperbarui status: ' + (err.message || 'Error')
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteRequest = async (requestId: string) => {
    if (!window.confirm('Hapus tiket permintaan ini?')) return;
    try {
      await requestService.deleteRequest(requestId);
      if (selectedRequest?.id === requestId) {
        setSelectedRequest(null);
      }
      await loadRequests();
      setNotification({
        type: 'success',
        message: 'Tiket permintaan berhasil dihapus.'
      });
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: 'Gagal menghapus tiket: ' + (err.message || 'Error')
      });
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('Hapus semua data tiket permintaan HK?')) return;
    try {
      await requestService.clearAllRequests();
      setSelectedRequest(null);
      await loadRequests();
      setNotification({
        type: 'success',
        message: 'Semua data permintaan HK berhasil dibersihkan.'
      });
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: 'Gagal membersihkan data: ' + (err.message || 'Error')
      });
    }
  };

  const formattedDateIndo = (() => {
    try {
      return format(parseISO(selectedDate), 'd MMMM yyyy', { locale: idLocale });
    } catch {
      return selectedDate;
    }
  })();

  const formatDateDisplay = (dateString?: string) => {
    if (!dateString) return '';
    try {
      return format(new Date(dateString), 'd MMMM yyyy', { locale: idLocale });
    } catch {
      return dateString;
    }
  };

  const getStatusBadge = (status: string) => {
    const s = (status || '').toUpperCase();
    switch (s) {
      case 'MENUNGGU':
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-full text-[11px] font-bold whitespace-nowrap shrink-0">
            <Clock className="w-3 h-3 text-amber-600 shrink-0" />
            MENUNGGU
          </span>
        );
      case 'DIPROSES':
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 rounded-full text-[11px] font-bold whitespace-nowrap shrink-0">
            <RefreshCw className="w-3 h-3 text-blue-600 shrink-0" />
            DIPROSES
          </span>
        );
      case 'SELESAI':
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-full text-[11px] font-bold whitespace-nowrap shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            SELESAI
          </span>
        );
      case 'DITOLAK':
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-red-50 text-red-800 border border-red-200 rounded-full text-[11px] font-bold whitespace-nowrap shrink-0">
            <XCircle className="w-3 h-3 text-red-600 shrink-0" />
            DITOLAK
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-[11px] font-bold whitespace-nowrap shrink-0">
            {status}
          </span>
        );
    }
  };

  // Counts for filter chips
  const countAll = requests.length;
  const countMenunggu = requests.filter(r => (r.status || '').toUpperCase() === 'MENUNGGU' || (r.status || '').toUpperCase() === 'PENDING').length;
  const countDiproses = requests.filter(r => (r.status || '').toUpperCase() === 'DIPROSES' || (r.status || '').toUpperCase() === 'PROCESSING').length;
  const countSelesai = requests.filter(r => (r.status || '').toUpperCase() === 'SELESAI' || (r.status || '').toUpperCase() === 'COMPLETED').length;

  const searchFilteredMasterItems = masterSearchQuery.trim()
    ? masterItems.filter(m => 
        (m.name || '').toLowerCase().includes(masterSearchQuery.toLowerCase()) ||
        (m.department && m.department.toLowerCase().includes(masterSearchQuery.toLowerCase()))
      )
    : masterItems.slice(0, 8);

  const filteredRequests = requests.filter(r => {
    const s = (r.status || '').toUpperCase();
    if (filterStatus === 'MENUNGGU') return s === 'MENUNGGU' || s === 'PENDING';
    if (filterStatus === 'DIPROSES') return s === 'DIPROSES' || s === 'PROCESSING';
    if (filterStatus === 'SELESAI') return s === 'SELESAI' || s === 'COMPLETED';
    return true;
  });

  return (
    <>
      <div className="space-y-4 max-w-4xl mx-auto text-gray-900 pb-16 font-sans no-print">
      {/* Alert Notification */}
      {notification && (
        <div className={cn(
          "p-3.5 sm:p-4 rounded-2xl flex items-center justify-between text-xs md:text-sm font-semibold border shadow-xs animate-in fade-in duration-200",
          notification.type === 'success' 
            ? "bg-emerald-50 text-emerald-900 border-emerald-200" 
            : "bg-red-50 text-red-900 border-red-200"
        )}>
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            )}
            <span className="leading-snug break-words">{notification.message}</span>
          </div>
          <button 
            type="button" 
            onClick={() => setNotification(null)} 
            className="w-7 h-7 flex items-center justify-center text-xs text-gray-500 hover:text-gray-800 rounded-lg hover:bg-black/5 font-bold shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW A: PERMINTAAN MASUK (LOGISTIK) - UNTUK ADMIN / LOGISTIK / STAFF     */}
      {/* ========================================================================= */}
      {!isHKUser ? (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Black Banner Header */}
          <div className="bg-[#1c1b18] border border-neutral-800 rounded-2xl p-3.5 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
            <div className="min-w-0">
              <h2 className="text-amber-500 font-black text-sm sm:text-base tracking-wider uppercase">
                PERMINTAAN MASUK (LOGISTIK)
              </h2>
              <p className="text-gray-400 text-xs mt-0.5 leading-relaxed">
                Proses &amp; siapkan kebutuhan barang dari Housekeeping.
              </p>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 flex-wrap">
              <button
                type="button"
                onClick={() => { loadRequests(); loadMasterItems(); }}
                className="p-2 bg-neutral-800 hover:bg-neutral-700 text-gray-300 hover:text-white rounded-xl transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer active:scale-95"
                title="Muat Ulang Data"
              >
                <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                <span className="sm:hidden text-[11px]">Segarkan</span>
              </button>
              {requests.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="px-2.5 py-1.5 bg-red-950/80 hover:bg-red-900 border border-red-800/80 text-red-300 hover:text-white rounded-xl transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer active:scale-95"
                  title="Hapus Semua Permintaan"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px]">Hapus Semua</span>
                </button>
              )}
              <div className="bg-black/60 border border-neutral-700/80 px-3 py-1.5 rounded-xl">
                <span className="text-amber-400 font-extrabold text-xs sm:text-sm whitespace-nowrap">
                  {requests.length} Permintaan
                </span>
              </div>
            </div>
          </div>

          {/* Filter Chips Bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1.5 pt-0.5 text-xs no-scrollbar">
            <span className="text-gray-500 font-bold flex items-center gap-1 shrink-0 mr-1">
              <Filter className="w-3.5 h-3.5" /> Filter:
            </span>
            <button
              onClick={() => setFilterStatus('ALL')}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer",
                filterStatus === 'ALL'
                  ? "bg-gray-900 text-white shadow-xs"
                  : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
              )}
            >
              Semua ({countAll})
            </button>
            <button
              onClick={() => setFilterStatus('MENUNGGU')}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer",
                filterStatus === 'MENUNGGU'
                  ? "bg-amber-500 text-white font-black shadow-xs"
                  : "bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100"
              )}
            >
              Menunggu ({countMenunggu})
            </button>
            <button
              onClick={() => setFilterStatus('DIPROSES')}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer",
                filterStatus === 'DIPROSES'
                  ? "bg-blue-600 text-white font-black shadow-xs"
                  : "bg-blue-50 border border-blue-200 text-blue-800 hover:bg-blue-100"
              )}
            >
              Diproses ({countDiproses})
            </button>
            <button
              onClick={() => setFilterStatus('SELESAI')}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer",
                filterStatus === 'SELESAI'
                  ? "bg-emerald-600 text-white font-black shadow-xs"
                  : "bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100"
              )}
            >
              Selesai ({countSelesai})
            </button>
          </div>

          {/* List of Request Cards */}
          {filteredRequests.length === 0 ? (
            <div className="p-8 sm:p-12 bg-white border border-gray-200/90 rounded-2xl text-center space-y-3 shadow-xs">
              <ClipboardList className="w-10 h-10 text-gray-300 mx-auto" />
              <h4 className="text-sm font-bold text-gray-700">Tidak ada tiket permintaan</h4>
              <p className="text-xs text-gray-400">
                {filterStatus === 'ALL' 
                  ? 'Belum ada tiket permintaan yang dikirim oleh Housekeeping.' 
                  : `Tidak ada tiket permintaan dengan status "${filterStatus}".`}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRequests.map((req) => (
                <div
                  key={req.id}
                  className="bg-white border border-gray-200/90 rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] space-y-3 hover:border-amber-300 transition-all"
                >
                  {/* Header Row */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-black text-gray-900 text-sm sm:text-base">
                        {req.request_number || `REQ-${req.id.slice(0, 4)}`}
                      </span>
                      {getStatusBadge(req.status)}
                    </div>
                    <span className="text-gray-500 text-xs font-medium shrink-0">
                      {formatDateDisplay(req.created_at)}
                    </span>
                  </div>

                  {/* Info Details */}
                  <div className="space-y-1.5 text-xs sm:text-sm text-gray-700 font-sans">
                    <p className="leading-snug">
                      <span className="text-gray-500 font-medium">Pemohon: </span>
                      <strong className="text-gray-900 font-bold">{req.requester_name || 'hk'}</strong>
                    </p>
                    <p className="leading-snug">
                      <span className="text-gray-500 font-medium">Occupancy Info: </span>
                      <strong className="text-gray-900 font-bold">{req.occupancy_count || 0} Kamar ({req.breakfast_pax || 0} Guest)</strong>
                    </p>
                    <p className="leading-snug">
                      <span className="text-gray-500 font-medium">Daftar Items: </span>
                      <strong className="text-gray-900 font-bold">{req.items?.length || 0} jenis barang</strong>
                    </p>
                  </div>

                  {/* Notes box */}
                  {req.notes && (
                    <div className="p-3 bg-gray-50/80 border border-gray-200/80 rounded-xl text-xs text-gray-600 italic break-words">
                      "{req.notes}"
                    </div>
                  )}

                  {/* Action Button */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setSelectedRequest(req)}
                      className="w-full sm:w-auto bg-[#EAA100] hover:bg-[#d69200] text-white font-black text-xs px-5 py-2.5 rounded-xl inline-flex items-center justify-center gap-2 shadow-xs transition-all uppercase tracking-wider cursor-pointer active:scale-95"
                    >
                      <Eye className="w-4 h-4 stroke-[2.5]" />
                      <span>LIHAT DETAIL</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ========================================================================= */
        /* VIEW B: FORM PERMINTAAN BARANG HK (DIPAKAI HK UNTUK INPUT KEBUTUHAN)     */
        /* ========================================================================= */
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Banner Status jika sudah order occupancy hari ini */}
          {occupancyAlreadyOrdered && (
            <div className="bg-amber-50 border border-amber-200/90 rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)] space-y-1">
              <div className="flex items-center gap-2 font-extrabold text-xs sm:text-sm text-amber-900">
                <CheckCircle2 className="w-4.5 h-4.5 text-amber-600 shrink-0" />
                <span>PERMINTAAN UTAMA HARI INI SUDAH DIKIRIM</span>
              </div>
              <p className="text-xs font-bold text-amber-800">
                Occupancy Info: {occupancyRooms} Kamar · {guestCount} Guest
              </p>
              <p className="text-[11px] sm:text-xs text-amber-700">
                Permintaan utama hari ini telah berhasil dikirim. Jika ada kebutuhan tambahan, gunakan tombol <strong>+ TAMBAH BARANG LAIN</strong> di bawah.
              </p>
            </div>
          )}

          {/* 1. OCCUPANCY CARD - INFORMASI SAJA */}
          <div className="bg-white border border-gray-200/90 rounded-2xl p-3.5 sm:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-amber-600 tracking-wider uppercase">
                  PERMINTAAN BARANG HK
                </span>
                {occupancyConnected ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-full text-[10px] font-bold shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    LIVE
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-full text-[10px] font-bold shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                    OFFLINE
                  </span>
                )}
              </div>

              {/* Datepicker input */}
              <div className="flex items-center gap-1.5 border border-gray-200 rounded-xl px-2.5 py-1 bg-white hover:border-gray-300 transition-colors shrink-0">
                <Calendar className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="text-xs font-semibold text-gray-700 bg-transparent outline-none cursor-pointer max-w-[135px]"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-gray-100">
              <div className="flex items-baseline gap-3 flex-wrap">
                <div>
                  <span className="text-xs font-medium text-gray-500 block">Occupancy</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight font-mono">
                      {occupancyRooms}
                    </span>
                    <span className="text-xs sm:text-sm font-bold text-gray-600">
                      Kamar
                    </span>
                  </div>
                </div>
                <span className="text-gray-300 font-bold self-center">•</span>
                <div>
                  <span className="text-xs font-medium text-gray-500 block">Guest</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight font-mono">
                      {guestCount}
                    </span>
                    <span className="text-xs sm:text-sm font-bold text-gray-600">
                      Guest
                    </span>
                  </div>
                </div>
              </div>

              <div className="px-3 py-1.5 bg-amber-50 text-amber-800 font-bold text-xs rounded-xl border border-amber-200/70 shrink-0">
                {formattedDateIndo}
              </div>
            </div>

            <p className="text-[11px] text-gray-400 italic">
              * Data occupancy hanya sebagai informasi untuk membantu menentukan kebutuhan.
            </p>
          </div>

          {/* 2. FORM PERMINTAAN BARANG (DARI MASTER WAREHOUSE DENGAN FITUR SELECT AUTO-HIGHLIGHT) */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-white border border-gray-200/90 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] overflow-hidden">
              {/* Black Bar Header */}
              <div className="bg-[#1a1918] px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-amber-500 font-black text-xs sm:text-sm tracking-wider uppercase">
                  DAFTAR BARANG MASTER WAREHOUSE ({masterItems.length} ITEM)
                </span>
                <span className="text-gray-400 font-medium text-xs">
                  Sumber Data: Master Gudang
                </span>
              </div>

              {/* Master Items Grouped by Department */}
              {loadingMaster ? (
                <div className="p-8 text-center text-xs text-gray-400 font-medium flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
                  <span>Memuat data barang dari Warehouse...</span>
                </div>
              ) : masterItems.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <Package className="w-8 h-8 text-gray-300 mx-auto" />
                  <p className="text-xs font-bold text-gray-600">Belum ada barang di Master Warehouse</p>
                  <p className="text-[11px] text-gray-400">Tambahkan barang terlebih dahulu di menu Master Barang Gudang.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {masterCategories.map((cat) => {
                    const catItems = groupedMasterItems[cat] || [];
                    return (
                      <div key={cat}>
                        {/* Category Header */}
                        <div className="px-3.5 sm:px-5 py-2.5 bg-gray-50/80 border-b border-gray-100 flex items-center justify-between text-[11px] font-extrabold text-gray-700 tracking-wider uppercase">
                          <span>{cat}</span>
                          <span className="text-gray-400 font-medium lowercase text-[11px]">
                            {catItems.length} item
                          </span>
                        </div>

                        {/* Category Items */}
                        <div className="divide-y divide-gray-100">
                          {catItems.map((item) => {
                            const currentQty = quantities[item.id] !== undefined ? quantities[item.id] : 0;

                            const sentItem = sentOccupancyRequest?.items?.find(it => 
                              it.item_id === item.id || it.item_name.toLowerCase() === item.name.toLowerCase()
                            );

                            if (occupancyAlreadyOrdered) {
                              // Locked Read-Only View for sent main request
                              return (
                                <div 
                                  key={item.id} 
                                  className="px-3.5 sm:px-5 py-3 flex items-center justify-between gap-2.5 bg-gray-50/50"
                                >
                                  <div className="min-w-0 flex-1 pr-1">
                                    <p className="font-bold text-gray-700 text-sm sm:text-base leading-snug break-words">
                                      {item.name}
                                    </p>
                                    <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5 font-medium">
                                      Stok: <strong className="text-gray-600">{item.current_stock} {item.unit}</strong>
                                    </p>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="px-2.5 py-1 bg-amber-50 text-amber-900 border border-amber-200/80 rounded-lg text-xs font-bold font-mono text-center shrink-0">
                                      {sentItem ? sentItem.quantity : 0} {item.unit}
                                    </span>
                                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-md text-[10px] font-extrabold tracking-wider uppercase shrink-0">
                                      TERKIRIM
                                    </span>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div 
                                key={item.id} 
                                className="px-3.5 sm:px-5 py-3 flex items-center justify-between gap-2.5 hover:bg-amber-50/20 transition-colors"
                              >
                                {/* Item Name & Stock */}
                                <div className="min-w-0 flex-1 pr-1">
                                  <p className="font-bold text-gray-900 text-sm sm:text-base leading-snug break-words">
                                    {item.name}
                                  </p>
                                  <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5 font-medium">
                                    Stok: <strong className="text-gray-800 font-bold">{item.current_stock} {item.unit}</strong>
                                  </p>
                                </div>

                                {/* Stepper Controls with Auto-Highlight on Click/Focus */}
                                <div className="quantity-control flex items-center gap-1.5 sm:gap-1 shrink-0 overflow-visible">
                                  <button
                                    type="button"
                                    onClick={() => updateQuantity(item.id, -1)}
                                    className="quantity-button w-10 h-10 sm:w-8 sm:h-8 rounded-[7px] sm:rounded-lg border border-gray-300 sm:border-gray-200 bg-white hover:bg-gray-100 active:bg-gray-200 text-gray-800 font-bold flex items-center justify-center transition-colors active:scale-95 text-sm sm:text-xs cursor-pointer shrink-0"
                                    aria-label="Kurangi"
                                  >
                                    <Minus className="w-4 h-4 sm:w-3.5 sm:h-3.5 stroke-[2.5]" />
                                  </button>

                                  <input
                                    type="number"
                                    min="0"
                                    value={currentQty}
                                    onFocus={(e) => e.currentTarget.select()}
                                    onClick={(e) => e.currentTarget.select()}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      setDirectQuantity(item.id, raw === '' ? 0 : parseInt(raw, 10) || 0);
                                    }}
                                    className="quantity-input w-[64px] min-w-[64px] h-10 sm:h-8 text-center font-bold text-[15px] sm:text-sm text-[#1f2937] bg-white border border-[#d1d5db] sm:border-gray-200 rounded-[7px] sm:rounded-lg !px-1 !py-0 outline-none focus:border-amber-500 font-mono box-border shrink-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  />

                                  <button
                                    type="button"
                                    onClick={() => updateQuantity(item.id, 1)}
                                    className="quantity-button w-10 h-10 sm:w-8 sm:h-8 rounded-[7px] sm:rounded-lg border border-gray-300 sm:border-gray-200 bg-white hover:bg-gray-100 active:bg-gray-200 text-gray-800 font-bold flex items-center justify-center transition-colors active:scale-95 text-sm sm:text-xs cursor-pointer shrink-0"
                                    aria-label="Tambah"
                                  >
                                    <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5 stroke-[2.5]" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Custom Additional Items List if any */}
              {customItems.length > 0 && (
                <div className="border-t-2 border-amber-200 bg-amber-50/20">
                  <div className="px-3.5 sm:px-5 py-2.5 bg-amber-100/60 border-b border-amber-200/80 flex items-center justify-between text-[11px] font-extrabold text-amber-900 tracking-wider uppercase">
                    <span>BARANG TAMBAHAN LAINNYA ({customItems.length})</span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {customItems.map((c) => (
                      <div key={c.id} className="px-3.5 sm:px-5 py-3 flex items-center justify-between gap-2.5">
                        <div className="min-w-0 flex-1 pr-1">
                          <p className="font-bold text-gray-900 text-sm sm:text-base leading-snug break-words">
                            {c.item_name}
                          </p>
                          <div className="text-[11px] sm:text-xs text-gray-500 mt-0.5 font-medium flex items-center gap-2 flex-wrap">
                            {c.id.startsWith('manual-') ? (
                              <span className="inline-block px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded text-[10px] font-black uppercase">
                                Non-Master Stock
                              </span>
                            ) : (
                              <span>Stok: <strong className="text-gray-800">{c.stock ?? '-'} {c.unit}</strong></span>
                            )}
                            <span className="text-gray-400">• Satuan: <strong className="text-gray-700">{c.unit}</strong></span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="quantity-control flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => updateCustomQuantity(c.id, -1)}
                              className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-800 font-bold flex items-center justify-center cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={c.quantity}
                              onFocus={(e) => e.currentTarget.select()}
                              onClick={(e) => e.currentTarget.select()}
                              onChange={(e) => {
                                const raw = e.target.value;
                                updateCustomQuantityDirect(c.id, raw === '' ? 0 : parseInt(raw, 10) || 0);
                              }}
                              className="w-14 h-8 text-center font-bold text-sm text-gray-900 bg-white border border-gray-200 rounded-lg outline-none font-mono"
                            />
                            <button
                              type="button"
                              onClick={() => updateCustomQuantity(c.id, 1)}
                              className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-800 font-bold flex items-center justify-center cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveCustomItem(c.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="Hapus barang"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 3. TOMBOL TAMBAH BARANG LAIN */}
            {!isAddingCustom ? (
              <button
                type="button"
                onClick={() => {
                  setIsAddingCustom(true);
                  setAddCustomTab('warehouse');
                  setMasterSearchQuery('');
                  setSelectedMasterItem(null);
                  setSelectedCustomQty(1);
                  setManualItemName('');
                  setManualItemQty(1);
                  setManualItemUnit('pcs');
                }}
                className="w-full py-3.5 px-4 border border-dashed border-amber-300 bg-amber-50/40 hover:bg-amber-50/90 text-amber-800 font-extrabold text-xs sm:text-sm rounded-2xl flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer active:scale-[0.99]"
              >
                <Plus className="w-4 h-4 text-amber-700 font-black shrink-0" />
                <span>+ TAMBAH BARANG LAIN</span>
              </button>
            ) : (
              <div className="p-3.5 sm:p-5 bg-white border border-amber-300 rounded-2xl shadow-md space-y-3.5 animate-in fade-in duration-150">
                {/* Tab Switcher & Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-gray-100">
                  <div className="flex items-center gap-1.5 p-1 bg-gray-100 rounded-xl shrink-0">
                    <button
                      type="button"
                      onClick={() => setAddCustomTab('warehouse')}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                        addCustomTab === 'warehouse'
                          ? "bg-white text-amber-900 shadow-xs font-black"
                          : "text-gray-600 hover:text-gray-900"
                      )}
                    >
                      🏢 Cari Stok Warehouse
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddCustomTab('manual');
                        if (masterSearchQuery.trim() && !manualItemName) {
                          setManualItemName(masterSearchQuery.trim());
                        }
                      }}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                        addCustomTab === 'manual'
                          ? "bg-amber-500 text-white shadow-xs font-black"
                          : "text-gray-600 hover:text-gray-900"
                      )}
                    >
                      ✍️ Tulis Manual (Barang Lain)
                    </button>
                  </div>

                  <button 
                    type="button" 
                    onClick={() => {
                      setIsAddingCustom(false);
                      setSelectedMasterItem(null);
                      setMasterSearchQuery('');
                    }} 
                    className="text-xs text-gray-400 hover:text-gray-700 p-1 font-bold cursor-pointer self-end sm:self-auto"
                  >
                    Batal ✕
                  </button>
                </div>

                {addCustomTab === 'warehouse' ? (
                  /* WAREHOUSE SEARCH TAB */
                  !selectedMasterItem ? (
                    <div className="space-y-2.5">
                      <div className="relative">
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                        <input
                          type="text"
                          placeholder="Ketik nama barang di Master Warehouse (contoh: Karbol, Sabun, Plastik)..."
                          value={masterSearchQuery}
                          onChange={(e) => setMasterSearchQuery(e.target.value)}
                          className="w-full pl-9 pr-3.5 py-2.5 border border-gray-300 rounded-xl text-xs sm:text-sm text-gray-900 outline-none focus:border-amber-500"
                          autoFocus
                        />
                      </div>

                      {/* Results List */}
                      <div className="max-h-52 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100 bg-gray-50/50">
                        {searchFilteredMasterItems.length === 0 ? (
                          <div className="p-4 text-center space-y-2">
                            <p className="text-xs text-gray-500 italic">
                              Tidak ada barang yang cocok di Master Warehouse.
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setAddCustomTab('manual');
                                setManualItemName(masterSearchQuery.trim());
                              }}
                              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                            >
                              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>Tulis "{masterSearchQuery || 'Barang Lain'}" Secara Manual</span>
                            </button>
                          </div>
                        ) : (
                          searchFilteredMasterItems.map((m) => (
                            <button
                              type="button"
                              key={m.id}
                              onClick={() => {
                                setSelectedMasterItem(m);
                                setSelectedCustomQty(1);
                              }}
                              className="w-full text-left p-2.5 hover:bg-amber-50 flex items-center justify-between gap-2 transition-colors cursor-pointer"
                            >
                              <div>
                                <p className="font-bold text-gray-900 text-xs sm:text-sm">{m.name}</p>
                                <p className="text-[11px] text-gray-500">
                                  Kategori: {m.department || 'Umum'}
                                </p>
                              </div>
                              <span className="px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-xs font-bold font-mono text-gray-700 shrink-0">
                                Stok: {m.current_stock} {m.unit}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Selected Item View */
                    <div className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-xl space-y-3">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <span className="text-[10px] font-extrabold text-amber-700 uppercase tracking-wider block">Barang Dipilih</span>
                          <p className="font-extrabold text-gray-900 text-sm sm:text-base mt-0.5">{selectedMasterItem.name}</p>
                          <p className="text-xs text-gray-600 mt-0.5 font-medium">
                            Stok Tersedia: <strong className="text-amber-800">{selectedMasterItem.current_stock} {selectedMasterItem.unit}</strong>
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedMasterItem(null)}
                          className="text-xs text-amber-700 underline font-semibold cursor-pointer"
                        >
                          Ganti
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-3 pt-2 border-t border-amber-200/60">
                        <span className="text-xs font-bold text-gray-700 uppercase">Jumlah Diminta:</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedCustomQty(Math.max(1, selectedCustomQty - 1))}
                            className="w-8 h-8 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 text-gray-800 font-bold flex items-center justify-center cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={selectedCustomQty}
                            onFocus={(e) => e.currentTarget.select()}
                            onClick={(e) => e.currentTarget.select()}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setSelectedCustomQty(raw === '' ? 1 : Math.max(1, parseInt(raw, 10) || 1));
                            }}
                            className="w-16 h-8 text-center font-bold text-sm text-gray-900 bg-white border border-gray-300 rounded-lg outline-none font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => setSelectedCustomQty(selectedCustomQty + 1)}
                            className="w-8 h-8 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 text-gray-800 font-bold flex items-center justify-center cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                          </button>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setIsAddingCustom(false);
                            setSelectedMasterItem(null);
                          }}
                          className="px-3.5 py-2 border border-gray-300 bg-white rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer"
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          onClick={handleAddCustomMasterItem}
                          className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs active:scale-95"
                        >
                          TAMBAHKAN
                        </button>
                      </div>
                    </div>
                  )
                ) : (
                  /* MANUAL ITEM TAB */
                  <div className="p-3.5 bg-amber-50/40 border border-amber-200 rounded-xl space-y-3.5">
                    <div className="space-y-1">
                      <label className="text-[11px] font-extrabold text-amber-900 uppercase tracking-wider block">
                        Nama Barang Manual (Tidak Ada di Stock Warehouse)
                      </label>
                      <input
                        type="text"
                        value={manualItemName}
                        onChange={(e) => setManualItemName(e.target.value)}
                        placeholder="Ketik nama barang... (misal: Pembersih Kaca Glit, Ember Kecil)"
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs sm:text-sm text-gray-900 outline-none focus:border-amber-500 font-medium"
                        autoFocus
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Quantity */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-extrabold text-gray-700 uppercase tracking-wider block">
                          Jumlah
                        </label>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setManualItemQty(Math.max(1, manualItemQty - 1))}
                            className="w-9 h-9 rounded-xl border border-gray-300 bg-white hover:bg-gray-100 text-gray-800 font-bold flex items-center justify-center cursor-pointer shrink-0"
                          >
                            <Minus className="w-4 h-4 stroke-[2.5]" />
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={manualItemQty}
                            onFocus={(e) => e.currentTarget.select()}
                            onClick={(e) => e.currentTarget.select()}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setManualItemQty(raw === '' ? 1 : Math.max(1, parseInt(raw, 10) || 1));
                            }}
                            className="w-full h-9 text-center font-bold text-sm text-gray-900 bg-white border border-gray-300 rounded-xl outline-none font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => setManualItemQty(manualItemQty + 1)}
                            className="w-9 h-9 rounded-xl border border-gray-300 bg-white hover:bg-gray-100 text-gray-800 font-bold flex items-center justify-center cursor-pointer shrink-0"
                          >
                            <Plus className="w-4 h-4 stroke-[2.5]" />
                          </button>
                        </div>
                      </div>

                      {/* Unit */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-extrabold text-gray-700 uppercase tracking-wider block">
                          Satuan
                        </label>
                        <input
                          type="text"
                          value={manualItemUnit}
                          onChange={(e) => setManualItemUnit(e.target.value)}
                          placeholder="pcs, botol, pack, roll..."
                          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs text-gray-900 outline-none focus:border-amber-500 font-medium"
                        />
                      </div>
                    </div>

                    {/* Quick Unit Chips */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-[10px] text-gray-400 font-bold uppercase">Pilih Satuan Cepat:</span>
                      {['pcs', 'botol', 'pack', 'dus', 'roll', 'pasang', 'liter', 'sachet', 'set'].map(u => (
                        <button
                          key={u}
                          type="button"
                          onClick={() => setManualItemUnit(u)}
                          className={cn(
                            "px-2 py-0.5 rounded-md text-[11px] font-bold cursor-pointer transition-all border",
                            manualItemUnit.toLowerCase() === u
                              ? "bg-amber-500 text-white border-amber-600"
                              : "bg-white text-gray-600 border-gray-200 hover:bg-gray-100"
                          )}
                        >
                          {u}
                        </button>
                      ))}
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-amber-200/80">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingCustom(false);
                          setManualItemName('');
                        }}
                        className="px-3.5 py-2 border border-gray-300 bg-white rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        disabled={!manualItemName.trim()}
                        onClick={handleAddManualCustomItem}
                        className="px-5 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-black rounded-xl text-xs cursor-pointer shadow-xs active:scale-95 uppercase tracking-wider"
                      >
                        + TAMBAHKAN BARANG
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 4. NOTES INPUT */}
            <div className="bg-white border border-gray-200/90 rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.03)] space-y-1.5">
              <label className="text-xs font-extrabold text-gray-700 uppercase tracking-wider block">
                Catatan Permintaan (Opsional)
              </label>
              <textarea
                value={requestNotes}
                onChange={(e) => setRequestNotes(e.target.value)}
                placeholder="Contoh: Tambahan linen untuk kamar VIP / pembersihan mendadak..."
                rows={2}
                className="w-full p-3 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:border-amber-500 resize-none"
              />
            </div>

            {/* 5. SUBMIT BUTTON */}
            <button
              type="submit"
              disabled={submitting}
              className={cn(
                "w-full py-4 px-6 font-black text-sm rounded-2xl flex items-center justify-center gap-2 shadow-md transition-all uppercase tracking-wider cursor-pointer active:scale-[0.99]",
                submitting
                  ? "bg-gray-400 text-white cursor-not-allowed"
                  : "bg-amber-500 hover:bg-amber-600 text-white"
              )}
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                  <span>MENGIRIM PERMINTAAN...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 shrink-0" />
                  <span>KIRIM PERMINTAAN BARANG</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}
      </div>

      {/* ========================================================================= */}
      {/* DETAIL MODAL WITH STATUS PROCESSING & FULFILLMENT                         */}
      {/* ========================================================================= */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[100] p-3 sm:p-4 no-print">
          <div className="bg-white w-full max-w-xl rounded-2xl border border-gray-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[82vh] sm:max-h-[88vh]">
            {/* Modal Header */}
            <div className="p-3.5 sm:p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/90 shrink-0">
              <div className="flex items-center gap-2 flex-wrap min-w-0 pr-2">
                <span className="font-mono font-black text-sm sm:text-base text-gray-900">
                  {selectedRequest.request_number || `REQ-${selectedRequest.id.slice(0, 4)}`}
                </span>
                {getStatusBadge(selectedRequest.status)}
              </div>
              <button 
                type="button" 
                onClick={() => setSelectedRequest(null)} 
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg text-sm font-bold cursor-pointer transition-colors shrink-0"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-3.5 sm:p-5 overflow-y-auto space-y-4 text-xs">
              {/* Info Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-gray-50 p-3 rounded-2xl border border-gray-100">
                <div>
                  <span className="text-gray-400 block text-[10px] font-bold uppercase">Tanggal</span>
                  <span className="font-semibold text-gray-800 leading-tight block mt-0.5">
                    {format(new Date(selectedRequest.created_at), 'dd MMM yyyy, HH:mm', { locale: idLocale })}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px] font-bold uppercase">Pemohon</span>
                  <span className="font-bold text-gray-800 leading-tight block mt-0.5">{selectedRequest.requester_name || 'hk'}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px] font-bold uppercase">Occupancy</span>
                  <span className="font-bold text-amber-700 leading-tight block mt-0.5">{selectedRequest.occupancy_count || '-'} Kamar</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px] font-bold uppercase">Guest</span>
                  <span className="font-bold text-gray-800 leading-tight block mt-0.5">{selectedRequest.breakfast_pax || '-'} Tamu</span>
                </div>
              </div>

              {/* Notes */}
              {selectedRequest.notes && (
                <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-100">
                  <span className="font-bold text-amber-900 block mb-0.5 text-[11px] uppercase">Catatan:</span>
                  <p className="text-gray-700 italic leading-relaxed break-words">{selectedRequest.notes}</p>
                </div>
              )}

              {/* Table / List of items */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-gray-800 uppercase tracking-wide text-xs">
                    Daftar Barang Diminta ({selectedRequest.items?.length || 0})
                  </span>
                  {!isHKUser && ((selectedRequest.status || '').toUpperCase() === 'DIPROSES' || (selectedRequest.status || '').toUpperCase() === 'PROCESSING') && (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                      Logistik dapat menyesuaikan jumlah dipenuhi
                    </span>
                  )}
                </div>
                <div className="border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[320px]">
                    <thead className="bg-gray-100 text-gray-600 font-bold text-[10px] uppercase">
                      <tr>
                        <th className="p-2.5 w-8 text-center">No</th>
                        <th className="p-2.5">Nama Barang</th>
                        <th className="p-2.5 text-center w-20">Diminta</th>
                        <th className="p-2.5 text-center w-24">Dipenuhi</th>
                        <th className="p-2.5">Ket</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(selectedRequest.items || []).map((it, idx) => {
                        const masterMatch = masterItems.find(m => 
                          (it.item_id && m.id === it.item_id) || m.name.toLowerCase() === it.item_name.toLowerCase()
                        );

                        const stockDisplay = masterMatch ? `${masterMatch.current_stock} ${masterMatch.unit}` : '-';
                        const itemKey = it.id || it.item_name;
                        const currentFulfilledQty = fulfilledQuantities[itemKey] !== undefined ? fulfilledQuantities[itemKey] : it.quantity;

                        const isEditable = !isHKUser && ((selectedRequest.status || '').toUpperCase() === 'DIPROSES' || (selectedRequest.status || '').toUpperCase() === 'PROCESSING');

                        return (
                          <tr key={idx} className="hover:bg-gray-50/60">
                            <td className="p-2.5 text-gray-400 font-mono text-center text-xs">{idx + 1}</td>
                            <td className="p-2.5 font-bold text-gray-900 text-xs">
                              {it.item_name}
                              <div className="text-[10px] text-gray-400 font-normal">Stok Gudang: <strong className="text-gray-700">{stockDisplay}</strong></div>
                            </td>
                            <td className="p-2.5 text-center whitespace-nowrap">
                              <span className="font-extrabold text-amber-700 font-mono text-xs mr-1">{it.quantity}</span>
                              <span className="text-gray-500 text-[11px] font-normal">{it.unit}</span>
                            </td>
                            <td className="p-2.5 text-center">
                              {isEditable ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={currentFulfilledQty}
                                  onFocus={(e) => e.currentTarget.select()}
                                  onClick={(e) => e.currentTarget.select()}
                                  onChange={(e) => {
                                    const val = Math.max(0, parseInt(e.target.value) || 0);
                                    setFulfilledQuantities(prev => ({ ...prev, [itemKey]: val }));
                                  }}
                                  className="w-16 h-7 text-center font-bold text-xs text-emerald-800 bg-emerald-50 border border-emerald-300 rounded-lg outline-none font-mono"
                                />
                              ) : (
                                <span className="font-bold text-emerald-700 font-mono text-xs">
                                  {currentFulfilledQty} {it.unit}
                                </span>
                              )}
                            </td>
                            <td className="p-2.5 text-gray-500 text-[11px]">{it.notes || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Status Action Buttons for Logistik & Admin */}
              {!isHKUser && (
                <div className="pt-2 border-t border-gray-100 space-y-2">
                  <span className="text-[11px] font-bold text-gray-500 uppercase block">
                    Aksi Logistik:
                  </span>
                  <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                    {((selectedRequest.status || '').toUpperCase() === 'MENUNGGU' || (selectedRequest.status || '').toUpperCase() === 'PENDING') && (
                      <>
                        <button
                          type="button"
                          disabled={processingId === selectedRequest.id}
                          onClick={() => handleUpdateStatus(selectedRequest.id, 'DIPROSES')}
                          className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                        >
                          <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                          <span>Proses Permintaan</span>
                        </button>
                        <button
                          type="button"
                          disabled={processingId === selectedRequest.id}
                          onClick={() => handleUpdateStatus(selectedRequest.id, 'DITOLAK')}
                          className="w-full sm:w-auto px-3.5 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                        >
                          <XCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>Tolak</span>
                        </button>
                      </>
                    )}

                    {((selectedRequest.status || '').toUpperCase() === 'DIPROSES' || (selectedRequest.status || '').toUpperCase() === 'PROCESSING') && (
                      <>
                        <button
                          type="button"
                          disabled={processingId === selectedRequest.id}
                          onClick={() => handleUpdateStatus(selectedRequest.id, 'SELESAI')}
                          className="w-full sm:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>Selesaikan &amp; Potong Stok Gudang</span>
                        </button>
                        <button
                          type="button"
                          disabled={processingId === selectedRequest.id}
                          onClick={() => handleUpdateStatus(selectedRequest.id, 'DITOLAK')}
                          className="w-full sm:w-auto px-3.5 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                        >
                          <XCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>Tolak</span>
                        </button>
                      </>
                    )}

                    {((selectedRequest.status || '').toUpperCase() === 'SELESAI' || (selectedRequest.status || '').toUpperCase() === 'COMPLETED') && (
                      <div className="w-full p-2.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Tiket telah selesai diproses &amp; stok gudang telah dipotong.</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 sm:p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-2.5 shrink-0 flex-wrap">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-2 border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                >
                  <Printer className="w-3.5 h-3.5 shrink-0" />
                  <span>Cetak</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteRequest(selectedRequest.id)}
                  className="px-3 py-2 border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                  title="Hapus Tiket Ini"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Hapus</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRequest(null)}
                className="px-5 py-2 bg-gray-900 hover:bg-gray-800 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95 ml-auto"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedRequest && (
        <div className="print-only">
          <HousekeepingRequestDocument request={selectedRequest} />
        </div>
      )}
    </>
  );
}
