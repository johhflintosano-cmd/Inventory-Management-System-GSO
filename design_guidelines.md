# DWCSJ Inventory Management System - Design Guidelines

## Design Approach
**Utility-focused minimalist design** optimized for accessibility and function over decoration. Clear hierarchy, generous spacing, and intuitive workflows for users of varying technical proficiency.

## Color System
**Primary Palette (User-Specified):**
- **Raisin Black** (#1e212b) - Primary backgrounds, headers, sidebar
- **Forest Green** (#4d8b31) - Primary CTAs, success states, approval actions
- **Mikado Yellow** (#ffc800) - Warnings, pending states, highlights
- **Orange** (#ff8427) - Deny/delete actions, alerts, secondary CTAs
- **White** (#fff) - Text on dark backgrounds, card backgrounds

**Application:**
- Dark theme interface with Raisin Black backgrounds
- Forest Green for primary buttons (Add Item, Approve, Submit)
- Mikado Yellow for low stock alerts, pending request badges
- Orange for deny/delete actions, critical alerts
- White cards on dark backgrounds for content sections

## Typography
**Font Stack:** Inter or System UI fonts for maximum readability
- **Headings:** 600 weight, sizes: 2xl (dashboard titles), xl (section headers), lg (card headers)
- **Body:** 400 weight, base size for content, sm for metadata
- **Labels:** 500 weight, sm size for form labels and badges
- **Button Text:** 500 weight, base size

## Layout & Spacing
**Spacing Units:** Tailwind scale - 4, 6, 8, 12, 16, 24 (consistent throughout)
- Page padding: p-6 to p-8
- Card padding: p-6
- Section spacing: mb-8 between major sections
- Button spacing: px-6 py-3
- Form field spacing: mb-4

**Containers:**
- Max-width: max-w-7xl for main content areas
- Sidebar: Fixed 256px width
- Cards: Full width within grid, rounded-2xl (no sharp edges)

## Component Design

### Navigation
- **Hamburger Menu (Welcome page):** Top-left, 40px touch target, smooth slide-in overlay
- **Dashboard Sidebar:** Fixed left, dark Raisin Black background, white icons/text, Forest Green active state indicator
- **No nested dropdowns** - keep navigation flat and simple

### Buttons
**Primary (Forest Green):**
- Rounded-xl, px-6 py-3, white text, no sharp edges
- No hover animations - focus on clarity

**Secondary (White outline):**
- Border-2, rounded-xl, transparent background, white text

**Destructive (Orange):**
- For delete/deny actions, rounded-xl, white text

**All buttons:** Generous padding, clear labels, minimum 44px height for accessibility

### Cards & Containers
- **All cards:** White background, rounded-2xl, shadow-lg, p-6
- **Inventory cards:** Grid layout (3-4 cols on desktop, 1 col mobile)
- **Request cards:** Full-width with status badge (Pending/Approved/Denied)
- **No overlapping elements** - maintain clear visual separation

### Forms
- **Input fields:** Rounded-xl borders, p-3, white background, clear labels above
- **Role selection (Registration):** Large button cards (Admin/Employee) with icons, rounded-xl, selectable state with Forest Green border
- **2FA input:** Centered, large text, 6-digit code entry
- **No inline validation animations** - simple error text below fields

### Status Indicators
- **Low Stock:** Mikado Yellow badge, rounded-full, px-3 py-1
- **Enough Stock:** Forest Green badge
- **Damaged Items:** Orange badge with icon
- **Request Status:**
  - Pending: Mikado Yellow
  - Approved: Forest Green  
  - Denied: Orange

### Tables
- **Inventory table:** Clean rows with alternating subtle background, rounded-lg row hover (no animation)
- **Category hierarchy:** Indent subcategories (e.g., Laptops > Lenovo, HP) with connecting lines
- **Action buttons:** Small, icon-only in action column for Edit/Delete (Admin) or Request Permission (Employee)

### Notifications
- **Pop-up notifications:** Top-right corner, white cards with colored left border (Forest Green for success, Orange for alerts), rounded-xl, slide-in entrance, auto-dismiss after 5s
- **Badge counters:** Mikado Yellow circle on bell icon showing unread count

### Chat Interface
- **Chat box:** Bottom-right floating widget, rounded-2xl, expandable panel
- **Messages:** Speech-bubble style, rounded-2xl, admin messages in Forest Green tint, employee in white
- **No typing indicators or complex animations**

### Reports
- **Report view:** Clean table layout with export button (Forest Green), date range picker, checkboxes for employee access permissions
- **Charts (Dashboard):** Simple bar/line charts, Forest Green primary color, minimal gridlines

## Loading & Welcome Pages
**Loading Page:**
- Centered DWCSJ logo, simple spinner (Forest Green), Raisin Black background
- Progress bar if needed (Forest Green fill)

**Welcome Page:**
- Clean hero section with DWCSJ branding
- Large, clear Sign Up / Log In buttons (Forest Green)
- Minimalist layout, no decorative images
- Hamburger menu for access to auth pages

## Accessibility Focus
- **Large touch targets:** Minimum 44x44px
- **High contrast:** White text on Raisin Black backgrounds
- **Clear hierarchy:** Size and weight differentiate importance
- **No distracting animations:** Focus on functionality
- **Rounded corners throughout:** Softer, more approachable aesthetic (rounded-xl, rounded-2xl)
- **Generous spacing:** Prevent accidental clicks/taps

## Responsive Behavior
- **Mobile:** Single column, full-width cards, hamburger navigation
- **Tablet:** 2-column grids where appropriate
- **Desktop:** Multi-column grids (3-4 cols), fixed sidebar navigation
- **Stack elements vertically on mobile** - never horizontal scroll

## Image Usage
**No large hero images** - this is a functional business application. Use:
- DWCSJ logo on loading and welcome pages
- Small icons throughout for visual hierarchy
- Category icons for inventory organization
- Profile avatars in chat (optional, can be initials)