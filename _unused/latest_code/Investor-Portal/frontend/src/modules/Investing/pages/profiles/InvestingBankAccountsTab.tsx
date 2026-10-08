import { useMemo, useState } from "react"
import { Landmark, Plus } from "lucide-react"
import {
  DataTable,
  type DataTableColumn,
} from "@/common/components/data-table/DataTable"
import type { InvestorSharedConnectBank } from "@/modules/Investing/api/stripeInvestorPaymentsApi"
import { InvestingProfilesTableToolbar } from "./InvestingProfilesTableToolbar"

export type BankAccountTableRow = InvestorSharedConnectBank & {
  id: string
  bankLabel: string
  accountLabel: string
  routingLabel: string
  holderLabel: string
  statusLabel: string
  profilesLabel: string
}

function bankStatusLabel(bank: InvestorSharedConnectBank): string {
  if (bank.payoutsEnabled) return "Ready"
  const slug = bank.status.trim().toLowerCase()
  if (!slug || slug === "not_started") {
    return bank.bankAccount ? "Linked" : "Not set up"
  }
  if (slug === "onboarding" || slug === "pending" || slug === "linked") {
    return bank.payoutsEnabled ? "Ready" : "Setup pending"
  }
  if (slug === "restricted") return "Restricted"
  return bank.status
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function formatSharedBankOptionLabel(
  bank: InvestorSharedConnectBank,
): string {
  const parts = [
    bank.bankAccount?.bankName?.trim() || null,
    bank.bankAccount?.last4 ? `···· ${bank.bankAccount.last4}` : null,
  ].filter(Boolean)
  if (parts.length) return parts.join(" ")
  if (bank.payoutsEnabled) return "Ready bank account"
  return "Bank account on file"
}

export function buildBankAccountTableRows(
  banks: InvestorSharedConnectBank[],
  profileNameById: ReadonlyMap<string, string>,
): BankAccountTableRow[] {
  return banks.map((bank) => {
    const names = bank.profileIds
      .map((id) => profileNameById.get(id)?.trim() || null)
      .filter(Boolean) as string[]
    const bankName = bank.bankAccount?.bankName?.trim() || ""
    return {
      ...bank,
      id: bank.accountId,
      bankLabel: bankName || (bank.accountId ? "Bank account on file" : "—"),
      accountLabel: bank.bankAccount?.last4
        ? `···· ${bank.bankAccount.last4}`
        : bank.accountId
          ? "Pending from Stripe"
          : "—",
      routingLabel: bank.bankAccount?.routingNumber?.trim() || "—",
      holderLabel: bank.bankAccount?.accountHolderName?.trim() || "—",
      statusLabel: bankStatusLabel(bank),
      profilesLabel:
        names.length > 0 ? names.join(", ") : "Not linked to a profile yet",
    }
  })
}

/** Shared ACH bank inventory. Profiles pick a bank on My Profiles. */
export function InvestingBankAccountsTab({
  rows,
  loading,
  setupBusy,
  onAddBank,
  onUpdateBank,
}: {
  rows: BankAccountTableRow[]
  loading?: boolean
  setupBusy?: boolean
  onAddBank: () => void
  onUpdateBank: (row: BankAccountTableRow) => void
}) {
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [
        r.bankLabel,
        r.accountLabel,
        r.routingLabel,
        r.holderLabel,
        r.statusLabel,
        r.profilesLabel,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    )
  }, [rows, query])

  const pagination = useMemo(
    () => ({
      page,
      pageSize,
      totalItems: filtered.length,
      onPageChange: setPage,
      onPageSizeChange: (n: number) => {
        setPageSize(n)
        setPage(1)
      },
      ariaLabel: "Bank accounts table pagination",
    }),
    [page, pageSize, filtered.length],
  )

  const columns: DataTableColumn<BankAccountTableRow>[] = useMemo(
    () => [
      {
        id: "bank",
        header: "Bank",
        colWidth: "13rem",
        sortValue: (r) => r.bankLabel.toLowerCase(),
        cell: (r) => (
          <div className="investing_bank_name_cell">
            <span className="investing_bank_name_cell_title">{r.bankLabel}</span>
            <span className="investing_bank_name_cell_meta">{r.accountLabel}</span>
          </div>
        ),
      },
      {
        id: "routing",
        header: "Routing",
        colWidth: "9rem",
        sortValue: (r) => r.routingLabel.toLowerCase(),
        cell: (r) => r.routingLabel,
      },
      {
        id: "holder",
        header: "Name on account",
        colWidth: "12rem",
        sortValue: (r) => r.holderLabel.toLowerCase(),
        cell: (r) => r.holderLabel,
      },
      {
        id: "status",
        header: "Status",
        colWidth: "8rem",
        sortValue: (r) => r.statusLabel.toLowerCase(),
        cell: (r) => (
          <span
            className={`investing_bank_status investing_bank_status--${
              r.payoutsEnabled
                ? "ready"
                : r.status === "restricted"
                  ? "danger"
                  : r.accountId
                    ? "pending"
                    : "neutral"
            }`}
          >
            {r.statusLabel}
          </span>
        ),
      },
      {
        id: "profiles",
        header: "Used by profiles",
        sortValue: (r) => r.profilesLabel.toLowerCase(),
        cell: (r) => (
          <span className="investing_bank_profiles_cell">{r.profilesLabel}</span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        align: "right",
        colWidth: "8rem",
        thClassName: "um_th_actions",
        tdClassName: "um_td_actions",
        cell: (r) => (
          <button
            type="button"
            className="um_btn_secondary investing_bank_row_action"
            disabled={setupBusy}
            onClick={() => onUpdateBank(r)}
            title="Update this bank account in Stripe"
          >
            <Landmark size={14} aria-hidden />
            Update
          </button>
        ),
      },
    ],
    [onUpdateBank, setupBusy],
  )

  return (
    <>
      <div className="um_members_header_block contacts_inner_header">
        <div className="contacts_toolbar_filters_row">
          <p className="investing_bank_tab_lead">
            Banks available for ACH distributions. Assign a bank to each profile
            on My Profiles.
          </p>
          <button
            type="button"
            className="um_btn_primary contacts_toolbar_add_btn"
            disabled={loading || setupBusy}
            onClick={onAddBank}
          >
            <Plus size={18} strokeWidth={2} aria-hidden />
            Add bank account
          </button>
        </div>
      </div>

      <div
        id="profiles-panel-bank-accounts"
        role="tabpanel"
        aria-labelledby="profiles-tab-bank-accounts"
        className="contacts_main_tab_panel_wrap"
      >
        <div className="um_members_tab_content contacts_main_tab_content_flush">
          <div className="um_panel um_members_tab_panel deals_list_table_panel deals_list_card_surface deal_inv_table_panel investing_profiles_table_panel">
            <InvestingProfilesTableToolbar
              searchValue={query}
              onSearchChange={(v) => {
                setQuery(v)
                setPage(1)
              }}
              searchPlaceholder="Search bank accounts…"
              searchAriaLabel="Search bank accounts"
              searchDisabled={loading}
            />
            <DataTable<BankAccountTableRow>
              visualVariant="members"
              membersTableClassName="um_table_members deal_inv_table investing_profiles_table"
              columns={columns}
              rows={filtered}
              isLoading={Boolean(loading && rows.length === 0)}
              getRowKey={(row) => row.id}
              emptyLabel={
                loading && rows.length === 0
                  ? "Loading bank accounts…"
                  : query.trim()
                    ? "No bank accounts match your search."
                    : "You have not added a bank account yet. Use Add bank account to get started."
              }
              initialSort={{ columnId: "bank", direction: "asc" }}
              pagination={filtered.length > 0 ? pagination : undefined}
            />
          </div>
        </div>
      </div>
    </>
  )
}
