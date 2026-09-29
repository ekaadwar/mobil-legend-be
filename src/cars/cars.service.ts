import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import {
  CarResponseDto,
  CarsPageDto,
  CarsQueryDto,
  CreateCarDto,
  UpdateCarDto,
} from './dto/car.dto';

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

    const where = {
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
    const [cars, total]: [CarWithImages[], number] = await this.prisma.$transaction([
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
      data: cars.map((car) => this.serialize(car)),
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
      const cars = await this.prisma.$transaction(async (transaction: PrismaService) => {
        const created: CarWithImages[] = [];
        for (const [index, input] of inputs.entries()) {
          created.push(
            await transaction.car.create({
              data: {
                ...input,
                price: BigInt(input.price),
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

    const { removeImageIds: _removeImageIds, ...changes } = input;
    try {
      const car = await this.prisma.car.update({
        where: { id },
        data: {
          ...changes,
          ...(changes.price !== undefined && { price: BigInt(changes.price) }),
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

  private serialize(car: CarWithImages): CarResponseDto {
    return {
      id: car.id,
      name: car.name,
      manufacturer: car.manufacturer,
      year: car.year,
      price: Number(car.price),
      description: car.description,
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