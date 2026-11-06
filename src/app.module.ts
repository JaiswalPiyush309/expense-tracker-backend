import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UsersModule } from "./users/users.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { DashboardModule } from "./dashboard/dashboard.module.js";
import { TransactionsModule } from "./transactions/transactions.module.js";
import { CategoriesModule } from "./categories/categories.module.js";
import { AccountsModule } from "./accounts/accounts.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        host: config.get("DB_HOST"),
        port: Number(config.get<string>("DB_PORT")),
        username: config.get("DB_USER"),
        password: config.get("DB_PASSWORD"),
        database: config.get("DB_NAME"),
        autoLoadEntities: true,
        synchronize: true, // DEV ONLY
        retryAttempts: 1,
        retryDelay: 1000,
        logging: ["error", "warn"],
        ssl: {
          rejectUnauthorized: true,
        },
      }),
    }),
    UsersModule,
    AuthModule,
    DashboardModule,
    TransactionsModule,
    CategoriesModule,
    AccountsModule,
  ],
})
export class AppModule {}
