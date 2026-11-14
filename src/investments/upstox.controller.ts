import { Controller, Get, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthUser } from "../auth/current-user.decorator.js";
import { UpstoxService } from "./upstox.service.js";

@Controller("broker/upstox")
export class UpstoxController {
  constructor(private readonly upstoxService: UpstoxService) {}

  @Get("login")
  getLoginUrl() {
    return { url: this.upstoxService.getLoginUrl() };
  }

  // Upstox redirects the user here after successful login
  @Get("callback")
  async handleCallback(
    @CurrentUser() user: AuthUser,
    @Query("code") code: string,
    @Res() res: Response,
  ) {
    if (!code) {
      return res.redirect(
        "https://ledgerflow.yourdomain.com/settings?error=missing_code",
      );
    }

    await this.upstoxService.processCallbackCode(user.userId, code);

    // Redirect back to your Next.js frontend dashboard
    return res.redirect(
      "https://ledgerflow.yourdomain.com/investments?sync=success",
    );
  }
}
