import express, { type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { extname, join } from 'node:path';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import type { ScenarioStore } from '../modules/murder-mystery/store';
import { rid } from '../platform/util';
import { MAPS, DEFAULT_MAP_ID } from '../../../shared/world';

/**
 * 운영자 전용 API. 일반 유저(닉네임 세션)와 분리된 비밀번호 인증을 쓴다.
 * ADMIN_PASSWORD 환경변수로 비밀번호를 지정한다.
 */
export function createAdminRouter(opts: { store: ScenarioStore; uploadsDir: string; password: string; onChanged(): void }) {
  const router = express.Router();
  const sessions = new Map<string, number>();
  const TTL = 12 * 60 * 60_000;
  mkdirSync(opts.uploadsDir, { recursive: true });

  const eq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
  let failures = 0, lockUntil = 0;

  router.post('/login', express.json(), (req, res) => {
    if (Date.now() < lockUntil) return res.status(429).json({ ok: false, error: '잠시 후 다시 시도해 주세요' });
    const pw = String(req.body?.password ?? '');
    if (!eq(pw, opts.password)) {
      if (++failures >= 5) { lockUntil = Date.now() + 30_000; failures = 0; }
      return res.status(401).json({ ok: false, error: '운영자 비밀번호가 올바르지 않습니다' });
    }
    failures = 0;
    const token = rid(24);
    sessions.set(token, Date.now() + TTL);
    res.json({ ok: true, token });
  });

  const auth = (req: Request, res: Response, next: NextFunction) => {
    const token = String(req.headers['x-admin-token'] ?? '');
    const exp = sessions.get(token);
    if (!exp || exp < Date.now()) return res.status(401).json({ ok: false, error: '운영자 로그인이 필요합니다' });
    next();
  };

  router.get('/scenarios', auth, (_req, res) => {
    res.json({ ok: true, scenarios: opts.store.list().map((s) => ({
      id: s.id, title: (s.raw as { title?: string })?.title ?? s.id, errors: s.issues.filter((i) => i.level === 'error').length,
      warnings: s.issues.filter((i) => i.level === 'warn').length, published: (s.raw as { published?: boolean })?.published !== false, updatedAt: s.updatedAt,
    })) });
  });

  router.get('/scenarios/:id', auth, (req, res) => {
    const s = opts.store.get(String(req.params.id));
    if (!s) return res.status(404).json({ ok: false, error: '없는 시나리오입니다' });
    res.json({ ok: true, raw: s.raw, issues: s.issues });
  });

  router.put('/scenarios/:id', auth, express.json({ limit: '5mb' }), (req, res) => {
    try {
      if (req.body?.id !== req.params.id) return res.status(400).json({ ok: false, error: '경로와 시나리오 ID가 다릅니다' });
      const s = opts.store.save(req.body);
      opts.onChanged();
      res.json({ ok: true, issues: s.issues });
    } catch (e) { res.status(400).json({ ok: false, error: (e as Error).message }); }
  });

  router.delete('/scenarios/:id', auth, (req, res) => {
    opts.store.remove(String(req.params.id));
    opts.onChanged();
    res.json({ ok: true });
  });

  const upload = multer({
    storage: multer.diskStorage({
      destination: opts.uploadsDir,
      filename: (_req, file, cb) => cb(null, `${Date.now().toString(36)}-${rid(4)}${extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => cb(null, /^image\/(png|jpe?g|gif|webp|svg\+xml)$/.test(file.mimetype)),
  });
  router.post('/upload', auth, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ ok: false, error: '이미지 파일(png/jpg/gif/webp/svg)만 올릴 수 있습니다' });
    res.json({ ok: true, url: `/uploads/${req.file.filename}` });
  });

  router.get('/uploads', auth, (_req, res) => {
    const files = readdirSync(opts.uploadsDir).filter((f) => /\.(png|jpe?g|gif|webp|svg)$/i.test(f))
      .map((f) => ({ url: `/uploads/${f}`, size: statSync(join(opts.uploadsDir, f)).size }));
    res.json({ ok: true, files });
  });

  router.get('/map', auth, (_req, res) => {
    const m = MAPS[DEFAULT_MAP_ID];
    res.json({ ok: true, mapId: m.id });
  });

  return router;
}
