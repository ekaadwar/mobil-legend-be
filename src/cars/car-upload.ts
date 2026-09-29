import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { diskStorage } from 'multer';
import { CreateCarDto } from './dto/car.dto';

const uploadDirectory = join(process.cwd(), 'uploads');
mkdirSync(uploadDirectory, { recursive: true });

export const carUploadOptions: MulterOptions = {
  storage: diskStorage({
    destination: uploadDirectory,
    filename: (_request, file, callback) => {
      const extension = file.mimetype === 'image/png' ? '.png' : '.jpg';
      callback(null, `${randomUUID()}${extension}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024, files: 100 },
  fileFilter: (_request, file, callback) => {
    const validMime = ['image/png', 'image/jpeg'].includes(file.mimetype);
    const validExtension = ['.png', '.jpg', '.jpeg'].includes(
      extname(file.originalname).toLowerCase(),
    );
    if (!validMime || !validExtension) {
      callback(new BadRequestException('Gambar harus berformat PNG atau JPG'), false);
      return;
    }
    callback(null, true);
  },
};

export async function parseBulkCars(value: string): Promise<CreateCarDto[]> {
  let raw: unknown;
  try {
    raw = JSON.parse(value) as unknown;
  } catch {
    throw new BadRequestException('Field cars harus berupa array JSON yang valid');
  }

  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 20) {
    throw new BadRequestException('Field cars harus berisi 1 sampai 20 mobil');
  }

  const cars = plainToInstance(CreateCarDto, raw);
  const validationResults = await Promise.all(
    cars.map((car) => validate(car, { whitelist: true, forbidNonWhitelisted: true })),
  );
  const invalidIndex = validationResults.findIndex((errors) => errors.length > 0);
  if (invalidIndex !== -1) {
    throw new BadRequestException({
      message: `Data mobil pada index ${invalidIndex} tidak valid`,
      errors: validationResults[invalidIndex],
    });
  }
  return cars;
}