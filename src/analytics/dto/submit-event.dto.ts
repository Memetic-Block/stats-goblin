import {
  IsString,
  IsOptional,
  MaxLength,
  IsObject,
  IsArray,
  Matches,
  ArrayMaxSize,
  IsNumber
} from 'class-validator'
import { IsValidClientId } from '../../common/validators/client-id.validator'

/**
 * DTO for submitting a UBI event following UBI 1.3.0 schema
 */
export class SubmitEventDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  query_id?: string

  @IsString()
  @IsOptional()
  @MaxLength(100)
  action_name?: string

  @IsOptional()
  @IsValidClientId()
  client_id?: string

  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/, {
    message: 'timestamp must be in UTC format (ISO 8601 with Z suffix)'
  })
  timestamp?: string

  @IsObject()
  @IsOptional()
  event_attributes?: {
    object?: {
      object_id?: string
      object_id_field?: string
      description?: string
    }
    position?: {
      ordinal?: number
      x?: number
      y?: number
    }
    [key: string]: any
  }
}
