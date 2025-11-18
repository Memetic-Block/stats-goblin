import { Controller, Get, Query, HttpCode, HttpStatus } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { SessionService, SessionResponse } from './session.service'
import { InitSessionDto } from './dto/init-session.dto'

/**
 * GDPR-friendly session controller
 * - No @Session() decorator (no server-side sessions)
 * - No cookies set
 * - Frontend stores session_id in localStorage
 */
@Controller('session')
export class SessionController {
  constructor(
    private readonly sessionService: SessionService,
  ) {}

  @Get('init')
  @HttpCode(HttpStatus.OK)
  @Throttle({ global: { limit: 10, ttl: 60000 } }) // More relaxed limit for session init
  initSession(
    @Query() dto: InitSessionDto,
  ): SessionResponse {
    // Generate session_id and client_id for frontend to store
    return this.sessionService.initializeSession(
      dto.client_name,
      dto.client_version,
    )
  }
}
