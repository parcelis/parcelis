import { Module, OnApplicationShutdown } from "@nestjs/common";
import { BullBoardModule } from "@bull-board/nestjs";
import { ExpressAdapter } from "@bull-board/express";
import type { NextFunction, Request, Response } from "express";
import { createQueueRegistry, getRedisConnectionOptions } from "@parcelis/jobs";
import { createJobDashboardAuthMiddleware } from "./job-dashboard-auth.middleware";
import { jobDashboardLogoMiddleware } from "./job-dashboard-logo.middleware";
import { jobDashboardRedactionMiddleware } from "./job-dashboard-redaction.middleware";
import { JobDashboardBullMQAdapter } from "./job-dashboard-queue-adapter";
import { jobDashboardOptions } from "./job-dashboard-options";
import { PrismaModule } from "./prisma.module";
import { PrismaService } from "./prisma.service";

const queues = createQueueRegistry(getRedisConnectionOptions());

class JobQueueShutdown implements OnApplicationShutdown {
  async onApplicationShutdown() {
    await Promise.all(Object.values(queues).map((queue) => queue.close()));
  }
}

@Module({
  imports: [
    BullBoardModule.forRootAsync({
      imports: [PrismaModule],
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => {
        const authMiddleware = createJobDashboardAuthMiddleware(prisma);

        return {
          route: "/admin/jobs",
          adapter: ExpressAdapter,
          boardOptions: jobDashboardOptions,
          middleware: (request: Request, response: Response, next: NextFunction) => {
            jobDashboardRedactionMiddleware(request, response, (error) => {
              if (error) return next(error);
              jobDashboardLogoMiddleware(request, response, (logoError) => {
                if (logoError) return next(logoError);
                return authMiddleware(request, response, next);
              });
            });
          },
        };
      },
    }),
    BullBoardModule.forFeature(
      ...Object.values(queues).map((queue) => ({
        queue,
        adapter: JobDashboardBullMQAdapter,
      })),
    ),
  ],
  providers: [JobQueueShutdown],
})
export class JobDashboardModule {}
