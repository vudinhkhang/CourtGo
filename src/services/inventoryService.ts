import { randomUUID } from 'node:crypto';
import { DatabaseClient, DbExecutor, getDb } from '../db/client.js';
import { SessionContext } from './authService.js';
import { AppError } from '../utils/errors.js';
const fail = (message: string): never => { throw new AppError({ code: 'INVENTORY_ERROR', statusCode: 409, publicMessage: message }); };
export function quantity(value: unknown): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0 || n > 100000) fail('Số lượng phải là số nguyên từ 1 đến 100.000.');
  return n;
}
function authorize(actor: SessionContext) {
  if (!['ADMIN','STAFF'].includes(actor.user.role)) fail('Bạn không có quyền thao tác kho.');
}
export async function issueEquipment(tx: DbExecutor, id: string, qty: number, bookingId: string | null, reserved = false, reference = '') {
  qty = quantity(qty);
  const result = await tx.query(`UPDATE equipment_services SET stock_quantity=stock_quantity-$2, updated_at=NOW() WHERE id=$1 AND is_active=TRUE AND stock_status='AVAILABLE' AND stock_quantity >= $2 RETURNING *`, [id,qty]);
  const item = result.rows[0];
  if (!item) fail('Sản phẩm đã hết hàng, tạm ngưng hoặc không đủ số lượng. Vui lòng chọn lại.');
  const kind = ['RENTAL','FACILITY'].includes(item.category) ? 'RENTAL' : 'SALE';
  await tx.query(`INSERT INTO equipment_movements(id,equipment_id,booking_id,kind,quantity,state,reference) VALUES($1,$2,$3,$4,$5,$6,$7)`, [randomUUID(),id,bookingId,kind,qty,reserved?'RESERVED':'ISSUED',reference]);
  return item;
}
export async function returnEquipment(tx: DbExecutor, movementId: string) {
  const r=await tx.query(`UPDATE equipment_movements SET state='RETURNED' WHERE id=$1 AND kind='RENTAL' AND state='ISSUED' RETURNING *`,[movementId]);
  if (!r.rows[0]) fail('Phiếu đã trả hoặc chưa bàn giao; không thể cộng kho lần nữa.');
  const m=r.rows[0];
  await tx.query(`UPDATE equipment_services SET stock_quantity=stock_quantity+$2,updated_at=NOW() WHERE id=$1`,[m.equipment_id,m.quantity]);
}
export async function returnBookingEquipment(tx: DbExecutor, bookingId: string) {
  const r=await tx.query(`SELECT id FROM equipment_movements WHERE booking_id=$1 AND kind='RENTAL' AND state='ISSUED' ORDER BY equipment_id,id`,[bookingId]);
  for(const m of r.rows) await returnEquipment(tx,m.id);
}
export async function reserveBookingEquipment(tx: DbExecutor, bookingId: string, items: Array<{equipmentId:string;quantity:number}>) {
  const old=await tx.query(`SELECT * FROM equipment_movements WHERE booking_id=$1 AND state='RESERVED' ORDER BY equipment_id FOR UPDATE`,[bookingId]);
  for(const m of old.rows) await tx.query(`UPDATE equipment_services SET stock_quantity=stock_quantity+$2 WHERE id=$1`,[m.equipment_id,m.quantity]);
  await tx.query(`UPDATE equipment_movements SET state='RELEASED' WHERE booking_id=$1 AND state='RESERVED'`,[bookingId]);
  let fee=0,deposit=0;const labels:string[]=[];
  for(const it of [...items].sort((a,b)=>a.equipmentId.localeCompare(b.equipmentId))) {
    const item=await issueEquipment(tx,it.equipmentId,it.quantity,bookingId,true);
    fee+=Number(item.price_vnd)*it.quantity; deposit+=Number(item.deposit_vnd)*it.quantity;
    labels.push(`${item.name} (x${it.quantity})`);
  }
  await tx.query(`UPDATE bookings SET equipment_rented_summary=$2,equipment_deposit_vnd=$3 WHERE id=$1`,[bookingId,labels.join(', '),deposit]);
  return {fee,summary:labels.join(', ')};
}
export async function inventoryOperation(actor: SessionContext,id: string, input: {action:string;quantity?:unknown;reference?:string;movementId?:string}, db:DatabaseClient=getDb()) {
  authorize(actor);
  return db.withTransaction(async tx=>{
    if(input.action==='RETURN') {
      const m=await tx.query(`SELECT id FROM equipment_movements WHERE id=$1 AND equipment_id=$2`,[input.movementId,id]);
      if(!m.rows.length) fail('Không tìm thấy phiếu mượn.');
      return returnEquipment(tx,input.movementId!);
    }
    const qty=quantity(input.quantity); const reference=(input.reference||'').trim();
    if(!reference) fail('Vui lòng nhập khách nhận hoặc lý do điều chỉnh kho.');
    if(input.action==='ISSUE') return issueEquipment(tx,id,qty,null,false,reference);
    if(!['RESTOCK','REMOVE'].includes(input.action)) fail('Thao tác kho không hợp lệ.');
    const delta=input.action==='REMOVE'?-qty:qty;
    const r=await tx.query(`UPDATE equipment_services SET stock_quantity=stock_quantity+$2,updated_at=NOW() WHERE id=$1 AND stock_quantity+$2>=0 RETURNING id`,[id,delta]);
    if(!r.rows.length) fail('Không đủ tồn kho để điều chỉnh.');
    await tx.query(`INSERT INTO equipment_stock_adjustments(id,equipment_id,delta,reason,actor_id) VALUES($1,$2,$3,$4,$5)`,[randomUUID(),id,delta,reference,actor.user.id]);
  });
}
export async function inventoryHistory(db:DatabaseClient=getDb()) {
  return (await db.query(`SELECT m.*,e.name,b.booking_code FROM equipment_movements m JOIN equipment_services e ON e.id=m.equipment_id LEFT JOIN bookings b ON b.id=m.booking_id WHERE m.state IN ('ISSUED','RESERVED') OR m.id IN (SELECT id FROM equipment_movements ORDER BY created_at DESC LIMIT 100) ORDER BY m.created_at DESC`)).rows;
}
