import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AtSign,
  Eye,
  Languages,
  Mail,
  PenLine,
  Pencil,
  Send,
  Settings,
  Signature,
  Trash2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FormHeadingWithInfo } from "../../../common/components/form-heading/FormHeadingWithInfo";
import { fetchWorkspaceTabSettings } from "./companyWorkspaceSettingsApi";
import { useDebouncedWorkspaceTabPersist } from "./useWorkspaceTabPersistence";
import "./company-settings-tab.css";
import "./company-email-settings-tab.css";

type Props = {
  companyName: string;
  readOnly?: boolean;
  workspaceCompanyId?: string;
};

/** Shown for From / Reply-to / Notification addresses in the email settings UI */
const PLATFORM_DISPLAY_EMAIL = "platform.admin@example.com";

function EmailSectionHeading({
  id,
  Icon,
  children,
  description,
}: {
  id: string;
  Icon: LucideIcon;
  children: ReactNode;
  description?: string;
}) {
  return (
    <div className="cp_settings_section_head">
      <FormHeadingWithInfo
        as="h3"
        id={id}
        className="cp_settings_h3 cp_settings_h3_with_icon"
        leadingIcon={Icon}
        leadingIconClassName="cp_settings_h3_icon"
        title={children}
        info={description ? <p>{description}</p> : undefined}
      />
    </div>
  );
}

function EmailFieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="cp_settings_field_label um_view_field_head cp_settings_field_head">
      <span className="um_view_field_label">{children}</span>
    </div>
  );
}

export function CompanyEmailSettingsTab(props: Props) {
  const { readOnly = false, workspaceCompanyId } = props;
  const [textDirection, setTextDirection] = useState("ltr");
  const [emailHydrated, setEmailHydrated] = useState(!workspaceCompanyId);

  useEffect(() => {
    if (!workspaceCompanyId) {
      setEmailHydrated(true);
      return;
    }
    let cancelled = false;
    setEmailHydrated(false);
    void (async () => {
      const { ok, payload: p } = await fetchWorkspaceTabSettings(
        workspaceCompanyId,
        "email",
      );
      if (cancelled) return;
      if (ok && typeof p.textDirection === "string") {
        if (p.textDirection === "rtl" || p.textDirection === "ltr") {
          setTextDirection(p.textDirection);
        }
      }
      setEmailHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceCompanyId]);

  const emailPayload = useMemo(
    () => ({ textDirection }),
    [textDirection],
  );

  useDebouncedWorkspaceTabPersist(
    workspaceCompanyId,
    "email",
    readOnly,
    emailHydrated,
    emailPayload,
  );

  return (
    <div className="cp_settings_root cp_email_root">
      <header className="cp_settings_header">
        <h2 className="cp_settings_title">Email settings</h2>
        <p className="cp_settings_page_lead">
          Configure automated investor emails, signatures, sending addresses, and editor
          defaults for this workspace.
        </p>
      </header>

      <fieldset disabled={readOnly} className="cp_email_main_fieldset">
        <legend className="cp_sr_only">Email settings</legend>
        <div className="cp_settings_stack">
          <div className="cp_email_section_row cp_email_section_row_customize">
            <section
              className="cp_settings_section cp_email_action_card"
              aria-labelledby="cp-email-auto"
            >
              <EmailSectionHeading
                id="cp-email-auto"
                Icon={Mail}
                description="Customize the email notifications sent to your company's investors."
              >
                Investor automated emails
              </EmailSectionHeading>
              <div className="cp_email_action_card_body">
                <p className="cp_email_action_card_desc">
                  Configure automated messages investors receive for registrations, investments,
                  and account updates.
                </p>
                <button type="button" className="cp_btn_customize">
                  <Pencil size={16} strokeWidth={2} aria-hidden />
                  Customize email notifications
                </button>
              </div>
            </section>

            <section
              className="cp_settings_section cp_email_action_card"
              aria-labelledby="cp-email-sig"
            >
              <EmailSectionHeading
                id="cp-email-sig"
                Icon={Signature}
                description="Customize the email signatures included in your outbound messages."
              >
                Email signatures
              </EmailSectionHeading>
              <div className="cp_email_action_card_body">
                <p className="cp_email_action_card_desc">
                  Set the signature block appended to outbound workspace emails and notifications.
                </p>
                <button type="button" className="cp_btn_customize">
                  <Pencil size={16} strokeWidth={2} aria-hidden />
                  Customize email signatures
                </button>
              </div>
            </section>
          </div>

          <section
            className="cp_settings_section cp_email_addresses_section"
            aria-labelledby="cp-email-addresses"
          >
            <EmailSectionHeading
              id="cp-email-addresses"
              Icon={AtSign}
              description="From, reply-to, and notification addresses used for workspace email."
            >
              Email addresses
            </EmailSectionHeading>
            <div className="cp_settings_fields">
              <div className="cp_settings_row">
                <div className="cp_settings_label_col">
                  <EmailFieldLabel>&apos;From&apos; email address</EmailFieldLabel>
                </div>
                <div className="cp_settings_control">
                  <div className="cp_settings_value_row">
                    <div className="um_view_field_box cp_settings_readonly_pill cp_email_value_pill">
                      <Mail
                        size={16}
                        strokeWidth={1.75}
                        className="cp_email_value_pill_icon"
                        aria-hidden
                      />
                      {PLATFORM_DISPLAY_EMAIL}
                    </div>
                    <button type="button" className="um_btn_secondary">
                      <Eye size={16} strokeWidth={2} aria-hidden />
                      Preview company email
                    </button>
                  </div>
                </div>
              </div>

              <div className="cp_settings_row">
                <div className="cp_settings_label_col">
                  <EmailFieldLabel>&apos;Reply-to&apos; email address</EmailFieldLabel>
                </div>
                <div className="cp_settings_control">
                  <div className="cp_settings_value_row">
                    <div className="um_view_field_box cp_settings_readonly_pill cp_email_value_pill">
                      <Mail
                        size={16}
                        strokeWidth={1.75}
                        className="cp_email_value_pill_icon"
                        aria-hidden
                      />
                      {PLATFORM_DISPLAY_EMAIL}
                    </div>
                    <button type="button" className="um_btn_secondary cp_settings_edit_btn">
                      <PenLine size={16} strokeWidth={2} aria-hidden />
                      Edit
                    </button>
                  </div>
                </div>
              </div>

              <div className="cp_settings_row">
                <div className="cp_settings_label_col">
                  <EmailFieldLabel>Notification email address</EmailFieldLabel>
                </div>
                <div className="cp_settings_control">
                  <div className="cp_settings_value_row">
                    <div className="um_view_field_box cp_settings_readonly_pill cp_email_value_pill">
                      <Mail
                        size={16}
                        strokeWidth={1.75}
                        className="cp_email_value_pill_icon"
                        aria-hidden
                      />
                      {PLATFORM_DISPLAY_EMAIL}
                    </div>
                    <button type="button" className="um_btn_secondary cp_settings_edit_btn">
                      <PenLine size={16} strokeWidth={2} aria-hidden />
                      Edit
                    </button>
                  </div>
                </div>
              </div>

              <div className="cp_settings_row">
                <div className="cp_settings_label_col">
                  <EmailFieldLabel>Preferred test email recipient address</EmailFieldLabel>
                </div>
                <div className="cp_settings_control">
                  <p className="cp_email_hint">
                    Test emails will be sent to the user who initiates them.
                  </p>
                  <div className="cp_settings_value_row">
                    <div className="cp_media_actions">
                      <button type="button" className="um_btn_secondary cp_settings_edit_btn">
                        <PenLine size={16} strokeWidth={2} aria-hidden />
                        Edit
                      </button>
                      <button type="button" className="um_btn_secondary">
                        <X size={16} strokeWidth={2} aria-hidden />
                        Clear
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="cp_email_section_row">
            <section className="cp_settings_section" aria-labelledby="cp-email-deliver">
              <EmailSectionHeading
                id="cp-email-deliver"
                Icon={Send}
                description="Manage your custom sending domain and deliverability options."
              >
                Email sending &amp; deliverability
              </EmailSectionHeading>
              <div className="cp_settings_fields">
                <div className="cp_settings_row">
                  <div className="cp_settings_label_col">
                    <EmailFieldLabel>Custom sending domain</EmailFieldLabel>
                  </div>
                  <div className="cp_settings_control">
                    <div className="cp_settings_value_row">
                      <div className="cp_media_actions">
                        <button type="button" className="um_btn_secondary">
                          <Settings size={16} strokeWidth={2} aria-hidden />
                          Manage
                        </button>
                        <button type="button" className="um_btn_secondary">
                          <Trash2 size={16} strokeWidth={2} aria-hidden />
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="cp_settings_section" aria-labelledby="cp-email-editor">
              <EmailSectionHeading
                id="cp-email-editor"
                Icon={Languages}
                description="Defaults for the rich-text email editor in this workspace."
              >
                Editor settings
              </EmailSectionHeading>
              <div className="cp_settings_fields">
                <div className="cp_settings_row">
                  <div className="cp_settings_label_col">
                    <EmailFieldLabel>Editor text direction</EmailFieldLabel>
                  </div>
                  <div className="cp_settings_control">
                    <div className="cp_settings_value_row">
                      <select
                        className="um_field_select cp_settings_select cp_settings_input_pill"
                        value={textDirection}
                        onChange={(e) => setTextDirection(e.target.value)}
                        aria-label="Editor text direction"
                      >
                        <option value="ltr">Left to right (most common)</option>
                        <option value="rtl">Right to left</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </fieldset>
    </div>
  );
}
