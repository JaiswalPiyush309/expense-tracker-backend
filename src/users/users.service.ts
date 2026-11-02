import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "./entities/user.entity.js";
import { basename, join } from "path";
import { ConfigService } from "@nestjs/config";
import { UserSessionsService } from "./user-sessions.service.js";
import { UpdateProfileDTO } from "./dto/update-profile.dto.js";
import { mkdir, unlink, writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { ChangePasswordDto } from "./dto/change-password.dto.js";

const AVATAR_DIR = join(process.cwd(), "uploads", "avatars");
const AVATAR_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private userRepository: Repository<User>,
    private userSessionService: UserSessionsService,
    private configService: ConfigService,
  ) {}

  create(data: { name: string; email: string; password: string }) {
    const [firstName, ...rest] = data.name.trim().split(/\s+/);

    const user = this.userRepository.create({
      ...data,
      firstName,
      lastName: rest.join(" ") || undefined,
      displayName: data.name,
    });
    return this.userRepository.save(user);
  }

  findByEmail(email: string) {
    return this.userRepository.findOne({ where: { email } });
  }

  findById(id: string) {
    return this.userRepository.findOne({ where: { id } });
  }

  private async getOrFail(id: string) {
    const user = await this.findById(id);

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return user;
  }

  private avatarUrl(file: string) {
    return `${this.configService.get("APP_URL") ?? ""}/uploads/avatars/${file}`;
  }

  /** The only place a User becomes API output, so `password` can never leak. */
  private toProfile(u: User) {
    return {
      id: u.id,
      firstName: u.firstName ?? null,
      lastName: u.lastName ?? null,
      displayName: u.displayName ?? null,
      email: u.email,
      phone: u.phone ?? null,
      phoneVerified: u.phoneVerified,
      dateOfBirth: u.dateOfBirth ?? null,
      gender: u.gender ?? null,
      country: u.country ?? null,
      state: u.state ?? null,
      city: u.city ?? null,
      postalCode: u.postalCode ?? null,
      bio: u.bio ?? null,
      designation: u.designation ?? null,
      industry: u.industry ?? null,
      avatarUrl: u.avatarFile ? this.avatarUrl(u.avatarFile) : null,
      plan: u.plan,
      kyc: {
        status: u.kycStatus,
        pan: u.panMasked ?? null,
        aadhaar: u.aadhaarMasked ?? null,
      },
      twoFactorEnabled: u.twoFactorEnabled,
      memberSince: u.createdAt,
    };
  }

  async getProfile(userId: string) {
    return this.toProfile(await this.getOrFail(userId));
  }

  async updateProfile(userId: string, dto: UpdateProfileDTO) {
    const user = await this.getOrFail(userId);

    if (dto.dateOfBirth && new Date(dto.dateOfBirth) > new Date()) {
      throw new BadRequestException("Date of birth cannot be in the future");
    }

    if (dto.phone && dto.phone !== user.phone) {
      const taken = await this.userRepository.findOne({
        where: { phone: dto.phone },
      });

      if (taken && taken.id !== userId) {
        throw new ConflictException("Phone number already in use");
      }

      user.phoneVerified = false; // a new number must be re-verified via your OTP flow
    }

    Object.assign(user, dto);
    // keep the legacy `name` column in sync with first/last name
    user.name =
      [user.firstName, user.lastName].filter(Boolean).join(" ") || user.name;

    return this.toProfile(await this.userRepository.save(user));
  }

  // ---------- avatar ----------
  async setAvatar(userId: string, file: Express.Multer.File) {
    const user = await this.getOrFail(userId);
    const ext = AVATAR_EXT[file.mimetype];

    if (!ext) {
      throw new BadRequestException("Only JPG, PNG or WebP images are allowed");
    }

    await mkdir(AVATAR_DIR, { recursive: true });

    const filename = `${userId}-${randomUUID()}${ext}`; // never use the client's file name

    await writeFile(join(AVATAR_DIR, filename), file.buffer);

    const previous = user.avatarFile;
    user.avatarFile = filename;

    await this.userRepository.save(user);

    await this.deleteAvatarFile(previous);

    return { avatarUrl: this.avatarUrl(filename) };
  }

  async removeAvatar(userId: string) {
    const user = await this.getOrFail(userId);
    const previous = user.avatarFile;
    user.avatarFile = undefined;

    await this.userRepository.save(user);

    await this.deleteAvatarFile(previous);
  }

  private async deleteAvatarFile(file?: string) {
    if (!file) {
      return;
    }

    try {
      await unlink(join(AVATAR_DIR, basename(file))); // basename() blocks path traversal
    } catch {
      /* already gone, ignore */
    }
  }

  // ---------- password ----------
  async verifyPassword(userId: string, password: string) {
    const user = await this.getOrFail(userId);
    if (!(await bcrypt.compare(password, user.password))) {
      throw new BadRequestException("Password is incorrect");
    }
  }

  async changePassword(
    userId: string,
    currentSessionId: string,
    dto: ChangePasswordDto,
  ) {
    const user = await this.getOrFail(userId);

    if (!(await bcrypt.compare(dto.currentPassword, user.password))) {
      throw new BadRequestException("Current password is incorrect");
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        "New password must be different from the current one",
      );
    }

    user.password = await bcrypt.hash(dto.newPassword, 10);

    await this.userRepository.save(user);
    await this.userSessionService.revokeAllExcept(userId, currentSessionId); // sign out every other device
    return { message: "Password updated. Other devices have been signed out." };
  }
}
