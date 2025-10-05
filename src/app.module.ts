import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MediaProcessingModule } from './media-processing/media-processing.module';

@Module({
  imports: [MediaProcessingModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
