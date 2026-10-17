import "./instrument";

import {
  CAL_API_VERSION_HEADER,
  VERSION_2024_04_15,
  VERSION_2024_06_11,
  VERSION_2024_06_14,
  VERSION_2024_08_13,
  VERSION_2024_09_04,
  X_CAL_CLIENT_ID,
  X_CAL_PLATFORM_EMBED,
  X_CAL_SECRET_KEY,
} from "@calcom/platform-constants";
import type { ValidationError } from "@nestjs/common";
import { BadRequestException, Logger, ValidationPipe, VersioningType } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { CalendarServiceExceptionFilter } from "./filters/calendar-service-exception.filter";
import { TRPCExceptionFilter } from "./filters/trpc-exception.filter";
import { HttpExceptionFilter } from "@/filters/http-exception.filter";
import { PrismaExceptionFilter } from "@/filters/prisma-exception.filter";
import { ZodExceptionFilter } from "@/filters/zod-exception.filter";

const logger: Logger = new Logger("Bootstrap");

// This instance only serves the chatbot server, so every other route stays disabled.
const ALLOWED_ROUTES = /^(\/api)?\/v2\/(users|me|bookings|schedules|event-types|slots)(\/|$)/;

// The cal-api-version header is ignored so every route always runs its newest version.
const LATEST_ROUTE_VERSIONS: Record<string, string> = {
  bookings: VERSION_2024_08_13,
  schedules: VERSION_2024_06_11,
  "event-types": VERSION_2024_06_14,
  slots: VERSION_2024_09_04,
};

export const bootstrap = (app: NestExpressApplication): NestExpressApplication => {
  try {
    app.use((req: Request, res: Response, next: NextFunction) =>
      req.path === "/health" || ALLOWED_ROUTES.test(req.path) ? next() : res.sendStatus(404)
    );

    if (!process.env.VERCEL) {
      app.enableShutdownHooks();
    }
    app.enableVersioning({
      type: VersioningType.CUSTOM,
      extractor: (request: unknown) => {
        const route = (request as Request).path.match(/\/v2\/([^/]+)/)?.[1] ?? "";
        return LATEST_ROUTE_VERSIONS[route] ?? VERSION_2024_09_04;
      },
      defaultVersion: VERSION_2024_04_15,
    });
    app.use(helmet());
    app.enableCors({
      origin: "*",
      methods: ["GET", "PATCH", "DELETE", "HEAD", "POST", "PUT", "OPTIONS"],
      allowedHeaders: [
        X_CAL_CLIENT_ID,
        X_CAL_SECRET_KEY,
        X_CAL_PLATFORM_EMBED,
        CAL_API_VERSION_HEADER,
        "Accept",
        "Authorization",
        "Content-Type",
        "Origin",
      ],
      maxAge: 86_400,
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        validationError: {
          target: true,
          value: true,
        },
        exceptionFactory(errors: ValidationError[]): BadRequestException {
          return new BadRequestException({ errors });
        },
      })
    );
    // Exception filters, new filters go at the bottom, keep the order
    app.useGlobalFilters(new PrismaExceptionFilter());
    app.useGlobalFilters(new ZodExceptionFilter());
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalFilters(new TRPCExceptionFilter());
    app.useGlobalFilters(new CalendarServiceExceptionFilter());
    app.use(cookieParser());

    if (process?.env?.API_GLOBAL_PREFIX) {
      app.setGlobalPrefix(process?.env?.API_GLOBAL_PREFIX);
    }

    return app;
  } catch (error) {
    logger.error("Error starting NestJS app:", error);
    throw error;
  }
};
