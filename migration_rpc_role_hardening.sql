-- ====================================================================
-- MIGRATION: RPC ROLE HARDENING (DATA-MUTATING FUNCTIONS)
-- File: migration_rpc_role_hardening.sql
-- 
-- PERNYATAAN KEAMANAN:
-- File migration ini 100% AMAN dan NON-DESTRUCTIVE.
-- Hanya berisi CREATE OR REPLACE FUNCTION dan GRANT EXECUTE.
-- TIDAK ADA operasi DROP TABLE, TRUNCATE, DELETE DATA, atau DROP COLUMN.
-- Idempotent: Aman dieksekusi berulang kali tanpa risiko kehilangan data.
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. RPC: create_transaction_and_update_stock
-- Hak Akses: role 'admin' dan 'logistik' saja
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
  -- 1. Pengecekan Hak Akses (Role-Check)
  IF public.get_my_role() NOT IN ('admin', 'logistik') THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya role Admin dan Logistik yang berhak membuat transaksi dan mengubah stok barang.';
  END IF;

  -- 2. Validasi Input
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Jumlah kuantitas harus lebih besar dari 0.';
  END IF;

  IF p_type NOT IN ('IN', 'OUT') THEN
    RAISE EXCEPTION 'Tipe transaksi tidak valid. Harus IN atau OUT.';
  END IF;

  -- 3. Row Lock pada Item (Mencegah Race Condition & Lost-Update)
  SELECT current_stock INTO v_current_stock 
  FROM public.items 
  WHERE id = p_item_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Barang dengan ID % tidak ditemukan.', p_item_id;
  END IF;

  -- 4. Validasi kecukupan stok jika pengeluaran (OUT)
  IF p_type = 'OUT' AND v_current_stock < p_quantity THEN
    RAISE EXCEPTION 'Stok tidak mencukupi. Stok saat ini: %, diminta: %', v_current_stock, p_quantity;
  END IF;

  -- 5. Hitung stok baru
  IF p_type = 'IN' THEN
    v_new_stock := v_current_stock + p_quantity;
  ELSIF p_type = 'OUT' THEN
    v_new_stock := GREATEST(0, v_current_stock - p_quantity);
  END IF;

  -- 6. Update stok master barang
  UPDATE public.items 
  SET current_stock = v_new_stock 
  WHERE id = p_item_id;

  -- 7. Insert pencatatan transaksi mutasi
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
    'id', v_tx_id,
    'transaction_id', v_tx_id,
    'item_id', p_item_id,
    'type', p_type,
    'quantity', p_quantity,
    'new_stock', v_new_stock
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_transaction_and_update_stock(UUID, TEXT, INT, TEXT, TEXT, UUID) TO authenticated;


-- --------------------------------------------------------------------
-- 2. RPC: delete_transaction_and_revert_stock
-- Hak Akses: role 'admin' dan 'logistik' saja
-- --------------------------------------------------------------------
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
  -- 1. Pengecekan Hak Akses (Role-Check)
  IF public.get_my_role() NOT IN ('admin', 'logistik') THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya role Admin dan Logistik yang berhak menghapus transaksi dan mengembalikan stok barang.';
  END IF;

  -- 2. Lock and fetch single transaction
  SELECT id, item_id, type, quantity
  INTO v_trans
  FROM public.transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaksi dengan ID % tidak ditemukan.', p_transaction_id;
  END IF;

  -- 3. Lock and fetch target item
  SELECT current_stock INTO v_current_stock
  FROM public.items
  WHERE id = v_trans.item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Barang terkait transaksi tidak ditemukan.';
  END IF;

  -- 4. Calculate reverted stock
  -- Reverting IN decreases stock; Reverting OUT increases stock
  IF v_trans.type = 'IN' THEN
    IF v_current_stock < v_trans.quantity THEN
      RAISE EXCEPTION 'Tidak dapat menghapus transaksi IN karena stok saat ini (%) lebih kecil dari kuantitas transaksi (%).', v_current_stock, v_trans.quantity;
    END IF;
    v_new_stock := v_current_stock - v_trans.quantity;
  ELSE
    v_new_stock := v_current_stock + v_trans.quantity;
  END IF;

  -- 5. Update Item Stock
  UPDATE public.items
  SET current_stock = v_new_stock
  WHERE id = v_trans.item_id;

  -- 6. Delete ONLY the specific transaction
  DELETE FROM public.transactions
  WHERE id = p_transaction_id;

  -- 7. Return Result JSON
  RETURN json_build_object(
    'success', true,
    'transaction_id', p_transaction_id,
    'item_id', v_trans.item_id,
    'reverted_stock', v_new_stock
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_transaction_and_revert_stock(UUID) TO authenticated;


-- --------------------------------------------------------------------
-- 3. RPC: complete_hk_request
-- Hak Akses: role 'admin' dan 'logistik' saja
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
  -- 1. Pengecekan Hak Akses (Role-Check)
  IF public.get_my_role() NOT IN ('admin', 'logistik') THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya role Admin dan Logistik yang berhak memproses dan menyelesaikan permintaan barang.';
  END IF;

  -- 2. Ambil nomor request dan update status menjadi SELESAI
  SELECT request_number INTO v_req_num FROM public.requests WHERE id::text = p_request_id;
  IF v_req_num IS NULL THEN
    v_req_num := p_request_id;
  END IF;

  UPDATE public.requests 
  SET status = 'SELESAI' 
  WHERE id::text = p_request_id;

  -- 3. Loop setiap item yang difulfill
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

GRANT EXECUTE ON FUNCTION public.complete_hk_request(TEXT, JSONB, UUID) TO authenticated;


-- --------------------------------------------------------------------
-- 4. RPC: complete_purchase_order
-- Hak Akses: role 'admin' dan 'logistik' saja
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
  -- 1. Pengecekan Hak Akses (Role-Check)
  IF public.get_my_role() NOT IN ('admin', 'logistik') THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya role Admin dan Logistik yang berhak menyelesaikan Purchase Order dan menerima barang.';
  END IF;

  -- 2. Validasi PO
  SELECT po_number, status INTO v_po_num, v_po_status 
  FROM public.purchase_orders 
  WHERE id = p_po_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase Order tidak ditemukan.';
  END IF;

  IF v_po_status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'message', 'PO sudah berstatus completed.');
  END IF;

  -- 3. Update status PO menjadi completed
  UPDATE public.purchase_orders 
  SET status = 'completed' 
  WHERE id = p_po_id;

  -- 4. Tambah stok dan buat transaksi IN untuk setiap item dalam PO
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

GRANT EXECUTE ON FUNCTION public.complete_purchase_order(UUID, UUID) TO authenticated;
