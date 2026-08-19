import { supabase } from '../lib/supabase';
import { inventoryService } from './inventoryService';
import { requestService } from './requestService';
import { purchaseOrderService } from './purchaseOrderService';

export const backupService = {
  // Download full snapshot backup as JSON
  async exportFullBackupJson(): Promise<void> {
    try {
      const [items, suppliersRes, transactionsRes, requests, pos] = await Promise.all([
        inventoryService.getCachedItems(true),
        supabase.from('suppliers').select('*').order('name'),
        supabase.from('transactions').select('*').order('created_at', { ascending: false }).limit(2000),
        requestService.getRequests(true),
        purchaseOrderService.getPurchaseOrders(true)
      ]);

      const backupData = {
        metadata: {
          app: 'Gudang Alia - Hotel Alia Matraman',
          version: '1.0.0',
          exported_at: new Date().toISOString(),
          total_items: items?.length || 0,
          total_suppliers: suppliersRes.data?.length || 0,
          total_transactions: transactionsRes.data?.length || 0,
          total_requests: requests?.length || 0,
          total_purchase_orders: pos?.length || 0
        },
        data: {
          items: items || [],
          suppliers: suppliersRes.data || [],
          transactions: transactionsRes.data || [],
          requests: requests || [],
          purchase_orders: pos || []
        }
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `backup-gudang-alia-${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Backup JSON export error:', error);
      throw new Error(error.message || 'Gagal mengekspor data backup JSON');
    }
  },

  // Export current inventory items as CSV
  async exportItemsCsv(): Promise<void> {
    try {
      const items = await inventoryService.getCachedItems(true);
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
