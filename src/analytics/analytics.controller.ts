import { Controller, Get, Post, Query, Body, HttpCode, Logger } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { AnalyticsService } from './analytics.service'
import { SubmitQueryDto } from './dto/submit-query.dto'
import { SubmitQueriesBatchDto } from './dto/submit-queries-batch.dto'

@Controller('analytics')
export class AnalyticsController {
  private readonly logger = new Logger('AnalyticsController')

  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * Submit a single query to UBI (fire-and-forget)
   * Returns 200 OK immediately, processing happens asynchronously
   */
  @Post('queries')
  @HttpCode(200)
  @Throttle({ global: { limit: 100, ttl: 60000 } })
  submitQuery(@Body() dto: SubmitQueryDto): void {
    this.analyticsService.submitQuery(dto)
  }

  /**
   * Submit multiple queries in batch to UBI (fire-and-forget)
   * Returns 200 OK immediately, processing happens asynchronously
   */
  @Post('queries/batch')
  @HttpCode(200)
  @Throttle({ global: { limit: 10, ttl: 60000 } })
  submitQueriesBatch(@Body() dto: SubmitQueriesBatchDto): void {
    this.analyticsService.submitQueriesBatch(dto)
  }

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
