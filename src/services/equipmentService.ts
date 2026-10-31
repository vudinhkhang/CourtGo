import { getDb, DatabaseClient } from '../db/client.js';
import { SessionContext } from './authService.js';
import { AppError } from '../utils/errors.js';
import { getServerNow, parsePriceVnd } from '../utils/time.js';
import crypto from 'node:crypto';

export type EquipmentCategory = 'RENTAL' | 'EQUIPMENT' | 'BEVERAGE' | 'FACILITY';
export type EquipmentStockStatus = 'AVAILABLE' | 'OUT_OF_STOCK' | 'MAINTENANCE';

export interface EquipmentItem {
  id: string;
  code: string;
  name: string;
  category: EquipmentCategory;
  priceVnd: number;
  originalPriceVnd: number | null;
  unit: string;
  depositVnd: number;
  stockQuantity: number;
  operationalStatus: EquipmentStockStatus;
  stockStatus: EquipmentStockStatus;
  isActive: boolean;
  badge: string | null;
  imageUrl: string | null;
  description: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEquipmentInput {
  code?: string;
  name: string;
  category: EquipmentCategory;
  priceVnd: number;
  originalPriceVnd?: number | null;
  unit?: string;
  depositVnd?: number;
  stockStatus?: EquipmentStockStatus;
  isActive?: boolean;
  badge?: string | null;
  imageUrl?: string | null;
  description: string;
  sortOrder?: number;
}

export interface UpdateEquipmentInput {
  code?: string;
  name?: string;
  category?: EquipmentCategory;
  priceVnd?: number;
  originalPriceVnd?: number | null;
  unit?: string;
  depositVnd?: number;
  stockStatus?: EquipmentStockStatus;
  isActive?: boolean;
  badge?: string | null;
  imageUrl?: string | null;
  description?: string;
  sortOrder?: number;
}

function mapRowToItem(r: any): EquipmentItem {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    category: r.category as EquipmentCategory,
    priceVnd: Number(r.price_vnd),
    originalPriceVnd: r.original_price_vnd ? Number(r.original_price_vnd) : null,
    unit: r.unit,
    depositVnd: Number(r.deposit_vnd || 0),
    stockQuantity: Number(r.stock_quantity || 0),
    operationalStatus: r.stock_status,
    stockStatus: r.stock_status === 'MAINTENANCE' ? 'MAINTENANCE' : (r.stock_status === 'OUT_OF_STOCK' || Number(r.stock_quantity) <= 0 ? 'OUT_OF_STOCK' : 'AVAILABLE'),
    isActive: Boolean(r.is_active),
    badge: r.badge || null,
    imageUrl: r.image_url || null,
    description: r.description,
    sortOrder: Number(r.sort_order || 1),
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
  };
}

export async function getEquipmentServices(
  options: {
    category?: string;
    stockStatus?: string;
    search?: string;
    activeOnly?: boolean;
  } = {},
  db: DatabaseClient = getDb()
): Promise<EquipmentItem[]> {
  let sql = `SELECT * FROM equipment_services WHERE 1=1`;
  const params: any[] = [];
  let paramIdx = 1;

  if (options.activeOnly) {
    sql += ` AND is_active = TRUE`;
  }
  if (options.category && options.category !== 'ALL') {
    sql += ` AND category = $${paramIdx++}`;
    params.push(options.category);
  }
  if (options.stockStatus && options.stockStatus !== 'ALL') {
    sql += ` AND stock_status = $${paramIdx++}`;
    params.push(options.stockStatus);
  }
  if (options.search && options.search.trim()) {
    const s = `%${options.search.trim().toLowerCase()}%`;
    sql += ` AND (LOWER(name) LIKE $${paramIdx} OR LOWER(code) LIKE $${paramIdx} OR LOWER(description) LIKE $${paramIdx})`;
    params.push(s);
    paramIdx++;
  }

  sql += ` ORDER BY sort_order ASC, created_at DESC`;

  try {
    const res = await db.query(sql, params);
    return res.rows.map(mapRowToItem);
  } catch {
    return [];
  }
}

export async function getEquipmentServiceById(
  id: string,
  db: DatabaseClient = getDb()
): Promise<EquipmentItem | null> {
  const res = await db.query(`SELECT * FROM equipment_services WHERE id = $1`, [id]);
  if (res.rows.length === 0) return null;
  return mapRowToItem(res.rows[0]);
}

export async function adminCreateEquipmentService(
  actor: SessionContext,
  input: CreateEquipmentInput,
  db: DatabaseClient = getDb()
): Promise<EquipmentItem> {
  if (actor.user.role !== 'ADMIN' && actor.user.role !== 'STAFF') {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      publicMessage: 'Bạn không có quyền quản lý dịch vụ cho thuê.',
    });
  }

  const name = (input.name || '').trim();
  if (!name) {
    throw new AppError({
      code: 'INVALID_NAME',
      statusCode: 400,
      publicMessage: 'Tên dịch vụ/dụng cụ không được để trống.',
    });
  }

  const priceVnd = parsePriceVnd(input.priceVnd);
  if (priceVnd < 0) {
    throw new AppError({
      code: 'INVALID_PRICE',
      statusCode: 400,
      publicMessage: 'Đơn giá không hợp lệ.',
    });
  }

  const originalPriceVnd = input.originalPriceVnd !== undefined && input.originalPriceVnd !== null
    ? parsePriceVnd(input.originalPriceVnd)
    : null;

  const depositVnd = input.depositVnd ? parsePriceVnd(input.depositVnd) : 0;
  const unit = (input.unit || 'giờ').trim();
  const description = (input.description || '').trim();
  const category = input.category || 'RENTAL';
  const stockStatus = input.stockStatus || 'AVAILABLE';
  const isActive = input.isActive !== undefined ? Boolean(input.isActive) : true;
  const badge = input.badge ? input.badge.trim() : null;
  const imageUrl = input.imageUrl ? input.imageUrl.trim() : null;
  const sortOrder = Number(input.sortOrder) || 1;

  let code = (input.code || '').trim().toUpperCase();
  if (!code) {
    const prefix = category === 'RENTAL' ? 'VOT' : category === 'EQUIPMENT' ? 'PK' : category === 'BEVERAGE' ? 'NC' : 'TI';
    code = `${prefix}-${Date.now().toString().slice(-6)}`;
  }

  const id = `eq-${crypto.randomUUID()}`;
  const now = getServerNow().toISOString();

  await db.query(
    `INSERT INTO equipment_services (
      id, code, name, category, price_vnd, original_price_vnd, unit, deposit_vnd, stock_status, is_active, badge, image_url, description, sort_order, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      id,
      code,
      name,
      category,
      priceVnd,
      originalPriceVnd,
      unit,
      depositVnd,
      stockStatus,
      isActive,
      badge,
      imageUrl,
      description,
      sortOrder,
      now,
      now,
    ]
  );

  return (await getEquipmentServiceById(id, db))!;
}

export async function adminUpdateEquipmentService(
  actor: SessionContext,
  id: string,
  input: UpdateEquipmentInput,
  db: DatabaseClient = getDb()
): Promise<EquipmentItem> {
  if (actor.user.role !== 'ADMIN' && actor.user.role !== 'STAFF') {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      publicMessage: 'Bạn không có quyền quản lý dịch vụ cho thuê.',
    });
  }

  const existing = await getEquipmentServiceById(id, db);
  if (!existing) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      publicMessage: 'Không tìm thấy dịch vụ/dụng cụ cần cập nhật.',
    });
  }

  const name = input.name !== undefined ? input.name.trim() : existing.name;
  const code = input.code !== undefined ? input.code.trim().toUpperCase() : existing.code;
  const category = input.category !== undefined ? input.category : existing.category;
  const priceVnd = input.priceVnd !== undefined ? parsePriceVnd(input.priceVnd) : existing.priceVnd;
  const originalPriceVnd = input.originalPriceVnd !== undefined
    ? (input.originalPriceVnd ? parsePriceVnd(input.originalPriceVnd) : null)
    : existing.originalPriceVnd;
  const unit = input.unit !== undefined ? input.unit.trim() : existing.unit;
  const depositVnd = input.depositVnd !== undefined ? parsePriceVnd(input.depositVnd) : existing.depositVnd;
  const stockStatus = input.stockStatus !== undefined ? input.stockStatus : existing.operationalStatus;
  const isActive = input.isActive !== undefined ? Boolean(input.isActive) : existing.isActive;
  const badge = input.badge !== undefined ? (input.badge ? input.badge.trim() : null) : existing.badge;
  const imageUrl = input.imageUrl !== undefined ? (input.imageUrl ? input.imageUrl.trim() : null) : existing.imageUrl;
  const description = input.description !== undefined ? input.description.trim() : existing.description;
  const sortOrder = input.sortOrder !== undefined ? Number(input.sortOrder) : existing.sortOrder;
  const now = getServerNow().toISOString();

  await db.query(
    `UPDATE equipment_services
     SET code = $1,
         name = $2,
         category = $3,
         price_vnd = $4,
         original_price_vnd = $5,
         unit = $6,
         deposit_vnd = $7,
         stock_status = $8,
         is_active = $9,
         badge = $10,
         image_url = $11,
         description = $12,
         sort_order = $13,
         updated_at = $14
     WHERE id = $15`,
    [
      code,
      name,
      category,
      priceVnd,
      originalPriceVnd,
      unit,
      depositVnd,
      stockStatus,
      isActive,
      badge,
      imageUrl,
      description,
      sortOrder,
      now,
      id,
    ]
  );

  return (await getEquipmentServiceById(id, db))!;
}

export async function adminToggleEquipmentStatus(
  actor: SessionContext,
  id: string,
  isActive?: boolean,
  stockStatus?: EquipmentStockStatus,
  db: DatabaseClient = getDb()
): Promise<EquipmentItem> {
  if (actor.user.role !== 'ADMIN' && actor.user.role !== 'STAFF') {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      publicMessage: 'Bạn không có quyền quản lý dịch vụ cho thuê.',
    });
  }

  const existing = await getEquipmentServiceById(id, db);
  if (!existing) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      publicMessage: 'Không tìm thấy dịch vụ/dụng cụ.',
    });
  }

  const newIsActive = isActive !== undefined ? isActive : existing.isActive;
  const newStockStatus = stockStatus !== undefined ? stockStatus : existing.operationalStatus;
  const now = getServerNow().toISOString();

  await db.query(
    `UPDATE equipment_services SET is_active = $1, stock_status = $2, updated_at = $3 WHERE id = $4`,
    [newIsActive, newStockStatus, now, id]
  );

  return (await getEquipmentServiceById(id, db))!;
}

export async function adminDeleteEquipmentService(
  actor: SessionContext,
  id: string,
  db: DatabaseClient = getDb()
): Promise<void> {
  if (actor.user.role !== 'ADMIN' && actor.user.role !== 'STAFF') {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      publicMessage: 'Bạn không có quyền xóa dịch vụ cho thuê.',
    });
  }

  const history = await db.query('SELECT id FROM equipment_movements WHERE equipment_id=$1 UNION ALL SELECT id FROM equipment_stock_adjustments WHERE equipment_id=$1 LIMIT 1',[id]);
  if(history.rows.length) throw new AppError({code:'HAS_HISTORY',statusCode:409,publicMessage:'Sản phẩm đã có lịch sử kho. Hãy ẩn sản phẩm để giữ đối soát.'});
  await db.query(`DELETE FROM equipment_services WHERE id = $1`, [id]);
}

export async function getEquipmentMetrics(
  db: DatabaseClient = getDb()
): Promise<{
  totalCount: number;
  activeCount: number;
  rentalCount: number;
  outOfStockCount: number;
}> {
  try {
    const res = await db.query<{
      total_count: string;
      active_count: string;
      rental_count: string;
      out_of_stock_count: string;
    }>(
      `SELECT
        COUNT(*)::text AS total_count,
        COUNT(*) FILTER (WHERE is_active = TRUE)::text AS active_count,
        COUNT(*) FILTER (WHERE category = 'RENTAL')::text AS rental_count,
        COUNT(*) FILTER (WHERE stock_quantity = 0 OR stock_status = 'OUT_OF_STOCK')::text AS out_of_stock_count
      FROM equipment_services`
    );
    const r = res.rows[0];
    return {
      totalCount: Number(r?.total_count || 0),
      activeCount: Number(r?.active_count || 0),
      rentalCount: Number(r?.rental_count || 0),
      outOfStockCount: Number(r?.out_of_stock_count || 0),
    };
  } catch {
    return { totalCount: 0, activeCount: 0, rentalCount: 0, outOfStockCount: 0 };
  }
}

export async function getPublicEquipmentCatalog(query: Record<string,string>, db: DatabaseClient = getDb()) {
  const filters = {
    nhom: ['thue','mua'].includes(query.nhom) ? query.nhom : '',
    loai: ['RENTAL','FACILITY','EQUIPMENT','BEVERAGE'].includes(query.loai) ? query.loai : '',
    tim: (query.tim || '').trim().slice(0,100),
    conHang: query.conHang === '1',
    sapXep: ['gia-tang','gia-giam'].includes(query.sapXep) ? query.sapXep : '',
  };
  const params: string[] = [];
  const clauses = ['is_active=TRUE'];
  if(filters.nhom) clauses.push(filters.nhom==='thue'?"category IN ('RENTAL','FACILITY')":"category IN ('EQUIPMENT','BEVERAGE')");
  if(filters.loai){params.push(filters.loai);clauses.push(`category=$${params.length}`);}
  if(filters.tim){params.push('%'+filters.tim+'%');clauses.push(`(name ILIKE $${params.length} OR code ILIKE $${params.length} OR description ILIKE $${params.length})`);}
  if(filters.conHang)clauses.push("stock_quantity>0 AND stock_status='AVAILABLE'");
  const where=clauses.join(' AND ');
  const total=Number((await db.query<{count:number}>(`SELECT COUNT(*)::int AS count FROM equipment_services WHERE ${where}`,params)).rows[0].count);
  const pages=Math.max(1,Math.ceil(total/12));
  const page=Math.min(pages,Math.max(1,Math.min(100000,Math.floor(Number(query.trang)||1))));
  const order=filters.sapXep==='gia-tang'?'price_vnd ASC,sort_order ASC,id':filters.sapXep==='gia-giam'?'price_vnd DESC,sort_order ASC,id':'sort_order ASC,created_at DESC,id';
  const result=await db.query(`SELECT * FROM equipment_services WHERE ${where} ORDER BY ${order} LIMIT 12 OFFSET ${(page-1)*12}`,params);
  return {items:result.rows.map(mapRowToItem),filters,total,page,pages};
}
