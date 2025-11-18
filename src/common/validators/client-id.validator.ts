import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator'

/**
 * Validates client_id format: clientName@version@sessionId[@walletAddress]
 * - clientName: alphanumeric and hyphens
 * - version: semver format (e.g., 1.2.3 or 1.2.3-beta.1)
 * - sessionId: UUID format
 * - walletAddress: optional, exactly 43 base64url characters
 */
export function IsValidClientId(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidClientId',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (typeof value !== 'string') {
            return false
          }

          const parts = value.split('@')
          
          // Must have 3 or 4 parts
          if (parts.length < 3 || parts.length > 4) {
            return false
          }

          const [clientName, version, sessionId, walletAddress] = parts

          // Validate clientName: alphanumeric and hyphens, 2-50 chars
          if (!/^[a-zA-Z0-9-]{2,50}$/.test(clientName)) {
            return false
          }

          // Validate version: semver format (e.g., 1.2.3 or 1.2.3-beta.1)
          if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]{1,20})?$/.test(version)) {
            return false
          }

          // Validate sessionId: UUID format (lowercase hex with hyphens)
          if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(sessionId)) {
            return false
          }

          // Validate walletAddress if present: exactly 43 base64url chars
          if (walletAddress !== undefined) {
            if (!/^[a-zA-Z0-9_-]{43}$/.test(walletAddress)) {
              return false
            }
          }

          return true
        },
        defaultMessage(args: ValidationArguments) {
          return 'client_id must be in format: clientName@version@sessionId or clientName@version@sessionId@walletAddress (wallet must be 43 base64url chars)'
        }
      }
    })
  }
}
