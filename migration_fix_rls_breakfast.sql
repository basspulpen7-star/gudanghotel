-- ====================================================================
-- MIGRATION: RLS HARDENING FOR BREAKFAST_RECORDS
-- File: migration_fix_rls_breakfast.sql
-- 
-- PERNYATAAN KEAMANAN:
-- File migration ini 100% AMAN dan NON-DESTRUCTIVE.
-- Hanya mengatur Row Level Security (RLS) dan Policies pada tabel breakfast_records.
-- TIDAK ADA operasi DROP TABLE, TRUNCATE, DELETE DATA, atau DROP COLUMN.
-- Idempotent: Aman dieksekusi berulang kali tanpa risiko kehilangan data.
-- ====================================================================

-- 1. Pastikan Row Level Security aktif pada tabel breakfast_records
ALTER TABLE public.breakfast_records ENABLE ROW LEVEL SECURITY;

-- 2. Hapus semua policy lama yang permisif pada breakfast_records
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN 
    SELECT policyname 
    FROM pg_policies 
    WHERE tablename = 'breakfast_records' AND schemaname = 'public' 
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.breakfast_records', pol.policyname);
  END LOOP;
END $$;

-- 3. Kebijakan SELECT: Semua user terautentikasi (authenticated) boleh membaca data breakfast & okupansi
CREATE POLICY "breakfast_records_select" ON public.breakfast_records
  FOR SELECT TO authenticated
  USING (true);

-- 4. Kebijakan INSERT: Hanya role 'admin', 'logistik', dan 'resto' yang dapat menginput data harian
CREATE POLICY "breakfast_records_insert" ON public.breakfast_records
  FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() IN ('admin', 'logistik', 'resto'));

-- 5. Kebijakan UPDATE: Hanya role 'admin', 'logistik', dan 'resto' yang dapat mengubah data
CREATE POLICY "breakfast_records_update" ON public.breakfast_records
  FOR UPDATE TO authenticated
  USING (public.get_my_role() IN ('admin', 'logistik', 'resto'))
  WITH CHECK (public.get_my_role() IN ('admin', 'logistik', 'resto'));

-- 6. Kebijakan DELETE: Hanya role 'admin', 'logistik', dan 'resto' yang dapat menghapus data
CREATE POLICY "breakfast_records_delete" ON public.breakfast_records
  FOR DELETE TO authenticated
  USING (public.get_my_role() IN ('admin', 'logistik', 'resto'));
