import { supabase } from '../lib/supabase';
import { Transaction } from '../types';
import { inventoryService } from './inventoryService';
import { laundrySyncService } from './laundrySyncService';
import { ITEM_TYPES } from '../constants-linen';

export interface CreateTransactionParams {
  itemId: string;
  type: 'IN' | 'OUT';
  quantity: number;
  department?: string;
  notes?: string;
  userId: string;
  skipSync?: boolean;
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
          min_stock,
          department
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
   * Atomic Transaction + Stock Update using Supabase RPC with fallback
   */
  async createTransaction(params: CreateTransactionParams) {
    const { itemId, type, quantity, department, notes, userId, skipSync } = params;

    let result: { id: string; new_stock?: number } | null = null;

    // 1. Try RPC first for atomic DB operation
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

      if (rpcData) {
        inventoryService.invalidateCache();
        result = rpcData;
      }
    } catch (e: any) {
      if (e.message && !e.message.includes('function') && e.code !== 'PGRST202') {
        throw e;
      }
    }

    // 2. Client-side fallback if RPC is not available
    if (!result) {
      const { data: item, error: itemErr } = await supabase
        .from('items')
        .select('id, current_stock, department, name')
        .eq('id', itemId)
        .single();

      if (itemErr || !item) throw new Error('Barang tidak ditemukan');

      if (type === 'OUT' && item.current_stock < quantity) {
        throw new Error(`Stok tidak mencukupi. Stok tersedia: ${item.current_stock}`);
      }

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

      const newStock = type === 'IN' 
        ? item.current_stock + quantity 
        : item.current_stock - quantity;

      const { error: stockErr } = await supabase
        .from('items')
        .update({ current_stock: Math.max(0, newStock) })
        .eq('id', itemId);

      if (stockErr) throw stockErr;

      inventoryService.invalidateCache();
      result = { id: transId, new_stock: newStock };
    }

    // 3. SYNC ARAH 1: Gudang Alia → Linen
    if (!skipSync && itemId) {
      try {
        const { data: itm } = await supabase
          .from('items')
          .select('id, name, department')
          .eq('id', itemId)
          .maybeSingle();

        const linenName = (itm as any)?.linen_item_name || 
          (itm?.department === 'Laundry' || (itm as any)?.category === 'Laundry' || (itm?.name && ITEM_TYPES.includes(itm.name as any)) ? itm?.name : null);

        if (linenName) {
          await laundrySyncService.syncTransactionToLinen(
            linenName,
            type,
            quantity,
            { skipSync: false, notes: notes || `Transaksi ${type} Gudang Alia` }
          );
        }
      } catch (syncErr) {
        console.warn('[TRANSACTION SERVICE] Linen sync hook error:', syncErr);
      }
    }

    return result;
  },

  /**
   * Delete transaction and revert stock using Supabase RPC with fallback
   */
  async deleteTransaction(transaction: Transaction, options?: { skipSync?: boolean }) {
    if (!transaction || !transaction.id) {
      throw new Error('ID Transaksi tidak valid');
    }

    let rpcSuccess = false;
    let rpcResult: any = null;

    // 1. Try RPC first for server-side atomic operation
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'delete_transaction_and_revert_stock',
        {
          p_transaction_id: String(transaction.id)
        }
      );

      if (!rpcError) {
        rpcSuccess = true;
        rpcResult = rpcData;
        inventoryService.invalidateCache();
      } else {
        console.warn('[TRANSACTION SERVICE] RPC delete_transaction_and_revert_stock error, using client fallback:', rpcError.message);
      }
    } catch (e: any) {
      console.warn('[TRANSACTION SERVICE] RPC exception, using client fallback:', e.message);
    }

    // 2. Client-side fallback if RPC failed or is not available
    if (!rpcSuccess) {
      // Revert item stock first
      if (transaction.item_id) {
        const { data: item } = await supabase
          .from('items')
          .select('id, current_stock')
          .eq('id', transaction.item_id)
          .maybeSingle();

        if (item) {
          const revertedStock = transaction.type === 'IN'
            ? Math.max(0, item.current_stock - transaction.quantity)
            : item.current_stock + transaction.quantity;

          await supabase
            .from('items')
            .update({ current_stock: revertedStock })
            .eq('id', item.id);
        }
      }

      // Delete the transaction row
      const { error: delErr } = await supabase
        .from('transactions')
        .delete()
        .eq('id', transaction.id);

      if (delErr) {
        throw new Error(delErr.message || 'Gagal menghapus transaksi');
      }

      inventoryService.invalidateCache();
    }

    // 3. SYNC ARAH 1 on Delete: Gudang Alia → Linen
    if (!options?.skipSync && transaction.item_id) {
      try {
        const { data: itm } = await supabase
          .from('items')
          .select('id, name, department')
          .eq('id', transaction.item_id)
          .maybeSingle();

        const linenName = (itm as any)?.linen_item_name || 
          (itm?.department === 'Laundry' || (itm as any)?.category === 'Laundry' || (itm?.name && ITEM_TYPES.includes(itm.name as any)) ? itm?.name : null);
        if (linenName) {
          // Revert transaction type in Linen: IN deleted -> OUT in Linen, OUT deleted -> IN in Linen
          const revertedType: 'IN' | 'OUT' = transaction.type === 'IN' ? 'OUT' : 'IN';
          await laundrySyncService.syncTransactionToLinen(
            linenName,
            revertedType,
            transaction.quantity,
            { skipSync: false, isDelete: true, notes: `Revert (hapus transaksi ${transaction.type}) Gudang Alia` }
          );
        }
      } catch (syncErr) {
        console.warn('[TRANSACTION SERVICE] Linen sync on delete error:', syncErr);
      }
    }

    return rpcResult;
  }
};
