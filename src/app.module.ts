import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { SessionModule } from './session/session.module'
import { AnalyticsModule } from './analytics/analytics.module'
import { OpenSearchModule } from './opensearch/opensearch.module'
import { RedisModule } from './redis/redis.module'
import redisConfig from './config/redis.config'
import openSearchConfig from './config/opensearch.config'
import appConfig from './config/app.config'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [redisConfig, openSearchConfig, appConfig]
    }),
    RedisModule,
    SessionModule,
    AnalyticsModule,
    OpenSearchModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
