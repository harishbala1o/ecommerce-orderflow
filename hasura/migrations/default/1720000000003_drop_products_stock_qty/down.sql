alter table products add column stock_qty integer not null default 0 check (stock_qty >= 0);
