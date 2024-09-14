import { Injectable, NestMiddleware, Logger } from "@nestjs/common"
import { Request, Response, NextFunction } from "express"

const logger = new Logger()

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
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
