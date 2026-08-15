import { supabase } from '../lib/supabase';
import { Transaction } from '../types';

export interface CreateTransactionParams {
  itemId: string;
  type: 'IN' | 'OUT';
  quantity: number;
  department?: string;
  notes?: string;
  userId: string;
}

export interface GetTransactionsOptions {
  type?: 'IN' | 'OUT' | 'ALL';
  department?: string;
  search?: string;
  page?: number;
  limit?: number;
  month?: number; // 0-11
  year?: number;
}

export const transactionService = {
  /**
   * Fetch paginated transactions with specific columns to minimize network payload
   */
  async getTransactions(options: GetTransactionsOptions = {}) {
    const {
      type = 'ALL',
      department,
      search,
      page = 1,
      limit = 20,
      month,
      year
    } = options;

    let query = supabase
      .from('transactions')
      .select(`
        id,
        item_id,
        type,
        quantity,
        department,
        notes,
        created_at,
        user_id,
        items:items (
          id,
          name,
          unit,
          current_stock,
          min_stock
        )
      `, { count: 'exact' });

    if (type && type !== 'ALL') {
      query = query.eq('type', type);
    }

    if (department && department !== 'Semua') {
      query = query.eq('department', department);
    }

    if (month !== undefined && month !== -1 && year !== undefined && year !== -1) {
      const startDate = new Date(year, month, 1).toISOString();
      const endDate = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
      query = query.gte('created_at', startDate).lte('created_at', endDate);
    }

    if (search) {
      query = query.or(`notes.ilike.%${search}%,department.ilike.%${search}%`);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      data: (data || []) as unknown as Transaction[],
      total: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / limit)
    };
  },

  /**
   * Atomic Transaction + Stock Update using Supabase RPC if available, or fallback batch
   */
  async createTransaction(params: CreateTransactionParams) {
    const { itemId, type, quantity, department, notes, userId } = params;

    // Try RPC first for atomic DB operation
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'create_transaction_and_update_stock',
        {
          p_item_id: itemId,
          p_type: type,
          p_quantity: quantity,
          p_department: department || 'General',
          p_notes: notes || '',
          p_user_id: userId
        }
      );

      if (!rpcError) {
        return rpcData;
      }
    } catch (rpcCatch) {
      // Fallback to two-step operation if RPC is not installed
      console.warn('[TRANSACTION SERVICE] RPC not available, using client-side fallback transaction');
    }

    // Client-side fallback
    // 1. Check current stock if OUT
    const { data: item, error: itemErr } = await supabase
      .from('items')
      .select('id, current_stock')
      .eq('id', itemId)
      .single();

    if (itemErr || !item) throw new Error('Barang tidak ditemukan');

    if (type === 'OUT' && item.current_stock < quantity) {
      throw new Error(`Stok tidak mencukupi. Stok tersedia: ${item.current_stock}`);
    }

    // 2. Insert transaction
    const transId = crypto.randomUUID();
    const { error: transErr } = await supabase.from('transactions').insert([{
      id: transId,
      item_id: itemId,
      type,
      quantity,
      department: department || 'General',
      notes,
      user_id: userId
    }]);

    if (transErr) throw transErr;

    // 3. Update stock
    const newStock = type === 'IN' 
      ? item.current_stock + quantity 
      : item.current_stock - quantity;

    const { error: stockErr } = await supabase
      .from('items')
      .update({ current_stock: newStock })
      .eq('id', itemId);

    if (stockErr) throw stockErr;

    return { id: transId, new_stock: newStock };
  },

  /**
   * Delete transaction and revert stock
   */
  async deleteTransaction(transaction: Transaction) {
    // 1. Delete transaction
    const { error: delErr } = await supabase
      .from('transactions')
      .delete()
      .eq('id', transaction.id);

    if (delErr) throw delErr;

    // 2. Revert item stock
    const { data: item } = await supabase
      .from('items')
      .select('id, current_stock')
      .eq('id', transaction.item_id)
      .single();

    if (item) {
      const revertedStock = transaction.type === 'IN'
        ? item.current_stock - transaction.quantity
        : item.current_stock + transaction.quantity;

      await supabase
        .from('items')
        .update({ current_stock: Math.max(0, revertedStock) })
        .eq('id', item.id);
    }
  }
};
