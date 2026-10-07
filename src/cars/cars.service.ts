import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import {
  CarListResponseDto,
  CarResponseDto,
  CarStatus,
  CarsPageDto,
  CarsQueryDto,
  CreateCarDto,
  UpdateCarDto,
} from './dto/car.dto';
import { Prisma } from '@prisma/client';

interface CarImageRecord {
  id: string;
  filename: string;
  url: string;
}

interface CarWithImages {
  id: string;
  name: string;
  manufacturer: string;
  year: number;
  price: bigint;
  description: string | null;
  status: string | null;
  transmission: string | null;
  mileage: number | null;
  fuel: string | null;
  registrationNumber: string | null;
  validityPeriod: Date | null;
  showroomName: string | null;
  showroomAddress: string | null;
  images: CarImageRecord[];
}

@Injectable()
export class CarsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: CarsQueryDto): Promise<CarsPageDto> {
    if (
      query.start_year !== undefined &&
      query.end_year !== undefined &&
      query.start_year > query.end_year
    ) {
      throw new BadRequestException('start_year tidak boleh melebihi end_year');
    }

    const where: Prisma.CarWhereInput  = {
      ...(query.name && {
        OR: [
          { name: { contains: query.name, mode: 'insensitive' } },
          { manufacturer: { contains: query.name, mode: 'insensitive' } },
        ],
      }),
      ...((query.start_year !== undefined || query.end_year !== undefined) && {
        year: { gte: query.start_year, lte: query.end_year },
      }),
    };
    const [cars, total] = await this.prisma.$transaction([
      this.prisma.car.findMany({
        where,
        include: { images: true },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.perpage,
        take: query.perpage,
      }),
      this.prisma.car.count({ where }),
    ]);

    return {
      data: cars.map((car) => this.serializeList(car)),
      page: query.page,
      perpage: query.perpage,
      total,
      totalPages: Math.ceil(total / query.perpage),
    };
  }

  async findOne(id: string): Promise<CarResponseDto> {
    return this.serialize(await this.findEntity(id));
  }

  async createMany(
    inputs: CreateCarDto[],
    files: Express.Multer.File[] = [],
  ): Promise<CarResponseDto[]> {
    const groupedFiles = this.groupBulkFiles(inputs.length, files);
    try {
      const cars = await this.prisma.$transaction(async (transaction) => {
        const created: CarWithImages[] = [];
        for (const [index, input] of inputs.entries()) {
          created.push(
            await transaction.car.create({
              data: {
                name: input.name,
                manufacturer: input.manufacturer,
                year: input.year,
                price: BigInt(input.price),
                description: input.description,
                ...this.additionalData(input),
                images: {
                  create: groupedFiles[index].map((file) => this.imageData(file)),
                },
              },
              include: { images: true },
            }),
          );
        }
        return created;
      });
      return cars.map((car: CarWithImages) => this.serialize(car));
    } catch (error) {
      await this.removeFiles(files);
      throw error;
    }
  }

  async update(
    id: string,
    input: UpdateCarDto,
    files: Express.Multer.File[] = [],
  ): Promise<CarResponseDto> {
    if (files.some((file) => file.fieldname !== 'images')) {
      await this.removeFiles(files);
      throw new BadRequestException('Field file untuk update harus bernama images');
    }
    const existing = await this.findEntity(id);
    const removeIds = new Set(input.removeImageIds ?? []);
    const imagesToRemove = existing.images.filter((image) => removeIds.has(image.id));
    if (imagesToRemove.length !== removeIds.size) {
      await this.removeFiles(files);
      throw new BadRequestException('Salah satu ID gambar tidak dimiliki mobil ini');
    }
    if (existing.images.length - imagesToRemove.length + files.length > 5) {
      await this.removeFiles(files);
      throw new BadRequestException('Setiap mobil maksimal memiliki 5 gambar');
    }

    try {
      const car = await this.prisma.car.update({
        where: { id },
        data: {
          name: input.name,
          manufacturer: input.manufacturer,
          year: input.year,
          description: input.description,
          ...(input.price !== undefined && { price: BigInt(input.price) }),
          ...this.additionalData(input),
          images: {
            deleteMany: { id: { in: [...removeIds] } },
            create: files.map((file) => this.imageData(file)),
          },
        },
        include: { images: true },
      });
      await this.removeFilenames(imagesToRemove.map((image) => image.filename));
      return this.serialize(car);
    } catch (error) {
      await this.removeFiles(files);
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    const existing = await this.findEntity(id);
    await this.prisma.car.delete({ where: { id } });
    await this.removeFilenames(existing.images.map((image) => image.filename));
  }

  async discardUploads(files: Express.Multer.File[] = []): Promise<void> {
    await this.removeFiles(files);
  }

  private async findEntity(id: string): Promise<CarWithImages> {
    const car = await this.prisma.car.findUnique({
      where: { id },
      include: { images: true },
    });
    if (!car) throw new NotFoundException('Mobil tidak ditemukan');
    return car;
  }

  private groupBulkFiles(count: number, files: Express.Multer.File[]) {
    const groups = Array.from({ length: count }, () => [] as Express.Multer.File[]);
    for (const file of files) {
      const match = /^images_(\d+)$/.exec(file.fieldname);
      const index = match ? Number(match[1]) : -1;
      if (index < 0 || index >= count) {
        void this.removeFiles(files);
        throw new BadRequestException('Field gambar bulk harus bernama images_0, images_1, dan seterusnya');
      }
      groups[index].push(file);
      if (groups[index].length > 5) {
        void this.removeFiles(files);
        throw new BadRequestException(`Mobil pada index ${index} memiliki lebih dari 5 gambar`);
      }
    }
    return groups;
  }

  private imageData(file: Express.Multer.File) {
    return { filename: file.filename, url: `/uploads/${file.filename}` };
  }

  private additionalData(input: UpdateCarDto) {
    return {
      status: input.status,
      transmission: input.transmission,
      mileage: input.mileage,
      fuel: input.fuel,
      registrationNumber: input.registration_number,
      validityPeriod: input.validity_period == null
        ? input.validity_period
        : new Date(`${input.validity_period}T00:00:00.000Z`),
      showroomName: input.showroom_name,
      showroomAddress: input.showroom_address,
    };
  }

  private serialize(car: CarWithImages): CarResponseDto {
    return {
      ...this.serializeList(car),
      fuel: car.fuel,
      registration_number: car.registrationNumber,
      showroom_name: car.showroomName,
      showroom_address: car.showroomAddress,
    };
  }

  private serializeList(car: CarWithImages): CarListResponseDto {
    return {
      id: car.id,
      name: car.name,
      manufacturer: car.manufacturer,
      year: car.year,
      price: Number(car.price),
      description: car.description,
      status: car.status as CarStatus | null,
      transmission: car.transmission,
      mileage: car.mileage,
      validity_period: car.validityPeriod?.toISOString().slice(0, 10) ?? null,
      images: car.images.map(({ id, url }) => ({ id, url })),
    };
  }

  private removeFiles(files: Express.Multer.File[]) {
    return this.removeFilenames(files.map((file) => file.filename));
  }

  private async removeFilenames(filenames: string[]) {
    await Promise.all(
      filenames.map((filename) =>
        unlink(join(process.cwd(), 'uploads', filename)).catch(() => undefined),
      ),
    );
  }
}