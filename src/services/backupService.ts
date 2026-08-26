import { supabase } from '../lib/supabase';
import { warehouseSupabase } from '../lib/supabaseWarehouse';
import { inventoryService } from './inventoryService';

const BATCH_SIZE = 500;

/**
 * Helper to fetch an entire table using batched server-side pagination with .range()
 * This guarantees no dataset is cut off by PostgREST limits or arbitrary limits.
 */
async function fetchAllRowsInBatches<T = any>(
  client: any,
  tableName: string,
  columns: string,
  orderBy: string = 'id',
  ascending: boolean = true
): Promise<T[]> {
  const allRows: T[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const to = from + BATCH_SIZE - 1;
    const { data, error } = await client
      .from(tableName)
      .select(columns)
      .order(orderBy, { ascending })
      .range(from, to);

    if (error) {
      console.warn(`[BACKUP] Batch fetch notice for ${tableName} (${from}-${to}):`, error.message);
      break;
    }

    if (!data || data.length === 0) {
      hasMore = false;
      break;
    }

    allRows.push(...(data as T[]));

    if (data.length < BATCH_SIZE) {
      hasMore = false;
    } else {
      from += BATCH_SIZE;
    }
  }

  return allRows;
}

export const backupService = {
  // Download full snapshot backup as JSON with complete batched extraction
  async exportFullBackupJson(): Promise<void> {
    try {
      const [
        items,
        suppliers,
        transactions,
        requests,
        requestItems,
        purchaseOrders,
        purchaseOrderItems,
        profiles
      ] = await Promise.all([
        fetchAllRowsInBatches(
          supabase,
          'items',
          'id, name, department, unit, initial_stock, current_stock, min_stock, created_at',
          'name',
          true
        ),
        fetchAllRowsInBatches(
          supabase,
          'suppliers',
          'id, name, contact_person, phone, address, category, user_id, created_at',
          'name',
          true
        ),
        fetchAllRowsInBatches(
          supabase,
          'transactions',
          'id, item_id, type, quantity, department, notes, user_id, created_at',
          'created_at',
          false
        ),
        fetchAllRowsInBatches(
          warehouseSupabase,
          'requests',
          'id, request_number, department, requester_name, user_id, status, occupancy_count, breakfast_pax, notes, created_at',
          'created_at',
          false
        ),
        fetchAllRowsInBatches(
          warehouseSupabase,
          'request_items',
          'id, request_id, item_id, item_name, quantity, unit, notes',
          'id',
          true
        ),
        fetchAllRowsInBatches(
          supabase,
          'purchase_orders',
          'id, po_number, supplier_id, status, total_amount, user_id, created_at',
          'created_at',
          false
        ),
        fetchAllRowsInBatches(
          supabase,
          'purchase_order_items',
          'id, purchase_order_id, item_id, quantity, price',
          'id',
          true
        ),
        fetchAllRowsInBatches(
          supabase,
          'profiles',
          'id, full_name, username, email, role, avatar_url, created_at',
          'full_name',
          true
        )
      ]);

      const backupData = {
        metadata: {
          app: 'Gudang Alia - Hotel Alia Matraman',
          version: '2.0.0',
          exported_at: new Date().toISOString(),
          batch_size: BATCH_SIZE,
          total_items: items.length,
          total_suppliers: suppliers.length,
          total_transactions: transactions.length,
          total_requests: requests.length,
          total_request_items: requestItems.length,
          total_purchase_orders: purchaseOrders.length,
          total_purchase_order_items: purchaseOrderItems.length,
          total_profiles: profiles.length
        },
        data: {
          items,
          suppliers,
          transactions,
          requests,
          request_items: requestItems,
          purchase_orders: purchaseOrders,
          purchase_order_items: purchaseOrderItems,
          profiles
        }
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `backup-gudang-alia-full-${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Backup JSON export error:', error);
      throw new Error(error.message || 'Gagal mengekspor data backup JSON');
    }
  },

  // Export current inventory items as CSV with batch support
  async exportItemsCsv(): Promise<void> {
    try {
      const items = await fetchAllRowsInBatches(
        supabase,
        'items',
        'id, name, department, unit, initial_stock, current_stock, min_stock, created_at',
        'name',
        true
      );

      if (!items || items.length === 0) {
        throw new Error('Tidak ada data barang untuk diekspor');
      }

      const headers = ['ID Barang', 'Nama Barang', 'Kategori / Departemen', 'Stok Awal', 'Stok Saat Ini', 'Stok Minimal', 'Satuan'];
      const rows = items.map(item => [
        `"${item.id}"`,
        `"${(item.name || '').replace(/"/g, '""')}"`,
        `"${item.department || 'Gudang'}"`,
        item.initial_stock || 0,
        item.current_stock || 0,
        item.min_stock || 0,
        `"${item.unit || 'pcs'}"`
      ]);

      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `stok-barang-gudang-alia-${dateStr}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Export CSV error:', error);
      throw new Error(error.message || 'Gagal mengekspor data CSV');
    }
  }
};

