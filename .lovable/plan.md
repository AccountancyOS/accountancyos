

# Plan: Add Light/Dark Mode Toggle with Teal/Green Light Theme

## Overview

Add a proper theme switching system so users can toggle between the existing dark mode and a new teal/green-accented light mode that conveys the tech-focused, automation-driven identity of the software.

## What Changes

### 1. Wire up `next-themes` ThemeProvider

The `next-themes` package is already installed. Wrap the app in `ThemeProvider` so the `.dark` / `.light` class on `<html>` is managed automatically.

**File: `src/App.tsx`**
- Import `ThemeProvider` from `next-themes`
- Wrap the outermost content in `<ThemeProvider attribute="class" defaultTheme="dark">`

**File: `index.html`**
- Remove the hardcoded `class="dark"` from `<html>` (ThemeProvider manages this)

### 2. Restructure CSS variables for proper light/dark

Currently `:root` holds the dark palette and `.light` holds a blue-tinted light palette. The standard pattern for `next-themes` with Tailwind `darkMode: ["class"]` is:

- `:root` = light mode (default)
- `.dark` = dark mode

**File: `src/index.css`**

**Light mode (`:root`)** -- new teal/green + grey/white palette:

| Token | Value | Description |
|-------|-------|-------------|
| `--background` | `210 20% 98%` | Off-white |
| `--foreground` | `220 15% 15%` | Dark grey text |
| `--card` | `0 0% 100%` | White cards |
| `--primary` | `168 70% 42%` | Teal |
| `--primary-foreground` | `0 0% 100%` | White on teal |
| `--secondary` | `210 15% 95%` | Light grey |
| `--muted` | `210 15% 93%` | Muted grey |
| `--muted-foreground` | `215 15% 50%` | Mid grey |
| `--accent` | `160 60% 45%` | Green-teal |
| `--border` | `214 15% 90%` | Light border |
| `--ring` | `168 70% 42%` | Teal focus ring |
| `--sidebar-background` | `220 15% 14%` | Dark grey sidebar |
| `--sidebar-primary` | `168 70% 42%` | Teal highlights |

**Dark mode (`.dark`)** -- current dark palette preserved, but shifted to teal primary:

| Token | Value | Description |
|-------|-------|-------------|
| `--background` | `220 15% 10%` | Dark grey |
| `--foreground` | `210 15% 95%` | Light text |
| `--card` | `220 15% 13%` | Dark card |
| `--primary` | `168 65% 48%` | Teal (brighter for contrast) |
| `--accent` | `160 55% 50%` | Green-teal |
| `--border` | `220 12% 22%` | Dark border |

Gradients and glow shadows will also shift from blue to teal in both modes. Chart colors move to a teal/green spectrum.

### 3. Add Theme Toggle to Top Bar

**File: `src/components/DashboardLayout.tsx`**

Add a Sun/Moon icon button next to the NotificationBell in the top bar header. Uses `useTheme()` from `next-themes` to toggle between light and dark.

```text
+--------------------------------------------------+
| Top bar:                    [Sun/Moon] [Bell]     |
+--------------------------------------------------+
```

### 4. Update Button Glow Variant

**File: `src/components/ui/button.tsx`**

Change the `glow` variant shadow colors from hardcoded blue HSL to use `var(--primary)` so it automatically adapts to teal in both themes.

## Files to Create

None.

## Files to Modify

| File | Change |
|------|--------|
| `index.html` | Remove `class="dark"` from `<html>` |
| `src/App.tsx` | Wrap in `ThemeProvider` from `next-themes` |
| `src/index.css` | Restructure `:root` as light (teal/grey), `.dark` as dark (teal/dark grey) |
| `src/components/DashboardLayout.tsx` | Add theme toggle button in top bar |
| `src/components/ui/button.tsx` | Update glow variant to use CSS variable instead of hardcoded blue |

## Risk

- **Low** -- the design token architecture means all components automatically inherit the updated palette through CSS variables
- No component logic changes, only CSS values and one new toggle button
- Dark mode is preserved as the default so existing users see no change until they toggle

