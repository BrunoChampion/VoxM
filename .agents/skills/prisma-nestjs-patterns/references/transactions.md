# Prisma — Transacciones Atómicas y Concurrencia

## Fuentes oficiales

- Transactions: https://www.prisma.io/docs/orm/prisma-client/queries/transactions
- Interactive transactions: https://www.prisma.io/docs/orm/prisma-client/queries/transactions#interactive-transactions
- Raw queries: https://www.prisma.io/docs/orm/prisma-client/queries/raw-database-access/raw-queries

---

## 1. Tipos de transacciones en Prisma

### Sequential operations (batch sin lógica intermedia)

```typescript
// Cuando las operaciones son independientes y no necesitan leer resultados intermedios
const [updatedGift, newReservation] = await this.prisma.$transaction([
  this.prisma.gift.update({ where: { id: giftId }, data: { estado: 'RESERVED' } }),
  this.prisma.reservation.create({ data: { giftId, reservedById: userId } }),
]);
```

### Interactive transactions (lógica condicional dentro de la transacción)

```typescript
// Cuando necesitas leer un resultado para decidir el siguiente paso
await this.prisma.$transaction(async (tx) => {
  const gift = await tx.gift.findUnique({ where: { id: giftId } });
  if (!gift) throw new NotFoundException('Regalo no encontrado');
  if (gift.estado !== 'AVAILABLE') throw new ConflictException('Regalo ya reservado');

  await tx.gift.update({ where: { id: giftId }, data: { estado: 'RESERVED' } });
  return tx.reservation.create({ data: { giftId, reservedById: userId, status: 'ACTIVE' } });
});
```

---

## 2. Algoritmo de Reserva Privada — implementación completa

Este es el algoritmo más crítico del sistema HADA. Usa interactive transaction + raw SELECT FOR UPDATE
para evitar condición de carrera cuando dos usuarios intentan reservar el mismo regalo simultáneamente.

```typescript
// src/modules/reservations/application/reserve-gift.use-case.ts
import { Injectable, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

export interface ReserveGiftResult {
  giftId: string;
  estado: 'RESERVED';
  reservadoEn: Date;
  // ⚠️ Nunca incluir reservedById en este resultado — invariante de privacidad
}

@Injectable()
export class ReserveGiftUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(giftId: string, userId: string): Promise<ReserveGiftResult> {
    return this.prisma.$transaction(async (tx) => {

      // Paso 1: SELECT FOR UPDATE — bloquea la fila hasta que termine la transacción
      // Previene condición de carrera: si dos usuarios ejecutan esto simultáneamente,
      // el segundo esperará hasta que el primero confirme o haga rollback.
      const [gift] = await tx.$queryRaw<Array<{
        id: string; estado: string; listId: string;
      }>>`
        SELECT id, estado, "listId"
        FROM gifts
        WHERE id = ${giftId}
        FOR UPDATE
      `;

      if (!gift) throw new NotFoundException('Regalo no encontrado');

      // Paso 2: Si ya está reservado, retornar estado SIN revelar reservante
      if (gift.estado === 'RESERVED') {
        return { giftId, estado: 'RESERVED' as const, reservadoEn: new Date() };
      }

      if (gift.estado === 'RECEIVED') {
        throw new ConflictException('Este regalo ya fue recibido');
      }

      // Paso 3: Validar que el usuario no es el propietario del regalo
      const list = await tx.list.findUnique({
        where: { id: gift.listId },
        include: { ownerProfile: { select: { ownerId: true } } },
      });

      if (list?.ownerProfile.ownerId === userId) {
        throw new ForbiddenException('No puedes reservar regalos de tu propia lista');
      }

      // Paso 4: Actualizar estado + crear reserva en la misma transacción
      const [, reservation] = await Promise.all([
        tx.gift.update({
          where: { id: giftId },
          data: { estado: 'RESERVED', updatedAt: new Date() },
        }),
        tx.reservation.create({
          data: { giftId, reservedById: userId, status: 'ACTIVE' },
        }),
      ]);

      // Paso 5: Retornar resultado SIN datos del reservante
      return {
        giftId,
        estado: 'RESERVED' as const,
        reservadoEn: reservation.reservedAt,
        // ❌ NO incluir: reservedById, nombreReservante, ni ningún dato identificativo
      };
    }, {
      // Timeout de transacción: 10 segundos máximo
      timeout: 10000,
      // Nivel de aislamiento: previene dirty reads y non-repeatable reads
      isolationLevel: 'ReadCommitted',
    });
  }
}
```

---

## 3. Liberación de reserva

```typescript
// src/modules/reservations/application/release-gift.use-case.ts
@Injectable()
export class ReleaseGiftUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(giftId: string, userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Solo el reservante original puede liberar
      const reservation = await tx.reservation.findFirst({
        where: { giftId, reservedById: userId, status: 'ACTIVE' },
      });

      if (!reservation) {
        throw new ForbiddenException('No tienes una reserva activa en este regalo');
      }

      await Promise.all([
        tx.reservation.update({
          where: { id: reservation.id },
          data: { status: 'CANCELLED' },
        }),
        tx.gift.update({
          where: { id: giftId },
          data: { estado: 'AVAILABLE' },
        }),
      ]);
    });
  }
}
```

---

## 4. Manejo de errores de transacción

```typescript
import { Prisma } from '@prisma/client';

// En el controller o use case que llama la transacción:
try {
  await this.reserveGiftUseCase.execute(giftId, userId);
} catch (error) {
  // Error de constraint único (ej: doble reserva por race condition no cubierta)
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      throw new ConflictException('Este regalo ya fue reservado');
    }
    if (error.code === 'P2025') {
      throw new NotFoundException('Registro no encontrado');
    }
  }
  throw error;
}
```

### Códigos de error Prisma más comunes

| Código  | Significado              | Acción típica             |
| ------- | ------------------------ | ------------------------- |
| `P2002` | Violación de unicidad    | `409 Conflict`            |
| `P2003` | Violación de FK          | `400 Bad Request`         |
| `P2025` | Registro no encontrado   | `404 Not Found`           |
| `P2034` | Conflicto de transacción | Retry                     |
| `P1001` | No puede conectar a BD   | `503 Service Unavailable` |

---

## 5. Transacciones para borrado en cascada de usuario (GDPR)

```typescript
async deleteUserAccount(userId: string): Promise<void> {
  await this.prisma.$transaction(async (tx) => {
    // El orden importa: borrar hijos antes que padres si no hay onDelete: Cascade
    // Con Cascade en el schema, Prisma lo gestiona automáticamente
    await tx.user.delete({ where: { id: userId } });
    // Cascade borra: profiles → lists → gifts → reservations, memberships, ownedCircles
  });
}
```
