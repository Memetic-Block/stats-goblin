import {
  IsString,
  IsOptional,
  MaxLength,
  IsObject,
  IsArray,
  Matches,
  ArrayMaxSize
} from 'class-validator'
import { IsValidClientId } from '../../common/validators/client-id.validator'

/**
 * DTO for submitting a query to UBI (User Behavior Insights) following UBI 1.3.0 schema
 * All fields are optional for fire-and-forget validation
 * Required field validation happens at service layer
 */
export class SubmitQueryDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  application?: string

  @IsString()
  @IsOptional()
  @MaxLength(100)
  query_id?: string

  @IsOptional()
  @IsValidClientId()
  client_id?: string

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  user_query?: string

  @IsObject()
  @IsOptional()
  query_attributes?: Record<string, any>

  @IsString()
  @IsOptional()
  @MaxLength(100)
  object_id_field?: string

  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/, {
    message: 'timestamp must be in UTC format (ISO 8601 with Z suffix)'
  })
  timestamp?: string

  @IsString()
  @IsOptional()
  @MaxLength(100)
  query_response_id?: string

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ArrayMaxSize(100)
  query_response_hit_ids?: string[]
}
