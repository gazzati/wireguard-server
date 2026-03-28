import { Controller, Get, Delete, Post, Param, Body } from "@nestjs/common"

import { AppService } from "./app.service"
import type { PeerMetrics } from "../intefaces/wg"

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get("/health")
  health(): { success: boolean } {
    return this.appService.health()
  }

  @Get("/clients")
  getClients(): Promise<Array<number>> {
    return this.appService.getClients()
  }

  @Get("/peers")
  getPeers(): Promise<{ success: boolean; peers: Array<PeerMetrics>; server_time: string }> {
    return this.appService.getPeers()
  }

  @Post("/client")
  addClient(
    @Body() payload: { id: number }
  ): Promise<{
    success: boolean
    conf: string
    qr: string
    public_key: string
    already_exist?: boolean
  }> {
    return this.appService.addClient(payload.id)
  }

  @Delete("/client/:id")
  disableClient(@Param("id") id: number): Promise<{ success: boolean }> {
    return this.appService.disableClient(id)
  }

  @Post("/client/enable")
  enableClient(@Body() payload: { id: number; public_key: string }): Promise<{ success: boolean }> {
    return this.appService.enableClient(payload.id, payload.public_key)
  }
}
