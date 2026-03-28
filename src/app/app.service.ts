import { readFileSync } from "fs"

import { Injectable, HttpException } from "@nestjs/common"

import Wireguard from "../wireguard"

import type { CreateClientResponse, PeerMetrics } from "../intefaces/wg"

const wg = new Wireguard()

@Injectable()
export class AppService {
  health(): { success: boolean } {
    return { success: true }
  }

  async getClients(): Promise<Array<number>> {
    return await wg.getClients()
  }

  async getPeers(): Promise<{ success: boolean; peers: Array<PeerMetrics>; server_time: string }> {
    try {
      const peers = await wg.getPeers()

      return {
        success: true,
        peers,
        server_time: new Date().toISOString()
      }
    } catch (e: any) {
      throw new HttpException(e.message, 403)
    }
  }

  async addClient(id: number): Promise<{ success: boolean } & CreateClientResponse> {
    try {
      const response = await wg.newClient(id)

      const conf = readFileSync(response.conf)
      const qr = readFileSync(response.qr)

      return {
        success: true,
        conf: Buffer.from(conf).toString("base64"),
        qr: Buffer.from(qr).toString("base64"),
        already_exist: response.already_exist,
        public_key: response.public_key
      }
    } catch (e: any) {
      throw new HttpException(e.message, 403)
    }
  }

  async disableClient(id: number): Promise<{ success: boolean }> {
    try {
      await wg.disableClient(id)
      return { success: true }
    } catch (e: any) {
      throw new HttpException(e.message, 403)
    }
  }

  async enableClient(id: number, publicKey: string): Promise<{ success: boolean }> {
    try {
      await wg.enableClient(id, publicKey)
      return { success: true }
    } catch (e: any) {
      throw new HttpException(e.message, 403)
    }
  }
}
