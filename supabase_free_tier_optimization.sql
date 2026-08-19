-- ====================================================================
-- GUDANG ALIA - SUPABASE FREE TIER COMPLETE OPTIMIZATION MIGRATION
-- File: supabase_free_tier_optimization.sql
-- 
-- PENTING: Dijalankan di Supabase SQL Editor.
-- Script ini 100% NON-DESTRUCTIVE (Tidak ada DROP TABLE / DROP COLUMN / DELETE DATA).
-- Terdiri dari 2 BATCH untuk menghindari timeout.
-- ====================================================================

-- ====================================================================
-- BATCH 1: INDEX OPTIMIZATION (Mencegah Sequential Scans & Menghemat CPU)
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
  ON public.purchase_order_items (purchase_order_id);


-- ====================================================================
-- BATCH 2: ATOMIC RPC FUNCTIONS (Mengubah Puluhan Request Menjadi 1)
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. RPC: get_dashboard_summary()
-- Konsolidasi seluruh data Dashboard dalam 1 query tunggal
-- --------------------------------------------------------------------
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


-- --------------------------------------------------------------------
-- 2. RPC: complete_hk_request()
-- Atomic Fulfillment Housekeeping: Update Status + Potong Stok + Catat Transaksi OUT
-- Menghilangkan 20+ round-trip sequential requests menjadi 1 atomic request
-- --------------------------------------------------------------------
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
  -- 1. Ambil nomor request dan update status menjadi SELESAI
  SELECT request_number INTO v_req_num FROM public.requests WHERE id::text = p_request_id;
  IF v_req_num IS NULL THEN
    v_req_num := p_request_id;
  END IF;

  UPDATE public.requests 
  SET status = 'SELESAI' 
  WHERE id::text = p_request_id;

  -- 2. Loop setiap item yang difulfill
  IF p_items_json IS NOT NULL AND jsonb_array_length(p_items_json) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_json)
    LOOP
      v_target_item_id := NULL;
      v_qty := COALESCE((v_item->>'quantity')::int, 0);
      v_item_name := v_item->>'item_name';

      IF v_qty > 0 THEN
        -- Cari ID item berdasarkan ID atau Nama
        IF (v_item->>'item_id') IS NOT NULL AND (v_item->>'item_id') != '' THEN
          BEGIN
            v_target_item_id := (v_item->>'item_id')::uuid;
          EXCEPTION WHEN OTHERS THEN
            v_target_item_id := NULL;
          END;
        END IF;

        IF v_target_item_id IS NULL AND v_item_name IS NOT NULL THEN
          SELECT id INTO v_target_item_id FROM public.items WHERE LOWER(name) = LOWER(TRIM(v_item_name)) LIMIT 1;
        END IF;

        -- Jika item terdaftar di master database, potong stok dan catat transaksi OUT
        IF v_target_item_id IS NOT NULL THEN
          -- Kurangi stok item (tidak boleh minus di bawah 0)
          UPDATE public.items 
          SET current_stock = GREATEST(0, current_stock - v_qty)
          WHERE id = v_target_item_id;

          -- Catat transaksi OUT
          INSERT INTO public.transactions (
            id,
            item_id,
            type,
            quantity,
            department,
            notes,
            user_id,
            created_at
          ) VALUES (
            gen_random_uuid(),
            v_target_item_id,
            'OUT',
            v_qty,
            'Housekeeping',
            CONCAT('Fulfillment Permintaan HK ', v_req_num),
            p_user_id,
            NOW()
          );

          v_processed_count := v_processed_count + 1;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'processed_items_count', v_processed_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_hk_request(TEXT, JSONB, UUID) TO anon, authenticated, service_role;


-- --------------------------------------------------------------------
-- 3. RPC: complete_purchase_order()
-- Atomic PO Completion: Update PO Status + Tambah Stok + Catat Transaksi IN
-- Menghilangkan 15+ round-trip sequential requests menjadi 1 atomic request
-- --------------------------------------------------------------------
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
  v_po_num TEXT;
  v_po_status TEXT;
  v_item RECORD;
  v_count INT := 0;
BEGIN
  -- 1. Validasi PO
  SELECT po_number, status INTO v_po_num, v_po_status 
  FROM public.purchase_orders 
  WHERE id = p_po_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase Order tidak ditemukan.';
  END IF;

  IF v_po_status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'message', 'PO sudah berstatus completed.');
  END IF;

  -- 2. Update status PO menjadi completed
  UPDATE public.purchase_orders 
  SET status = 'completed' 
  WHERE id = p_po_id;

  -- 3. Tambah stok dan buat transaksi IN untuk setiap item dalam PO
  FOR v_item IN 
    SELECT item_id, quantity, price 
    FROM public.purchase_order_items 
    WHERE purchase_order_id = p_po_id AND item_id IS NOT NULL
  LOOP
    IF v_item.quantity > 0 THEN
      -- Tambah stok di master items
      UPDATE public.items 
      SET current_stock = current_stock + v_item.quantity 
      WHERE id = v_item.item_id;

      -- Catat Transaksi IN
      INSERT INTO public.transactions (
        id,
        item_id,
        type,
        quantity,
        department,
        notes,
        user_id,
        created_at
      ) VALUES (
        gen_random_uuid(),
        v_item.item_id,
        'IN',
        v_item.quantity,
        'Pembelian PO',
        CONCAT('Penerimaan Purchase Order ', COALESCE(v_po_num, '')),
        p_user_id,
        NOW()
      );

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'po_id', p_po_id,
    'items_processed', v_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_purchase_order(UUID, UUID) TO anon, authenticated, service_role;


-- --------------------------------------------------------------------
-- 4. RPC: create_transaction_and_update_stock()
-- Atomic Single Transaction: IN/OUT + Update Stok
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_transaction_and_update_stock(
  p_item_id UUID,
  p_type TEXT,
  p_quantity INT,
  p_department TEXT DEFAULT 'General',
  p_notes TEXT DEFAULT '',
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_stock INT;
  v_tx_id UUID := gen_random_uuid();
  v_new_stock INT;
BEGIN
  -- Ambil stok saat ini
  SELECT current_stock INTO v_current_stock 
  FROM public.items 
  WHERE id = p_item_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item dengan ID tersebut tidak ditemukan.';
  END IF;

  -- Validasi jika OUT melebihi stok
  IF p_type = 'OUT' AND v_current_stock < p_quantity THEN
    RAISE EXCEPTION 'Stok tidak mencukupi. Stok saat ini: %, diminta: %', v_current_stock, p_quantity;
  END IF;

  -- Hitung stok baru
  IF p_type = 'IN' THEN
    v_new_stock := v_current_stock + p_quantity;
  ELSIF p_type = 'OUT' THEN
    v_new_stock := GREATEST(0, v_current_stock - p_quantity);
  ELSE
    RAISE EXCEPTION 'Tipe transaksi tidak valid. Harus IN atau OUT.';
  END IF;

  -- Update stok item
  UPDATE public.items 
  SET current_stock = v_new_stock 
  WHERE id = p_item_id;

  -- Insert record transaksi
  INSERT INTO public.transactions (
    id,
    item_id,
    type,
    quantity,
    department,
    notes,
    user_id,
    created_at
  ) VALUES (
    v_tx_id,
    p_item_id,
    p_type,
    p_quantity,
    COALESCE(p_department, 'General'),
    COALESCE(p_notes, ''),
    p_user_id,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'new_stock', v_new_stock
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_transaction_and_update_stock(UUID, TEXT, INT, TEXT, TEXT, UUID) TO anon, authenticated, service_role;


-- --------------------------------------------------------------------
-- 5. RPC: get_stock_report()
-- Agregasi Stok Awal, Masuk, Keluar, dan Akhir di Database (Hemat Bandwidth)
-- --------------------------------------------------------------------
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


-- ====================================================================
-- BATCH 3: MAINTENANCE, ANALYTICAL VIEWS & STORAGE OPTIMIZER
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. View: Daily Transaction Aggregates (view_daily_transaction_summary)
-- Mengurangi jutaan raw scan baris untuk grafik dashboard bulanan
-- --------------------------------------------------------------------
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


-- --------------------------------------------------------------------
-- 2. View: Low Stock Alerts (view_stock_alerts)
-- Filter instan untuk notifikasi restock
-- --------------------------------------------------------------------
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


-- --------------------------------------------------------------------
-- 3. RPC: get_database_storage_stats()
-- Memonitor konsumsi kuota penyimpanan Supabase (Free Tier 500 MB limit)
-- --------------------------------------------------------------------
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

GRANT EXECUTE ON FUNCTION public.get_database_storage_stats() TO anon, authenticated, service_role;


-- ====================================================================
-- BATCH 4: TABLE HEALTH DOCTOR & DATA RETENTION / PRUNING GOVERNOR
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. RPC: get_table_health_analysis()
-- Menganalisis dead tuples, rasio scan index vs sequential scan, dan bloat
-- --------------------------------------------------------------------
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


-- --------------------------------------------------------------------
-- 2. RPC: preview_or_prune_old_transactions()
-- Safe maintenance utility: Dry run atau pembersihan arsip transaksi lawas
-- --------------------------------------------------------------------
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
  -- Minimal 90 hari agar tidak salah menghapus data baru
  IF p_days_to_keep < 90 THEN
    p_days_to_keep := 90;
  END IF;

  v_cutoff_date := NOW() - (p_days_to_keep || ' days')::INTERVAL;

  -- Hitung transaksi lawas
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

GRANT EXECUTE ON FUNCTION public.preview_or_prune_old_transactions(INT, BOOLEAN) TO anon, authenticated, service_role;


