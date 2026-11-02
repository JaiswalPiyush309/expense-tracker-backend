import { ConflictException, Injectable } from "@nestjs/common";
import {
  DataRequest,
  DataRequestStatus,
  DataRequestType,
} from "./entities/data-request.entity.js";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { UsersService } from "./users.service.js";
import { DeleteRequestDTO } from "./dto/delete-request.dto.js";

const DELETION_GRACE_DAYS = 30;
const OPEN = [DataRequestStatus.PENDING, DataRequestStatus.PROCESSING];

@Injectable()
export class DataRequestsService {
  constructor(
    @InjectRepository(DataRequest)
    private dataRequestRepository: Repository<DataRequest>,
    private userService: UsersService,
  ) {}

  private view(r: DataRequest, message: string) {
    return {
      id: r.id,
      type: r.type,
      status: r.status,
      requestedAt: r.createdAt,
      scheduledFor: r.scheduledFor ?? null,
      message,
    };
  }

  async requestExport(userId: string) {
    const open = await this.dataRequestRepository.findOne({
      where: { userId, type: DataRequestType.EXPORT, status: In(OPEN) },
    });

    if (open) {
      throw new ConflictException("An export is already in progress");
    }

    // A background worker (queue/cron) picks up PENDING rows, builds the file and emails a link.
    const request = await this.dataRequestRepository.save(
      this.dataRequestRepository.create({
        userId,
        type: DataRequestType.EXPORT,
      }),
    );

    return this.view(
      request,
      "Export requested. We will email you a download link when it is ready.",
    );
  }

  async requestDeletion(userId: string, dto: DeleteRequestDTO) {
    await this.userService.verifyPassword(userId, dto.password);

    const open = await this.dataRequestRepository.findOne({
      where: { userId, type: DataRequestType.DELETE, status: In(OPEN) },
    });

    if (open) {
      throw new ConflictException("A deletion request is already pending");
    }

    const scheduledFor = new Date(
      Date.now() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000,
    );
    const request = await this.dataRequestRepository.save(
      this.dataRequestRepository.create({
        userId,
        type: DataRequestType.DELETE,
        reason: dto.reason,
        scheduledFor,
      }),
    );

    return this.view(
      request,
      `Deletion scheduled in ${DELETION_GRACE_DAYS} days. You can cancel before then.`,
    );
  }
}
