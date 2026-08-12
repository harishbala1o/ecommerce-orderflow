-- Stock now lives in the inventory bounded context. Keeping a copy here would
-- create a second source of truth, which is exactly the bug the inventory
-- service exists to prevent.
alter table products drop column stock_qty;
