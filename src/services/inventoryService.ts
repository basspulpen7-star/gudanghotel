import { supabase } from '../lib/supabase';
import { Item } from '../types';

export interface GetItemsOptions {
  department?: string;
  search?: string;
  lowStockOnly?: boolean;
  page?: number;
  limit?: number;
}

export const inventoryService = {
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

    if (lowStockOnly) {
      // In Supabase postgrest, we can filter low stock by column comparison or raw if supported,
      // but simpler: query current_stock <= min_stock
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
   * Get low stock items for urgent attention (max 5 for dashboard)
   */
  async getLowStockItems(limit = 5) {
    const { data, error } = await supabase
      .from('items')
      .select('id, name, department, unit, current_stock, min_stock')
      .order('current_stock', { ascending: true });

    if (error) throw error;

    const lowStock = (data || []).filter(item => item.current_stock <= item.min_stock).slice(0, limit);
    return lowStock;
  },

  /**
   * Get quick KPI counts without loading full datasets
   */
  async getDashboardKPIs() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayIso = todayStart.toISOString();

    // Run parallel queries with count only
    const [totalItemsRes, lowStockRes, todayInRes, todayOutRes] = await Promise.all([
      supabase.from('items').select('id, current_stock, min_stock'),
      supabase.from('items').select('id', { count: 'exact', head: true }),
      supabase.from('transactions').select('quantity').eq('type', 'IN').gte('created_at', todayIso),
      supabase.from('transactions').select('quantity').eq('type', 'OUT').gte('created_at', todayIso)
    ]);

    const items = totalItemsRes.data || [];
    const lowStockCount = items.filter(i => i.current_stock <= i.min_stock).length;
    const totalItemsCount = items.length;

    const todayInQty = (todayInRes.data || []).reduce((sum, t) => sum + (t.quantity || 0), 0);
    const todayOutQty = (todayOutRes.data || []).reduce((sum, t) => sum + (t.quantity || 0), 0);

    return {
      totalItems: totalItemsCount,
      lowStockCount,
      todayInQty,
      todayOutQty
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
  },

  /**
   * Delete Item
   */
  async deleteItem(id: string) {
    const { error } = await supabase.from('items').delete().eq('id', id);
    if (error) throw error;
  }
};
