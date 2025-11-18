import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  BadRequestException,
  Logger
} from '@nestjs/common'
import { Response } from 'express'

@Catch(BadRequestException)
export class ValidationExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ValidationException')

  catch(exception: BadRequestException, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest()
    const status = exception.getStatus()
    const exceptionResponse = exception.getResponse()

    // Log validation errors with request details
    this.logger.warn(
      `Validation failed for ${request.method} ${request.url}`,
      JSON.stringify({
        body: request.body,
        errors: exceptionResponse,
        ip: request.ip
      })
    )

    // Return generic 400 response (no error details leaked to client)
    response.status(status).json({
      statusCode: status,
      message: 'Bad Request'
    })
  }
}
