import { useMemo } from "react";
import { DropdownSelect } from "../../../../../common/components/dropdown-select";
import {
  getOfferingStatusMeta,
  type OfferingStatusMeta,
  type OfferingStatusSelectOption,
} from "../../utils/offeringOverviewForm";

interface DealOfferingStatusSelectProps {
  id: string;
  value: string;
  options: OfferingStatusSelectOption[];
  onChange: (value: string) => void;
  ariaDescribedBy?: string;
  disabled?: boolean;
}

function StatusIcon({
  meta,
  size = 18,
}: {
  meta: OfferingStatusMeta;
  size?: number;
}) {
  const Icon = meta.icon;
  return (
    <Icon
      size={size}
      strokeWidth={2}
      className={`deal_status_icon deal_status_icon--${meta.tone}`}
      aria-hidden
    />
  );
}

function StatusOptionRow({ meta }: { meta: OfferingStatusMeta }) {
  return (
    <div className="deal_status_option">
      <StatusIcon meta={meta} size={18} />
      <div className="deal_status_option_body">
        <span className="deal_status_option_title">{meta.label}</span>
        {/* <span className="deal_status_option_desc">({meta.description})</span> */}
        {/* <span className="deal_status_option_access">{meta.investorAccess}</span> */}
      </div>
    </div>
  );
}

/* Info panel below dropdown — commented out; re-enable when needed.
function StatusDetailPanel({ meta, id }: { meta: OfferingStatusMeta; id?: string }) {
  return (
    <div id={id} className="deal_status_detail_panel" role="region" ...>
      ...
    </div>
  )
}
*/

function StatusTriggerLabel({ meta }: { meta: OfferingStatusMeta }) {
  return (
    <span className="deal_status_trigger_inner">
      <StatusIcon meta={meta} size={16} />
      <span className="deal_status_trigger_text">{meta.label}</span>
    </span>
  );
}

export function DealOfferingStatusSelect({
  id,
  value,
  options,
  onChange,
  ariaDescribedBy,
  disabled = false,
}: DealOfferingStatusSelectProps) {
  const dropdownOptions = useMemo(
    () =>
      options.map((o) => {
        const meta = getOfferingStatusMeta(o.value);
        const label = meta?.label ?? o.label;
        return {
          value: o.value,
          label,
          labelContent: meta ? <StatusOptionRow meta={meta} /> : label,
        };
      }),
    [options],
  );

  const selectedMeta = getOfferingStatusMeta(value);

  return (
    <div className="deal_status_select_wrap">
      <DropdownSelect
        id={id}
        value={value}
        onChange={onChange}
        options={dropdownOptions}
        placeholder="Select deal status…"
        disabled={disabled}
        ariaDescribedBy={ariaDescribedBy}
        triggerContent={
          selectedMeta ? <StatusTriggerLabel meta={selectedMeta} /> : undefined
        }
        className="deal_status_select"
        triggerClassName="deal_status_select_trigger"
        panelClassName="deal_status_select_panel"
        useFixedPanel
      />
      {/* {selectedMeta ? (
        <StatusDetailPanel meta={selectedMeta} id={detailPanelId} />
      ) : null} */}
    </div>
  );
}

export function DealOfferingStatusReadonly({
  value,
}: {
  value: string | null | undefined;
}) {
  const meta = getOfferingStatusMeta(value);
  if (!meta) {
    return (
      <span className="deal_offering_overview_readonly_value">
        {value?.trim() ? value : "—"}
      </span>
    );
  }
  return (
    <div className="deal_status_select_wrap deal_status_select_wrap--readonly">
      <div className="deal_status_readonly_value">
        <StatusTriggerLabel meta={meta} />
      </div>
      {/* <StatusDetailPanel meta={meta} id={detailPanelId} /> */}
    </div>
  );
}
