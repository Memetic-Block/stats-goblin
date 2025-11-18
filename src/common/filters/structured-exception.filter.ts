import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { Response } from 'express'
import { ErrorResponseDto, ErrorAction, ErrorCode } from '../dto/error-response.dto'

/**
 * Global exception filter that converts exceptions into structured error responses
 * Provides clients with actionable information about what went wrong and what to do next
 */
@Catch()
export class StructuredExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(StructuredExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest()

    let status = HttpStatus.INTERNAL_SERVER_ERROR
    let errorResponse: ErrorResponseDto

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      const exceptionResponse = exception.getResponse()

      // Handle structured error responses
      if (typeof exceptionResponse === 'object' && 'errorCode' in exceptionResponse) {
        errorResponse = exceptionResponse as ErrorResponseDto
      } else {
        // Convert standard HttpException to structured format
        errorResponse = this.createErrorResponse(
          status,
          exceptionResponse,
          request
        )
      }
    } else {
      // Handle unexpected errors
      this.logger.error('Unexpected error', exception)
      errorResponse = {
        statusCode: status,
        message: 'Internal server error',
        error: 'Internal Server Error',
        errorCode: ErrorCode.INTERNAL_ERROR,
        action: ErrorAction.RETRY_LATER,
        retry: true
      }
    }

    response.status(status).json(errorResponse)
  }

  private createErrorResponse(
    status: number,
    exceptionResponse: string | object,
    request: any
  ): ErrorResponseDto {
    const message = typeof exceptionResponse === 'string'
      ? exceptionResponse
      : (exceptionResponse as any).message || 'An error occurred'

    const error = typeof exceptionResponse === 'object' && 'error' in exceptionResponse
      ? (exceptionResponse as any).error
      : this.getErrorName(status)

    // Determine action based on status code
    let action: ErrorAction | undefined
    let errorCode: string | undefined
    let retry = false

    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        action = ErrorAction.REQUEST_NEW_SESSION
        errorCode = ErrorCode.INVALID_SESSION
        retry = false
        break
      case HttpStatus.BAD_REQUEST:
        action = ErrorAction.FIX_DATA
        errorCode = ErrorCode.VALIDATION_ERROR
        retry = false
        break
      case HttpStatus.TOO_MANY_REQUESTS:
        action = ErrorAction.RETRY_LATER
        errorCode = ErrorCode.RATE_LIMIT_EXCEEDED
        retry = true
        break
      case HttpStatus.INTERNAL_SERVER_ERROR:
      case HttpStatus.SERVICE_UNAVAILABLE:
        action = ErrorAction.RETRY_LATER
        errorCode = ErrorCode.INTERNAL_ERROR
        retry = true
        break
    }

    return {
      statusCode: status,
      message,
      error,
      errorCode,
      action,
      retry
    }
  }

  private getErrorName(status: number): string {
    const errorNames: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'Bad Request',
      [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
      [HttpStatus.FORBIDDEN]: 'Forbidden',
      [HttpStatus.NOT_FOUND]: 'Not Found',
      [HttpStatus.TOO_MANY_REQUESTS]: 'Too Many Requests',
      [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
      [HttpStatus.SERVICE_UNAVAILABLE]: 'Service Unavailable'
    }
    return errorNames[status] || 'Error'
  }
}
