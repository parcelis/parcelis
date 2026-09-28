import { Module, OnApplicationShutdown } from "@nestjs/common";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { BullBoardModule } from "@bull-board/nestjs";
import { ExpressAdapter } from "@bull-board/express";
import type { NextFunction, Request, Response } from "express";
import { createQueueRegistry, getRedisConnectionOptions } from "@parcelis/jobs";
import { createJobDashboardAuthMiddleware } from "./job-dashboard-auth.middleware";
import {
  jobDashboardFavIcon,
  jobDashboardLightLogoUrl,
  jobDashboardLogoMiddleware,
} from "./job-dashboard-logo.middleware";
import { jobDashboardRedactionMiddleware, sanitizeJobData } from "./job-dashboard-redaction.middleware";
import { PrismaModule } from "./prisma.module";
import { PrismaService } from "./prisma.service";

const queues = createQueueRegistry(getRedisConnectionOptions());

class JobDashboardBullMQAdapter extends BullMQAdapter {
  constructor(queue: ConstructorParameters<typeof BullMQAdapter>[0]) {
    super(queue);
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
          boardOptions: {
            uiConfig: {
              boardTitle: "Parcelis Jobs",
              boardLogo: { path: jobDashboardLightLogoUrl, width: 36, height: 36 },
              favIcon: jobDashboardFavIcon,
              hideDocsLink: true,
              hideRedisDetails: true,
              theme: {
                light: {
                  background: "#f7f8f6",
                  foreground: "#101c29",
                  card: "#ffffff",
                  "card-foreground": "#101c29",
                  popover: "#ffffff",
                  "popover-foreground": "#101c29",
                  primary: "#6fa640",
                  "primary-foreground": "#101c29",
                  secondary: "#e9eee7",
                  "secondary-foreground": "#101c29",
                  muted: "#eef0ed",
                  "muted-foreground": "#586273",
                  accent: "#eaf1e5",
                  "accent-foreground": "#101c29",
                  border: "#dce1dc",
                  input: "#dce1dc",
                  ring: "#6fa640",
                  radius: "0.5rem",
                  sidebar: "#101c29",
                  "sidebar-foreground": "#f7f8f6",
                  "sidebar-primary": "#6fa640",
                  "sidebar-primary-foreground": "#101c29",
                  "sidebar-accent": "#172635",
                  "sidebar-accent-foreground": "#f7f8f6",
                  "sidebar-border": "#35464a",
                  "sidebar-ring": "#6fa640",
                },
                dark: {
                  background: "#101c29",
                  foreground: "#f7f8f6",
                  card: "#172635",
                  "card-foreground": "#f7f8f6",
                  popover: "#172635",
                  "popover-foreground": "#f7f8f6",
                  primary: "#89b960",
                  "primary-foreground": "#101c29",
                  secondary: "#233647",
                  "secondary-foreground": "#f7f8f6",
                  muted: "#233647",
                  "muted-foreground": "#b3bec8",
                  accent: "#263d50",
                  "accent-foreground": "#f7f8f6",
                  border: "#35464a",
                  input: "#35464a",
                  ring: "#89b960",
                  radius: "0.5rem",
                  sidebar: "#101c29",
                  "sidebar-foreground": "#f7f8f6",
                  "sidebar-primary": "#89b960",
                  "sidebar-primary-foreground": "#101c29",
                  "sidebar-accent": "#172635",
                  "sidebar-accent-foreground": "#f7f8f6",
                  "sidebar-border": "#35464a",
                  "sidebar-ring": "#89b960",
                },
              },
            },
          },
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
