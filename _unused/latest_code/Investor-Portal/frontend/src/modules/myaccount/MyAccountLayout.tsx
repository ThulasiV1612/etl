import { NavLink, Outlet, useLocation } from "react-router-dom"
import { Building2, LockKeyhole, Settings, UserCircle } from "lucide-react"
import { TabsScrollStrip } from "@/common/components/tabs-scroll-strip/TabsScrollStrip"
import "@/modules/Syndication/Deals/deals-list.css"
import "../Syndication/usermanagement/user_management.css"
import "./my_account.css"

function accountTabClass(isActive: boolean): string {
  return `um_members_tab deals_tabs_tab um_segmented_tab${
    isActive ? " um_members_tab_active" : ""
  }`
}

export function MyAccountLayout() {
  const { pathname } = useLocation()
  const companyActive =
    pathname === "/account/company" || pathname === "/account"
  const personalActive = pathname === "/account/personal"
  const passwordActive = pathname === "/account/password"

  return (
    <section
      className="um_page deals_list_page myaccount_page"
      aria-labelledby="myaccount-page-title"
    >
      <div className="um_members_header_block myaccount_page_header">
        <div className="um_header_row">
          <h2 className="um_title um_title_with_icon" id="myaccount-page-title">
            <Settings
              className="um_title_icon"
              size={26}
              strokeWidth={1.75}
              aria-hidden
            />
            My account
          </h2>
        </div>
      </div>

      <div className="um_members_tabs_outer deals_tabs_outer um_segmented_tabs_outer">
        <TabsScrollStrip scrollClassName="deals_tabs_scroll um_segmented_tabs_scroll">
          <div
            className="um_members_tabs_row deals_tabs_row um_segmented_tabs_row"
            role="tablist"
            aria-label="Account sections"
          >
            <NavLink
              to="/account/company"
              className={accountTabClass(companyActive)}
              role="tab"
              aria-selected={companyActive}
            >
              <Building2
                className="deals_tabs_icon um_segmented_tab_icon"
                size={16}
                strokeWidth={2}
                aria-hidden
              />
              <span className="deals_tabs_label um_segmented_tab_label">
                Company details
              </span>
            </NavLink>
            <NavLink
              to="/account/personal"
              className={accountTabClass(personalActive)}
              role="tab"
              aria-selected={personalActive}
            >
              <UserCircle
                className="deals_tabs_icon um_segmented_tab_icon"
                size={16}
                strokeWidth={2}
                aria-hidden
              />
              <span className="deals_tabs_label um_segmented_tab_label">
                Personal details
              </span>
            </NavLink>
            <NavLink
              to="/account/password"
              className={accountTabClass(passwordActive)}
              role="tab"
              aria-selected={passwordActive}
            >
              <LockKeyhole
                className="deals_tabs_icon um_segmented_tab_icon"
                size={16}
                strokeWidth={2}
                aria-hidden
              />
              <span className="deals_tabs_label um_segmented_tab_label">
                Change password
              </span>
            </NavLink>
          </div>
        </TabsScrollStrip>
      </div>

      <div className="um_members_tab_content myaccount_tab_content">
        <div
          className="um_panel um_members_tab_panel deals_list_card_surface myaccount_form_panel"
          role="tabpanel"
        >
          <Outlet />
        </div>
      </div>
    </section>
  )
}
