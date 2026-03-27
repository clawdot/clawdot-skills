import type { HandlerDeps, ToolResult } from "./shared.js";
import { textResult } from "./shared.js";
import { GatewayError } from "../types.js";

export async function handleOrder(
  params: Record<string, unknown>,
  deps: HandlerDeps,
): Promise<ToolResult> {
  const sessionId = params.session_id as string | undefined;
  if (!sessionId) return textResult("缺少 session_id 参数。");

  const token = await deps.authBridge.requireToken(deps.userId);
  try {
    const result = await deps.gateway.createOrder(token, sessionId);
    return textResult(JSON.stringify(result));
  } catch (err) {
    if (err instanceof GatewayError) {
      return textResult(friendlyOrderError(err));
    }
    throw err;
  }
}

export async function handleOrderStatus(
  params: Record<string, unknown>,
  deps: HandlerDeps,
): Promise<ToolResult> {
  const orderId = params.order_id as string | undefined;
  if (!orderId) return textResult("缺少 order_id 参数。");

  const token = await deps.authBridge.requireToken(deps.userId);
  const result = await deps.gateway.getOrderStatus(token, orderId);
  return textResult(JSON.stringify(result));
}

function friendlyOrderError(err: GatewayError): string {
  const msg = err.message.toLowerCase();
  if (msg.includes("expired") || msg.includes("not found") || msg.includes("过期") || msg.includes("不存在"))
    return "订单会话已过期或已使用，请重新预览下单。";
  if (msg.includes("closed") || msg.includes("not open") || msg.includes("休息") || msg.includes("未营业"))
    return "店铺暂未营业，请稍后再试。";
  if (msg.includes("out of stock") || msg.includes("sold out") || msg.includes("售罄") || msg.includes("缺货"))
    return "部分商品已售罄，请调整后重试。";
  if (msg.includes("min order") || msg.includes("minimum") || msg.includes("起送"))
    return "未达起送价，请加点别的~";
  return `下单失败：${err.message}`;
}
