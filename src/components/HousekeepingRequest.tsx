import React, { useState, useEffect } from 'react';
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
  ChevronDown,
  ChevronUp,
  Package,
  Filter,
  Check,
  ClipboardList,
  User,
  ArrowRight
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { HKRequest, HKRequestItem, Item } from '../types';
import { requestService } from '../services/requestService';
import { cn } from '../lib/utils';
import { format, parseISO } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

interface HousekeepingRequestProps {
  globalSearch?: string;
}

interface PredefinedItem {
  id: string;
  category: 'LINEN' | 'TOILETRIES' | 'BEVERAGE & AMENITY' | 'OTHER';
  item_name: string;
  sublabel: string;
  unit: string;
  multiplierType: 'guest' | 'room' | 'fixed';
  multiplier: number;
}

const PREDEFINED_ITEMS: PredefinedItem[] = [
  // LINEN (2 item)
  { id: 'bath_towel', category: 'LINEN', item_name: 'Bath Towel', sublabel: '2 / guest', unit: 'pcs', multiplierType: 'guest', multiplier: 2 },
  { id: 'hand_towel', category: 'LINEN', item_name: 'Hand Towel', sublabel: '1 / guest', unit: 'pcs', multiplierType: 'guest', multiplier: 1 },
  // TOILETRIES (2 item)
  { id: 'sikat_gigi', category: 'TOILETRIES', item_name: 'Sikat Gigi', sublabel: '2 / guest', unit: 'pcs', multiplierType: 'guest', multiplier: 2 },
  { id: 'shampoo_sabun', category: 'TOILETRIES', item_name: 'Shampoo & Sabun', sublabel: '1 / guest', unit: 'pcs', multiplierType: 'guest', multiplier: 1 },
  // BEVERAGE & AMENITY (4 item)
  { id: 'kopi', category: 'BEVERAGE & AMENITY', item_name: 'Kopi', sublabel: '2 / room', unit: 'pcs', multiplierType: 'room', multiplier: 2 },
  { id: 'teh', category: 'BEVERAGE & AMENITY', item_name: 'Teh', sublabel: '2 / room', unit: 'pcs', multiplierType: 'room', multiplier: 2 },
  { id: 'gula', category: 'BEVERAGE & AMENITY', item_name: 'Gula', sublabel: '4 / room', unit: 'pcs', multiplierType: 'room', multiplier: 4 },
  { id: 'tissue_roll', category: 'BEVERAGE & AMENITY', item_name: 'Tissue Roll', sublabel: '1 / room', unit: 'pcs', multiplierType: 'room', multiplier: 1 }
];

export function HousekeepingRequest({ globalSearch = '' }: HousekeepingRequestProps) {
  const { user, profile, isAdmin, isLogistik, isHK } = useAuth();

  // Active view: HK role gets the Form Permintaan HK, while Admin, Logistik, and Staff get the Daftar Permintaan Masuk (Logistik) view
  const isHKUser = isHK || profile?.role === 'hk' || user?.user_metadata?.role === 'hk';

  // Filter for Logistik incoming requests
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Occupancy & Date states
  const todayIso = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [occupancyRooms, setOccupancyRooms] = useState<number>(0);
  const [guestCount, setGuestCount] = useState<number>(0);
  const [familyRoomsCount, setFamilyRoomsCount] = useState<number>(0);
  const [isLiveDb, setIsLiveDb] = useState<boolean>(true);
  const [occupancyConnected, setOccupancyConnected] = useState<boolean>(true);
  const [loadingOccupancy, setLoadingOccupancy] = useState<boolean>(false);

  // Form quantities (map of item id -> quantity)
  const [quantities, setQuantities] = useState<{ [key: string]: number }>({});
  
  // Custom items added via "+ Tambah Barang Lain"
  const [customItems, setCustomItems] = useState<Array<{
    id: string;
    item_name: string;
    quantity: number;
    unit: string;
    notes?: string;
  }>>([]);

  const [isAddingCustom, setIsAddingCustom] = useState<boolean>(false);
  const [newCustomName, setNewCustomName] = useState('');
  const [newCustomQty, setNewCustomQty] = useState(1);
  const [newCustomUnit, setNewCustomUnit] = useState('pcs');

  // Notes & Submission
  const [requestNotes, setRequestNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // History & Requests
  const [requests, setRequests] = useState<HKRequest[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [selectedRequest, setSelectedRequest] = useState<HKRequest | null>(null);

  // Initialize quantities based on rooms and guests
  const calculateQuantities = (rooms: number, guests: number) => {
    const initial: { [key: string]: number } = {};
    PREDEFINED_ITEMS.forEach(item => {
      if (item.multiplierType === 'guest') {
        initial[item.id] = guests * item.multiplier;
      } else if (item.multiplierType === 'room') {
        initial[item.id] = rooms * item.multiplier;
      } else {
        initial[item.id] = item.multiplier;
      }
    });
    return initial;
  };

  useEffect(() => {
    loadRequests();
    fetchOccupancy(selectedDate);
  }, []);

  const loadRequests = async () => {
    try {
      const data = await requestService.getRequests();
      setRequests(data);
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
      setFamilyRoomsCount(occ.familyRoomsOccupied);
      setOccupancyConnected(occ.connected);
      setIsLiveDb(occ.connected);
      
      // Auto-calculate predefined quantities
      const newQtys = calculateQuantities(occ.roomsOccupied, occ.guestCount);
      setQuantities(newQtys);
    } catch (e: any) {
      console.warn('Failed to fetch occupancy:', e);
      setOccupancyRooms(0);
      setGuestCount(0);
      setFamilyRoomsCount(0);
      setOccupancyConnected(false);
      setIsLiveDb(false);
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

  const handleAddCustomItem = () => {
    if (!newCustomName.trim()) return;
    const newItem = {
      id: 'custom_' + Date.now(),
      item_name: newCustomName.trim(),
      quantity: Math.max(1, newCustomQty),
      unit: newCustomUnit.trim() || 'pcs'
    };
    setCustomItems([...customItems, newItem]);
    setNewCustomName('');
    setNewCustomQty(1);
    setNewCustomUnit('pcs');
    setIsAddingCustom(false);
  };

  const handleRemoveCustomItem = (id: string) => {
    setCustomItems(customItems.filter(i => i.id !== id));
  };

  // Submit Request
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prepare items list
    const itemsToSubmit: Array<{
      item_name: string;
      quantity: number;
      unit: string;
      notes?: string;
    }> = [];

    PREDEFINED_ITEMS.forEach(item => {
      const qty = quantities[item.id] !== undefined ? quantities[item.id] : (item.multiplierType === 'guest' ? guestCount * item.multiplier : occupancyRooms * item.multiplier);
      if (qty > 0) {
        itemsToSubmit.push({
          item_name: item.item_name,
          quantity: qty,
          unit: item.unit,
          notes: item.sublabel
        });
      }
    });

    customItems.forEach(c => {
      if (c.quantity > 0) {
        itemsToSubmit.push({
          item_name: c.item_name,
          quantity: c.quantity,
          unit: c.unit,
          notes: 'Barang Tambahan'
        });
      }
    });

    if (itemsToSubmit.length === 0) {
      setNotification({ type: 'error', message: 'Harap masukkan minimal 1 barang dengan jumlah lebih dari 0.' });
      return;
    }

    setSubmitting(true);
    setNotification(null);

    try {
      const requesterName = profile?.full_name || user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'hk';
      await requestService.createRequest({
        department: 'Housekeeping',
        requester_name: requesterName,
        occupancy_count: occupancyRooms,
        breakfast_pax: guestCount,
        notes: requestNotes.trim(),
        items: itemsToSubmit
      });

      setNotification({
        type: 'success',
        message: 'Permintaan berhasil dikirim ke Logistik!'
      });

      setRequestNotes('');
      setCustomItems([]);
      await loadRequests();
      
      // Auto-recalculate
      setQuantities(calculateQuantities(occupancyRooms, guestCount));
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
        await requestService.completeAndFulfill(selectedRequest, true);
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

  // Group predefined items by category
  const categories: Array<'LINEN' | 'TOILETRIES' | 'BEVERAGE & AMENITY'> = ['LINEN', 'TOILETRIES', 'BEVERAGE & AMENITY'];

  // Counts for filter chips
  const countAll = requests.length;
  const countMenunggu = requests.filter(r => (r.status || '').toUpperCase() === 'MENUNGGU' || (r.status || '').toUpperCase() === 'PENDING').length;
  const countDiproses = requests.filter(r => (r.status || '').toUpperCase() === 'DIPROSES' || (r.status || '').toUpperCase() === 'PROCESSING').length;
  const countSelesai = requests.filter(r => (r.status || '').toUpperCase() === 'SELESAI' || (r.status || '').toUpperCase() === 'COMPLETED').length;

  // Filter requests
  const filteredRequests = requests.filter(r => {
    const s = (r.status || '').toUpperCase();
    if (filterStatus === 'MENUNGGU') return s === 'MENUNGGU' || s === 'PENDING';
    if (filterStatus === 'DIPROSES') return s === 'DIPROSES' || s === 'PROCESSING';
    if (filterStatus === 'SELESAI') return s === 'SELESAI' || s === 'COMPLETED';
    return true;
  });

  return (
    <div className="space-y-4 max-w-4xl mx-auto text-gray-900 pb-16 font-sans">
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
      {/* VIEW A: PERMINTAAN MASUK (LOGISTIK) - DITAMPILKAN UNTUK ADMIN/LOGISTIK/STAFF */}
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
                onClick={loadRequests}
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
                      <span className="text-gray-500 font-medium">Occupancy: </span>
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
          {/* 1. OCCUPANCY CARD */}
          <div className="bg-white border border-gray-200/90 rounded-2xl p-3.5 sm:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-gray-900 tracking-wider uppercase">
                  OCCUPANCY
                </span>
                {occupancyConnected ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-full text-[10px] font-bold shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    LIVE
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-full text-[10px] font-bold shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                    TIDAK TERSEDIA
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

            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1 border-t border-gray-100">
              <div className="flex items-baseline gap-2 flex-wrap">
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight font-mono">
                    {occupancyRooms}
                  </span>
                  <span className="text-xs sm:text-sm font-semibold text-gray-500">
                    Kamar
                  </span>
                </div>
                <span className="text-gray-300 font-bold">•</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight font-mono">
                    {guestCount}
                  </span>
                  <span className="text-xs sm:text-sm font-semibold text-gray-500">
                    Guest
                  </span>
                </div>
              </div>

              <div className="px-3 py-1 bg-gray-100 text-gray-700 font-semibold text-xs rounded-xl border border-gray-200/60 shrink-0">
                {formattedDateIndo}
              </div>
            </div>
          </div>

          {/* 2. KEBUTUHAN BARANG CARD */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-white border border-gray-200/90 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] overflow-hidden">
              {/* Black Bar Header */}
              <div className="bg-[#1a1918] px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-amber-500 font-black text-xs sm:text-sm tracking-wider uppercase">
                  KEBUTUHAN BARANG
                </span>
                <span className="text-white font-bold text-xs sm:text-sm">
                  {occupancyRooms} Kamar - {guestCount} Guest
                </span>
              </div>

              {/* Categories & Items List */}
              <div className="divide-y divide-gray-100">
                {categories.map((cat) => {
                  const catItems = PREDEFINED_ITEMS.filter(it => it.category === cat);
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
                          const qty = quantities[item.id] !== undefined 
                            ? quantities[item.id] 
                            : (item.multiplierType === 'guest' ? guestCount * item.multiplier : occupancyRooms * item.multiplier);

                          return (
                            <div 
                              key={item.id} 
                              className="px-3.5 sm:px-5 py-3 flex items-center justify-between gap-2.5 hover:bg-amber-50/20 transition-colors"
                            >
                              {/* Item Name & Sublabel */}
                              <div className="min-w-0 flex-1 pr-1">
                                <p className="font-bold text-gray-900 text-sm sm:text-base leading-snug break-words">
                                  {item.item_name}
                                </p>
                                <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5 font-medium">
                                  {item.sublabel}
                                </p>
                              </div>

                              {/* Controls (Badge + Stepper) */}
                              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 overflow-visible">
                                {/* Orange/Yellow Badge */}
                                <span className="px-2 sm:px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200/90 rounded-lg text-xs font-bold font-mono inline-flex items-center gap-0.5 min-w-[50px] sm:min-w-[58px] justify-center shrink-0">
                                  <span>{qty}</span>
                                  <span className="text-[10px] font-normal text-amber-700">{item.unit}</span>
                                </span>

                                {/* Stepper */}
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
                                    value={qty}
                                    onChange={(e) => setDirectQuantity(item.id, parseInt(e.target.value) || 0)}
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
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Custom Items Section */}
                {customItems.length > 0 && (
                  <div>
                    <div className="px-3.5 sm:px-5 py-2.5 bg-amber-50/70 border-b border-amber-100 flex items-center justify-between text-[11px] font-extrabold text-amber-800 tracking-wider uppercase">
                      <span>BARANG TAMBAHAN LAINNYA</span>
                      <span className="text-amber-600 font-medium lowercase text-[11px]">
                        {customItems.length} item
                      </span>
                    </div>

                    <div className="divide-y divide-gray-100">
                      {customItems.map((c) => (
                        <div key={c.id} className="px-3.5 sm:px-5 py-3 flex items-center justify-between gap-2.5 hover:bg-amber-50/20">
                          <div className="min-w-0 flex-1 pr-1">
                            <p className="font-bold text-gray-900 text-sm sm:text-base leading-snug break-words">
                              {c.item_name}
                            </p>
                            <p className="text-[11px] sm:text-xs text-amber-600 mt-0.5 font-medium">
                              Barang Tambahan
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 overflow-visible">
                            <span className="px-2 sm:px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold font-mono min-w-[50px] sm:min-w-[58px] text-center shrink-0">
                              <span>{c.quantity}</span> <span className="text-[10px] font-normal text-amber-700">{c.unit}</span>
                            </span>

                            <div className="quantity-control flex items-center gap-1.5 sm:gap-1 shrink-0 overflow-visible">
                              <button
                                type="button"
                                onClick={() => updateCustomQuantity(c.id, -1)}
                                className="quantity-button w-10 h-10 sm:w-8 sm:h-8 rounded-[7px] sm:rounded-lg border border-gray-300 sm:border-gray-200 bg-white hover:bg-gray-100 text-gray-800 font-bold flex items-center justify-center text-sm sm:text-xs cursor-pointer shrink-0"
                              >
                                <Minus className="w-4 h-4 sm:w-3.5 sm:h-3.5 stroke-[2.5]" />
                              </button>

                              <input
                                type="number"
                                min="0"
                                value={c.quantity}
                                onChange={(e) => updateCustomQuantityDirect(c.id, parseInt(e.target.value) || 0)}
                                className="quantity-input w-[64px] min-w-[64px] h-10 sm:h-8 text-center font-bold text-[15px] sm:text-sm text-[#1f2937] bg-white border border-[#d1d5db] sm:border-gray-200 rounded-[7px] sm:rounded-lg !px-1 !py-0 outline-none focus:border-amber-500 font-mono box-border shrink-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />

                              <button
                                type="button"
                                onClick={() => updateCustomQuantity(c.id, 1)}
                                className="quantity-button w-10 h-10 sm:w-8 sm:h-8 rounded-[7px] sm:rounded-lg border border-gray-300 sm:border-gray-200 bg-white hover:bg-gray-100 text-gray-800 font-bold flex items-center justify-center text-sm sm:text-xs cursor-pointer shrink-0"
                              >
                                <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5 stroke-[2.5]" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleRemoveCustomItem(c.id)}
                                className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg transition-colors ml-0.5"
                                title="Hapus"
                              >
                                <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 3. TOMBOL TAMBAH BARANG LAIN */}
            {!isAddingCustom ? (
              <button
                type="button"
                onClick={() => setIsAddingCustom(true)}
                className="w-full py-3.5 px-4 border border-dashed border-amber-300 bg-amber-50/40 hover:bg-amber-50/90 text-amber-800 font-extrabold text-xs sm:text-sm rounded-2xl flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer active:scale-[0.99]"
              >
                <Plus className="w-4 h-4 text-amber-700 font-black shrink-0" />
                <span>+ Tambah Barang Lain</span>
              </button>
            ) : (
              <div className="p-3.5 sm:p-4 bg-white border border-amber-300 rounded-2xl shadow-xs space-y-3 animate-in fade-in duration-150">
                <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                  <span className="text-xs font-bold text-gray-900 uppercase">Tambah Barang Kebutuhan HK</span>
                  <button 
                    type="button" 
                    onClick={() => setIsAddingCustom(false)} 
                    className="text-xs text-gray-400 hover:text-gray-700 p-1"
                  >
                    Batal ✕
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                  <input
                    type="text"
                    placeholder="Nama barang (contoh: Karbol 5L, Plastik Sampah)"
                    value={newCustomName}
                    onChange={(e) => setNewCustomName(e.target.value)}
                    className="sm:col-span-6 px-3.5 py-2.5 border border-gray-300 rounded-xl text-xs sm:text-sm text-gray-900 outline-none focus:border-amber-500"
                    autoFocus
                  />
                  <input
                    type="number"
                    min="1"
                    placeholder="Jumlah"
                    value={newCustomQty}
                    onChange={(e) => setNewCustomQty(parseInt(e.target.value) || 1)}
                    className="sm:col-span-3 px-3.5 py-2.5 border border-gray-300 rounded-xl text-xs sm:text-sm text-center font-bold text-gray-900 outline-none focus:border-amber-500"
                  />
                  <input
                    type="text"
                    placeholder="Satuan (pcs, btl, pack)"
                    value={newCustomUnit}
                    onChange={(e) => setNewCustomUnit(e.target.value)}
                    className="sm:col-span-3 px-3.5 py-2.5 border border-gray-300 rounded-xl text-xs sm:text-sm text-center text-gray-900 outline-none focus:border-amber-500"
                  />
                </div>
                <div className="flex flex-wrap justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsAddingCustom(false)}
                    className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-100 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleAddCustomItem}
                    className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs"
                  >
                    Tambahkan
                  </button>
                </div>
              </div>
            )}

            {/* 4. CARD CATATAN */}
            <div className="bg-white border border-gray-200/90 rounded-2xl p-3.5 sm:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800 uppercase tracking-wide">
                <FileText className="w-4 h-4 text-amber-600 shrink-0" />
                <span>CATATAN</span>
              </div>
              <input
                type="text"
                value={requestNotes}
                onChange={(e) => setRequestNotes(e.target.value)}
                placeholder="Tambahkan catatan untuk Logistik (opsional)..."
                className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs sm:text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
              />
            </div>

            {/* 5. TOMBOL KIRIM PERMINTAAN */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-4 px-6 bg-[#e65c00] hover:bg-[#cf5300] text-white font-black text-sm sm:text-base rounded-2xl shadow-lg shadow-orange-500/20 transition-all flex items-center justify-center gap-2.5 uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.99]"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                  <span>MENGIRIM PERMINTAAN...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 shrink-0" />
                  <span>KIRIM PERMINTAAN</span>
                </>
              )}
            </button>
          </form>

          {/* 6. FOOTER: RIWAYAT PERMINTAAN SAYA (FOR HK) */}
          <div className="border-t border-gray-200/80 pt-4 mt-6">
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="w-full flex items-center justify-between text-xs font-extrabold text-gray-800 uppercase tracking-wider hover:text-amber-600 transition-colors py-1 cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-600 shrink-0" />
                <span>RIWAYAT PERMINTAAN SAYA</span>
              </div>
              <div className="flex items-center gap-2 text-gray-500 font-normal normal-case">
                <span>{requests.length} tiket</span>
                {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>

            {/* Collapsible History Section */}
            {showHistory && (
              <div className="mt-4 space-y-3 animate-in fade-in duration-200">
                {requests.length === 0 ? (
                  <div className="p-6 sm:p-8 bg-white border border-gray-200 rounded-2xl text-center text-gray-500 text-xs">
                    Belum ada tiket permintaan yang dibuat.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {requests.map((req) => (
                      <div
                        key={req.id}
                        className="p-3.5 sm:p-4 bg-white border border-gray-200 rounded-2xl hover:border-amber-300 transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-xs"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-extrabold text-sm text-amber-700">
                              {req.request_number || `REQ-${req.id.slice(0, 4)}`}
                            </span>
                            {getStatusBadge(req.status)}
                          </div>
                          <p className="text-xs text-gray-500 mt-1 leading-snug">
                            {formatDateDisplay(req.created_at)} • {req.items?.length || 0} macam barang
                          </p>
                          {req.notes && (
                            <p className="text-[11px] text-gray-400 italic mt-0.5 break-words">
                              "{req.notes}"
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedRequest(req)}
                          className="w-full sm:w-auto px-4 py-2 bg-[#EAA100] hover:bg-[#d69200] text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                        >
                          <Eye className="w-3.5 h-3.5 shrink-0" />
                          <span>Lihat Detail</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DETAIL MODAL (LIHAT DETAIL) WITH STATUS PROCESSING & TICKET PRINTING     */}
      {/* ========================================================================= */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[100] p-3 sm:p-4">
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
                <span className="font-bold text-gray-800 block mb-2 uppercase tracking-wide text-xs">
                  Daftar Barang Diminta ({selectedRequest.items?.length || 0})
                </span>
                <div className="border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[300px]">
                    <thead className="bg-gray-100 text-gray-600 font-bold text-[10px] uppercase">
                      <tr>
                        <th className="p-2.5 w-8 text-center">No</th>
                        <th className="p-2.5">Nama Barang</th>
                        <th className="p-2.5 text-center w-24">Jumlah</th>
                        <th className="p-2.5">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(selectedRequest.items || []).map((it, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/60">
                          <td className="p-2.5 text-gray-400 font-mono text-center text-xs">{idx + 1}</td>
                          <td className="p-2.5 font-bold text-gray-900 text-xs">{it.item_name}</td>
                          <td className="p-2.5 text-center whitespace-nowrap">
                            <span className="font-extrabold text-amber-700 font-mono text-xs mr-1">{it.quantity}</span>
                            <span className="text-gray-500 text-[11px] font-normal">{it.unit}</span>
                          </td>
                          <td className="p-2.5 text-gray-500 text-[11px]">{it.notes || '-'}</td>
                        </tr>
                      ))}
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
                        <span>Tiket telah selesai diproses &amp; barang disiapkan.</span>
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
    </div>
  );
}
