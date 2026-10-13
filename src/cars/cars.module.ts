import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CarImagesController } from './car-images.controller';
import { CarsController } from './cars.controller';
import { CarsService } from './cars.service';

@Module({
  imports: [AuthModule],
  controllers: [CarsController, CarImagesController],
  providers: [CarsService],
})
export class CarsModule {}