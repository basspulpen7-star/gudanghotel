import { supabase } from '../lib/supabase';
import { HKRequest, HKRequestItem, BreakfastRecord } from '../types';

const LOCAL_STORAGE_KEY = 'gudang_alia_hk_requests';
const LOCAL_BREAKFAST_KEY = 'gudang_alia_breakfast_records';

// Initial sample requests is empty so data starts completely clean
const getInitialSampleRequests = (): HKRequest[] => [];

export const requestService = {
  // Fetch all requests with safe fallback
  async getRequests(): Promise<HKRequest[]> {
    try {
      const { data, error } = await supabase
        .from('requests')
        .select(`
          *,
          request_items (*)
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

  getLocalRequests(): HKRequest[] {
    try {
      const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        // Filter out dummy/mock requests (e.g. req-hk-001, req-hk-002, req-hk-003)
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
      await supabase.from('requests').delete().neq('id', '');
    } catch (e: any) {
      console.warn('[REQUEST SERVICE] Clear requests notice:', e?.message || e);
    }
  },

  async deleteRequest(requestId: string): Promise<void> {
    try {
      await supabase.from('requests').delete().eq('id', requestId);
    } catch (e: any) {
      console.warn('[REQUEST SERVICE] Delete request notice:', e?.message || e);
    }

    const list = this.getLocalRequests();
    const filtered = list.filter(r => r.id !== requestId);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
  },

  // Create new request
  async createRequest(payload: {
    department?: string;
    requester_name?: string;
    occupancy_count?: number;
    breakfast_pax?: number;
    notes?: string;
    items: {
      item_id?: string;
      item_name: string;
      quantity: number;
      unit: string;
      notes?: string;
    }[];
  }): Promise<HKRequest> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    const generatedReqNumber = `REQ-${dateStr}-${randomSuffix}`;
    const newId = crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}`;

    let authUserId: string | undefined;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      authUserId = user?.id;
    } catch (e) {
      // ignore
    }

    const newRequest: HKRequest = {
      id: newId,
      request_number: generatedReqNumber,
      department: payload.department || 'Housekeeping',
      requester_name: payload.requester_name || 'Staf Housekeeping',
      user_id: authUserId,
      status: 'MENUNGGU',
      occupancy_count: payload.occupancy_count || 0,
      breakfast_pax: payload.breakfast_pax || 0,
      notes: payload.notes || '',
      created_at: new Date().toISOString(),
      items: payload.items.map((it, idx) => ({
        id: `item-${newId}-${idx}`,
        request_id: newId,
        item_id: it.item_id,
        item_name: it.item_name,
        quantity: it.quantity,
        unit: it.unit,
        notes: it.notes || ''
      }))
    };

    // Save to Supabase
    try {
      const { data: reqData, error: reqError } = await supabase
        .from('requests')
        .insert([{
          id: newId,
          request_number: generatedReqNumber,
          department: newRequest.department,
          requester_name: newRequest.requester_name,
          user_id: authUserId,
          status: 'MENUNGGU',
          occupancy_count: newRequest.occupancy_count,
          breakfast_pax: newRequest.breakfast_pax,
          notes: newRequest.notes,
          created_at: newRequest.created_at
        }])
        .select()
        .single();

      if (!reqError && reqData) {
        // Insert items
        const itemsToInsert = payload.items.map(it => ({
          request_id: newId,
          item_id: it.item_id || null,
          item_name: it.item_name,
          quantity: it.quantity,
          unit: it.unit,
          notes: it.notes || ''
        }));

        const { error: itemsError } = await supabase
          .from('request_items')
          .insert(itemsToInsert);

        if (itemsError) {
          console.warn('[REQUEST SERVICE] Item insertion notice:', itemsError.message);
        }
      }
    } catch (err: any) {
      console.warn('[REQUEST SERVICE] Supabase insert notice:', err?.message || err);
    }

    // Always update local cache
    const existing = this.getLocalRequests();
    const updated = [newRequest, ...existing];
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));

    // NOTE: Occupancy records is strictly READ-ONLY for HK, no INSERT/UPDATE/DELETE to breakfast_records
    return newRequest;
  },

  // Read-only occupancy query from public.breakfast_records
  async getOccupancyData(targetDate: string): Promise<{
    roomsOccupied: number;
    guestCount: number;
    familyRoomsOccupied: number;
    occupiedRoomsList: string[];
    isFromLiveDb: boolean;
  }> {
    const FAMILY_ROOMS = ['105', '109', '205', '209', '305', '309', '405', '409'];
    try {
      // Query breakfast_records filtering by day_date and is_occupied = true (or date column)
      const { data, error } = await supabase
        .from('breakfast_records')
        .select('*')
        .or(`day_date.eq.${targetDate},date.eq.${targetDate}`);

      if (error) {
        console.warn('[OCCUPANCY QUERY NOTICE]:', error.message);
        throw error;
      }

      if (data && data.length > 0) {
        // Case A: Granular room-by-room records with is_occupied
        const occupiedRows = data.filter((row: any) => 
          row.is_occupied === true || row.is_occupied === 'true' || row.is_occupied === 1 ||
          (row.is_occupied === undefined && (row.rooms_occupied === undefined || row.rooms_occupied > 0))
        );

        if (occupiedRows.length > 0 && occupiedRows[0].room_number !== undefined) {
          const roomList = occupiedRows.map((r: any) => String(r.room_number || r.room)).filter(Boolean);
          const familyCount = roomList.filter(r => FAMILY_ROOMS.includes(r)).length;
          const totalGuests = occupiedRows.reduce((sum: number, r: any) => {
            const pax = Number(r.guest_count || r.pax || r.breakfast_pax || (FAMILY_ROOMS.includes(String(r.room_number)) ? 4 : 2));
            return sum + pax;
          }, 0);

          return {
            roomsOccupied: occupiedRows.length,
            guestCount: totalGuests || (occupiedRows.length * 2),
            familyRoomsOccupied: familyCount,
            occupiedRoomsList: roomList,
            isFromLiveDb: true
          };
        }

        // Case B: Summary row per date (e.g. rooms_occupied, breakfast_pax)
        const summaryRow = data[0];
        const rooms = Number(summaryRow.rooms_occupied || summaryRow.occupied_count || summaryRow.rooms || 45);
        const pax = Number(summaryRow.breakfast_pax || summaryRow.guest_count || (rooms * 2));
        
        // Estimate family rooms proportionally if only aggregated count is available
        const estimatedFamilyRooms = Math.min(8, Math.round(rooms * 0.1));

        return {
          roomsOccupied: rooms,
          guestCount: pax,
          familyRoomsOccupied: estimatedFamilyRooms,
          occupiedRoomsList: [],
          isFromLiveDb: true
        };
      }
    } catch (e: any) {
      console.warn('[REQUEST SERVICE] getOccupancyData fallback:', e?.message || e);
    }

    // Default standard fallback if no record found for selected date yet
    return {
      roomsOccupied: 45,
      guestCount: 90,
      familyRoomsOccupied: 4,
      occupiedRoomsList: ['105', '109', '205', '209'],
      isFromLiveDb: false
    };
  },

  // Update request status (e.g. DIPROSES, SELESAI, DITOLAK)
  async updateStatus(requestId: string, status: 'MENUNGGU' | 'DIPROSES' | 'SELESAI' | 'DITOLAK'): Promise<void> {
    try {
      await supabase
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
  },

  // Complete request and optionally record outgoing goods
  async completeAndFulfill(request: HKRequest, recordOutgoing: boolean = true): Promise<void> {
    await this.updateStatus(request.id, 'SELESAI');

    if (recordOutgoing && request.items && request.items.length > 0) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const userId = user?.id;

        // Query existing inventory to match item IDs if missing
        const { data: masterItems } = await supabase.from('items').select('id, name, current_stock');

        for (const reqItem of request.items) {
          let matchedItemId = reqItem.item_id;
          let matchedCurrentStock = 0;

          if (!matchedItemId && masterItems) {
            const found = masterItems.find(m => m.name.toLowerCase() === reqItem.item_name.toLowerCase());
            if (found) {
              matchedItemId = found.id;
              matchedCurrentStock = found.current_stock || 0;
            }
          }

          if (matchedItemId) {
            // Insert outgoing transaction
            await supabase.from('transactions').insert([{
              id: crypto.randomUUID ? crypto.randomUUID() : `tx-${Date.now()}-${Math.random()}`,
              item_id: matchedItemId,
              type: 'OUT',
              quantity: reqItem.quantity,
              department: 'Housekeeping',
              notes: `Fulfillment Permintaan HK ${request.request_number || request.id}`,
              user_id: userId,
              created_at: new Date().toISOString()
            }]);

            // Decrement item stock
            const targetStock = Math.max(0, matchedCurrentStock - reqItem.quantity);
            await supabase.from('items').update({ current_stock: targetStock }).eq('id', matchedItemId);
          }
        }
      } catch (err: any) {
        console.warn('[REQUEST SERVICE] Auto outgoing transaction notice:', err?.message || err);
      }
    }
  },

  // Save breakfast occupancy record
  async recordBreakfastOccupancy(record: BreakfastRecord): Promise<void> {
    try {
      await supabase
        .from('breakfast_records')
        .insert([{
          id: crypto.randomUUID ? crypto.randomUUID() : `br-${Date.now()}`,
          date: record.date,
          rooms_occupied: record.rooms_occupied,
          breakfast_pax: record.breakfast_pax,
          notes: record.notes,
          created_at: new Date().toISOString()
        }]);
    } catch (e: any) {
      console.warn('[REQUEST SERVICE] Breakfast record notice:', e?.message || e);
    }

    try {
      const cached = localStorage.getItem(LOCAL_BREAKFAST_KEY);
      const list = cached ? JSON.parse(cached) : [];
      list.unshift(record);
      localStorage.setItem(LOCAL_BREAKFAST_KEY, JSON.stringify(list.slice(0, 30)));
    } catch (e) {
      // ignore
    }
  }
};
