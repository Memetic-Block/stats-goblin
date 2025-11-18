import { Module } from '@nestjs/common'
import { HealthController } from './health.controller'
import { HealthService } from './health.service'
import { OpenSearchModule } from '../opensearch/opensearch.module'

@Module({
  imports: [OpenSearchModule],
  controllers: [HealthController],
  providers: [HealthService]
})
export class HealthModule {}
