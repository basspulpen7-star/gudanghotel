-- ====================================================================
-- MIGRATION: ATOMIC STOCK TRANSACTIONS & REVERT FUNCTIONS
-- File: migration_atomic_stock.sql
-- Description: Creates database-level atomic functions with row locks
--              to prevent lost-updates during concurrent transactions.
-- ====================================================================

-- 1. FUNCTION: create_transaction_and_update_stock
-- Atomically locks the item row, checks stock availability,
-- inserts a transaction, updates current_stock, and returns transaction result.
CREATE OR REPLACE FUNCTION public.create_transaction_and_update_stock(
  p_item_id UUID,
  p_type TEXT,
  p_quantity INT,
  p_department TEXT DEFAULT 'General',
  p_notes TEXT DEFAULT '',
  p_user_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_stock INT;
  v_new_stock INT;
  v_trans_id UUID;
BEGIN
  -- Input Validation
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Jumlah kuantitas harus lebih besar dari 0';
  END IF;

  IF p_type NOT IN ('IN', 'OUT') THEN
    RAISE EXCEPTION 'Tipe transaksi harus IN atau OUT';
  END IF;

  -- Atomic Row Lock on Item
  SELECT current_stock INTO v_current_stock
  FROM public.items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Barang dengan ID % tidak ditemukan', p_item_id;
  END IF;

  -- Calculate new stock & validate availability for OUT transactions
  IF p_type = 'OUT' THEN
    IF v_current_stock < p_quantity THEN
      RAISE EXCEPTION 'Stok tidak mencukupi. Stok tersedia: %, dibutuhkan: %', v_current_stock, p_quantity;
    END IF;
    v_new_stock := v_current_stock - p_quantity;
  ELSE
    v_new_stock := v_current_stock + p_quantity;
  END IF;

  -- Update Item Stock
  UPDATE public.items
  SET current_stock = v_new_stock
  WHERE id = p_item_id;

  -- Insert Transaction Record
  INSERT INTO public.transactions (
    item_id,
    type,
    quantity,
    department,
    notes,
    user_id
  ) VALUES (
    p_item_id,
    p_type,
    p_quantity,
    COALESCE(p_department, 'General'),
    COALESCE(p_notes, ''),
    p_user_id
  )
  RETURNING id INTO v_trans_id;

  -- Return Result JSON
  RETURN json_build_object(
    'id', v_trans_id,
    'item_id', p_item_id,
    'type', p_type,
    'quantity', p_quantity,
    'new_stock', v_new_stock
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_transaction_and_update_stock(UUID, TEXT, INT, TEXT, TEXT, UUID) TO authenticated;


-- 2. FUNCTION: delete_transaction_and_revert_stock
-- Atomically locks transaction & item row, reverts item stock,
-- and deletes ONLY the single transaction matching p_transaction_id.
CREATE OR REPLACE FUNCTION public.delete_transaction_and_revert_stock(
  p_transaction_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trans RECORD;
  v_current_stock INT;
  v_new_stock INT;
BEGIN
  -- Lock and fetch single transaction
  SELECT id, item_id, type, quantity
  INTO v_trans
  FROM public.transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaksi dengan ID % tidak ditemukan', p_transaction_id;
  END IF;

  -- Lock and fetch target item
  SELECT current_stock INTO v_current_stock
  FROM public.items
  WHERE id = v_trans.item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Barang terkait transaksi tidak ditemukan';
  END IF;

  -- Calculate reverted stock
  -- Reverting IN decreases stock; Reverting OUT increases stock
  IF v_trans.type = 'IN' THEN
    IF v_current_stock < v_trans.quantity THEN
      RAISE EXCEPTION 'Tidak dapat menghapus transaksi IN karena stok saat ini (%) lebih kecil dari kuantitas transaksi (%)', v_current_stock, v_trans.quantity;
    END IF;
    v_new_stock := v_current_stock - v_trans.quantity;
  ELSE
    v_new_stock := v_current_stock + v_trans.quantity;
  END IF;

  -- Update Item Stock
  UPDATE public.items
  SET current_stock = v_new_stock
  WHERE id = v_trans.item_id;

  -- Delete ONLY the specific transaction
  DELETE FROM public.transactions
  WHERE id = p_transaction_id;

  -- Return Result JSON
  RETURN json_build_object(
    'success', true,
    'transaction_id', p_transaction_id,
    'item_id', v_trans.item_id,
    'reverted_stock', v_new_stock
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_transaction_and_revert_stock(UUID) TO authenticated;
