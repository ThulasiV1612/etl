/** SEC / offering registration choices for deal create flow */
export const SEC_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Select SEC type…" },
  { value: "506b", label: "Reg D Rule 506(b)" },
  { value: "506c", label: "Reg D Rule 506(c)" },
  { value: "reg_a", label: "Regulation A (Reg A / Reg A+)" },
  { value: "reg_cf", label: "Regulation Crowdfunding (Reg CF)" },
  { value: "other", label: "Other / not listed" },
];
