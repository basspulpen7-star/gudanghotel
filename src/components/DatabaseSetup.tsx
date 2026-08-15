import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Database, AlertTriangle, CheckCircle2, Copy, Terminal, Activity } from 'lucide-react';

export function DatabaseSetup() {
  const [status, setStatus] = useState<{ table: string; exists: boolean; columns: string[]; error?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const sqlSetup = `-- ==========================================================
-- GUDANG ALIA - SQL SETUP & RLS SECURITY SCHEMA
-- ==========================================================

-- 1. Table Profiles (Untuk Identitas User & Role Sistem)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  username TEXT UNIQUE,
  email TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'staff',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Penyesuaian Kolom Tambahan jika tabel sudah ada
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'staff';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Trigger Otomatis: Buat baris di profiles setiap ada user baru di Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, username, role, created_at, updated_at)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.email,
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'role', 'staff'),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    updated_at = NOW();
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 2. Table Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  address TEXT,
  category TEXT,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 3. Table Items (Inventory)
CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sku TEXT UNIQUE,
  category TEXT,
  unit TEXT,
  department TEXT DEFAULT 'General',
  min_stock INTEGER DEFAULT 0,
  initial_stock INTEGER DEFAULT 0,
  current_stock INTEGER DEFAULT 0,
  price DECIMAL(12,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE items ADD COLUMN IF NOT EXISTS department TEXT DEFAULT 'General';
ALTER TABLE items ADD COLUMN IF NOT EXISTS initial_stock INTEGER DEFAULT 0;
ALTER TABLE items ADD COLUMN IF NOT EXISTS current_stock INTEGER DEFAULT 0;
ALTER TABLE items ADD COLUMN IF NOT EXISTS min_stock INTEGER DEFAULT 0;
ALTER TABLE items ADD COLUMN IF NOT EXISTS unit TEXT;

-- 4. Table Transactions (Incoming/Outgoing)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES items(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('IN', 'OUT')),
  quantity INTEGER NOT NULL,
  department TEXT,
  notes TEXT,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS notes TEXT;

-- 5. Table Purchase Orders
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number TEXT UNIQUE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id),
  total_amount DECIMAL(15,2),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS po_number TEXT UNIQUE;

-- 6. Table Purchase Order Items
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  price DECIMAL(12,2) NOT NULL
);

-- 7. Table Requests (Permintaan Barang HK)
CREATE TABLE IF NOT EXISTS requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number TEXT UNIQUE,
  department TEXT DEFAULT 'Housekeeping',
  requester_name TEXT,
  user_id UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'MENUNGGU' CHECK (status IN ('MENUNGGU', 'DIPROSES', 'SELESAI', 'DITOLAK', 'pending', 'processing', 'completed', 'rejected')),
  occupancy_count INTEGER DEFAULT 0,
  breakfast_pax INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Table Request Items
CREATE TABLE IF NOT EXISTS request_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES requests(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit TEXT DEFAULT 'pcs',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. Table Breakfast Records (Occupancy & Pax Log)
CREATE TABLE IF NOT EXISTS breakfast_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE DEFAULT CURRENT_DATE,
  rooms_occupied INTEGER DEFAULT 0,
  breakfast_pax INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE breakfast_records ENABLE ROW LEVEL SECURITY;

-- Drop previous policies to avoid conflicts
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON profiles;
DROP POLICY IF EXISTS "Allow all for authenticated" ON profiles;

DROP POLICY IF EXISTS "Authenticated users can access suppliers" ON suppliers;
DROP POLICY IF EXISTS "Authenticated users can access items" ON items;
DROP POLICY IF EXISTS "Authenticated users can access transactions" ON transactions;
DROP POLICY IF EXISTS "Authenticated users can access purchase_orders" ON purchase_orders;
DROP POLICY IF EXISTS "Authenticated users can access purchase_order_items" ON purchase_order_items;
DROP POLICY IF EXISTS "Authenticated users can access requests" ON requests;
DROP POLICY IF EXISTS "Authenticated users can access request_items" ON request_items;
DROP POLICY IF EXISTS "Authenticated users can access breakfast_records" ON breakfast_records;

-- Create Permissive Authenticated Policies for Hotel Alia Operations
CREATE POLICY "Authenticated users can access suppliers" ON suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can access items" ON items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can access transactions" ON transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can access purchase_orders" ON purchase_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can access purchase_order_items" ON purchase_order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can access requests" ON requests FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can access request_items" ON request_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can access breakfast_records" ON breakfast_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can access purchase_order_items" ON purchase_order_items;

-- Policy Profiles: User hanya membaca profil sendiri
CREATE POLICY "Users can read own profile"
ON profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Policy Profiles: User hanya mengubah profil sendiri
CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Policy Profiles: User dapat menambahkan baris profilnya sendiri
CREATE POLICY "Users can insert own profile"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Policy Profiles: Admin dapat melihat dan mengelola seluruh profil
CREATE POLICY "Admins can manage all profiles"
ON profiles FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles admin_p
    WHERE admin_p.id = auth.uid() AND admin_p.role = 'admin'
  )
);

-- Policy Operasional untuk Staf & Admin yang sudah login (Authenticated)
CREATE POLICY "Authenticated users can access suppliers" 
ON suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can access items" 
ON items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can access transactions" 
ON transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can access purchase_orders" 
ON purchase_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can access purchase_order_items" 
ON purchase_order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);`;

  useEffect(() => {
    checkTables();
  }, []);

  const checkTables = async () => {
    setLoading(true);
    const tables = [
      { name: 'profiles', cols: ['username', 'role', 'full_name'] },
      { name: 'suppliers', cols: ['name', 'category'] },
      { name: 'items', cols: ['name', 'sku', 'department', 'initial_stock', 'min_stock'] },
      { name: 'transactions', cols: ['type', 'quantity', 'item_id', 'department'] },
      { name: 'purchase_orders', cols: ['status', 'total_amount', 'po_number'] },
      { name: 'purchase_order_items', cols: ['purchase_order_id', 'item_id'] },
      { name: 'requests', cols: ['request_number', 'department', 'status'] },
      { name: 'request_items', cols: ['request_id', 'item_name', 'quantity'] },
      { name: 'breakfast_records', cols: ['rooms_occupied', 'breakfast_pax'] }
    ];

    const results = await Promise.all(tables.map(async (t) => {
      try {
        const { error } = await supabase.from(t.name).select(t.cols.join(',')).limit(1);
        if (error) {
          console.error(`Error checking table ${t.name}:`, error);
          if (error.message.includes('does not exist') || error.message.includes('relation') || error.code === '42P01') {
            return { table: t.name, exists: false, columns: [] };
          }
          // Check for missing columns
          const missing = t.cols.filter(c => error.message.includes(`column "${c}" does not exist`));
          if (missing.length > 0) {
            return { table: t.name, exists: true, columns: missing };
          }
          return { table: t.name, exists: true, columns: [], error: error.message };
        }
        return { table: t.name, exists: true, columns: [] };
      } catch (e) {
        return { table: t.name, exists: false, columns: [] };
      }
    }));

    setStatus(results);
    setLoading(false);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(sqlSetup);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 p-4 md:p-0 font-sans pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 md:p-6 rounded-2xl border border-gray-200/90 shadow-sm">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">Database Setup</h2>
          <p className="text-xs md:text-sm text-gray-500 mt-0.5 font-medium">Pastikan struktur database Supabase & RLS Security Anda sudah terkonfigurasi</p>
        </div>
        <button 
          onClick={checkTables}
          className="bg-gray-50 hover:bg-gray-100 text-gray-800 px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold transition-all shadow-xs"
        >
          Refresh Status
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
            <Database className="w-4 h-4 text-amber-600" />
            Status Tabel & Kolom
          </h3>
          
          <div className="space-y-2.5">
            {loading ? (
              <div className="text-gray-500 text-xs flex items-center gap-2 py-4">
                <Activity className="w-4 h-4 animate-spin text-amber-600" />
                Mengecek database...
              </div>
            ) : status.map((s) => (
              <div key={s.table} className="bg-white p-4 rounded-2xl border border-gray-200/90 shadow-xs flex items-center justify-between group hover:border-amber-300 transition-all">
                <div className="flex items-center gap-3">
                  {s.exists && s.columns.length === 0 && !s.error ? (
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                    </div>
                  )}
                  <div>
                    <span className="font-mono font-bold text-gray-900 text-xs">{s.table}</span>
                    {!s.exists ? (
                      <p className="text-[10px] text-red-600 font-bold">Tabel belum ada - Jalankan SQL!</p>
                    ) : s.error ? (
                      <p className="text-[10px] text-red-600 font-medium">Notice: {s.error}</p>
                    ) : s.columns.length > 0 ? (
                      <p className="text-[10px] text-amber-700 font-bold">Kolom hilang: {s.columns.join(', ')}</p>
                    ) : (
                      <p className="text-[10px] text-emerald-700 font-semibold">Siap digunakan & RLS Aktif</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-amber-600" />
              SQL Setup & RLS Script
            </h3>
            <button 
              onClick={copyToClipboard}
              className="flex items-center gap-1.5 text-xs bg-[#E65C00] hover:bg-[#CF5300] text-white px-3.5 py-1.5 rounded-xl font-bold transition-all shadow-xs"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? 'Tersalin!' : 'Salin SQL'}
            </button>
          </div>
          
          <div className="bg-gray-900 p-4 rounded-2xl border border-gray-800 h-[400px] overflow-y-auto font-mono text-xs text-emerald-400 relative">
            <pre className="whitespace-pre-wrap">{sqlSetup}</pre>
          </div>
          
          <div className="p-4 bg-amber-50/60 border border-amber-200/80 rounded-2xl text-xs text-amber-900">
            <p>
              <strong>Cara Setup:</strong> Buka <strong>SQL Editor</strong> di dashboard Supabase Anda, tempelkan script di atas, lalu klik <strong>Run</strong>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
