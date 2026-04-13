# Foodflow - AI customer support UI design notes

## Overview

This document defines UI design specifications for Foodflow, an AI-powered customer support platform. The design system follows a consistent visual language across all pages, with the Inbox view serving as the primary design reference.

---

## Application Structure

```
Foodflow Platform
├── Login Page (Public)
└── App Shell (Authenticated)
    ├── Dashboard
    ├── Inbox
    ├── AI Assistant
    │   ├── Assistant List
    │   └── Assistant Playground
    ├── Channels
    │   └── WhatsApp
    └── Settings
```

---

## Global Design System

### Color Palette

#### Primary Colors

- **Dark Background:** `#1A1A1A` - Sidebar, AI messages, dark panels
- **Light Background:** `#FFFFFF` - Main content areas
- **Surface:** `#F9FAFB` - Card backgrounds, hover states
- **Border:** `#E5E7EB` - Dividers, input borders

#### Brand Colors

- **Primary Blue:** `#2563EB` - Primary buttons, links
- **Accent Purple:** `#8B5CF6` - AI indicators, selections

#### Text Colors

- **Text Primary:** `#1A1A1A` - Headings, body text
- **Text Secondary:** `#6B7280` - Captions, muted text
- **Text Inverse:** `#FFFFFF` - Text on dark backgrounds

#### Status Colors

- **Success:** `#10B981` - Active, online, resolved
- **Warning:** `#F59E0B` - Needs attention
- **Error:** `#EF4444` - SLA risk, errors, offline
- **Info:** `#3B82F6` - Unread, notifications

### Typography

- **Font Family:** Inter, System UI, -apple-system, sans-serif
- **Page Title:** 24px, weight 600
- **Section Header:** 16px, weight 600
- **Body Text:** 14px, weight 400
- **Caption:** 12px, weight 400
- **Badge/Label:** 11px, weight 500

### Spacing Scale

- **xs:** 4px
- **sm:** 8px
- **md:** 16px
- **lg:** 24px
- **xl:** 32px
- **2xl:** 48px

### Border Radius

- **sm:** 4px - Small elements, badges
- **md:** 8px - Buttons, inputs, cards
- **lg:** 12px - Message bubbles, modals
- **full:** 9999px - Avatars, pills

---

## Global Navigation Sidebar

Present on all authenticated pages.

**Width:** 72px (icon-only mode)

### Structure (Top to Bottom)

1. **Logo** - Brand icon, clickable to Dashboard
2. **Navigation Icons:**
   - Dashboard (Home icon)
   - Inbox (Mail icon with notification badge)
   - AI Assistant (Sparkle/Bot icon)
   - Channels (Message circle icon)
   - Settings (Gear icon)
3. **User Avatar** - Bottom position, opens profile menu

### Visual Specs

- Background: `#1A1A1A`
- Icon size: 24px
- Icon color (inactive): `#666666`
- Icon color (active): `#FFFFFF` with left accent bar (3px, primary blue)
- Notification badge: `#EF4444`, 8px circle

---

## Page 1: Login Page

**Route:** `/login`

### Layout

Split-screen design:

- **Left Panel (50%):** White background, login form centered
- **Right Panel (50%):** Dark background (`#1A1A1A`), branding content

### Left Panel - Login Form

#### Components (Centered, max-width 400px)

1. **Logo**
   - Brand logo/icon
   - Size: 48px
   - Margin bottom: 32px

2. **OAuth Buttons** (Stacked, full-width)
   - "Continue with Google" - Google icon
   - "Continue with GitHub" - GitHub icon
   - "Continue with Microsoft" - Microsoft icon
   - Height: 44px
   - Background: `#FFFFFF`
   - Border: 1px solid `#E5E7EB`
   - Border-radius: 8px
   - Gap between buttons: 12px

3. **Divider**
   - Text: "Or continue with email"
   - Color: `#6B7280`
   - Horizontal lines on sides

4. **Email Input**
   - Placeholder: "yours@example.com"
   - Height: 44px
   - Icon: Mail icon (left)

5. **Continue Button**
   - Text: "Continue"
   - Background: `#2563EB`
   - Color: White
   - Height: 44px
   - Full width
   - Border-radius: 8px
   - Arrow icon on right

6. **Terms Text**
   - "By submitting, you accept the Terms of Service"
   - Font size: 12px
   - Color: `#6B7280`
   - Link color: `#2563EB`

7. **Footer Links**
   - "Use SSO" | "Need help? Get support"
   - Font size: 12px

### Right Panel - Branding

- Background: `#1A1A1A`
- Content centered vertically
- **Tagline Label:** "AI-POWERED SUPPORT" (uppercase, tracking wide, `#2563EB`)
- **Headline:** "Customer support that scales with AI" (White, 32px, weight 600)

---

## Page 2: Dashboard

**Route:** `/dashboard`

### Layout

```
+--------+------------------------------------------------+
| Sidebar|              Main Content Area                 |
| (72px) |              (flexible width)                  |
+--------+------------------------------------------------+
```

### Main Content Structure

#### Header Section

- **Page Title:** "Dashboard"
- **Time Filter:** Dropdown (Today, 7 days, 30 days, Custom)
- **Refresh Button:** Icon button

#### Metrics Cards Row (4 columns)

| Card                  | Icon    | Primary Value | Secondary            |
| --------------------- | ------- | ------------- | -------------------- |
| Total Conversations   | Mail    | Count         | vs. last period %    |
| AI Resolved           | Sparkle | Count         | Resolution rate %    |
| Avg Response Time     | Clock   | Duration      | vs. last period      |
| Customer Satisfaction | Star    | Score         | Based on X responses |

**Card Specs:**

- Background: White
- Border: 1px solid `#E5E7EB`
- Border-radius: 12px
- Padding: 24px
- Shadow: `0 1px 3px rgba(0,0,0,0.1)`

#### Charts Section (2 columns)

**Left: Conversation Volume Chart**

- Line/Area chart
- X-axis: Time (days/hours)
- Y-axis: Conversation count
- Legend: Total, AI Handled, Human Handled

**Right: AI Performance Donut**

- Donut chart showing:
  - Resolved by AI
  - Escalated to Human
  - Pending
- Center: Total count

#### Recent Activity Table

- **Columns:** Customer, Subject, Status, Channel, Time
- **Row Height:** 56px
- Clickable rows (navigate to Inbox)
- Status badges with colors

#### AI Insights Panel (Right sidebar, optional)

- **AI Priority Items:** Count with list
- **Negative Sentiment:** Count with list
- **SLA at Risk:** Count with list

---

## Page 3: Inbox

**Route:** `/inbox`

### Layout (4-panel)

```
+--------+---------------+----------------------+------------------+
| Sidebar| Conversations |   Conversation View  |  Details Panel   |
| (72px) | Panel (280px) |   (flexible)         |  (280px)         |
+--------+---------------+----------------------+------------------+
```

### Conversations Panel (Left)

#### Header

- **Title:** "Conversations" with (+) add button
- **View Selector:** Dropdown with overflow menu (...)

#### Search

- Search input with icon
- Filter button

#### Inbox Categories (Collapsible)

| Category       | Icon             | Badge |
| -------------- | ---------------- | ----- |
| All Message    | Envelope         | Count |
| AI Handling    | Sparkle          | Count |
| Need Attention | Triangle warning | Count |
| Assigned to me | User             | Count |
| Resolved by AI | Check circle     | Count |
| Spam           | Shield           | Count |

#### AI Insights Section (Collapsible)

| Category           | Icon           |
| ------------------ | -------------- |
| AI Priority        | Star           |
| Negative Sentiment | Frown          |
| SLA Risk           | Alert triangle |

#### Sections

- Team (collapsible)
- Manage (collapsible)

#### Message List

Each item:

- Avatar (32px, circular, colored initial)
- Name (bold, 14px)
- Subject (semi-bold, 13px)
- Preview (truncated, 12px, muted)
- Timestamp (right, 12px, muted)
- Status icons (AI sparkle, warning, unread dot)

**States:**

- Default: White
- Hover: `#F9FAFB`
- Selected: `#F3E8FF` with left purple border

### Conversation View (Center)

#### Header

- Avatar (40px)
- Contact name + email
- Action buttons: Star, Archive, More (...)

#### Message Thread

**Customer Message (Left-aligned):**

- Background: `#F5F5F5`
- Border-radius: 12px
- Max-width: 70%
- Padding: 16px

**AI Agent Message (Right-aligned):**

- Label: "Helix (AI Agent)" with sparkle icon
- Background: `#2D2D2D`
- Text: White
- Border-radius: 12px
- Max-width: 70%

**Timestamps:** Centered, muted, "HH:MM AM/PM"

#### Message Input (Bottom)

- Textarea with placeholder
- Attachment button
- Send button (primary)
- AI suggestion toggle

### Details Panel (Right, Collapsible)

#### Sections

**Contact Info:**

- Name, Email, Company, Timezone

**Case Info:**

- Case ID, Category, Subject, Channel, Created, Last reply

**AI Signals:**

- Confidence, Sentiment, SLA risk

**Assignment:**

- Assigned to, Linked tickets

---

## Page 4: AI Assistant

### 4A: Assistant List View

**Route:** `/ai-assistant`

#### Layout

```
+--------+------------------------------------------------+
| Sidebar|              Main Content Area                 |
| (72px) |              (flexible width)                  |
+--------+------------------------------------------------+
```

#### Header

- **Title:** "Assistants"
- **Action Button:** "Create an assistant" (Primary blue, right-aligned)

#### Table

**Columns:**

- Name (link style, blue, with status dot)
- Created (date, sortable with arrow icon)
- Updated (date)
- Host (URL, monospace font)
- Actions (overflow menu ...)

**Row Specs:**

- Height: 56px
- Hover: `#F9FAFB`
- Border-bottom: 1px solid `#E5E7EB`

**Status Dot:**

- Active: `#10B981` (green)
- Inactive: `#EF4444` (red)

**Table Header:**

- Background: `#F9FAFB`
- Font: 12px, weight 500, uppercase, muted color
- Padding: 12px 16px

### 4B: Assistant Playground View

**Route:** `/ai-assistant/:id`

#### Layout (3-panel)

```
+--------+---------------------------+----------------------+
| Sidebar|    Chat Area              |   Settings Panel     |
| (72px) |    (flexible)             |   (320px)            |
+--------+---------------------------+----------------------+
```

#### Header

- **Title:** "Assistant playground"
- **Selector:** Dropdown to switch assistants
- **Actions:** Settings, Files, Code, More (...) icons

#### Chat Area (Center)

**Message Display:**

_User Message:_

- Icon: User avatar (24px)
- Label: "You"
- Content: Message text
- Alignment: Left

_Assistant Message:_

- Icon: Bot/Gear icon (24px)
- Label: "Foodflow" or assistant name
- Content: Message text (with markdown support)
- Loading state: Spinning indicator

**Input Area (Bottom):**

- Full-width textarea
- Placeholder: "Type a message..."
- Send button
- Attachment support

#### Settings Panel (Right)

**Header Info:**

- Status: Green dot + "Active" / Red dot + "Inactive"
- Created: Date
- Updated: Date
- Host: URL with copy button
- MCP: URL with copy button

**Configuration:**

_Assistant Instructions:_

- Label: "Assistant instructions"
- Textarea with placeholder
- Helper text: "Outline the assistant's behavior, tone, or any additional context. Applies to every conversation."

_Model Selection:_

- Label: "Chat model"
- Dropdown selector
- Options: GPT-4o, GPT-4, GPT-3.5-turbo, etc.

#### Files Tab (Alternative Right Panel)

**Header Tabs:**

- Settings | Files (active)

**Upload Area:**

- Dashed border zone
- Icon: Upload cloud
- Text: "Drag files here or click to upload"
- Click triggers file picker

**File List:**

- File icon (based on type)
- File name
- Updated date
- File size
- Actions menu (...)

**File Item Specs:**

- Height: 64px
- Padding: 16px
- Border-bottom: 1px solid `#E5E7EB`

---

## Page 5: Channels

**Route:** `/channels`

### Layout

```
+--------+---------------+--------------------------------+
| Sidebar| Channel List  |   Channel Configuration        |
| (72px) | (280px)       |   (flexible)                   |
+--------+---------------+--------------------------------+
```

### Channel List Panel

#### Header

- **Title:** "Channels"
- **Add Button:** (+) icon

#### Channel Items

| Channel  | Status                 | Badge         |
| -------- | ---------------------- | ------------- |
| WhatsApp | Connected/Disconnected | Green/Red dot |

**Future Channels (Disabled/Coming Soon):**

- Email
- Live Chat
- Facebook Messenger
- Instagram
- SMS

### WhatsApp Configuration (Main Panel)

#### Header

- WhatsApp icon + "WhatsApp"
- Status badge (Connected/Disconnected)
- Toggle switch (Enable/Disable)

#### Connection Section

**If Disconnected:**

- QR Code display area
- Instructions: "Scan with WhatsApp Business app"
- "Refresh QR" button

**If Connected:**

- Phone number display
- Connected since date
- "Disconnect" button (danger style)

#### Settings Section

**Business Profile:**

- Business name input
- Description textarea
- Profile picture upload

**AI Settings:**

- Toggle: "Enable AI responses"
- Dropdown: Select AI Assistant
- Toggle: "Auto-escalate on negative sentiment"
- Input: Response delay (seconds)

**Operating Hours:**

- Toggle: "Set operating hours"
- Time pickers: Start/End for each day
- Toggle per day

#### Message Templates Section

- List of approved templates
- "Add Template" button
- Each template shows: Name, Category, Status (Approved/Pending/Rejected)

---

## Page 6: Settings

**Route:** `/settings`

### Layout

```
+--------+---------------+--------------------------------+
| Sidebar| Settings Nav  |   Settings Content             |
| (72px) | (240px)       |   (flexible)                   |
+--------+---------------+--------------------------------+
```

### Settings Navigation (Left)

#### Sections

**Account**

- Profile
- Security
- Notifications

**Workspace**

- General
- Team Members
- Roles & Permissions

**AI Configuration**

- AI Behavior
- Knowledge Base
- Training Data

**Integrations**

- Connected Apps
- API Keys
- Webhooks

**Billing**

- Subscription
- Usage
- Invoices

### Settings Content Panels

#### Profile Settings

**Avatar Upload:**

- Current avatar (80px)
- "Upload" / "Remove" buttons
- Supported formats note

**Personal Info Form:**

- Full Name (input)
- Email (input, read-only with verified badge)
- Phone (input, optional)
- Timezone (dropdown)
- Language (dropdown)

**Save Button:** Primary, bottom-right

#### Team Members

**Header:**

- Title: "Team Members"
- "Invite Member" button (Primary)

**Members Table:**

- Avatar + Name + Email
- Role (dropdown: Admin, Agent, Viewer)
- Status (Active/Pending/Inactive)
- Last Active
- Actions (Remove, Resend invite)

**Invite Modal:**

- Email input
- Role selector
- Send button

#### AI Behavior Settings

**Response Style:**

- Tone selector (Professional, Friendly, Casual)
- Formality slider

**Capabilities Toggles:**

- Auto-respond to common questions
- Suggest responses to agents
- Auto-escalate complex issues
- Sentiment analysis
- SLA monitoring

**Escalation Rules:**

- Negative sentiment threshold (slider)
- Max AI attempts before escalation (number)
- Keywords that trigger escalation (tag input)

#### API Keys

**Current Keys Table:**

- Key name
- Key preview (masked: `sk-...xxxx`)
- Created date
- Last used
- Actions (Copy, Revoke)

**Create Key:**

- "Generate New Key" button
- Modal with name input
- Display full key once (with copy button)
- Warning: "This key won't be shown again"

---

## Common Components

### Button Variants

| Variant   | Background  | Text      | Border        |
| --------- | ----------- | --------- | ------------- |
| Primary   | `#2563EB`   | White     | None          |
| Secondary | `#F3F4F6`   | `#1A1A1A` | None          |
| Outline   | Transparent | `#2563EB` | 1px `#2563EB` |
| Ghost     | Transparent | `#6B7280` | None          |
| Danger    | `#EF4444`   | White     | None          |

**Sizes:**

- sm: Height 32px, padding 8px 12px
- md: Height 40px, padding 10px 16px
- lg: Height 48px, padding 12px 24px

### Input Fields

- Height: 40px
- Border: 1px solid `#E5E7EB`
- Border-radius: 8px
- Padding: 10px 12px
- Focus: Border `#2563EB`, ring `rgba(37, 99, 235, 0.1)`
- Error: Border `#EF4444`
- Disabled: Background `#F9FAFB`, opacity 0.6

### Dropdown/Select

- Same as input styling
- Chevron icon on right
- Dropdown menu: White background, shadow, 8px border-radius
- Option height: 40px
- Hover: `#F3F4F6`
- Selected: `#EFF6FF` with checkmark

### Avatar

**Sizes:** 24px, 32px, 40px, 64px, 80px

**Variants:**

- Image: Circular crop
- Initial: Colored background (hash-based) with white text

### Badge/Tag

- Height: 20px
- Border-radius: 10px
- Padding: 0 8px
- Font size: 11px
- Variants: Default (gray), Success (green), Warning (orange), Error (red), Info (blue)

### Table

- Header: Background `#F9FAFB`, sticky
- Row height: 56px
- Hover: `#F9FAFB`
- Border: 1px solid `#E5E7EB`
- Sortable columns: Hover underline, click toggles arrow

### Modal

- Overlay: `rgba(0, 0, 0, 0.5)`
- Container: White, border-radius 12px, shadow
- Max-width: 480px (sm), 640px (md), 800px (lg)
- Header: Title + close button
- Footer: Cancel + Confirm buttons

### Toast/Notification

- Position: Top-right
- Width: 360px
- Border-radius: 8px
- Shadow: Large
- Variants: Success, Error, Warning, Info
- Auto-dismiss: 5 seconds
- Close button

---

## Responsive Behavior

| Breakpoint      | Layout Changes                                                   |
| --------------- | ---------------------------------------------------------------- |
| < 768px         | Hide details panel, collapse sidebar to bottom nav, stack panels |
| 768px - 1024px  | Hide details panel, narrow conversation list                     |
| 1024px - 1280px | Full layout with narrower panels                                 |
| >= 1280px       | Full layout                                                      |

---

## AI Visual Language

Consistent AI indicators across the application:

1. **Sparkle Icon** - Indicates AI involvement
2. **Purple Accent** (`#8B5CF6`) - AI-related elements
3. **Dark Bubbles** - AI messages in chat
4. **"(AI Agent)" Label** - Clear identification
5. **Loading Animation** - Pulsing dots when AI is processing
6. **Confidence Indicators** - Percentage or bar for AI certainty

---

## Recommended File Structure

```
src/
├── pages/
│   ├── Login.tsx
│   ├── Dashboard.tsx
│   ├── Inbox.tsx
│   ├── AIAssistant/
│   │   ├── AssistantList.tsx
│   │   └── AssistantPlayground.tsx
│   ├── Channels/
│   │   ├── ChannelList.tsx
│   │   └── WhatsAppConfig.tsx
│   └── Settings/
│       ├── Profile.tsx
│       ├── Team.tsx
│       ├── AIConfig.tsx
│       └── APIKeys.tsx
├── components/
│   ├── Layout/
│   │   ├── AppShell.tsx
│   │   ├── Sidebar.tsx
│   │   └── PageHeader.tsx
│   ├── Common/
│   │   ├── Avatar.tsx
│   │   ├── Badge.tsx
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Modal.tsx
│   │   ├── Table.tsx
│   │   └── Toast.tsx
│   ├── Chat/
│   │   ├── MessageBubble.tsx
│   │   ├── MessageInput.tsx
│   │   └── ChatThread.tsx
│   ├── Inbox/
│   │   ├── ConversationList.tsx
│   │   ├── ConversationView.tsx
│   │   └── DetailsPanel.tsx
│   └── AI/
│       ├── AIIndicator.tsx
│       ├── AIInsights.tsx
│       └── AssistantCard.tsx
├── styles/
│   ├── tokens.css
│   ├── globals.css
│   └── components/
└── assets/
    ├── icons/
    └── images/
```

---

## Accessibility Guidelines

- Color contrast ratio: Minimum 4.5:1 for text
- Focus indicators: Visible outline on all interactive elements
- Keyboard navigation: Full support with logical tab order
- Screen reader: ARIA labels on icons and interactive elements
- Reduced motion: Respect `prefers-reduced-motion`
- Font sizing: Use rem units, minimum 14px body text
