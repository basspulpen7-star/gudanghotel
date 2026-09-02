import { createClient } from '@supabase/supabase-js';

const WAREHOUSE_URL = 'https://qdsieavuhgvxrqtaytlt.supabase.co';
const WAREHOUSE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkc2llYXZ1aGd2eHJxdGF5dGx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTM2NjAsImV4cCI6MjA5MDA4OTY2MH0.XFKs74H9-KsMI_3ZkvnfhovBKtjNftwmzZ9Iuv-BLUI';

const warehouseClient = createClient(WAREHOUSE_URL, WAREHOUSE_KEY);

async function checkRpc() {
  const { data: user } = await warehouseClient.auth.getUser();
  console.log('Current Auth User:', user);

  // Try checking tables and RPC
  const { data: stats, error: statsErr } = await warehouseClient.rpc('get_database_storage_stats');
  console.log('get_database_storage_stats:', { stats, statsErr });
}

checkRpc().catch(console.error);
