import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { InvestmentsService } from "./investments.service.js";
import { CreateTradeDTO } from "./dto/create-trade.dto.js";
import { GrowwImportService } from "./groww-import.service.js";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  HoldingResponseDTO,
  ShareMarketDashboardDTO,
} from "./interfaces/dashboard-metrics.interface.js";
import { AuthUser, CurrentUser } from "../auth/current-user.decorator.js";

@Controller("investments")
@UseGuards(AuthGuard("jwt"))
export class InvestmentsController {
  constructor(
    private readonly investmentsService: InvestmentsService,
    private readonly growwImportService: GrowwImportService,
  ) {}

  @Post("trade")
  async processTrade(
    @Body() createTradeDto: CreateTradeDTO,
    @CurrentUser() user: AuthUser,
  ) {
    createTradeDto.userId = user.userId;
    const transaction =
      await this.investmentsService.processTrade(createTradeDto);

    return {
      message: "Trade processed successfully",
      data: transaction,
    };
  }

  @Post("import/groww")
  @UseInterceptors(FileInterceptor("file"))
  async importGrowwTrades(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) {
      throw new BadRequestException("Groww export file is required.");
    }

    const importResults = await this.growwImportService.processTradeBook(
      user.userId,
      file.buffer,
    );

    return {
      message: "Groww import completed",
      data: importResults,
    };
  }

  @Get("dashboard")
  async getDashboardMetrics(
    @CurrentUser() user: AuthUser,
  ): Promise<ShareMarketDashboardDTO> {
    return this.investmentsService.getDashboardMetrics(user.userId);
  }

  @Get("holdings")
  async getHoldings(
    @CurrentUser() user: AuthUser,
  ): Promise<HoldingResponseDTO[]> {
    return this.investmentsService.getHoldings(user.userId);
  }
}
