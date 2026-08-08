import "./load-env";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./modules/app.module";

async function bootstrap() {
  process.env.DATABASE_URL ??= `postgresql://parcelis:parcelis@localhost:${process.env.POSTGRES_PORT ?? 54320}/parcelis?schema=public`;

  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? `http://localhost:${process.env.WEB_PORT ?? 30000}`,
    credentials: true,
  });

  const port = Number(process.env.API_PORT ?? 40010);
  await app.listen(port);
  console.log(`Parcelis API listening on http://localhost:${port}`);
}

bootstrap();
