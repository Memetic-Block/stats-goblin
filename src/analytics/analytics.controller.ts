import { Controller, Post, Body, HttpCode, Logger, ServiceUnavailableException, HttpStatus } from '@nestjs/common'
import { AnalyticsService } from './analytics.service'
import { SubmitAnalyticsBatchDto } from './dto/submit-analytics-batch.dto'
import { ErrorAction, ErrorCode } from '../common/dto/error-response.dto'

@Controller('analytics')
export class AnalyticsController {
  private readonly logger = new Logger('AnalyticsController')

  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * Submit mixed analytics data (queries and events) in batch to UBI (fire-and-forget)
   * Returns 200 OK immediately, processing happens asynchronously
   * Rate limiting handled by Traefik
   * 
   * Throws UnauthorizedException if all sessions in batch are invalid/expired
   */
  @Post('batch')
  @HttpCode(200)
  async submitBatch(@Body() dto: SubmitAnalyticsBatchDto): Promise<void> {
    // Validate that at least one session in the batch exists
    // If all sessions are invalid/expired, reject the batch
    await this.analyticsService.validateSessionsInBatch(dto)
    
    // Process batch asynchronously (fire-and-forget)
    this.analyticsService.submitBatch(dto)
  }

  // ========================================
  // DEPRECATED: Separate query/event endpoints
  // These are commented out but preserved for reference
  // ========================================

  // @Post('queries')
  // @HttpCode(200)
  // submitQuery(@Body() dto: SubmitQueryDto): void {
  //   this.analyticsService.submitQuery(dto)
  // }

  // @Post('queries/batch')
  // @HttpCode(200)
  // submitQueriesBatch(@Body() dto: SubmitQueriesBatchDto): void {
  //   this.analyticsService.submitQueriesBatch(dto)
  // }

  // ========================================
  // DEPRECATED: Read-only analytics endpoints
  // These are commented out but preserved for reference
  // ========================================

  // @Get('top-searches')
  // async getTopSearches(
  //   @Query('start') startDate: string,
  //   @Query('end') endDate: string,
  //   @Query('limit') limit?: string
  // ) {
  //   return this.analyticsService.getTopSearches(
  //     startDate,
  //     endDate,
  //     limit ? parseInt(limit, 10) : 10
  //   )
  // }

  // @Get('popular-documents')
  // async getPopularDocuments(
  //   @Query('start') startDate: string,
  //   @Query('end') endDate: string,
  //   @Query('limit') limit?: string
  // ) {
  //   return this.analyticsService.getPopularDocuments(
  //     startDate,
  //     endDate,
  //     limit ? parseInt(limit, 10) : 10
  //   )
  // }

  // @Get('events-by-action')
  // async getEventsByAction(
  //   @Query('start') startDate: string,
  //   @Query('end') endDate: string,
  //   @Query('limit') limit?: string
  // ) {
  //   return this.analyticsService.getEventsByAction(
  //     startDate,
  //     endDate,
  //     limit ? parseInt(limit, 10) : 10
  //   )
  // }

  // @Get('stats')
  // async getStats(
  //   @Query('start') startDate: string,
  //   @Query('end') endDate: string
  // ) {
  //   return this.analyticsService.getStats(startDate, endDate)
  // }
}
