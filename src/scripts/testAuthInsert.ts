import { createClient } from '@supabase/supabase-js';

const WAREHOUSE_URL = 'https://qdsieavuhgvxrqtaytlt.supabase.co';
const WAREHOUSE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkc2llYXZ1aGd2eHJxdGF5dGx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTM2NjAsImV4cCI6MjA5MDA4OTY2MH0.XFKs74H9-KsMI_3ZkvnfhovBKtjNftwmzZ9Iuv-BLUI';

const warehouseClient = createClient(WAREHOUSE_URL, WAREHOUSE_KEY);

async function testAuthInsert() {
  // Try logging in with admin user if exists, or sign up temp user
  const { data: signInData, error: signInErr } = await warehouseClient.auth.signInWithPassword({
    email: 'admin@gudang.com',
    password: 'password123'
  });
  console.log('SignIn:', { user: signInData?.user?.id, err: signInErr?.message });

  if (signInData?.user) {
    const { data: insData, error: insErr } = await warehouseClient.from('linen_clean_items').upsert([{
      item_name: 'Test Item',
      quantity: 10,
      firebase_id: 'test'
    }]).select();
    console.log('Authenticated Insert:', { insData, insErr });
  }
}

testAuthInsert().catch(console.error);
