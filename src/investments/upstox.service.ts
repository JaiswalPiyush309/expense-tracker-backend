import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { MoreThan, Repository } from "typeorm";
import { BrokerConnection } from "./entities/broker-connection.entity.js";
import axios from "axios";

@Injectable()
export class UpstoxService {
  private readonly logger = new Logger(UpstoxService.name);
  private readonly baseUrl = "https://api.upstox.com/v2";

  // In a real app, store this in a database or Redis, as it expires daily.
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly redirectUri: string;

  constructor(
    @InjectRepository(BrokerConnection)
    private brokerRepo: Repository<BrokerConnection>,
  ) {
    this.apiKey = this.requireConfig("UPSTOX_API_KEY");
    this.apiSecret = this.requireConfig("UPSTOX_API_SECRET");
    this.redirectUri = this.requireConfig("UPSTOX_REDIRECT_URI");
  }

  // 1. Generate the URL for the frontend button "Login to Upstox"
  getLoginUrl(): string {
    return `${this.baseUrl}/login/authorization/dialog?response_type=code&client_id=${this.apiKey}&redirect_uri=${this.redirectUri}`;
  }

  // 2. Exchange the authorization code for the daily access token
  async processCallbackCode(userId: string, code: string): Promise<void> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/login/authorization/token`,
        new URLSearchParams({
          code,
          client_id: this.apiKey,
          client_secret: this.apiSecret,
          redirect_uri: this.redirectUri,
          grant_type: "authorization_code",
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      );

      const { access_token } = response.data;

      // Tokens usually expire at 2:00 AM the next day. Setting strict 24h for safety.
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      // Upsert the token into the database
      let connection = await this.brokerRepo.findOne({
        where: { userId, brokerName: "UPSTOX" },
      });
      if (!connection) {
        connection = this.brokerRepo.create({ userId, brokerName: "UPSTOX" });
      }

      connection.accessToken = access_token;
      connection.expiresAt = expiresAt;
      await this.brokerRepo.save(connection);

      this.logger.log(`Upstox token secured for user ${userId}`);
    } catch (error) {
      const details = axios.isAxiosError(error)
        ? error.response?.data ?? error.message
        : error instanceof Error
          ? error.message
          : String(error);
      this.logger.error("Failed to exchange Upstox authorization code", details);
      throw new HttpException(
        "Upstox Authentication Failed",
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // 3. Securely fetch quotes using the DB-stored token
  async getMarketQuotes(
    userId: string,
    instrumentKeys: string[],
  ): Promise<Record<string, any>> {
    // Fetch a valid, unexpired token directly from the database
    const connection = await this.brokerRepo.findOne({
      where: {
        userId,
        brokerName: "UPSTOX",
        expiresAt: MoreThan(new Date()), // Ensure token is not expired
      },
    });

    if (!connection) {
      this.logger.warn(
        `No valid Upstox token found for user ${userId}. Prompt user to re-authenticate.`,
      );
      throw new HttpException(
        "Broker Re-authentication Required",
        HttpStatus.PRECONDITION_FAILED,
      );
    }

    try {
      const keysParam = instrumentKeys.join(",");
      const response = await axios.get(`${this.baseUrl}/market-quote/quotes`, {
        params: { instrument_key: keysParam },
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
          Accept: "application/json",
        },
      });

      return response.data.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        // Token was revoked or expired server-side before our DB expiry
        await this.brokerRepo.remove(connection);
        throw new HttpException(
          "Broker Re-authentication Required",
          HttpStatus.PRECONDITION_FAILED,
        );
      }
      throw new HttpException(
        "Failed to fetch market data",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private requireConfig(name: string): string {
    const value = process.env[name];
    if (!value) {
      throw new Error(`${name} must be configured.`);
    }
    return value;
  }
}
