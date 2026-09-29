import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  MinLength,
} from 'class-validator';

const currentYear = new Date().getFullYear() + 1;

export class CreateCarDto {
  @ApiProperty({ example: 'Avanza Veloz' })
  @IsString()
  @Length(1, 150)
  name!: string;

  @ApiProperty({ example: 'Toyota' })
  @IsString()
  @Length(1, 100)
  manufacturer!: string;

  @ApiProperty({ example: 2022 })
  @Type(() => Number)
  @IsInt()
  @Min(1886)
  @Max(currentYear)
  year!: number;

  @ApiProperty({ example: 275000000, description: 'Harga dalam rupiah' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  price!: number;

  @ApiPropertyOptional({ example: 'Kondisi terawat, servis rutin.' })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === 'null' ? null : value))
  @IsString()
  @MinLength(1)
  description?: string | null;
}

export class UpdateCarDto extends PartialType(CreateCarDto) {
  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Array JSON ID gambar yang akan dihapus',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  })
  @IsArray()
  @IsUUID('4', { each: true })
  removeImageIds?: string[];
}

export class CarsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perpage = 10;

  @ApiPropertyOptional({ description: 'Cari nama mobil atau pabrikan' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ example: 2018 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1886)
  @Max(currentYear)
  start_year?: number;

  @ApiPropertyOptional({ example: 2024 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1886)
  @Max(currentYear)
  end_year?: number;
}

export class CarImageDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: '/uploads/1234.jpg' })
  url!: string;
}

export class CarResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  manufacturer!: string;

  @ApiProperty()
  year!: number;

  @ApiProperty({ example: 275000000 })
  price!: number;

  @ApiPropertyOptional()
  description?: string | null;

  @ApiProperty({ type: [CarImageDto] })
  images!: CarImageDto[];
}

export class CarsPageDto {
  @ApiProperty({ type: [CarResponseDto] })
  data!: CarResponseDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  perpage!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  totalPages!: number;
}

export class BulkCarsFormDto {
  @ApiProperty({
    type: String,
    example:
      '[{"name":"Avanza Veloz","manufacturer":"Toyota","year":2022,"price":275000000}]',
    description: 'Array JSON data mobil, maksimal 20 item',
  })
  @IsString()
  cars!: string;
}