import { Controller, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CarsService } from './cars.service';
import { CarImageDto } from './dto/car.dto';

@ApiTags('Car Images')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('car-images')
export class CarImagesController {
  constructor(private readonly carsService: CarsService) {}

  @Patch(':id')
  @ApiOperation({
    operationId: 'highlight_car_image',
    summary: 'Memilih gambar untuk ditampilkan pada list mobil',
    description: 'Tanpa body. Gambar terpilih menjadi true dan semua gambar lain dengan car_id sama menjadi false secara atomik. Memilih ulang gambar yang sama tetap true. GET cars tetap mengembalikan semua gambar; frontend memilih images.find(image => image.highlight).',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', description: 'UUID car_images, bukan UUID cars' })
  @ApiOkResponse({ type: CarImageDto, description: 'Objek gambar {id, url, highlight: true}, tanpa wrapper; bentuknya sama dengan setiap item images pada response mobil' })
  @ApiBadRequestResponse({ description: 'ID gambar harus berupa UUID' })
  @ApiUnauthorizedResponse({ description: 'Bearer token diperlukan atau tidak valid' })
  @ApiNotFoundResponse({ description: 'Gambar mobil tidak ditemukan' })
  highlightImage(@Param('id', new ParseUUIDPipe()) id: string): Promise<CarImageDto> {
    return this.carsService.highlightImage(id);
  }
}