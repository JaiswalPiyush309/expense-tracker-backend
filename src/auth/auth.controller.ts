import { Body, Controller, Post } from "@nestjs/common";
import { AuthService } from "./auth.service.js";
import { RegisterDTO } from "./dto/register.dto.js";
import { LoginDTO } from "./dto/login.dto.js";

@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post("register")
  register(@Body() dto: RegisterDTO) {
    return this.authService.register(dto);
  }

  @Post("login")
  login(@Body() dto: LoginDTO) {
    return this.authService.login(dto);
  }
}
