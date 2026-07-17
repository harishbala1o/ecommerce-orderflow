drop trigger if exists orders_set_updated_at on orders;
drop function if exists set_updated_at();
drop table if exists order_events;
drop table if exists order_items;
drop table if exists orders;
drop table if exists products;
drop table if exists users;
drop type if exists order_status;
