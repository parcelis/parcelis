import { Module, OnApplicationShutdown } from "@nestjs/common";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { BullBoardModule } from "@bull-board/nestjs";
import { ExpressAdapter } from "@bull-board/express";
import type { NextFunction, Request, Response } from "express";
import { createQueueRegistry, getRedisConnectionOptions } from "@parcelis/jobs";
import { createJobDashboardAuthMiddleware } from "./job-dashboard-auth.middleware";
import { jobDashboardRedactionMiddleware, sanitizeJobData } from "./job-dashboard-redaction.middleware";
import { PrismaModule } from "./prisma.module";
import { PrismaService } from "./prisma.service";

const queues = createQueueRegistry(getRedisConnectionOptions());

class ReadOnlyBullMQAdapter extends BullMQAdapter {
  constructor(queue: ConstructorParameters<typeof BullMQAdapter>[0]) {
    super(queue, { readOnlyMode: true });
    this.setFormatter("data", sanitizeJobData);
    this.setFormatter("progress", () => "[redacted]");
    this.setFormatter("returnValue", () => "[redacted]");
  }
}

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
          middleware: (request: Request, response: Response, next: NextFunction) => {
            jobDashboardRedactionMiddleware(request, response, (error) => {
              if (error) return next(error);
              return authMiddleware(request, response, next);
            });
          },
          boardOptions: { uiConfig: { boardTitle: "Parcelis Jobs", hideRedisDetails: true } },
        };
      },
    }),
    BullBoardModule.forFeature(
      ...Object.values(queues).map((queue) => ({
        queue,
        adapter: ReadOnlyBullMQAdapter,
        options: { readOnlyMode: true },
      })),
    ),
  ],
  providers: [JobQueueShutdown],
})
export class JobDashboardModule {}
