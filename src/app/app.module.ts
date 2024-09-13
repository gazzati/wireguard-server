import {
  Module,
  NestModule,
  RequestMethod,
  MiddlewareConsumer,
  Injectable,
  NestMiddleware,
  Logger
} from "@nestjs/common"
import { Request, Response, NextFunction } from "express"

import { AppController } from "./app.controller"
import { AppService } from "./app.service"

const logger = new Logger()

@Injectable()
class LoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const { method, path: url } = req

    res.on("close", () => {
      const { statusCode } = res

      logger.log(`${method} ${url} - ${statusCode}`)
    })

    if (next) {
      next()
    }
  }
}

@Module({
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes({ path: "*", method: RequestMethod.ALL })
  }
}
