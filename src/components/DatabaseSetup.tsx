import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Database, AlertTriangle, CheckCircle2, Copy, Terminal } from 'lucide-react';

export function DatabaseSetup() {
  const [status, setStatus] = useState<{ table: string; exists: boolean; columns: string[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const sqlSetup = `-- 1. Table Profiles (Untuk Manajemen User)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  username TEXT UNIQUE,
  email TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'staff',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Table Suppliers (Update dengan category dan user_id)
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  address TEXT,
  category TEXT,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Table Items (Inventory)
CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT UNIQUE,
  category TEXT,
  unit TEXT,
  min_stock INTEGER DEFAULT 0,
  current_stock INTEGER DEFAULT 0,
  price DECIMAL(12,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Table Transactions (Incoming/Outgoing)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY,
  item_id UUID REFERENCES items(id),
  type TEXT CHECK (type IN ('in', 'out')),
  quantity INTEGER NOT NULL,
  notes TEXT,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Table Purchase Orders
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY,
  supplier_id UUID REFERENCES suppliers(id),
  user_id UUID REFERENCES auth.users(id),
  total_amount DECIMAL(15,2),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Table Purchase Order Items
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY,
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id),
  quantity INTEGER NOT NULL,
  price DECIMAL(12,2) NOT NULL
);

-- Enable RLS (Optional but recommended)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first to avoid "already exists" errors
DROP POLICY IF EXISTS "Allow all for authenticated" ON profiles;
DROP POLICY IF EXISTS "Allow all for authenticated" ON suppliers;
DROP POLICY IF EXISTS "Allow all for authenticated" ON items;
DROP POLICY IF EXISTS "Allow all for authenticated" ON transactions;
DROP POLICY IF EXISTS "Allow all for authenticated" ON purchase_orders;
DROP POLICY IF EXISTS "Allow all for authenticated" ON purchase_order_items;

-- Simple Policies (Allow all authenticated users for now to ensure app works)
CREATE POLICY "Allow all for authenticated" ON profiles FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON suppliers FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON items FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON transactions FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON purchase_orders FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON purchase_order_items FOR ALL TO authenticated USING (true);`;

  useEffect(() => {
    checkTables();
  }, []);

  const checkTables = async () => {
    setLoading(true);
    const tables = [
      { name: 'profiles', cols: ['username', 'role'] },
      { name: 'suppliers', cols: ['category', 'user_id'] },
      { name: 'items', cols: ['sku', 'current_stock'] },
      { name: 'transactions', cols: ['type', 'quantity'] },
      { name: 'purchase_orders', cols: ['status', 'total_amount'] },
      { name: 'purchase_order_items', cols: ['purchase_order_id', 'item_id'] }
    ];

    const results = await Promise.all(tables.map(async (t) => {
      try {
        const { error } = await supabase.from(t.name).select(t.cols.join(',')).limit(1);
        if (error) {
          if (error.message.includes('does not exist')) {
            return { table: t.name, exists: false, columns: [] };
          }
          // Check for missing columns
          const missing = t.cols.filter(c => error.message.includes(`column "${c}" does not exist`));
          return { table: t.name, exists: true, columns: missing };
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
    <div className="space-y-6 animate-in fade-in duration-500 p-4 md:p-0">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-white">Database Setup</h2>
          <p className="text-brand-text-muted">Pastikan struktur database Supabase Anda sudah benar</p>
        </div>
        <button 
          onClick={checkTables}
          className="bg-brand-card hover:bg-brand-dark text-white px-4 py-2 rounded-lg border border-brand-border transition-all"
        >
          Refresh Status
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-brand-accent" />
            Status Tabel
          </h3>
          
          <div className="space-y-3">
            {loading ? (
              <div className="text-brand-text-muted">Mengecek database...</div>
            ) : status.map((s) => (
              <div key={s.table} className="bg-brand-card p-4 rounded-xl border border-brand-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {s.exists && s.columns.length === 0 ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-yellow-500" />
                  )}
                  <div>
                    <span className="font-mono font-bold text-white">{s.table}</span>
                    {!s.exists ? (
                      <p className="text-xs text-red-500">Tabel belum ada</p>
                    ) : s.columns.length > 0 ? (
                      <p className="text-xs text-yellow-500">Kolom hilang: {s.columns.join(', ')}</p>
                    ) : (
                      <p className="text-xs text-green-500">Siap digunakan</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Terminal className="w-5 h-5 text-brand-accent" />
              SQL Setup Script
            </h3>
            <button 
              onClick={copyToClipboard}
              className="flex items-center gap-2 text-xs bg-brand-accent/10 text-brand-accent px-3 py-1.5 rounded-lg hover:bg-brand-accent hover:text-white transition-all"
            >
              <Copy className="w-3 h-3" />
              {copied ? 'Tersalin!' : 'Salin SQL'}
            </button>
          </div>
          
          <div className="bg-brand-dark p-4 rounded-xl border border-brand-border h-[400px] overflow-y-auto font-mono text-xs text-brand-text-muted relative">
            <pre className="whitespace-pre-wrap">{sqlSetup}</pre>
          </div>
          
          <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <p className="text-sm text-blue-400">
              <strong>Cara Setup:</strong> Buka <strong>SQL Editor</strong> di dashboard Supabase Anda, tempelkan script di atas, lalu klik <strong>Run</strong>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
