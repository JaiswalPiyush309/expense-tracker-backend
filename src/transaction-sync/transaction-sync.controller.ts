import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Headers,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

import { TransactionSyncService } from "./transaction-sync.service.js";
import { RegisterDeviceDTO } from "./dto/register-device.dto.js";
import { ImportTransactionDTO } from "./dto/import-transaction.dto.js";

interface AuthenticatedRequest {
  user: {
    userId?: string;
    sub?: string;
  };
}

@Controller("api/v1/transaction-sync")
@UseGuards(AuthGuard("jwt"))
export class TransactionSyncController {
  constructor(
    private readonly transactionSyncService: TransactionSyncService,
  ) {}

  @Post("register-device")
  async registerDevice(
    @Req() req: AuthenticatedRequest,
    @Body() dto: RegisterDeviceDTO,
  ) {
    const userId = req.user.userId ?? req.user.sub;

    if (!userId) {
      throw new Error("Authenticated user ID is missing");
    }

    return this.transactionSyncService.registerDevice(userId, dto);
  }

  @Post("import")
  async importTransaction(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ImportTransactionDTO,
    @Headers("x-device-token") deviceToken?: string,
  ) {
    const userId = req.user.userId ?? req.user.sub;

    if (!userId) {
      throw new Error("Authenticated user ID is missing");
    }

    return this.transactionSyncService.importTransaction(
      userId,
      dto,
      deviceToken,
    );
  }
}
