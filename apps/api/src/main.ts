import "./load-env";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./modules/app.module";

async function bootstrap() {
  process.env.DATABASE_URL ??= `postgresql://parcelis:parcelis@localhost:${process.env.POSTGRES_PORT ?? 43103}/parcelis?schema=public`;

  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? `http://localhost:${process.env.WEB_PORT ?? 43100}`,
    credentials: true,
  });

  const port = Number(process.env.API_PORT ?? 43102);
  await app.listen(port);
  console.log(`Parcelis API listening on http://localhost:${port}`);
}

bootstrap();
