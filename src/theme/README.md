# FCN Fans Design System

A strict, token-based design system for the FCN Fans React Native app.

## Strict Rules ⚠️

**Zero tolerance for hardcoded values in screens and components:**
- ❌ No hex colors (`#000`, `#FFFFFF`)
- ❌ No `rgba()` or `rgb()` colors
- ❌ No numeric spacing/padding/margin (including `0` - use `theme.spacing[0]`)
- ❌ No numeric `borderRadius` values
- ❌ No numeric `elevation` or `shadowColor`

**Validation:**
```bash
npm run design:check
```

This command scans all files in `src/screens` and `src/components` for violations. A pre-commit hook automatically runs this check before each commit.

## Quick Start

### 1. Use Built-in Components

```tsx
import { Screen, Card, Text } from '@/components/ui';

function MyScreen() {
  return (
    <Screen>
      <Card>
        <Text variant="h2">Hello World</Text>
        <Text variant="body">Use these components - they're already themed!</Text>
      </Card>
    </Screen>
  );
}
```

### 2. Use the Theme Hook

```tsx
import { useTheme } from '@/theme';
import { View, StyleSheet } from 'react-native';

function CustomComponent() {
  const theme = useTheme();
  const styles = createStyles(theme);
  
  return <View style={styles.container} />;
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      backgroundColor: theme.colors.bg.card,
      padding: theme.spacing[4],
      borderRadius: theme.radius.lg,
      gap: theme.spacing[2],
    },
  });
}
```

## Philosophy

**All visual styling must use theme tokens.** This ensures consistent design, easy theme switching (light/dark mode), and maintainable code.

## Token Structure

### Colors (`src/theme/tokens/colors.ts`)

```typescript
// Access via: theme.colors.*

theme.colors.primary         // Brand red: #D8001D
theme.colors.primaryDark     // Dark red: #B00016

theme.colors.bg.default      // App background
theme.colors.bg.card         // Card background
theme.colors.bg.elevated     // Elevated surfaces

theme.colors.text.primary    // Primary text
theme.colors.text.secondary  // Secondary text
theme.colors.text.muted      // Muted text
theme.colors.text.inverse    // Inverse text (on dark backgrounds)

theme.colors.border.default  // Default border
theme.colors.border.light    // Light border

theme.colors.success         // Green
theme.colors.warning         // Orange/Yellow
theme.colors.error           // Red
theme.colors.info            // Blue

theme.colors.pill.*          // Pill/badge colors (red, orange, neutral, yellow)
```

### Spacing (`src/theme/tokens/spacing.ts`)

```typescript
// Access via: theme.spacing[*]

theme.spacing[0]   // 0px
theme.spacing[1]   // 4px
theme.spacing[2]   // 8px
theme.spacing[3]   // 12px
theme.spacing[4]   // 16px
theme.spacing[6]   // 24px
theme.spacing[8]   // 32px
theme.spacing[10]  // 40px
theme.spacing[12]  // 48px

// Layout tokens
theme.layout.screenPadding  // 16px - standard screen padding
theme.layout.cardPadding    // 16px - standard card padding
theme.layout.listGap        // 12px - gap between list items
```

### Border Radius (`src/theme/tokens/radius.ts`)

```typescript
// Access via: theme.radius.*

theme.radius.none  // 0
theme.radius.sm    // 8px
theme.radius.md    // 12px
theme.radius.lg    // 16px - CARDS USE THIS
theme.radius.xl    // 20px
theme.radius.pill  // 999px
```

**Rule:** All cards must use `theme.radius.lg` (16px).

### Typography (`src/theme/tokens/typography.ts`)

```typescript
// Access via: theme.typography.*

theme.typography.h1        // 32px / 40 line / 700 weight
theme.typography.h2        // 24px / 32 line / 600 weight
theme.typography.h3        // 20px / 28 line / 600 weight
theme.typography.body      // 16px / 24 line / 400 weight
theme.typography.bodyBold  // 16px / 24 line / 600 weight
theme.typography.caption   // 14px / 20 line / 400 weight
theme.typography.small     // 12px / 16 line / 400 weight
```

### Elevation (`src/theme/tokens/elevation.ts`)

```typescript
// Access via: theme.elevation.*

theme.elevation.none  // No shadow
theme.elevation.sm    // Small shadow (iOS: opacity 0.1, Android: 2)
theme.elevation.md    // Medium shadow (iOS: opacity 0.15, Android: 4)
theme.elevation.lg    // Large shadow (iOS: opacity 0.2, Android: 8)
```

**Card defaults:**
- Default cards: `sm` elevation
- Raised cards: `md` elevation

### Gradients (`src/theme/tokens/gradients.ts`)

```typescript
// Access via: theme.gradients.*

theme.gradients.imageHeaderOverlay  // Black gradient for card image headers
theme.gradients.primary             // Red brand gradient
```

## Helper Functions

### `getShadowStyle(theme, level)`

Returns platform-specific shadow styles:

```typescript
import { getShadowStyle } from '../theme';

const shadowStyle = getShadowStyle(theme, 'md');
// iOS: { shadowColor, shadowOpacity, shadowRadius, shadowOffset }
// Android: { elevation: 4 }
```

### `getTextStyle(theme, variant)`

Returns typography styles:

```typescript
import { getTextStyle } from '../theme';

const textStyle = getTextStyle(theme, 'h1');
// Returns: { fontSize: 32, lineHeight: 40, fontWeight: '700' }
```

## Base Components

### `<Text>`

Themed text component. **DO NOT** use React Native's `<Text>` directly in screens.

```tsx
import { Text } from '../components/ui';

<Text variant="h1" color="primary">Heading</Text>
<Text variant="body" color="secondary">Body text</Text>
<Text variant="caption" color="muted">Caption</Text>
<Text variant="small" color="error">Error message</Text>
```

**Props:**
- `variant`: `h1` | `h2` | `h3` | `body` | `bodyBold` | `caption` | `small`
- `color`: `primary` | `secondary` | `muted` | `inverse` | `error` | `success`
- All React Native `TextProps`

### `<Card>`

Themed card component. **DO NOT** hardcode card styling.

```tsx
import { Card } from '../components/ui';

// Default card (sm elevation, lg radius, theme padding)
<Card>
  <Text>Content</Text>
</Card>

// Raised card (md elevation)
<Card variant="raised">
  <Text>Elevated content</Text>
</Card>

// Image header card (with gradient overlay)
<Card variant="imageHeader" imageSource={require('./image.jpg')}>
  <Text>Content below image</Text>
</Card>
```

**Props:**
- `variant`: `default` | `raised` | `imageHeader`
- `imageSource`: Image source for imageHeader variant
- All React Native `ViewProps`

### `<Screen>`

Themed screen container. Use for all screen wrappers.

```tsx
import { Screen } from '../components/ui';

// Standard screen
<Screen>
  <Text>Content</Text>
</Screen>

// Scrollable screen
<Screen scrollable>
  <Text>Long content</Text>
</Screen>
```

**Props:**
- `scrollable`: `boolean` - wraps content in ScrollView
- `scrollViewProps`: Props passed to inner ScrollView
- All React Native `ViewProps`

## Rules & Guidelines

### ✅ DO

```tsx
// Use theme tokens
<View style={{ padding: theme.spacing[4], borderRadius: theme.radius.lg }}>
  
// Use themed components
<Text variant="h1" color="primary">Title</Text>

// Use Card component
<Card variant="raised">
  <Text>Content</Text>
</Card>

// Use helper functions
const shadowStyle = getShadowStyle(theme, 'md');
```

### ❌ DON'T

```tsx
// NO hardcoded spacing
<View style={{ padding: 16, margin: 12 }}>

// NO hardcoded colors
<Text style={{ color: '#111827' }}>

// NO hardcoded radius
<View style={{ borderRadius: 12 }}>

// NO hardcoded typography
<Text style={{ fontSize: 24, fontWeight: '700' }}>

// NO hardcoded shadows
<View style={{ shadowOpacity: 0.1, elevation: 3 }}>

// NO direct React Native Text in screens
<Text>Use themed Text component</Text>
```

## Screen Migration Checklist

When refactoring a screen to use the design system:

1. ✅ Add design system comment at top:
   ```typescript
   // =====================================================
   // DESIGN SYSTEM RULES:
   // DO NOT hardcode radius/spacing/colors/shadows; use theme tokens.
   // =====================================================
   ```

2. ✅ Import themed components:
   ```typescript
   import { Screen, Card, Text } from '../components/ui';
   import { defaultTheme } from '../theme';
   ```

3. ✅ Replace all hardcoded values:
   - Spacing: `padding: 16` → `padding: theme.spacing[4]`
   - Colors: `color: '#111827'` → `color="primary"` or `theme.colors.text.primary`
   - Radius: `borderRadius: 12` → `borderRadius: theme.radius.md`
   - Typography: `fontSize: 24` → `variant="h2"`
   - Shadows: Remove and use Card variants or `getShadowStyle()`

4. ✅ Use `<Screen>` wrapper for screen containers

5. ✅ Use `<Card>` for card-like components

6. ✅ Use `<Text>` instead of React Native `Text`

## Examples

### Before (Bad)

```tsx
export default function MyScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: '#F6F7F9', padding: 16 }}>
      <View style={{
        backgroundColor: '#FFFFFF',
        padding: 16,
        borderRadius: 12,
        shadowOpacity: 0.1,
        elevation: 2,
      }}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: '#111827' }}>
          Title
        </Text>
        <Text style={{ fontSize: 16, color: '#6B7280', marginTop: 8 }}>
          Description
        </Text>
      </View>
    </View>
  );
}
```

### After (Good)

```tsx
// =====================================================
// DESIGN SYSTEM RULES:
// DO NOT hardcode radius/spacing/colors/shadows; use theme tokens.
// =====================================================

import { Screen, Card, Text } from '../components/ui';
import { defaultTheme } from '../theme';

export default function MyScreen() {
  const theme = defaultTheme;
  
  return (
    <Screen>
      <Card>
        <Text variant="h2" color="primary">Title</Text>
        <Text variant="body" color="secondary" style={{ marginTop: theme.spacing[2] }}>
          Description
        </Text>
      </Card>
    </Screen>
  );
}
```

## Component Defaults

All component defaults are defined in `theme.components`:

```typescript
theme.components.card.borderRadius      // radius.lg (16)
theme.components.card.padding           // layout.cardPadding (16)
theme.components.card.elevationDefault  // 'sm'
theme.components.card.elevationRaised   // 'md'
```

## Theme Modes

The system supports light and dark modes:

```typescript
import { createTheme } from '../theme';

const lightTheme = createTheme('light');
const darkTheme = createTheme('dark');
```

Currently, `defaultTheme` exports the light theme. Dark mode can be implemented by swapping the theme context.

## Enforcement

- All screens should have the design system comment at the top
- Use grep/search to find violations:
  - `padding: \\d+` - hardcoded padding
  - `margin: \\d+` - hardcoded margin
  - `fontSize: \\d+` - hardcoded font size
  - `borderRadius: \\d+` - hardcoded border radius
  - `color: ['"]#` - hardcoded hex colors
  - `shadowOpacity|elevation:` - hardcoded shadows

## Questions?

- Tokens: Check `src/theme/tokens/`
- Helpers: Check `src/theme/helpers/`
- Components: Check `src/components/ui/`
- Examples: Check refactored screens (WelcomeScreen, CommunitiesScreen, LoginScreen)
