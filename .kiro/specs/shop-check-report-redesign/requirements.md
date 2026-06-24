# Shop Check Report Redesign - Requirements Document

## Introduction

The Shop Check Report page is a critical dashboard in Gebya retail management app where managers review daily operations, identify issues, and take corrective actions. Currently, the report presents dense information with descriptive text overlays on KPI cards, making it slow to scan and difficult to prioritize action items. This redesign transforms the report into a clean, manager-focused dashboard that emphasizes values, reduces cognitive load, and enables faster decision-making through improved hierarchy, actionable sections, and contextual access to detailed information.

## Glossary

- **Manager**: A user with report-viewing permissions who uses the Shop Check Report to monitor business operations
- **KPI_Card**: A visual component displaying a key performance indicator with icon, title, amount, and action chevron
- **KPI_Detail_Sheet**: A bottom sheet modal that displays comprehensive KPI information, descriptions, and related data
- **Report_Controls**: Time range selector buttons (Today/Week/Month/Custom) and search/filter controls
- **Sticky_Element**: UI component that remains visible during vertical scrolling of page content
- **Action_Bar**: Fixed horizontal bar positioned above bottom navigation containing Filter, Export, and History actions
- **Closing_Check**: Workflow component tracking expected cash vs. actual cash with difference calculation
- **Needs_Attention_Section**: Task-oriented section displaying unresolved issues requiring manager action
- **Dashboard_Insight_Strip**: Summary row at top showing aggregated metrics across selected timeframe
- **Deep_Link**: Navigation URL that directs user to a specific record related to an alert or transaction
- **Session_State**: User preferences and UI state persisted for duration of active app session
- **Section_Expansion_State**: Persisted visual state (expanded/collapsed) of collapsible report sections
- **Overdue_Credit**: Customer credit that has exceeded agreed payment terms
- **Transfer_Review**: Cash or mobile money transfer requiring verification or reconciliation
- **Cash_Difference**: Variance between expected and actual cash recorded during closing check
- **Related_Record**: Specific customer, transfer, or closing review item linked to a report alert

## Requirements

### Requirement 1: Simplified KPI Card Design

**User Story:** As a manager, I want KPI cards to display only essential information without descriptive text, so that I can quickly scan key metrics and understand the data at a glance.

#### Acceptance Criteria

1. WHEN the report is loaded, THE Dashboard_KPI_Card SHALL display exactly four visual elements in this order: Icon, Title, Amount, Chevron
2. THE Dashboard_KPI_Card SHALL NOT display subtitle or descriptive text on the card face
3. WHEN a Manager taps a KPI_Card, THE system SHALL open a KPI_Detail_Sheet without navigating away from the report
4. IF the KPI_Detail_Sheet fails to open due to technical issues, THE system SHALL display an error message with a retry option
5. WHILE the KPI_Detail_Sheet is open, THE original report content SHALL remain visible behind the sheet at reduced opacity (30-50% dimming) and SHALL remain scrollable
6. THE Dashboard_KPI_Card SHALL preserve all existing calculations and business logic for KPI values

#### Edge Cases

- IF the KPI amount is zero, THE card SHALL display "0" in the amount field without special formatting
- IF the KPI amount is negative (e.g., cash difference), THE card SHALL display the negative sign and color-code appropriately
- IF the screen width is less than 360px (extra small phone), THE KPI cards SHALL stack vertically instead of horizontally

---

### Requirement 2: KPI Detail Sheet Functionality

**User Story:** As a manager, I want to access detailed KPI information in a dismissible bottom sheet, so that I can explore context and explanations without losing my place in the main report.

#### Acceptance Criteria

1. WHEN a Manager taps a KPI_Card, THE system SHALL open a KPI_Detail_Sheet containing: KPI title, description, value, and detailed content
2. THE KPI_Detail_Sheet SHALL be dismissible by: tapping outside the sheet, swiping downward, or tapping an X button
3. WHEN the KPI_Detail_Sheet is dismissed, THE Manager's scroll position on the report SHALL be preserved and remain at the exact pixel position from before the sheet opened
4. THE KPI_Detail_Sheet SHALL NOT cover bottom navigation or action bar
5. THE KPI_Detail_Sheet description field SHALL explain the KPI calculation and interpretation
6. WHILE a KPI_Detail_Sheet is open, THE report content behind it SHALL be scrollable by the Manager

#### Edge Cases

- IF the KPI_Detail_Sheet content exceeds available viewport height, THE sheet SHALL support internal scrolling within the content area
- IF a Manager opens multiple KPI sheets rapidly, only the most recent sheet SHALL remain open
- IF the device orientation changes while a sheet is open, THE sheet SHALL adapt to the new layout without dismissing

---

### Requirement 3: Sticky Report Controls

**User Story:** As a manager, I want time range and search controls to remain visible while scrolling through report content, so that I can quickly switch timeframes or filter data without returning to the top.

#### Acceptance Criteria

1. WHEN the Manager scrolls down on the report, THE Report_Controls section (Today/Week/Month/Custom buttons, search bar, staff filter) SHALL remain fixed at the top of the scrollable content area
2. WHILE scrolling, THE Sticky_Report_Controls SHALL NOT cover KPI cards and SHALL NEVER cover the fixed action bar regardless of viewport constraints
3. WHEN a time range button is clicked, THE report SHALL re-filter data and maintain scroll position if possible
4. WHEN the search filter is updated, THE report SHALL apply filter in real-time without page reload
5. WHEN staff filter is changed, THE report SHALL apply filter and update all sections simultaneously
6. IF the viewport is too small to keep controls sticky without covering both KPI cards and the action bar, THE controls SHALL become non-sticky to maintain layout integrity

#### Edge Cases

- IF the device height is less than 600px (small phone), THE sticky controls height SHALL be reduced to maintain content visibility
- IF the Manager selects Custom date range, THE date picker SHALL open without dismissing the sticky controls area
- IF the report has no content for selected filters, THE sticky controls SHALL remain visible and allow easy filter adjustment

---

### Requirement 4: Fixed Action Bar

**User Story:** As a manager, I want a fixed action bar above the bottom navigation that provides Filter, Export, and History actions, so that I can access these functions at any scroll position.

#### Acceptance Criteria

1. THE Action_Bar SHALL be positioned above the bottom navigation bar and visible at all times
2. THE Action_Bar SHALL contain exactly three action buttons: Filter, Export, History
3. WHEN the Manager taps the Filter button, THE system SHALL open a filter modal for report data
4. WHEN the Manager taps the Export button, THE system SHALL generate and download a report file (PDF or CSV), even if other modals or views are open
5. WHEN the Manager taps the History button, THE system SHALL display the HistoryView component showing past reports
6. THE Action_Bar background color SHALL match the report theme (light or dark)

#### Edge Cases

- IF the bottom navigation is hidden, THE Action_Bar SHALL still be positioned above where the navigation would appear
- IF Export fails due to network error, THE system SHALL display a toast error message and allow retry
- IF the screen width is less than 320px, THE action buttons SHALL use icons only (no text labels) to conserve space

---

### Requirement 5: Deep-Link Navigation for Report Alerts

**User Story:** As a manager, I want to tap an alert in the report and navigate directly to the related record, so that I can immediately take action without searching through the app.

#### Acceptance Criteria

1. WHEN an Overdue_Credit alert is displayed in Needs_Attention_Section, tapping it SHALL navigate to the specific customer's credit record
2. WHEN a Transfer_Review alert is displayed, tapping it SHALL navigate to the specific transfer record with all details
3. WHEN a Cash_Difference alert is displayed, tapping it SHALL navigate to the related closing review item or closing check record
4. WHEN the Manager returns from the detail record, THE report view SHALL be restored with the same filters and scroll position
5. THE Deep_Link URL SHALL contain sufficient context to load the exact record without server calls

#### Edge Cases

- IF the Related_Record has been deleted, THE system SHALL display an error message instead of navigating
- IF the Related_Record's customer/staff member has been archived, THE system SHALL still navigate and display archived status
- IF the Manager lacks permissions to view the Related_Record, THE system SHALL display a permission error
- IF navigation fails due to missing record ID, THE system SHALL log the error and display a generic "Record not found" message

---

### Requirement 6: Closing Check Workflow Redesign

**User Story:** As a manager, I want a structured closing check workflow that clearly shows expected vs. actual cash and guides me to complete the review, so that I can reconcile the register efficiently.

#### Acceptance Criteria

1. WHEN the closing check is displayed, THE Closing_Check component SHALL show a clear hierarchy: Expected_Cash → Actual_Cash → Difference
2. THE Closing_Check SHALL display Expected_Cash calculated from sales and expenses
3. THE Closing_Check SHALL display Actual_Cash as the amount counted by the manager
4. THE Closing_Check SHALL calculate and display Difference (Actual - Expected) with color coding (green if balanced, red if variance)
5. WHEN the Manager enters Actual_Cash amount, THE Difference SHALL update in real-time
6. WHEN the Closing_Check is completed, THE Manager SHALL tap "Complete Review" action button
7. WHEN "Complete Review" is tapped, THE system SHALL save the closing check record with timestamp and staff member

#### Edge Cases

- IF Expected_Cash is zero (no transactions), THE Closing_Check SHALL still display the fields with zero values
- IF Actual_Cash cannot be confirmed (e.g., register still open), THE "Complete Review" button SHALL be disabled with a tooltip
- IF a closing check is already in progress, THE system SHALL prompt the manager to resume or restart
- IF the Manager closes the app during closing check, THE partial data SHALL be saved as draft

---

### Requirement 7: Expandable and Collapsible Report Sections

**User Story:** As a manager, I want report sections to be expandable and collapsible, so that I can focus on relevant information and reduce visual clutter.

#### Acceptance Criteria

1. THE report SHALL support collapsible sections: Staff_Sales, Closing_Check, Needs_Attention, Recent_Transactions
2. WHEN a section header is tapped, THE section SHALL toggle between expanded and collapsed states
3. WHEN a section is collapsed, only the section title and item count SHALL be visible
4. WHEN a section is expanded, THE full section content SHALL be displayed smoothly
5. THE Section_Expansion_State SHALL be persisted in Session_State for the duration of the user's session
6. WHEN the Manager navigates away and returns to the report, THE same sections SHALL retain their expanded/collapsed state

#### Edge Cases

- IF a section is empty (zero items), THE section SHALL still be collapsible and display "(0 items)"
- IF multiple sections are expanded, scrolling performance SHALL remain smooth (no lag or jank)
- IF the report refreshes due to data sync, THE Section_Expansion_State SHALL be maintained
- IF the session expires and resumes, THE Section_Expansion_State SHALL NOT persist (reset to defaults)

---

### Requirement 8: Task-Oriented Needs Attention Section

**User Story:** As a manager, I want the Needs_Attention section to prioritize unresolved issues and display actionable information, so that I can quickly address problems.

#### Acceptance Criteria

1. THE Needs_Attention_Section SHALL display items in priority order: unresolved items first, then resolved items
2. EACH item in Needs_Attention_Section SHALL display: Customer_Name, Issue_Type, Amount, and an Action_Button
3. THE Issue_Type SHALL be one of: Overdue_Credit, Transfer_Review, Cash_Difference
4. WHEN the Manager taps an item, THE system SHALL navigate via Deep_Link to the related record
5. WHEN the Manager completes an action on the related record, THE Needs_Attention_Section SHALL be updated (item removed or marked resolved)
6. THE Needs_Attention_Section SHALL display a message "No items requiring attention" when empty

#### Edge Cases

- IF an issue has multiple related items (e.g., same customer with two overdue credits), each SHALL be displayed as separate items
- IF an issue's Related_Record is deleted, THE item SHALL be automatically removed from the section
- IF an issue's status changes (e.g., credit paid), THE system SHALL refresh the section within 2 seconds
- IF the section has more than 10 items, THE system SHALL implement pagination or lazy loading

---

### Requirement 9: Dashboard Insight Strip

**User Story:** As a manager, I want a compact summary row at the top showing aggregated metrics, so that I can understand the overall report scope at a glance.

#### Acceptance Criteria

1. THE Dashboard_Insight_Strip SHALL be displayed at the top of the report, above KPI cards
2. THE Insight_Strip SHALL display: Current timeframe label (e.g., "Today"), Staff filter status (e.g., "All Staff"), and four metrics
3. THE four metrics SHALL be: Sales_Count, Credits_Count, Transfers_Count, Cash_Differences_Count
4. EACH metric SHALL display a label and count value, formatted for readability
5. WHEN the timeframe or staff filter changes, THE Insight_Strip metrics SHALL update immediately
6. THE Insight_Strip background SHALL contrast with the KPI cards section for visual separation

#### Edge Cases

- IF all metrics are zero, THE Insight_Strip SHALL still display all fields with "0" values
- IF a specific staff member is selected and has no data, THE counts SHALL show "0"
- IF custom date range has zero transactions, THE Insight_Strip display timeframe label as "Custom Range" with date labels
- IF the Insight_Strip width is constrained (mobile), metrics SHALL wrap to secondary row or use abbreviated labels

---

### Requirement 10: Visual Consistency and Reduced Text Density

**User Story:** As a manager, I want the report to emphasize values over descriptions with increased whitespace, so that I can scan information quickly and reduce cognitive load.

#### Acceptance Criteria

1. THE report design SHALL prioritize displaying data values prominently and descriptions minimally
2. THE default KPI card font size for amounts SHALL be at least 24px (on desktop, 20px on mobile)
3. THE default whitespace (padding/margins) between major sections SHALL be at least 20px
4. THE default whitespace between individual list items SHALL be at least 12px
5. THE report color scheme SHALL use no more than 3 primary colors plus neutral grays for text and backgrounds
6. ALL descriptive text on the report page (excluding the detail sheet) SHALL be limited to section titles and item labels
7. THE report scan time (time to identify key metrics) SHALL be measurable as improved from baseline

#### Mobile Responsiveness

8. WHEN the report is viewed on screens less than 768px wide, THE layout SHALL adapt to single-column KPI cards
9. WHEN the report is viewed on screens less than 480px wide, THE Insight_Strip metrics SHALL wrap to optimize readability
10. WHEN the Report_Controls are sticky on mobile, THE height SHALL not exceed 80px to preserve content area
11. WHEN a KPI_Detail_Sheet is opened on mobile, THE sheet SHALL be full-screen or 90% of viewport height

#### Edge Cases

- IF custom theme colors are applied (dark mode), THE contrast ratios SHALL remain WCAG AA compliant for text readability
- IF the Manager uses 120% or 150% system font scaling, THE layout SHALL remain usable without horizontal scrolling
- IF the report contains more than 100 items, THE rendering performance SHALL remain smooth (no noticeable lag when scrolling)

---

### Requirement 11: Report Data Refresh and Real-Time Updates

**User Story:** As a manager, I want the report to reflect current data without manual refresh, so that I can trust the information I'm viewing.

#### Acceptance Criteria

1. WHEN new transactions are recorded by other staff members, THE Needs_Attention_Section SHALL update within 5 seconds
2. WHEN a closing check is completed, THE Closing_Check component SHALL reflect the updated status immediately with confirmation
3. WHEN a closing check is modified without completion, THE status SHALL NOT update until the closing check is actually completed
4. WHEN the Manager's filter selections remain unchanged, THE report data refresh SHALL NOT lose the current filter state
5. IF the app detects network connectivity issues, THE system SHALL display an offline indicator without clearing displayed data
6. WHEN connectivity is restored, THE report SHALL silently refresh with latest data

#### Edge Cases

- IF multiple managers are viewing the report simultaneously, each shall see updates specific to their staff/location context
- IF real-time sync fails repeatedly, THE system SHALL fall back to manual refresh button
- IF the report is scrolled to specific item while refresh occurs, THE scroll position SHALL be maintained if data order hasn't changed

---

### Requirement 12: Parser and Serializer Requirements

**User Story:** As a system, I need to reliably export and format report data in multiple formats, so that managers can share and archive reports.

#### Acceptance Criteria

1. THE Report_Exporter SHALL parse the current report data into exportable format (PDF or CSV)
2. WHEN exporting to CSV, THE exporter SHALL serialize all visible data including KPIs, sections, and transaction details
3. WHEN exporting to PDF, THE exporter SHALL format data maintaining visual hierarchy and readability
4. THE Report_Formatter SHALL generate human-readable labels for all data fields
5. WHEN a report is exported, THE file SHALL be named with timestamp: `report_[YYYY-MM-DD_HH-MM-SS].[pdf|csv]`
6. FOR ALL exported reports, re-importing the serialized data SHALL produce equivalent view to original (round-trip property)

#### Edge Cases

- IF export contains special characters or emojis, THE serializer SHALL correctly encode them
- IF the report contains RTL text (Amharic), THE PDF formatter SHALL maintain text direction
- IF export exceeds 10MB, THE system SHALL split into multiple files or compress appropriately

---

## Acceptance Criteria Summary

This requirements document defines 12 core requirements covering:
- Visual simplification and information hierarchy (Requirements 1-2, 10)
- Navigation and actionability (Requirements 3-5, 8)
- Data organization and persistence (Requirements 6-7, 9, 11)
- Technical robustness (Requirement 12)

All requirements emphasize manager efficiency, reducing scan time, and enabling fast action on critical business issues. The design maintains existing calculations and business logic while dramatically improving usability and reducing cognitive load.

