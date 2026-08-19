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
   * Fetch all active items with cache (TTL 60s) to prevent repeated requests on navigation & dropdowns
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
      60000, // 60 seconds TTL
      forceRefresh
    );
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
          supabase.from('items').select('id, name, department, unit, current_stock, min_stock'),
          supabase.from('transactions').select('quantity').eq('type', 'IN').gte('created_at', todayIso),
          supabase.from('transactions').select('quantity').eq('type', 'OUT').gte('created_at', todayIso),
          supabase.from('transactions').select('id, item_id, type, quantity, department, notes, created_at, user_id, items(id, name, unit)').order('created_at', { ascending: false }).limit(recentTxLimit)
        ]);

        const allItems = (itemsRes.data || []) as Item[];
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
   * Fetch paginated items with required columns only
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
