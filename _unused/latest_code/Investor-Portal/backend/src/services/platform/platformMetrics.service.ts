import { sql } from "drizzle-orm";
import { db } from "../../database/db.js";
import {
  addDealForm,
  companies,
  contact,
  dealInvestment,
  dealLpInvestor,
  userInvestorProfiles,
  users,
} from "../../schema/schema.js";

export type PlatformMetrics = {
  companyCount: number;
  activeCompanyCount: number;
  suspendedCompanyCount: number;
  userCount: number;
  dealCount: number;
  contactCount: number;
  investmentCount: number;
  lpInvestorCount: number;
  investorProfileCount: number;
  totalCommittedUsd: number;
  usersByRole: { role: string; count: number }[];
};

export async function getPlatformMetrics(): Promise<PlatformMetrics> {
  const [
    companyRows,
    userCountRow,
    dealCountRow,
    contactCountRow,
    investmentCountRow,
    lpInvestorCountRow,
    investorProfileCountRow,
    committedRow,
    roleRows,
  ] = await Promise.all([
    db
      .select({
        status: companies.status,
        cnt: sql<number>`count(*)::int`,
      })
      .from(companies)
      .groupBy(companies.status),
    db.select({ cnt: sql<number>`count(*)::int` }).from(users),
    db.select({ cnt: sql<number>`count(*)::int` }).from(addDealForm),
    db.select({ cnt: sql<number>`count(*)::int` }).from(contact),
    db.select({ cnt: sql<number>`count(*)::int` }).from(dealInvestment),
    db.select({ cnt: sql<number>`count(*)::int` }).from(dealLpInvestor),
    db.select({ cnt: sql<number>`count(*)::int` }).from(userInvestorProfiles),
    db
      .select({
        total: sql<string>`coalesce(sum(
          nullif(
            regexp_replace(${dealInvestment.commitmentAmount}, '[^0-9.-]', '', 'g'),
            ''
          )::numeric
        ), 0)`,
      })
      .from(dealInvestment),
    db
      .select({
        role: users.role,
        cnt: sql<number>`count(*)::int`,
      })
      .from(users)
      .groupBy(users.role)
      .orderBy(sql`count(*) desc`),
  ]);

  let companyCount = 0;
  let activeCompanyCount = 0;
  let suspendedCompanyCount = 0;
  for (const row of companyRows) {
    const n = Number(row.cnt) || 0;
    companyCount += n;
    const status = String(row.status ?? "").trim().toLowerCase();
    if (status === "active") activeCompanyCount += n;
    else if (status === "suspended") suspendedCompanyCount += n;
  }

  const totalCommittedUsd = Number(committedRow[0]?.total ?? 0);

  return {
    companyCount,
    activeCompanyCount,
    suspendedCompanyCount,
    userCount: Number(userCountRow[0]?.cnt ?? 0),
    dealCount: Number(dealCountRow[0]?.cnt ?? 0),
    contactCount: Number(contactCountRow[0]?.cnt ?? 0),
    investmentCount: Number(investmentCountRow[0]?.cnt ?? 0),
    lpInvestorCount: Number(lpInvestorCountRow[0]?.cnt ?? 0),
    investorProfileCount: Number(investorProfileCountRow[0]?.cnt ?? 0),
    totalCommittedUsd: Number.isFinite(totalCommittedUsd) ? totalCommittedUsd : 0,
    usersByRole: roleRows.map((r) => ({
      role: String(r.role ?? "").trim() || "unknown",
      count: Number(r.cnt) || 0,
    })),
  };
}
