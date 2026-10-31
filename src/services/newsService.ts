import crypto from 'node:crypto';
import { getDb, DatabaseClient } from '../db/client.js';
import { NewsArticle } from '../views/newsPages.js';

export interface NewsArticleAdminRecord {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  badgeTone: 'red' | 'blue' | 'green' | 'amber';
  coverImage: string;
  imageAlt: string;
  coverFit: 'cover' | 'contain';
  contentHtml: string;
  isPublished: boolean;
  authorId: string | null;
  authorName?: string | null;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertNewsInput {
  title: string;
  slug?: string;
  summary: string;
  category: string;
  badgeTone: 'red' | 'blue' | 'green' | 'amber';
  coverImage: string;
  imageAlt?: string;
  coverFit?: 'cover' | 'contain';
  contentHtml: string;
  isPublished?: boolean;
  publishedAt?: string;
}

export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);
}

function formatDateVi(dateStr: string | Date): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return String(dateStr);
  }
}

export class NewsService {
  constructor(private readonly db: DatabaseClient = getDb()) {}

  /** Lấy danh sách các bài viết đã xuất bản hiển thị ngoài trang chủ và trang tin tức */
  async listPublishedNews(limit = 20): Promise<NewsArticle[]> {
    const res = await this.db.query<{
      slug: string;
      title: string;
      summary: string;
      category: string;
      badge_tone: 'red' | 'blue' | 'green' | 'amber';
      cover_image: string;
      image_alt: string | null;
      cover_fit: 'cover' | 'contain';
      content_html: string;
      published_at: string;
    }>(
      `SELECT slug, title, summary, category, badge_tone, cover_image, image_alt, cover_fit, content_html, published_at
       FROM news_articles
       WHERE is_published = TRUE
       ORDER BY published_at DESC, created_at DESC
       LIMIT $1`,
      [limit]
    );

    return res.rows.map((row) => ({
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      category: row.category,
      badgeTone: row.badge_tone,
      coverImage: row.cover_image,
      imageAlt: row.image_alt || row.title,
      coverFit: row.cover_fit || 'cover',
      contentHtml: row.content_html,
      publishedAt: formatDateVi(row.published_at),
    }));
  }

  /** Lấy chi tiết bài viết theo slug */
  async getNewsBySlug(slug: string): Promise<NewsArticle | null> {
    const res = await this.db.query<{
      slug: string;
      title: string;
      summary: string;
      category: string;
      badge_tone: 'red' | 'blue' | 'green' | 'amber';
      cover_image: string;
      image_alt: string | null;
      cover_fit: 'cover' | 'contain';
      content_html: string;
      published_at: string;
    }>(
      `SELECT slug, title, summary, category, badge_tone, cover_image, image_alt, cover_fit, content_html, published_at
       FROM news_articles
       WHERE slug = $1 AND is_published = TRUE
       LIMIT 1`,
      [slug]
    );

    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      category: row.category,
      badgeTone: row.badge_tone,
      coverImage: row.cover_image,
      imageAlt: row.image_alt || row.title,
      coverFit: row.cover_fit || 'cover',
      contentHtml: row.content_html,
      publishedAt: formatDateVi(row.published_at),
    };
  }

  /** Lấy danh sách toàn bộ bài viết trong trang quản trị */
  async listAllNewsForAdmin(): Promise<NewsArticleAdminRecord[]> {
    const res = await this.db.query<{
      id: string;
      slug: string;
      title: string;
      summary: string;
      category: string;
      badge_tone: 'red' | 'blue' | 'green' | 'amber';
      cover_image: string;
      image_alt: string | null;
      cover_fit: 'cover' | 'contain';
      content_html: string;
      is_published: boolean;
      author_id: string | null;
      author_name: string | null;
      published_at: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT n.id, n.slug, n.title, n.summary, n.category, n.badge_tone, n.cover_image,
              n.image_alt, n.cover_fit, n.content_html, n.is_published, n.author_id,
              u.full_name AS author_name, n.published_at, n.created_at, n.updated_at
       FROM news_articles n
       LEFT JOIN users u ON u.id = n.author_id
       ORDER BY n.created_at DESC`
    );

    return res.rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      category: row.category,
      badgeTone: row.badge_tone,
      coverImage: row.cover_image,
      imageAlt: row.image_alt || row.title,
      coverFit: row.cover_fit || 'cover',
      contentHtml: row.content_html,
      isPublished: row.is_published,
      authorId: row.author_id,
      authorName: row.author_name || 'Ban Quản Lý',
      publishedAt: formatDateVi(row.published_at),
      createdAt: formatDateVi(row.created_at),
      updatedAt: formatDateVi(row.updated_at),
    }));
  }

  /** Lấy chi tiết bài viết theo id trong quản trị */
  async getNewsById(id: string): Promise<NewsArticleAdminRecord | null> {
    const res = await this.db.query<{
      id: string;
      slug: string;
      title: string;
      summary: string;
      category: string;
      badge_tone: 'red' | 'blue' | 'green' | 'amber';
      cover_image: string;
      image_alt: string | null;
      cover_fit: 'cover' | 'contain';
      content_html: string;
      is_published: boolean;
      author_id: string | null;
      published_at: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, slug, title, summary, category, badge_tone, cover_image,
              image_alt, cover_fit, content_html, is_published, author_id,
              published_at, created_at, updated_at
       FROM news_articles
       WHERE id = $1
       LIMIT 1`,
      [id]
    );

    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      category: row.category,
      badgeTone: row.badge_tone,
      coverImage: row.cover_image,
      imageAlt: row.image_alt || row.title,
      coverFit: row.cover_fit || 'cover',
      contentHtml: row.content_html,
      isPublished: row.is_published,
      authorId: row.author_id,
      publishedAt: formatDateVi(row.published_at),
      createdAt: formatDateVi(row.created_at),
      updatedAt: formatDateVi(row.updated_at),
    };
  }

  /** Tạo bài viết mới */
  async createNewsArticle(input: UpsertNewsInput, authorId?: string): Promise<string> {
    const id = `news-${crypto.randomUUID()}`;
    let slug = input.slug?.trim() ? slugify(input.slug.trim()) : slugify(input.title);
    if (!slug) slug = `bai-viet-${Date.now()}`;

    // Đảm bảo không trùng slug
    const checkSlug = await this.db.query(`SELECT id FROM news_articles WHERE slug = $1`, [slug]);
    if (checkSlug.rows.length > 0) {
      slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const coverFit = input.coverFit || 'cover';
    const isPublished = input.isPublished !== undefined ? input.isPublished : true;
    const imageAlt = input.imageAlt?.trim() || input.title;

    await this.db.query(
      `INSERT INTO news_articles (
        id, slug, title, summary, category, badge_tone, cover_image,
        image_alt, cover_fit, content_html, is_published, author_id,
        published_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW(), NOW())`,
      [
        id,
        slug,
        input.title.trim(),
        input.summary.trim(),
        input.category.trim(),
        input.badgeTone,
        input.coverImage.trim(),
        imageAlt,
        coverFit,
        input.contentHtml.trim(),
        isPublished,
        authorId || null,
      ]
    );

    return id;
  }

  /** Cập nhật bài viết */
  async updateNewsArticle(id: string, input: UpsertNewsInput): Promise<boolean> {
    const existing = await this.getNewsById(id);
    if (!existing) return false;

    let slug = input.slug?.trim() ? slugify(input.slug.trim()) : existing.slug;
    // Kiểm tra xem slug có bị trùng với bài khác không
    const checkSlug = await this.db.query(
      `SELECT id FROM news_articles WHERE slug = $1 AND id <> $2`,
      [slug, id]
    );
    if (checkSlug.rows.length > 0) {
      slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const coverFit = input.coverFit || existing.coverFit;
    const isPublished = input.isPublished !== undefined ? input.isPublished : existing.isPublished;
    const imageAlt = input.imageAlt?.trim() || input.title;

    await this.db.query(
      `UPDATE news_articles
       SET slug = $1, title = $2, summary = $3, category = $4, badge_tone = $5,
           cover_image = $6, image_alt = $7, cover_fit = $8, content_html = $9,
           is_published = $10, updated_at = NOW()
       WHERE id = $11`,
      [
        slug,
        input.title.trim(),
        input.summary.trim(),
        input.category.trim(),
        input.badgeTone,
        input.coverImage.trim(),
        imageAlt,
        coverFit,
        input.contentHtml.trim(),
        isPublished,
        id,
      ]
    );

    return true;
  }

  /** Chuyển đổi trạng thái xuất bản (bật/tắt) */
  async togglePublishNews(id: string): Promise<boolean> {
    const res = await this.db.query<{ is_published: boolean }>(
      `UPDATE news_articles
       SET is_published = NOT is_published, updated_at = NOW()
       WHERE id = $1
       RETURNING is_published`,
      [id]
    );
    return res.rows.length > 0;
  }

  /** Xóa bài viết */
  async deleteNewsArticle(id: string): Promise<boolean> {
    const res = await this.db.query(`DELETE FROM news_articles WHERE id = $1 RETURNING id`, [id]);
    return res.rows.length > 0;
  }
}

let defaultNewsService: NewsService | null = null;
export function getNewsService(db?: DatabaseClient): NewsService {
  if (db) {
    return new NewsService(db);
  }
  if (!defaultNewsService) {
    defaultNewsService = new NewsService();
  }
  return defaultNewsService;
}
