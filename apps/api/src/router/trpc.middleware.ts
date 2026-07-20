import { Injectable, NestMiddleware } from "@nestjs/common";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import type { NextFunction, Request, Response } from "express";
import { PrismaService } from "../modules/prisma.service";
import { appRouter } from "./app.router";
import { createContext } from "./context";

@Injectable()
export class TrpcMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  use(req: Request, res: Response, next: NextFunction) {
    return createExpressMiddleware({
      router: appRouter,
      createContext: createContext(this.prisma),
    })(req, res, next);
  }
}
