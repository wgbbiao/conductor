import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { AppModule } from "./app.module";
import { config } from "./config";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  // 统一 socket.io（非裸 ws）；实时投递，非事实源
  app.useWebSocketAdapter(new IoAdapter(app));
  await app.listen(config.port);
  new Logger("Bootstrap").log(`Conductor API listening on :${config.port}`);
}

void bootstrap();
