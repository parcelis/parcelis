import { Injectable, NestMiddleware } from "@nestjs/common";
import { createOpenApiExpressMiddleware } from "trpc-to-openapi";
import type { NextFunction, Request, Response } from "express";
import { PrismaService } from "../modules/prisma.service";
import { createContext } from "./context";
import { publicRouter } from "./public.router";

@Injectable()
export class OpenApiMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  use(req: Request, res: Response, _next: NextFunction) {
    return createOpenApiExpressMiddleware({
      router: publicRouter,
      createContext: createContext(this.prisma),
    })(req, res);
  }
}
