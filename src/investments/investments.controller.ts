import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { InvestmentsService } from "./investments.service.js";
import { CreateTradeDTO } from "./dto/create-trade.dto.js";
import { GrowwImportService } from "./groww-import.service.js";
import { FileInterceptor } from "@nestjs/platform-express";

@Controller("investments")
@UseGuards(AuthGuard("jwt"))
export class InvestmentsController {
  constructor(
    private readonly investmentsService: InvestmentsService,
    private readonly growwImportService: GrowwImportService,
  ) {}

  @Post("trade")
  async processTrade(@Body() createTradeDto: CreateTradeDTO, @Req() req: any) {
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
    @Body("userId") userId: string, // In production, get this from @Req() req.user.id
  ) {
    if (!file) {
      throw new BadRequestException("Groww export file is required.");
    }

    const importResults = await this.growwImportService.processTradeBook(
      userId,
      file.buffer,
    );

    return {
      message: "Groww import completed",
      data: importResults,
    };
  }
}
