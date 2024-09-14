import { Injectable, NestMiddleware, Logger } from "@nestjs/common"
import { Request, Response, NextFunction } from "express"

const logger = new Logger()

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const { method, path: url, ip } = req

    res.on("close", () => {
      const { statusCode } = res

      logger.log(`${method} ${url} - ${statusCode} ${ip}`)
    })

    if (next) {
      next()
    }
  }
}
