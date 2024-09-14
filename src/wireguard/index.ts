import childProcess from "child_process"
import util from "util"

import { config } from "../config"
import { CreateClientResponse } from "../intefaces/wg"
import {Logger} from '@nestjs/common';

const execute = util.promisify(childProcess.exec)

const { wgParams } = config

const logger = new Logger()

class Wireguard {
  private readonly MAX_CLIENTS = 253
  private readonly profilePath = `/etc/wireguard/${wgParams.SERVER_WG_NIC}.conf`
  private readonly clientsFolderPath = `/etc/wireguard/clients`

  public async getClients(): Promise<Array<number>> {
    const output = await this.exec(`grep -E "^### Client" ${this.profilePath} | cut -d ' ' -f 3`)
    return output
      .split("\n")
      .map(Number)
      .filter(i => i)
  }

  public async revokeClient(id: number): Promise<void> {
    if (!id || !new RegExp(/^[0-9_-]+$/).test(id.toString())) throw Error("Invalid [id] format")

    const exist = await this.exec(`grep -c -E "^### Client ${id}$" ${this.profilePath}`)
    if (!exist) throw Error(`Client ${id} not found`)

    await this.exec(`grep -E "^### Client" ${this.profilePath} | cut -d ' ' -f 3`)

    // remove [Peer] block matching $CLIENT_NAME
    await this.exec(`sed -i "/^### Client ${id}$/,/^$/d" ${this.profilePath}`)

    const clientConfPath = this.getClientConfPath(id)
    const clientQrPath = this.getClientQrPath(id)

    // remove generated client conf
    await this.exec(`rm -f ${clientConfPath}`)

    // remove generated client qr
    await this.exec(`rm -f ${clientQrPath}`)

    await this.restartWg()
  }

  public async newClient(id: number): Promise<CreateClientResponse> {
    if (!id || !new RegExp(/^[0-9_-]+$/).test(id.toString())) throw Error("Invalid [id] format")

    const clientConfPath = this.getClientConfPath(id)
    const clientQrPath = this.getClientQrPath(id)

    const exist = await this.exec(`grep -c -E "^### Client ${id}$" ${this.profilePath}`)
    if (exist) {
      console.error(`Client ${id} already exist`)

      return {
        conf: clientConfPath,
        qr: clientQrPath,
        already_exist: true
      }
    }

    const dotIp = await this.getDotIp()

    const ipV4 = await this.getIpV4(dotIp)
    const ipV6 = await this.getIpV6(dotIp)

    const clientPrivateKey = await this.exec("wg genkey")
    if (!clientPrivateKey) throw Error("[clientPrivateKey] not generated")

    const clientPublicKey = await this.exec(`echo "${clientPrivateKey}" | wg pubkey`)
    if (!clientPublicKey) throw Error("[clientPublicKey] not generated")

    const clientPresharedKey = await this.exec("wg genpsk")
    if (!clientPresharedKey) throw Error("[clientPresharedKey] not generated")

    const clientConf = this.generateClientConf(clientPrivateKey, clientPresharedKey, ipV4, ipV6)
    await this.exec(`echo "${clientConf}" > ${clientConfPath}`)

    const serverConf = this.generateServerConf(id, clientPublicKey, clientPresharedKey, ipV4, ipV6)
    await this.exec(`echo "${serverConf}" >> ${this.profilePath}`)

    await this.restartWg()

    await this.exec(`qrencode -t png -o ${clientQrPath} -r ${clientConfPath}`)

    return {
      conf: clientConfPath,
      qr: clientQrPath
    }
  }

  private async getDotIp() {
    const baseIp = wgParams.SERVER_WG_IPV4.split(".").slice(0, -1).join(".")
    const availableDots = Array.from({ length: this.MAX_CLIENTS }, (_, i) => i + 2)

    // eslint-disable-next-line @typescript-eslint/no-for-in-array
    for (const dot in availableDots) {
      const dotExist = await this.exec(`grep -c "${baseIp}.${dot}" ${this.profilePath}`)
      if (!dotExist) return dot
    }

    throw new Error(`The subnet configured supports only ${this.MAX_CLIENTS} clients`)
  }

  private async getIpV4(dotIp: string) {
    const baseIp = wgParams.SERVER_WG_IPV4.split(".").slice(0, -1).join(".")
    const ipV4 = `${baseIp}.${dotIp}`

    const ipV4Exist = await this.exec(`grep -c "${ipV4}/32" ${this.profilePath}`)
    if (ipV4Exist) throw new Error("Client with the specified IPv4 was already created")

    return ipV4
  }

  private async getIpV6(dotIp: string) {
    const baseIp = wgParams.SERVER_WG_IPV6.split("::")[0]
    const ipV6 = `${baseIp}::${dotIp}`

    const ipV6Exist = await this.exec(`grep -c "${ipV6}/128" ${this.profilePath}`)
    if (ipV6Exist) throw new Error("Client with the specified IPv6 was already created")

    return ipV6
  }

  private generateClientConf(clientPrivateKey: string, clientPresharedKey: string, ipV4: string, ipV6: string) {
    return `[Interface]\nPrivateKey = ${clientPrivateKey}Address = ${ipV4}/32,${ipV6}/128\nDNS = ${wgParams.CLIENT_DNS_1},${wgParams.CLIENT_DNS_2}\n\n[Peer]\nPublicKey = ${wgParams.SERVER_PUB_KEY}\nPresharedKey = ${clientPresharedKey}Endpoint = ${wgParams.SERVER_PUB_IP}:${wgParams.SERVER_PORT}\nAllowedIPs = ${wgParams.ALLOWED_IPS}`
  }

  private generateServerConf(
    id: number,
    clientPublicKey: string,
    clientPresharedKey: string,
    ipV4: string,
    ipV6: string
  ) {
    return `\n### Client ${id}\n[Peer]\nPublicKey = ${clientPublicKey}PresharedKey = ${clientPresharedKey}AllowedIPs = ${ipV4}/32,${ipV6}/128`
  }

  private getClientConfPath(id: number) {
    return `${this.clientsFolderPath}/${wgParams.SERVER_WG_NIC}-client-${id}.conf`
  }

  private getClientQrPath(id: number) {
    return `${this.clientsFolderPath}/${wgParams.SERVER_WG_NIC}-client-${id}.png`
  }

  private async restartWg() {
    // await exec(`wg syncconf ${wgParams.SERVER_WG_NIC} <(wg-quick strip ${wgParams.SERVER_WG_NIC})`)

    await this.exec(`wg-quick down ${wgParams.SERVER_WG_NIC}`)
    await this.exec(`wg-quick up ${wgParams.SERVER_WG_NIC}`)
  }

  private async exec(command: string) {
    try {
      const { stdout, stderr } = await execute(command)
      if (stderr) logger.error(stderr)

      return stdout
    } catch (e) {
      throw Error(e.message)
    }
  }
}

export default Wireguard
