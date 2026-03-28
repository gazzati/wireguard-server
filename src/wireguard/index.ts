import childProcess from "child_process"
import util from "util"
import type { ExecException } from "child_process"

import { config } from "../config"
import { CreateClientResponse, PeerMetrics } from "../intefaces/wg"

const execute = util.promisify(childProcess.exec)

const { wgParams } = config

class Wireguard {
  private readonly MAX_CLIENTS = 253
  private readonly profilePath = `/etc/wireguard/${wgParams.SERVER_WG_NIC}.conf`
  private readonly clientsFolderPath = `/etc/wireguard/clients`

  public async getClients(): Promise<Array<number>> {
    const output = await this.exec(`grep -E "^### Client" ${this.profilePath} | cut -d ' ' -f 3`)
    return output
      .split("\n")
      .map(Number)
      .filter((i) => i)
  }

  public async getPeers(): Promise<Array<PeerMetrics>> {
    const output = await this.exec(`wg show ${wgParams.SERVER_WG_NIC} dump`)

    return output
      .trim()
      .split("\n")
      .slice(1)
      .filter(Boolean)
      .map((line) => {
        const [
          publicKey,
          presharedKey,
          endpoint,
          allowedIps,
          latestHandshake,
          rxBytes,
          txBytes,
          persistentKeepalive
        ] = line.split("\t")

        const handshakeAt = Number(latestHandshake)
        const keepalive = Number(persistentKeepalive)

        return {
          public_key: publicKey,
          preshared_key: presharedKey === "(none)" ? null : presharedKey,
          endpoint: endpoint === "(none)" ? null : endpoint,
          allowed_ips: allowedIps,
          latest_handshake_at:
            handshakeAt > 0 && Number.isFinite(handshakeAt) ? new Date(handshakeAt * 1000).toISOString() : null,
          rx_bytes: Number(rxBytes) || 0,
          tx_bytes: Number(txBytes) || 0,
          persistent_keepalive: keepalive > 0 && Number.isFinite(keepalive) ? keepalive : null
        }
      })
  }

  public async disableClient(id: number): Promise<void> {
    if (!id || !new RegExp(/^[0-9_-]+$/).test(id.toString())) throw Error("Invalid [id] format")

    const existCount = await this.grepCount(`^### Client ${id}$`, this.profilePath)
    if (existCount === 0) throw Error(`Client ${id} not found`)

    // remove [Peer] block matching $CLIENT_NAME
    await this.exec(`sed -i "/^### Client ${id}$/,/^$/d" ${this.profilePath}`)

    // const clientConfPath = this.getClientConfPath(id)
    // const clientQrPath = this.getClientQrPath(id)

    // // remove generated client conf
    // await this.exec(`rm -f ${clientConfPath}`)

    // // remove generated client qr
    // await this.exec(`rm -f ${clientQrPath}`)

    await this.restartWg()
  }

  public async enableClient(id: number, publicKey: string): Promise<void> {
    if (!id || !new RegExp(/^[0-9_-]+$/).test(id.toString())) throw Error("Invalid [id] format")

    const existCount = await this.grepCount(`^### Client ${id}$`, this.profilePath)
    if (existCount > 0) throw Error(`Client ${id} already exist`)

    const clientConfPath = this.getClientConfPath(id)
    if (!clientConfPath) throw Error(`Client ${id} not found`)

    const clientConf = await this.exec(`cat ${clientConfPath}`)

    const clientPresharedKey = this.findPartInString(clientConf, "PresharedKey")
    const ips = this.findPartInString(clientConf, "Address")

    if (!clientPresharedKey || !ips) throw Error(`Client ${id} not found`)

    const [ipV4, ipV6] = ips.split(",")

    const serverConf = this.generateServerConf(id, publicKey, clientPresharedKey, ipV4, ipV6)
    await this.exec(`echo "${serverConf}" >> ${this.profilePath}`)

    await this.restartWg()
  }

  public async newClient(id: number): Promise<CreateClientResponse> {
    if (!id || !new RegExp(/^[0-9_-]+$/).test(id.toString())) throw Error("Invalid [id] format")

    const clientConfPath = this.getClientConfPath(id)
    const clientQrPath = this.getClientQrPath(id)

    const existCount = await this.grepCount(`^### Client ${id}$`, this.profilePath)
    if (existCount > 0) {
      console.info(`Client ${id} already exist`)

      const peerConf = await this.exec(
        `grep -A 2 "^### Client ${id}$" ${this.profilePath} | tail -n 1`
      )
      if (!peerConf) throw Error("Not found existing client")

      const publicKey = this.findPartInString(peerConf, "PublicKey")
      if (!publicKey) throw Error("Not found publicKey for existing client")

      return {
        conf: clientConfPath,
        qr: clientQrPath,
        public_key: publicKey,
        already_exist: true
      }
    }

    const dotIp = await this.getDotIp()

    const ipV4 = await this.getIpV4(dotIp)
    const ipV6 = await this.getIpV6(dotIp)

    const clientPrivateKey = await this.exec("wg genkey")
    if (!clientPrivateKey) throw Error("[clientPrivateKey] not generated")

    const clientPublicKey = (await this.exec(`echo "${clientPrivateKey}" | wg pubkey`)).trim()
    if (!clientPublicKey) throw Error("[clientPublicKey] not generated")

    const clientPresharedKey = await this.exec("wg genpsk")
    if (!clientPresharedKey) throw Error("[clientPresharedKey] not generated")

    const clientConf = this.generateClientConf(clientPrivateKey, clientPresharedKey, ipV4, ipV6)
    await this.exec(`echo "${clientConf}" > ${clientConfPath}`)

    const serverConf = this.generateServerConf(
      id,
      clientPublicKey,
      clientPresharedKey,
      `${ipV4}/32`,
      `${ipV6}/128`
    )
    await this.exec(`echo "${serverConf}" >> ${this.profilePath}`)

    await this.restartWg()

    await this.exec(`qrencode -t png -o ${clientQrPath} -r ${clientConfPath}`)

    return {
      conf: clientConfPath,
      qr: clientQrPath,
      public_key: clientPublicKey
    }
  }

  private async getDotIp() {
    const baseIp = wgParams.SERVER_WG_IPV4.split(".").slice(0, -1).join(".")
    const availableDots = Array.from({ length: this.MAX_CLIENTS }, (_, i) => i + 2)

    for (const dot of availableDots) {
      const dotExistCount = await this.grepCount(`${baseIp}.${dot}`, this.profilePath)
      if (dotExistCount === 0) return dot.toString()
    }

    throw new Error(`The subnet configured supports only ${this.MAX_CLIENTS} clients`)
  }

  private async getIpV4(dotIp: string) {
    const baseIp = wgParams.SERVER_WG_IPV4.split(".").slice(0, -1).join(".")
    const ipV4 = `${baseIp}.${dotIp}`

    const ipV4ExistCount = await this.grepCount(`${ipV4}/32`, this.profilePath)
    if (ipV4ExistCount > 0) throw new Error("Client with the specified IPv4 was already created")

    return ipV4
  }

  private async getIpV6(dotIp: string) {
    const baseIp = wgParams.SERVER_WG_IPV6.split("::")[0]
    const ipV6 = `${baseIp}::${dotIp}`

    const ipV6ExistCount = await this.grepCount(`${ipV6}/128`, this.profilePath)
    if (ipV6ExistCount > 0) throw new Error("Client with the specified IPv6 was already created")

    return ipV6
  }

  private generateClientConf(
    clientPrivateKey: string,
    clientPresharedKey: string,
    ipV4: string,
    ipV6: string
  ) {
    return `[Interface]
PrivateKey = ${clientPrivateKey.trim()}
Address = ${ipV4}/32,${ipV6}/128
DNS = ${wgParams.CLIENT_DNS_1},${wgParams.CLIENT_DNS_2}\n
[Peer]
PublicKey = ${wgParams.SERVER_PUB_KEY}
PresharedKey = ${clientPresharedKey.trim()}
Endpoint = ${wgParams.SERVER_PUB_IP}:${wgParams.SERVER_PORT}
AllowedIPs = ${wgParams.ALLOWED_IPS}`
  }

  private generateServerConf(
    id: number,
    clientPublicKey: string,
    clientPresharedKey: string,
    ipV4: string,
    ipV6: string
  ) {
    return `
### Client ${id}
[Peer]
PublicKey = ${clientPublicKey.trim()}
PresharedKey = ${clientPresharedKey.trim()}
AllowedIPs = ${ipV4},${ipV6}`
  }

  private getClientConfPath(id: number) {
    return `${this.clientsFolderPath}/${wgParams.SERVER_WG_NIC}-client-${id}.conf`
  }

  private getClientQrPath(id: number) {
    return `${this.clientsFolderPath}/${wgParams.SERVER_WG_NIC}-client-${id}.png`
  }

  private async restartWg() {
    await execute(
      `wg syncconf ${wgParams.SERVER_WG_NIC} <(wg-quick strip ${wgParams.SERVER_WG_NIC})`,
      {
        shell: "/bin/bash"
      }
    )

    // await this.exec(`wg-quick down ${wgParams.SERVER_WG_NIC}`)
    // await this.exec(`wg-quick up ${wgParams.SERVER_WG_NIC}`)
  }

  private findPartInString = (clientConf: string, part: string) => {
    const parts = clientConf.split("\n")
    const wantedParts = parts.filter((x) => x.includes(part))
    if (!wantedParts.length) return undefined

    const value = wantedParts[0].match(/((?<==).)(.+$)/gm)?.[0]?.trim()
    return value || null
  }

  private async exec(command: string) {
    try {
      const { stdout, stderr } = await execute(command)
      if (stderr) throw new Error(stderr.trim() || `Command failed: ${command}`)

      return stdout
    } catch (e) {
      const error = e as ExecException & { stderr?: string; stdout?: string }
      error.message = error.stderr?.trim() || error.message || `Command failed: ${command}`
      throw error
    }
  }

  private async grepCount(pattern: string, path: string): Promise<number> {
    const { stdout } = await execute(`grep -c -E "${pattern}" ${path} || true`)
    return Number(stdout.trim()) || 0
  }
}

export default Wireguard
