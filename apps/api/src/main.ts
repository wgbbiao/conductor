import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module";
import { config } from "./config";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(config.port);
  new Logger("Bootstrap").log(`Conductor API listening on :${config.port}`);
}

void bootstrap();
