import { createReadStream, readFileSync } from "fs"

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

  async addClient(id: number): Promise<{ success: boolean, already_exist?: boolean }> {
    const response = await wg.newClient(id)
    return {
      success: true,
      already_exist: response?.alreadyExist
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

  getClientQr(id: number): string {
    const path = wg.getClientQrPath(id)

    const qr = readFileSync(path);
    return Buffer.from(qr).toString('base64');
  }
}
