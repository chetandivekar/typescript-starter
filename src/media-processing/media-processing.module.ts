import { Module } from '@nestjs/common';
import { MediaProcessingService } from './media-processing.service';
import { MediaProcessingController } from './media-processing.controller';

@Module({
  controllers: [MediaProcessingController],
  providers: [MediaProcessingService],
})
export class MediaProcessingModule {}
