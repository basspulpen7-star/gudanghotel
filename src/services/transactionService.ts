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
   * Atomic Transaction + Stock Update using Supabase RPC
   */
  async createTransaction(params: CreateTransactionParams) {
    const { itemId, type, quantity, department, notes, userId } = params;

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

    if (rpcError) {
      throw new Error(rpcError.message || 'Gagal membuat transaksi');
    }

    return rpcData;
  },

  /**
   * Delete transaction and revert stock atomically using Supabase RPC
   */
  async deleteTransaction(transaction: Transaction) {
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'delete_transaction_and_revert_stock',
      {
        p_transaction_id: transaction.id
      }
    );

    if (rpcError) {
      throw new Error(rpcError.message || 'Gagal menghapus transaksi');
    }

    return rpcData;
  }
};
