import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { Logger, ValidationPipe } from '@nestjs/common'
import { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './app.module'
import { StructuredExceptionFilter } from './common/filters/structured-exception.filter'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  const configService = app.get(ConfigService)
  const logger = new Logger('Bootstrap')

  // Trust proxy for X-Forwarded-For headers (needed for IP extraction)
  if (configService.get('app.trustProxy')) {
    app.set('trust proxy', 1)
  }

  // Enable global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  )

  // Enable structured exception filter for actionable error responses
  app.useGlobalFilters(new StructuredExceptionFilter())

  // Configure CORS
  const corsOrigin = configService.get('app.corsAllowedOrigin')
  app.enableCors({
    origin: corsOrigin,
    credentials: false  // No cookies = no credentials needed
  })

  const port = configService.get('app.port')
  await app.listen(port)

  logger.log(`Analytics GOBLIN MODE ON @ port ${port}`)
}

bootstrap().catch((error) => {
  console.error('Error starting Analytics Goblin:', error)
  process.exit(1)
})
