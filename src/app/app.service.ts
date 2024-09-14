import { createReadStream } from "fs"

import { Injectable, StreamableFile } from "@nestjs/common"

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

  async addClient(id: number): Promise<StreamableFile> {
    const response = await wg.newClient(id)

    const file = createReadStream(response.file);
    return new StreamableFile(file);
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
