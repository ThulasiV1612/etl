import { useMemo } from 'react'
import type { ContactReviewItem, ContactReviewResolveAction } from '../types'

interface ContactReviewModalProps {
  reviews: ContactReviewItem[]
  isResolving?: boolean
  onResolve: (params: {
    reviewId: string
    action: ContactReviewResolveAction
    selectedContactId?: string | null
  }) => Promise<void>
  onClose: () => void
}

function displayValue(value: unknown) {
  const text = String(value ?? '').trim()
  return text || '—'
}

export function ContactReviewModal({
  reviews,
  isResolving = false,
  onResolve,
  onClose,
}: ContactReviewModalProps) {
  const current = reviews[0] || null
  const uploaded = current?.uploadedInvestor || {}
  const candidates = current?.possibleContacts || []
  const isDealMember = uploaded.entityType === 'deal_member'

  const progressLabel = useMemo(() => {
    if (!reviews.length) return '0 remaining'
    return `${reviews.length} remaining`
  }, [reviews.length])

  if (!current) return null

  async function handleAction(
    action: ContactReviewResolveAction,
    selectedContactId?: string | null
  ) {
    if (!current || isResolving) return
    await onResolve({
      reviewId: current.reviewId,
      action,
      selectedContactId,
    })
  }

  return (
    <div className="crm-review-overlay" role="dialog" aria-modal="true">
      <div className="crm-review-modal">
        <div className="crm-review-header">
          <div>
            <p className="eyebrow">CRM</p>
            <h2>{isDealMember ? 'Confirm Deal Member' : 'Review New CRM Contact'}</h2>
            <p className="crm-review-sub">
              {isDealMember
                ? 'Email was matched against the contact table. Confirm the contact to add them to deal members, create a new contact, or skip.'
                : 'Exact match not found. Choose an existing contact, create a new one, or skip. Investor rows are already loaded — this only links the CRM contact.'}
            </p>
          </div>
          <div className="crm-review-progress">{progressLabel}</div>
        </div>

        <div className="crm-review-grid">
          <section className="crm-review-panel">
            <h3>{isDealMember ? 'Uploaded Member' : 'Uploaded Investor'}</h3>
            <dl className="crm-review-fields">
              <div>
                <dt>Full name</dt>
                <dd>{displayValue(uploaded.fullName)}</dd>
              </div>
              <div>
                <dt>First name</dt>
                <dd>{displayValue(uploaded.firstName)}</dd>
              </div>
              <div>
                <dt>Last name</dt>
                <dd>{displayValue(uploaded.lastName)}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{displayValue(uploaded.email)}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{displayValue(uploaded.phone)}</dd>
              </div>
              {isDealMember ? (
                <div>
                  <dt>Deal member role</dt>
                  <dd>{displayValue(uploaded.dealMemberRole || uploaded.role)}</dd>
                </div>
              ) : (
                <div>
                  <dt>Company</dt>
                  <dd>{displayValue(uploaded.company)}</dd>
                </div>
              )}
              {!isDealMember ? (
                <div>
                  <dt>Address</dt>
                  <dd>{displayValue(uploaded.address)}</dd>
                </div>
              ) : null}
              {!isDealMember ? (
                <div>
                  <dt>Investor ID</dt>
                  <dd>{displayValue(uploaded.investorId || uploaded.sourceProfileId)}</dd>
                </div>
              ) : null}
              <div>
                <dt>Deal name</dt>
                <dd>{displayValue(uploaded.dealName)}</dd>
              </div>
              <div>
                <dt>Deal ID</dt>
                <dd>
                  <code>{displayValue(uploaded.dealId)}</code>
                </dd>
              </div>
            </dl>
          </section>

          <section className="crm-review-panel">
            <h3>
              {isDealMember ? 'Matched Contacts' : 'Possible Existing Contacts'}
            </h3>
            {!candidates.length ? (
              <p className="crm-review-empty">
                {isDealMember
                  ? 'No contact found for this email. Create a new contact or skip.'
                  : 'No similar CRM contacts found. Create a new contact or skip.'}
              </p>
            ) : (
              <div className="crm-review-candidates">
                {candidates.map((candidate) => (
                  <article key={candidate.id} className="crm-review-candidate">
                    <div className="crm-review-candidate-top">
                      <strong>{displayValue(candidate.fullName)}</strong>
                      <span className="crm-review-score">
                        Match: {candidate.matchPercent ?? candidate.matchScore ?? 0}%
                      </span>
                    </div>
                    <p className="crm-review-meta">
                      ID: <code>{candidate.id}</code>
                    </p>
                    <p className="crm-review-meta">Email: {displayValue(candidate.email)}</p>
                    <p className="crm-review-meta">Phone: {displayValue(candidate.phone)}</p>
                    {!isDealMember ? (
                      <p className="crm-review-meta">
                        Company: {displayValue(candidate.company)}
                      </p>
                    ) : null}
                    {!isDealMember ? (
                      <p className="crm-review-meta">
                        Address: {displayValue(candidate.address)}
                      </p>
                    ) : null}
                    {candidate.reasons?.length ? (
                      <ul className="crm-review-reasons">
                        {candidate.reasons.map((reason) => (
                          <li key={`${candidate.id}-${reason}`}>✓ {reason}</li>
                        ))}
                      </ul>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={isResolving}
                      onClick={() =>
                        handleAction('EXISTING_CONTACT', candidate.id)
                      }
                    >
                      {isDealMember ? 'Add as Deal Member' : 'Use This Contact'}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="crm-review-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={isResolving}
            onClick={() => handleAction('SKIP_CONTACT')}
          >
            {isDealMember ? 'Skip Member' : 'Skip Contact'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={isResolving}
            onClick={() => handleAction('CREATE_NEW_CONTACT')}
          >
            {isDealMember ? 'Create Contact & Add Member' : 'Create New Contact'}
          </button>
          <button
            type="button"
            className="btn btn-text"
            disabled={isResolving}
            onClick={onClose}
          >
            Review later
          </button>
        </div>
      </div>
    </div>
  )
}
