import { supabase } from '../lib/supabase';
import { ITEM_TYPES } from '../constants-linen';

export interface SeedResult {
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  total: number;
}

/**
 * Seed Laundry Items Service / Script
 * Reads clean items from Gudang Alia's local linen_clean_items table
 * and seeds them into Gudang Alia items table (project qdsieavuhgvxrqtaytlt).
 * 
 * Safe to run in Browser (Vite environment) and idempotent.
 */
export async function seedLaundryItems(): Promise<SeedResult> {
  console.log('🚀 [SEED] Starting Laundry Items Seeding & Backfill in Browser...');

  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  try {
    // 1. Fetch current clean items stock from Gudang Alia local linen database
    const cleanMap = new Map<string, number>();
    try {
      const { data: cleanItems, error: cleanError } = await supabase
        .from('linen_clean_items')
        .select('*');

      if (cleanError) {
        console.warn('⚠️ [SEED] Could not fetch clean_items from Supabase:', cleanError.message);
      } else if (cleanItems) {
        cleanItems.forEach((c: any) => {
          const name = c.itemName || c.item_name;
          if (name) {
            cleanMap.set(name, Number(c.quantity || 0));
          }
        });
      }
    } catch (cleanErr) {
      console.warn('⚠️ [SEED] Linen fetch clean items exception:', cleanErr);
    }

    // 2. Fetch existing items in Gudang Alia
    const { data: existingItems, error: existingError } = await supabase
      .from('items')
      .select('*');

    if (existingError) {
      console.error('❌ [SEED] Error fetching existing items from Gudang Alia:', existingError.message);
      throw existingError;
    }

    const itemsList = existingItems || [];

    // 3. BACKFILL & CLEANUP STEP:
    // Check if any existing items match ITEM_TYPES and update them with category='Laundry' & linen_item_name
    for (const item of itemsList) {
      const matchedType = ITEM_TYPES.find(
        t => t.toLowerCase() === (item.name || '').trim().toLowerCase()
      );

      if (matchedType) {
        const needsUpdate = 
          item.department !== 'Laundry' || 
          item.category !== 'Laundry' || 
          item.linen_item_name !== matchedType;

        if (needsUpdate) {
          try {
            // Attempt full update with category & linen_item_name
            const { error: updateErr } = await supabase
              .from('items')
              .update({
                department: 'Laundry',
                category: 'Laundry',
                linen_item_name: matchedType
              })
              .eq('id', item.id);

            if (updateErr) {
              // Fallback without extra custom columns if schema hasn't been migrated
              await supabase
                .from('items')
                .update({ department: 'Laundry' })
                .eq('id', item.id);
            }
            console.log(`🔄 [SEED] Backfilled existing item '${item.name}' with department & mapping`);
            updatedCount++;
          } catch (updErr) {
            console.warn(`⚠️ [SEED] Backfill warning for item '${item.name}':`, updErr);
          }
        }
      }
    }

    // Re-index existing items after backfill
    const existingLinenNames = new Set<string>();
    itemsList.forEach((i: any) => {
      const matched = ITEM_TYPES.find(
        t => t.toLowerCase() === (i.name || '').trim().toLowerCase() || i.linen_item_name === t
      );
      if (matched) {
        existingLinenNames.add(matched);
      }
    });

    // 4. INSERT STEP:
    // Process each standard linen item from ITEM_TYPES
    for (const itemType of ITEM_TYPES) {
      if (existingLinenNames.has(itemType)) {
        console.log(`⏩ [SEED] Skip '${itemType}' (already exists in Gudang Alia)`);
        skippedCount++;
        continue;
      }

      const initialQty = cleanMap.get(itemType) || 0;
      const newItemId = crypto.randomUUID();

      const itemPayload = {
        id: newItemId,
        name: itemType,
        department: 'Laundry',
        category: 'Laundry',
        linen_item_name: itemType,
        unit: 'pcs',
        initial_stock: initialQty,
        current_stock: initialQty,
        min_stock: 0
      };

      try {
        const { error: insertError } = await supabase
          .from('items')
          .insert([itemPayload]);

        if (insertError) {
          // If custom column error occurs, fallback to basic payload
          console.warn(`⚠️ [SEED] Full insert failed for '${itemType}', attempting fallback payload:`, insertError.message);
          const fallbackPayload = {
            id: newItemId,
            name: itemType,
            department: 'Laundry',
            unit: 'pcs',
            initial_stock: initialQty,
            current_stock: initialQty,
            min_stock: 0
          };
          const { error: fbErr } = await supabase
            .from('items')
            .insert([fallbackPayload]);

          if (fbErr) {
            console.error(`❌ [SEED] Fallback insert failed for '${itemType}':`, fbErr.message);
            continue;
          }
        }

        console.log(`✅ [SEED] Inserted '${itemType}' (Initial & Current Stock: ${initialQty} pcs)`);
        insertedCount++;
        existingLinenNames.add(itemType);
      } catch (insErr: any) {
        console.error(`❌ [SEED] Insert exception for '${itemType}':`, insErr);
      }
    }

    console.log(`🎉 [SEED SUMMARY] Selesai! Ditambahkan: ${insertedCount}, Diperbarui: ${updatedCount}, Dilewati: ${skippedCount}, Total: ${ITEM_TYPES.length}`);
    return {
      insertedCount,
      updatedCount,
      skippedCount,
      total: ITEM_TYPES.length
    };
  } catch (err: any) {
    console.error('❌ [SEED FAILED]:', err);
    throw err;
  }
}
