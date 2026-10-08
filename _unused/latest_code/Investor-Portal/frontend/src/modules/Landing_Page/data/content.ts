export interface NavLinkItem {
  id: string
  label: string
  sectionId: string
}

export interface BentoCardContent {
  iconName: string
  title: string
  description: string
}

export interface IdentityCardContent {
  title: string
  description: string
}

export interface PlatformHighlightContent {
  iconName: string
  title: string
  description: string
  metric?: string
}

export const brand = {
  name: "SyndicationX",
  tagline: "Ultimate Capital Raising Machine",
  taglineHero: "SyndicationX",
} as const

export const navLinks: NavLinkItem[] = [
  { id: "what-we-do", label: "What We Do", sectionId: "solution" },
  { id: "who-we-serve", label: "Who We Serve", sectionId: "audience" },
  { id: "what-we-are", label: "What We Are", sectionId: "identity" },
  {
    id: "platform-special",
    label: "What’s Special",
    sectionId: "platform-special",
  },
]

/** Navbar CTA — swap for Calendly or another booking URL when ready. */
export const scheduleDemoUrl =
  "mailto:support@syndicationx.com?subject=Schedule%20a%20demo%20%E2%80%93%20SyndicationX"

export const hero = {
  headline: "The Ultimate Capital Raising Machine",
  subheadline:
    "Transforming investor syndication, fundraising, and capital deployment into one seamless institutional-grade platform.",
  primaryCta: "Start Raising & Investing",
  secondaryCta: "Book Webinar",
  trust: [
    "Investor-ready",
    "Institutional workflow",
    // AI not in product yet — was: "AI-powered syndication"
    "Guided syndication workflows",
    "Secure investor portal",
  ],
  floatingCardsTrust: [
    { title: "Investor-ready", value: "$420M+", label: "Syndicated YTD" },
    { title: "Institutional workflow", value: "18 days", label: "From term sheet" },
    { title: "Guided syndication workflows", value: "72", label: "Portal satisfaction" },
    { title: "Secure investor portal", value: "72", label: "Portal satisfaction" },
  ],
  // floatingCards: [
  //   { title: "Live pipeline", value: "$420M+", label: "Syndicated YTD" },
  //   { title: "Avg. close time", value: "18 days", label: "From term sheet" },
  //   { title: "Investor NPS", value: "72", label: "Portal satisfaction" },
  // ],
} as const

export const whatWeDo: BentoCardContent[] = [
  {
    iconName: "TrendingUp",
    title: "Capital Raising Automation",
    description:
      "Orchestrate subscriptions, allocations, and closings with guided workflows built for regulated offerings.",
  },
  {
    iconName: "ContactRound",
    title: "Investor CRM",
    description:
      "A single source of truth for relationships, accreditation status, and engagement across every deal.",
  },
  {
    iconName: "GitBranch",
    title: "Deal Flow Management",
    description:
      "Move opportunities from first look to funded with structured stages, tasks, and audit-ready history.",
  },
  {
    iconName: "MessagesSquare",
    title: "Investor Communication",
    description:
      "Targeted updates, branded emails, and in-portal notices that keep LPs aligned without inbox chaos.",
  },
  {
    iconName: "ShieldCheck",
    title: "Secure Document Sharing",
    description:
      "Vault-grade distribution with permissions, watermarking, and visibility into who viewed what—and when.",
  },
  {
    iconName: "LayoutDashboard",
    title: "Analytics Dashboard",
    description:
      "Real-time fundraising health, cohort performance, and pipeline forecasts for sponsors and IR teams.",
  },
]

export const whoWeServe: BentoCardContent[] = [
  {
    iconName: "Building2",
    title: "Real Estate Syndicators",
    description:
      "Raise programmatically across sponsors, classes, and waterfalls while preserving institutional polish.",
  },
  {
    iconName: "Briefcase",
    title: "Venture Capital Firms",
    description:
      "Coordinate SPVs, side letters, and LP reporting with a workflow engine tuned for velocity and control.",
  },
  {
    iconName: "Sparkles",
    title: "Angel Networks",
    description:
      "Give members a premium portal experience—from discovery through wire—with zero spreadsheet sprawl.",
  },
  {
    iconName: "Landmark",
    title: "Private Equity Firms",
    description:
      "Standardize capital calls, compliance artifacts, and LP communications across funds and strategies.",
  },
  {
    iconName: "PieChart",
    title: "Fund Managers",
    description:
      "Unify investor operations, data rooms, and reporting so your team ships faster closes with less risk.",
  },
  {
    iconName: "Building",
    title: "Institutional Investors",
    description:
      "Review opportunities, execute subscriptions, and monitor positions in one secure, investor-grade home.",
  },
]

export const whatWeAre: IdentityCardContent[] = [
  {
    title: "Investor Portal",
    description:
      "A refined LP experience for documents, capital activity, and communications—without sacrificing security.",
  },
  {
    title: "Fundraising Infrastructure",
    description:
      "Purpose-built rails for offerings, compliance checkpoints, and closing mechanics at enterprise scale.",
  },
  {
    title: "Capital Management System",
    description:
      "Track commitments, wires, and allocations with clarity from first touch through post-close operations.",
  },
  {
    title: "Investor Relationship Platform",
    description:
      "Nurture trust with proactive transparency, structured Q&A, and always-on visibility into the deal.",
  },
  {
    title: "Institutional Workflow Engine",
    description:
      "Automations, approvals, and templates that mirror how sophisticated sponsors actually run a raise.",
  },
]

export const platformSpecial: PlatformHighlightContent[] = [
  {
    iconName: "Zap",
    // AI / LLM features not shipped — prior copy referenced drafting & summarization
    title: "Workflow-accelerated fundraising",
    description:
      "Templates, checklists, and stage gates keep every raise moving with fewer manual handoffs and clearer ownership.",
    metric: "−32% admin hours",
  },
  {
    iconName: "UsersRound",
    title: "Investor targeting & lists",
    description:
      "Surface the right LPs for each mandate using fit signals, history, and mandate metadata—never spray-and-pray.",
    metric: "+28% match rate",
  },
  {
    iconName: "UserPlus",
    title: "Automated onboarding",
    description:
      "KYC/KYB flows, e-sign, and accreditation capture that reduce operational drag without cutting corners.",
    metric: "−41% time-to-ready",
  },
  {
    iconName: "Lock",
    title: "Secure investor vault",
    description:
      "Granular entitlements, immutable audit trails, and encryption in transit and at rest—by design.",
    metric: "SOC-ready posture",
  },
  {
    iconName: "Activity",
    title: "Real-time analytics",
    description:
      "Live funnel health, cohort engagement, and capital pacing so leadership can steer before it’s too late.",
    metric: "Sub-minute refresh",
  },
  {
    iconName: "Workflow",
    title: "Institutional-grade workflows",
    description:
      "Approvals, segregation of duties, and repeatable playbooks that satisfy internal risk and external counsel.",
    metric: "99.95% SLA",
  },
  {
    iconName: "Rocket",
    title: "Fast capital deployment",
    description:
      "From wire instructions to allocation confirmations—tight loops that keep momentum through the finish line.",
    metric: "< 2h median confirm",
  },
]

export const webinarCta = {
  title: "See SyndicationX in action",
  description:
    "Join a live walkthrough with our product team: workflows, security model, and how teams deploy in weeks—not quarters.",
  buttonLabel: "Reserve your seat",
} as const

export const footer = {
  tagline: "Institutional-grade syndication infrastructure for modern capital formation.",
  quickLinks: [
    { label: "What We Do", sectionId: "solution" },
    { label: "Who We Serve", sectionId: "audience" },
    { label: "What We Are", sectionId: "identity" },
    { label: "Platform", sectionId: "platform-special" },
  ],
  resources: [
    { label: "Security overview", href: "#" },
    { label: "Data processing", href: "#" },
    { label: "Investor FAQ", href: "#" },
    { label: "Contact sales", href: "#" },
  ],
  social: [
    { label: "LinkedIn", href: "https://syndicationx.com" },
    { label: "X", href: "https://syndicationx.com" },
  ],
  copyright: "© 2026 SyndicationX. All rights reserved.",
} as const
