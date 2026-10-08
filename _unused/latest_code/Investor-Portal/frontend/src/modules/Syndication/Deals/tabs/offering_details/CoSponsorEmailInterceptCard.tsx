import { useCallback, useEffect, useId, useState } from "react"
import { toast } from "../../../../../common/components/Toast"
import {
  patchCoSponsorEmailIntercept,
  fetchCoSponsorEmailIntercept,
  type CoSponsorEmailIntercept,
} from "../../api/dealsApi"

interface CoSponsorEmailInterceptCardProps {
  dealId: string
}

export function CoSponsorEmailInterceptCard({
  dealId,
}: CoSponsorEmailInterceptCardProps) {
  const baseId = useId()
  const questionId = `${baseId}-question`
  const [loaded, setLoaded] = useState(false)
  const [applicable, setApplicable] = useState(false)
  const [value, setValue] = useState<CoSponsorEmailIntercept>("yes")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const id = dealId.trim()
    if (!id) return
    let cancelled = false
    setLoaded(false)
    void fetchCoSponsorEmailIntercept(id).then((result) => {
      if (cancelled) return
      setApplicable(result.applicable)
      if (result.intercept) setValue(result.intercept)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [dealId])

  const onChange = useCallback(
    async (next: CoSponsorEmailIntercept) => {
      if (next === value || saving) return
      const previous = value
      setValue(next)
      setSaving(true)
      const result = await patchCoSponsorEmailIntercept(dealId.trim(), next)
      setSaving(false)
      if (!result.ok) {
        setValue(previous)
        toast.error("Could not save intercept", result.message)
        return
      }
      setValue(result.intercept)
      toast.success(
        "Intercept saved",
        result.intercept === "yes"
          ? "Lead-sponsor emails will go to you and your investors."
          : "Lead-sponsor emails will go to you only. You can later send the same template to your investors.",
      )
    },
    [dealId, saving, value],
  )

  if (!loaded || !applicable) return null

  const yesId = `${baseId}-yes`
  const noId = `${baseId}-no`

  return (
    <section
      className="deal_offering_cosponsor_intercept"
      aria-labelledby={questionId}
    >
      <div className="deal_offering_cosponsor_intercept_head">
        <span
          className={`deal_offering_cosponsor_intercept_badge${
            value === "yes"
              ? " deal_offering_cosponsor_intercept_badge_yes"
              : " deal_offering_cosponsor_intercept_badge_no"
          }`}
        >
          {value === "yes" ? "No intercept" : "Yes intercept"}
        </span>
      </div>
      <p className="deal_offering_cosponsor_intercept_question" id={questionId}>
        Do you want to intercept emails the lead sponsor sends for this deal?
      </p>
      <p className="deal_offering_cosponsor_intercept_help">
        This setting applies only to you on this deal. No intercept sends
        lead-sponsor emails to you and your investors. Yes intercept sends those
        emails to you only; you can later send the same template to your
        investors.
      </p>
      <div
        className="deal_offering_cosponsor_intercept_choices"
        role="radiogroup"
        aria-labelledby={questionId}
      >
        <label className="deal_offering_cosponsor_intercept_choice" htmlFor={yesId}>
          <input
            id={yesId}
            type="radio"
            name={`${baseId}-intercept`}
            checked={value === "yes"}
            disabled={saving}
            onChange={() => void onChange("yes")}
          />
          <span>No intercept</span>
        </label>
        <label className="deal_offering_cosponsor_intercept_choice" htmlFor={noId}>
          <input
            id={noId}
            type="radio"
            name={`${baseId}-intercept`}
            checked={value === "no"}
            disabled={saving}
            onChange={() => void onChange("no")}
          />
          <span>Yes intercept</span>
        </label>
      </div>
    </section>
  )
}
