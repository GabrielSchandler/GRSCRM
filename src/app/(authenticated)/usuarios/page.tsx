import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { ManagementTeam } from "@/components/management/management-team";
import { UserRoleBadge } from "@/components/users/user-role-badge";
import { UserStatusBadge } from "@/components/users/user-status-badge";
import { UserToggleStatusButton } from "@/components/users/user-toggle-status-button";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { displayValue, formatDateTime } from "@/lib/clients/formatters";
import {
  formatCompanyBusinessArea,
  formatLegalUserRole,
  type CompanyUserProfile,
} from "@/types/user";
import { getHomeForRole } from "@/lib/workspace";

type UsuariosPageProps = {
  searchParams: Promise<{
    success?: string;
    error?: string;
    status?: string;
    sort?: string;
  }>;
};

const userStatusFilters = ["all", "active", "inactive"] as const;

type UserStatusFilter = (typeof userStatusFilters)[number];

const defaultUserStatusFilter: UserStatusFilter = "all";
const defaultUserSort = "status_desc";

const sortableColumns = {
  full_name: {
    label: "Nome",
    asc: "name_asc",
    desc: "name_desc",
  },
  nickname: {
    label: "Apelido",
    asc: "nickname_asc",
    desc: "nickname_desc",
  },
  username: {
    label: "Login",
    asc: "login_asc",
    desc: "login_desc",
  },
  phone: {
    label: "Telefone",
    asc: "phone_asc",
    desc: "phone_desc",
  },
  business_area: {
    label: "Área",
    asc: "area_asc",
    desc: "area_desc",
  },
  legal_role: {
    label: "Função jurídica",
    asc: "legal_role_asc",
    desc: "legal_role_desc",
  },
  monthly_goal: {
    label: "Meta do mês",
    asc: "monthly_goal_asc",
    desc: "monthly_goal_desc",
  },
  role: {
    label: "Cargo",
    asc: "role_asc",
    desc: "role_desc",
  },
  is_active: {
    label: "Status",
    asc: "status_asc",
    desc: "status_desc",
  },
  created_at: {
    label: "Criado em",
    asc: "created_asc",
    desc: "created_desc",
  },
} as const;

type SortableColumn = keyof typeof sortableColumns;

const validUserSorts: Set<string> = new Set(
  Object.values(sortableColumns).flatMap((column) => [column.asc, column.desc]),
);

function getUserStatusFilter(status?: string): UserStatusFilter {
  return userStatusFilters.includes(status as UserStatusFilter)
    ? (status as UserStatusFilter)
    : defaultUserStatusFilter;
}

function getUserSort(sort?: string) {
  return validUserSorts.has(sort ?? "") ? (sort as string) : defaultUserSort;
}

function buildUsersHref(
  searchParams: Awaited<UsuariosPageProps["searchParams"]>,
  updates: Record<string, string>,
) {
  const params = new URLSearchParams();

  Object.entries(searchParams).forEach(([key, value]) => {
    if (value && key !== "success" && key !== "error") {
      params.set(key, value);
    }
  });

  Object.entries(updates).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
  });

  const query = params.toString();
  return query ? `/usuarios?${query}` : "/usuarios";
}

function buildSortHref(
  searchParams: Awaited<UsuariosPageProps["searchParams"]>,
  sort: string,
  column: SortableColumn,
) {
  const config = sortableColumns[column];
  const nextSort = sort === config.asc ? config.desc : config.asc;
  return buildUsersHref(searchParams, { sort: nextSort });
}

function SortHeader({
  column,
  sort,
  searchParams,
}: {
  column: SortableColumn;
  sort: string;
  searchParams: Awaited<UsuariosPageProps["searchParams"]>;
}) {
  const config = sortableColumns[column];
  const active = sort === config.asc || sort === config.desc;
  const direction = sort === config.asc ? "ASC" : sort === config.desc ? "DESC" : "";

  return (
    <Link
      href={buildSortHref(searchParams, sort, column)}
      className={`inline-flex items-center gap-1 font-semibold transition hover:text-teal-700 ${
        active ? "text-teal-700" : ""
      }`}
    >
      {config.label}
      {direction ? <span>{direction}</span> : null}
    </Link>
  );
}

const userCollator = new Intl.Collator("pt-BR", {
  numeric: true,
  sensitivity: "base",
});

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function compareText(
  left: string | number | boolean | null | undefined,
  right: string | number | boolean | null | undefined,
) {
  return userCollator.compare(String(left ?? ""), String(right ?? ""));
}

function compareDates(left?: string | null, right?: string | null) {
  return new Date(left ?? 0).getTime() - new Date(right ?? 0).getTime();
}

function compareNumbers(
  left: string | number | null | undefined,
  right: string | number | null | undefined,
) {
  return Number(left ?? 0) - Number(right ?? 0);
}

function formatMonthlyGoal(value: string | number | null | undefined) {
  const numeric = Number(value ?? 0);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "-";
  }

  return currencyFormatter.format(numeric);
}

function compareUsersBySort(
  left: CompanyUserProfile,
  right: CompanyUserProfile,
  sort: string,
) {
  const direction = sort.endsWith("_desc") ? -1 : 1;
  let result = 0;

  switch (sort) {
    case "name_asc":
    case "name_desc":
      result = compareText(left.full_name, right.full_name);
      break;
    case "nickname_asc":
    case "nickname_desc":
      result = compareText(left.nickname, right.nickname);
      break;
    case "login_asc":
    case "login_desc":
      result = compareText(left.username, right.username);
      break;
    case "phone_asc":
    case "phone_desc":
      result = compareText(left.phone, right.phone);
      break;
    case "area_asc":
    case "area_desc":
      result = compareText(
        formatCompanyBusinessArea(left.business_area),
        formatCompanyBusinessArea(right.business_area),
      );
      break;
    case "legal_role_asc":
    case "legal_role_desc":
      result = compareText(
        left.business_area === "legal" ? formatLegalUserRole(left.legal_role) : "-",
        right.business_area === "legal" ? formatLegalUserRole(right.legal_role) : "-",
      );
      break;
    case "monthly_goal_asc":
    case "monthly_goal_desc":
      result = compareNumbers(left.monthly_goal, right.monthly_goal);
      break;
    case "role_asc":
    case "role_desc":
      result = compareText(left.role, right.role);
      break;
    case "status_asc":
    case "status_desc":
      result = Number(left.is_active) - Number(right.is_active);
      break;
    case "created_asc":
    case "created_desc":
      result = compareDates(left.created_at, right.created_at);
      break;
    default:
      result = compareText(left.full_name, right.full_name);
      break;
  }

  if (result === 0) {
    result = compareText(left.full_name, right.full_name);
  }

  return result * direction;
}

function sortUsers(users: CompanyUserProfile[], sort: string) {
  return [...users].sort((left, right) => compareUsersBySort(left, right, sort));
}

function canAccessUserManagement(role: string | null) {
  return role === "admin" || role === "manager";
}

function canCreateUsers(role: string | null) {
  return role === "admin";
}

function canEditTarget(actorRole: string | null, targetRole: string | null) {
  if (actorRole === "admin") {
    return true;
  }

  if (actorRole === "manager") {
    return targetRole === "seller";
  }

  return false;
}

function successMessage(success?: string) {
  if (success === "created") {
    return "Usuário criado com sucesso.";
  }

  if (success === "updated") {
    return "Usuário atualizado.";
  }

  return null;
}

function errorMessage(error?: string) {
  if (error === "license_limit") {
    return "Limite de usuários atingido. Contrate uma licença adicional.";
  }

  return null;
}

export default async function UsuariosPage({ searchParams }: UsuariosPageProps) {
  const params = await searchParams;
  const { supabase, companyId, role, businessArea } = await getCurrentUserContext();

  if (!canAccessUserManagement(role)) {
    redirect(getHomeForRole(role, businessArea));
  }

  const statusFilter = getUserStatusFilter(params.status);
  const sort = getUserSort(params.sort);

  const [{ data: companyData, error: companyError }, { data, error }] =
    await Promise.all([
      supabase
        .from("companies")
        .select("user_license_limit")
        .eq("id", companyId)
        .single(),
      supabase
        .from("user_profiles")
        .select("*")
        .eq("company_id", companyId)
        .order("full_name", { ascending: true, nullsFirst: false }),
    ]);

  const allUsers = (data ?? []) as CompanyUserProfile[];
  const users = sortUsers(
    allUsers.filter((user) => {
      if (statusFilter === "active") {
        return user.is_active;
      }

      if (statusFilter === "inactive") {
        return !user.is_active;
      }

      return true;
    }),
    sort,
  );
  const activeUsers = allUsers.filter((user) => user.is_active).length;
  const licenseLimit = Number(companyData?.user_license_limit ?? 0);
  const availableLicenses = Math.max(licenseLimit - activeUsers, 0);
  const createBlocked = !canCreateUsers(role) || activeUsers >= licenseLimit;
  const bannerMessage = successMessage(params.success);
  const pageErrorMessage = errorMessage(params.error);

  return (
    <>
      <PageHeader
        title="Gestão"
        description="Gestão dos usuários da empresa, com controle de licencas e ativacao."
      />
      <div className="space-y-6 p-6">
        {bannerMessage ? (
          <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
            {bannerMessage}
          </div>
        ) : null}
        {pageErrorMessage ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {pageErrorMessage}
          </div>
        ) : null}

        {!error && <ManagementTeam users={allUsers} initialStatus={params.status === "active" || params.status === "inactive" ? params.status : ""} role={role} licenseLimit={licenseLimit} createBlocked={createBlocked} />}
        <details className="management-page rounded-lg border border-[var(--ns-border)] p-4">
        <summary className="cursor-pointer text-sm font-semibold">Licenças e listagem detalhada</summary>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Licencas contratadas
            </p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{licenseLimit}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Usuários ativos
            </p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{activeUsers}</p>
            <p className="mt-2 text-sm text-slate-600">
              {activeUsers} de {licenseLimit} usuários ativos
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Licencas disponíveis
            </p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">
              {availableLicenses}
            </p>
          </div>
        </section>

        <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-950">
                {activeUsers} de {licenseLimit} usuários ativos
              </p>
              {activeUsers >= licenseLimit ? (
                <p className="text-sm text-amber-800">
                  Limite de usuários atingido. Contrate uma licença adicional.
                </p>
              ) : (
                <p className="text-sm text-slate-600">
                  {availableLicenses} licença(s) disponível(is) para novos acessos.
                </p>
              )}
            </div>
            {canCreateUsers(role) ? (
              createBlocked ? (
                <span className="rounded-lg border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-500">
                  Novo usuário indisponível
                </span>
              ) : (
                <Link
                  href="/usuarios/novo"
                  className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800"
                >
                  Novo usuário
                </Link>
              )
            ) : null}
          </div>

          <form className="grid gap-3 md:grid-cols-[240px_auto_auto]">
            <input type="hidden" name="sort" value={sort} />
            <select
              name="status"
              defaultValue={statusFilter}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
            >
              <option value="all">Todos os usuários</option>
              <option value="active">Usuários ativos</option>
              <option value="inactive">Usuários desativados</option>
            </select>
            <button
              type="submit"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Filtrar
            </button>
            <Link
              href="/usuarios"
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              Limpar
            </Link>
          </form>

          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {users.length} usuário(s) exibido(s)
          </p>
        </div>

        {companyError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {companyError.message}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error.message}
          </div>
        ) : (
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">
                      <SortHeader
                        column="full_name"
                        sort={sort}
                        searchParams={params}
                      />
                    </th>
                    <th className="px-4 py-3">
                      <SortHeader
                        column="nickname"
                        sort={sort}
                        searchParams={params}
                      />
                    </th>
                    <th className="px-4 py-3">
                      <SortHeader column="username" sort={sort} searchParams={params} />
                    </th>
                    <th className="px-4 py-3">
                      <SortHeader column="phone" sort={sort} searchParams={params} />
                    </th>
                    <th className="px-4 py-3">
                      <SortHeader
                        column="business_area"
                        sort={sort}
                        searchParams={params}
                      />
                    </th>
                    <th className="px-4 py-3">
                      <SortHeader
                        column="legal_role"
                        sort={sort}
                        searchParams={params}
                      />
                    </th>
                    <th className="px-4 py-3">
                      <SortHeader
                        column="monthly_goal"
                        sort={sort}
                        searchParams={params}
                      />
                    </th>
                    <th className="px-4 py-3">
                      <SortHeader column="role" sort={sort} searchParams={params} />
                    </th>
                    <th className="px-4 py-3">
                      <SortHeader
                        column="is_active"
                        sort={sort}
                        searchParams={params}
                      />
                    </th>
                    <th className="px-4 py-3">
                      <SortHeader
                        column="created_at"
                        sort={sort}
                        searchParams={params}
                      />
                    </th>
                    <th className="px-4 py-3 font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((user) => (
                    <tr key={user.id} className="transition hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-950">
                        {displayValue(user.full_name)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {displayValue(user.nickname)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {displayValue(user.username)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {displayValue(user.phone)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatCompanyBusinessArea(user.business_area)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {user.business_area === "legal"
                          ? formatLegalUserRole(user.legal_role)
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {user.business_area === "commercial" && user.role === "seller"
                          ? formatMonthlyGoal(user.monthly_goal)
                          : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <UserRoleBadge role={user.role} />
                      </td>
                      <td className="px-4 py-3">
                        <UserStatusBadge isActive={user.is_active} />
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatDateTime(user.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {canEditTarget(role, user.role) ? (
                            <Link
                              href={`/usuarios/${user.id}/editar`}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              Editar
                            </Link>
                          ) : (
                            <span className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-500">
                              Somente leitura
                            </span>
                          )}
                          {canEditTarget(role, user.role) ? (
                            <UserToggleStatusButton
                              userId={user.id}
                              isActive={user.is_active}
                            />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!users.length ? (
                    <tr>
                      <td className="px-4 py-6 text-center text-slate-500" colSpan={11}>
                        Nenhum usuário encontrado.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        )}
        </details>
      </div>
    </>
  );
}
