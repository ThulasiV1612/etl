import type { LucideIcon } from "lucide-react";
import "./card_radio_group.css";

export type CardRadioOption = {
  value: string;
  label: string;
  icon: LucideIcon;
};

type Props = {
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: CardRadioOption[];
  /** Accessible name for the radiogroup when not using `ariaLabelledBy`. */
  ariaLabel?: string;
  /** Id of visible label element (settings rows). */
  ariaLabelledBy?: string;
  disabled?: boolean;
};

export function CardRadioGroup({
  name,
  value,
  onChange,
  options,
  ariaLabel,
  ariaLabelledBy,
  disabled = false,
}: Props) {
  const groupClass = [
    "card_radio_group",
    options.length === 2 ? "card_radio_group_binary" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={groupClass}
      role="radiogroup"
      aria-label={ariaLabelledBy ? undefined : ariaLabel}
      aria-labelledby={ariaLabelledBy}
    >
      {options.map((opt) => {
        const selected = value === opt.value;
        const Icon = opt.icon;
        return (
          <label
            key={opt.value}
            className={`card_radio_card${selected ? " card_radio_card_selected" : ""}`}
          >
            <input
              type="radio"
              className="card_radio_input"
              name={name}
              value={opt.value}
              checked={selected}
              disabled={disabled}
              onChange={() => onChange(opt.value)}
            />
            <span className="card_radio_card_radio" aria-hidden />
            <Icon className="card_radio_card_icon" size={18} strokeWidth={1.75} aria-hidden />
            <span className="card_radio_card_label">{opt.label}</span>
          </label>
        );
      })}
    </div>
  );
}
