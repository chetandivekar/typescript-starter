import { PartialType } from '@nestjs/mapped-types';
import { CreateMediaProcessingDto } from './create-media-processing.dto';

export class UpdateMediaProcessingDto extends PartialType(CreateMediaProcessingDto) {}
