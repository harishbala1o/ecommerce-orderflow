insert into users (id, keycloak_id, email, display_name, role) values
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'admin@ecommerce-orderflow.dev',    'Ada Admin',      'business_admin'),
  ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'ops@ecommerce-orderflow.dev',      'Otto Ops',       'ops'),
  ('33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', 'customer@ecommerce-orderflow.dev', 'Cara Customer',  'customer')
on conflict (id) do nothing;

insert into products (id, sku, name, description, unit_price_cents) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'SKU-KEYB', 'Mechanical Keyboard',       'Tactile, hot-swap switches',    12900),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'SKU-MOUS', 'Wireless Mouse',            'Low-latency 2.4GHz',            4900),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'SKU-MNTR', '27-inch Monitor',           '1440p 144Hz IPS',              29900),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'SKU-DOCK', 'USB-C Docking Station',     'Dual 4K, 100W passthrough',    13900),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'SKU-WEBC', '1080p Webcam',              'Auto-focus, dual mic',          6900),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'SKU-HDST', 'Noise-Cancelling Headset',  'Bluetooth, 40h battery',        8900),
  ('aaaaaaaa-0000-0000-0000-000000000007', 'SKU-CHRG', '100W GaN Charger',          '3-port, foldable pins',         3900),
  ('aaaaaaaa-0000-0000-0000-000000000008', 'SKU-SSD1', '1TB NVMe SSD',              'PCIe 4.0, 7000MB/s',           10900),
  ('aaaaaaaa-0000-0000-0000-000000000009', 'SKU-HUB7', '7-Port USB Hub',            'Powered, 5Gbps',                2900),
  ('aaaaaaaa-0000-0000-0000-000000000010', 'SKU-STND', 'Aluminum Laptop Stand',     'Adjustable, ventilated',        4500),
  ('aaaaaaaa-0000-0000-0000-000000000011', 'SKU-CBL6', 'USB-C Cable (2m)',          'Braided, 240W / 40Gbps',        1500),
  ('aaaaaaaa-0000-0000-0000-000000000012', 'SKU-DMAT', 'Desk Mat XL',               'Stitched edges, water-resistant', 2500)
on conflict (id) do nothing;

insert into orders (id, customer_id, status, total_cents) values
  ('bbbbbbbb-0000-0000-0000-000000000001',
   '33333333-3333-3333-3333-333333333333', 'PENDING', 17800)
on conflict (id) do nothing;

insert into order_items (order_id, product_id, quantity, unit_price_cents) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 1, 12900),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 1, 4900);

insert into order_events (order_id, from_status, to_status, action, actor_id, actor_role) values
  ('bbbbbbbb-0000-0000-0000-000000000001', null, 'PENDING', 'create',
   '33333333-3333-3333-3333-333333333333', 'customer');
