import { describe, expect, it } from 'bun:test';
import { LayerTagger } from '../../src/core/scorer/layers.js';

describe('LayerTagger Architectural Classification Unit Tests', () => {
  const tagger = new LayerTagger();

  describe('Express & Node.js ecosystem', () => {
    it('correctly classifies Express application files', () => {
      expect(tagger.tagPath('src/routes/users.ts')).toContain('api');
      expect(tagger.tagPath('src/controllers/authController.ts')).toContain('api');
      expect(tagger.tagPath('src/middleware/auth.ts')).toContain('auth');
      expect(tagger.tagPath('src/models/User.ts')).toContain('db');
      expect(tagger.tagPath('src/services/paymentService.ts')).toContain('core');
      expect(tagger.tagPath('src/config/database.ts')).toContain('config');
    });
  });

  describe('Next.js ecosystem', () => {
    it('correctly classifies Next.js App Router and Pages Router files', () => {
      expect(tagger.tagPath('app/api/auth/[...nextauth]/route.ts')).toContain('api');
      expect(tagger.tagPath('app/api/auth/[...nextauth]/route.ts')).toContain('auth');
      expect(tagger.tagPath('app/dashboard/page.tsx')).toContain('ui');
      expect(tagger.tagPath('components/Navbar.tsx')).toContain('ui');
      expect(tagger.tagPath('prisma/schema.prisma')).toContain('db');
      expect(tagger.tagPath('next.config.js')).toContain('config');
    });
  });

  describe('Django ecosystem', () => {
    it('correctly classifies Django project structure files', () => {
      expect(tagger.tagPath('blog/views.py')).toContain('api');
      expect(tagger.tagPath('blog/models.py')).toContain('db');
      expect(tagger.tagPath('blog/migrations/0001_initial.py')).toContain('db');
      expect(tagger.tagPath('myproject/settings.py')).toContain('config');
      expect(tagger.tagPath('templates/blog/index.html')).toContain('ui');
    });
  });

  describe('FastAPI ecosystem', () => {
    it('correctly classifies FastAPI application files', () => {
      expect(tagger.tagPath('app/routers/items.py')).toContain('api');
      expect(tagger.tagPath('app/schemas/item.py')).toContain('db');
      expect(tagger.tagPath('alembic/versions/1234_create_users.py')).toContain('db');
      expect(tagger.tagPath('app/core/config.py')).toContain('core');
      expect(tagger.tagPath('app/core/config.py')).toContain('config');
    });
  });

  describe('NestJS ecosystem', () => {
    it('correctly classifies NestJS controller, service, and auth guards', () => {
      expect(tagger.tagPath('src/users/users.controller.ts')).toContain('api');
      expect(tagger.tagPath('src/users/users.service.ts')).toContain('core');
      expect(tagger.tagPath('src/auth/guards/jwt-auth.guard.ts')).toContain('auth');
      expect(tagger.tagPath('src/database/entities/user.entity.ts')).toContain('db');
    });
  });

  describe('Background Workers & Queues', () => {
    it('correctly classifies queues, celery tasks, and background workers', () => {
      expect(tagger.tagPath('src/workers/emailProcessor.ts')).toContain('worker');
      expect(tagger.tagPath('src/jobs/nightlyBackup.ts')).toContain('worker');
      expect(tagger.tagPath('tasks/celery.py')).toContain('worker');
      expect(tagger.tagPath('src/queues/sqsHandler.ts')).toContain('worker');
    });
  });

  describe('Unknown / Unclassified files', () => {
    it('returns empty array and unknown for unclassified project artifacts', () => {
      expect(tagger.tagPath('README.md')).toEqual([]);
      expect(tagger.classify('README.md')).toBe('unknown');
      expect(tagger.classify('LICENSE')).toBe('unknown');
      expect(tagger.classify('.github/workflows/ci.yml')).toBe('unknown');
    });
  });
});
