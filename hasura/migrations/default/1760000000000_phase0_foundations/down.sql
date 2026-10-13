drop table if exists idempotency_keys;
alter table orders drop column if exists version;
alter table users drop constraint if exists users_role_check;
update users set role = 'admin' where role = 'business_admin';
alter table users add constraint users_role_check
  check (role in ('customer', 'ops', 'admin'));
