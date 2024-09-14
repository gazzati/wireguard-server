import { readFileSync } from "fs"

import { Injectable } from "@nestjs/common"

import Wireguard from "../wireguard"

import type {CreateClientResponse} from "../intefaces/wg"

const wg = new Wireguard()

@Injectable()
export class AppService {
  health(): { success: boolean } {
    return { success: true }
  }

  async getClients(): Promise<Array<number>> {
    return await wg.getClients()
  }

  async addClient(id: number): Promise<{ success: boolean } & CreateClientResponse> {
    const response = await wg.newClient(id)

    const conf = readFileSync(response.conf);
    const qr = readFileSync(response.qr);

    return {
      success: true,
      conf: Buffer.from(conf).toString('base64'),
      qr: Buffer.from(qr).toString('base64'),
      already_exist: response?.already_exist
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
}
