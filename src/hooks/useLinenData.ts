import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { ITEM_TYPES } from '../constants-linen';
import { laundrySyncService } from '../services/laundrySyncService';
import { 
  LinenState, 
  RoomItem, 
  CleanItem, 
  NewItem, 
  NewItemTransaction, 
  IncomingItem, 
  OutgoingItem, 
  ItemType 
} from '../types-linen';

const STORAGE_KEY = 'gudang_alia_linen_state_cache_v1';
const PAGE_SIZE = 1000;

async function fetchAllSupabaseRowsPaginated(
  primaryTable: string,
  fallbackTable: string,
  orderColumn: string = 'date',
  ascending: boolean = false
): Promise<{ data: any[]; activeTable: string }> {
  let activeTable = primaryTable;
  const allRows: any[] = [];
  let page = 0;
  let hasMore = true;

  // Test if primary table exists
  const { error: testErr } = await supabase.from(primaryTable).select('id').limit(1);
  if (testErr && (testErr.message.includes('relation') || testErr.code === '42P01')) {
    activeTable = fallbackTable;
  }

  while (hasMore) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from(activeTable)
      .select('*')
      .range(from, to);

    if (orderColumn) {
      query = query.order(orderColumn, { ascending });
      // Add secondary order for stability when dates are identical
      if (orderColumn !== 'created_at') {
        query = query.order('created_at', { ascending });
      }
    }

    const { data, error } = await query;

    if (error) {
      if (activeTable === primaryTable && fallbackTable) {
        console.warn(`[LINEN PAGINATED] Primary table ${primaryTable} failed (${error.message}), trying fallback ${fallbackTable}`);
        return fetchAllSupabaseRowsPaginated(fallbackTable, '', orderColumn, ascending);
      }
      console.error(`[LINEN PAGINATED] Error fetching ${activeTable} page ${page}:`, error);
      throw error;
    }

    if (data && data.length > 0) {
      allRows.push(...data);
      if (data.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        page += 1;
      }
    } else {
      hasMore = false;
    }
  }

  return { data: allRows, activeTable };
}

async function executeLinenWrite(
  primaryTable: string,
  fallbackTable: string,
  operation: (tableName: string) => PromiseLike<any> | any
) {
  try {
    const res = await operation(primaryTable);
    if (res?.error && (res.error.message?.includes('relation') || res.error.code === '42P01' || res.error.code === '42501')) {
      console.warn(`[LINEN WRITE] Fallback from ${primaryTable} to ${fallbackTable}`);
      await operation(fallbackTable);
    }
  } catch (e) {
    console.warn(`[LINEN WRITE EXCEPTION]:`, e);
  }
}

const getInitialState = (): LinenState => {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {
    console.warn('[LINEN HOOK] Failed to parse cached linen state:', e);
  }

  return {
    roomItems: [],
    cleanItems: ITEM_TYPES.map(type => ({ itemName: type, quantity: 0 })),
    newItems: ITEM_TYPES.map(type => ({ itemName: type, quantity: 0 })),
    newItemTransactions: [],
    incomingItems: [],
    outgoingItems: []
  };
};

export function useLinenData() {
  const [state, setState] = useState<LinenState>(getInitialState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const saveToLocal = (newState: LinenState) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
    } catch (e) {
      console.warn('[LINEN HOOK] Failed to cache state:', e);
    }
  };

  const fetchAllData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [
        roomData,
        cleanData,
        newData,
        newTxData,
        inData,
        outData
      ] = await Promise.allSettled([
        fetchAllSupabaseRowsPaginated('linen_room_items', 'room_items', 'date', false),
        fetchAllSupabaseRowsPaginated('linen_clean_items', 'clean_items', '', false),
        fetchAllSupabaseRowsPaginated('linen_new_items', 'new_items', '', false),
        fetchAllSupabaseRowsPaginated('linen_new_item_transactions', 'new_item_transactions', 'date', false),
        fetchAllSupabaseRowsPaginated('linen_incoming_items', 'incoming_items', 'date', false),
        fetchAllSupabaseRowsPaginated('linen_outgoing_items', 'outgoing_items', 'date', false)
      ]);

      const mapRoomItems = (data: any[]): RoomItem[] => {
        return (data || []).map(r => ({
          id: String(r.id),
          date: r.date,
          itemName: r.itemName || r.item_name,
          quantity: Number(r.quantity || 0),
          roomNumber: r.roomNumber || r.room_number || '',
          created_at: r.created_at
        }));
      };

      const mapCleanItems = (data: any[]): CleanItem[] => {
        const map = new Map<string, CleanItem>();
        ITEM_TYPES.forEach(t => map.set(t, { itemName: t, quantity: 0 }));
        (data || []).forEach(c => {
          const name = c.itemName || c.item_name;
          if (name) {
            map.set(name, { id: c.id, itemName: name, quantity: Number(c.quantity || 0), updated_at: c.updated_at });
          }
        });
        return Array.from(map.values());
      };

      const mapNewItems = (data: any[]): NewItem[] => {
        const map = new Map<string, NewItem>();
        ITEM_TYPES.forEach(t => map.set(t, { itemName: t, quantity: 0 }));
        (data || []).forEach(n => {
          const name = n.itemName || n.item_name;
          if (name) {
            map.set(name, { id: n.id, itemName: name, quantity: Number(n.quantity || 0), updated_at: n.updated_at });
          }
        });
        return Array.from(map.values());
      };

      const mapNewTransactions = (data: any[]): NewItemTransaction[] => {
        return (data || []).map(t => ({
          id: String(t.id),
          date: t.date,
          itemName: t.itemName || t.item_name,
          quantity: Number(t.quantity || 0),
          type: t.type,
          description: t.description || '',
          created_at: t.created_at
        }));
      };

      const mapIncomingItems = (data: any[]): IncomingItem[] => {
        return (data || []).map(i => ({
          id: String(i.id),
          date: i.date,
          itemName: i.itemName || i.item_name,
          quantity: Number(i.quantity || 0),
          source: i.source || 'Laundry',
          description: i.description || '',
          created_at: i.created_at
        }));
      };

      const mapOutgoingItems = (data: any[]): OutgoingItem[] => {
        return (data || []).map(o => ({
          id: String(o.id),
          date: o.date,
          itemName: o.itemName || o.item_name,
          quantity: Number(o.quantity || 0),
          destination: o.destination || 'Laundry',
          description: o.description || '',
          created_at: o.created_at
        }));
      };

      setState(prev => {
        const roomItems = roomData.status === 'fulfilled' ? mapRoomItems(roomData.value.data) : prev.roomItems;
        const cleanItems = cleanData.status === 'fulfilled' ? mapCleanItems(cleanData.value.data) : prev.cleanItems;
        const newItems = newData.status === 'fulfilled' ? mapNewItems(newData.value.data) : prev.newItems;
        const newItemTransactions = newTxData.status === 'fulfilled' ? mapNewTransactions(newTxData.value.data) : prev.newItemTransactions;
        const incomingItems = inData.status === 'fulfilled' ? mapIncomingItems(inData.value.data) : prev.incomingItems;
        const outgoingItems = outData.status === 'fulfilled' ? mapOutgoingItems(outData.value.data) : prev.outgoingItems;

        const nextState = {
          roomItems,
          cleanItems,
          newItems,
          newItemTransactions,
          incomingItems,
          outgoingItems
        };
        saveToLocal(nextState);
        return nextState;
      });
    } catch (err: any) {
      console.error('[LINEN HOOK] Error fetching linen data:', err);
      setError(err?.message || 'Gagal memuat data linen');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // CRUD for Room Items
  const addRoomItem = async (data: Omit<RoomItem, 'id'>) => {
    const newId = crypto.randomUUID();
    const newItem: RoomItem = { ...data, id: newId, created_at: new Date().toISOString() };
    let updatedCleanQty = 0;

    setState(prev => {
      const cleanItem = prev.cleanItems.find(ci => ci.itemName === data.itemName);
      updatedCleanQty = Math.max(0, (cleanItem?.quantity || 0) - Number(data.quantity || 0));
      const next = {
        ...prev,
        roomItems: [newItem, ...prev.roomItems],
        cleanItems: prev.cleanItems.map(ci =>
          ci.itemName === data.itemName ? { ...ci, quantity: updatedCleanQty } : ci
        )
      };
      saveToLocal(next);
      return next;
    });

    const { data: { user } } = await supabase.auth.getUser();
    
    try {
      await executeLinenWrite('linen_room_items', 'room_items', t =>
        supabase.from(t).insert([{
          id: newId,
          firebase_id: 'local-dev',
          uid: user?.id,
          date: data.date,
          item_name: data.itemName,
          quantity: data.quantity,
          room_number: data.roomNumber
        }])
      );
      await executeLinenWrite('linen_clean_items', 'clean_items', t =>
        supabase.from(t).upsert([{
          item_name: data.itemName,
          firebase_id: 'local-dev',
          uid: user?.id,
          quantity: updatedCleanQty,
          updated_at: new Date().toISOString()
        }], { onConflict: 'item_name' })
      );
    } catch (e) {
      console.warn('[LINEN HOOK] Supabase insert room_items fallback:', e);
    }
  };

  const updateRoomItem = async (id: string, data: Partial<RoomItem>) => {
    let updatedCleanQty: number | null = null;
    let targetItemName = '';

    setState(prev => {
      const old = prev.roomItems.find(item => item.id === id);
      const nextRoomItems = prev.roomItems.map(item => item.id === id ? { ...item, ...data } : item);
      let nextCleanItems = prev.cleanItems;

      if (old && data.quantity !== undefined) {
        targetItemName = old.itemName;
        const diff = Number(data.quantity) - Number(old.quantity);
        nextCleanItems = prev.cleanItems.map(ci => {
          if (ci.itemName === old.itemName) {
            const q = Math.max(0, (ci.quantity || 0) - diff);
            updatedCleanQty = q;
            return { ...ci, quantity: q };
          }
          return ci;
        });
      }

      const next = { ...prev, roomItems: nextRoomItems, cleanItems: nextCleanItems };
      saveToLocal(next);
      return next;
    });

    const { data: { user } } = await supabase.auth.getUser();

    try {
      const payload: any = {};
      if (data.date !== undefined) payload.date = data.date;
      if (data.itemName !== undefined) payload.item_name = data.itemName;
      if (data.quantity !== undefined) payload.quantity = data.quantity;
      if (data.roomNumber !== undefined) payload.room_number = data.roomNumber;

      await executeLinenWrite('linen_room_items', 'room_items', t =>
        supabase.from(t).update(payload).eq('id', id)
      );

      if (updatedCleanQty !== null && targetItemName) {
        await executeLinenWrite('linen_clean_items', 'clean_items', t =>
          supabase.from(t).upsert([{
            item_name: targetItemName,
            firebase_id: 'local-dev',
            uid: user?.id,
            quantity: updatedCleanQty,
            updated_at: new Date().toISOString()
          }], { onConflict: 'item_name' })
        );
      }
    } catch (e) {
      console.warn('[LINEN HOOK] Supabase update room_items fallback:', e);
    }
  };

  const deleteRoomItem = async (id: string) => {
    let oldItem: RoomItem | undefined;
    let restoredCleanQty: number | null = null;

    setState(prev => {
      oldItem = prev.roomItems.find(item => item.id === id);
      let nextCleanItems = prev.cleanItems;

      if (oldItem) {
        nextCleanItems = prev.cleanItems.map(ci => {
          if (ci.itemName === oldItem!.itemName) {
            const q = (ci.quantity || 0) + Number(oldItem!.quantity || 0);
            restoredCleanQty = q;
            return { ...ci, quantity: q };
          }
          return ci;
        });
      }

      const next = {
        ...prev,
        roomItems: prev.roomItems.filter(item => item.id !== id),
        cleanItems: nextCleanItems
      };
      saveToLocal(next);
      return next;
    });

    const { data: { user } } = await supabase.auth.getUser();

    try {
      await executeLinenWrite('linen_room_items', 'room_items', t =>
        supabase.from(t).delete().eq('id', id)
      );

      if (oldItem && restoredCleanQty !== null) {
        await executeLinenWrite('linen_clean_items', 'clean_items', t =>
          supabase.from(t).upsert([{
            item_name: oldItem!.itemName,
            firebase_id: 'local-dev',
            uid: user?.id,
            quantity: restoredCleanQty,
            updated_at: new Date().toISOString()
          }], { onConflict: 'item_name' })
        );
      }
    } catch (e) {
      console.warn('[LINEN HOOK] Supabase delete room_items fallback:', e);
    }
  };

  // Clean items update
  const updateCleanItem = async (itemName: ItemType, quantity: number, options?: { skipSync?: boolean }) => {
    let diff = 0;
    setState(prev => {
      const oldItem = prev.cleanItems.find(item => item.itemName === itemName);
      const oldQty = oldItem ? Number(oldItem.quantity || 0) : 0;
      diff = quantity - oldQty;

      const next = {
        ...prev,
        cleanItems: prev.cleanItems.map(item => item.itemName === itemName ? { ...item, quantity } : item)
      };
      saveToLocal(next);
      return next;
    });

    const { data: { user } } = await supabase.auth.getUser();
    
    try {
      await executeLinenWrite('linen_clean_items', 'clean_items', t =>
        supabase.from(t).upsert([{
          item_name: itemName,
          firebase_id: 'local-dev',
          uid: user?.id,
          quantity,
          updated_at: new Date().toISOString()
        }], { onConflict: 'item_name' })
      );
    } catch (e) {
      console.warn('[LINEN HOOK] Supabase update clean_items fallback:', e);
    }

    // SYNC ARAH 2: Linen → Gudang Alia
    if (!options?.skipSync && diff !== 0) {
      try {
        const syncType = diff > 0 ? 'IN' : 'OUT';
        await laundrySyncService.syncTransactionToGudangAlia(
          itemName,
          syncType,
          Math.abs(diff),
          { skipSync: false, notes: 'Koreksi Stok Bersih Linen' }
        );
      } catch (err) {
        console.warn('[LINEN HOOK] Sync to Gudang Alia error:', err);
      }
    }
  };

  // CRUD for Incoming Items
  const addIncomingItem = async (data: Omit<IncomingItem, 'id'>, options?: { skipSync?: boolean }) => {
    const newId = crypto.randomUUID();
    const newItem: IncomingItem = { ...data, id: newId, created_at: new Date().toISOString() };
    let newCleanQty = 0;

    setState(prev => {
      const existingClean = prev.cleanItems.find(ci => ci.itemName === data.itemName);
      newCleanQty = (existingClean?.quantity || 0) + Number(data.quantity || 0);
      const next = {
        ...prev,
        incomingItems: [newItem, ...prev.incomingItems],
        cleanItems: prev.cleanItems.map(ci => 
          ci.itemName === data.itemName ? { ...ci, quantity: newCleanQty } : ci
        )
      };
      saveToLocal(next);
      return next;
    });

    const { data: { user } } = await supabase.auth.getUser();
    
    try {
      await executeLinenWrite('linen_incoming_items', 'incoming_items', t =>
        supabase.from(t).insert([{
          id: newId,
          firebase_id: 'local-dev',
          uid: user?.id,
          date: data.date,
          item_name: data.itemName,
          quantity: data.quantity,
          source: data.source,
          description: data.description || ''
        }])
      );
      await executeLinenWrite('linen_clean_items', 'clean_items', t =>
        supabase.from(t).upsert([{
          item_name: data.itemName,
          firebase_id: 'local-dev',
          uid: user?.id,
          quantity: newCleanQty,
          updated_at: new Date().toISOString()
        }], { onConflict: 'item_name' })
      );
    } catch (e) {
      console.warn('[LINEN HOOK] Supabase insert incoming_items fallback:', e);
    }

    // SYNC ARAH 2: Linen → Gudang Alia
    if (!options?.skipSync && data.itemName && Number(data.quantity) > 0) {
      try {
        await laundrySyncService.syncTransactionToGudangAlia(
          data.itemName,
          'IN',
          Number(data.quantity),
          { skipSync: false, notes: `Linen Masuk (${data.source || 'Laundry'})` }
        );
      } catch (err) {
        console.warn('[LINEN HOOK] Sync to Gudang Alia error on addIncomingItem:', err);
      }
    }
  };

  const updateIncomingItem = async (id: string, data: Partial<IncomingItem>) => {
    let newCleanQty: number | null = null;
    let targetItemName = '';

    setState(prev => {
      const old = prev.incomingItems.find(i => i.id === id);
      let nextCleanItems = prev.cleanItems;

      if (old && data.quantity !== undefined && old.itemName === (data.itemName || old.itemName)) {
        targetItemName = old.itemName;
        const diff = Number(data.quantity) - Number(old.quantity);
        nextCleanItems = prev.cleanItems.map(ci => {
          if (ci.itemName === old.itemName) {
            const q = Math.max(0, (ci.quantity || 0) + diff);
            newCleanQty = q;
            return { ...ci, quantity: q };
          }
          return ci;
        });
      }

      const next = {
        ...prev,
        incomingItems: prev.incomingItems.map(item => item.id === id ? { ...item, ...data } : item),
        cleanItems: nextCleanItems
      };
      saveToLocal(next);
      return next;
    });

    const { data: { user } } = await supabase.auth.getUser();

    try {
      const payload: any = {};
      if (data.date !== undefined) payload.date = data.date;
      if (data.itemName !== undefined) payload.item_name = data.itemName;
      if (data.quantity !== undefined) payload.quantity = data.quantity;
      if (data.source !== undefined) payload.source = data.source;
      if (data.description !== undefined) payload.description = data.description;

      await executeLinenWrite('linen_incoming_items', 'incoming_items', t =>
        supabase.from(t).update(payload).eq('id', id)
      );

      if (newCleanQty !== null && targetItemName) {
        await executeLinenWrite('linen_clean_items', 'clean_items', t =>
          supabase.from(t).upsert([{
            item_name: targetItemName,
            firebase_id: 'local-dev',
            uid: user?.id,
            quantity: newCleanQty,
            updated_at: new Date().toISOString()
          }], { onConflict: 'item_name' })
        );
      }
    } catch (e) {
      console.warn('[LINEN HOOK] Supabase update incoming_items fallback:', e);
    }
  };

  const deleteIncomingItem = async (id: string, options?: { skipSync?: boolean }) => {
    let oldItem: IncomingItem | undefined;
    let newCleanQty: number | null = null;

    setState(prev => {
      oldItem = prev.incomingItems.find(i => i.id === id);
      let nextCleanItems = prev.cleanItems;

      if (oldItem) {
        nextCleanItems = prev.cleanItems.map(ci => {
          if (ci.itemName === oldItem!.itemName) {
            const q = Math.max(0, (ci.quantity || 0) - Number(oldItem!.quantity || 0));
            newCleanQty = q;
            return { ...ci, quantity: q };
          }
          return ci;
        });
      }

      const next = {
        ...prev,
        incomingItems: prev.incomingItems.filter(item => item.id !== id),
        cleanItems: nextCleanItems
      };
      saveToLocal(next);
      return next;
    });

    const { data: { user } } = await supabase.auth.getUser();

    try {
      await executeLinenWrite('linen_incoming_items', 'incoming_items', t =>
        supabase.from(t).delete().eq('id', id)
      );

      if (oldItem && newCleanQty !== null) {
        await executeLinenWrite('linen_clean_items', 'clean_items', t =>
          supabase.from(t).upsert([{
            item_name: oldItem!.itemName,
            firebase_id: 'local-dev',
            uid: user?.id,
            quantity: newCleanQty,
            updated_at: new Date().toISOString()
          }], { onConflict: 'item_name' })
        );
      }
    } catch (e) {
      console.warn('[LINEN HOOK] Supabase delete incoming_items fallback:', e);
    }

    // SYNC ARAH 2: Linen → Gudang Alia (Deleting incoming decreases stock in Gudang Alia)
    if (!options?.skipSync && oldItem && Number(oldItem.quantity) > 0) {
      try {
        await laundrySyncService.syncTransactionToGudangAlia(
          oldItem.itemName,
          'OUT',
          Number(oldItem.quantity),
          { skipSync: false, notes: 'Hapus Catatan Linen Masuk' }
        );
      } catch (err) {
        console.warn('[LINEN HOOK] Sync to Gudang Alia error on deleteIncomingItem:', err);
      }
    }
  };

  // CRUD for Outgoing Items
  const addOutgoingItem = async (data: Omit<OutgoingItem, 'id'>, options?: { skipSync?: boolean }) => {
    const newId = crypto.randomUUID();
    const newItem: OutgoingItem = { ...data, id: newId, created_at: new Date().toISOString() };
    let newCleanQty = 0;

    setState(prev => {
      const existingClean = prev.cleanItems.find(ci => ci.itemName === data.itemName);
      newCleanQty = Math.max(0, (existingClean?.quantity || 0) - Number(data.quantity || 0));
      const next = {
        ...prev,
        outgoingItems: [newItem, ...prev.outgoingItems],
        cleanItems: prev.cleanItems.map(ci =>
          ci.itemName === data.itemName ? { ...ci, quantity: newCleanQty } : ci
        )
      };
      saveToLocal(next);
      return next;
    });

    const { data: { user } } = await supabase.auth.getUser();
    
    try {
      await executeLinenWrite('linen_outgoing_items', 'outgoing_items', t =>
        supabase.from(t).insert([{
          id: newId,
          firebase_id: 'local-dev',
          uid: user?.id,
          date: data.date,
          item_name: data.itemName,
          quantity: data.quantity,
          destination: data.destination,
          description: data.description || ''
        }])
      );
      await executeLinenWrite('linen_clean_items', 'clean_items', t =>
        supabase.from(t).upsert([{
          item_name: data.itemName,
          firebase_id: 'local-dev',
          uid: user?.id,
          quantity: newCleanQty,
          updated_at: new Date().toISOString()
        }], { onConflict: 'item_name' })
      );
    } catch (e) {
      console.warn('[LINEN HOOK] Supabase insert outgoing_items fallback:', e);
    }

    // SYNC ARAH 2: Linen → Gudang Alia (Outgoing decreases stock in Gudang Alia)
    if (!options?.skipSync && data.itemName && Number(data.quantity) > 0) {
      try {
        await laundrySyncService.syncTransactionToGudangAlia(
          data.itemName,
          'OUT',
          Number(data.quantity),
          { skipSync: false, notes: `Linen Keluar (${data.destination || 'Laundry'})` }
        );
      } catch (err) {
        console.warn('[LINEN HOOK] Sync to Gudang Alia error on addOutgoingItem:', err);
      }
    }
  };

  const updateOutgoingItem = async (id: string, data: Partial<OutgoingItem>) => {
    let newCleanQty: number | null = null;
    let targetItemName = '';

    setState(prev => {
      const old = prev.outgoingItems.find(o => o.id === id);
      let nextCleanItems = prev.cleanItems;

      if (old && data.quantity !== undefined && old.itemName === (data.itemName || old.itemName)) {
        targetItemName = old.itemName;
        const diff = Number(data.quantity) - Number(old.quantity);
        nextCleanItems = prev.cleanItems.map(ci => {
          if (ci.itemName === old.itemName) {
            const q = Math.max(0, (ci.quantity || 0) - diff);
            newCleanQty = q;
            return { ...ci, quantity: q };
          }
          return ci;
        });
      }

      const next = {
        ...prev,
        outgoingItems: prev.outgoingItems.map(item => item.id === id ? { ...item, ...data } : item),
        cleanItems: nextCleanItems
      };
      saveToLocal(next);
      return next;
    });

    const { data: { user } } = await supabase.auth.getUser();

    try {
      const payload: any = {};
      if (data.date !== undefined) payload.date = data.date;
      if (data.itemName !== undefined) payload.item_name = data.itemName;
      if (data.quantity !== undefined) payload.quantity = data.quantity;
      if (data.destination !== undefined) payload.destination = data.destination;
      if (data.description !== undefined) payload.description = data.description;

      await executeLinenWrite('linen_outgoing_items', 'outgoing_items', t =>
        supabase.from(t).update(payload).eq('id', id)
      );

      if (newCleanQty !== null && targetItemName) {
        await executeLinenWrite('linen_clean_items', 'clean_items', t =>
          supabase.from(t).upsert([{
            item_name: targetItemName,
            firebase_id: 'local-dev',
            uid: user?.id,
            quantity: newCleanQty,
            updated_at: new Date().toISOString()
          }], { onConflict: 'item_name' })
        );
      }
    } catch (e) {
      console.warn('[LINEN HOOK] Supabase update outgoing_items fallback:', e);
    }
  };

  const deleteOutgoingItem = async (id: string, options?: { skipSync?: boolean }) => {
    let oldItem: OutgoingItem | undefined;
    let newCleanQty: number | null = null;

    setState(prev => {
      oldItem = prev.outgoingItems.find(o => o.id === id);
      let nextCleanItems = prev.cleanItems;

      if (oldItem) {
        nextCleanItems = prev.cleanItems.map(ci => {
          if (ci.itemName === oldItem!.itemName) {
            const q = (ci.quantity || 0) + Number(oldItem!.quantity || 0);
            newCleanQty = q;
            return { ...ci, quantity: q };
          }
          return ci;
        });
      }

      const next = {
        ...prev,
        outgoingItems: prev.outgoingItems.filter(item => item.id !== id),
        cleanItems: nextCleanItems
      };
      saveToLocal(next);
      return next;
    });

    const { data: { user } } = await supabase.auth.getUser();

    try {
      await executeLinenWrite('linen_outgoing_items', 'outgoing_items', t =>
        supabase.from(t).delete().eq('id', id)
      );

      if (oldItem && newCleanQty !== null) {
        await executeLinenWrite('linen_clean_items', 'clean_items', t =>
          supabase.from(t).upsert([{
            item_name: oldItem!.itemName,
            firebase_id: 'local-dev',
            uid: user?.id,
            quantity: newCleanQty,
            updated_at: new Date().toISOString()
          }], { onConflict: 'item_name' })
        );
      }
    } catch (e) {
      console.warn('[LINEN HOOK] Supabase delete outgoing_items fallback:', e);
    }

    // SYNC ARAH 2: Linen → Gudang Alia (Deleting outgoing restores stock in Gudang Alia)
    if (!options?.skipSync && oldItem && Number(oldItem.quantity) > 0) {
      try {
        await laundrySyncService.syncTransactionToGudangAlia(
          oldItem.itemName,
          'IN',
          Number(oldItem.quantity),
          { skipSync: false, notes: 'Hapus Catatan Linen Keluar' }
        );
      } catch (err) {
        console.warn('[LINEN HOOK] Sync to Gudang Alia error on deleteOutgoingItem:', err);
      }
    }
  };

  // CRUD for New Item Transactions
  const addNewItemStock = async (data: Omit<NewItemTransaction, 'id' | 'type'> & { type?: 'Stock In' }) => {
    const newId = crypto.randomUUID();
    const newTx: NewItemTransaction = {
      ...data,
      id: newId,
      type: 'Stock In',
      created_at: new Date().toISOString()
    };
    let newStockQty = 0;

    setState(prev => {
      const existingNew = prev.newItems.find(ni => ni.itemName === data.itemName);
      newStockQty = (existingNew?.quantity || 0) + Number(data.quantity || 0);
      const next = {
        ...prev,
        newItemTransactions: [newTx, ...prev.newItemTransactions],
        newItems: prev.newItems.map(ni =>
          ni.itemName === data.itemName ? { ...ni, quantity: newStockQty } : ni
        )
      };
      saveToLocal(next);
      return next;
    });

    const { data: { user } } = await supabase.auth.getUser();
    
    try {
      await executeLinenWrite('linen_new_item_transactions', 'new_item_transactions', t =>
        supabase.from(t).insert([{
          id: newId,
          firebase_id: 'local-dev',
          uid: user?.id,
          date: data.date,
          item_name: data.itemName,
          quantity: data.quantity,
          type: 'Stock In',
          description: data.description || ''
        }])
      );
      await executeLinenWrite('linen_new_items', 'new_items', t =>
        supabase.from(t).upsert([{
          item_name: data.itemName,
          firebase_id: 'local-dev',
          uid: user?.id,
          quantity: newStockQty,
          updated_at: new Date().toISOString()
        }], { onConflict: 'item_name' })
      );
    } catch (e) {
      console.warn('[LINEN HOOK] Supabase insert new_item_transactions fallback:', e);
    }
  };

  const takeNewItemToClean = async (data: Omit<NewItemTransaction, 'id' | 'type'> & { type?: 'Take to Clean' }, options?: { skipSync?: boolean }) => {
    const txId = crypto.randomUUID();
    const incomingId = crypto.randomUUID();

    const newTx: NewItemTransaction = {
      ...data,
      id: txId,
      type: 'Take to Clean',
      created_at: new Date().toISOString()
    };

    const incomingItem: IncomingItem = {
      id: incomingId,
      date: data.date,
      itemName: data.itemName,
      quantity: data.quantity,
      source: 'Barang Baru',
      description: data.description || 'Ambil dari stok barang baru',
      created_at: new Date().toISOString()
    };

    let newStockQty = 0;
    let newCleanQty = 0;

    setState(prev => {
      const existingNew = prev.newItems.find(ni => ni.itemName === data.itemName);
      newStockQty = Math.max(0, (existingNew?.quantity || 0) - Number(data.quantity || 0));

      const existingClean = prev.cleanItems.find(ci => ci.itemName === data.itemName);
      newCleanQty = (existingClean?.quantity || 0) + Number(data.quantity || 0);

      const next = {
        ...prev,
        newItemTransactions: [newTx, ...prev.newItemTransactions],
        incomingItems: [incomingItem, ...prev.incomingItems],
        newItems: prev.newItems.map(ni =>
          ni.itemName === data.itemName ? { ...ni, quantity: newStockQty } : ni
        ),
        cleanItems: prev.cleanItems.map(ci =>
          ci.itemName === data.itemName ? { ...ci, quantity: newCleanQty } : ci
        )
      };
      saveToLocal(next);
      return next;
    });

    const { data: { user } } = await supabase.auth.getUser();
    
    try {
      await executeLinenWrite('linen_new_item_transactions', 'new_item_transactions', t =>
        supabase.from(t).insert([{
          id: txId,
          firebase_id: 'local-dev',
          uid: user?.id,
          date: data.date,
          item_name: data.itemName,
          quantity: data.quantity,
          type: 'Take to Clean',
          incoming_id: incomingId,
          description: data.description || ''
        }])
      );
      await executeLinenWrite('linen_incoming_items', 'incoming_items', t =>
        supabase.from(t).insert([{
          id: incomingId,
          firebase_id: 'local-dev',
          uid: user?.id,
          date: data.date,
          item_name: data.itemName,
          quantity: data.quantity,
          source: 'Barang Baru',
          description: data.description || 'Ambil dari stok barang baru'
        }])
      );
      await executeLinenWrite('linen_new_items', 'new_items', t =>
        supabase.from(t).upsert([{
          item_name: data.itemName,
          firebase_id: 'local-dev',
          uid: user?.id,
          quantity: newStockQty,
          updated_at: new Date().toISOString()
        }], { onConflict: 'item_name' })
      );
      await executeLinenWrite('linen_clean_items', 'clean_items', t =>
        supabase.from(t).upsert([{
          item_name: data.itemName,
          firebase_id: 'local-dev',
          uid: user?.id,
          quantity: newCleanQty,
          updated_at: new Date().toISOString()
        }], { onConflict: 'item_name' })
      );
    } catch (e) {
      console.warn('[LINEN HOOK] Supabase take to clean fallback:', e);
    }

    // SYNC ARAH 2: Linen → Gudang Alia (Take to clean increases clean stock in Gudang Alia)
    if (!options?.skipSync && data.itemName && Number(data.quantity) > 0) {
      try {
        await laundrySyncService.syncTransactionToGudangAlia(
          data.itemName,
          'IN',
          Number(data.quantity),
          { skipSync: false, notes: 'Ambil Barang Baru ke Bersih' }
        );
      } catch (err) {
        console.warn('[LINEN HOOK] Sync to Gudang Alia error on takeNewItemToClean:', err);
      }
    }
  };

  const updateNewItemTransaction = async (id: string, data: Partial<NewItemTransaction>) => {
    setState(prev => {
      const next = {
        ...prev,
        newItemTransactions: prev.newItemTransactions.map(item => item.id === id ? { ...item, ...data } : item)
      };
      saveToLocal(next);
      return next;
    });

    try {
      const payload: any = {};
      if (data.date !== undefined) payload.date = data.date;
      if (data.itemName !== undefined) payload.item_name = data.itemName;
      if (data.quantity !== undefined) payload.quantity = data.quantity;
      if (data.type !== undefined) payload.type = data.type;
      if (data.description !== undefined) payload.description = data.description;

      await executeLinenWrite('linen_new_item_transactions', 'new_item_transactions', t =>
        supabase.from(t).update(payload).eq('id', id)
      );
    } catch (e) {
      console.warn('[LINEN HOOK] Supabase update new_item_transactions fallback:', e);
    }
  };

  const deleteNewItemTransaction = async (id: string) => {
    setState(prev => {
      const next = {
        ...prev,
        newItemTransactions: prev.newItemTransactions.filter(item => item.id !== id)
      };
      saveToLocal(next);
      return next;
    });

    try {
      await executeLinenWrite('linen_new_item_transactions', 'new_item_transactions', t =>
        supabase.from(t).delete().eq('id', id)
      );
    } catch (e) {
      console.warn('[LINEN HOOK] Supabase delete new_item_transactions fallback:', e);
    }
  };

  return {
    state,
    loading,
    error,
    refresh: fetchAllData,
    addRoomItem,
    updateRoomItem,
    deleteRoomItem,
    addIncomingItem,
    updateIncomingItem,
    deleteIncomingItem,
    addOutgoingItem,
    updateOutgoingItem,
    deleteOutgoingItem,
    addNewItemStock,
    takeNewItemToClean,
    updateNewItemTransaction,
    deleteNewItemTransaction,
    updateCleanItem
  };
}
