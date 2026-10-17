import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { isAdminApiKey } from "@/lib/api-key";

@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const bearerToken = context
      .switchToHttp()
      .getRequest<Request>()
      .get("Authorization")
      ?.replace("Bearer ", "");
    if (!isAdminApiKey(bearerToken)) {
      throw new UnauthorizedException("AdminApiKeyGuard - Invalid admin API key");
    }

    return true;
  }
}
