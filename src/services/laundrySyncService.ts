import { supabase } from '../lib/supabase';
import { supabaseLinen } from '../lib/supabaseLinen';
import { ITEM_TYPES } from '../constants-linen';
import { transactionService } from './transactionService';
import { inventoryService } from './inventoryService';
import { format } from 'date-fns';

export interface SyncOptions {
  skipSync?: boolean;
  notes?: string;
  userId?: string;
  isDelete?: boolean;
}

export interface ReconciliationItem {
  linenItemName: string;
  gudangAliaItemId?: string;
  gudangAliaStock: number;
  linenStock: number;
  diff: number;
  chosenSource: 'gudang' | 'linen' | 'none';
}

/**
 * Event emitter / notifier helper for Sync Errors
 */
export function notifySyncError(message: string, details?: any) {
  console.warn(`⚠️ [LAUNDRY SYNC WARNING]: ${message}`, details);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('laundry-sync-warning', {
        detail: { message, details, timestamp: new Date().toISOString() }
      })
    );
  }
}

export const laundrySyncService = {
  /**
   * SYNC ARAH 1: Gudang Alia → Linen
   * Updates clean_items quantity in Supabase Linen and logs incoming/outgoing entry with source/dest 'Gudang Alia'.
   */
  async syncTransactionToLinen(
    linenItemName: string,
    type: 'IN' | 'OUT',
    quantity: number,
    options: SyncOptions = {}
  ): Promise<boolean> {
    if (options.skipSync) {
      return true;
    }

    if (!linenItemName || !quantity || quantity <= 0) {
      return false;
    }

    try {
      // 1. Fetch current clean item in Supabase Linen (prefixed table)
      const { data: cleanRows, error: fetchErr } = await supabaseLinen
        .from('linen_clean_items')
        .select('*')
        .or(`item_name.eq."${linenItemName}",itemName.eq."${linenItemName}"`);

      if (fetchErr) {
        console.warn('[LAUNDRY SYNC] Error fetching clean_item in Linen:', fetchErr.message);
      }

      const existingRow = cleanRows && cleanRows.length > 0 ? cleanRows[0] : null;
      const currentQty = existingRow ? Number(existingRow.quantity || 0) : 0;

      const newQty = type === 'IN' 
        ? currentQty + quantity 
        : Math.max(0, currentQty - quantity);

      // 2. Update clean_items in Linen (prefixed table)
      const { error: upsertErr } = await supabaseLinen
        .from('linen_clean_items')
        .upsert([{
          item_name: linenItemName,
          firebase_id: 'local-dev',
          quantity: newQty,
          updated_at: new Date().toISOString()
        }], { onConflict: 'item_name' });

      if (upsertErr) {
        throw upsertErr;
      }

      // 3. Insert audit ledger row into incoming_items or outgoing_items
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const ledgerId = crypto.randomUUID();

      if (type === 'IN') {
        await supabaseLinen.from('linen_incoming_items').insert([{
          id: ledgerId,
          firebase_id: 'local-dev',
          date: todayStr,
          item_name: linenItemName,
          quantity,
          source: 'Gudang Alia',
          description: options.notes || 'Sinkronisasi dari transaksi masuk Gudang Alia'
        }]);
      } else {
        await supabaseLinen.from('linen_outgoing_items').insert([{
          id: ledgerId,
          firebase_id: 'local-dev',
          date: todayStr,
          item_name: linenItemName,
          quantity,
          destination: 'Gudang Alia',
          description: options.notes || 'Sinkronisasi dari transaksi keluar Gudang Alia'
        }]);
      }

      return true;
    } catch (err: any) {
      notifySyncError(
        `Stok Linen '${linenItemName}' gagal disinkronkan dari Gudang Alia: ${err?.message || err}. Silakan gunakan tombol 'Sinkron Ulang Stok Laundry'.`,
        { linenItemName, type, quantity, err }
      );
      return false;
    }
  },

  /**
   * SYNC ARAH 2: Linen → Gudang Alia
   * Finds matching item in Gudang Alia by linen_item_name or department Laundry,
   * and creates transaction with skipSync: true.
   */
  async syncTransactionToGudangAlia(
    itemName: string,
    type: 'IN' | 'OUT',
    quantity: number,
    options: SyncOptions = {}
  ): Promise<boolean> {
    if (options.skipSync) {
      return true;
    }

    if (!itemName || !quantity || quantity <= 0) {
      return false;
    }

    try {
      // 1. Find matching item in Gudang Alia
      const { data: allItems, error: findErr } = await supabase
        .from('items')
        .select('id, name, department, current_stock');

      if (findErr) throw findErr;

      // Match by exact name or case-insensitive name or linen_item_name
      let targetItem = (allItems || []).find((i: any) => 
        (i.name && i.name.trim().toLowerCase() === itemName.trim().toLowerCase()) ||
        (i.department === 'Laundry' && i.name === itemName) ||
        (i as any).linen_item_name === itemName
      ) || null;

      // If item doesn't exist yet, auto-create it in Gudang Alia
      if (!targetItem) {
        const newItemId = crypto.randomUUID();
        const newItemPayload: any = {
          id: newItemId,
          name: itemName,
          department: 'Laundry',
          unit: 'pcs',
          initial_stock: 0,
          current_stock: 0,
          min_stock: 0
        };

        const { data: createdItem, error: createErr } = await supabase
          .from('items')
          .insert([newItemPayload])
          .select('id, name, department, current_stock')
          .single();

        if (createErr) throw createErr;
        targetItem = createdItem;
      }

      if (!targetItem) {
        throw new Error(`Item Gudang Alia untuk '${itemName}' tidak ditemukan`);
      }

      // 2. Call transactionService with skipSync: true to avoid infinite loops
      await transactionService.createTransaction({
        itemId: targetItem.id,
        type,
        quantity,
        department: 'Laundry',
        notes: options.notes || `Sync dari Modul Linen (${type === 'IN' ? 'Masuk' : 'Keluar'})`,
        userId: options.userId || 'system-linen-sync',
        skipSync: true
      });

      return true;
    } catch (err: any) {
      notifySyncError(
        `Stok Laundry di Gudang Alia untuk '${itemName}' gagal disinkron: ${err?.message || err}. Silakan gunakan tombol 'Sinkron Ulang Stok Laundry'.`,
        { itemName, type, quantity, err }
      );
      return false;
    }
  },

  /**
   * Fetch all items and compare stock between Gudang Alia (Laundry) and Linen (Clean Items)
   */
  async getReconciliationData(): Promise<ReconciliationItem[]> {
    try {
      // 1. Fetch Linen clean_items (prefixed table)
      const { data: cleanData } = await supabaseLinen
        .from('linen_clean_items')
        .select('*');

      const linenStockMap = new Map<string, number>();
      ITEM_TYPES.forEach(t => linenStockMap.set(t, 0));
      (cleanData || []).forEach((c: any) => {
        const name = c.itemName || c.item_name;
        if (name) {
          linenStockMap.set(name, Number(c.quantity || 0));
        }
      });

      // 2. Fetch Gudang Alia items
      const { data: gudangItems } = await supabase
        .from('items')
        .select('id, name, department, current_stock');

      const gudangMap = new Map<string, { id: string; stock: number }>();
      (gudangItems || []).forEach((item: any) => {
        const isLaundry = item.department === 'Laundry' || item.category === 'Laundry' || ITEM_TYPES.includes(item.name as any) || item.linen_item_name;
        if (isLaundry) {
          const key = item.linen_item_name || item.name;
          gudangMap.set(key, {
            id: item.id,
            stock: Number(item.current_stock || 0)
          });
        }
      });

      // 3. Build unified reconciliation list for all 10 standard linen types + any custom items
      const allKeys = new Set([...ITEM_TYPES, ...Array.from(gudangMap.keys())]);
      const list: ReconciliationItem[] = [];

      allKeys.forEach(name => {
        const linenStock = linenStockMap.get(name) || 0;
        const gInfo = gudangMap.get(name);
        const gudangStock = gInfo ? gInfo.stock : 0;
        const diff = gudangStock - linenStock;

        list.push({
          linenItemName: name,
          gudangAliaItemId: gInfo?.id,
          gudangAliaStock: gudangStock,
          linenStock: linenStock,
          diff,
          chosenSource: 'none'
        });
      });

      return list;
    } catch (err) {
      console.error('[LAUNDRY SYNC] Error fetching reconciliation data:', err);
      throw err;
    }
  },

  /**
   * Apply reconciliation decisions selected by user
   */
  async applyReconciliation(
    decisions: Array<{
      linenItemName: string;
      gudangAliaItemId?: string;
      chosenSource: 'gudang' | 'linen';
      gudangAliaStock: number;
      linenStock: number;
    }>,
    userId: string
  ): Promise<{ successCount: number; errors: string[] }> {
    let successCount = 0;
    const errors: string[] = [];

    for (const item of decisions) {
      try {
        if (item.chosenSource === 'gudang') {
          // Set Linen clean stock to match Gudang Alia (prefixed table)
          const targetStock = item.gudangAliaStock;

          await supabaseLinen.from('linen_clean_items').upsert([{
            item_name: item.linenItemName,
            firebase_id: 'local-dev',
            quantity: targetStock,
            updated_at: new Date().toISOString()
          }], { onConflict: 'item_name' });

          successCount++;
        } else if (item.chosenSource === 'linen') {
          // Set Gudang Alia stock to match Linen
          const targetStock = item.linenStock;

          if (item.gudangAliaItemId) {
            const currentStock = item.gudangAliaStock;
            const diff = targetStock - currentStock;

            if (diff !== 0) {
              const transType = diff > 0 ? 'IN' : 'OUT';
              await transactionService.createTransaction({
                itemId: item.gudangAliaItemId,
                type: transType,
                quantity: Math.abs(diff),
                department: 'Laundry',
                notes: 'Penyesuaian Rekonsiliasi: Mengikuti Stok Linen Bersih',
                userId: userId || 'system-reconciliation',
                skipSync: true
              });
            }
          } else {
            // Item does not exist in Gudang Alia, create it
            const newItemId = crypto.randomUUID();
            await supabase.from('items').insert([{
              id: newItemId,
              name: item.linenItemName,
              department: 'Laundry',
              unit: 'pcs',
              initial_stock: targetStock,
              current_stock: targetStock,
              min_stock: 0
            }]);
          }

          successCount++;
        }
      } catch (err: any) {
        errors.push(`Gagal rekonsiliasi '${item.linenItemName}': ${err?.message || err}`);
      }
    }

    inventoryService.invalidateCache();
    return { successCount, errors };
  }
};
