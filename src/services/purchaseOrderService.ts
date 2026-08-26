import { supabase } from '../lib/supabase';
import { PurchaseOrder } from '../types';
import { queryCache } from '../lib/queryCache';
import { inventoryService } from './inventoryService';

export interface GetPurchaseOrdersOptions {
  page?: number;
  limit?: number;
  search?: string;
  month?: number;
  year?: number;
  status?: string;
  forceRefresh?: boolean;
}

export const purchaseOrderService = {
  /**
   * Fetch paginated Purchase Orders WITH relational items in ONE single query (server-side pagination + count)
   */
  async getPurchaseOrdersPaginated(options: GetPurchaseOrdersOptions = {}) {
    const {
      page = 1,
      limit = 10,
      search,
      month,
      year,
      status
    } = options;

    let query = supabase
      .from('purchase_orders')
      .select(`
        id,
        po_number,
        supplier_id,
        status,
        total_amount,
        created_at,
        user_id,
        supplier:suppliers (
          id,
          name,
          contact_person,
          phone,
          address,
          category
        ),
        items:purchase_order_items (
          id,
          purchase_order_id,
          item_id,
          quantity,
          price,
          item:items (
            id,
            name,
            unit,
            current_stock
          )
        )
      `, { count: 'exact' });

    if (status && status !== 'ALL') {
      query = query.eq('status', status);
    }

    if (month !== undefined && month !== -1 && year !== undefined && year !== -1) {
      const startDate = new Date(year, month, 1).toISOString();
      const endDate = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
      query = query.gte('created_at', startDate).lte('created_at', endDate);
    }

    if (search && search.trim()) {
      const term = search.trim();
      query = query.or(`po_number.ilike.%${term}%,id.ilike.%${term}%`);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      data: (data || []) as unknown as PurchaseOrder[],
      total: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / limit)
    };
  },

  /**
   * Fetch Purchase Orders WITH relational items (Cached for overview/reports)
   */
  async getPurchaseOrders(forceRefresh = false) {
    return queryCache.fetchWithCache<PurchaseOrder[]>(
      'purchase_orders:all',
      async () => {
        const { data, error } = await supabase
          .from('purchase_orders')
          .select(`
            id,
            po_number,
            supplier_id,
            status,
            total_amount,
            created_at,
            user_id,
            supplier:suppliers (
              id,
              name,
              contact_person,
              phone,
              address,
              category
            ),
            items:purchase_order_items (
              id,
              purchase_order_id,
              item_id,
              quantity,
              price,
              item:items (
                id,
                name,
                unit,
                current_stock
              )
            )
          `)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return (data || []) as unknown as PurchaseOrder[];
      },
      30000,
      forceRefresh
    );
  },

  /**
   * Create Purchase Order
   */
  async createPurchaseOrder(params: {
    supplierId: string;
    items: Array<{ itemId: string; quantity: number; price: number }>;
    userId: string;
  }) {
    const { supplierId, items, userId } = params;
    const poId = crypto.randomUUID();
    const poNumber = `PO-${Date.now().toString().slice(-6)}`;
    const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.price), 0);

    // 1. Insert Purchase Order Header
    const { error: poErr } = await supabase
      .from('purchase_orders')
      .insert([{
        id: poId,
        po_number: poNumber,
        supplier_id: supplierId,
        status: 'pending',
        total_amount: totalAmount,
        user_id: userId
      }]);

    if (poErr) throw poErr;

    // 2. Insert Items in bulk
    const poItems = items.map(item => ({
      id: crypto.randomUUID(),
      purchase_order_id: poId,
      item_id: item.itemId,
      quantity: item.quantity,
      price: item.price
    }));

    const { error: itemsErr } = await supabase
      .from('purchase_order_items')
      .insert(poItems);

    if (itemsErr) throw itemsErr;

    queryCache.invalidate('purchase_orders');
    return poId;
  },

  /**
   * Complete Purchase Order and add stock to inventory atomically via RPC with fallback
   */
  async completePurchaseOrder(po: PurchaseOrder, userId?: string) {
    if (po.status === 'completed') return;

    // 1. Try atomic PostgreSQL RPC execution first (1 Single Network Request)
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('complete_purchase_order', {
        p_po_id: po.id,
        p_user_id: userId || po.user_id || null
      });

      if (!rpcErr && rpcRes?.success) {
        queryCache.invalidate('purchase_orders');
        inventoryService.invalidateCache();
        return;
      }
    } catch (rpcCatchErr) {
      console.warn('[PO SERVICE] RPC complete_purchase_order notice, using resilient fallback:', rpcCatchErr);
    }

    // 2. Resilient Client Fallback if RPC is not yet executed in database
    const { error: updateErr } = await supabase
      .from('purchase_orders')
      .update({ status: 'completed' })
      .eq('id', po.id);

    if (updateErr) throw updateErr;

    // Add stock to inventory & record IN transaction for each item
    if (po.items && po.items.length > 0) {
      for (const poItem of po.items) {
        if (!poItem.item_id) continue;

        const { data: item } = await supabase
          .from('items')
          .select('id, current_stock')
          .eq('id', poItem.item_id)
          .single();

        if (item) {
          await supabase
            .from('items')
            .update({ current_stock: item.current_stock + poItem.quantity })
            .eq('id', item.id);

          await supabase
            .from('transactions')
            .insert([{
              id: crypto.randomUUID(),
              item_id: poItem.item_id,
              type: 'IN',
              quantity: poItem.quantity,
              department: 'Pembelian PO',
              notes: `Auto-generated from PO #${po.po_number || po.id.slice(0, 8)}`,
              user_id: userId || po.user_id
            }]);
        }
      }
    }

    queryCache.invalidate('purchase_orders');
    inventoryService.invalidateCache();
  },

  /**
   * Delete Purchase Order
   */
  async deletePurchaseOrder(id: string) {
    // Delete PO items first
    await supabase.from('purchase_order_items').delete().eq('purchase_order_id', id);
    // Delete PO
    const { error } = await supabase.from('purchase_orders').delete().eq('id', id);
    if (error) throw error;
    queryCache.invalidate('purchase_orders');
  }
};
