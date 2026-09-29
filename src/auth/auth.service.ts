import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { timingSafeEqual } from 'node:crypto';
import { LoginDto, LoginResponseDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  async login(input: LoginDto): Promise<LoginResponseDto> {
    const expectedUsername = this.config.get('ADMIN_USERNAME', 'admin');
    const expectedPassword = this.config.get('ADMIN_PASSWORD', 'admin123');

    if (
      !this.matches(input.username, expectedUsername) ||
      !this.matches(input.password, expectedPassword)
    ) {
      throw new UnauthorizedException('Username atau password salah');
    }

    return {
      accessToken: await this.jwt.signAsync({ sub: 'admin', username: 'admin' }),
      tokenType: 'Bearer',
      expiresIn: this.parseExpiresIn(),
    };
  }

  private matches(actual: string, expected: string): boolean {
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);
    return (
      actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }

  private parseExpiresIn(): number {
    const value = this.config.get('JWT_EXPIRES_IN', '1h');
    const match = /^(\d+)([smhd])?$/.exec(value);
    if (!match) return 3600;
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
    return Number(match[1]) * multipliers[(match[2] ?? 's') as keyof typeof multipliers];
  }
}