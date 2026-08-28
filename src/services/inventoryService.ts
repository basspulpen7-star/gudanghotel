import { supabase } from '../lib/supabase';
import { Item, Transaction } from '../types';
import { queryCache } from '../lib/queryCache';

export interface GetItemsOptions {
  department?: string;
  search?: string;
  lowStockOnly?: boolean;
  page?: number;
  limit?: number;
}

export const inventoryService = {
  /**
   * Invalidate inventory-related cache
   */
  invalidateCache() {
    queryCache.invalidate('items');
    queryCache.invalidate('dashboard');
    queryCache.invalidate('notifications');
  },

  /**
   * Calculate and synchronize accurate current_stock for a specific list of item IDs based on ledger transactions
   * This is a targeted manual/on-demand recalculation to avoid unnecessary background write storms.
   */
  async recalculateStockForItems(itemIds: string[]): Promise<{ total: number; updated: number }> {
    if (!itemIds || itemIds.length === 0) return { total: 0, updated: 0 };

    try {
      const { data: targetItems, error: itemsErr } = await supabase
        .from('items')
        .select('id, name, initial_stock, current_stock')
        .in('id', itemIds);

      if (itemsErr) throw itemsErr;
      if (!targetItems || targetItems.length === 0) return { total: 0, updated: 0 };

      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .select('item_id, type, quantity')
        .in('item_id', itemIds);

      if (txError) throw txError;

      const inMap: Record<string, number> = {};
      const outMap: Record<string, number> = {};

      (txData || []).forEach(tx => {
        const qty = Number(tx.quantity) || 0;
        if (tx.type === 'IN') {
          inMap[tx.item_id] = (inMap[tx.item_id] || 0) + qty;
        } else if (tx.type === 'OUT') {
          outMap[tx.item_id] = (outMap[tx.item_id] || 0) + qty;
        }
      });

      let updatedCount = 0;
      for (const item of targetItems) {
        const initial = Number(item.initial_stock || 0);
        const totalIn = inMap[item.id] || 0;
        const totalOut = outMap[item.id] || 0;
        const calculatedStock = Math.max(0, initial + totalIn - totalOut);

        if (item.current_stock !== calculatedStock) {
          await supabase
            .from('items')
            .update({ current_stock: calculatedStock })
            .eq('id', item.id);
          updatedCount++;
        }
      }

      this.invalidateCache();
      return { total: targetItems.length, updated: updatedCount };
    } catch (err) {
      console.warn('[INVENTORY SERVICE] Error recalculating stock for items:', err);
      return { total: itemIds.length, updated: 0 };
    }
  },

  /**
   * Helper to calculate and enrich stock for in-memory items (used on-demand / in audit tools)
   */
  async syncAndEnrichItemsStock(items: Item[]): Promise<Item[]> {
    if (!items || items.length === 0) return [];

    try {
      const itemIds = items.map(i => i.id);
      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .select('item_id, type, quantity')
        .in('item_id', itemIds);

      if (txError) {
        console.warn('[INVENTORY SERVICE] Could not load transactions for stock sync:', txError.message);
        return items;
      }

      // Group transactions by item_id
      const inMap: Record<string, number> = {};
      const outMap: Record<string, number> = {};

      (txData || []).forEach(tx => {
        const qty = Number(tx.quantity) || 0;
        if (tx.type === 'IN') {
          inMap[tx.item_id] = (inMap[tx.item_id] || 0) + qty;
        } else if (tx.type === 'OUT') {
          outMap[tx.item_id] = (outMap[tx.item_id] || 0) + qty;
        }
      });

      return items.map(item => {
        const initial = Number(item.initial_stock || 0);
        const totalIn = inMap[item.id] || 0;
        const totalOut = outMap[item.id] || 0;
        const calculatedStock = Math.max(0, initial + totalIn - totalOut);

        return {
          ...item,
          current_stock: calculatedStock
        };
      });
    } catch (err) {
      console.warn('[INVENTORY SERVICE] Error enriching stock:', err);
      return items;
    }
  },

  /**
   * Fetch all active items with cache (TTL 30s) to prevent repeated requests on navigation & dropdowns
   */
  async getCachedItems(forceRefresh = false): Promise<Item[]> {
    return queryCache.fetchWithCache<Item[]>(
      'items:all',
      async () => {
        const { data, error } = await supabase
          .from('items')
          .select('id, name, department, unit, initial_stock, current_stock, min_stock, created_at')
          .order('name', { ascending: true });

        if (error) throw error;
        return (data || []) as Item[];
      },
      30000, // 30 seconds TTL
      forceRefresh
    );
  },

  /**
   * Recalculate all item stocks in database based on initial_stock + SUM(IN) - SUM(OUT)
   */
  async recalculateAllStocks(): Promise<{ total: number; updated: number }> {
    try {
      // 1. Try server-side RPC if available
      const { data: rpcData, error: rpcError } = await supabase.rpc('recalculate_all_item_stocks');
      if (!rpcError && rpcData) {
        this.invalidateCache();
        return { total: rpcData.total || 0, updated: rpcData.updated || 0 };
      }
    } catch (e) {
      // ignore, proceed with client-side recalculation
    }

    // Client-side full audit and recalculation
    const { data: allItems, error: itemsErr } = await supabase
      .from('items')
      .select('id, name, initial_stock, current_stock');

    if (itemsErr) throw itemsErr;
    if (!allItems || allItems.length === 0) return { total: 0, updated: 0 };

    const { data: allTx, error: txErr } = await supabase
      .from('transactions')
      .select('item_id, type, quantity');

    if (txErr) throw txErr;

    const inMap: Record<string, number> = {};
    const outMap: Record<string, number> = {};

    (allTx || []).forEach(tx => {
      const qty = Number(tx.quantity) || 0;
      if (tx.type === 'IN') {
        inMap[tx.item_id] = (inMap[tx.item_id] || 0) + qty;
      } else if (tx.type === 'OUT') {
        outMap[tx.item_id] = (outMap[tx.item_id] || 0) + qty;
      }
    });

    let updatedCount = 0;
    for (const item of allItems) {
      const initial = Number(item.initial_stock || 0);
      const totalIn = inMap[item.id] || 0;
      const totalOut = outMap[item.id] || 0;
      const calculatedStock = Math.max(0, initial + totalIn - totalOut);

      if (item.current_stock !== calculatedStock) {
        await supabase
          .from('items')
          .update({ current_stock: calculatedStock })
          .eq('id', item.id);
        updatedCount++;
      }
    }

    this.invalidateCache();
    return { total: allItems.length, updated: updatedCount };
  },

  /**
   * Get low-stock items for header notification badge with cache (TTL 60s)
   */
  async getLowStockNotifications(forceRefresh = false): Promise<Array<{ id: string; title: string; message: string; type: string }>> {
    return queryCache.fetchWithCache(
      'notifications:low_stock',
      async () => {
        const items = await this.getCachedItems(forceRefresh);
        return items
          .filter(item => (Number(item.current_stock) || 0) <= (Number(item.min_stock) || 0))
          .map(item => ({
            id: item.id,
            title: 'Stok Rendah',
            message: `${item.name} sisa sedikit (${item.unit})`,
            type: 'warning'
          }));
      },
      60000,
      forceRefresh
    );
  },

  /**
   * Consolidated RPC for dashboard KPI, low stock items, and recent transactions in 1 round trip
   * Includes automatic fallback if RPC is not yet created in Supabase.
   */
  async getDashboardSummary(lowStockLimit = 5, recentTxLimit = 5, forceRefresh = false) {
    const cacheKey = `dashboard:summary:${lowStockLimit}:${recentTxLimit}`;
    return queryCache.fetchWithCache(
      cacheKey,
      async () => {
        try {
          const { data, error } = await supabase.rpc('get_dashboard_summary', {
            p_low_stock_limit: lowStockLimit,
            p_recent_tx_limit: recentTxLimit
          });

          if (!error && data && data.kpis) {
            return data as {
              kpis: { totalItems: number; lowStockCount: number; todayInQty: number; todayOutQty: number };
              lowStockItems: Partial<Item>[];
              recentTransactions: Transaction[];
            };
          }
          
          if (error) {
            console.warn('[RPC NOTICE] get_dashboard_summary fallback activated:', error.message);
          }
        } catch (err) {
          console.warn('[RPC ERROR] Falling back to standard queries:', err);
        }

        // Fallback: Query directly in case migration is not yet applied
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayIso = todayStart.toISOString();

        const [itemsRes, todayInRes, todayOutRes, txRes] = await Promise.all([
          supabase.from('items').select('id, name, department, unit, initial_stock, current_stock, min_stock'),
          supabase.from('transactions').select('quantity').eq('type', 'IN').gte('created_at', todayIso),
          supabase.from('transactions').select('quantity').eq('type', 'OUT').gte('created_at', todayIso),
          supabase.from('transactions').select('id, item_id, type, quantity, department, notes, created_at, user_id, items(id, name, unit)').order('created_at', { ascending: false }).limit(recentTxLimit)
        ]);

        const rawItems = (itemsRes.data || []) as Item[];
        const allItems = rawItems;

        const lowStockItems = allItems
          .filter(item => Number(item.current_stock) <= Number(item.min_stock))
          .sort((a, b) => Number(a.current_stock) - Number(b.current_stock))
          .slice(0, lowStockLimit);

        const todayInQty = (todayInRes.data || []).reduce((sum, t) => sum + (Number(t.quantity) || 0), 0);
        const todayOutQty = (todayOutRes.data || []).reduce((sum, t) => sum + (Number(t.quantity) || 0), 0);

        return {
          kpis: {
            totalItems: allItems.length,
            lowStockCount: allItems.filter(i => Number(i.current_stock) <= Number(i.min_stock)).length,
            todayInQty,
            todayOutQty
          },
          lowStockItems,
          recentTransactions: (txRes.data || []) as unknown as Transaction[]
        };
      },
      30000, // 30 seconds TTL for dashboard
      forceRefresh
    );
  },

  /**
   * Fetch paginated items with required columns directly from database
   */
  async getItems(options: GetItemsOptions = {}) {
    const {
      department,
      search,
      lowStockOnly = false,
      page = 1,
      limit = 20
    } = options;

    let query = supabase
      .from('items')
      .select('id, name, department, unit, initial_stock, current_stock, min_stock, created_at', { count: 'exact' });

    if (department && department !== 'Semua') {
      query = query.eq('department', department);
    }

    if (search && search.trim()) {
      const term = search.trim();
      query = query.or(`name.ilike.%${term}%,department.ilike.%${term}%`);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query.order('name', { ascending: true });

    if (limit > 0) {
      query = query.range(from, to);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    let result = (data || []) as Item[];

    if (lowStockOnly) {
      result = result.filter(item => item.current_stock <= item.min_stock);
    }

    return {
      data: result,
      total: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / (limit || 1))
    };
  },

  /**
   * Check if an item has any transactions recorded
   */
  async hasTransactions(itemId: string): Promise<boolean> {
    const { count, error } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('item_id', itemId);
    if (error) return false;
    return (count || 0) > 0;
  },

  /**
   * Add or Edit Item
   */
  async saveItem(itemData: Partial<Item> & { name: string; department: string; unit: string; initial_stock: number; min_stock: number }, id?: string) {
    if (id) {
      const hasTx = await this.hasTransactions(id);

      if (hasTx) {
        // Item already has transactions: do NOT modify initial_stock or current_stock
        const { error } = await supabase
          .from('items')
          .update({
            name: itemData.name,
            department: itemData.department,
            unit: itemData.unit,
            min_stock: itemData.min_stock
          })
          .eq('id', id);

        if (error) throw error;
      } else {
        // Item has NO transactions: user can adjust initial_stock, current_stock equals initial_stock
        const { error } = await supabase
          .from('items')
          .update({
            name: itemData.name,
            department: itemData.department,
            unit: itemData.unit,
            initial_stock: itemData.initial_stock,
            current_stock: itemData.initial_stock,
            min_stock: itemData.min_stock
          })
          .eq('id', id);

        if (error) throw error;
      }
    } else {
      const newItemId = crypto.randomUUID();
      const { error } = await supabase
        .from('items')
        .insert([{
          id: newItemId,
          name: itemData.name,
          department: itemData.department,
          unit: itemData.unit,
          initial_stock: itemData.initial_stock,
          current_stock: itemData.initial_stock,
          min_stock: itemData.min_stock
        }]);

      if (error) throw error;
    }

    this.invalidateCache();
  },

  /**
   * Delete Item
   */
  async deleteItem(id: string) {
    const { error } = await supabase.from('items').delete().eq('id', id);
    if (error) throw error;
    this.invalidateCache();
  }
};
