import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  DEFAULT_NOTIFICATIONS,
  UserSettings,
} from "./entities/user-settings.entity.js";
import { Repository } from "typeorm";
import { UpdatePreferencesDTO } from "./dto/update-preferences.dto.js";
import { UpdateNotificationsDTO } from "./dto/update-notifications.dto.js";

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(UserSettings)
    private userSettingRepository: Repository<UserSettings>,
  ) {}

  /** Returns the user's settings row, creating it with defaults on first access. */
  private async getOrCreate(userId: string): Promise<UserSettings> {
    let settings = await this.userSettingRepository.findOne({
      where: { userId },
    });

    if (!settings) {
      // orIgnore: two simultaneous first requests won't crash on the primary key
      await this.userSettingRepository
        .createQueryBuilder()
        .insert()
        .values({ userId, notifications: { ...DEFAULT_NOTIFICATIONS } })
        .orIgnore()
        .execute();
      settings = await this.userSettingRepository.findOneOrFail({
        where: { userId },
      });
    }
    return settings;
  }

  private toPreferences(s: UserSettings) {
    return {
      currency: s.currency,
      fiscalYearStartMonth: s.fiscalYearStartMonth,
      dateFormat: s.dateFormat,
      numberFormat: s.numberFormat,
      timezone: s.timezone,
      language: s.language,
      notifications: s.notifications,
    };
  }

  async getPreferences(userId: string) {
    return this.toPreferences(await this.getOrCreate(userId));
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDTO) {
    if (dto.timezone) {
      try {
        new Intl.DateTimeFormat("en", { timeZone: dto.timezone });
      } catch {
        throw new BadRequestException(
          'Invalid IANA timezone, e.g. "Asia/Kolkata"',
        );
      }
    }
    const settings = await this.getOrCreate(userId);
    Object.assign(settings, dto);
    return this.toPreferences(await this.userSettingRepository.save(settings));
  }

  async updateNotifications(userId: string, dto: UpdateNotificationsDTO) {
    const settings = await this.getOrCreate(userId);
    settings.notifications = { ...settings.notifications, ...dto };
    return (await this.userSettingRepository.save(settings)).notifications;
  }
}
