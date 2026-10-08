import { Link } from 'react-router-dom'

const HUB_STEPS = [
  {
    step: '1',
    title: 'Upload Deal - Step 1',
    detail:
      'Upload Hub → Upload Deal. Step 1 — Deal Details (create the deal). Step 2 — Deal Assets for the selected deal.',
    href: '/etl-upload',
  },
  {
    step: '2',
    title: 'Upload Deal Members - Step 2',
    detail:
      'Upload Hub → Upload Deal Members. Select the deal, then upload members (creates deal_participant users).',
    href: '/etl-upload',
  },
  {
    step: '3',
    title: 'Upload Company Members - Step 3',
    detail: 'Upload Hub → Upload Company Members. Add organization users before investor loads that need them.',
    href: '/etl-upload',
  },
  {
    step: '4',
    title: 'Upload Contacts - Step 4',
    detail: 'Upload Hub → Upload Contacts. Import CRM contacts for the organization so investor matching can resolve.',
    href: '/etl-upload',
  },
  {
    step: '5',
    title: 'Upload Deal Classes - Step 5',
    detail:
      'PDF Classes Mapping generates Class_Mapping_FILLED.xlsx. Then Upload Hub → Upload Deal Classes for the selected deal.',
    href: '/etl/classes',
  },
  {
    step: '6',
    title: 'Upload Investors - Step 6',
    detail:
      'Profile & Investor Mapping generates FILLED Excels. Then Upload Hub → Upload Investors: Step 1 Profile, Step 2 Deal’s Investor.',
    href: '/etl/cash-flow',
  },
  {
    step: '7',
    title: 'Upload Distributions - Step 7',
    detail:
      'Distribution Mapping generates setup / prior files. Then Upload Hub → Upload Distributions: Step 1 Distribution Setup, Step 2 Prior Distributions.',
    href: '/etl/distributions',
  },
]

const WATERFALL_STEPS = [
  {
    title: 'Map waterfall setup',
    detail:
      'After Step 5 (classes) is loaded: Distribution Mapping → Waterfall Setup. Select the deal and upload Class_Mapping_FILLED.xlsx.',
    href: '/etl/distributions',
  },
  {
    title: 'Download FILLED files',
    detail: 'Save ETL_Distribution_Setup_FILLED.xlsx (and payload) from mapFolder/<Deal Name>/.',
  },
  {
    title: 'Load into the deal — Step 7',
    detail:
      'Upload Hub → Upload Distributions - Step 7 → Upload Distribution Setup. Writes waterfall rows into distribution_setup_json.',
    href: '/etl-upload',
  },
  {
    title: 'Result in portal',
    detail: 'Deal → Distribution Setup shows operating / capital waterfall configuration.',
  },
]

const PRIOR_STEPS = [
  {
    title: 'Map paid distributions',
    detail:
      'After Step 6 (investors/investments) is loaded: Distribution Mapping → Prior Distributions (Paid). Upload Cash Flow “distributions paid” or period Payment details Excels.',
    href: '/etl/distributions',
  },
  {
    title: 'Download FILLED files',
    detail: 'Save ETL_Distributions_Paid_FILLED.xlsx / .payload.json (optional if you load the Cash Flow Excel directly).',
  },
  {
    title: 'Load into the deal — Step 7',
    detail:
      'Upload Hub → Upload Distributions - Step 7 → Upload Prior Distributions. Appends priorDistributions; does not replace waterfalls. Acquisition fee + “Distribute 100% to … - summary” also writes Distribution Fee (% Distribution Fee tab).',
    href: '/etl-upload',
  },
  {
    title: 'Result in portal',
    detail:
      'Deal → Distributions table shows name, source, type, deducts from, period dates, payment date, and amounts. Acquisition fee runs also populate Distribution Setup → % Distribution Fee.',
  },
]

const COLUMN_MAP = [
  { column: 'Distribution name', source: 'Distribution memo' },
  { column: 'Source', source: 'operating / capital / fee (Acquisition fee — memo or type; GP class split → distributionFee)' },
  { column: 'Type', source: 'Distribution type' },
  { column: 'Deducts from', source: 'accrued_pref, capital, or fee' },
  { column: 'Period dates', source: 'Period start / end date' },
  { column: 'Payment date', source: 'Payment initiated on' },
  { column: 'Payments', source: 'Net payment + investor lines' },
  {
    column: '% Distribution Fee',
    source:
      'When Distribution type = Acquisition fee and header “Distribute 100% to {Class} - summary” is present → distribution_setup_json.distributionFee',
  },
]

export function EtlPageInfoPage() {
  return (
    <div className="page-info">
      <header className="page-header">
        <div>
          <p className="eyebrow">Guide</p>
          <h1>Page Info</h1>
          <p className="page-description">
            Follow the Upload Hub step order. Mapping pages generate FILLED Excels; Upload Hub
            loads them in Step 1 through Step 7.
          </p>
        </div>
        <Link to="/etl-upload" className="btn btn-primary">
          Open Upload Hub
        </Link>
      </header>

      <section className="card page-info-prereq">
        <h2>Upload Hub order</h2>
        <p className="page-info-lead">
          Complete these in order for each deal. Card labels match Upload Hub: Upload Deal - Step 1,
          Upload Deal Members - Step 2, and so on.
        </p>
        <ol className="page-info-prereq-list">
          {HUB_STEPS.map((item) => (
            <li key={item.step}>
              <span className="page-info-step-num" aria-hidden="true">
                {item.step}
              </span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
                {item.href ? (
                  <Link to={item.href} className="page-info-inline-link">
                    Go →
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="page-info-flows">
        <section className="card page-info-flow">
          <div className="page-info-flow-head">
            <span className="page-info-badge">Path A</span>
            <h2>Waterfall Distribution Setup</h2>
            <p>
              After Step 5. Configures how future cash is allocated. Does not create payment history.
              Load via Upload Distributions - Step 7.
            </p>
          </div>
          <ol className="page-info-steps">
            {WATERFALL_STEPS.map((item, index) => (
              <li key={item.title}>
                <span className="page-info-step-num" aria-hidden="true">
                  {index + 1}
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                  {item.href ? (
                    <Link to={item.href} className="page-info-inline-link">
                      Go →
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="card page-info-flow page-info-flow-accent">
          <div className="page-info-flow-head">
            <span className="page-info-badge page-info-badge-accent">Path B</span>
            <h2>Prior / Paid → Distributions table</h2>
            <p>
              After Step 6. Import already-paid Cash Flow runs. Upload any number of period Excels from
              the <code>Distributions</code> folder (e.g.{' '}
              <code>Horizon Apartments distribution (07-24-2025 - 07-25-2025)_….xlsx</code>). Each
              file becomes one list row; Payment details fill Distribution Details. Load via Upload
              Distributions - Step 7.
            </p>
          </div>
          <ol className="page-info-steps">
            {PRIOR_STEPS.map((item, index) => (
              <li key={item.title}>
                <span className="page-info-step-num" aria-hidden="true">
                  {index + 1}
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                  {item.href ? (
                    <Link to={item.href} className="page-info-inline-link">
                      Go →
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="card">
        <h2>Cash Flow → Distributions table mapping</h2>
        <p className="page-info-lead">
          Headers from Distributions by investment / Payment details map to portal columns:
        </p>
        <div className="page-info-table-wrap">
          <table className="page-info-table">
            <thead>
              <tr>
                <th>Portal column</th>
                <th>Excel source</th>
              </tr>
            </thead>
            <tbody>
              {COLUMN_MAP.map((row) => (
                <tr key={row.column}>
                  <td>{row.column}</td>
                  <td>{row.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card page-info-tips">
        <h2>Quick tips</h2>
        <ul>
          <li>
            <strong>Order matters.</strong> Upload Deal - Step 1 → Deal Members - Step 2 → Company
            Members - Step 3 → Contacts - Step 4 → Deal Classes - Step 5 → Investors - Step 6 →
            Distributions - Step 7.
          </li>
          <li>
            <strong>Map, then load.</strong> PDF Classes Mapping, Profile & Investor Mapping, and
            Distribution Mapping generate FILLED files. Upload Hub loads them on the matching step.
          </li>
          <li>
            <strong>Two different loads in Step 7.</strong> Distribution Setup = waterfall config.
            Prior Distributions = history for the Distributions table.
          </li>
          <li>
            <strong>Priors append.</strong> Re-uploading paid Excel adds runs; it does not wipe
            waterfall setup.
          </li>
          <li>
            <strong>Files live under</strong> <code>python/mapFolder/&lt;Deal Name&gt;/</code> after
            mapping.
          </li>
        </ul>
      </section>
    </div>
  )
}
