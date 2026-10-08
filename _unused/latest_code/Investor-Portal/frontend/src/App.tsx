import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import "./App.css";
import "./common/theme/portal-tabs.css";
import { ThemeProvider } from "./common/theme/ThemeProvider";
import { SESSION_BEARER_KEY } from "./common/auth/sessionKeys";
import { LpInvestorShellGuard } from "@/modules/Investing";
import { RequireAuth } from "./common/auth/RequireAuth";
import {
  canAccessCompanyPage,
  isDealSponsorSessionUser,
  isLpInvestorSessionUser,
  isPlatformAdmin,
} from "./common/auth/roleUtils";
import PlatformMetricsPage from "./modules/Syndication/PlatformMetrics/PlatformMetricsPage";
import SigninPage from "./modules/auth/pages/SigninPage";
import SignupPage from "./modules/auth/pages/SignupPage";
import DealInvitePage from "./modules/auth/pages/DealInvitePage";
import ForgotPasswordPage from "./modules/auth/pages/ForgotPasswordPage";
import ResetPasswordPage from "./modules/auth/pages/ResetPasswordPage";
import PrivacyPolicy from "./modules/auth/components/PrivacyPolicy";
import TermsService from "./modules/auth/components/TermsService";
import PageNotFound from "./common/PageNotFound";
import { PageLayout } from "./common/layout/PageLayout";
import SponsorDashboardPage from "./modules/Syndication/Dashboard/SponsorDashboardPage";
import DealsLayout from "./modules/Syndication/Deals/DealsLayout";
import { CreateDealPage } from "./modules/Syndication/Deals/deal_create/CreateDealPage";
import { AddDealAssetPage } from "./modules/Syndication/Deals/AddDealAssetPage";
import { ClassSetupPage } from "./modules/Syndication/Deals/class-setup";
import { DistributionSetupPage } from "./modules/Syndication/Deals/distribution-setup";
import { DistributionDetailsPage } from "./modules/Syndication/Deals/tabs/distributions/DistributionDetailsPage";
// import { DealInvestorDistributionsPage } from "./modules/Syndication/Deals/tabs/investors/DealInvestorDistributionsPage";
import {
  RedirectLegacyAddInvestorClass,
  RedirectLegacyEditInvestorClass,
} from "./modules/Syndication/Deals/class-setup/RedirectLegacyInvestorClassRoutes";
import { DealDetailPage } from "./modules/Syndication/Deals/DealDetailPage";
import { DealOfferingPortfolioPage } from "./modules/Syndication/Deals/DealOfferingPortfolioPage";
import { DealsListPage } from "./modules/Syndication/Deals/DealsListPage";
import Opportunities from "@/modules/Investing/pages/opportunities/Opportunities";
import InvestmentsPage from "@/modules/Investing/pages/investments/InvestmentsPage";
import InvestmentDetailPage from "@/modules/Investing/pages/investments/InvestmentDetailPage";
import InvestorCashflowsPage from "@/modules/Investing/pages/InvestorCashflowsPage";
import InvestorDistributionDetailsPage from "@/modules/Investing/pages/investments/InvestorDistributionDetailsPage";
import InvestmentEsignSignGate from "@/modules/Investing/pages/investments/InvestmentEsignSignGate";
import DealInvestNowPage from "@/modules/Investing/pages/invest/DealInvestNowPage";
import InvestingProfilesPage from "@/modules/Investing/pages/profiles/InvestingProfilesPage";
import { AddInvestorProfilePage } from "@/modules/Investing/pages/profiles/AddInvestorProfilePage";
import { EditInvestorProfilePage } from "@/modules/Investing/pages/profiles/EditInvestorProfilePage";
import { WorkInProgressPage } from "./common/components/WorkInProgressPage";
import { InvestorEmailsPage } from "./modules/Syndication/InvestorEmails/InvestorEmailsPage";
import { ReportingPage } from "./modules/Syndication/Reporting/ReportingPage";
import CompanyPage from "./modules/Syndication/company/CompanyPage";
import CompanyMembersPage from "./modules/Syndication/company/CompanyMembersPage";
import CompanyDealsPage from "./modules/Syndication/company/CompanyDealsPage";
import CustomerCompanyLayout from "./modules/Syndication/company/CustomerCompanyLayout";
import MembersLayout from "./modules/Syndication/usermanagement/MembersLayout";
import { UserManagementPage } from "./modules/Syndication/usermanagement/UserManagementPage";
import ContactsPage from "./modules/Syndication/contacts/ContactsPage";
import ContactDetailPage from "./modules/Syndication/contacts/ContactDetailPage";
import EmailTemplatesPage from "./modules/Syndication/contacts/EmailTemplatesPage";
import EmailTemplateNewPage from "./modules/Syndication/contacts/EmailTemplateNewPage";
import CrmPage from "./modules/Syndication/contacts/CrmPage";
import CrmOverviewPage from "./modules/Syndication/contacts/CrmOverviewPage";
import CrmSectionPlaceholderPage from "./modules/Syndication/contacts/CrmSectionPlaceholderPage";
import CreateReusableTemplatePage from "./modules/Syndication/Templates/CreateReusableTemplatePage";
import { usePortalMode } from "./modules/Investing/context/PortalModeContext";
import { MyAccountLayout } from "./modules/myaccount/MyAccountLayout";
import { MyAccountCompanyPage } from "./modules/myaccount/MyAccountCompanyPage";
import { MyAccountPersonalPage } from "./modules/myaccount/MyAccountPersonalPage";
import { MyAccountPasswordPage } from "./modules/myaccount/MyAccountPasswordPage";
import { CompanyOverview } from "./modules/Investing/pages/company_overview/CompanyOverview";
import Landing_Page from "./modules/Landing_Page/Landing_Page";
import ClassicLandingPage from "./modules/Landing_Page/pages/ClassicLandingPage";
import { NotificationsPage } from "@/modules/notifications";

type PlaceholderPageProps = {
  title: string;
};

const PlaceholderPage = ({ title }: PlaceholderPageProps) => {
  return (
    <section className="section_placeholder">
      <h3>{title}</h3>
    </section>
  );
};

function CompanyRoute() {
  const token = sessionStorage.getItem(SESSION_BEARER_KEY);
  if (!token) return <Navigate to="/signin" replace />;
  if (!canAccessCompanyPage()) return <Navigate to="/account" replace />;
  return <CompanyPage />;
}

/** Syndication workspace settings; investing portal opens My account instead. */
function SettingsRoute() {
  const { mode } = usePortalMode();
  const location = useLocation();
  const token = sessionStorage.getItem(SESSION_BEARER_KEY);
  if (!token) return <Navigate to="/signin" replace />;
  if (mode === "investing" || isLpInvestorSessionUser()) {
    return <Navigate to="/account" replace />;
  }
  const billing = new URLSearchParams(location.search).get("billing");
  const leadSponsorPaying =
    billing === "pay" && isDealSponsorSessionUser();
  if (!canAccessCompanyPage() && !leadSponsorPaying) {
    return <Navigate to="/account" replace />;
  }
  return <CompanyPage />;
}

/** /company (investing nav) — LPs and others without workspace company access get WIP, not the dashboard. */
// function CompanyOverviewRoute() {
//   const token = sessionStorage.getItem(SESSION_BEARER_KEY);
//   if (!token) return <Navigate to="/signin" replace />;
//   if (!canAccessCompanyPage())
//     return <Navigate to="/investing/company" replace />;
//   return <CompanyPage />;
// }

function CustomersRoute() {
  const token = sessionStorage.getItem(SESSION_BEARER_KEY);
  if (!token) return <Navigate to="/signin" replace />;
  if (!canAccessCompanyPage()) return <Navigate to="/dashboard" replace />;
  if (!isPlatformAdmin()) {
    return <Navigate to="/settings" replace />;
  }
  return <CompanyPage variant="customers" />;
}

function MetricsRoute() {
  const token = sessionStorage.getItem(SESSION_BEARER_KEY);
  if (!token) return <Navigate to="/signin" replace />;
  if (!isPlatformAdmin()) {
    return <Navigate to="/dashboard" replace />;
  }
  return <PlatformMetricsPage />;
}

/** Match React Router to Vite `base` (`import.meta.env.BASE_URL`) for subpath deploys. */
function routerBasename(): string | undefined {
  const raw = import.meta.env.BASE_URL ?? "/";
  if (raw === "/" || raw === "./") return undefined;
  const trimmed = raw.replace(/\/+$/, "");
  return trimmed || undefined;
}

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter basename={routerBasename()}>
        <Routes>
          <Route path="/" element={<Landing_Page />} />
          <Route path="/landing-classic" element={<ClassicLandingPage />} />
          <Route
            path="/investing/investments/:investmentId/esign"
            element={<InvestmentEsignSignGate />}
          />
          <Route element={<RequireAuth />}>
            <Route element={<LpInvestorShellGuard />}>
            <Route element={<PageLayout />}>
              <Route path="metrics" element={<MetricsRoute />} />
              <Route path="dashboard" element={<SponsorDashboardPage />} />
            <Route path="deals" element={<DealsLayout />}>
              <Route index element={<DealsListPage />} />
              <Route path="investor-emails" element={<InvestorEmailsPage />} />
              <Route path="reporting" element={<ReportingPage />} />
              {/* <Route path="company_overview" element = {<Com} */}
              <Route path="create" element={<CreateDealPage />} />
              <Route
                path=":dealId/offering-portfolio"
                element={<DealOfferingPortfolioPage />}
              />
              <Route
                path=":dealId/class-setup"
                element={<ClassSetupPage />}
              />
              <Route
                path=":dealId/distribution-setup"
                element={<DistributionSetupPage />}
              />
              <Route
                path=":dealId/distributions/:distributionId"
                element={<DistributionDetailsPage />}
              />
              {/* Separate investor distributions page — commented; investor click uses popup for now.
              <Route
                path=":dealId/investors/:investorId/distributions"
                element={<DealInvestorDistributionsPage />}
              />
              */}
              <Route
                path=":dealId/investor-classes/new"
                element={<RedirectLegacyAddInvestorClass />}
              />
              <Route
                path=":dealId/investor-classes/:classId/edit"
                element={<RedirectLegacyEditInvestorClass />}
              />
              <Route
                path=":dealId/assets/:assetId/edit"
                element={<AddDealAssetPage />}
              />
              <Route
                path=":dealId/assets/new"
                element={<AddDealAssetPage />}
              />
              <Route path=":dealId/invest" element={<DealInvestNowPage />} />
              <Route path=":dealId" element={<DealDetailPage />} />
            </Route>
            <Route
              path="leads"
              element={
                <WorkInProgressPage
                  title="Leads"
                  backTo="/dashboard"
                  backLabel="Dashboard"
                />
              }
            />
            <Route path="investing/opportunities" element={<Opportunities />} />
            <Route
              path="investing/investments/:investmentId/distributions/:distributionId"
              element={<InvestorDistributionDetailsPage />}
            />
            <Route
              path="investing/investments/:investmentId"
              element={<InvestmentDetailPage />}
            />
            <Route path="investing/investments" element={<InvestmentsPage />} />
            <Route
              path="investing/documents"
              element={
                <WorkInProgressPage
                  title="Documents"
                  backTo="/dashboard"
                  backLabel="Dashboard"
                />
              }
            />
            <Route path="investing/company" element={<CompanyOverview />} />
            <Route
              path="investing/company_overview"
              element={<Navigate to="/investing/company" replace />}
            />
            <Route
              path="investing/profiles/add"
              element={<AddInvestorProfilePage />}
            />
            <Route
              path="investing/profiles/:profileId/edit"
              element={<EditInvestorProfilePage />}
            />
            <Route path="investing/profiles" element={<InvestingProfilesPage />} />
            <Route
              path="investing/dashboard"
              element={<Navigate to="/dashboard" replace />}
            />
            <Route
              path="investing/deals"
              element={<Navigate to="/investing/investments" replace />}
            />
            <Route
              path="investing/settings"
              element={<Navigate to="/account" replace />}
            />
            <Route
              path="investing/feedback"
              element={
                <WorkInProgressPage
                  title="Feedback"
                  backTo="/dashboard"
                  backLabel="Dashboard"
                />
              }
            />
            <Route
              path="investing/cashflows"
              element={<InvestorCashflowsPage />}
            />
            <Route path="account" element={<MyAccountLayout />}>
              <Route index element={<Navigate to="/account/company" replace />} />
              <Route path="company" element={<MyAccountCompanyPage />} />
              <Route path="personal" element={<MyAccountPersonalPage />} />
              <Route path="password" element={<MyAccountPasswordPage />} />
            </Route>
            <Route
              path="refer-a-friend"
              element={<PlaceholderPage title="Refer a friend" />}
            />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="support" element={<PlaceholderPage title="Support" />} />
            <Route path="settings" element={<SettingsRoute />} />
            <Route path="company" element={<CompanyRoute />} />
    
                        {/* <Route path="company" element={<CompanyOverviewRoute />} /> */}

            <Route path="customers/:companyId" element={<CustomerCompanyLayout />}>
              <Route
                index
                element={<Navigate to="members" replace />}
              />
              <Route path="members" element={<CompanyMembersPage />} />
              <Route path="deals" element={<CompanyDealsPage />} />
            </Route>
            <Route path="customers" element={<CustomersRoute />} />
            <Route path="members" element={<MembersLayout />}>
              <Route index element={<UserManagementPage />} />
            </Route>
            <Route
              path="contacts/email-templates/new"
              element={<EmailTemplateNewPage />}
            />
            <Route
              path="contacts/email-templates/edit/:templateId"
              element={<EmailTemplateNewPage />}
            />
            <Route path="contacts/email-templates" element={<EmailTemplatesPage />} />
            <Route path="contacts/overview" element={<CrmOverviewPage />} />
            <Route path="contacts/crm" element={<CrmPage />} />
            <Route
              path="contacts/pipeline"
              element={
                <CrmSectionPlaceholderPage
                  title="Pipeline"
                  description="Track soft commits and move prospects through your capital raise stages."
                />
              }
            />
            <Route
              path="contacts/inbox"
              element={
                <CrmSectionPlaceholderPage
                  title="Inbox"
                  description="Emails and texts from campaigns land here — replies stay in one thread."
                />
              }
            />
            <Route
              path="contacts/campaigns"
              element={
                <CrmSectionPlaceholderPage
                  title="Campaigns"
                  description="Nurture drips and outbound campaigns for leads, prospects, and investors."
                />
              }
            />
            <Route
              path="contacts/meetings"
              element={
                <CrmSectionPlaceholderPage
                  title="Meetings"
                  description="Schedule and track investor calls without leaving the portal."
                />
              }
            />
            <Route
              path="contacts/pages"
              element={
                <CrmSectionPlaceholderPage
                  title="Pages & Branding"
                  description="Landing pages and brand settings that feed contacts into your CRM."
                />
              }
            />
            <Route
              path="contacts/import"
              element={
                <CrmSectionPlaceholderPage
                  title="Import"
                  description="Bring contacts from spreadsheets, forms, or connected CRMs."
                />
              }
            />
            <Route
              path="contacts/investor-view"
              element={
                <CrmSectionPlaceholderPage
                  title="Investor view"
                  description="Preview how investors experience your outreach and portal messaging."
                />
              }
            />
            <Route path="contacts/:contactId" element={<ContactDetailPage />} />
            <Route path="contacts" element={<ContactsPage />} />
            <Route path="templates/new" element={<CreateReusableTemplatePage />} />
            {/* <Route path="templates" element={<ReusableTemplatesPage />} /> */}
            </Route>
            </Route>
          </Route>
          <Route
            path="/offering_portfolio"
            element={<DealOfferingPortfolioPage />}
          />
          <Route path="/signin" element={<SigninPage />} />
          <Route path="/deal-invite" element={<DealInvitePage />} />
          <Route path="/signup/:token" element={<SignupPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgotPassword" element={<ForgotPasswordPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/resetPassword" element={<ResetPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/termsandservices" element={<TermsService />} />
          <Route path="/privacypolicy" element={<PrivacyPolicy />} />
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
