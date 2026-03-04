-- Migration: Two-Location Inventory (Stock Movements)
-- Run this once in psql or pgAdmin against your butchery_pos database

-- 1. Create the stock_movements table
CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    location VARCHAR(10) NOT NULL CHECK (location IN ('store', 'sales')),
    movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('opening', 'grn', 'siv', 'sale', 'reverse')),
    quantity DECIMAL(10,2) NOT NULL,  -- positive = stock in, negative = stock out
    reference_id INTEGER,            -- grn.id / siv.id / orders.id
    reference_type VARCHAR(20),      -- 'grn' / 'siv' / 'order'
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Seed opening store balances from existing current_stock values
--    (All existing stock is assumed to be in the Store)
INSERT INTO stock_movements (product_id, location, movement_type, quantity, notes)
SELECT id, 'store', 'opening', current_stock, 'Migrated from current_stock'
FROM products
WHERE current_stock > 0
ON CONFLICT DO NOTHING;
