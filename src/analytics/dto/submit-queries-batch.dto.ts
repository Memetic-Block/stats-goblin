import { IsArray, ValidateNested, ArrayMaxSize } from 'class-validator'
import { Type } from 'class-transformer'
import { SubmitQueryDto } from './submit-query.dto'

/**
 * DTO for batch submission of queries to UBI
 * Supports up to 50 queries per batch
 */
export class SubmitQueriesBatchDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitQueryDto)
  @ArrayMaxSize(50)
  queries: SubmitQueryDto[]
}
