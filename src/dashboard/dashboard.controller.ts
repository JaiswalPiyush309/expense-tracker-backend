import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { DashboardService } from "./dashboard.service.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { DashboardQueryDTO } from "./dto/dashboard-query.dto.js";

@Controller("dashboard")
@UseGuards(AuthGuard("jwt"))
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("summary")
  getSummary(
    @CurrentUser() user: { id: string },
    @Query() query: DashboardQueryDTO,
  ) {
    return this.dashboardService.getDashboardSummary(user.id, query);
  }
}
