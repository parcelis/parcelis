import { Injectable, NestMiddleware } from "@nestjs/common";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import type { NextFunction, Request, Response } from "express";
import { PrismaService } from "../modules/prisma.service";
import { appRouter } from "./app.router";
import { createContext } from "./context";

function normalizeProcedurePath(req: Request) {
  const queryIndex = req.url.indexOf("?");
  const pathname = queryIndex === -1 ? req.url : req.url.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : req.url.slice(queryIndex);
  const apiPrefix = "/api/";

  if (!pathname.startsWith(apiPrefix)) {
    return;
  }

  const procedurePath = pathname.slice(apiPrefix.length);

  if (!procedurePath.includes("/")) {
    return;
  }

  req.url = `${apiPrefix}${procedurePath.replaceAll("/", ".")}${query}`;
}

@Injectable()
export class TrpcMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  use(req: Request, res: Response, next: NextFunction) {
    normalizeProcedurePath(req);

    return createExpressMiddleware({
      router: appRouter,
      createContext: createContext(this.prisma),
    })(req, res, next);
  }
}
