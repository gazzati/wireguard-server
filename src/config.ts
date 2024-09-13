import { readFileSync } from "fs"

import dotenv from "dotenv"
import Joi from "joi"

import { Env } from "./intefaces/env"
import { WgParams } from "./intefaces/wg"

dotenv.config()

const envVarsSchema = Joi.object({
  NODE_ENV: Joi.string().valid(Env.Production, Env.Development, Env.Test).default(Env.Development),
  PORT: Joi.number().default(3000).description("App Port")
})

const { error, value: envVars } = envVarsSchema.validate(process.env)
if (error) new Error(`Config validation error: ${error.message}`)

const getWgParams = (): WgParams => {
  const file = readFileSync("/etc/wireguard/params", "utf-8")
  if (!file) throw Error("Get wireguard params error")

  const params = file.split("\n")
  if (!params) throw Error("Get wireguard params error")

  const result: WgParams = {
    SERVER_PUB_IP: "",
    SERVER_PUB_NIC: "",
    SERVER_WG_NIC: "",
    SERVER_WG_IPV4: "",
    SERVER_WG_IPV6: "",
    SERVER_PORT: "",
    SERVER_PRIV_KEY: "",
    SERVER_PUB_KEY: "",
    CLIENT_DNS_1: "",
    CLIENT_DNS_2: "",
    ALLOWED_IPS: ""
  }

  Object.keys(result).map(key => {
    for (const param of params) {
      if (param.includes(`${key}=`)) {
        const value = param.replace(`${key}=`, "")
        if (!value) continue

        result[key as keyof WgParams] = value
      }
    }

    if (!result[key as keyof WgParams]) throw Error(`${key} not found`)
  })

  return result
}

export const config = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,

  wgParams: getWgParams()
}
