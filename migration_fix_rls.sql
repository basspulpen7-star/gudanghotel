-- ====================================================================
-- MIGRATION: SECURITY & RLS HARDENING FOR GUDANG ALIA
-- File: migration_fix_rls.sql
-- Description: Fixes Privilege Escalation vulnerabilities in Supabase RLS.
-- ====================================================================

-- 1. HELPER FUNCTION: public.get_my_role()
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

-- 2. TRIGGER TO PREVENT SELF-ESCALATION OF ROLE
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF public.get_my_role() != 'admin' THEN
      RAISE EXCEPTION 'Akses ditolak: Hanya Admin yang dapat mengubah role user.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_escalation();

-- 3. DROP ALL EXISTING POLICIES & RE-ENABLE RLS
DO $$
DECLARE
  tbl text;
  pol record;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'profiles', 'items', 'suppliers', 'transactions', 
    'purchase_orders', 'purchase_order_items', 'requests', 'request_items'
  ]) LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = tbl AND schemaname = 'public' LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

-- 4. POLICIES FOR 'profiles'
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.get_my_role() = 'admin');

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.get_my_role() = 'admin')
  WITH CHECK (id = auth.uid() OR public.get_my_role() = 'admin');

CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() = 'admin');

-- 5. POLICIES FOR INVENTORY & PO TABLES (items, suppliers, transactions, purchase_orders, purchase_order_items)
-- SELECT: All authenticated
-- INSERT / UPDATE / DELETE: 'admin' and 'logistik' only

-- items
CREATE POLICY "items_select" ON public.items FOR SELECT TO authenticated USING (true);
CREATE POLICY "items_insert" ON public.items FOR INSERT TO authenticated WITH CHECK (public.get_my_role() IN ('admin', 'logistik'));
CREATE POLICY "items_update" ON public.items FOR UPDATE TO authenticated USING (public.get_my_role() IN ('admin', 'logistik')) WITH CHECK (public.get_my_role() IN ('admin', 'logistik'));
CREATE POLICY "items_delete" ON public.items FOR DELETE TO authenticated USING (public.get_my_role() IN ('admin', 'logistik'));

-- suppliers
CREATE POLICY "suppliers_select" ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "suppliers_insert" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (public.get_my_role() IN ('admin', 'logistik'));
CREATE POLICY "suppliers_update" ON public.suppliers FOR UPDATE TO authenticated USING (public.get_my_role() IN ('admin', 'logistik')) WITH CHECK (public.get_my_role() IN ('admin', 'logistik'));
CREATE POLICY "suppliers_delete" ON public.suppliers FOR DELETE TO authenticated USING (public.get_my_role() IN ('admin', 'logistik'));

-- transactions
CREATE POLICY "transactions_select" ON public.transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "transactions_insert" ON public.transactions FOR INSERT TO authenticated WITH CHECK (public.get_my_role() IN ('admin', 'logistik'));
CREATE POLICY "transactions_update" ON public.transactions FOR UPDATE TO authenticated USING (public.get_my_role() IN ('admin', 'logistik')) WITH CHECK (public.get_my_role() IN ('admin', 'logistik'));
CREATE POLICY "transactions_delete" ON public.transactions FOR DELETE TO authenticated USING (public.get_my_role() IN ('admin', 'logistik'));

-- purchase_orders
CREATE POLICY "purchase_orders_select" ON public.purchase_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "purchase_orders_insert" ON public.purchase_orders FOR INSERT TO authenticated WITH CHECK (public.get_my_role() IN ('admin', 'logistik'));
CREATE POLICY "purchase_orders_update" ON public.purchase_orders FOR UPDATE TO authenticated USING (public.get_my_role() IN ('admin', 'logistik')) WITH CHECK (public.get_my_role() IN ('admin', 'logistik'));
CREATE POLICY "purchase_orders_delete" ON public.purchase_orders FOR DELETE TO authenticated USING (public.get_my_role() IN ('admin', 'logistik'));

-- purchase_order_items
CREATE POLICY "purchase_order_items_select" ON public.purchase_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "purchase_order_items_insert" ON public.purchase_order_items FOR INSERT TO authenticated WITH CHECK (public.get_my_role() IN ('admin', 'logistik'));
CREATE POLICY "purchase_order_items_update" ON public.purchase_order_items FOR UPDATE TO authenticated USING (public.get_my_role() IN ('admin', 'logistik')) WITH CHECK (public.get_my_role() IN ('admin', 'logistik'));
CREATE POLICY "purchase_order_items_delete" ON public.purchase_order_items FOR DELETE TO authenticated USING (public.get_my_role() IN ('admin', 'logistik'));

-- 6. POLICIES FOR REQUESTS & REQUEST_ITEMS TABLES
-- SELECT: All authenticated
-- INSERT: 'hk' and 'admin' (Housekeeping and Admin create requests)
-- UPDATE / DELETE: 'admin' and 'logistik' (Approving / processing requests)

-- requests
CREATE POLICY "requests_select" ON public.requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "requests_insert" ON public.requests FOR INSERT TO authenticated WITH CHECK (public.get_my_role() IN ('hk', 'admin'));
CREATE POLICY "requests_update" ON public.requests FOR UPDATE TO authenticated USING (public.get_my_role() IN ('admin', 'logistik')) WITH CHECK (public.get_my_role() IN ('admin', 'logistik'));
CREATE POLICY "requests_delete" ON public.requests FOR DELETE TO authenticated USING (public.get_my_role() IN ('admin', 'logistik'));

-- request_items
CREATE POLICY "request_items_select" ON public.request_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "request_items_insert" ON public.request_items FOR INSERT TO authenticated WITH CHECK (public.get_my_role() IN ('hk', 'admin'));
CREATE POLICY "request_items_update" ON public.request_items FOR UPDATE TO authenticated USING (public.get_my_role() IN ('admin', 'logistik')) WITH CHECK (public.get_my_role() IN ('admin', 'logistik'));
CREATE POLICY "request_items_delete" ON public.request_items FOR DELETE TO authenticated USING (public.get_my_role() IN ('admin', 'logistik'));

/*
====================================================================
7. MANUAL TESTING SCENARIOS (Jalankan di Supabase SQL Editor)
====================================================================

-- TEST 1: Verifikasi fungsi get_my_role()
SELECT public.get_my_role();

-- TEST 2: Simulasi user biasa (non-admin) mencoba menaikkan role sendiri menjadi 'admin'
-- Jalankan perintah ini saat login sebagai user non-admin (misal role 'hk'):
UPDATE public.profiles
SET role = 'admin'
WHERE id = auth.uid();
-- HASIL YANG DIHARAPKAN: GAGAL / ERROR!
-- Error Message: "Akses ditolak: Hanya Admin yang dapat mengubah role user."

-- TEST 3: User biasa meng-update data profil sendiri selain role (misal full_name)
UPDATE public.profiles
SET full_name = 'Nama Baru User'
WHERE id = auth.uid();
-- HASIL YANG DIHARAPKAN: BERHASIL!

-- TEST 4: User HK mencoba membuat permintaan barang (INSERT requests)
-- HASIL YANG DIHARAPKAN: BERHASIL jika get_my_role() = 'hk' atau 'admin'.

-- TEST 5: User HK mencoba mengubah stok barang di items (current_stock)
UPDATE public.items SET current_stock = 999 WHERE id = (SELECT id FROM public.items LIMIT 1);
-- HASIL YANG DIHARAPKAN: GAGAL / 0 ROW UPDATED (RLS Block).
====================================================================
*/
