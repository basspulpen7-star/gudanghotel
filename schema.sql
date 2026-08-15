-- ==============================================================================
-- SKEMA LENGKAP SUPABASE / POSTGRESQL (GUDANG LOGISTIK & HOUSEKEEPING)
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABEL PROFILES (PENGGUNA & ROLE)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff', 'hk', 'logistik')),
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 3. TABEL SUPPLIERS (PEMASOK / VENDOR)
CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    contact_person TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    address TEXT DEFAULT '',
    category TEXT DEFAULT 'General',
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 4. TABEL ITEMS (MASTER STOK BARANG GUDANG)
CREATE TABLE IF NOT EXISTS public.items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    department TEXT NOT NULL DEFAULT 'General',
    unit TEXT NOT NULL DEFAULT 'pcs',
    initial_stock NUMERIC DEFAULT 0,
    current_stock NUMERIC DEFAULT 0,
    min_stock NUMERIC DEFAULT 5,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 5. TABEL TRANSACTIONS (MUTASI BARANG MASUK / KELUAR)
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('IN', 'OUT')),
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    department TEXT DEFAULT 'Logistik',
    notes TEXT DEFAULT '',
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 6. TABEL PURCHASE ORDERS (PO PEMESANAN BARANG KE SUPPLIER)
CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    po_number TEXT UNIQUE,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
    total_amount NUMERIC DEFAULT 0,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 7. TABEL PURCHASE ORDER ITEMS (RINCIAN ITEM PO)
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    price NUMERIC DEFAULT 0
);

-- 8. TABEL REQUESTS (PERMINTAAN BARANG HOUSEKEEPING / DEPARTEMEN)
CREATE TABLE IF NOT EXISTS public.requests (
    id TEXT PRIMARY KEY,
    request_number TEXT UNIQUE,
    department TEXT NOT NULL DEFAULT 'Housekeeping',
    requester_name TEXT DEFAULT 'Staf Housekeeping',
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'MENUNGGU' CHECK (status IN ('MENUNGGU', 'DIPROSES', 'SELESAI', 'DITOLAK', 'pending', 'processing', 'completed', 'rejected')),
    occupancy_count INTEGER DEFAULT 0,
    breakfast_pax INTEGER DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 9. TABEL REQUEST ITEMS (DETAIL ITEM PERMINTAAN HK)
CREATE TABLE IF NOT EXISTS public.request_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id TEXT NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
    item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
    item_name TEXT NOT NULL,
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    unit TEXT NOT NULL DEFAULT 'pcs',
    notes TEXT DEFAULT ''
);

-- 10. TABEL BREAKFAST RECORDS (DATA OKUPANSI & BREAKFAST HARIAN)
CREATE TABLE IF NOT EXISTS public.breakfast_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    rooms_occupied INTEGER DEFAULT 0,
    breakfast_pax INTEGER DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- ==============================================================================
-- OTOMATISASI TRIGGER PROFILE DARI AUTH.USERS
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, role)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'full_name', new.email),
        COALESCE(new.raw_user_meta_data->>'role', 'staff')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) & POLICIES
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.breakfast_records ENABLE ROW LEVEL SECURITY;

-- Kebijakan Akses Penuh untuk Pengguna Terautentikasi (Authenticated Users)
CREATE POLICY "Authenticated full access to profiles" ON public.profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access to suppliers" ON public.suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access to items" ON public.items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access to transactions" ON public.transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access to purchase_orders" ON public.purchase_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access to purchase_order_items" ON public.purchase_order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access to requests" ON public.requests FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access to request_items" ON public.request_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access to breakfast_records" ON public.breakfast_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
