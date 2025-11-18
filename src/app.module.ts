import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerModule, seconds } from '@nestjs/throttler'
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { SessionModule } from './session/session.module'
import { AnalyticsModule } from './analytics/analytics.module'
import { OpenSearchModule } from './opensearch/opensearch.module'
import { ThrottlerBehindProxyGuard } from './common/guards/throttler-proxy.guard'
import redisConfig from './config/redis.config'
import openSearchConfig from './config/opensearch.config'
import appConfig from './config/app.config'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [redisConfig, openSearchConfig, appConfig]
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            name: 'global',
            ttl: seconds(60), // 1 minute
            limit: configService.get('app.throttle.global.limit', 20)
          },
          {
            name: 'burst',
            ttl: seconds(1),
            limit: configService.get('app.throttle.burst.limit', 3)
          }
        ],
        storage: new ThrottlerStorageRedisService({
          host: configService.get('redis.host'),
          port: configService.get('redis.port')
        })
      })
    }),
    SessionModule,
    AnalyticsModule,
    OpenSearchModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerBehindProxyGuard
    }
  ]
})
export class AppModule {}
