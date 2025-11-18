import { IsArray, ValidateNested, ArrayMaxSize, IsOptional } from 'class-validator'
import { Type } from 'class-transformer'
import { SubmitQueryDto } from './submit-query.dto'
import { SubmitEventDto } from './submit-event.dto'

/**
 * Mixed item that can be either a query or an event
 * Discriminated by the presence of user_query (query) or action_name (event)
 */
export class AnalyticsItemDto {
  @ValidateNested()
  @Type(() => Object)
  item: SubmitQueryDto | SubmitEventDto
}

/**
 * DTO for batch submission of mixed analytics data (queries and events)
 * Supports up to 100 items per batch
 */
export class SubmitAnalyticsBatchDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitQueryDto)
  @ArrayMaxSize(100)
  queries?: SubmitQueryDto[]

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitEventDto)
  @ArrayMaxSize(100)
  events?: SubmitEventDto[]
}
