import { Module, NestModule, RequestMethod, MiddlewareConsumer } from "@nestjs/common"

import { AuthMiddleware } from "../middlewares/auth"
import { LoggerMiddleware } from "../middlewares/logger"

import { AppController } from "./app.controller"
import { AppService } from "./app.service"

@Module({
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes({ path: "*", method: RequestMethod.ALL })
    consumer.apply(AuthMiddleware).forRoutes({ path: "*", method: RequestMethod.ALL })
  }
}
