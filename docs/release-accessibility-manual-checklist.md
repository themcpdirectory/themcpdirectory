# Accessibility release checklist

Use this checklist with the seeded release route matrices. Automated Axe checks supplement these steps; they do not establish complete accessibility.

Record the date, browser and operating system, tester, route, result, and an issue link for every failure. Repeat changed areas before release.

## Keyboard-only navigation

- Start each route with focus outside the page, press Tab, and confirm the skip link is the first focusable control.
- Activate the skip link and confirm focus moves to the main content.
- Reach and operate every control with the keyboard, including navigation, search, sign-in, claim, member, export, and erasure controls.
- Confirm Tab order follows the visual reading order, Escape closes the mobile navigation, and no keyboard trap occurs.

## Headings and landmarks

- Inspect the accessibility tree and confirm one page-topic `h1` per route.
- Confirm headings do not skip levels and describe the content that follows.
- Confirm header, navigation, main, and footer landmarks have distinct, useful names where needed.

## Labels, errors, and status

- Confirm every control has a persistent visible label that is included in its accessible name.
- Submit each form with an invalid value and confirm the message explains how to fix it, is associated with the field, and receives or triggers useful focus.
- Confirm loading, success, warning, empty, and destructive-action states are announced without relying on colour alone.

## Visible focus

- Confirm focus remains visible on links, buttons, inputs, selects, navigation controls, and destructive actions.
- Confirm the focus indicator has at least 3:1 contrast against adjacent colours and is not obscured by sticky content.

## Reduced motion

- Enable the operating system's reduced-motion preference and revisit every route.
- Confirm non-essential animation and smooth scrolling stop, while state changes remain understandable.

## Forced colours

- Enable a forced-colours or high-contrast mode and revisit every route.
- Confirm text, links, form boundaries, status borders, icons, and focus indicators remain visible with system colours.
- Confirm meaning is not conveyed by gradients, shadows, or colour alone.

## Zoom and text spacing

- At a desktop viewport, zoom text and page content to 200% and confirm content remains readable and controls remain operable.
- Apply WCAG text-spacing overrides and confirm text is not clipped or overlapped.

## 320 CSS-pixel reflow

- Set the viewport to 320 CSS pixels wide and inspect every route from top to bottom.
- Confirm multi-line content does not require page-level horizontal scrolling and long URLs or identifiers wrap.
- Confirm controls remain visible and operable. Horizontal scrolling is acceptable only inside a component that genuinely needs two-dimensional layout, such as a data table.
