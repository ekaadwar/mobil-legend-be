import { ApiHideProperty, ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEmpty,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Matches,
  Min,
  MinLength,
} from 'class-validator';

const currentYear = new Date().getFullYear() + 1;

export enum CarStatus {
  READY = 'ready',
  PENDING = 'pending',
  RESERVE = 'reserve',
  SOLD = 'sold',
}

function nullableValue(value: unknown): unknown {
  return value === '' || value === 'null' ? null : value;
}

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

  @ApiProperty({ example: 'Silver Metallic' })
  @IsString()
  @Length(1, 100)
  color?: string;

  @ApiPropertyOptional({ example: 'Kondisi terawat, servis rutin.' })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === 'null' ? null : value))
  @IsString()
  @MinLength(1)
  description?: string | null;

  @ApiPropertyOptional({ enum: CarStatus, nullable: true, example: 'ready' })
  @IsOptional()
  @Transform(({ value }) => nullableValue(value))
  @IsEnum(CarStatus)
  status?: CarStatus | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Automatic', maxLength: 100 })
  @IsOptional()
  @Transform(({ value }) => nullableValue(value))
  @IsString()
  @Length(1, 100)
  transmission?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 45000, minimum: 0, maximum: 2147483647, description: 'Jarak tempuh dalam kilometer (bilangan bulat)' })
  @IsOptional()
  @Transform(({ value }) => {
    const normalized = nullableValue(value);
    return typeof normalized === 'string' ? Number(normalized) : normalized;
  })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  mileage?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Bensin', maxLength: 100 })
  @IsOptional()
  @Transform(({ value }) => nullableValue(value))
  @IsString()
  @Length(1, 100)
  fuel?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'B 1234 ABC', maxLength: 30 })
  @IsOptional()
  @Transform(({ value }) => nullableValue(value))
  @IsString()
  @Length(1, 30)
  registration_number?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date', nullable: true, example: '2027-10-07' })
  @IsOptional()
  @Transform(({ value }) => nullableValue(value))
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  validity_period?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Mobil Legend Jakarta', maxLength: 150 })
  @IsOptional()
  @Transform(({ value }) => nullableValue(value))
  @IsString()
  @Length(1, 150)
  showroom_name?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Jl. Sudirman No. 10, Jakarta' })
  @IsOptional()
  @Transform(({ value }) => nullableValue(value))
  @IsString()
  @MinLength(1)
  showroom_address?: string | null;
}

export class UpdateCarDto extends PartialType(CreateCarDto) {
  @ApiHideProperty()
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsEmpty({ message: 'images harus berupa file upload, bukan teks' })
  images?: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Array JSON ID gambar yang akan dihapus',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return value;
    if (value.trim() === '') return [];
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
  @ApiPropertyOptional({ type: 'integer', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ type: 'integer', default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perpage: number = 10;

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

export class CarListResponseDto {
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

  @ApiProperty({ enum: CarStatus, nullable: true })
  status!: CarStatus | null;

  @ApiProperty({type:String, nullable:true})
  color!: string | null;

  @ApiProperty({ type: String, nullable: true })
  transmission!: string | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Jarak tempuh dalam kilometer' })
  mileage!: number | null;

  @ApiProperty({ type: String, format: 'date', nullable: true })
  validity_period!: string | null;
}

export class CarResponseDto extends CarListResponseDto {
  @ApiProperty({ type: String, nullable: true })
  fuel!: string | null;

  @ApiProperty({ type: String, nullable: true })
  registration_number!: string | null;

  @ApiProperty({ type: String, nullable: true })
  showroom_name!: string | null;

  @ApiProperty({ type: String, nullable: true })
  showroom_address!: string | null;
}

export class CarsPageDto {
  @ApiProperty({ type: [CarListResponseDto] })
  data!: CarListResponseDto[];

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
      '[{"name":"Avanza Veloz","manufacturer":"Toyota","year":2022,"price":275000000,"status":"ready","transmission":"Automatic","mileage":45000,"fuel":"Bensin","registration_number":"B 1234 ABC","validity_period":"2027-10-07","showroom_name":"Mobil Legend Jakarta","showroom_address":"Jl. Sudirman No. 10, Jakarta"}]',
    description: 'Array JSON data mobil, maksimal 20 item',
  })
  @IsString()
  cars!: string;
}