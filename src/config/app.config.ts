import { registerAs } from '@nestjs/config'

export interface AppConfig {
  port: number
  corsAllowedOrigin: string
  trustProxy: boolean
  gdprMode: boolean
  anonymizeIps: boolean
  throttle: {
    global: { limit: number }
    burst: { limit: number }
  }
  allowedClientNames: string[]
}

/**
 * GDPR-friendly configuration
 * - No session config (client-side only)
 * - IP anonymization enabled
 * - Only IP-based rate limiting (no session tracking)
 */
export default registerAs(
  'app',
  (): AppConfig => ({
    port: parseInt(process.env.PORT || '3001', 10),
    corsAllowedOrigin: process.env.CORS_ALLOWED_ORIGIN || '*',
    trustProxy: process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true',
    gdprMode: true,
    anonymizeIps: true,
    throttle: {
      global: {
        limit: parseInt(process.env.THROTTLE_GLOBAL_LIMIT || '20', 10)
      },
      burst: {
        limit: parseInt(process.env.THROTTLE_BURST_LIMIT || '3', 10)
      }
    },
    allowedClientNames: (process.env.ALLOWED_CLIENT_NAMES || 'web,mobile-ios,mobile-android')
      .split(',')
      .map(name => name.trim())
      .filter(name => name.length > 0)
  })
)
