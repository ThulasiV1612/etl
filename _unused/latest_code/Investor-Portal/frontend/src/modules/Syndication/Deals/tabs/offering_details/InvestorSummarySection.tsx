import { Loader2, Save } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import Quill from "quill"
import "quill/dist/quill.snow.css"
import { FormHeadingWithInfo } from "../../../../../common/components/form-heading/FormHeadingWithInfo"
import { toast } from "../../../../../common/components/Toast"
import { patchDealInvestorSummary, type DealDetailApi } from "../../api/dealsApi"

type InvestorSummarySectionProps = {
  dealId: string
  initialStoredHtml: string | null | undefined
  onSaved: (deal: DealDetailApi) => void
}

/** Empty until the deal has saved HTML — Quill `placeholder` is the only prefilled cue. */
function seedHtmlFromStored(stored: string | null | undefined): string {
  const t = stored?.trim()
  return t ?? ""
}

/**
 * Snow theme inserts `.ql-toolbar` as a direct child of the wrapper, before `.ql-container`.
 * Remove all such toolbars and reset the host so re-init / Strict Mode never stacks bars.
 */
function removeQuillSnowArtifacts(host: HTMLDivElement | null): void {
  if (!host) return
  const wrap = host.parentElement
  if (wrap) {
    for (const el of wrap.querySelectorAll(":scope > .ql-toolbar")) {
      el.remove()
    }
  }
  host.classList.remove("ql-container", "ql-snow", "ql-bubble", "ql-disabled")
  host.removeAttribute("data-quill-id")
  host.innerHTML = ""
}

export function InvestorSummarySection({
  dealId,
  initialStoredHtml,
  onSaved,
}: InvestorSummarySectionProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const quillRef = useRef<Quill | null>(null)
  const seedRef = useRef(seedHtmlFromStored(initialStoredHtml))
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    const editorEl = editorRef.current
    if (!editorEl) return

    removeQuillSnowArtifacts(editorEl)

    seedRef.current = seedHtmlFromStored(initialStoredHtml)

    const quill = new Quill(editorEl, {
      theme: "snow",
      modules: {
        toolbar: [
          [{ font: [] }, { size: [] }],
          [{ header: [1, 2, 3, false] }],
          ["bold", "italic", "underline", "strike"],
          [{ color: [] }, { background: [] }],
          [{ align: [] }],
          [{ list: "ordered" }, { list: "bullet" }],
          [{ indent: "-1" }, { indent: "+1" }],
          ["link", "image", "video"],
          ["blockquote", "code-block"],
          ["clean"],
        ],
      },
      placeholder: "Summary for all investors…",
    })

    quill.clipboard.dangerouslyPasteHTML(
      seedRef.current,
      Quill.sources.SILENT,
    )
    setDirty(false)

    const onTextChange = () => setDirty(true)
    quill.on("text-change", onTextChange)
    quillRef.current = quill

    return () => {
      quill.off("text-change", onTextChange)
      quillRef.current = null
      removeQuillSnowArtifacts(editorRef.current)
    }
  }, [dealId, initialStoredHtml])

  const handleSave = useCallback(async () => {
    const quill = quillRef.current
    if (!quill || saving) return
    const len = quill.getLength()
    const html =
      len <= 1 && !quill.getText().trim()
        ? ""
        : quill.getSemanticHTML(0, Math.max(0, len - 1))
    setSaving(true)
    try {
      const result = await patchDealInvestorSummary(dealId, html)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      onSaved(result.deal)
      seedRef.current = seedHtmlFromStored(result.deal.investorSummaryHtml)
      setDirty(false)
      toast.success("Summary saved.")
    } finally {
      setSaving(false)
    }
  }, [dealId, onSaved, saving])

  return (
    <div className="deal_offering_summary deal_offering_investor_summary">
      <FormHeadingWithInfo
        as="h3"
        className="deal_offering_investor_summary_title"
        title="Summary for all investors"
        info={
          <p>
            This text appears on the offering preview for investors. Use clear,
            professional formatting. For readability, prefer dark text over very
            bright colors; use bold sparingly for key points.
          </p>
        }
      />
      <div className="deal_offering_quill">
        <div ref={editorRef} className="deal_offering_quill_editor_host" />
      </div>
      <div className="deal_offering_investor_summary_actions">
        <button
          type="button"
          className="um_btn_primary"
          disabled={saving || !dirty}
          onClick={() => void handleSave()}
        >
          {saving ? (
            <>
              <Loader2
                size={16}
                strokeWidth={2}
                className="deal_offering_btn_spin"
                aria-hidden
              />
              <span>Saving…</span>
            </>
          ) : (
            <>
              <Save size={16} strokeWidth={2} aria-hidden />
              <span>Save summary</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
