import { Test, TestingModule } from '@nestjs/testing';
import { MediaProcessingController } from './media-processing.controller';
import { MediaProcessingService } from './media-processing.service';

describe('MediaProcessingController', () => {
  let controller: MediaProcessingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MediaProcessingController],
      providers: [MediaProcessingService],
    }).compile();

    controller = module.get<MediaProcessingController>(
      MediaProcessingController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
