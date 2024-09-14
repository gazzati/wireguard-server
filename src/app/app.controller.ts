import { Controller, Get, Delete, Post, Param, Body, StreamableFile } from "@nestjs/common"

import { AppService } from "./app.service"

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

  @Post("/client")
  addClient(@Body() payload: { id: number }): Promise<StreamableFile> {
    return this.appService.addClient(payload.id)
  }

  @Delete("/client/:id")
  deleteClient(@Param("id") id: number): Promise<{ success: boolean }> {
    return this.appService.deleteClient(id)
  }
}
