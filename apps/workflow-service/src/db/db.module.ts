import { Module } from "@nestjs/common";
import { Pool } from "pg";
import { ConfigModule, APP_CONFIG, type ServiceConfig } from "../config/config.module.js";
import { createPool } from "./pool.js";
import { OrderRepository } from "./order.repository.js";

export const PG_POOL = Symbol("PG_POOL");

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PG_POOL,
      useFactory: (config: ServiceConfig): Pool => createPool(config.DATABASE_URL),
      inject: [APP_CONFIG],
    },
    OrderRepository,
  ],
  exports: [PG_POOL, OrderRepository],
})
export class DbModule {}
