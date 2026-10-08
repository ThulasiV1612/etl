import { FileSignature } from "lucide-react"
import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { InvestmentEsignSignModal } from "./InvestmentEsignSignModal"
import "./investment-esign-sign.css"

export function InvestmentEsignSignPage() {
  const { investmentId = "" } = useParams<{ investmentId: string }>()
  const dealId = decodeURIComponent(investmentId.trim())
  const navigate = useNavigate()
  const [modalOpen, setModalOpen] = useState(true)

  const investmentPath = `/investing/investments/${encodeURIComponent(dealId)}`
  const documentsPath = `${investmentPath}?tab=documents`

  const handleClose = () => {
    setModalOpen(false)
    navigate(documentsPath, { replace: true })
  }

  const handleSignedComplete = (result: { esignCompleted: boolean }) => {
    if (result.esignCompleted) {
      navigate("/investing/investments", { replace: true })
      return
    }
    navigate(documentsPath, { replace: true })
  }

  if (!dealId) {
    return (
      <div className="deal_esign_sign_page">
        <p className="deal_esign_notice deal_esign_notice--error">Invalid link.</p>
      </div>
    )
  }

  return (
    <div className="deal_esign_sign_page">
      <div className="um_panel deals_list_card_surface deal_esign_sign_card">
        <h1 className="um_section_title um_title_with_icon">
          <FileSignature size={22} strokeWidth={2} aria-hidden />
          <span>Sign documents</span>
        </h1>
        <p className="deal_esign_lead">
          Your signing window opens in a popup. If it did not appear, use the button
          below.
        </p>
        <div className="deal_esign_sign_actions">
          <button
            type="button"
            className="um_btn_primary"
            onClick={() => setModalOpen(true)}
          >
            <FileSignature size={16} strokeWidth={2} aria-hidden />
            Open signing
          </button>
        </div>
        <p className="deal_esign_sign_back">
          <Link to={documentsPath} className="lpd_link">
            ← Back to documents
          </Link>
        </p>
      </div>

      <InvestmentEsignSignModal
        open={modalOpen}
        dealId={dealId}
        onClose={handleClose}
        onSignedComplete={handleSignedComplete}
      />
    </div>
  )
}

export default InvestmentEsignSignPage
