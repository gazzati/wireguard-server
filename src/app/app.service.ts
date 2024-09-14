import { Injectable } from "@nestjs/common"

import Wireguard from "../wireguard"

const wg = new Wireguard()

@Injectable()
export class AppService {
  health(): { success: boolean } {
    return { success: true }
  }

  async getClients(): Promise<Array<number>> {
    return await wg.getClients()
  }

  async addClient(id: number): Promise<{ success: boolean }> {
    await wg.newClient(id)
    return { success: true }
  }

  async deleteClient(id: number): Promise<{ success: boolean }> {
    try {
      await wg.revokeClient(id)
      return { success: true }
    } catch (e: any) {
      throw Error(e.message)
    }
  }
}
