insert into users (id, keycloak_id, email, display_name, role) values
  ('11111111-1111-1111-1111-111111111111', null, 'admin@ecommerce-orderflow.dev',    'Ada Admin',      'admin'),
  ('22222222-2222-2222-2222-222222222222', null, 'ops@ecommerce-orderflow.dev',      'Otto Ops',       'ops'),
  ('33333333-3333-3333-3333-333333333333', null, 'customer@ecommerce-orderflow.dev', 'Cara Customer',  'customer')
on conflict (id) do nothing;

insert into products (id, sku, name, description, unit_price_cents, stock_qty) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'SKU-KEYB', 'Mechanical Keyboard', 'Tactile, hot-swap', 12900, 50),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'SKU-MOUS', 'Wireless Mouse',      'Low-latency',       4900, 100),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'SKU-MNTR', '27-inch Monitor',     '1440p 144Hz',      29900, 20)
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
