-- ====================================================================
-- MIGRATION: REVOKE ANON GRANTS ON DATA-MUTATING FUNCTIONS
-- File: migration_revoke_anon_grants.sql
-- 
-- PERNYATAAN KEAMANAN:
-- File migration ini 100% AMAN dan NON-DESTRUCTIVE.
-- Hanya mencabut (REVOKE) hak eksekusi role publik 'anon' dari fungsi mutasi data.
-- TIDAK ADA operasi DROP TABLE, TRUNCATE, DELETE DATA, atau DROP COLUMN.
-- Idempotent: Aman dieksekusi berulang kali tanpa risiko kehilangan data.
-- ====================================================================

-- 1. Cabut hak eksekusi 'anon' pada RPC pembuatan transaksi stok
REVOKE EXECUTE ON FUNCTION public.create_transaction_and_update_stock(UUID, TEXT, INT, TEXT, TEXT, UUID) FROM anon;

-- 2. Cabut hak eksekusi 'anon' pada RPC penghapusan transaksi stok
REVOKE EXECUTE ON FUNCTION public.delete_transaction_and_revert_stock(UUID) FROM anon;

-- 3. Cabut hak eksekusi 'anon' pada RPC fulfillment permintaan HK
REVOKE EXECUTE ON FUNCTION public.complete_hk_request(TEXT, JSONB, UUID) FROM anon;

-- 4. Cabut hak eksekusi 'anon' pada RPC penerimaan Purchase Order (PO)
REVOKE EXECUTE ON FUNCTION public.complete_purchase_order(UUID, UUID) FROM anon;

-- 5. Cabut hak eksekusi 'anon' DAN 'authenticated' pada fungsi pembersihan riwayat lama
-- Fungsi ini adalah utilitas pemeliharaan database admin-only yang HANYA boleh diakses via SQL Editor / service_role
REVOKE EXECUTE ON FUNCTION public.preview_or_prune_old_transactions(INT, BOOLEAN) FROM anon;
REVOKE EXECUTE ON FUNCTION public.preview_or_prune_old_transactions(INT, BOOLEAN) FROM authenticated;

-- Pastikan service_role tetap memiliki akses untuk maintenance backend/SQL editor
GRANT EXECUTE ON FUNCTION public.preview_or_prune_old_transactions(INT, BOOLEAN) TO service_role;
