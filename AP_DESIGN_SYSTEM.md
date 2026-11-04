# Admission Portal — Visual Design System

**Phase:** 1 — Visual Foundation  
**Status:** Implemented on `rebuild/clean-start`  
**Identity:** Temporary neutral identity ("Admission Portal")  
**Design direction:** Modern EdTech, light UI, blue gradient highlights  
**Responsive strategy:** Desktop-first with tablet and mobile adaptation

## 1. Product-wide visual principles

- Use one shared design language across the public website, applicant portal, and staff/admin workspaces.
- Keep the public website welcoming and editorial; keep authenticated portals task-focused and data-dense.
- Use gradients as emphasis, not as the default background for every component.
- Use real campus/student photography only when approved school assets are supplied. Pair photography with restrained abstract blue/cyan/violet shapes.
- Do not invent school logos, official claims, campus facts, testimonials, statistics, or contact details.
- Use the temporary wordmark and neutral labels until official brand assets and approved copy are provided.

## 2. Color tokens

| Token | Value | Use |
|---|---|---|
| `--ap-primary` | `#155EEF` | Primary actions, links, selected controls |
| `--ap-primary-hover` | `#124FC7` | Hover/active primary actions |
| `--ap-primary-soft` | `#EAF2FF` | Selected/hover surfaces |
| `--ap-navy` | `#102A56` | Headings and strong text |
| `--ap-sky` | `#38BDF8` | Gradient and decorative accent |
| `--ap-violet` | `#8B5CF6` | Secondary decorative accent |
| `--ap-gradient` | `#155EEF → #287CEB → #38BDF8` | Main brand gradient |
| `--ap-bg` | `#F5F8FC` | Page background |
| `--ap-surface` | `#FFFFFF` | Cards and panels |
| `--ap-text` | `#172B4D` | Main text |
| `--ap-muted` | `#66758B` | Supporting text |
| `--ap-border` | `#E5EAF2` | Borders and dividers |
| `--ap-success` | `#16A36A` | Successful/verified states |
| `--ap-warning` | `#D97706` | Pending/review states |
| `--ap-danger` | `#DC2626` | Errors/rejected states |

Status components must pair color with readable text; never communicate status through color alone.

## 3. Typography

- Display/headings: Plus Jakarta Sans, weights 500–800.
- Body, forms, tables, and controls: Inter, weights 400–700.
- System fallbacks: Arial, sans-serif.
- Use compact line lengths for instructional copy and clear hierarchy for page titles.

## 4. Layout and spacing

- Content max width: 1180px for public pages; authenticated workspaces may expand to 1440px.
- Base spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, and 64px.
- Standard card radius: 14–20px; large hero surfaces: 28px.
- Standard controls: 44–48px high.
- Keep consistent gutters and avoid horizontal scrolling except inside intentionally scrollable data tables on small screens.

## 5. Shared component contract

Use the `ap-` class namespace for shared components.

- Buttons: primary, secondary, gradient, and quiet variants.
- Cards: standard and interactive variants.
- Workspace: sidebar, navigation links, page headers, statistic cards, tables, tabs, alerts, and responsive form grids.
- Badges: info, success, warning, danger, and neutral.
- Form controls: visible labels, inline help, focus state, validation state.
- Progress: semantic label plus visible progress bar.
- Feedback: toast, loading skeleton, empty state, modal/confirmation dialog, and inline validation.
- Navigation: clear active state, keyboard focus, and mobile collapse.
- Tables: sticky/clear headers where appropriate, row hover, filters, pagination, and mobile overflow wrapper.

Avoid one-off CSS overrides when a shared token or component class can be reused.

## 6. Experience-specific rules

### Public website

- Temporary neutral wordmark; no assumed official logo.
- Header with clear public navigation and a persistent admission call to action once admission services are enabled.
- Hero uses concise value proposition, primary action, and a visual composition combining approved photography with abstract graphics.
- Sections: About, Academic Programs, Admission Process, Requirements, Announcements, FAQs, Contact, Footer.
- Do not publish fabricated dates, program offerings, school statistics, testimonials, addresses, or contact information.

### Applicant portal

- Personal workspace with a clear dashboard, student selector, application status, next-step guidance, notifications, and account settings.
- Support parent/guardian accounts linked to multiple student profiles and individual student accounts.
- Use a multi-step application with save/resume, inline validation, review, and submission confirmation.
- Physical admission requirements are submitted personally at the school. Applicants can view the checklist and verification status but cannot upload requirement files.
- Parents and students see only records they are authorized to access.

### Admissions personnel and admin

- Task-focused sidebar and data workspace.
- Applicant list supports search, filters, sorting, pagination, and record opening.
- Applicant profile uses tabs for overview, personal information, academic information, requirements, application history, and internal notes.
- Staff record receipt and verification of physical requirements.
- Internal staff notes are never visible to applicants.
- Status changes and material record updates are attributable to a staff account and timestamp.
- Role-specific actions are enforced server-side, not merely hidden in the UI.

## 7. Application status presentation

Proposed visual mapping (final labels remain subject to approved admission policy):

| Status | Visual treatment |
|---|---|
| Draft | Neutral |
| Submitted | Info/blue |
| Under Review | Warning/amber |
| Incomplete Requirements | Warning/orange |
| Qualified | Info/teal |
| Approved | Success/green |
| Rejected | Danger/red |
| Cancelled | Neutral |

## 8. Responsive behavior

Desktop-first breakpoints:
- Above 1200px: full navigation and expanded workspace grids.
- 901–1200px: compact navigation and reduced grid columns.
- 601–900px: collapsed sidebar/navigation and stacked hero layout.
- 600px and below: single-column forms/cards, compact headers, touch-friendly controls, horizontally scrollable tables only where unavoidable.

Preserve usable keyboard focus and honor `prefers-reduced-motion`.

## 9. Technical implementation notes

- Google Apps Script HTML Service is the rendering environment.
- Shared styles live in `AP_DesignSystem.html` and are included through the Apps Script template helper in `AP_Web.gs`.
- `AP_Index.html` is the current neutral foundation preview.
- The initial design system uses native CSS custom properties and component classes. This avoids introducing a build step or runtime CSS compiler into the Apps Script project. The token names and component contract remain compatible with a later utility-class strategy if a build pipeline is introduced.
- Keep the shared design system presentation-only. Do not place authorization, business rules, or data access in CSS/HTML partials.

## 10. Explicit product exclusions

- No applicant document upload. Physical requirements are submitted personally and updated by admissions personnel.
- No payment collection, payment recording, reconciliation, or payment tracking. The official school payment system remains authoritative.
- No deployment or live spreadsheet schema change is part of Phase 1.

## 11. Phase 1 acceptance checklist

- [x] Centralized color, typography, spacing, radius, and shadow tokens.
- [x] Shared button, card, badge, form, progress, and feedback primitives.
- [x] Desktop-first responsive rules and reduced-motion handling.
- [x] Temporary neutral public identity.
- [x] Apps Script template include helper.
- [x] Foundation preview consumes the shared design system.
- [ ] Visual QA in the actual Apps Script web-app preview.
- [ ] Confirm font loading and CSS behavior in the deployed Apps Script HTML Service environment.
