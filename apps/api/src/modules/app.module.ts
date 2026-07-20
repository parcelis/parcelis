import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { TrpcMiddleware } from "../router/trpc.middleware";
import { PrismaService } from "./prisma.service";

@Module({
  providers: [PrismaService, TrpcMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TrpcMiddleware).forRoutes("trpc", "trpc/*");
  }
}
