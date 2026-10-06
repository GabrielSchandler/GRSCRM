import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canAccessAllPreSales } from "@/lib/pre-sales/access";
import { resolveUserDisplayName } from "@/lib/users/account";
import { getHomeForRole } from "@/lib/workspace";
import { leadMediaOptions, preSaleTypes, type PreSalePayment } from "@/types/pre-sale";

type CommercialUser = {
  id: string;
  full_name: string | null;
  nickname: string | null;
  username: string | null;
  role: string | null;
  business_area: string | null;
  is_active: boolean | null;
  monthly_goal: number | string | null;
};

type ApprovedPreSale = {
  id: string;
  client_id: string;
  consultant_user_id: string | null;
  created_by: string;
  pre_sale_type: string | null;
  service_type: string | null;
  media: string | null;
  contract_value: number | string | null;
  created_at: string;
};

type ClientSummary = {
  id: string;
  full_name: string | null;
  cpf: string | null;
  phone_mobile: string | null;
};

type PendingPayment = PreSalePayment & {
  preSale: ApprovedPreSale;
  client: ClientSummary | null;
};

const timeZone = "America/Sao_Paulo";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const numberFormatter = new Intl.NumberFormat("pt-BR");

const percentFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
});

const commissionTiers = [
  { target: 11000, percent: 10 },
  { target: 12000, percent: 14 },
  { target: 13000, percent: 15 },
  { target: 14000, percent: 16 },
  { target: 15000, percent: 17 },
  { target: 16000, percent: 17 },
  { target: 17000, percent: 18 },
  { target: 18000, percent: 18 },
  { target: 19000, percent: 18 },
  { target: 20000, percent: 20 },
  { target: 23000, percent: 22 },
  { target: 25000, percent: 25 },
  { target: 30000, percent: 25 },
  { target: 35000, percent: 25 },
  { target: 40000, percent: 25 },
];

function toNumber(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: string | number | null | undefined) {
  return currencyFormatter.format(toNumber(value));
}

function formatYmdDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const [year, month, day] = value.slice(0, 10).split("-");

  if (!year || !month || !day) {
    return "-";
  }

  return `${day}/${month}/${year}`;
}

function getSaoPauloDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value ?? "0"),
    month: Number(parts.find((part) => part.type === "month")?.value ?? "1"),
    day: Number(parts.find((part) => part.type === "day")?.value ?? "1"),
  };
}

function toYmd(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getMonthRange() {
  const today = getSaoPauloDateParts();
  const nextMonth = today.month === 12 ? 1 : today.month + 1;
  const nextMonthYear = today.month === 12 ? today.year + 1 : today.year;

  return {
    todayYmd: toYmd(today.year, today.month, today.day),
    monthStartYmd: toYmd(today.year, today.month, 1),
    nextMonthStartYmd: toYmd(nextMonthYear, nextMonth, 1),
  };
}

function dateFromYmd(ymd: string) {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function countBusinessDays(startYmd: string, endYmd: string) {
  const start = dateFromYmd(startYmd);
  const end = dateFromYmd(endYmd);
  let count = 0;

  for (
    let cursor = new Date(start);
    cursor.getTime() <= end.getTime();
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const weekDay = cursor.getUTCDay();

    if (weekDay >= 1 && weekDay <= 5) {
      count += 1;
    }
  }

  return count;
}

function getMonthEndYmd(nextMonthStartYmd: string) {
  const end = dateFromYmd(nextMonthStartYmd);
  end.setUTCDate(end.getUTCDate() - 1);
  return toYmd(end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate());
}

function getCommission(total: number) {
  const currentTier =
    [...commissionTiers].reverse().find((tier) => total >= tier.target) ?? {
      target: 0,
      percent: 0,
    };
  const nextTier = commissionTiers.find((tier) => total < tier.target) ?? null;

  return {
    percent: currentTier.percent,
    amount: total * (currentTier.percent / 100),
    currentTarget: currentTier.target,
    nextTier,
  };
}

function sumPaymentsForPreSale(payments: PreSalePayment[]) {
  return payments.reduce(
    (total, payment) => total + toNumber(payment.goal_amount ?? payment.amount),
    0,
  );
}

function isPaymentInRange(payment: PreSalePayment, startYmd: string, endYmd: string) {
  const paymentDate = payment.payment_date?.slice(0, 10);

  return Boolean(paymentDate && paymentDate >= startYmd && paymentDate < endYmd);
}

function isPaidPayment(payment: PreSalePayment) {
  return payment.status === "pago";
}

function getPreSaleOwnerId(preSale: ApprovedPreSale) {
  return preSale.consultant_user_id ?? preSale.created_by;
}

function typeLabel(value: string | null | undefined) {
  return preSaleTypes.find((item) => item.value === value)?.label ?? "Sem tipo";
}

function mediaLabel(value: string | null | undefined) {
  return leadMediaOptions.find((item) => item.value === value)?.label ?? "Sem mídia";
}

function pushBucket(
  buckets: Map<string, { label: string; count: number; value: number }>,
  key: string,
  label: string,
  value: number,
) {
  const current = buckets.get(key) ?? { label, count: 0, value: 0 };
  buckets.set(key, {
    label,
    count: current.count + 1,
    value: current.value + value,
  });
}

function StatCard({
  label,
  value,
  detail,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "success" | "warning" | "danger";
  icon: typeof Target;
}) {
  const toneClass = {
    default: "border-slate-200 bg-white text-slate-950",
    success: "border-emerald-200 bg-emerald-50 text-emerald-950",
    warning: "border-amber-200 bg-amber-50 text-amber-950",
    danger: "border-red-200 bg-red-50 text-red-950",
  }[tone];
  const iconClass = {
    default: "bg-slate-100 text-slate-700",
    success: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-red-100 text-red-700",
  }[tone];

  return (
    <div className={`rounded-lg border p-5 shadow-sm ${toneClass}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-600">{label}</p>
          <p className="mt-2 text-2xl font-semibold">{value}</p>
        </div>
        <span className={`rounded-lg p-2 ${iconClass}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 text-sm leading-5 text-slate-600">{detail}</p>
    </div>
  );
}

function SegmentList({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; count: number; value: number }>;
}) {
  const maxValue = Math.max(...items.map((item) => item.value), 1);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      <div className="mt-4 space-y-4">
        {items.length ? (
          items.map((item) => (
            <div key={item.label} className="space-y-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-slate-800">{item.label}</span>
                <span className="text-slate-500">
                  {numberFormatter.format(item.count)} venda(s) | {formatCurrency(item.value)}
                </span>
              </div>
              <div className="h-2 rounded-lg bg-slate-100">
                <div
                  className="h-2 rounded-lg bg-teal-700"
                  style={{ width: `${Math.max(6, (item.value / maxValue) * 100)}%` }}
                />
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">Nenhum pagamento pago neste mês.</p>
        )}
      </div>
    </section>
  );
}

export default async function ComercialDashboardPage() {
  const { supabase, companyId, role, businessArea, userProfileId, profile } =
    await getCurrentUserContext();

  if (role === "seller" && businessArea !== "commercial") {
    redirect(getHomeForRole(role, businessArea));
  }

  const { todayYmd, monthStartYmd, nextMonthStartYmd } = getMonthRange();
  const monthEndYmd = getMonthEndYmd(nextMonthStartYmd);
  const remainingBusinessDays = Math.max(countBusinessDays(todayYmd, monthEndYmd), 1);

  const [{ data: usersData }, { data: preSalesData, error: preSalesError }] =
    await Promise.all([
      supabase
        .from("user_profiles")
        .select("id, full_name, nickname, username, role, business_area, is_active, monthly_goal")
        .eq("company_id", companyId),
      supabase
        .from("pre_sales")
        .select(
          "id, client_id, consultant_user_id, created_by, pre_sale_type, service_type, media, contract_value, created_at",
        )
        .eq("company_id", companyId)
        .eq("status", "aprovado")
        .order("created_at", { ascending: false }),
    ]);

  const allUsers = (usersData ?? []) as CommercialUser[];
  const activeCommercialSellers = allUsers.filter(
    (user) =>
      user.role === "seller" &&
      user.business_area === "commercial" &&
      user.is_active !== false,
  );
  const visibleSellerIds =
    role === "seller"
      ? new Set([userProfileId])
      : new Set(activeCommercialSellers.map((user) => user.id));
  const approvedPreSales = ((preSalesData ?? []) as ApprovedPreSale[]).filter(
    (preSale) => {
      if (canAccessAllPreSales(role, businessArea)) {
        return visibleSellerIds.has(getPreSaleOwnerId(preSale));
      }

      return (
        preSale.consultant_user_id === userProfileId ||
        preSale.created_by === userProfileId
      );
    },
  );
  const preSaleIds = approvedPreSales.map((preSale) => preSale.id);
  const clientIds = [...new Set(approvedPreSales.map((preSale) => preSale.client_id))];
  const [{ data: paymentsData }, { data: clientsData }] = preSaleIds.length
    ? await Promise.all([
        supabase
          .from("pre_sale_payments")
          .select(
            "id, pre_sale_id, installment_number, amount, goal_amount, payment_method, payment_date, status",
          )
          .in("pre_sale_id", preSaleIds),
        clientIds.length
          ? supabase
              .from("clients")
              .select("id, full_name, cpf, phone_mobile")
              .eq("company_id", companyId)
              .in("id", clientIds)
          : Promise.resolve({ data: [] }),
      ])
    : [{ data: [] }, { data: [] }];

  const clientsById = new Map(
    ((clientsData ?? []) as ClientSummary[]).map((client) => [client.id, client]),
  );
  const paymentsByPreSaleId = new Map<string, PreSalePayment[]>();
  const monthlyPaidPaymentsByPreSaleId = new Map<string, PreSalePayment[]>();

  ((paymentsData ?? []) as PreSalePayment[]).forEach((payment) => {
    if (!payment.pre_sale_id) {
      return;
    }

    const current = paymentsByPreSaleId.get(payment.pre_sale_id) ?? [];
    current.push(payment);
    paymentsByPreSaleId.set(payment.pre_sale_id, current);

    if (isPaidPayment(payment) && isPaymentInRange(payment, monthStartYmd, nextMonthStartYmd)) {
      const monthlyCurrent = monthlyPaidPaymentsByPreSaleId.get(payment.pre_sale_id) ?? [];
      monthlyCurrent.push(payment);
      monthlyPaidPaymentsByPreSaleId.set(payment.pre_sale_id, monthlyCurrent);
    }
  });

  const sellerGoal =
    role === "seller"
      ? toNumber((profile as { monthly_goal?: number | string | null }).monthly_goal)
      : activeCommercialSellers.reduce(
          (total, user) => total + toNumber(user.monthly_goal),
          0,
        );
  const preSaleValues = approvedPreSales
    .map((preSale) => {
      const monthlyPaidPayments = monthlyPaidPaymentsByPreSaleId.get(preSale.id) ?? [];
      const paymentDate =
        monthlyPaidPayments
          .map((payment) => payment.payment_date?.slice(0, 10) ?? "")
          .filter(Boolean)
          .sort()
          .at(-1) ?? null;

      return {
        preSale,
        value: sumPaymentsForPreSale(monthlyPaidPayments),
        contractValue: toNumber(preSale.contract_value),
        paymentDate,
      };
    })
    .filter((item) => item.value > 0);
  const salesTotal = preSaleValues.reduce((total, item) => total + item.value, 0);
  const contractTotal = preSaleValues.reduce(
    (total, item) => total + item.contractValue,
    0,
  );
  const remainingGoal = Math.max(sellerGoal - salesTotal, 0);
  const achievement = sellerGoal > 0 ? Math.min((salesTotal / sellerGoal) * 100, 100) : 0;
  const dailyGoal = remainingGoal / remainingBusinessDays;
  const commission = getCommission(salesTotal);
  const nextTierGap = commission.nextTier
    ? Math.max(commission.nextTier.target - salesTotal, 0)
    : 0;
  const averageTicket = preSaleValues.length ? salesTotal / preSaleValues.length : 0;
  const currentMonthPaidPayments = [...monthlyPaidPaymentsByPreSaleId.values()].flat();
  const missingPaymentGoalCount = currentMonthPaidPayments.filter(
    (payment) => payment.goal_amount === null && toNumber(payment.amount) > 0,
  ).length;

  const preSalesById = new Map(approvedPreSales.map((preSale) => [preSale.id, preSale]));
  const pendingPayments = ((paymentsData ?? []) as PreSalePayment[])
    .filter((payment) => !isPaidPayment(payment))
    .map((payment) => {
      const preSale = payment.pre_sale_id ? preSalesById.get(payment.pre_sale_id) : null;

      if (!preSale) {
        return null;
      }

      return {
        ...payment,
        preSale,
        client: clientsById.get(preSale.client_id) ?? null,
      };
    })
    .filter((payment): payment is PendingPayment => Boolean(payment))
    .sort((left, right) =>
      String(left.payment_date ?? "9999-12-31").localeCompare(
        String(right.payment_date ?? "9999-12-31"),
      ),
    );
  const pendingValue = pendingPayments.reduce(
    (total, payment) => total + toNumber(payment.goal_amount ?? payment.amount),
    0,
  );
  const overduePayments = pendingPayments.filter(
    (payment) => payment.payment_date && payment.payment_date < todayYmd,
  );
  const dueTodayPayments = pendingPayments.filter(
    (payment) => payment.payment_date === todayYmd,
  );

  const typeBuckets = new Map<string, { label: string; count: number; value: number }>();
  const mediaBuckets = new Map<string, { label: string; count: number; value: number }>();
  const serviceBuckets = new Map<string, { label: string; count: number; value: number }>();

  preSaleValues.forEach(({ preSale, value }) => {
    pushBucket(typeBuckets, preSale.pre_sale_type ?? "none", typeLabel(preSale.pre_sale_type), value);
    pushBucket(mediaBuckets, preSale.media ?? "none", mediaLabel(preSale.media), value);
    pushBucket(
      serviceBuckets,
      preSale.service_type ?? "none",
      preSale.service_type?.trim() || "Sem serviço",
      value,
    );
  });

  const typeSegments = [...typeBuckets.values()].sort((left, right) => right.value - left.value);
  const mediaSegments = [...mediaBuckets.values()].sort((left, right) => right.value - left.value);
  const serviceSegments = [...serviceBuckets.values()]
    .sort((left, right) => right.value - left.value)
    .slice(0, 5);

  const sellerLabel =
    role === "seller"
      ? resolveUserDisplayName(profile, "Consultor")
      : `${numberFormatter.format(activeCommercialSellers.length)} consultores comerciais`;

  return (
    <>
      <PageHeader
        title="Painel comercial"
        description="Pagamentos pagos no mês, meta, comissão e cobranças que precisam de acompanhamento."
      />
      <div className="commercial-dashboard dashboard-contrast space-y-6 p-6">
        {preSalesError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {preSalesError.message}
          </div>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-teal-700">{sellerLabel}</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                Resultado do mês atual
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Período analisado: {formatYmdDate(monthStartYmd)} ate {formatYmdDate(monthEndYmd)}.
                Somente pagamentos pagos no período entram na venda total.
              </p>
            </div>
            <Link
              href="/pre-vendas/novo"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800"
            >
              Nova pré-venda
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-slate-700">Progresso da meta</span>
              <span className="font-semibold text-slate-950">
                {percentFormatter.format(achievement)}%
              </span>
            </div>
            <div className="mt-2 h-3 rounded-lg bg-slate-100">
              <div
                className="h-3 rounded-lg bg-teal-700"
                style={{ width: `${Math.max(3, achievement)}%` }}
              />
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={Target}
            label="Meta mês"
            value={formatCurrency(sellerGoal)}
            detail="Valor configurado em Gestão > Usuários para consultores comerciais."
          />
          <StatCard
            icon={CircleDollarSign}
            label="Venda total"
            value={formatCurrency(salesTotal)}
            detail="Soma do campo Meta dos pagamentos pagos dentro do mês atual."
            tone="success"
          />
          <StatCard
            icon={TrendingUp}
            label="Restante pra meta"
            value={formatCurrency(remainingGoal)}
            detail={`${remainingBusinessDays} dia(s) útil(eis) restantes. Meta diaria: ${formatCurrency(dailyGoal)}.`}
            tone={remainingGoal > 0 ? "warning" : "success"}
          />
          <StatCard
            icon={Clock3}
            label="Pagamentos pendentes"
            value={numberFormatter.format(pendingPayments.length)}
            detail={`${formatCurrency(pendingValue)} em aberto. ${overduePayments.length} atrasado(s) e ${dueTodayPayments.length} vencendo hoje.`}
            tone={overduePayments.length ? "danger" : pendingPayments.length ? "warning" : "success"}
          />
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={Users}
            label="Clientes aprovados"
            value={numberFormatter.format(preSaleValues.length)}
            detail={`Ticket medio pela meta: ${formatCurrency(averageTicket)}.`}
          />
          <StatCard
            icon={CheckCircle2}
            label="Comissão estimada"
            value={formatCurrency(commission.amount)}
            detail={`Faixa atual: ${commission.percent}% sobre a meta vendida.`}
            tone="success"
          />
          <StatCard
            icon={ArrowUpRight}
            label="Próxima faixa"
            value={
              commission.nextTier
                ? `${commission.nextTier.percent}% em ${formatCurrency(commission.nextTier.target)}`
                : "Topo da tabela"
            }
            detail={
              commission.nextTier
                ? `Faltam ${formatCurrency(nextTierGap)} para subir a faixa.`
                : "A maior faixa de comissão já foi alcancada."
            }
          />
          <StatCard
            icon={AlertTriangle}
            label="Meta não informada"
            value={numberFormatter.format(missingPaymentGoalCount)}
            detail={`${formatCurrency(contractTotal)} em contratos com pagamentos pagos no mês para conferencia.`}
            tone={missingPaymentGoalCount ? "warning" : "success"}
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <SegmentList title="Segmentacao por produto" items={typeSegments} />
          <SegmentList title="Origem do lead" items={mediaSegments} />
          <SegmentList title="Serviço contratado" items={serviceSegments} />
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-950">
                Clientes com venda aprovada
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Clientes com pagamento pago dentro do período do painel.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Cliente</th>
                    <th className="px-5 py-3 font-semibold">Produto</th>
                    <th className="px-5 py-3 font-semibold">Origem</th>
                    <th className="px-5 py-3 font-semibold">Meta</th>
                    <th className="px-5 py-3 font-semibold">Pagamento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preSaleValues.map(({ preSale, value, paymentDate }) => {
                    const client = clientsById.get(preSale.client_id);

                    return (
                      <tr key={preSale.id} className="transition hover:bg-slate-50">
                        <td className="px-5 py-3">
                          <Link
                            href={`/pre-vendas/${preSale.id}`}
                            className="font-semibold text-slate-950 transition hover:text-teal-700"
                          >
                            {client?.full_name ?? "Cliente sem nome"}
                          </Link>
                          <p className="mt-1 text-xs text-slate-500">
                            {resolveUserDisplayName(
                              allUsers.find((user) => user.id === getPreSaleOwnerId(preSale)),
                              "Sem consultor",
                            )}
                          </p>
                        </td>
                        <td className="px-5 py-3 text-slate-700">
                          {typeLabel(preSale.pre_sale_type)}
                        </td>
                        <td className="px-5 py-3 text-slate-700">
                          {mediaLabel(preSale.media)}
                        </td>
                        <td className="px-5 py-3 font-semibold text-slate-950">
                          {formatCurrency(value)}
                        </td>
                        <td className="px-5 py-3 text-slate-700">
                          {formatYmdDate(paymentDate)}
                        </td>
                      </tr>
                    );
                  })}
                  {!preSaleValues.length ? (
                    <tr>
                      <td className="px-5 py-8 text-center text-slate-500" colSpan={5}>
                        Nenhum pagamento pago neste mês.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-950">
                Alertas de cobrança
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Pagamentos previstos ainda não marcados como pagos.
              </p>
            </div>
            <div className="divide-y divide-slate-100">
              {pendingPayments.slice(0, 10).map((payment) => {
                const isOverdue = payment.payment_date && payment.payment_date < todayYmd;
                const isToday = payment.payment_date === todayYmd;

                return (
                  <Link
                    key={payment.id ?? `${payment.preSale.id}-${payment.installment_number}`}
                    href={`/clientes/${payment.preSale.client_id}`}
                    className="block p-5 transition hover:bg-[var(--ns-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ns-primary)]"
                    aria-label={`Abrir cadastro de ${payment.client?.full_name ?? "cliente sem nome"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-950">
                            {payment.client?.full_name ?? "Cliente sem nome"}
                          </p>
                          <ArrowUpRight
                            className="h-4 w-4 text-teal-700"
                            aria-hidden="true"
                          />
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                          Parcela {payment.installment_number ?? "-"} | {formatCurrency(payment.goal_amount ?? payment.amount)}
                        </p>
                      </div>
                      <span
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                          isOverdue
                            ? "bg-red-100 text-red-700"
                            : isToday
                              ? "bg-amber-100 text-amber-700"
                              : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {isOverdue ? "Atrasado" : isToday ? "Hoje" : "Previsto"}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                      <CalendarDays className="h-4 w-4" aria-hidden="true" />
                      {payment.payment_date ? formatYmdDate(payment.payment_date) : "Sem data"}
                    </div>
                  </Link>
                );
              })}
              {!pendingPayments.length ? (
                <div className="p-5 text-sm text-slate-500">
                  Nenhum pagamento pendente entre as pré-vendas aprovadas.
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
