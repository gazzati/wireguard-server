import { Logger } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"

import { AppModule } from "./app/app.module"
import { config } from "./config"

async function bootstrap() {
  const logger = new Logger()

  const app = await NestFactory.create(AppModule, { logger: false })
  await app.listen(config.port)

  app.useLogger(logger)
  logger.log(`Application listening on port ${config.port}`)
}
bootstrap()
