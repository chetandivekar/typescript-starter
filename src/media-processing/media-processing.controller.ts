import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { MediaProcessingService } from './media-processing.service';
import { CreateMediaProcessingDto } from './dto/create-media-processing.dto';
import { UpdateMediaProcessingDto } from './dto/update-media-processing.dto';

@Controller('media-processing')
export class MediaProcessingController {
  constructor(
    private readonly mediaProcessingService: MediaProcessingService,
  ) {}

  @Get()
  getMediaProcessings() {}
}
