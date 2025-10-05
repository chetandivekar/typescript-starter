import { Controller, Get } from '@nestjs/common';
import { MediaProcessingService } from './media-processing.service';

@Controller('media-processing')
export class MediaProcessingController {
  constructor(
    private readonly mediaProcessingService: MediaProcessingService,
  ) {}
}
