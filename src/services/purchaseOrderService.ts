import { supabase } from '../lib/supabase';
import { PurchaseOrder } from '../types';

export const purchaseOrderService = {
  /**
   * Fetch Purchase Orders WITH relational items in ONE query (eliminates N+1)
   */
  async getPurchaseOrders() {
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

    return poId;
  },

  /**
   * Complete Purchase Order and add stock to inventory
   */
  async completePurchaseOrder(po: PurchaseOrder) {
    if (po.status === 'completed') return;

    // 1. Update PO Status
    const { error: updateErr } = await supabase
      .from('purchase_orders')
      .update({ status: 'completed' })
      .eq('id', po.id);

    if (updateErr) throw updateErr;

    // 2. Add stock to inventory & record IN transaction for each item
    if (po.items && po.items.length > 0) {
      for (const poItem of po.items) {
        if (!poItem.item_id) continue;

        // Fetch current stock
        const { data: item } = await supabase
          .from('items')
          .select('id, current_stock')
          .eq('id', poItem.item_id)
          .single();

        if (item) {
          // Update item stock
          await supabase
            .from('items')
            .update({ current_stock: item.current_stock + poItem.quantity })
            .eq('id', item.id);

          // Record IN Transaction
          await supabase
            .from('transactions')
            .insert([{
              id: crypto.randomUUID(),
              item_id: poItem.item_id,
              type: 'IN',
              quantity: poItem.quantity,
              department: 'Pembelian PO',
              notes: `Auto-generated from PO #${po.po_number || po.id.slice(0, 8)}`,
              user_id: po.user_id
            }]);
        }
      }
    }
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
  }
};
