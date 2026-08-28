import { warehouseSupabase } from '../lib/supabaseWarehouse';
import { breakfastSupabase } from '../lib/supabaseBreakfast';
import { HKRequest, HKRequestItem, BreakfastRecord } from '../types';
import { queryCache } from '../lib/queryCache';
import { inventoryService } from './inventoryService';

const LOCAL_STORAGE_KEY = 'gudang_alia_hk_requests';

// Short-term memory cache for occupancy query results (60 seconds TTL)
const CACHE_TTL_MS = 60000;

// Helper function to generate standard RFC4122 v4 UUID
export const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // fallback below
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Helper function to validate UUID format
export const isValidUUID = (str?: string | null): boolean => {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str.trim());
};

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

export interface GetRequestsOptions {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  forceRefresh?: boolean;
}

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

  /**
   * Fetch paginated requests with server-side count and pagination
   * Optimized for Logistik incoming requests view
   */
  async getRequestsPaginated(options: GetRequestsOptions = {}) {
    const {
      page = 1,
      limit = 10,
      status = 'ALL',
      search
    } = options;

    let query = warehouseSupabase
      .from('requests')
      .select(`
        id,
        request_number,
        department,
        requester_name,
        user_id,
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
      `, { count: 'exact' });

    if (status && status !== 'ALL') {
      query = query.eq('status', status);
    }

    if (search && search.trim()) {
      const term = search.trim();
      query = query.or(`request_number.ilike.%${term}%,requester_name.ilike.%${term}%,notes.ilike.%${term}%`);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.warn('[REQUEST SERVICE] Paginated request query fallback notice:', error.message);
      // Fallback: use getRequests and slice
      const all = await this.getRequests();
      let filtered = all;
      if (status !== 'ALL') {
        filtered = filtered.filter(r => r.status === status);
      }
      if (search && search.trim()) {
        const term = search.trim().toLowerCase();
        filtered = filtered.filter(r => 
          (r.request_number && r.request_number.toLowerCase().includes(term)) ||
          (r.requester_name && r.requester_name.toLowerCase().includes(term)) ||
          (r.notes && r.notes.toLowerCase().includes(term))
        );
      }
      const total = filtered.length;
      const paginated = filtered.slice(from, to + 1);
      return {
        data: paginated,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    }

    const formatted: HKRequest[] = (data || []).map((r: any) => {
      const rawItems = r.request_items || [];
      const validItems: HKRequestItem[] = rawItems
        .filter((it: any) => {
          const qty = Number(it.quantity ?? it.quantity_requested ?? 0);
          return Number.isFinite(qty) && qty > 0;
        })
        .map((it: any) => ({
          id: it.id,
          request_id: it.request_id || r.id,
          item_id: it.item_id || undefined,
          item_name: it.item_name || it.name || 'Barang',
          quantity: Number(it.quantity ?? it.quantity_requested ?? 0),
          unit: it.unit || 'pcs',
          notes: it.notes || ''
        }));

      return {
        id: r.id,
        request_number: r.request_number || `REQ-${String(r.id).slice(0, 4).toUpperCase()}`,
        department: r.department || 'Housekeeping',
        requester_name: r.requester_name || 'Housekeeping Staff',
        user_id: r.user_id,
        request_type: (r.notes?.includes('[MANUAL]') ? 'manual' : (r.notes?.includes('[OCCUPANCY]') ? 'occupancy' : undefined)),
        status: (r.status || 'MENUNGGU').toUpperCase(),
        occupancy_count: r.occupancy_count || 0,
        breakfast_pax: r.breakfast_pax || 0,
        notes: r.notes || '',
        created_at: r.created_at || new Date().toISOString(),
        items: validItems
      };
    });

    return {
      data: formatted,
      total: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / limit)
    };
  },

  // Fetch all requests with safe fallback and query cache
  async getRequests(forceRefresh = false): Promise<HKRequest[]> {
    return queryCache.fetchWithCache<HKRequest[]>(
      'requests:all',
      async () => {
        try {
          // Attempt 1: Fetch with nested request_items join
          const { data, error } = await warehouseSupabase
            .from('requests')
            .select(`
              id,
              request_number,
              department,
              requester_name,
              user_id,
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
            console.warn('[REQUEST SERVICE] Supabase join query notice, attempting 2-step fetch:', error.message);
            
            // Attempt 2: 2-step fetch (requests table then request_items table)
            const { data: reqData, error: reqErr } = await warehouseSupabase
              .from('requests')
              .select('id, request_number, department, requester_name, user_id, status, occupancy_count, breakfast_pax, notes, created_at')
              .order('created_at', { ascending: false });

            if (reqErr || !reqData) {
              console.warn('[REQUEST SERVICE] Supabase requests query notice, using local cache:', reqErr?.message);
              return this.getLocalRequests();
            }

            // Fetch request_items for visible request IDs with explicit columns
            const reqIds = reqData.map((r: any) => r.id);
            const itemsByRequestId: { [reqId: string]: any[] } = {};
            if (reqIds.length > 0) {
              try {
                const { data: allItems } = await warehouseSupabase
                  .from('request_items')
                  .select('id, request_id, item_id, item_name, quantity, unit, notes')
                  .in('request_id', reqIds);

                if (allItems) {
                  allItems.forEach((it: any) => {
                    if (!itemsByRequestId[it.request_id]) {
                      itemsByRequestId[it.request_id] = [];
                    }
                    itemsByRequestId[it.request_id].push(it);
                  });
                }
              } catch (itemsFetchErr: any) {
                console.warn('[REQUEST SERVICE] Fetch items separately notice:', itemsFetchErr?.message);
              }
            }

            const formatted: HKRequest[] = reqData.map((r: any) => {
              const rawItems = itemsByRequestId[r.id] || [];
              const validItems: HKRequestItem[] = rawItems
                .filter((it: any) => {
                  const qty = Number(it.quantity ?? it.quantity_requested ?? 0);
                  return Number.isFinite(qty) && qty > 0;
                })
                .map((it: any) => ({
                  id: it.id,
                  request_id: it.request_id || r.id,
                  item_id: it.item_id || undefined,
                  item_name: it.item_name || it.name || 'Barang',
                  quantity: Number(it.quantity ?? it.quantity_requested ?? 0),
                  unit: it.unit || 'pcs',
                  notes: it.notes || ''
                }));

              return {
                id: r.id,
                request_number: r.request_number || r.req_number || `REQ-${String(r.id).slice(0, 4).toUpperCase()}`,
                department: r.department || 'Housekeeping',
                requester_name: r.requester_name || r.requested_by || 'Housekeeping Staff',
                user_id: r.user_id,
                request_type: r.request_type || (r.notes?.includes('[MANUAL]') ? 'manual' : (r.notes?.includes('[OCCUPANCY]') ? 'occupancy' : undefined)),
                status: (r.status || 'MENUNGGU').toUpperCase(),
                occupancy_count: r.occupancy_count || r.rooms_occupied || 0,
                breakfast_pax: r.breakfast_pax || 0,
                notes: r.notes || '',
                created_at: r.created_at || new Date().toISOString(),
                items: validItems
              };
            }).filter((r: HKRequest) => r.items && r.items.length > 0);

            if (formatted.length > 0) {
              localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(formatted));
              return formatted;
            }
            return this.getLocalRequests();
          }

          if (data && data.length > 0) {
            // Check if any requests returned without items (sometimes nested join needs separate query)
            const missingItemReqIds = data.filter((r: any) => !r.request_items || r.request_items.length === 0).map((r: any) => r.id);
            const extraItemsByReqId: { [reqId: string]: any[] } = {};
            if (missingItemReqIds.length > 0) {
              try {
                const { data: extraItems } = await warehouseSupabase
                  .from('request_items')
                  .select('id, request_id, item_id, item_name, quantity, unit, notes')
                  .in('request_id', missingItemReqIds);
                if (extraItems) {
                  extraItems.forEach((it: any) => {
                    if (!extraItemsByReqId[it.request_id]) {
                      extraItemsByReqId[it.request_id] = [];
                    }
                    extraItemsByReqId[it.request_id].push(it);
                  });
                }
              } catch (e) {
                // ignore
              }
            }

            // Map database response to standardized HKRequest and strictly filter quantity > 0
            const formatted: HKRequest[] = data
              .map((r: any) => {
                const rawItems = (r.request_items && r.request_items.length > 0)
                  ? r.request_items
                  : (extraItemsByReqId[r.id] || []);

                const validItems: HKRequestItem[] = rawItems
                  .filter((it: any) => {
                    const qty = Number(it.quantity ?? it.quantity_requested ?? 0);
                    return Number.isFinite(qty) && qty > 0;
                  })
                  .map((it: any) => ({
                    id: it.id,
                    request_id: it.request_id || r.id,
                    item_id: it.item_id || undefined,
                    item_name: it.item_name || it.name || 'Barang',
                    quantity: Number(it.quantity ?? it.quantity_requested ?? 0),
                    unit: it.unit || 'pcs',
                    notes: it.notes || ''
                  }));

                return {
                  id: r.id,
                  request_number: r.request_number || r.req_number || `REQ-${String(r.id).slice(0, 4).toUpperCase()}`,
                  department: r.department || 'Housekeeping',
                  requester_name: r.requester_name || r.requested_by || 'Housekeeping Staff',
                  user_id: r.user_id,
                  request_type: r.request_type || (r.notes?.includes('[MANUAL]') ? 'manual' : (r.notes?.includes('[OCCUPANCY]') ? 'occupancy' : undefined)),
                  status: (r.status || 'MENUNGGU').toUpperCase(),
                  occupancy_count: r.occupancy_count || r.rooms_occupied || 0,
                  breakfast_pax: r.breakfast_pax || 0,
                  notes: r.notes || '',
                  created_at: r.created_at || new Date().toISOString(),
                  items: validItems
                };
              })
              // Exclude requests that have 0 valid items
              .filter((r: HKRequest) => r.items && r.items.length > 0);

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
      15000,
      forceRefresh
    );
  },

  getLocalRequests(): HKRequest[] {
    try {
      const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        // Filter out dummy/mock requests and ensure all items have quantity > 0
        const cleaned: HKRequest[] = Array.isArray(parsed)
          ? parsed
              .filter((r: HKRequest) => !r.id.startsWith('req-hk-00'))
              .map((r: HKRequest) => ({
                ...r,
                items: (r.items || []).filter((it: HKRequestItem) => {
                  const qty = Number(it.quantity);
                  return Number.isFinite(qty) && qty > 0;
                })
              }))
              .filter((r: HKRequest) => r.items && r.items.length > 0)
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
      item_id?: string;
      item_name: string;
      quantity: number;
      unit: string;
      notes?: string;
    }>;
  }): Promise<HKRequest> {
    // 1. Strict Server/Service Validation: Filter items with quantity > 0
    const validItems = (req.items || []).filter(it => {
      const qty = Number(it.quantity);
      return Number.isFinite(qty) && qty > 0;
    });

    if (validItems.length === 0) {
      throw new Error('Silakan masukkan jumlah minimal 1 barang yang ingin diminta.');
    }

    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randSuffix = Math.floor(100 + Math.random() * 900);
    const reqNumber = `REQ-HK-${todayStr}-${randSuffix}`;

    const newRequestId = generateUUID();

    let userId: string | null = null;
    try {
      const { data: { user } } = await warehouseSupabase.auth.getUser();
      if (user?.id && isValidUUID(user.id)) {
        userId = user.id;
      }
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
      requester_name: req.requester_name || 'Housekeeping Staff',
      user_id: userId || undefined,
      request_type: reqType,
      status: 'MENUNGGU',
      occupancy_count: req.occupancy_count || 0,
      breakfast_pax: req.breakfast_pax || 0,
      notes: finalNotes,
      created_at: new Date().toISOString(),
      items: validItems.map(it => ({
        id: generateUUID(),
        request_id: newRequestId,
        item_id: (it.item_id && isValidUUID(it.item_id)) ? it.item_id : undefined,
        item_name: it.item_name,
        quantity: Number(it.quantity),
        unit: it.unit || 'pcs',
        notes: it.notes || ''
      }))
    };

    try {
      const insertPayload: any = {
        id: newRequest.id,
        request_number: newRequest.request_number,
        department: newRequest.department,
        requester_name: newRequest.requester_name,
        user_id: userId,
        status: newRequest.status,
        occupancy_count: newRequest.occupancy_count,
        breakfast_pax: newRequest.breakfast_pax,
        notes: newRequest.notes,
        created_at: newRequest.created_at
      };

      // Try inserting header (First attempt: full payload with user_id)
      let { error: headerErr } = await warehouseSupabase
        .from('requests')
        .insert([insertPayload]);

      if (headerErr) {
        console.warn('[REQUEST SERVICE] Full header insert notice, retrying with user_id=null:', headerErr.message);
        // Attempt 2: retry with user_id = null (handles case where user_id is not in auth.users)
        const payloadNoUser = {
          ...insertPayload,
          user_id: null
        };
        const { error: noUserErr } = await warehouseSupabase
          .from('requests')
          .insert([payloadNoUser]);

        if (noUserErr) {
          console.warn('[REQUEST SERVICE] Header insert without user_id notice, retrying minimal payload:', noUserErr.message);
          // Attempt 3: minimal standard payload
          const minimalPayload = {
            id: newRequest.id,
            request_number: newRequest.request_number,
            department: newRequest.department,
            requester_name: newRequest.requester_name,
            status: newRequest.status,
            notes: newRequest.notes,
            created_at: newRequest.created_at
          };
          const { error: minHeaderErr } = await warehouseSupabase
            .from('requests')
            .insert([minimalPayload]);
          if (minHeaderErr) {
            console.error('[REQUEST SERVICE ERROR] Minimal header insert also failed:', minHeaderErr.message);
          }
        }
      }

      // Insert items with valid UUID (ONLY VALID ITEMS > 0)
      if (newRequest.items && newRequest.items.length > 0) {
        const itemsToInsert = newRequest.items.map(it => ({
          id: it.id,
          request_id: newRequest.id,
          item_id: (it.item_id && isValidUUID(it.item_id)) ? it.item_id : null,
          item_name: it.item_name,
          quantity: it.quantity,
          unit: it.unit || 'pcs',
          notes: it.notes || ''
        }));

        let { error: itemsErr } = await warehouseSupabase
          .from('request_items')
          .insert(itemsToInsert);

        if (itemsErr) {
          console.warn('[REQUEST SERVICE] Items insert notice, retrying without item_id foreign key:', itemsErr.message);
          const fallbackItems = itemsToInsert.map(it => ({
            id: it.id,
            request_id: it.request_id,
            item_id: null,
            item_name: it.item_name,
            quantity: it.quantity,
            unit: it.unit,
            notes: it.notes
          }));
          const { error: retryErr } = await warehouseSupabase
            .from('request_items')
            .insert(fallbackItems);
          if (retryErr) {
            console.error('[REQUEST SERVICE] Items fallback insert failed:', retryErr.message);
          }
        }
      }
    } catch (err: any) {
      console.warn('[REQUEST SERVICE] Create request catch notice:', err?.message || err);
    }

    // Cache locally
    const existing = this.getLocalRequests();
    const updated = [newRequest, ...existing.filter(r => r.id !== newRequest.id)];
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));

    queryCache.invalidate('requests');
    queryCache.invalidate('requests:all');
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
    const itemsToProcess = (fulfilledItems && fulfilledItems.length > 0) ? fulfilledItems : (request.items || []);

    if (!recordOutgoing || itemsToProcess.length === 0) {
      await this.updateStatus(request.id, 'SELESAI');
      return;
    }

    let userId: string | undefined = undefined;
    try {
      const { data: { user } } = await warehouseSupabase.auth.getUser();
      userId = user?.id;
    } catch (e) {
      // ignore
    }

    const masterItems = await inventoryService.getCachedItems();

    // 1. Try atomic PostgreSQL RPC execution first (1 Single Network Request)
    try {
      const itemsPayload = itemsToProcess.map(it => {
        let matchedId = it.item_id || null;
        if (!matchedId && masterItems) {
          const found = masterItems.find(m => m.name.toLowerCase() === it.item_name.toLowerCase());
          if (found) matchedId = found.id;
        }
        return {
          item_id: matchedId,
          item_name: it.item_name,
          quantity: Number(it.quantity || 0),
          unit: it.unit || 'pcs',
          notes: it.notes || ''
        };
      });

      const { data: rpcRes, error: rpcErr } = await warehouseSupabase.rpc('complete_hk_request', {
        p_request_id: request.id,
        p_items_json: itemsPayload,
        p_user_id: userId || null
      });

      if (!rpcErr && rpcRes?.success) {
        // Update local memory state
        const list = this.getLocalRequests();
        const index = list.findIndex(r => r.id === request.id);
        if (index !== -1) {
          list[index].status = 'SELESAI';
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
        }
        inventoryService.invalidateCache();
        queryCache.invalidate('requests');
        queryCache.invalidate('requests:all');
        queryCache.invalidate('items');
        queryCache.invalidate('dashboard');
        return;
      }
    } catch (rpcCatchErr) {
      console.warn('[REQUEST SERVICE] RPC complete_hk_request notice, using resilient fallback:', rpcCatchErr);
    }

    // 2. Resilient Client Fallback if RPC is not yet executed in database
    await this.updateStatus(request.id, 'SELESAI');

    try {
      for (const reqItem of itemsToProcess) {
        const qtyToDeduct = Number(reqItem.quantity || 0);
        if (qtyToDeduct <= 0) continue;

        let matchedItemId = reqItem.item_id;
        let matchedItem = masterItems ? masterItems.find(m => m.id === matchedItemId) : null;
        
        if (!matchedItem && masterItems) {
          matchedItem = masterItems.find(m => m.name.toLowerCase() === reqItem.item_name.toLowerCase()) || null;
          if (matchedItem) {
            matchedItemId = matchedItem.id;
          }
        }

        const matchedCurrentStock = matchedItem ? (matchedItem.current_stock || 0) : 0;

        if (matchedItemId) {
          // Determine department tag (e.g. if item belongs to Resto or request/item notes mention Resto)
          const isResto = (matchedItem?.department && /resto|kitchen|dapur|f&b|food|beverage/i.test(matchedItem.department)) ||
            (reqItem.notes && /resto/i.test(reqItem.notes)) ||
            (request.notes && /resto/i.test(request.notes));

          const deptTag = isResto ? 'Resto' : (request.department || 'Housekeeping');
          const noteDetail = `Fulfillment Permintaan HK ${request.request_number || request.id} (${reqItem.item_name})${reqItem.notes ? ` - ${reqItem.notes}` : ''}`;

          await warehouseSupabase.from('transactions').insert([{
            id: crypto.randomUUID ? crypto.randomUUID() : `tx-${Date.now()}-${Math.random()}`,
            item_id: matchedItemId,
            type: 'OUT',
            quantity: qtyToDeduct,
            department: deptTag,
            notes: noteDetail,
            user_id: userId,
            created_at: new Date().toISOString()
          }]);

          // Fetch fresh item from DB to calculate new stock accurately
          const { data: freshDbItem } = await warehouseSupabase
            .from('items')
            .select('id, initial_stock, current_stock')
            .eq('id', matchedItemId)
            .single();

          const currentDbStock = freshDbItem ? (freshDbItem.current_stock ?? 0) : matchedCurrentStock;
          const targetStock = Math.max(0, currentDbStock - qtyToDeduct);
          await warehouseSupabase.from('items').update({ current_stock: targetStock }).eq('id', matchedItemId);
        }
      }
      inventoryService.invalidateCache();
      queryCache.invalidate('requests');
      queryCache.invalidate('requests:all');
      queryCache.invalidate('items');
      queryCache.invalidate('dashboard');
    } catch (err: any) {
      console.warn('[REQUEST SERVICE] Auto outgoing transaction fallback notice:', err?.message || err);
    }
  }
};
