import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { StatementImportService } from "./statement-import.service.js";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthUser } from "../auth/current-user.decorator.js";
import { UploadStatementDTO } from "./dto/upload-statement.dto.js";
import { UpdateStagedTransactionDto } from "./dto/update-staged-transaction.dto.js";

@Controller("transactions/import")
@UseGuards(AuthGuard("jwt"))
export class StatementImportController {
  constructor(
    private readonly statementImportService: StatementImportService,
  ) {}

  // 1. Upload CSV/XLSX file -> Creates Staged Batch
  @Post("upload")
  @UseInterceptors(FileInterceptor("file"))
  uploadStatement(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadStatementDTO,
  ) {
    return this.statementImportService.uploadAndStage(user.userId, file, dto);
  }

  // 2. Fetch Staged Batch with all rows for UI preview table
  @Get("batch/:id")
  getStagedBatch(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.statementImportService.getStagedBatch(user.userId, id);
  }

  // 3. User edits a single staged row (changes account, category, or amount)
  @Patch("row/:id")
  updateStagedRow(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateStagedTransactionDto,
  ) {
    return this.statementImportService.updateStagedRow(user.userId, id, dto);
  }

  // 4. User deletes/discards an unwanted staged row
  @Delete("row/:id")
  deleteStagedRow(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.statementImportService.deleteStagedRow(user.userId, id);
  }

  // 5. Final Confirmation: Move verified staged records to main Transactions table
  @Post("batch/:id/commit")
  commitBatch(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.statementImportService.commitBatch(user.userId, id);
  }
}
