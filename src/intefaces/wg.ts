export interface WgParams {
  SERVER_PUB_IP: string
  SERVER_PUB_NIC: string
  SERVER_WG_NIC: string
  SERVER_WG_IPV4: string
  SERVER_WG_IPV6: string
  SERVER_PORT: string
  SERVER_PRIV_KEY: string
  SERVER_PUB_KEY: string
  CLIENT_DNS_1: string
  CLIENT_DNS_2: string
  ALLOWED_IPS: string
}

export interface CreateClientResponse {
  conf: string
  qr: string
  already_exist?: boolean
  public_key?: string
}
