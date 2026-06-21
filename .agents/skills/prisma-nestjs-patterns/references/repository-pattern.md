# Prisma — Repository Pattern en Clean Architecture

## Fuente de referencia

- Clean Architecture con Prisma: https://www.prisma.io/blog/nestjs-prisma-rest-api-7D056s1BmOL0
- DDD con Prisma: https://www.prisma.io/blog/domain-driven-design-with-prisma

---

## Estructura de un módulo completo (ejemplo: Reservations)

```
src/modules/reservations/
├── domain/
│   ├── reservation.entity.ts          ← Entidad de dominio pura (sin Prisma)
│   └── reservation.repository.ts      ← Interfaz (puerto)
├── application/
│   ├── reserve-gift.use-case.ts
│   └── release-gift.use-case.ts
├── infrastructure/
│   ├── prisma-reservation.repository.ts  ← Adaptador (implementa el puerto)
│   └── reservations.module.ts
├── presentation/
│   ├── reservations.controller.ts
│   └── dto/
│       ├── reserve-gift.dto.ts
│       └── reservation-response.dto.ts  ← ⚠️ Sin reservedById
└── reservations.module.ts
```

---

## 1. Entidad de dominio

```typescript
// domain/reservation.entity.ts
// Entidad pura — sin imports de Prisma ni NestJS
export class Reservation {
  constructor(
    public readonly id: string,
    public readonly giftId: string,
    public readonly reservedById: string,   // Solo visible internamente en el dominio
    public readonly reservedAt: Date,
    public readonly status: 'ACTIVE' | 'CANCELLED',
  ) {}

  isActive(): boolean {
    return this.status === 'ACTIVE';
  }

  canBeReleasedBy(userId: string): boolean {
    return this.reservedById === userId && this.isActive();
  }
}
```

---

## 2. Interfaz del repositorio (puerto)

```typescript
// domain/reservation.repository.ts
import { Reservation } from './reservation.entity';

export interface CreateReservationData {
  giftId: string;
  reservedById: string;
}

export abstract class ReservationRepository {
  abstract findActiveByGiftId(giftId: string): Promise<Reservation | null>;
  abstract findByUserAndGift(userId: string, giftId: string): Promise<Reservation | null>;
  abstract create(data: CreateReservationData): Promise<Reservation>;
  abstract cancel(id: string): Promise<void>;
}
```

---

## 3. Implementación Prisma (adaptador)

```typescript
// infrastructure/prisma-reservation.repository.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ReservationRepository, CreateReservationData } from '../domain/reservation.repository';
import { Reservation } from '../domain/reservation.entity';

@Injectable()
export class PrismaReservationRepository extends ReservationRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findActiveByGiftId(giftId: string): Promise<Reservation | null> {
    const record = await this.prisma.reservation.findFirst({
      where: { giftId, status: 'ACTIVE' },
    });
    return record ? this.toDomain(record) : null;
  }

  async findByUserAndGift(userId: string, giftId: string): Promise<Reservation | null> {
    const record = await this.prisma.reservation.findFirst({
      where: { reservedById: userId, giftId, status: 'ACTIVE' },
    });
    return record ? this.toDomain(record) : null;
  }

  async create(data: CreateReservationData): Promise<Reservation> {
    const record = await this.prisma.reservation.create({ data });
    return this.toDomain(record);
  }

  async cancel(id: string): Promise<void> {
    await this.prisma.reservation.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  // Mapper: Prisma record → Entidad de dominio
  private toDomain(record: any): Reservation {
    return new Reservation(
      record.id,
      record.giftId,
      record.reservedById,
      record.reservedAt,
      record.status,
    );
  }
}
```

---

## 4. Registro en el módulo NestJS

```typescript
// reservations.module.ts
import { Module } from '@nestjs/common';
import { ReservationRepository } from './domain/reservation.repository';
import { PrismaReservationRepository } from './infrastructure/prisma-reservation.repository';
import { ReserveGiftUseCase } from './application/reserve-gift.use-case';
import { ReleaseGiftUseCase } from './application/release-gift.use-case';
import { ReservationsController } from './presentation/reservations.controller';

@Module({
  controllers: [ReservationsController],
  providers: [
    // Binding: cuando alguien inyecte ReservationRepository, recibe PrismaReservationRepository
    { provide: ReservationRepository, useClass: PrismaReservationRepository },
    ReserveGiftUseCase,
    ReleaseGiftUseCase,
  ],
})
export class ReservationsModule {}
```

---

## 5. DTO de respuesta — sin reservedById

```typescript
// presentation/dto/reservation-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';

// DTO para el propietario de la lista (nunca ve quién reservó)
export class GiftStatusResponseDto {
  @ApiProperty({ example: 'uuid-gift-123' })
  giftId: string;

  @ApiProperty({ enum: ['AVAILABLE', 'RESERVED', 'RECEIVED'] })
  estado: string;

  @ApiProperty({ required: false })
  reservadoEn?: Date;

  // ❌ NUNCA añadir: reservedById, reservanteName, reservanteEmail
}

// DTO para el propio reservante (ve que puede liberar SU reserva)
export class MyReservationResponseDto extends GiftStatusResponseDto {
  @ApiProperty({ description: 'El usuario autenticado puede liberar esta reserva' })
  puedesLiberar: boolean;
}
```
