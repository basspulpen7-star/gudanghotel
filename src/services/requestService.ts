import { warehouseSupabase } from '../lib/supabaseWarehouse';
import { breakfastSupabase } from '../lib/supabaseBreakfast';
import { HKRequest, HKRequestItem, BreakfastRecord } from '../types';
import { queryCache } from '../lib/queryCache';
import { inventoryService } from './inventoryService';

const LOCAL_STORAGE_KEY = 'gudang_alia_hk_requests';

// Short-term memory cache for occupancy query results (60 seconds TTL)
const CACHE_TTL_MS = 60000;

// Helper function to ensure YYYY-MM-DD date string without timezone shifting
export const formatDateForDB = (dateInput: any): string => {
  if (!dateInput) return '';
  if (typeof dateInput === 'string') {
    return dateInput.trim().slice(0, 10);
  }
  if (dateInput instanceof Date) {
    const year = dateInput.getFullYear();
    const month = String(dateInput.getMonth() + 1).padStart(2, '0');
    const day = String(dateInput.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(dateInput).trim().slice(0, 10);
};

export const requestService = {
  // Test connection to Breakfast Supabase
  async testBreakfastConnection(): Promise<{ connected: boolean; error: string | null }> {
    try {
      const { data, error } = await breakfastSupabase
        .from('breakfast_records')
        .select('day_date')
        .limit(1);

      const connected = !error;
      return { connected, error: error?.message || null };
    } catch (e: any) {
      return { connected: false, error: e?.message || 'Connection failed' };
    }
  },

  // Fetch all requests with safe fallback and query cache
  async getRequests(forceRefresh = false): Promise<HKRequest[]> {
    return queryCache.fetchWithCache<HKRequest[]>(
      'requests:all',
      async () => {
        try {
          const { data, error } = await warehouseSupabase
            .from('requests')
            .select(`
              id,
              request_number,
              department,
              requester_name,
              user_id,
              request_type,
              status,
              occupancy_count,
              breakfast_pax,
              notes,
              created_at,
              request_items (
                id,
                request_id,
                item_id,
                item_name,
                quantity,
                unit,
                notes
              )
            `)
            .order('created_at', { ascending: false });

          if (error) {
            console.warn('[REQUEST SERVICE] Supabase query notice, using local cache:', error.message);
            return this.getLocalRequests();
          }

          if (data && data.length > 0) {
            // Map database response to standardized HKRequest
            const formatted: HKRequest[] = data.map((r: any) => ({
              id: r.id,
              request_number: r.request_number || r.req_number || `REQ-${r.id.slice(0, 4).toUpperCase()}`,
              department: r.department || 'Housekeeping',
              requester_name: r.requester_name || r.requested_by || 'Housekeeping Staff',
              user_id: r.user_id,
              request_type: r.request_type || (r.notes?.includes('[MANUAL]') ? 'manual' : (r.notes?.includes('[OCCUPANCY]') ? 'occupancy' : undefined)),
              status: (r.status || 'MENUNGGU').toUpperCase(),
              occupancy_count: r.occupancy_count || r.rooms_occupied || 0,
              breakfast_pax: r.breakfast_pax || 0,
              notes: r.notes || '',
              created_at: r.created_at || new Date().toISOString(),
              items: (r.request_items || []).map((it: any) => ({
                id: it.id,
                request_id: it.request_id || r.id,
                item_id: it.item_id,
                item_name: it.item_name || it.name || 'Barang',
                quantity: Number(it.quantity || it.quantity_requested || 0),
                unit: it.unit || 'pcs',
                notes: it.notes || ''
              }))
            }));

            // Cache locally for offline/fallback
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(formatted));
            return formatted;
          }

          // If empty in Supabase, load local
          return this.getLocalRequests();
        } catch (err: any) {
          console.warn('[REQUEST SERVICE] Catch error in getRequests:', err?.message || err);
          return this.getLocalRequests();
        }
      },
      30000,
      forceRefresh
    );
  },

  getLocalRequests(): HKRequest[] {
    try {
      const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        // Filter out dummy/mock requests
        const cleaned = Array.isArray(parsed) 
          ? parsed.filter((r: HKRequest) => !r.id.startsWith('req-hk-00')) 
          : [];
        if (cleaned.length !== (Array.isArray(parsed) ? parsed.length : 0)) {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cleaned));
        }
        return cleaned;
      }
      return [];
    } catch (e) {
      return [];
    }
  },

  async clearAllRequests(): Promise<void> {
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      await warehouseSupabase.from('requests').delete().neq('id', '');
    } catch (e: any) {
      console.warn('[REQUEST SERVICE] Clear requests notice:', e?.message || e);
    }
    queryCache.invalidate('requests');
  },

  async deleteRequest(requestId: string): Promise<void> {
    try {
      await warehouseSupabase.from('requests').delete().eq('id', requestId);
    } catch (e: any) {
      console.warn('[REQUEST SERVICE] Delete request notice:', e?.message || e);
    }

    const list = this.getLocalRequests();
    const updated = list.filter(r => r.id !== requestId);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    queryCache.invalidate('requests');
  },

  // Check if HK has already ordered occupancy items today
  async checkTodayOccupancyOrder(targetDateStr?: string): Promise<{
    ordered: boolean;
    request?: HKRequest;
  }> {
    const todayStr = targetDateStr || formatDateForDB(new Date());
    const allRequests = await this.getRequests();

    const OCCUPANCY_ITEM_NAMES = [
      'Linen',
      'Handuk',
      'Tissue Roll',
      'Kopi',
      'Gula',
      'Creamer',
      'Sikat Gigi',
      'Sabun + Shampoo (2-in-1)',
      'Air Mineral',
      'Bath Towel',
      'Hand Towel',
      'Shampoo & Sabun'
    ];

    const todayOccupancy = allRequests.find(req => {
      const reqDate = formatDateForDB(req.created_at);
      if (reqDate !== todayStr) return false;

      // If explicitly marked manual, ignore
      if (req.request_type === 'manual' || req.notes?.includes('[MANUAL]')) {
        return false;
      }

      // If explicitly marked occupancy
      if (req.request_type === 'occupancy' || req.notes?.includes('[OCCUPANCY]')) {
        return true;
      }

      // Check if it contains automatic occupancy items
      const hasOccupancyItems = req.items?.some(it =>
        OCCUPANCY_ITEM_NAMES.some(name => name.toLowerCase() === it.item_name.toLowerCase())
      );

      return hasOccupancyItems || false;
    });

    return {
      ordered: !!todayOccupancy,
      request: todayOccupancy
    };
  },

  // Create new Housekeeping Request
  async createRequest(req: {
    department: string;
    requester_name: string;
    occupancy_count: number;
    breakfast_pax: number;
    notes?: string;
    request_type?: 'occupancy' | 'manual';
    items: Array<{
      item_name: string;
      quantity: number;
      unit: string;
      notes?: string;
    }>;
  }): Promise<HKRequest> {
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randSuffix = Math.floor(100 + Math.random() * 900);
    const reqNumber = `REQ-HK-${todayStr}-${randSuffix}`;

    const newRequestId = crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}-${Math.random()}`;

    let userId: string | undefined = undefined;
    try {
      const { data: { user } } = await warehouseSupabase.auth.getUser();
      userId = user?.id;
    } catch (e) {
      // ignore
    }

    const reqType = req.request_type || 'occupancy';
    const tag = reqType === 'occupancy' ? '[OCCUPANCY]' : '[MANUAL]';
    const userNotes = (req.notes || '').trim();
    const finalNotes = userNotes ? `${tag} ${userNotes}` : tag;

    const newRequest: HKRequest = {
      id: newRequestId,
      request_number: reqNumber,
      department: req.department || 'Housekeeping',
      requester_name: req.requester_name,
      user_id: userId,
      request_type: reqType,
      status: 'MENUNGGU',
      occupancy_count: req.occupancy_count,
      breakfast_pax: req.breakfast_pax,
      notes: finalNotes,
      created_at: new Date().toISOString(),
      items: req.items.map(it => ({
        id: crypto.randomUUID ? crypto.randomUUID() : `item-${Date.now()}-${Math.random()}`,
        request_id: newRequestId,
        item_name: it.item_name,
        quantity: it.quantity,
        unit: it.unit,
        notes: it.notes || ''
      }))
    };

    try {
      const insertPayload: any = {
        id: newRequest.id,
        request_number: newRequest.request_number,
        department: newRequest.department,
        requester_name: newRequest.requester_name,
        user_id: newRequest.user_id,
        request_type: reqType,
        status: newRequest.status,
        occupancy_count: newRequest.occupancy_count,
        breakfast_pax: newRequest.breakfast_pax,
        notes: newRequest.notes,
        created_at: newRequest.created_at
      };

      // Insert header
      const { error: headerErr } = await warehouseSupabase
        .from('requests')
        .insert([insertPayload]);

      if (headerErr) {
        console.warn('[REQUEST SERVICE] Header insert notice, retrying without request_type:', headerErr.message);
        delete insertPayload.request_type;
        await warehouseSupabase.from('requests').insert([insertPayload]);
      }

      // Insert items
      if (newRequest.items && newRequest.items.length > 0) {
        const itemsToInsert = newRequest.items.map(it => ({
          id: it.id,
          request_id: newRequest.id,
          item_name: it.item_name,
          quantity: it.quantity,
          unit: it.unit,
          notes: it.notes
        }));

        const { error: itemsErr } = await warehouseSupabase
          .from('request_items')
          .insert(itemsToInsert);

        if (itemsErr) {
          console.warn('[REQUEST SERVICE] Items insert notice:', itemsErr.message);
        }
      }
    } catch (err: any) {
      console.warn('[REQUEST SERVICE] Create request catch notice:', err?.message || err);
    }

    // Cache locally
    const existing = this.getLocalRequests();
    const updated = [newRequest, ...existing];
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));

    queryCache.invalidate('requests');
    return newRequest;
  },

  // Read-only occupancy query from public.breakfast_records in Breakfast Supabase
  // Strictly selects only necessary columns: day_date, room_number, is_occupied
  async getOccupancyData(rawTargetDate: string, forceRefresh = false): Promise<{
    roomsOccupied: number;
    guestCount: number;
    familyRoomsOccupied: number;
    occupiedRoomsList: string[];
    source: string;
    connected: boolean;
    date: string;
    error?: string;
  }> {
    const occupancyDate = formatDateForDB(rawTargetDate);
    const cacheKey = `occupancy:${occupancyDate}`;

    return queryCache.fetchWithCache(
      cacheKey,
      async () => {
        const FAMILY_ROOMS = ['105', '109', '205', '209', '305', '309', '405', '409'];

        try {
          const { data, error } = await breakfastSupabase
            .from('breakfast_records')
            .select('day_date, room_number, is_occupied')
            .eq('day_date', occupancyDate);

          if (error) {
            console.error('[BREAKFAST QUERY ERROR]', {
              message: error.message,
              code: error.code
            });

            return {
              roomsOccupied: 0,
              guestCount: 0,
              familyRoomsOccupied: 0,
              occupiedRoomsList: [],
              source: 'breakfast_supabase',
              connected: false,
              date: occupancyDate,
              error: error.message
            };
          }

          // Filter is_occupied === true
          const occupiedRows = (data ?? []).filter((row: any) => row.is_occupied === true);
          const roomList = occupiedRows.map((r: any) => String(r.room_number)).filter(Boolean);
          const familyCount = roomList.filter(r => FAMILY_ROOMS.includes(r)).length;

          // Guest count calculation: 2 guests for standard room, 4 guests for family room
          const totalGuests = occupiedRows.reduce((sum: number, r: any) => {
            const roomNum = String(r.room_number || '');
            const isFamily = FAMILY_ROOMS.includes(roomNum);
            return sum + (isFamily ? 4 : 2);
          }, 0);

          return {
            roomsOccupied: occupiedRows.length,
            guestCount: totalGuests,
            familyRoomsOccupied: familyCount,
            occupiedRoomsList: roomList,
            source: 'breakfast_supabase',
            connected: true,
            date: occupancyDate
          };
        } catch (err: any) {
          console.error('[BREAKFAST QUERY CATCH ERROR]', err);
          return {
            roomsOccupied: 0,
            guestCount: 0,
            familyRoomsOccupied: 0,
            occupiedRoomsList: [],
            source: 'breakfast_supabase',
            connected: false,
            date: occupancyDate,
            error: err?.message || 'Unexpected exception'
          };
        }
      },
      CACHE_TTL_MS,
      forceRefresh
    );
  },

  // Update request status (e.g. DIPROSES, SELESAI, DITOLAK)
  async updateStatus(requestId: string, status: 'MENUNGGU' | 'DIPROSES' | 'SELESAI' | 'DITOLAK'): Promise<void> {
    try {
      await warehouseSupabase
        .from('requests')
        .update({ status })
        .eq('id', requestId);
    } catch (e: any) {
      console.warn('[REQUEST SERVICE] Supabase update status notice:', e?.message || e);
    }

    const list = this.getLocalRequests();
    const index = list.findIndex(r => r.id === requestId);
    if (index !== -1) {
      list[index].status = status;
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
    }
    queryCache.invalidate('requests');
  },

  // Complete request and optionally record outgoing goods
  async completeAndFulfill(
    request: HKRequest, 
    recordOutgoing: boolean = true, 
    fulfilledItems?: HKRequestItem[]
  ): Promise<void> {
    await this.updateStatus(request.id, 'SELESAI');

    const itemsToProcess = (fulfilledItems && fulfilledItems.length > 0) ? fulfilledItems : (request.items || []);

    if (recordOutgoing && itemsToProcess.length > 0) {
      try {
        const { data: { user } } = await warehouseSupabase.auth.getUser();
        const userId = user?.id;

        // Use cached items instead of raw query
        const masterItems = await inventoryService.getCachedItems();

        for (const reqItem of itemsToProcess) {
          const qtyToDeduct = Number(reqItem.quantity || 0);
          if (qtyToDeduct <= 0) continue;

          let matchedItemId = reqItem.item_id;
          let matchedCurrentStock = 0;

          if (masterItems) {
            const found = matchedItemId
              ? masterItems.find(m => m.id === matchedItemId)
              : masterItems.find(m => m.name.toLowerCase() === reqItem.item_name.toLowerCase());

            if (found) {
              matchedItemId = found.id;
              matchedCurrentStock = found.current_stock || 0;
            }
          }

          if (matchedItemId) {
            // Insert outgoing transaction
            await warehouseSupabase.from('transactions').insert([{
              id: crypto.randomUUID ? crypto.randomUUID() : `tx-${Date.now()}-${Math.random()}`,
              item_id: matchedItemId,
              type: 'OUT',
              quantity: qtyToDeduct,
              department: 'Housekeeping',
              notes: `Fulfillment Permintaan HK ${request.request_number || request.id}`,
              user_id: userId,
              created_at: new Date().toISOString()
            }]);

            // Decrement item stock based on actual issued/fulfilled quantity
            const targetStock = Math.max(0, matchedCurrentStock - qtyToDeduct);
            await warehouseSupabase.from('items').update({ current_stock: targetStock }).eq('id', matchedItemId);
          }
        }
        inventoryService.invalidateCache();
      } catch (err: any) {
        console.warn('[REQUEST SERVICE] Auto outgoing transaction notice:', err?.message || err);
      }
    }
  }
};
