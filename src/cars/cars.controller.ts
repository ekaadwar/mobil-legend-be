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
  CarStatus,
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
    schema: {
      type: 'object',
      required: ['cars'],
      properties: {
        cars: {
          type: 'string',
          description: 'Array JSON data mobil (1-20 item). Delapan field tambahan opsional dan nullable; validity_period berformat YYYY-MM-DD, mileage kilometer bulat nonnegatif.',
          example:
            '[{"name":"Avanza Veloz","manufacturer":"Toyota","year":2022,"price":275000000,"status":"ready","transmission":"Automatic","mileage":45000,"fuel":"Bensin","registration_number":"B 1234 ABC","validity_period":"2027-10-07","showroom_name":"Mobil Legend Jakarta","showroom_address":"Jl. Sudirman No. 10, Jakarta"}]',
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
    description: 'Field yang tidak dikirim tidak diubah. Untuk mengosongkan field tambahan, kirim teks null atau string kosong dalam form-data.',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Avanza Veloz Q' },
        manufacturer: { type: 'string', example: 'Toyota' },
        year: { type: 'integer', example: 2023 },
        price: { type: 'integer', example: 290000000 },
        description: { type: 'string', nullable: true },
        status: { type: 'string', enum: Object.values(CarStatus), nullable: true, example: 'pending' },
        transmission: { type: 'string', maxLength: 100, nullable: true, example: 'Automatic' },
        mileage: { type: 'integer', minimum: 0, maximum: 2147483647, nullable: true, example: 46000 },
        fuel: { type: 'string', maxLength: 100, nullable: true, example: 'Bensin' },
        registration_number: { type: 'string', maxLength: 30, nullable: true, example: 'B 1234 ABC' },
        validity_period: { type: 'string', format: 'date', nullable: true, example: '2028-10-07' },
        showroom_name: { type: 'string', maxLength: 150, nullable: true, example: 'Mobil Legend Jakarta' },
        showroom_address: { type: 'string', nullable: true, example: 'Jl. Sudirman No. 10, Jakarta' },
        removeImageIds: {
          type: 'string',
          description: 'Array JSON UUID gambar yang akan dihapus. Kosongkan, jangan kirim, atau isi [] untuk mempertahankan gambar lama.',
          example: '[]',
        },
        images: {
          type: 'array',
          maxItems: 5,
          items: { type: 'string', format: 'binary' },
          description: 'File gambar baru (opsional). Tanpa file atau field kosong tidak mengubah gambar lama.',
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