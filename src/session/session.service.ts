import { Injectable, BadRequestException, HttpStatus } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomUUID } from 'crypto'
import { RedisService } from '../redis/redis.service'
import { ErrorAction, ErrorCode } from '../common/dto/error-response.dto'

export interface SessionResponse {
  session_id: string
  client_id: string
  wallet_address?: string
}

/**
 * Session service with Redis validation and optional wallet tracking
 * - Session IDs stored in Redis with 24h TTL
 * - Optional wallet addresses stored separately (user opt-in)
 * - Client manages session_id in localStorage
 * - Server validates sessions for analytics submissions
 */
@Injectable()
export class SessionService {
  private readonly allowedClientNames: string[]

  constructor(
    private configService: ConfigService,
    private redisService: RedisService
  ) {
    this.allowedClientNames = this.configService.get('app.allowedClientNames', [])
  }

  /**
   * Generate session_id and client_id, store in Redis
   * Optionally associate wallet address if user opts in
   * Frontend stores these in localStorage
   */
  async initializeSession(
    clientName: string,
    clientVersion: string,
    walletAddress?: string,
  ): Promise<SessionResponse> {
    // Validate client name is in whitelist
    if (!this.allowedClientNames.includes(clientName)) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: `Invalid client_name. Allowed values: ${this.allowedClientNames.join(', ')}`,
        error: 'Bad Request',
        errorCode: ErrorCode.INVALID_CLIENT_NAME,
        action: ErrorAction.FIX_DATA,
        retry: false
      })
    }

    // Generate session ID using Node.js crypto
    const sessionId = randomUUID()

    // Store session in Redis with 24 hour TTL
    await this.redisService.storeSession(sessionId, 86400)

    // If wallet provided, store wallet -> session mapping
    if (walletAddress && walletAddress.trim().length > 0) {
      await this.redisService.storeWalletForSession(sessionId, walletAddress.trim(), 86400)
    }

    // Construct UBI-compatible client_id with optional wallet hash
    let clientId = `${clientName}@${clientVersion}@${sessionId}`
    
    // Append wallet prefix if provided (first 8 chars for privacy)
    if (walletAddress && walletAddress.trim().length >= 8) {
      const walletPrefix = walletAddress.trim().substring(0, 8)
      clientId += `@${walletPrefix}`
    }

    const response: SessionResponse = {
      session_id: sessionId,
      client_id: clientId
    }

    // Include wallet in response if provided (frontend can use for display)
    if (walletAddress && walletAddress.trim().length > 0) {
      response.wallet_address = walletAddress.trim()
    }

    return response
  }

  /**
   * Validate session ID exists in Redis
   */
  async isValidSession(sessionId: string): Promise<boolean> {
    return this.redisService.isValidSession(sessionId)
  }

  /**
   * Get wallet address for session (if user opted in)
   */
  async getWalletForSession(sessionId: string): Promise<string | null> {
    return this.redisService.getWalletForSession(sessionId)
  }

  /**
   * Update existing session with wallet address (for users who sign in after starting session)
   * Validates session exists and reconstructs client_id with wallet prefix
   */
  async updateSessionWithWallet(
    sessionId: string,
    walletAddress: string,
  ): Promise<SessionResponse> {
    // Validate session exists
    const isValid = await this.redisService.isValidSession(sessionId)
    if (!isValid) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid or expired session_id',
        error: 'Bad Request',
        errorCode: ErrorCode.EXPIRED_SESSION,
        action: ErrorAction.REQUEST_NEW_SESSION,
        retry: false
      })
    }

    // Store/update wallet for this session
    await this.redisService.storeWalletForSession(sessionId, walletAddress.trim(), 86400)

    // We need to reconstruct the client_id, but we don't have client name/version stored
    // Parse from the original client_id if possible, or return updated info
    // For now, we'll return the session_id and let client update their stored client_id
    
    // Construct client_id suffix with wallet prefix
    const walletPrefix = walletAddress.trim().substring(0, 8)
    
    return {
      session_id: sessionId,
      client_id: `@${walletPrefix}`, // Client should append this to their existing client_id
      wallet_address: walletAddress.trim()
    }
  }
}
