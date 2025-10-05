import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger:
      process.env.NODE_ENV === 'local_development'
        ? ['fatal', 'error', 'warn', 'debug', 'verbose']
        : ['fatal', 'error', 'warn', 'debug'],
  });
  await app.listen(process.env.PORT || 8001);
}
bootstrap();
