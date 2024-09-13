import childProcess from "child_process"
import util from "util"

import { config } from "../config"

const execute = util.promisify(childProcess.exec)

const { wgParams } = config

class Wireguard {
  private readonly MAX_CLIENTS = 253
  private readonly profilePath = `/etc/wireguard/${wgParams.SERVER_WG_NIC}.conf`
  private readonly clientsFolderPath = `/etc/wireguard/clients`

  public async getClients(): Promise<Array<string>> {
    const output = await this.exec(`grep -E "^### Client" ${this.profilePath} | cut -d ' ' -f 3`)
    return output
      .split("\n")
      .map(i => i.trim())
      .filter(i => i)
  }

  public async revokeClient(name: string): Promise<void> {
    if (!name || !new RegExp(/^[a-zA-Z0-9_-]+$/).test(name)) throw Error("Invalid [name] format")

    const exist = await this.exec(`grep -c -E "^### Client ${name}\$" ${this.profilePath}`)
    if (!exist) throw Error(`Client ${name} not found`)

    await this.exec(`grep -E "^### Client" ${this.profilePath} | cut -d ' ' -f 3`)

    // remove [Peer] block matching $CLIENT_NAME
    await this.exec(`sed -i "/^### Client ${name}\$/,/^$/d" ${this.profilePath}`)

    const clientConfPath = this.getClientConfPath(name)
    const clientQrPath = this.getClientQrPath(name)

    // remove generated client conf
    await this.exec(`rm -f ${clientConfPath}`)

    // remove generated client qr
    await this.exec(`rm -f ${clientQrPath}`)

    await this.restartWg()
  }

  public async newClient(name: string) {
    if (!name || !new RegExp(/^[a-zA-Z0-9_-]+$/).test(name)) throw Error("Invalid [name] format")

    const clientConfPath = this.getClientConfPath(name)
    const clientQrPath = this.getClientQrPath(name)

    const exist = await this.exec(`grep -c -E "^### Client ${name}\$" ${this.profilePath}`)
    if (exist) {
      console.error(`Client ${name} already exist`)

      return {
        file: clientConfPath,
        qr: clientQrPath,
        alreadyExist: true
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

    const serverConf = this.generateServerConf(name, clientPublicKey, clientPresharedKey, ipV4, ipV6)
    await this.exec(`echo "${serverConf}" >> ${this.profilePath}`)

    await this.restartWg()

    await this.exec(`qrencode -t png -o ${clientQrPath} -r ${clientConfPath}`)

    return {
      file: clientConfPath,
      qr: clientQrPath
    }
  }

  private async getDotIp() {
    const baseIp = wgParams.SERVER_WG_IPV4.split(".").slice(0, -1).join(".")
    const availableDots = Array.from({ length: this.MAX_CLIENTS }, (_, i) => i + 2)

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
    return `[Interface]\nPrivateKey = ${clientPrivateKey}\nAddress = ${ipV4}/32,${ipV6}/128\nDNS = ${wgParams.CLIENT_DNS_1},${wgParams.CLIENT_DNS_2}\n\n[Peer]\nPublicKey = ${wgParams.SERVER_PUB_KEY}\nPresharedKey = ${clientPresharedKey}Endpoint = ${wgParams.SERVER_PUB_IP}:${wgParams.SERVER_PORT}\nAllowedIPs = ${wgParams.ALLOWED_IPS}`
  }

  private generateServerConf(
    name: string,
    clientPublicKey: string,
    clientPresharedKey: string,
    ipV4: string,
    ipV6: string
  ) {
    return `\n### Client ${name}\n[Peer]\nPublicKey = ${clientPublicKey}PresharedKey = ${clientPresharedKey}AllowedIPs = ${ipV4}/32,${ipV6}/128`
  }

  private getClientConfPath(name: string) {
    return `${this.clientsFolderPath}/${wgParams.SERVER_WG_NIC}-client-${name}.conf`
  }

  private getClientQrPath(name: string) {
    return `${this.clientsFolderPath}/${wgParams.SERVER_WG_NIC}-client-${name}.png`
  }

  private async restartWg() {
    // await exec(`wg syncconf ${wgParams.SERVER_WG_NIC} <(wg-quick strip ${wgParams.SERVER_WG_NIC})`)

    await this.exec(`wg-quick down ${wgParams.SERVER_WG_NIC}`)
    await this.exec(`wg-quick up ${wgParams.SERVER_WG_NIC}`)
  }

  private async exec(command: string) {
    try {
      const { stdout, stderr } = await execute(command)
      //if (stderr) console.info(stderr)

      return stdout
    } catch (e) {
      // console.error(e)
    }
  }
}

export default Wireguard
