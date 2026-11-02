import { InjectRepository } from "@nestjs/typeorm";
import { UserSession } from "./entities/user-session.entity.js";
import { IsNull, MoreThan, Not, Repository } from "typeorm";
import { describeDevice } from "../common/device.util.js";
import { NotFoundException } from "@nestjs/common";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // must match the JWT expiry
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export class UserSessionsService {
  constructor(
    @InjectRepository(UserSession)
    private userSessionRepository: Repository<UserSession>,
  ) {}

  create(userId: string, meta: { ip?: string; userAgent?: string }) {
    const now = new Date();
    return this.userSessionRepository.save(
      this.userSessionRepository.create({
        userId,
        ipAddress: meta.ip,
        userAgent: meta.userAgent?.slice(0, 512),
        device: describeDevice(meta.userAgent),
        lastActiveAt: now,
        expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
        revokedAt: null,
      }),
    );
  }

  async validateAndTouch(sessionId: string, userId: string): Promise<boolean> {
    const session = await this.userSessionRepository.findOne({
      where: {
        id: sessionId,
        userId,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
    });
    if (!session) return false;
    if (Date.now() - session.lastActiveAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.userSessionRepository.update(session.id, {
        lastActiveAt: new Date(),
      });
    }
    return true;
  }

  async listActive(userId: string, currentSessionId: string) {
    const sessions = await this.userSessionRepository.find({
      where: { userId, revokedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      order: { lastActiveAt: "DESC" },
    });

    return sessions.map((s) => ({
      id: s.id,
      device: s.device,
      ipAddress: s.ipAddress,
      createdAt: s.createdAt,
      lastActiveAt: s.lastActiveAt,
      current: s.id === currentSessionId,
    }));
  }

  async revoke(userId: string, sessionId: string) {
    const result = await this.userSessionRepository.update(
      { id: sessionId, userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    if (!result.affected) throw new NotFoundException("Session not found");
  }

  async revokeAllExcept(userId: string, keepSessionId: string) {
    await this.userSessionRepository.update(
      {
        userId,
        revokedAt: IsNull(),
        id: Not(keepSessionId),
      },
      { revokedAt: new Date() },
    );
  }
}
