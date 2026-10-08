import { Asterisk } from "lucide-react";
import "./input.css";

type InputProps = {
  labelName: string | React.ReactNode;
  id: string;
  icon?: React.ReactNode;
  suffix?: React.ReactNode;
  type?: "text" | "email" | "password" | "number" | "textarea" | "file";
  name: string;
  value: string;
  onChange?: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;
  rows?: number;
  cols?: number;
  placeholder?: string;
  maxLength?: number;
  minLength?: number;
  readOnly?: boolean;
  disabled?: boolean;
  /** Merged with `input_field` on the native input */
  inputClassName?: string;
  required?: boolean;
  /** When false, no mandatory icon is shown next to the label (native `required` unchanged). */
  requiredIndicator?: boolean;
  /** When true, shows “(optional)” beside the label. Defaults to true when not required and `requiredIndicator` is false. */
  optionalIndicator?: boolean;
  "aria-invalid"?: boolean | "true" | "false";
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
};

const Input = ({
  labelName,
  id,
  icon,
  suffix,
  type = "text",
  name,
  value,
  onChange,
  rows = 4,
  cols,
  placeholder,
  maxLength,
  minLength,
  readOnly,
  disabled,
  inputClassName,
  required,
  requiredIndicator = true,
  optionalIndicator,
  "aria-invalid": ariaInvalid,
  inputMode,
  autoComplete,
  ...props
}: InputProps) => {
  const showRequiredMark = Boolean(required) && requiredIndicator;
  const showOptionalMark =
    optionalIndicator ??
    (!required && requiredIndicator === false);
  const inputClass = ["input_field", inputClassName].filter(Boolean).join(" ");
  const inputNode =
    type === "textarea" ? (
      <textarea
        id={id}
        name={name}
        value={value}
        rows={rows}
        cols={cols}
        required={required}
        onChange={onChange}
        className="textarea_field"
        placeholder={placeholder}
        aria-invalid={ariaInvalid}
        maxLength={maxLength}
        readOnly={readOnly}
        disabled={disabled}
        {...props}
      />
    ) : (
      <input
        id={id}
        type={type}
        name={name}
        value={value}
        required={required}
        onChange={onChange}
        className={inputClass}
        placeholder={placeholder}
        aria-invalid={ariaInvalid}
        maxLength={maxLength}
        minLength={minLength}
        readOnly={readOnly}
        disabled={disabled}
        inputMode={inputMode}
        autoComplete={autoComplete}
        {...props}
      />
    )

  return (
    <div className="input_wrapper">
      <label
        htmlFor={id}
        className={
          showRequiredMark
            ? "input_wrapper__label_row"
            : undefined
        }
      >
        <span className="input_wrapper__label_leading">
          {icon && <span className="input_wrapper__label_icon">{icon}</span>}
          <span className="input_wrapper__label_text">
            {labelName}
            {showOptionalMark ? (
              <span className="input_wrapper__optional_mark"> (optional)</span>
            ) : null}
          </span>
        </span>
        {showRequiredMark ? (
          <span
            className="input_wrapper__required_mark"
            title="Required"
            aria-hidden
          >
            <Asterisk
              className="input_wrapper__required_icon"
              size={14}
              strokeWidth={2.5}
              aria-hidden
            />
          </span>
        ) : null}
      </label>

      {type === "textarea" ? (
        inputNode
      ) : suffix ? (
        <div className="input_wrapper__field">{inputNode}{suffix}</div>
      ) : (
        inputNode
      )}
    </div>
  );
};

export default Input;
