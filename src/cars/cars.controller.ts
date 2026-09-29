import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { carUploadOptions, parseBulkCars } from './car-upload';
import { CarsService } from './cars.service';
import {
  BulkCarsFormDto,
  CarResponseDto,
  CarsPageDto,
  CarsQueryDto,
  UpdateCarDto,
} from './dto/car.dto';

@ApiTags('Cars')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cars')
export class CarsController {
  constructor(private readonly carsService: CarsService) {}

  @Get()
  @ApiOperation({ operationId: 'get_cars', summary: 'Menampilkan list mobil' })
  @ApiOkResponse({ type: CarsPageDto })
  getCars(@Query() query: CarsQueryDto) {
    return this.carsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ operationId: 'get_car_detail', summary: 'Menampilkan detail mobil' })
  @ApiOkResponse({ type: CarResponseDto })
  @ApiNotFoundResponse({ description: 'Mobil tidak ditemukan' })
  getCarDetail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.carsService.findOne(id);
  }

  @Post('bulk')
  @UseInterceptors(AnyFilesInterceptor(carUploadOptions))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ operationId: 'add_car', summary: 'Menambahkan satu atau banyak mobil' })
  @ApiBody({
    type: BulkCarsFormDto,
    schema: {
      type: 'object',
      required: ['cars'],
      properties: {
        cars: {
          type: 'string',
          description: 'Array JSON data mobil (1-20 item)',
          example:
            '[{"name":"Avanza Veloz","manufacturer":"Toyota","year":2022,"price":275000000}]',
        },
        images_0: {
          type: 'array',
          maxItems: 5,
          items: { type: 'string', format: 'binary' },
          description: 'Gambar untuk mobil index 0',
        },
        images_1: {
          type: 'array',
          maxItems: 5,
          items: { type: 'string', format: 'binary' },
          description: 'Gambar untuk mobil index 1, dan seterusnya',
        },
      },
    },
  })
  @ApiCreatedResponse({ type: [CarResponseDto] })
  async addCar(
    @Body() body: BulkCarsFormDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    try {
      const cars = await parseBulkCars(body.cars);
      return await this.carsService.createMany(cars, files);
    } catch (error) {
      await this.carsService.discardUploads(files);
      throw error;
    }
  }

  @Patch(':id')
  @UseInterceptors(AnyFilesInterceptor(carUploadOptions))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ operationId: 'update_car', summary: 'Mengubah data dan gambar mobil' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Avanza Veloz Q' },
        manufacturer: { type: 'string', example: 'Toyota' },
        year: { type: 'integer', example: 2023 },
        price: { type: 'integer', example: 290000000 },
        description: { type: 'string', nullable: true },
        removeImageIds: {
          type: 'string',
          description: 'Array JSON ID gambar',
          example: '["6d3d700a-3abe-4ef0-bdd3-37ff204f52c5"]',
        },
        images: {
          type: 'array',
          maxItems: 5,
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiOkResponse({ type: CarResponseDto })
  @ApiNotFoundResponse({ description: 'Mobil tidak ditemukan' })
  updateCar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: UpdateCarDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    return this.carsService.update(id, input, files);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ operationId: 'delete_car', summary: 'Menghapus mobil berdasarkan ID' })
  @ApiNoContentResponse({ description: 'Mobil berhasil dihapus' })
  @ApiNotFoundResponse({ description: 'Mobil tidak ditemukan' })
  deleteCar(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.carsService.delete(id);
  }
}