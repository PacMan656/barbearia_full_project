import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { db, migrate, seedIfEmpty } from "./db.js";
import {
  authMiddleware,
  ensureAdmin,
  ensureAdminUser,
  signToken,
  verifyPassword,
} from "./auth.js";

migrate();
seedIfEmpty();
ensureAdminUser();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(helmet());
app.use(express.json());
app.use(morgan("dev"));
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(",") || "*" }));

const limiter = rateLimit({ windowMs: 60_000, max: 100 });
app.use(limiter);

// Auth
app.post("/auth/login", (req, res) => {
  const Schema = z.object({
    email: z.string().email(),
    password: z.string().min(3),
  });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password } = parsed.data;
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !verifyPassword(user.password_hash, password))
    return res.status(401).json({ error: "invalid_credentials" });
  const token = signToken(user);
  return res.json({ token });
});

// Público
app.get("/services", (req, res) => {
  const rows = db
    .prepare(
      "SELECT id, title, description, price_cents FROM services WHERE active = 1 ORDER BY id"
    )
    .all();
  res.json(rows);
});

app.get("/team", (req, res) => {
  const rows = db
    .prepare(
      "SELECT id, name, role, photo_url FROM team WHERE active = 1 ORDER BY id"
    )
    .all();
  res.json(rows);
});

app.get("/testimonials", (req, res) => {
  const rows = db
    .prepare(
      "SELECT id, author, content, rating FROM testimonials WHERE active = 1 ORDER BY id DESC LIMIT 12"
    )
    .all();
  res.json(rows);
});

app.get("/gallery", (req, res) => {
  const rows = db
    .prepare(
      "SELECT id, image_url, caption FROM gallery WHERE active = 1 ORDER BY id DESC LIMIT 24"
    )
    .all();
  res.json(rows);
});

app.get("/posts", (req, res) => {
  const rows = db
    .prepare(
      "SELECT id, title, excerpt, cover_url, created_at FROM posts WHERE published = 1 ORDER BY id DESC LIMIT 20"
    )
    .all();
  res.json(rows);
});

app.get("/posts/:id", (req, res) => {
  const row = db
    .prepare(
      "SELECT id, title, excerpt, content, cover_url, created_at FROM posts WHERE id = ? AND published = 1"
    )
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: "not_found" });
  res.json(row);
});

// Agendamentos público
app.post("/appointments", (req, res) => {
  const Schema = z.object({
    name: z.string().min(2),
    phone: z.string().min(6),
    email: z.string().email(),
    service: z.string().optional().nullable(),
    datetime: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() });
  const { name, phone, email, service, datetime, notes } = parsed.data;
  const stmt = db.prepare(`
  INSERT INTO appointments
    (name, phone, email, service, datetime, notes, status, created_at)
  VALUES
    (?, ?, ?, ?, ?, ?, 'pending', ?)
`);

  const info = stmt.run(
    name,
    phone,
    email,
    service || null,
    datetime || null,
    notes || null,
    Date.now()
  );
  res.status(201).json({ id: info.lastInsertRowid, status: "pending" });
});

// Contato público
app.post("/contact", (req, res) => {
  const Schema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    message: z.string().min(2),
  });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() });
  const { name, email, message } = parsed.data;
  const info = db
    .prepare(
      "INSERT INTO contacts (name, email, message, created_at) VALUES (?, ?, ?, ?)"
    )
    .run(name, email, message, Date.now());
  res.status(201).json({ id: info.lastInsertRowid });
});

// Admin (JWT)
app.use("/admin", authMiddleware, ensureAdmin);

// Serviços
app.get("/admin/services", (req, res) => {
  res.json(db.prepare("SELECT * FROM services ORDER BY id DESC").all());
});
app.post("/admin/services", (req, res) => {
  const Schema = z.object({
    title: z.string().min(2),
    description: z.string().optional(),
    price_cents: z.number().int().nonnegative(),
    active: z.boolean().optional(),
  });
  const p = Schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.flatten() });
  const now = Date.now();
  const info = db
    .prepare(
      "INSERT INTO services (title, description, price_cents, active, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(
      p.data.title,
      p.data.description || null,
      p.data.price_cents,
      p.data.active ?? true ? 1 : 0,
      now
    );
  res.status(201).json({ id: info.lastInsertRowid });
});
app.put("/admin/services/:id", (req, res) => {
  const Schema = z.object({
    title: z.string().min(2),
    description: z.string().optional(),
    price_cents: z.number().int().nonnegative(),
    active: z.boolean().optional(),
  });
  const p = Schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.flatten() });
  const info = db
    .prepare(
      "UPDATE services SET title=?, description=?, price_cents=?, active=? WHERE id=?"
    )
    .run(
      p.data.title,
      p.data.description || null,
      p.data.price_cents,
      p.data.active ?? true ? 1 : 0,
      req.params.id
    );
  res.json({ updated: info.changes });
});
app.delete("/admin/services/:id", (req, res) => {
  const info = db.prepare("DELETE FROM services WHERE id=?").run(req.params.id);
  res.json({ deleted: info.changes });
});

// Equipe
app.get("/admin/team", (req, res) => {
  res.json(db.prepare("SELECT * FROM team ORDER BY id DESC").all());
});
app.post("/admin/team", (req, res) => {
  const Schema = z.object({
    name: z.string().min(2),
    role: z.string().optional(),
    photo_url: z.string().url().optional(),
    active: z.boolean().optional(),
  });
  const p = Schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.flatten() });
  const info = db
    .prepare(
      "INSERT INTO team (name, role, photo_url, active, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(
      p.data.name,
      p.data.role || null,
      p.data.photo_url || null,
      p.data.active ?? true ? 1 : 0,
      Date.now()
    );
  res.status(201).json({ id: info.lastInsertRowid });
});
app.put("/admin/team/:id", (req, res) => {
  const Schema = z.object({
    name: z.string().min(2),
    role: z.string().optional(),
    photo_url: z.string().url().optional(),
    active: z.boolean().optional(),
  });
  const p = Schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.flatten() });
  const info = db
    .prepare("UPDATE team SET name=?, role=?, photo_url=?, active=? WHERE id=?")
    .run(
      p.data.name,
      p.data.role || null,
      p.data.photo_url || null,
      p.data.active ?? true ? 1 : 0,
      req.params.id
    );
  res.json({ updated: info.changes });
});
app.delete("/admin/team/:id", (req, res) => {
  const info = db.prepare("DELETE FROM team WHERE id=?").run(req.params.id);
  res.json({ deleted: info.changes });
});

// Depoimentos
app.get("/admin/testimonials", (req, res) => {
  res.json(db.prepare("SELECT * FROM testimonials ORDER BY id DESC").all());
});
app.post("/admin/testimonials", (req, res) => {
  const Schema = z.object({
    author: z.string().min(2),
    content: z.string().min(2),
    rating: z.number().int().min(1).max(5),
    active: z.boolean().optional(),
  });
  const p = Schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.flatten() });
  const info = db
    .prepare(
      "INSERT INTO testimonials (author, content, rating, active, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(
      p.data.author,
      p.data.content,
      p.data.rating,
      p.data.active ?? true ? 1 : 0,
      Date.now()
    );
  res.status(201).json({ id: info.lastInsertRowid });
});
app.put("/admin/testimonials/:id", (req, res) => {
  const Schema = z.object({
    author: z.string().min(2),
    content: z.string().min(2),
    rating: z.number().int().min(1).max(5),
    active: z.boolean().optional(),
  });
  const p = Schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.flatten() });
  const info = db
    .prepare(
      "UPDATE testimonials SET author=?, content=?, rating=?, active=? WHERE id=?"
    )
    .run(
      p.data.author,
      p.data.content,
      p.data.rating,
      p.data.active ?? true ? 1 : 0,
      req.params.id
    );
  res.json({ updated: info.changes });
});
app.delete("/admin/testimonials/:id", (req, res) => {
  const info = db
    .prepare("DELETE FROM testimonials WHERE id=?")
    .run(req.params.id);
  res.json({ deleted: info.changes });
});

// Galeria
app.get("/admin/gallery", (req, res) => {
  res.json(db.prepare("SELECT * FROM gallery ORDER BY id DESC").all());
});
app.post("/admin/gallery", (req, res) => {
  const Schema = z.object({
    image_url: z.string().url(),
    caption: z.string().optional(),
    active: z.boolean().optional(),
  });
  const p = Schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.flatten() });
  const info = db
    .prepare(
      "INSERT INTO gallery (image_url, caption, active, created_at) VALUES (?, ?, ?, ?)"
    )
    .run(
      p.data.image_url,
      p.data.caption || null,
      p.data.active ?? true ? 1 : 0,
      Date.now()
    );
  res.status(201).json({ id: info.lastInsertRowid });
});
app.put("/admin/gallery/:id", (req, res) => {
  const Schema = z.object({
    image_url: z.string().url(),
    caption: z.string().optional(),
    active: z.boolean().optional(),
  });
  const p = Schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.flatten() });
  const info = db
    .prepare("UPDATE gallery SET image_url=?, caption=?, active=? WHERE id=?")
    .run(
      p.data.image_url,
      p.data.caption || null,
      p.data.active ?? true ? 1 : 0,
      req.params.id
    );
  res.json({ updated: info.changes });
});
app.delete("/admin/gallery/:id", (req, res) => {
  const info = db.prepare("DELETE FROM gallery WHERE id=?").run(req.params.id);
  res.json({ deleted: info.changes });
});

// Posts
app.get("/admin/posts", (req, res) => {
  res.json(db.prepare("SELECT * FROM posts ORDER BY id DESC").all());
});
app.post("/admin/posts", (req, res) => {
  const Schema = z.object({
    title: z.string().min(2),
    excerpt: z.string().optional(),
    content: z.string().optional(),
    cover_url: z.string().url().optional(),
    published: z.boolean().optional(),
  });
  const p = Schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.flatten() });
  const info = db
    .prepare(
      "INSERT INTO posts (title, excerpt, content, cover_url, published, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(
      p.data.title,
      p.data.excerpt || null,
      p.data.content || null,
      p.data.cover_url || null,
      p.data.published ?? false ? 1 : 0,
      Date.now()
    );
  res.status(201).json({ id: info.lastInsertRowid });
});
app.put("/admin/posts/:id", (req, res) => {
  const Schema = z.object({
    title: z.string().min(2),
    excerpt: z.string().optional(),
    content: z.string().optional(),
    cover_url: z.string().url().optional(),
    published: z.boolean().optional(),
  });
  const p = Schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.flatten() });
  const info = db
    .prepare(
      "UPDATE posts SET title=?, excerpt=?, content=?, cover_url=?, published=? WHERE id=?"
    )
    .run(
      p.data.title,
      p.data.excerpt || null,
      p.data.content || null,
      p.data.cover_url || null,
      p.data.published ?? false ? 1 : 0,
      req.params.id
    );
  res.json({ updated: info.changes });
});
app.delete("/admin/posts/:id", (req, res) => {
  const info = db.prepare("DELETE FROM posts WHERE id=?").run(req.params.id);
  res.json({ deleted: info.changes });
});

// Appointments admin
app.get("/admin/appointments", (req, res) => {
  const rows = db.prepare("SELECT * FROM appointments ORDER BY id DESC").all();
  res.json(rows);
});
app.put("/admin/appointments/:id/status", (req, res) => {
  const Schema = z.object({
    status: z.enum(["pending", "confirmed", "canceled"]),
  });
  const p = Schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.flatten() });
  const info = db
    .prepare("UPDATE appointments SET status=? WHERE id=?")
    .run(p.data.status, req.params.id);
  res.json({ updated: info.changes });
});
app.delete("/admin/appointments/:id", (req, res) => {
  const info = db
    .prepare("DELETE FROM appointments WHERE id=?")
    .run(req.params.id);
  res.json({ deleted: info.changes });
});

// Contacts admin
app.get("/admin/contacts", (req, res) => {
  const rows = db.prepare("SELECT * FROM contacts ORDER BY id DESC").all();
  res.json(rows);
});
app.delete("/admin/contacts/:id", (req, res) => {
  const info = db.prepare("DELETE FROM contacts WHERE id=?").run(req.params.id);
  res.json({ deleted: info.changes });
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () =>
  console.log(`Barbearia API rodando em http://localhost:${PORT}`)
);
