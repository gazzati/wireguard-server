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

  async addClient(id: number): Promise<{ success: boolean, alreadyExist?: boolean }> {
    const response = await wg.newClient(id)
    return {
      success: true,
      alreadyExist: response.alreadyExist
    }
  }

  async deleteClient(id: number): Promise<{ success: boolean }> {
    try {
      await wg.revokeClient(id)
      return { success: true }
    } catch (e: any) {
      throw Error(e.message)
    }
  }

  getClientConf(id: number): StreamableFile {
    const path = wg.getClientConfPath(id)

    const conf = createReadStream(path);
    return new StreamableFile(conf);
  }

  getClientQr(id: number): StreamableFile {
    const path = wg.getClientQrPath(id)

    const qr = createReadStream(path);
    return new StreamableFile(qr);
  }
}
