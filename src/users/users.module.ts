import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UsersService } from "./users.service.js";
import { User } from "./entities/user.entity.js";
import { UserSettings } from "./entities/user-settings.entity.js";
import { UserSession } from "./entities/user-session.entity.js";
import { DataRequest } from "./entities/data-request.entity.js";
import { UserSessionsService } from "./user-sessions.service.js";
import { DataRequestsService } from "./data-requests.service.js";

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserSettings, UserSession, DataRequest]),
  ],
  providers: [
    UsersService,
    UserSessionsService,
    UserSessionsService,
    DataRequestsService,
  ],
  exports: [UsersService],
})
export class UsersModule {}
