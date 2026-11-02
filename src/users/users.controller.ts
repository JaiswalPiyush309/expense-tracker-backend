import {
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  HttpCode,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import "multer";
import { UsersService } from "./users.service.js";
import { SettingsService } from "./settings.service.js";
import { UserSessionsService } from "./user-sessions.service.js";
import { DataRequestsService } from "./data-requests.service.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthUser } from "../auth/current-user.decorator.js";
import { UpdateProfileDTO } from "./dto/update-profile.dto.js";
import { DeleteRequestDTO } from "./dto/delete-request.dto.js";
import { ChangePasswordDto } from "./dto/change-password.dto.js";
import { UpdateNotificationsDTO } from "./dto/update-notifications.dto.js";
import { UpdatePreferencesDTO } from "./dto/update-preferences.dto.js";
import { FileInterceptor } from "@nestjs/platform-express";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB, matches the UI hint

@Controller({ path: "users/me", version: "1" }) // => /api/v1/users/me
@UseGuards(AuthGuard("jwt"))
export class UsersController {
  constructor(
    private userService: UsersService,
    private settingService: SettingsService,
    private userSessionService: UserSessionsService,
    private dataRequestService: DataRequestsService,
  ) {}

  // ---- profile ----
  @Get()
  getMe(@CurrentUser() user: AuthUser) {
    return this.userService.getProfile(user.userId);
  }

  @Patch()
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDTO) {
    return this.userService.updateProfile(user.userId, dto);
  }

  // ---- avatar ----
  @Post("avatar")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: MAX_AVATAR_BYTES } }),
  )
  uploadAvatar(
    @CurrentUser() user: AuthUser,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_AVATAR_BYTES }),
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.userService.setAvatar(user.userId, file);
  }

  @Delete("avatar")
  @HttpCode(204)
  removeAvatar(@CurrentUser() user: AuthUser) {
    return this.userService.removeAvatar(user.userId);
  }

  // ---- preferences & notifications ----
  @Get("preferences")
  getPreferences(@CurrentUser() user: AuthUser) {
    return this.settingService.getPreferences(user.userId);
  }

  @Patch("preferences")
  updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePreferencesDTO,
  ) {
    return this.settingService.updatePreferences(user.userId, dto);
  }

  @Patch("notifications")
  updateNotifications(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateNotificationsDTO,
  ) {
    return this.settingService.updateNotifications(user.userId, dto);
  }

  // ---- security ----
  @Patch("password")
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.userService.changePassword(user.userId, user.sessionId, dto);
  }

  @Get("sessions")
  listSessions(@CurrentUser() user: AuthUser) {
    return this.userSessionService.listActive(user.userId, user.sessionId);
  }

  @Delete("sessions/:id")
  @HttpCode(204)
  revokeSession(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.userSessionService.revoke(user.userId, id);
  }

  // ---- data & privacy ----
  @Post("data-export")
  @HttpCode(202)
  requestExport(@CurrentUser() user: AuthUser) {
    return this.dataRequestService.requestExport(user.userId);
  }

  @Post("delete-request")
  @HttpCode(202)
  requestDeletion(
    @CurrentUser() user: AuthUser,
    @Body() dto: DeleteRequestDTO,
  ) {
    return this.dataRequestService.requestDeletion(user.userId, dto);
  }
}
