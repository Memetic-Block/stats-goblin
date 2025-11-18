import { Controller, Get, Put, Headers, Body, HttpCode, HttpStatus, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common'
import { SessionService, SessionResponse } from './session.service'
import { validate } from 'class-validator'
import { plainToClass } from 'class-transformer'
import { InitSessionDto } from './dto/init-session.dto'
import { UpdateSessionDto } from './dto/update-session.dto'
import { ErrorAction, ErrorCode } from '../common/dto/error-response.dto'

/**
 * GDPR-friendly session controller
 * - No @Session() decorator (no server-side sessions)
 * - No cookies set
 * - Frontend stores session_id in localStorage
 * - Rate limiting handled by Traefik
 */
@Controller('session')
export class SessionController {
  private readonly logger = new Logger(SessionController.name)

  constructor(
    private readonly sessionService: SessionService,
  ) {}

  @Get('init')
  @HttpCode(HttpStatus.OK)
  async initSession(
    @Headers('x-client-name') clientName: string,
    @Headers('x-client-version') clientVersion: string,
    @Headers('x-wallet-address') walletAddress?: string,
  ): Promise<SessionResponse> {
    // Validate using DTO
    const dto = plainToClass(InitSessionDto, {
      client_name: clientName,
      client_version: clientVersion,
    })
    
    const errors = await validate(dto)
    if (errors.length > 0) {
      const messages = errors.flatMap(err => 
        err.constraints ? Object.values(err.constraints) : []
      )
      this.logger.warn(`Session init validation failed: ${messages.join('; ')}`)
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: messages,
        error: 'Bad Request',
        errorCode: ErrorCode.VALIDATION_ERROR,
        action: ErrorAction.FIX_DATA,
        retry: false
      })
    }
    
    // Generate session_id and client_id for frontend to store
    return this.sessionService.initializeSession(
      dto.client_name,
      dto.client_version,
      walletAddress,
    )
  }

  @Put('update')
  @HttpCode(HttpStatus.OK)
  async updateSession(
    @Headers('x-session-id') sessionId: string,
    @Body() dto: UpdateSessionDto,
  ): Promise<SessionResponse> {
    if (!sessionId) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'X-Session-Id header is required',
        error: 'Bad Request',
        errorCode: ErrorCode.VALIDATION_ERROR,
        action: ErrorAction.FIX_DATA,
        retry: false
      })
    }

    // Validate DTO
    const errors = await validate(dto)
    if (errors.length > 0) {
      const messages = errors.flatMap(err => 
        err.constraints ? Object.values(err.constraints) : []
      )
      this.logger.warn(`Session update validation failed: ${messages.join('; ')}`)
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: messages,
        error: 'Bad Request',
        errorCode: ErrorCode.VALIDATION_ERROR,
        action: ErrorAction.FIX_DATA,
        retry: false
      })
    }

    // Update session with wallet
    return this.sessionService.updateSessionWithWallet(
      sessionId,
      dto.wallet_address,
    )
  }
}
