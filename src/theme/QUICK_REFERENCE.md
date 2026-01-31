# Design System Quick Reference

## Import Statement
```typescript
import { Screen, Card, Text } from '../components/ui';
import { defaultTheme, getShadowStyle, getTextStyle } from '../theme';
```

## Basic Screen Structure
```tsx
export default function MyScreen() {
  const theme = defaultTheme;
  
  return (
    <Screen scrollable>
      <Card>
        <Text variant="h1" color="primary">Title</Text>
        <Text variant="body" color="secondary">Description</Text>
      </Card>
    </Screen>
  );
}
```

## Spacing Reference
```typescript
theme.spacing[0]   // 0
theme.spacing[1]   // 4px
theme.spacing[2]   // 8px
theme.spacing[3]   // 12px
theme.spacing[4]   // 16px  ← Screen & Card padding
theme.spacing[6]   // 24px
theme.spacing[8]   // 32px
theme.spacing[10]  // 40px
theme.spacing[12]  // 48px
```

## Radius Reference
```typescript
theme.radius.none  // 0
theme.radius.sm    // 8px
theme.radius.md    // 12px
theme.radius.lg    // 16px  ← Cards use this
theme.radius.xl    // 20px
theme.radius.pill  // 999px
```

## Typography Variants
```typescript
'h1'        // 32px / 40 line / 700 weight
'h2'        // 24px / 32 line / 600 weight
'h3'        // 20px / 28 line / 600 weight
'body'      // 16px / 24 line / 400 weight
'bodyBold'  // 16px / 24 line / 600 weight
'caption'   // 14px / 20 line / 400 weight
'small'     // 12px / 16 line / 400 weight
```

## Color Props
```typescript
'primary'    // Main text color
'secondary'  // Muted text
'muted'      // Very muted text
'inverse'    // White text (on dark backgrounds)
'error'      // Red
'success'    // Green
```

## Card Variants
```tsx
<Card variant="default">          // sm elevation
<Card variant="raised">           // md elevation
<Card variant="imageHeader"       // With gradient overlay
      imageSource={require(...)}>
```

## Common Patterns

### Custom View with Theme Spacing
```tsx
<View style={{
  padding: theme.spacing[4],
  gap: theme.spacing[3],
  borderRadius: theme.radius.md,
  backgroundColor: theme.colors.bg.card,
}}>
```

### Custom Shadow
```tsx
<View style={[
  { borderRadius: theme.radius.lg },
  getShadowStyle(theme, 'md')
]}>
```

### TextInput Styled
```tsx
<TextInput
  style={{
    padding: theme.spacing[3],
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border.default,
    backgroundColor: theme.colors.bg.card,
    fontSize: theme.typography.body.fontSize,
    color: theme.colors.text.primary,
  }}
/>
```

## Don't Do This ❌
```tsx
// NO hardcoded values
<View style={{ padding: 16, borderRadius: 12 }}>
<Text style={{ fontSize: 24, fontWeight: '700', color: '#111' }}>
```

## Do This Instead ✅
```tsx
<View style={{ 
  padding: theme.spacing[4], 
  borderRadius: theme.radius.md 
}}>
<Text variant="h2" color="primary">
```

## Guardrail Comment
Add to top of every screen:
```typescript
// =====================================================
// DESIGN SYSTEM RULES:
// DO NOT hardcode radius/spacing/colors/shadows; use theme tokens.
// =====================================================
```
