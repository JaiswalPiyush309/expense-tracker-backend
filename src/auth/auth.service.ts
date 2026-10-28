import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UsersService } from "../users/users.service.js";
import { RegisterDTO } from "./dto/register.dto.js";
import bcrypt from "bcryptjs";
import { LoginDTO } from "./dto/login.dto.js";

@Injectable()
export class AuthService {
  constructor(
    private userService: UsersService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDTO) {
    const existingUser = await this.userService.findByEmail(dto.email);

    if (existingUser) {
      throw new ConflictException("Email already registered");
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const savedUser = await this.userService.create({
      email: dto.email,
      password: hashedPassword,
      name: dto.name,
    });

    return { id: savedUser.id, name: savedUser.name, email: savedUser.email };
  }

  async login(dto: LoginDTO) {
    const user = await this.userService.findByEmail(dto.email);

    if (!user) {
      throw new UnauthorizedException(
        "No account exists with this email. Please create an account first.",
      );
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException("Incorrect email or password.");
    }

    const payload = { sub: user.id, email: user.email };

    return {
      access_token: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }
}
