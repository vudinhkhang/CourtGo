import { createHash, randomUUID } from 'node:crypto';
import { DatabaseClient, DbExecutor, getDb } from '../db/client.js';
import { UserRecord, getMemberDiscountRate } from './authService.js';
import { BookingRecord, createOrReuseBookingHoldInTx } from './bookingService.js';
import { expireOverdueHolds } from './courtService.js';
import { reserveBookingEquipment } from './inventoryService.js';
import { validateAndCalculateCouponDiscount } from './couponService.js';
import { paymentGateway, WebhookPayloadInput } from '../integrations/paymentGateway.js';
import { getServerNow, isValidDateString, formatVnd } from '../utils/time.js';
import { AppError } from '../utils/errors.js';
import { config } from '../config/env.js';

export interface CartSlot { courtId: string; bookingDate: string; startHour: number }
export interface PaymentGroup {
  id: string; code: string; user_id: string; status: 'HOLD'|'PENDING'|'PAID'|'EXPIRED'|'LATE_PAID';
  total_amount_vnd: number; coupon_code: string | null; hold_expires_at: string | Date;
  slots_fingerprint: string;
}
const fail = (code: string, message: string, statusCode = 409): never => {
  throw new AppError({ code, publicMessage: message, statusCode });
};

export function normalizeCartSlots(input: unknown): CartSlot[] {
  if (!Array.isArray(input) || !input.length || input.length > 100) fail('INVALID_CART', 'Giỏ cần từ 1 đến 100 ô giờ hợp lệ.', 400);
  const unique = new Map<string, CartSlot>();
  for (const item of input as any[]) {
    if (!item || typeof item !== 'object') fail('INVALID_CART', 'Ca chơi không hợp lệ.', 400);
    const s = { courtId: String(item.courtId || ''), bookingDate: String(item.bookingDate || item.date || ''), startHour: Number(item.startHour) };
    if (!s.courtId || s.courtId.length > 100 || !isValidDateString(s.bookingDate) || !Number.isInteger(s.startHour) || s.startHour < 0 || s.startHour > 23)
      fail('INVALID_CART', 'Sân, ngày hoặc giờ trong giỏ không hợp lệ.', 400);
    unique.set(`${s.courtId}|${s.bookingDate}|${s.startHour}`, s);
  }
  return [...unique.values()].sort((a,b) => a.bookingDate.localeCompare(b.bookingDate) || a.courtId.localeCompare(b.courtId) || a.startHour-b.startHour);
}

export function splitCartTickets(slots: CartSlot[]): CartSlot[][] {
  const groups: CartSlot[][] = [];
  for (const slot of normalizeCartSlots(slots)) {
    const last = groups.at(-1)?.at(-1);
    if (last && last.courtId === slot.courtId && last.bookingDate === slot.bookingDate && last.startHour + 1 === slot.startHour) groups.at(-1)!.push(slot);
    else groups.push([slot]);
  }
  return groups;
}

export async function getPaymentGroup(code: string, user: UserRecord, db: DbExecutor = getDb()) {
  const group = (await db.query<PaymentGroup>('SELECT * FROM payment_groups WHERE code=$1', [code])).rows[0];
  if (!group) fail('GROUP_NOT_FOUND', 'Không tìm thấy nhóm thanh toán.', 404);
  if (user.role === 'CUSTOMER' && group.user_id !== user.id) fail('FORBIDDEN', 'Bạn không có quyền xem nhóm thanh toán này.', 403);
  const tickets = (await db.query<BookingRecord>(`SELECT b.* FROM booking_tickets t JOIN bookings b ON b.id=t.primary_booking_id
    WHERE t.payment_group_id=$1 ORDER BY b.booking_date,b.court_id,b.start_hour`, [group.id])).rows;
  return { group, tickets };
}

export async function groupCodeForBooking(code: string, db: DbExecutor) {
  return (await db.query<{code:string}>(`SELECT g.code FROM bookings b JOIN booking_tickets t ON t.id=b.ticket_id
    JOIN payment_groups g ON g.id=t.payment_group_id WHERE b.booking_code=$1 OR b.id=$1`, [code])).rows[0]?.code;
}

export async function createCartCheckout(user: UserRecord, rawSlots: unknown, key: string, db: DatabaseClient = getDb()) {
  const slots = normalizeCartSlots(rawSlots);
  if (!key || key.length > 120) fail('INVALID_KEY', 'Vui lòng tải lại giỏ và thử lại.', 400);
  const fingerprint = createHash('sha256').update(JSON.stringify(slots)).digest('hex');
  try {
    return await db.withTransaction(async tx => {
      // Serialize a user's checkout/hold budget across tabs as well as retries.
      await tx.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.id]);
      const existing = (await tx.query<PaymentGroup>('SELECT * FROM payment_groups WHERE user_id=$1 AND idempotency_key=$2', [user.id,key])).rows[0];
      if (existing) {
        if (existing.slots_fingerprint !== fingerprint) fail('CART_CHANGED', 'Giỏ đã thay đổi. Vui lòng mở lại giỏ để thanh toán.');
        return getPaymentGroup(existing.code, user, tx);
      }
      await expireOverdueHolds(tx);
      const groupId = `grp-${randomUUID()}`;
      const groupCode = `TT-${randomUUID().slice(0,8).toUpperCase()}`;
      const rows: BookingRecord[] = [];
      for (const slot of slots) {
        try {
          const hold = await createOrReuseBookingHoldInTx({user, ...slot}, tx);
          if (hold.booking.ticket_id || hold.booking.notes?.includes('BATCH_')) fail('SLOT_ALREADY_IN_CHECKOUT', 'Ca này đã nằm trong một đơn chờ thanh toán. Mở Đơn đặt để tiếp tục.');
          rows.push(hold.booking);
        } catch (error) {
          if (error instanceof AppError) throw new AppError({code:error.code,statusCode:error.statusCode,publicMessage:`${slot.bookingDate} · ${slot.startHour}:00: ${error.publicMessage}`});
          throw error;
        }
      }
      const expires = new Date(Math.min(...rows.map(b=>new Date(b.hold_expires_at).getTime()))).toISOString();
      await tx.query(`INSERT INTO payment_groups(id,code,user_id,idempotency_key,slots_fingerprint,hold_expires_at)
        VALUES($1,$2,$3,$4,$5,$6)`,[groupId,groupCode,user.id,key,fingerprint,expires]);
      for (const selection of splitCartTickets(slots)) {
        const members = selection.map(s => rows.find(b=>b.court_id===s.courtId && b.booking_date===s.bookingDate && b.start_hour===s.startHour)!);
        const root = members[0];
        const ticketId = `tkt-${randomUUID()}`;
        await tx.query('INSERT INTO booking_tickets(id,payment_group_id,primary_booking_id) VALUES($1,$2,$3)',[ticketId,groupId,root.id]);
        for (const b of members) await tx.query('UPDATE bookings SET ticket_id=$1,is_ticket_component=$2,hold_expires_at=$3 WHERE id=$4',[ticketId,b.id!==root.id,expires,b.id]);
        const price = members.reduce((n,b)=>n+b.quoted_price_vnd,0);
        await tx.query(`UPDATE bookings SET end_hour=$1,slot_end_at=$2,quoted_price_vnd=$3,total_amount_vnd=$3,updated_at=$4 WHERE id=$5`,
          [members.at(-1)!.end_hour,members.at(-1)!.slot_end_at,price,getServerNow().toISOString(),root.id]);
      }
      await tx.query(`UPDATE payment_groups SET total_amount_vnd=(SELECT SUM(b.total_amount_vnd) FROM booking_tickets t
        JOIN bookings b ON b.id=t.primary_booking_id WHERE t.payment_group_id=$1) WHERE id=$1`,[groupId]);
      return getPaymentGroup(groupCode,user,tx);
    });
  } catch(error:any) {
    if (error?.code === '23505') fail('SLOT_UNAVAILABLE','Một ca trong giỏ vừa có người đặt. Vui lòng kiểm tra lại; các ca khác chưa bị giữ.');
    throw error;
  }
}

/** Integer allocation with stable remainder order, preserving the exact collected total. */
export function allocateDiscount(amount: number, weights: number[]): number[] {
  const total = weights.reduce((a,b)=>a+b,0);
  if (!total) return weights.map(()=>0);
  amount = Math.min(Math.max(0,Math.round(amount)),total);
  const shares = weights.map(w=>Math.floor(amount*w/total));
  let remainder = amount-shares.reduce((a,b)=>a+b,0);
  for (let i=0; remainder>0; i=(i+1)%shares.length) if (shares[i]<weights[i]) { shares[i]++; remainder--; }
  return shares;
}

export interface GroupCheckoutInput {
  contactName: string; contactPhone: string; contactEmail?: string; couponCode?: string;
  addons?: Record<string, Array<{equipmentId:string;quantity:number}>>;
}

export async function initiateGroupPayment(code: string, user: UserRecord, input: GroupCheckoutInput, db: DatabaseClient = getDb()) {
  return db.withTransaction(async tx => {
    await tx.query('SELECT id FROM payment_groups WHERE code=$1 FOR UPDATE',[code]);
    const {group,tickets} = await getPaymentGroup(code,user,tx);
    if (group.user_id!==user.id) fail('FORBIDDEN','Không thể thanh toán hộ tài khoản khác.',403);
    if (!['HOLD','PENDING'].includes(group.status) || new Date(group.hold_expires_at).getTime()<=getServerNow().getTime() || tickets.some(b=>b.booking_status!=='HOLD')) fail('HOLD_EXPIRED','Nhóm không còn ở trạng thái chờ thanh toán. Vui lòng kiểm tra vé hoặc chọn lại ca.');
    const current = (await tx.query<any>("SELECT * FROM payment_attempts WHERE payment_group_id=$1 AND status IN ('CREATED','FAILED') ORDER BY created_at DESC LIMIT 1",[group.id])).rows[0];
    if (current) return { checkoutUrl:current.checkout_url,amountVnd:current.amount_vnd,merchantTxnRef:current.merchant_txn_ref };
    const name = (input.contactName||'').trim(), phone=(input.contactPhone||'').trim();
    if (name.length<2 || !/^[0-9+\s.-]{9,15}$/.test(phone)) fail('INVALID_CONTACT','Vui lòng nhập họ tên và số điện thoại hợp lệ.',400);
    const addons = input.addons || {};
    if (typeof addons!=='object' || Array.isArray(addons) || Object.keys(addons).some(k=>!tickets.some(b=>b.booking_code===k))) fail('INVALID_ADDONS','Dịch vụ phải thuộc một vé trong nhóm.',400);
    const fees:number[]=[];
    for (const b of tickets) {
      const items=addons[b.booking_code]||[];
      if (!Array.isArray(items) || items.length>100) fail('INVALID_ADDONS','Danh sách dịch vụ không hợp lệ.',400);
      fees.push((await reserveBookingEquipment(tx,b.id,items)).fee);
    }
    const tier=(await tx.query<{member_tier:UserRecord['member_tier']}>('SELECT member_tier FROM users WHERE id=$1',[user.id])).rows[0].member_tier;
    const weights=tickets.map(b=>b.quoted_price_vnd);
    const member=weights.map(w=>Math.round(w*getMemberDiscountRate(tier)));
    let discount=0, couponCode:string|null=null;
    if (input.couponCode?.trim()) {
      couponCode=input.couponCode.trim().toUpperCase();
      await tx.query('SELECT id FROM coupons WHERE code=$1 FOR UPDATE',[couponCode]);
      // Validation accepts a query executor; no nested transactions are used here.
      const validation=await validateAndCalculateCouponDiscount(couponCode,weights.reduce((a,b)=>a+b,0),tx as DatabaseClient,user.id);
      if (!validation.valid) fail('INVALID_COUPON',validation.errorVi||'Mã ưu đãi không hợp lệ.',400);
      // Reserve a limited coupon until the common hold deadline to prevent oversubscription.
      const coupon=validation.coupon!;
      const reservations=await tx.query<{all_count:number;user_count:number}>(`SELECT COUNT(*)::int AS all_count,
        COUNT(*) FILTER(WHERE user_id=$2)::int AS user_count FROM payment_groups
        WHERE coupon_code=$1 AND id<>$3 AND status='PENDING' AND hold_expires_at>$4`,[couponCode,user.id,group.id,getServerNow().toISOString()]);
      const paid=(await tx.query<{cnt:number}>(`SELECT COUNT(DISTINCT COALESCE(t.payment_group_id,b.id))::int AS cnt FROM bookings b LEFT JOIN booking_tickets t ON t.id=b.ticket_id
        WHERE b.user_id=$1 AND b.coupon_code_snapshot=$2 AND b.payment_status='PAID'`,[user.id,couponCode])).rows[0].cnt;
      if ((coupon.usage_limit!==null && coupon.used_count+reservations.rows[0].all_count>=coupon.usage_limit) || (coupon.max_uses_per_user!==null && paid+reservations.rows[0].user_count>=coupon.max_uses_per_user)) fail('COUPON_LIMIT','Mã ưu đãi đã hết lượt khả dụng.');
      discount=validation.discountVnd;
    }
    // Keep a positive payable amount per ticket, matching the existing booking money constraints.
    const remaining=weights.map((w,i)=>Math.max(0,w-member[i]-1000));
    const couponShares=allocateDiscount(discount,remaining);
    let total=0;
    for (let i=0;i<tickets.length;i++) {
      const b=tickets[i], amount=weights[i]+fees[i]-member[i]-couponShares[i]; total+=amount;
      await tx.query(`UPDATE bookings SET contact_name=$1,contact_phone=$2,contact_email=$3,service_fee_vnd=$4,
        member_discount_vnd=$5,discount_amount_vnd=$6,coupon_code_snapshot=$7,total_amount_vnd=$8,payment_status='PENDING',updated_at=$9 WHERE id=$10`,
        [name,phone,(input.contactEmail||user.email).trim(),fees[i],member[i],couponShares[i],couponCode,amount,getServerNow().toISOString(),b.id]);
      await tx.query('UPDATE booking_tickets SET paid_amount_vnd=$1 WHERE id=$2',[amount,b.ticket_id]);
    }
    const ref=`TXN-${group.code}-${randomUUID().slice(0,8)}`;
    const gateway=paymentGateway.createPaymentUrl({merchantTxnRef:ref,bookingCode:group.code,amountVnd:total,currency:'VND',expiresAt:new Date(group.hold_expires_at),returnUrl:`${config.appBaseUrl}/thanh-toan/nhom/${encodeURIComponent(group.code)}`});
    await tx.query(`INSERT INTO payment_attempts(id,booking_id,payment_group_id,provider,merchant_txn_ref,amount_vnd,status,checkout_url,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,'CREATED',$7,$8)`,[`pay-${randomUUID()}`,tickets[0].id,group.id,gateway.provider,ref,total,gateway.checkoutUrl,group.hold_expires_at]);
    await tx.query("UPDATE payment_groups SET status='PENDING',total_amount_vnd=$1,coupon_code=$2 WHERE id=$3",[total,couponCode,group.id]);
    return {checkoutUrl:gateway.checkoutUrl,amountVnd:total,merchantTxnRef:ref};
  });
}

type WebhookOutcome = 'CONFIRMED'|'LATE_PAID_QUEUED_REFUND'|'PAYMENT_FAILED'|'DUPLICATE_IGNORED'|'OUT_OF_ORDER_IGNORED';
export async function processGroupWebhook(payload: WebhookPayloadInput, db: DatabaseClient): Promise<{outcome:WebhookOutcome;bookingCode:string}|null> {
  const found=(await db.query<any>('SELECT payment_group_id FROM payment_attempts WHERE merchant_txn_ref=$1',[payload.merchantTxnRef])).rows[0];
  if (!found?.payment_group_id) return null;
  if (!paymentGateway.verifyWebhookPayload(payload)) fail('INVALID_WEBHOOK_SIGNATURE','Chữ ký thanh toán không hợp lệ.',400);
  if (payload.currency!=='VND') fail('INVALID_WEBHOOK_CURRENCY','Loại tiền tệ không hợp lệ.',400);
  return db.withTransaction(async tx=>{
    const group=(await tx.query<PaymentGroup>('SELECT * FROM payment_groups WHERE id=$1 FOR UPDATE',[found.payment_group_id])).rows[0];
    const attempt=(await tx.query<any>('SELECT * FROM payment_attempts WHERE merchant_txn_ref=$1 FOR UPDATE',[payload.merchantTxnRef])).rows[0];
    if (Number(payload.amountVnd)!==attempt.amount_vnd) fail('PAYMENT_AMOUNT_MISMATCH','Số tiền thanh toán không khớp.',400);
    const key=`${attempt.provider}:${payload.merchantTxnRef}:${payload.providerTxnNo}:${payload.responseCode}`;
    if ((await tx.query('SELECT id FROM provider_webhook_events WHERE event_key=$1',[key])).rows.length || ['SUCCEEDED','LATE_SUCCEEDED'].includes(attempt.status)) return {outcome:'DUPLICATE_IGNORED',bookingCode:group.code};
    let outcome:WebhookOutcome;
    const now=getServerNow().toISOString();
    const tickets=(await tx.query<BookingRecord>(`SELECT b.* FROM bookings b JOIN booking_tickets t ON t.primary_booking_id=b.id WHERE t.payment_group_id=$1 ORDER BY b.id FOR UPDATE OF b`,[group.id])).rows;
    if (payload.responseCode!=='00') {
      outcome=['PAID','LATE_PAID'].includes(group.status)?'OUT_OF_ORDER_IGNORED':'PAYMENT_FAILED';
      if (outcome==='PAYMENT_FAILED') {
        await tx.query("UPDATE payment_attempts SET status='FAILED',signature_verified=TRUE,provider_txn_no=$2,updated_at=$3 WHERE id=$1",[attempt.id,payload.providerTxnNo,now]);
        for (const b of tickets) await tx.query("UPDATE bookings SET payment_status='FAILED' WHERE id=$1",[b.id]);
      }
    } else {
      // A second successful attempt is money actually received: refund it rather than silently ignoring it.
      const valid=!['PAID','LATE_PAID'].includes(group.status) && new Date(group.hold_expires_at).getTime()>getServerNow().getTime() && tickets.every(b=>b.booking_status==='HOLD');
      outcome=valid?'CONFIRMED':'LATE_PAID_QUEUED_REFUND';
      await tx.query(`UPDATE payment_attempts SET status=$1,signature_verified=TRUE,provider_txn_no=$2,paid_at=$3,raw_webhook_summary=$4,sender_bank_name=COALESCE($5,sender_bank_name),sender_bank_code=COALESCE($6,sender_bank_code),sender_account_no=COALESCE($7,sender_account_no),sender_account_name=COALESCE($8,sender_account_name),updated_at=$3 WHERE id=$9`,[valid?'SUCCEEDED':'LATE_SUCCEEDED',payload.providerTxnNo,now,JSON.stringify(payload),payload.senderBankName||null,payload.senderBankCode||null,payload.senderAccountNo||null,payload.senderAccountName||null,attempt.id]);
      if (valid) {
        await tx.query("UPDATE payment_groups SET status='PAID' WHERE id=$1",[group.id]);
        if (group.coupon_code) await tx.query('UPDATE coupons SET used_count=used_count+1 WHERE code=$1',[group.coupon_code]);
        await tx.query(`UPDATE users SET total_spent_vnd=total_spent_vnd+$1,member_tier=CASE WHEN total_spent_vnd+$1>=3000000 THEN 'GOLD' WHEN total_spent_vnd+$1>=1000000 THEN 'SILVER' ELSE member_tier END WHERE id=$2`,[attempt.amount_vnd,group.user_id]);
      } else if (group.status!=='PAID') await tx.query("UPDATE payment_groups SET status='LATE_PAID' WHERE id=$1",[group.id]);
      for (const b of tickets) {
        if (valid) await tx.query("UPDATE bookings SET booking_status='CONFIRMED',payment_status='PAID',confirmed_at=$1,updated_at=$1 WHERE id=$2",[now,b.id]);
        else {
          const refundId=`rfd-${randomUUID()}`, refundCode=`RF-${randomUUID()}`;
          const allocation=(await tx.query<{paid_amount_vnd:number}>('SELECT paid_amount_vnd FROM booking_tickets WHERE id=$1',[b.ticket_id])).rows[0].paid_amount_vnd;
          await tx.query(`INSERT INTO refunds(id,booking_id,payment_attempt_id,refund_code,amount_vnd,reason_type,reason_note,status,destination_bank_name,destination_bank_code,destination_account_no,destination_account_name)
            VALUES($1,$2,$3,$4,$5,'LATE_PAYMENT_EXPIRED_HOLD','Thanh toán đến sau hạn hoặc thanh toán lặp','PENDING',$6,$7,$8,$9)`,[refundId,b.id,attempt.id,refundCode,allocation,payload.senderBankName||null,payload.senderBankCode||null,payload.senderAccountNo||null,payload.senderAccountName||null]);
          await tx.query(`INSERT INTO background_jobs(id,job_type,dedup_key,payload_json,status,next_run_at) VALUES($1,'PROCESS_REFUND',$2,$3,'PENDING',$4)`,[`job-${randomUUID()}`,`refund-${refundId}`,JSON.stringify({refundId,bookingId:b.id}),now]);
          if (group.status!=='PAID') await tx.query(`UPDATE bookings SET booking_status=CASE WHEN booking_status='CANCELLED' THEN 'CANCELLED' ELSE 'EXPIRED' END,payment_status='LATE_PAID_CONFLICT',refund_status='PENDING',refundable_amount_vnd=$1,expired_at=$2 WHERE id=$3`,[allocation,now,b.id]);
        }
        await tx.query(`INSERT INTO booking_events(id,booking_id,event_type,actor_role,message_vi) VALUES($1,$2,$3,'SYSTEM',$4)`,[`evt-${randomUUID()}`,b.id,valid?'PAYMENT_CONFIRMED':outcome,valid?`Đã thanh toán vé ${b.booking_code} trong nhóm ${group.code}.`:'Khoản thanh toán được đưa vào hàng đợi hoàn tiền.']);
        await tx.query(`INSERT INTO notifications(id,user_id,booking_id,type,title_vi,body_vi,email_delivery_status) VALUES($1,$2,$3,$4,$5,$6,'QUEUED')`,[`ntf-${randomUUID()}`,group.user_id,b.id,valid?'BOOKING_CONFIRMED':'LATE_PAYMENT_REFUND',valid?`Vé ${b.booking_code} đã xác nhận`:'Đang hoàn tiền',`${b.court_name_snapshot} · ${b.booking_date} · ${b.start_hour}:00–${b.end_hour}:00 · ${formatVnd(b.total_amount_vnd)}`]);
        await tx.query(`INSERT INTO background_jobs(id,job_type,dedup_key,payload_json,status,next_run_at) VALUES($1,'SEND_EMAIL',$2,$3,'PENDING',$4) ON CONFLICT(dedup_key) DO NOTHING`,[`job-${randomUUID()}`,`email-${outcome}-${attempt.id}-${b.id}`,JSON.stringify({to:b.contact_email,subject:valid?`Vé đặt sân ${b.booking_code}`:'Đang hoàn tiền đặt sân',bodyText:`${b.contact_name}, ${b.court_name_snapshot}, ${b.booking_date}, ${b.start_hour}:00–${b.end_hour}:00. Xem vé: ${config.appBaseUrl}/don-dat/${b.booking_code}`,category:valid?'BOOKING_CONFIRMED':'LATE_PAYMENT_REFUND',bookingId:b.id}),now]);
      }
    }
    await tx.query(`INSERT INTO provider_webhook_events(id,provider,event_key,merchant_txn_ref,provider_txn_no,signature_valid,payload_json,processing_outcome)
      VALUES($1,$2,$3,$4,$5,TRUE,$6,$7)`,[`wh-${randomUUID()}`,attempt.provider,key,payload.merchantTxnRef,payload.providerTxnNo,JSON.stringify(payload),outcome]);
    return {outcome,bookingCode:group.code};
  });
}
