-- A read model for anyone who needs to know what can be bought without being
-- shown the internals. Customers get availability; how much is physically on a
-- shelf versus already promised to other people stays operational information.
create view stock_availability as
  select
    product_id,
    sku,
    on_hand - reserved as available
  from stock_items;
