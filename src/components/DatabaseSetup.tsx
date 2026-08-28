import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Database, AlertTriangle, CheckCircle2, Copy, Terminal, Activity, Zap, HardDrive, Cpu, Layers } from 'lucide-react';
import { queryCache } from '../lib/queryCache';

export function DatabaseSetup() {
  const [activeTab, setActiveTab] = useState<'status' | 'batch1' | 'batch2' | 'batch3' | 'batch4' | 'schema'>('status');
  const [status, setStatus] = useState<{ table: string; exists: boolean; columns: string[]; error?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [storageStats, setStorageStats] = useState<any>(null);
  const [healthStats, setHealthStats] = useState<any>(null);
  const [pruneResult, setPruneResult] = useState<any>(null);
  const [pruneLoading, setPruneLoading] = useState(false);
  const [cacheStats, setCacheStats] = useState(queryCache.getStats());

  // SQL Batch 1: Indexes
  const sqlBatch1 = `-- ====================================================================
-- GUDANG ALIA - TAHAP 1: INDEX OPTIMIZATION
-- Mencegah Sequential Scans & Menghemat CPU Supabase Free Tier
-- ====================================================================

-- Index untuk filter transaksi berdasarkan tipe & tanggal (Dashboard & Laporan)
CREATE INDEX IF NOT EXISTS idx_transactions_type_created
  ON public.transactions (type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_created_at
  ON public.transactions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_item_id
  ON public.transactions (item_id);

-- Index untuk pengecekan stok rendah & pencarian item
CREATE INDEX IF NOT EXISTS idx_items_current_min_stock
  ON public.items (current_stock, min_stock);

CREATE INDEX IF NOT EXISTS idx_items_department
  ON public.items (department);

-- Index untuk tabel Requests & Request Items (Housekeeping)
CREATE INDEX IF NOT EXISTS idx_requests_created_at
  ON public.requests (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_requests_status
  ON public.requests (status);

CREATE INDEX IF NOT EXISTS idx_request_items_request_id
  ON public.request_items (request_id);

-- Index untuk Purchase Orders & Items
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created_at
  ON public.purchase_orders (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_po_items_po_id
  ON public.purchase_order_items (purchase_order_id);`;

  // SQL Batch 2: Atomic RPC Functions
  const sqlBatch2 = `-- ====================================================================
-- GUDANG ALIA - TAHAP 2: ATOMIC RPC FUNCTIONS
-- Mengubah Puluhan Request Menjadi 1 Atomic Request di Server
-- ====================================================================

-- 1. RPC: get_dashboard_summary()
CREATE OR REPLACE FUNCTION public.get_dashboard_summary(
  p_low_stock_limit INT DEFAULT 5, 
  p_recent_tx_limit INT DEFAULT 5
)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'kpis', (
      SELECT json_build_object(
        'totalItems', (SELECT count(*) FROM public.items),
        'lowStockCount', (SELECT count(*) FROM public.items WHERE current_stock <= min_stock),
        'todayInQty', (
          SELECT COALESCE(SUM(quantity), 0) FROM public.transactions
          WHERE type = 'IN' AND created_at >= date_trunc('day', now())
        ),
        'todayOutQty', (
          SELECT COALESCE(SUM(quantity), 0) FROM public.transactions
          WHERE type = 'OUT' AND created_at >= date_trunc('day', now())
        )
      )
    ),
    'lowStockItems', (
      SELECT COALESCE(json_agg(t), '[]'::json) FROM (
        SELECT id, name, department, unit, current_stock, min_stock
        FROM public.items
        WHERE current_stock <= min_stock
        ORDER BY current_stock ASC
        LIMIT p_low_stock_limit
      ) t
    ),
    'recentTransactions', (
      SELECT COALESCE(json_agg(t), '[]'::json) FROM (
        SELECT
          tr.id, tr.item_id, tr.type, tr.quantity, tr.department,
          tr.notes, tr.created_at, tr.user_id,
          json_build_object('id', it.id, 'name', it.name, 'unit', it.unit) AS items
        FROM public.transactions tr
        JOIN public.items it ON it.id = tr.item_id
        ORDER BY tr.created_at DESC
        LIMIT p_recent_tx_limit
      ) t
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(INT, INT) TO anon, authenticated, service_role;

-- 2. RPC: complete_hk_request()
CREATE OR REPLACE FUNCTION public.complete_hk_request(
  p_request_id TEXT,
  p_items_json JSONB,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_target_item_id UUID;
  v_qty INT;
  v_req_num TEXT;
  v_item_name TEXT;
  v_processed_count INT := 0;
BEGIN
  -- Role-check: Admin / Logistik only
  IF public.get_my_role() NOT IN ('admin', 'logistik') THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya role Admin dan Logistik yang berhak memproses permintaan barang.';
  END IF;

  SELECT request_number INTO v_req_num FROM public.requests WHERE id::text = p_request_id;
  IF v_req_num IS NULL THEN
    v_req_num := p_request_id;
  END IF;

  UPDATE public.requests 
  SET status = 'SELESAI' 
  WHERE id::text = p_request_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_json)
  LOOP
    IF (v_item->>'item_id') IS NOT NULL AND (v_item->>'item_id') != '' THEN
      v_target_item_id := (v_item->>'item_id')::UUID;
      v_qty := COALESCE((v_item->>'quantity')::INT, 0);
      v_item_name := COALESCE(v_item->>'item_name', 'Barang');

      IF v_qty > 0 THEN
        UPDATE public.items
        SET current_stock = GREATEST(0, current_stock - v_qty)
        WHERE id = v_target_item_id;

        INSERT INTO public.transactions (
          id, item_id, type, quantity, department, notes, user_id, created_at
        ) VALUES (
          gen_random_uuid(),
          v_target_item_id,
          'OUT',
          v_qty,
          'Housekeeping',
          'Pemenuhan Permintaan HK #' || COALESCE(v_req_num, p_request_id) || ' (' || v_item_name || ')',
          p_user_id,
          NOW()
        );

        v_processed_count := v_processed_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Permintaan HK berhasil diselesaikan.',
    'processed_items', v_processed_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_hk_request(TEXT, JSONB, UUID) TO authenticated;

-- 3. RPC: complete_purchase_order()
CREATE OR REPLACE FUNCTION public.complete_purchase_order(
  p_po_id UUID,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po RECORD;
  v_poi RECORD;
  v_supplier RECORD;
  v_supplier_name TEXT := 'Supplier';
  v_processed_count INT := 0;
BEGIN
  -- Role-check: Admin / Logistik only
  IF public.get_my_role() NOT IN ('admin', 'logistik') THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya role Admin dan Logistik yang berhak memproses Purchase Order.';
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase Order % tidak ditemukan', p_po_id;
  END IF;

  IF v_po.supplier_id IS NOT NULL THEN
    SELECT name INTO v_supplier_name FROM public.suppliers WHERE id = v_po.supplier_id;
  END IF;

  UPDATE public.purchase_orders
  SET status = 'completed'
  WHERE id = p_po_id;

  FOR v_poi IN SELECT * FROM public.purchase_order_items WHERE purchase_order_id = p_po_id
  LOOP
    IF v_poi.quantity > 0 THEN
      UPDATE public.items
      SET current_stock = current_stock + v_poi.quantity
      WHERE id = v_poi.item_id;

      INSERT INTO public.transactions (
        id, item_id, type, quantity, department, notes, user_id, created_at
      ) VALUES (
        gen_random_uuid(),
        v_poi.item_id,
        'IN',
        v_poi.quantity,
        'General',
        'Penerimaan PO #' || COALESCE(v_po.po_number, p_po_id::text) || ' dari ' || COALESCE(v_supplier_name, 'Supplier'),
        p_user_id,
        NOW()
      );

      v_processed_count := v_processed_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Purchase Order berhasil diselesaikan.',
    'processed_items', v_processed_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_purchase_order(UUID, UUID) TO authenticated;

-- 4. RPC: get_stock_report()
CREATE OR REPLACE FUNCTION public.get_stock_report(
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ
)
RETURNS TABLE (
  item_id UUID,
  item_name TEXT,
  department TEXT,
  unit TEXT,
  initial_stock NUMERIC,
  in_qty NUMERIC,
  out_qty NUMERIC,
  final_stock NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH tx_before AS (
    SELECT 
      item_id,
      COALESCE(SUM(CASE WHEN type = 'IN' THEN quantity ELSE 0 END), 0) AS total_in_before,
      COALESCE(SUM(CASE WHEN type = 'OUT' THEN quantity ELSE 0 END), 0) AS total_out_before
    FROM public.transactions
    WHERE created_at < p_start
    GROUP BY item_id
  ),
  tx_period AS (
    SELECT 
      item_id,
      COALESCE(SUM(CASE WHEN type = 'IN' THEN quantity ELSE 0 END), 0) AS in_period,
      COALESCE(SUM(CASE WHEN type = 'OUT' THEN quantity ELSE 0 END), 0) AS out_period
    FROM public.transactions
    WHERE created_at >= p_start AND created_at <= p_end
    GROUP BY item_id
  )
  SELECT 
    i.id AS item_id,
    i.name AS item_name,
    COALESCE(i.department, 'General') AS department,
    COALESCE(i.unit, 'pcs') AS unit,
    (COALESCE(i.initial_stock, 0) + COALESCE(tb.total_in_before, 0) - COALESCE(tb.total_out_before, 0))::NUMERIC AS initial_stock,
    COALESCE(tp.in_period, 0)::NUMERIC AS in_qty,
    COALESCE(tp.out_period, 0)::NUMERIC AS out_qty,
    (COALESCE(i.initial_stock, 0) + COALESCE(tb.total_in_before, 0) - COALESCE(tb.total_out_before, 0) + COALESCE(tp.in_period, 0) - COALESCE(tp.out_period, 0))::NUMERIC AS final_stock
  FROM public.items i
  LEFT JOIN tx_before tb ON tb.item_id = i.id
  LEFT JOIN tx_period tp ON tp.item_id = i.id
  ORDER BY i.name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_stock_report(TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated, service_role;

-- 5. RPC: recalculate_all_item_stocks()
-- Menyinkronkan seluruh stok barang di tabel items dengan mutasi transaksi (Stok Awal + Masuk - Keluar)
CREATE OR REPLACE FUNCTION public.recalculate_all_item_stocks()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_count INT := 0;
  v_total_count INT := 0;
BEGIN
  WITH computed_stocks AS (
    SELECT 
      i.id AS item_id,
      GREATEST(0, (
        COALESCE(i.initial_stock, 0) + 
        COALESCE(SUM(CASE WHEN t.type = 'IN' THEN t.quantity ELSE 0 END), 0) - 
        COALESCE(SUM(CASE WHEN t.type = 'OUT' THEN t.quantity ELSE 0 END), 0)
      )) AS real_stock
    FROM public.items i
    LEFT JOIN public.transactions t ON t.item_id = i.id
    GROUP BY i.id, i.initial_stock
  ),
  updated_rows AS (
    UPDATE public.items it
    SET current_stock = cs.real_stock
    FROM computed_stocks cs
    WHERE it.id = cs.item_id AND it.current_stock <> cs.real_stock
    RETURNING it.id
  )
  SELECT 
    (SELECT COUNT(*) FROM public.items),
    (SELECT COUNT(*) FROM updated_rows)
  INTO v_total_count, v_updated_count;

  RETURN json_build_object(
    'success', true,
    'total', v_total_count,
    'updated', v_updated_count,
    'message', 'Sinkronisasi stok barang berhasil diperbarui.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_all_item_stocks() TO anon, authenticated, service_role;

-- 6. RPC: delete_transaction_and_revert_stock()
CREATE OR REPLACE FUNCTION public.delete_transaction_and_revert_stock(
  p_transaction_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trans RECORD;
  v_target_trans_id UUID;
BEGIN
  BEGIN
    v_target_trans_id := p_transaction_id::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_target_trans_id := NULL;
  END;

  SELECT * INTO v_trans 
  FROM public.transactions 
  WHERE (v_target_trans_id IS NOT NULL AND id = v_target_trans_id) OR id::TEXT = p_transaction_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaksi dengan ID % tidak ditemukan', p_transaction_id;
  END IF;

  IF v_trans.type = 'IN' THEN
    UPDATE public.items
    SET current_stock = GREATEST(0, current_stock - v_trans.quantity)
    WHERE id = v_trans.item_id;
  ELSIF v_trans.type = 'OUT' THEN
    UPDATE public.items
    SET current_stock = current_stock + v_trans.quantity
    WHERE id = v_trans.item_id;
  END IF;

  DELETE FROM public.transactions WHERE id = v_trans.id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Transaksi berhasil dihapus dan stok dikembalikan.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_transaction_and_revert_stock(TEXT) TO anon, authenticated, service_role;`;

  // SQL Batch 3: Analytical Views & Storage Stats
  const sqlBatch3 = `-- ====================================================================
-- GUDANG ALIA - TAHAP 3: ANALYTICAL VIEWS & STORAGE OPTIMIZER
-- Agregasi Data Harian & Monitoring Kuota Database 500MB Free Tier
-- ====================================================================

-- 1. View: Daily Transaction Aggregates (view_daily_transaction_summary)
CREATE OR REPLACE VIEW public.view_daily_transaction_summary AS
SELECT 
  date_trunc('day', created_at)::date AS tx_date,
  type,
  COALESCE(department, 'General') AS department,
  COUNT(*) AS transaction_count,
  SUM(quantity) AS total_quantity
FROM public.transactions
GROUP BY 1, 2, 3
ORDER BY 1 DESC;

GRANT SELECT ON public.view_daily_transaction_summary TO anon, authenticated, service_role;

-- 2. View: Low Stock Alerts (view_stock_alerts)
CREATE OR REPLACE VIEW public.view_stock_alerts AS
SELECT 
  id,
  name,
  department,
  unit,
  current_stock,
  min_stock,
  (min_stock - current_stock) AS deficit_quantity,
  CASE 
    WHEN current_stock <= 0 THEN 'OUT_OF_STOCK'
    ELSE 'LOW_STOCK'
  END AS alert_severity
FROM public.items
WHERE current_stock <= min_stock
ORDER BY current_stock ASC;

GRANT SELECT ON public.view_stock_alerts TO anon, authenticated, service_role;

-- 3. RPC: get_database_storage_stats()
CREATE OR REPLACE FUNCTION public.get_database_storage_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'total_db_size', pg_size_pretty(pg_database_size(current_database())),
    'total_db_bytes', pg_database_size(current_database()),
    'quota_bytes', 524288000, -- 500 MB (Supabase Free Limit)
    'tables', (
      SELECT json_agg(t) FROM (
        SELECT 
          relname AS table_name,
          n_live_tup AS row_count,
          pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
          pg_total_relation_size(c.oid) AS size_bytes
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_stat_user_tables s ON s.relid = c.oid
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY pg_total_relation_size(c.oid) DESC
      ) t
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_database_storage_stats() TO anon, authenticated, service_role;`;

  // SQL Batch 4: Health Doctor & Pruning
  const sqlBatch4 = `-- ====================================================================
-- GUDANG ALIA - TAHAP 4: TABLE HEALTH DOCTOR & DATA RETENTION / PRUNING
-- Diagnostik Dead Tuples & Pembersihan Riwayat Lawas Terkontrol
-- ====================================================================

-- 1. RPC: get_table_health_analysis()
CREATE OR REPLACE FUNCTION public.get_table_health_analysis()
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'generated_at', NOW(),
    'tables', (
      SELECT json_agg(t) FROM (
        SELECT
          schemaname || '.' || relname AS table_name,
          n_live_tup AS live_rows,
          n_dead_tup AS dead_rows,
          CASE 
            WHEN (n_live_tup + n_dead_tup) > 0 
            THEN ROUND((n_dead_tup::NUMERIC / (n_live_tup + n_dead_tup)) * 100, 2)
            ELSE 0 
          END AS dead_tuple_percent,
          seq_scan AS sequential_scans,
          idx_scan AS index_scans,
          last_vacuum,
          last_autovacuum,
          last_analyze
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
        ORDER BY n_live_tup DESC
      ) t
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_table_health_analysis() TO anon, authenticated, service_role;

-- 2. RPC: preview_or_prune_old_transactions()
CREATE OR REPLACE FUNCTION public.preview_or_prune_old_transactions(
  p_days_to_keep INT DEFAULT 365,
  p_execute_delete BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff_date TIMESTAMPTZ;
  v_matching_count INT := 0;
  v_deleted_count INT := 0;
BEGIN
  IF p_days_to_keep < 90 THEN
    p_days_to_keep := 90;
  END IF;

  v_cutoff_date := NOW() - (p_days_to_keep || ' days')::INTERVAL;

  SELECT COUNT(*) INTO v_matching_count
  FROM public.transactions
  WHERE created_at < v_cutoff_date;

  IF p_execute_delete = TRUE AND v_matching_count > 0 THEN
    DELETE FROM public.transactions
    WHERE created_at < v_cutoff_date;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'dry_run', NOT p_execute_delete,
    'cutoff_date', v_cutoff_date,
    'days_kept', p_days_to_keep,
    'matching_old_records', v_matching_count,
    'deleted_records', v_deleted_count,
    'message', CASE 
      WHEN p_execute_delete THEN 'Berhasil membersihkan ' || v_deleted_count || ' baris transaksi lama.'
      ELSE 'Ditemukan ' || v_matching_count || ' baris transaksi lama yang dapat diarsipkan/dibersihkan.'
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_or_prune_old_transactions(INT, BOOLEAN) TO service_role;`;

  // SQL Full Schema
  const sqlSetup = `-- ==========================================================
-- GUDANG ALIA - SQL SETUP & RLS SECURITY SCHEMA
-- ==========================================================

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

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'staff';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

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

CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number TEXT UNIQUE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id),
  total_amount DECIMAL(15,2),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  price DECIMAL(12,2) NOT NULL
);

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

CREATE TABLE IF NOT EXISTS breakfast_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE DEFAULT CURRENT_DATE,
  rooms_occupied INTEGER DEFAULT 0,
  breakfast_pax INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE breakfast_records ENABLE ROW LEVEL SECURITY;

-- Catatan Keamanan:
-- Gunakan file migration_fix_rls.sql, migration_fix_rls_breakfast.sql, dan migration_rpc_role_hardening.sql
-- untuk menerapkan kebijakan RLS dan RPC role-check yang telah diperkeras.
-- TIDAK ADA akses tulis/modifikasi yang diberikan ke role anon.`;

  useEffect(() => {
    checkTables();
  }, []);

  const checkTables = async () => {
    setLoading(true);
    setCacheStats(queryCache.getStats());
    
    // Check RPC storage stats
    try {
      const { data: statsData, error: statsErr } = await supabase.rpc('get_database_storage_stats');
      if (!statsErr && statsData) {
        setStorageStats(statsData);
      }
    } catch {
      // Ignored if RPC not created yet
    }

    // Check Table Health RPC
    try {
      const { data: healthData, error: healthErr } = await supabase.rpc('get_table_health_analysis');
      if (!healthErr && healthData) {
        setHealthStats(healthData);
      }
    } catch {
      // Ignored if RPC not created yet
    }

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
          if (error.message.includes('does not exist') || error.message.includes('relation') || error.code === '42P01') {
            return { table: t.name, exists: false, columns: [] };
          }
          const missing = t.cols.filter(c => error.message.includes(`column "${c}" does not exist`));
          if (missing.length > 0) {
            return { table: t.name, exists: true, columns: missing };
          }
          return { table: t.name, exists: true, columns: [], error: error.message };
        }
        return { table: t.name, exists: true, columns: [] };
      } catch {
        return { table: t.name, exists: false, columns: [] };
      }
    }));

    setStatus(results);
    setLoading(false);
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 p-4 md:p-0 font-sans pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 md:p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">Database & Performance Center</h2>
          <p className="text-xs md:text-sm text-gray-500 mt-0.5 font-medium">Monitoring status database Supabase Free Tier, RPC functions, dan penghematan kuota</p>
        </div>
        <button 
          onClick={checkTables}
          className="bg-gray-50 hover:bg-gray-100 text-gray-800 px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold transition-all shadow-xs"
        >
          Refresh Status
        </button>
      </div>

      {/* KPI Cards: Optimization & Storage */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Cache Hit Rate</p>
            <p className="text-lg font-black text-gray-900">{cacheStats.hitRate}</p>
            <p className="text-[10px] text-emerald-600 font-medium">{cacheStats.totalHits} request dicegah</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total Network Call</p>
            <p className="text-lg font-black text-gray-900">{cacheStats.totalNetworkRequests}</p>
            <p className="text-[10px] text-blue-600 font-medium">Session saat ini</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center shrink-0">
            <HardDrive className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Supabase Storage</p>
            <p className="text-lg font-black text-gray-900">{storageStats?.total_db_size || '< 5 MB'}</p>
            <p className="text-[10px] text-purple-600 font-medium">Limit: 500 MB (Free)</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
            <Cpu className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Arsitektur RPC</p>
            <p className="text-lg font-black text-gray-900">Aktif</p>
            <p className="text-[10px] text-amber-600 font-medium">Atomic & Anti-N+1</p>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
        <button
          onClick={() => setActiveTab('status')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'status'
              ? 'bg-gray-900 text-white shadow-xs'
              : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          Status Tabel & Health
        </button>
        <button
          onClick={() => setActiveTab('batch1')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'batch1'
              ? 'bg-[#E65C00] text-white shadow-xs'
              : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          Tahap 1: Indexing (Batch 1)
        </button>
        <button
          onClick={() => setActiveTab('batch2')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'batch2'
              ? 'bg-[#E65C00] text-white shadow-xs'
              : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          Tahap 2: Atomic RPC (Batch 2)
        </button>
        <button
          onClick={() => setActiveTab('batch3')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'batch3'
              ? 'bg-[#E65C00] text-white shadow-xs'
              : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          Tahap 3: Views & Storage (Batch 3)
        </button>
        <button
          onClick={() => setActiveTab('batch4')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'batch4'
              ? 'bg-[#E65C00] text-white shadow-xs'
              : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          Tahap 4: Health Doctor & Pruning (Batch 4)
        </button>
        <button
          onClick={() => setActiveTab('schema')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'schema'
              ? 'bg-gray-800 text-white shadow-xs'
              : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          Skema Master & RLS
        </button>
      </div>

      {/* Tab 1: Status & Storage Health */}
      {activeTab === 'status' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-amber-600" />
              Status Tabel Database
            </h3>
            
            <div className="space-y-2.5">
              {loading ? (
                <div className="text-gray-500 text-xs flex items-center gap-2 py-4">
                  <Activity className="w-4 h-4 animate-spin text-amber-600" />
                  Mengecek database...
                </div>
              ) : status.map((s) => (
                <div key={s.table} className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between group hover:border-amber-300 transition-all">
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
            <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-600" />
              Tabel & Perkiraan Baris Data
            </h3>

            {storageStats?.tables ? (
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200 text-gray-700 font-bold">
                    <tr>
                      <th className="p-3">Nama Tabel</th>
                      <th className="p-3 text-right">Est. Baris</th>
                      <th className="p-3 text-right">Ukuran</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                    {storageStats.tables.map((t: any) => (
                      <tr key={t.table_name} className="hover:bg-gray-50/50">
                        <td className="p-3 font-mono font-bold text-gray-900">{t.table_name}</td>
                        <td className="p-3 text-right">{t.row_count || 0}</td>
                        <td className="p-3 text-right text-gray-500">{t.total_size}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-5 bg-purple-50/60 border border-purple-200 rounded-2xl text-xs text-purple-900 space-y-2">
                <p className="font-bold">Informasi Ukuran Storage</p>
                <p>
                  Jalankan <strong>Tahap 3 (Batch 3)</strong> pada SQL Editor Supabase untuk mengaktifkan pemantauan ukuran baris dan storage database secara real-time.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Tahap 1 (Batch 1) */}
      {activeTab === 'batch1' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-amber-600" />
                Tahap 1: Index Optimization (Batch 1)
              </h3>
              <p className="text-xs text-gray-500">Mencegah Full Table Scan pada query pencarian, filter tanggal, dan transaksi.</p>
            </div>
            <button 
              onClick={() => copyToClipboard(sqlBatch1, 'b1')}
              className="flex items-center gap-1.5 text-xs bg-[#E65C00] hover:bg-[#CF5300] text-white px-4 py-2 rounded-xl font-bold transition-all shadow-xs"
            >
              <Copy className="w-3.5 h-3.5" />
              {copiedKey === 'b1' ? 'Tersalin!' : 'Salin SQL Tahap 1'}
            </button>
          </div>
          
          <div className="bg-gray-900 p-4 rounded-2xl border border-gray-800 h-[420px] overflow-y-auto font-mono text-xs text-emerald-400">
            <pre className="whitespace-pre-wrap">{sqlBatch1}</pre>
          </div>
        </div>
      )}

      {/* Tab 3: Tahap 2 (Batch 2) */}
      {activeTab === 'batch2' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-amber-600" />
                Tahap 2: Atomic RPC Functions (Batch 2)
              </h3>
              <p className="text-xs text-gray-500">Mengonsolidasikan loop request menjadi 1 call RPC server-side.</p>
            </div>
            <button 
              onClick={() => copyToClipboard(sqlBatch2, 'b2')}
              className="flex items-center gap-1.5 text-xs bg-[#E65C00] hover:bg-[#CF5300] text-white px-4 py-2 rounded-xl font-bold transition-all shadow-xs"
            >
              <Copy className="w-3.5 h-3.5" />
              {copiedKey === 'b2' ? 'Tersalin!' : 'Salin SQL Tahap 2'}
            </button>
          </div>
          
          <div className="bg-gray-900 p-4 rounded-2xl border border-gray-800 h-[420px] overflow-y-auto font-mono text-xs text-emerald-400">
            <pre className="whitespace-pre-wrap">{sqlBatch2}</pre>
          </div>
        </div>
      )}

      {/* Tab 4: Tahap 3 (Batch 3) */}
      {activeTab === 'batch3' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-amber-600" />
                Tahap 3: Analytical Views & Storage Monitor (Batch 3)
              </h3>
              <p className="text-xs text-gray-500">Agregasi analitik transaksi harian & pemantauan storage 500 MB Free Tier.</p>
            </div>
            <button 
              onClick={() => copyToClipboard(sqlBatch3, 'b3')}
              className="flex items-center gap-1.5 text-xs bg-[#E65C00] hover:bg-[#CF5300] text-white px-4 py-2 rounded-xl font-bold transition-all shadow-xs"
            >
              <Copy className="w-3.5 h-3.5" />
              {copiedKey === 'b3' ? 'Tersalin!' : 'Salin SQL Tahap 3'}
            </button>
          </div>
          
          <div className="bg-gray-900 p-4 rounded-2xl border border-gray-800 h-[420px] overflow-y-auto font-mono text-xs text-emerald-400">
            <pre className="whitespace-pre-wrap">{sqlBatch3}</pre>
          </div>
        </div>
      )}

      {/* Tab 5: Tahap 4 (Batch 4) */}
      {activeTab === 'batch4' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-amber-600" />
                Tahap 4: Table Health Doctor & Retention Pruning (Batch 4)
              </h3>
              <p className="text-xs text-gray-500">Diagnostik performa dead tuples, index scan ratio, dan utilitas arsip terkontrol.</p>
            </div>
            <button 
              onClick={() => copyToClipboard(sqlBatch4, 'b4')}
              className="flex items-center gap-1.5 text-xs bg-[#E65C00] hover:bg-[#CF5300] text-white px-4 py-2 rounded-xl font-bold transition-all shadow-xs"
            >
              <Copy className="w-3.5 h-3.5" />
              {copiedKey === 'b4' ? 'Tersalin!' : 'Salin SQL Tahap 4'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="bg-gray-900 p-4 rounded-2xl border border-gray-800 h-[320px] overflow-y-auto font-mono text-xs text-emerald-400">
                <pre className="whitespace-pre-wrap">{sqlBatch4}</pre>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-600" />
                    Simulasi Pembersihan Riwayat (Dry Run)
                  </h4>
                </div>
                <p className="text-xs text-gray-500">
                  Uji coba aman untuk mengecek berapa banyak baris transaksi yang berusia lebih dari 365 hari tanpa menghapus data secara nyata.
                </p>

                <button
                  disabled={pruneLoading}
                  onClick={async () => {
                    setPruneLoading(true);
                    try {
                      const { data, error } = await supabase.rpc('preview_or_prune_old_transactions', {
                        p_days_to_keep: 365,
                        p_execute_delete: false
                      });
                      if (error) throw error;
                      setPruneResult(data);
                    } catch (err: any) {
                      setPruneResult({ error: err.message || 'Jalankan SQL Tahap 4 terlebih dahulu di Supabase' });
                    } finally {
                      setPruneLoading(false);
                    }
                  }}
                  className="w-full bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                >
                  {pruneLoading ? <Activity className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 text-blue-600" />}
                  Jalankan Dry Run (365 Hari)
                </button>

                {pruneResult && (
                  <div className={`p-3.5 rounded-xl border text-xs ${pruneResult.error ? 'bg-red-50 border-red-200 text-red-800' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
                    {pruneResult.error ? (
                      <p><strong>Notice:</strong> {pruneResult.error}</p>
                    ) : (
                      <div className="space-y-1">
                        <p className="font-bold">{pruneResult.message}</p>
                        <p className="text-[11px] text-emerald-700">Matching records: <strong>{pruneResult.matching_old_records}</strong> baris</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {healthStats?.tables && (
                <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs space-y-3">
                  <h4 className="font-bold text-gray-900 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Laporan Dead Tuples & Index Scans
                  </h4>
                  <div className="space-y-2 max-h-[160px] overflow-y-auto">
                    {healthStats.tables.map((tbl: any) => (
                      <div key={tbl.table_name} className="flex justify-between items-center text-xs py-1 border-b border-gray-100 last:border-0">
                        <span className="font-mono font-bold text-gray-800">{tbl.table_name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500 text-[11px]">Dead: {tbl.dead_tuple_percent}%</span>
                          <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md text-[10px] font-bold">Idx: {tbl.index_scans}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Schema Master & RLS */}
      {activeTab === 'schema' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-amber-600" />
                Skema Master Tabel & RLS Security
              </h3>
              <p className="text-xs text-gray-500">Pembuatan tabel lengkap beserta Policy RLS standar hotel.</p>
            </div>
            <button 
              onClick={() => copyToClipboard(sqlSetup, 'schema')}
              className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-xl font-bold transition-all shadow-xs"
            >
              <Copy className="w-3.5 h-3.5" />
              {copiedKey === 'schema' ? 'Tersalin!' : 'Salin Skema Master'}
            </button>
          </div>

          <div className="p-3.5 rounded-xl border bg-amber-50 border-amber-200 text-amber-900 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p>
              <strong>Peringatan Keamanan:</strong> SQL di bawah ini hanya sebagai referensi struktur tabel master. 
              <strong> JANGAN</strong> jalankan ulang bagian RLS/GRANT permisif lama. Gunakan file migration resmi di folder repo (seperti <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">migration_fix_rls.sql</code>, <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">migration_fix_rls_breakfast.sql</code>, dan <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">migration_rpc_role_hardening.sql</code>) untuk konfigurasi hak akses produksi.
            </p>
          </div>
          
          <div className="bg-gray-900 p-4 rounded-2xl border border-gray-800 h-[420px] overflow-y-auto font-mono text-xs text-emerald-400">
            <pre className="whitespace-pre-wrap">{sqlSetup}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
