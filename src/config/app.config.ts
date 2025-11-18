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
  analytics: {
    maxQueryLength: number
    maxBatchSize: number
    maxQueryResponseHits: number
    allowedApplications: string[]
    bulkChunkSize: number
  }
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
      .filter(name => name.length > 0),
    analytics: {
      maxQueryLength: parseInt(process.env.MAX_QUERY_LENGTH || '5000', 10),
      maxBatchSize: parseInt(process.env.MAX_BATCH_SIZE || '50', 10),
      maxQueryResponseHits: parseInt(process.env.MAX_QUERY_RESPONSE_HITS || '100', 10),
      allowedApplications: (process.env.ALLOWED_APPLICATIONS || 'graphql-images,graphql-video,graphql-audio')
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0),
      bulkChunkSize: parseInt(process.env.BULK_CHUNK_SIZE || '20', 10)
    }
  })
)
