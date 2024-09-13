import { Injectable } from "@nestjs/common"

import Wireguard from "../wireguard"

const wg = new Wireguard()

@Injectable()
export class AppService {
  health(): { success: boolean } {
    return { success: true }
  }

  async getClients(): Promise<Array<string>> {
    return await wg.getClients()
  }

  async addClient(name: string): Promise<{ success: boolean }> {
    await wg.newClient(name)
    return { success: true }
  }

  async deleteClient(name: string): Promise<{ success: boolean }> {
    try {
      await wg.revokeClient(name)
      return { success: true }
    } catch (e: any) {
      throw Error(e.message)
    }
  }
}
