import { Injectable, NestMiddleware } from "@nestjs/common"
import { Request, Response, NextFunction } from "express"

import { config } from "../config"

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    if (!config.ipWhitelist.includes(req.ip) && req.params.api_token !== config.apiToken) {
      return res.status(401).send({ success: false, message: "Unauthorized" })
    }

    if (next) {
      next()
    }
  }
}
