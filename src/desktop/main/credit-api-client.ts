import { CooltoApiError } from "../../api/coolto-api-error.js";
import type { DesktopCreditSummary } from "../shared/types.js";

interface CreditEnvelope {
  success?: boolean;
  data?: {
    weekly_free_credits?: number;
    credit_balance?: number;
    plan_type?: string;
    has_free_trial?: boolean;
    unlimited?: boolean;
    recent_transactions?: Array<{
      amount?: number;
      transaction_type?: string;
      created_at?: string;
    }>;
  };
  error?: { code?: string; message?: string };
}

export async function fetchCreditSummary(
  baseUrl: string,
  sessionToken: string,
  fetchFn: typeof fetch = fetch,
): Promise<DesktopCreditSummary> {
  const response = await fetchFn(
    `${baseUrl.replace(/\/+$/u, "")}/api/user/credits`,
    { headers: { Cookie: `access_token=${sessionToken}` } },
  );
  const payload = (await response.json()) as CreditEnvelope;
  if (!response.ok || payload.success !== true || !payload.data) {
    throw new CooltoApiError(
      payload.error?.message ?? `Credit API 请求失败（HTTP ${response.status}）`,
      response.status,
      payload.error?.code,
    );
  }
  const data = payload.data;
  if (
    typeof data.weekly_free_credits !== "number" ||
    typeof data.credit_balance !== "number" ||
    typeof data.plan_type !== "string" ||
    typeof data.has_free_trial !== "boolean" ||
    !Array.isArray(data.recent_transactions)
  ) {
    throw new CooltoApiError("Credit API 返回格式错误", 502, "invalid_contract");
  }
  return {
    weeklyFreeCredits: data.weekly_free_credits,
    creditBalance: data.credit_balance,
    planType: data.plan_type,
    hasFreeTrial: data.has_free_trial,
    unlimited: data.unlimited === true,
    recentTransactions: data.recent_transactions.map((transaction) => {
      if (
        typeof transaction.amount !== "number" ||
        typeof transaction.transaction_type !== "string" ||
        typeof transaction.created_at !== "string"
      ) {
        throw new CooltoApiError(
          "Credit API 流水格式错误",
          502,
          "invalid_contract",
        );
      }
      return {
        amount: transaction.amount,
        transactionType: transaction.transaction_type,
        createdAt: transaction.created_at,
      };
    }),
  };
}
