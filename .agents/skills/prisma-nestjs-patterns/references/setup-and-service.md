# Prisma + NestJS — Setup y PrismaService

## Fuente oficial

https://www.prisma.io/docs/guides/other/nestjs

---

## 1. Instalación

```bash
npm install prisma @prisma/client
npx prisma init --datasource-provider postgresql
```

```bash
# En desarrollo con Supabase
DATABASE_URL="postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres"

# En producción con Cloud SQL
DATABASE_URL="postgresql://user:pass@/hada?host=/cloudsql/project:region:instance"
```

---

## 2. PrismaService — implementación canónica para NestJS

```typescript
// src/infrastructure/database/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: process.env.NODE_ENV === 'development'
        ? [{ emit: 'event', level: 'query' }, 'warn', 'error']
        : ['warn', 'error'],
      errorFormat: 'pretty',
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connection established');

    // Solo en desarrollo: loguear queries lentas
    if (process.env.NODE_ENV === 'development') {
      this.$on('query' as never, (e: any) => {
        if (e.duration > 100) {
          this.logger.warn(`Slow query (${e.duration}ms): ${e.query}`);
        }
      });
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  // Health check para el endpoint /health
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
```

---

## 3. DatabaseModule — global, importado una sola vez en AppModule

```typescript
// src/infrastructure/database/database.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()  // Hace PrismaService disponible en toda la app sin re-importar
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
```

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { DatabaseModule } from './infrastructure/database/database.module';
import { CirclesModule } from './modules/circles/circles.module';
// ... otros módulos

@Module({
  imports: [
    DatabaseModule,   // ← Una sola vez, aquí
    CirclesModule,
    // ...
  ],
})
export class AppModule {}
```

---

## 4. Uso en un repositorio de infraestructura

```typescript
// src/modules/reservations/infrastructure/prisma-reservation.repository.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ReservationRepository } from '../domain/reservation.repository.interface';

@Injectable()
export class PrismaReservationRepository implements ReservationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveByGiftId(giftId: string) {
    return this.prisma.reservation.findFirst({
      where: { giftId, status: 'ACTIVE' },
    });
  }
}
```

---

## 5. Health check endpoint

```typescript
// src/health/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../infrastructure/database/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    const dbHealthy = await this.prisma.isHealthy();
    return {
      status: dbHealthy ? 'ok' : 'error',
      db: dbHealthy ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    };
  }
}
```

---

## 6. Connection pooling con PgBouncer (producción)

Con Cloud SQL + Cloud Run, es obligatorio usar PgBouncer o el connection pooler de Cloud SQL.
Añadir `?pgbouncer=true&connection_limit=1` a la DATABASE_URL:

```env
# Cloud Run + Cloud SQL con PgBouncer
DATABASE_URL="postgresql://user:pass@/hada?host=/cloudsql/project:region:instance&pgbouncer=true&connection_limit=1"
```

Referencia: https://www.prisma.io/docs/guides/performance-and-optimization/connection-management/configure-pg-bouncer
