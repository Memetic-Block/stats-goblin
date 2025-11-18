import { Controller, Get, Query } from '@nestjs/common'
import { AnalyticsService } from './analytics.service'

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('top-searches')
  async getTopSearches(
    @Query('start') startDate: string,
    @Query('end') endDate: string,
    @Query('limit') limit?: string
  ) {
    return this.analyticsService.getTopSearches(
      startDate,
      endDate,
      limit ? parseInt(limit, 10) : 10
    )
  }

  @Get('popular-documents')
  async getPopularDocuments(
    @Query('start') startDate: string,
    @Query('end') endDate: string,
    @Query('limit') limit?: string
  ) {
    return this.analyticsService.getPopularDocuments(
      startDate,
      endDate,
      limit ? parseInt(limit, 10) : 10
    )
  }

  @Get('events-by-action')
  async getEventsByAction(
    @Query('start') startDate: string,
    @Query('end') endDate: string,
    @Query('limit') limit?: string
  ) {
    return this.analyticsService.getEventsByAction(
      startDate,
      endDate,
      limit ? parseInt(limit, 10) : 10
    )
  }

  @Get('stats')
  async getStats(
    @Query('start') startDate: string,
    @Query('end') endDate: string
  ) {
    return this.analyticsService.getStats(startDate, endDate)
  }
}
