import type { FormEvent } from "react"
import { useMemo, useState } from "react"
import { KeyRound, LockKeyhole } from "lucide-react"
import { toast } from "../../common/components/Toast"
import { postChangePassword } from "./accountApi"
import { mergeSessionUserDetails } from "./sessionUser"

const PASSWORD_MIN = 8
const PASSWORD_MAX = 16

export function MyAccountPasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const hasChanges = useMemo(
    () =>
      currentPassword.length > 0 ||
      newPassword.length > 0 ||
      confirmPassword.length > 0,
    [confirmPassword, currentPassword, newPassword],
  )

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!hasChanges || isLoading) return
    setError("")
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.")
      return
    }
    if (
      newPassword.length < PASSWORD_MIN ||
      newPassword.length > PASSWORD_MAX
    ) {
      setError(
        `New password must be between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters.`,
      )
      return
    }
    if (currentPassword === newPassword) {
      setError("New password must be different from your current password.")
      return
    }
    setIsLoading(true)
    try {
      const { user } = await postChangePassword({
        currentPassword,
        newPassword,
      })
      mergeSessionUserDetails(user)
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      toast.success(
        "Password updated",
        "You can use your new password next time you sign in.",
      )
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not change password.",
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="myaccount_form_body">
      <p className="myaccount_readonly_note">
        Use a strong password you do not use elsewhere. Password must be{" "}
        {PASSWORD_MIN}–{PASSWORD_MAX} characters.
      </p>
      {error ? (
        <p className="um_msg_error" role="alert">
          {error}
        </p>
      ) : null}
      <form onSubmit={handleSubmit}>
        <div className="um_field">
          <label
            htmlFor="myaccount-current-password"
            className="um_field_label_row"
          >
            <LockKeyhole className="um_field_label_icon" size={17} aria-hidden />
            <span>Current password</span>
          </label>
          <input
            id="myaccount-current-password"
            name="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(e) => {
              setCurrentPassword(e.target.value)
              if (error) setError("")
            }}
            disabled={isLoading}
            autoComplete="current-password"
            aria-invalid={!!error}
          />
        </div>
        <div className="um_field">
          <label
            htmlFor="myaccount-new-password"
            className="um_field_label_row"
          >
            <LockKeyhole className="um_field_label_icon" size={17} aria-hidden />
            <span>New password</span>
          </label>
          <input
            id="myaccount-new-password"
            name="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value)
              if (error) setError("")
            }}
            disabled={isLoading}
            autoComplete="new-password"
            aria-invalid={!!error}
          />
        </div>
        <div className="um_field">
          <label
            htmlFor="myaccount-confirm-password"
            className="um_field_label_row"
          >
            <LockKeyhole className="um_field_label_icon" size={17} aria-hidden />
            <span>Confirm new password</span>
          </label>
          <input
            id="myaccount-confirm-password"
            name="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value)
              if (error) setError("")
            }}
            disabled={isLoading}
            autoComplete="new-password"
            aria-invalid={!!error}
          />
        </div>
        <div className="myaccount_actions">
          <button
            type="submit"
            className="um_btn_primary"
            disabled={isLoading || !hasChanges}
          >
            {isLoading ? (
              "Updating…"
            ) : (
              <>
                <KeyRound size={16} strokeWidth={2} aria-hidden />
                Update password
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
