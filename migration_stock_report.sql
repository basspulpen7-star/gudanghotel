-- ====================================================================
-- MIGRATION: READ-ONLY STOCK REPORT RPC FUNCTION
-- File: migration_stock_report.sql
-- Description: Aggregates initial, in, out, and final stock per item directly 
--              in the database for ultra-fast, server-side reporting.
-- STRICT CONSTRAINTS: Read-only (SELECT & aggregations only). No write ops.
-- ====================================================================

CREATE OR REPLACE FUNCTION public.get_stock_report(
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ
)
RETURNS TABLE (
  item_id UUID,
  item_name TEXT,
  department TEXT,
  unit TEXT,
  initial_stock INT,
  in_qty INT,
  out_qty INT,
  final_stock INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH tx_summary AS (
    SELECT
      t.item_id,
      COALESCE(SUM(CASE WHEN t.created_at < p_start AND t.type = 'IN' THEN t.quantity ELSE 0 END), 0) AS before_in,
      COALESCE(SUM(CASE WHEN t.created_at < p_start AND t.type = 'OUT' THEN t.quantity ELSE 0 END), 0) AS before_out,
      COALESCE(SUM(CASE WHEN t.created_at >= p_start AND t.created_at <= p_end AND t.type = 'IN' THEN t.quantity ELSE 0 END), 0) AS current_in,
      COALESCE(SUM(CASE WHEN t.created_at >= p_start AND t.created_at <= p_end AND t.type = 'OUT' THEN t.quantity ELSE 0 END), 0) AS current_out
    FROM public.transactions t
    WHERE t.created_at <= p_end
    GROUP BY t.item_id
  )
  SELECT
    i.id AS item_id,
    i.name AS item_name,
    COALESCE(i.department, 'General') AS department,
    COALESCE(i.unit, 'pcs') AS unit,
    CASE
      WHEN p_start >= date_trunc('month', i.created_at) THEN
        (COALESCE(i.initial_stock, 0) + COALESCE(ts.before_in, 0) - COALESCE(ts.before_out, 0))::INT
      ELSE 0
    END AS initial_stock,
    CASE
      WHEN p_start >= date_trunc('month', i.created_at) THEN
        COALESCE(ts.current_in, 0)::INT
      ELSE 0
    END AS in_qty,
    CASE
      WHEN p_start >= date_trunc('month', i.created_at) THEN
        COALESCE(ts.current_out, 0)::INT
      ELSE 0
    END AS out_qty,
    CASE
      WHEN p_start >= date_trunc('month', i.created_at) THEN
        (COALESCE(i.initial_stock, 0) + COALESCE(ts.before_in, 0) - COALESCE(ts.before_out, 0) + COALESCE(ts.current_in, 0) - COALESCE(ts.current_out, 0))::INT
      ELSE 0
    END AS final_stock
  FROM public.items i
  LEFT JOIN tx_summary ts ON i.id = ts.item_id
  ORDER BY i.name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_stock_report(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
