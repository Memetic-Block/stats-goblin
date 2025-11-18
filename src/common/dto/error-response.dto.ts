/**
 * Structured error response for API endpoints
 * Helps clients determine the appropriate action to take
 */
export class ErrorResponseDto {
  statusCode: number
  message: string | string[]
  error: string
  errorCode?: string
  action?: ErrorAction
  retry?: boolean
}

/**
 * Action codes that tell clients what to do next
 */
export enum ErrorAction {
  REQUEST_NEW_SESSION = 'REQUEST_NEW_SESSION',
  FIX_DATA = 'FIX_DATA',
  RETRY_LATER = 'RETRY_LATER',
  CONTACT_SUPPORT = 'CONTACT_SUPPORT'
}

/**
 * Error codes for specific error scenarios
 */
export enum ErrorCode {
  INVALID_SESSION = 'INVALID_SESSION',
  EXPIRED_SESSION = 'EXPIRED_SESSION',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  INVALID_CLIENT_NAME = 'INVALID_CLIENT_NAME'
}
