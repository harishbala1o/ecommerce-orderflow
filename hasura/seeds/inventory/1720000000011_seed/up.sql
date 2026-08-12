-- Stock levels for the seeded catalogue. product_id mirrors products.id in the
-- order database; there is no foreign key because they are separate databases.
-- A couple of items start deliberately low so the alerting path is visible.
insert into stock_items (product_id, sku, on_hand, reserved, reorder_level, reorder_qty) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'SKU-KEYB',  50, 0, 10, 50),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'SKU-MOUS', 100, 0, 20, 100),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'SKU-MNTR',  20, 0,  5, 20),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'SKU-DOCK',  40, 0, 10, 40),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'SKU-WEBC',  60, 0, 15, 50),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'SKU-HDST',  45, 0, 10, 40),
  ('aaaaaaaa-0000-0000-0000-000000000007', 'SKU-CHRG', 120, 0, 25, 100),
  ('aaaaaaaa-0000-0000-0000-000000000008', 'SKU-SSD1',  70, 0, 15, 60),
  ('aaaaaaaa-0000-0000-0000-000000000009', 'SKU-HUB7',  90, 0, 20, 80),
  ('aaaaaaaa-0000-0000-0000-000000000010', 'SKU-STND',   8, 0, 10, 40),  -- starts LOW
  ('aaaaaaaa-0000-0000-0000-000000000011', 'SKU-CBL6', 200, 0, 40, 200),
  ('aaaaaaaa-0000-0000-0000-000000000012', 'SKU-DMAT',   3, 0,  5, 30)   -- starts LOW
on conflict (product_id) do nothing;
