import { registerAs } from '@nestjs/config'

export interface OpenSearchConfig {
  node: string
  username?: string
  password?: string
  ssl?: {
    rejectUnauthorized: boolean
  }
}

export default registerAs('opensearch', (): OpenSearchConfig => {
  const config: OpenSearchConfig = {
    node: process.env.OPENSEARCH_HOST || 'http://localhost:9200'
  }

  // Add authentication if credentials are provided
  if (process.env.OPENSEARCH_USERNAME && process.env.OPENSEARCH_PASSWORD) {
    config.username = process.env.OPENSEARCH_USERNAME
    config.password = process.env.OPENSEARCH_PASSWORD
  }

  // Configure SSL if enabled
  if (process.env.OPENSEARCH_USE_TLS === 'true') {
    config.ssl = {
      rejectUnauthorized: process.env.OPENSEARCH_SSL_VERIFY !== 'false'
    }
  }

  return config
})
