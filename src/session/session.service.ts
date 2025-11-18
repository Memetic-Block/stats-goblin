import { Injectable, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomUUID } from 'crypto'

export interface SessionResponse {
  session_id: string
  client_id: string
}

/**
 * GDPR-friendly session service
 * - No server-side session storage
 * - Client manages session_id in localStorage
 * - No cookies, no tracking, no personal data stored
 */
@Injectable()
export class SessionService {
  private readonly allowedClientNames: string[]

  constructor(private configService: ConfigService) {
    this.allowedClientNames = this.configService.get('app.allowedClientNames', [])
  }

  /**
   * Generate session_id and client_id format for frontend
   * Frontend stores these in localStorage (no server-side storage)
   */
  initializeSession(
    clientName: string,
    clientVersion: string,
  ): SessionResponse {
    // Validate client name is in whitelist
    if (!this.allowedClientNames.includes(clientName)) {
      throw new BadRequestException(
        `Invalid client_name. Allowed values: ${this.allowedClientNames.join(', ')}`
      )
    }

    // Generate session ID using Node.js crypto (frontend will store this)
    const sessionId = randomUUID()

    // Construct UBI-compatible client_id
    const clientId = `${clientName}@${clientVersion}@${sessionId}`

    return {
      session_id: sessionId,
      client_id: clientId
    }
  }
}
