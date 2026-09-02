import { createClient } from '@supabase/supabase-js';
import { warehouseSupabase } from '../lib/supabaseWarehouse';

// Kredensial Proyek Linen Lama (yjmjlxscvwnkoewvielo)
const OLD_LINEN_URL = 'https://yjmjlxscvwnkoewvielo.supabase.co';
const OLD_LINEN_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqbWpseHNjdndua29ld3ZpZWxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNDQyMzQsImV4cCI6MjEwMjYyMDIzNH0.cg89EWUR9FwV_FNyFf6q4giZKCgeZ7JxI3_upItFBZk';

const oldLinenClient = createClient(OLD_LINEN_URL, OLD_LINEN_KEY);

export const migrateLinenData = async (onProgress: (msg: string) => void) => {
  const tables = [
    { old: 'room_items', new: 'linen_room_items' },
    { old: 'clean_items', new: 'linen_clean_items' },
    { old: 'new_items', new: 'linen_new_items' },
    { old: 'new_item_transactions', new: 'linen_new_item_transactions' },
    { old: 'incoming_items', new: 'linen_incoming_items' },
    { old: 'outgoing_items', new: 'linen_outgoing_items' },
  ];

  console.log('[MIGRATION] Starting migrateLinenData...');
  onProgress('Memulai migrasi data linen...');

  try {
    for (const table of tables) {
      console.log(`[MIGRATION] Processing table: ${table.old}`);
      onProgress(`Mengambil data dari ${table.old}...`);
      
      const { data: oldData, error: fetchError } = await oldLinenClient
        .from(table.old)
        .select('*');

      if (fetchError) {
        throw new Error(`Gagal mengambil data ${table.old}: ${fetchError.message}`);
      }

      if (oldData && oldData.length > 0) {
        onProgress(`Memindahkan ${oldData.length} baris ke ${table.new}...`);
        
        // Pastikan firebase_id disertakan agar sesuai dengan schema warehouse
        const dataToInsert = oldData.map(row => {
          const newRow = { ...row, firebase_id: 'local-dev' };
          
          // Bersihkan kolom UUID (uid, id) dari nilai non-UUID seperti "anonymous"
          ['uid', 'id'].forEach(col => {
            if (newRow[col] === 'anonymous' || (newRow[col] && typeof newRow[col] === 'string' && newRow[col].length < 30)) {
              newRow[col] = undefined; // Biarkan database men-generate UUID baru jika tidak valid
            }
          });
          
          return newRow;
        });

        // Gunakan upsert untuk mencegah duplikasi jika dijalankan ulang
        const { error: insertError } = await warehouseSupabase
          .from(table.new)
          .upsert(dataToInsert);

        if (insertError) {
          throw new Error(`Gagal memasukkan data ke ${table.new}: ${insertError.message}`);
        }
        
        onProgress(`Berhasil memindahkan ${table.old}.`);
      } else {
        onProgress(`Tabel ${table.old} kosong, melewati...`);
      }
    }
  } catch (err: any) {
    onProgress(`Kesalahan: ${err.message}`);
    throw err;
  }

  onProgress('Migrasi selesai dengan sukses!');
};
