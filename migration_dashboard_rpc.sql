-- ====================================================================
-- MIGRATION: RPC KONSOLIDASI DASHBOARD + INDEX PERFORMA
-- File: migration_dashboard_rpc.sql
-- ====================================================================

-- 1. INDEX untuk mempercepat filter & sort yang sering dipakai dashboard
CREATE INDEX IF NOT EXISTS idx_transactions_type_created
  ON public.transactions (type, created_at);

CREATE INDEX IF NOT EXISTS idx_items_current_stock
  ON public.items (current_stock);

CREATE INDEX IF NOT EXISTS idx_transactions_created_at
  ON public.transactions (created_at DESC);

-- 2. RPC: get_dashboard_summary()
-- Mengembalikan KPI + low stock items + recent transactions dalam SATU query,
-- semua agregasi dihitung di Postgres, bukan di client.
CREATE OR REPLACE FUNCTION public.get_dashboard_summary(p_low_stock_limit INT DEFAULT 5, p_recent_tx_limit INT DEFAULT 5)
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
