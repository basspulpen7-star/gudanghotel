-- Migration: Add linen_item_name mapping column to items table
-- Project: Gudang Alia (qdsieavuhgvxrqtaytlt)

-- 1. Add linen_item_name column if it does not already exist
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS linen_item_name TEXT NULL;

-- 2. Add category column if it does not already exist
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS category TEXT NULL;

-- 3. Create index for high-performance lookup during bidirectional sync
CREATE INDEX IF NOT EXISTS idx_items_linen_item_name ON items(linen_item_name);
CREATE INDEX IF NOT EXISTS idx_items_department ON items(department);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);

-- 4. Comment on columns
COMMENT ON COLUMN items.linen_item_name IS 'Mapping to Linen Module clean_items.item_name for bidirectional stock sync';
COMMENT ON COLUMN items.category IS 'Item Category (e.g. Laundry, Housekeeping, Resto)';
