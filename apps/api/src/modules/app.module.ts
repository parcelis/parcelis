import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { TrpcMiddleware } from "../router/trpc.middleware";
import { OpenApiMiddleware } from "../router/openapi.middleware";
import { PrismaService } from "./prisma.service";

@Module({
  providers: [PrismaService, OpenApiMiddleware, TrpcMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TrpcMiddleware).forRoutes("trpc", "trpc/*splat");
    consumer.apply(OpenApiMiddleware).forRoutes("api/v1", "api/v1/*splat");
  }
}
