import { Test, TestingModule } from '@nestjs/testing';
import { MediaProcessingService } from './media-processing.service';

describe('MediaProcessingService', () => {
  let service: MediaProcessingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MediaProcessingService],
    }).compile();

    service = module.get<MediaProcessingService>(MediaProcessingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
