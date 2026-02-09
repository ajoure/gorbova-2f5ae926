

# PATCH P0.9.12b — Fix double-click "next step" bug + video/mobile cleanup

## Problem

### 1. Double-click bug on "Next step" button
**Root cause**: In `KvestLessonView.tsx`, every completion handler (video, diagnostic table, role description) calls `markBlockCompleted(blockId)` followed immediately by `goToStep(currentStepIndex + 1)`. But `goToStep` checks `isCurrentBlockGateOpen` (line 155), which is a pre-computed value from the previous render. Since React hasn't re-rendered yet after `markBlockCompleted`, the gate check fails, showing the toast error "Сначала завершите текущий шаг". On the second click, React has re-rendered with the new state, so the gate opens.

### 2. Video block still calls `onProgress(100)` (unnecessary after P0.9.12)
### 3. Video gate still checks `videoProgress >= threshold` instead of relying on `isBlockCompleted`

## Changes

### File 1: `src/components/lesson/KvestLessonView.tsx`

**1a. Add `force` parameter to `goToStep`** (line 142)

```
const goToStep = useCallback((index: number, force = false) => {
  ...
  // Check if current block gate is open before moving forward
  if (index > currentStepIndex && !force && !isCurrentBlockGateOpen) {
    toast.error("Сначала завершите текущий шаг");
    return;
  }
  ...
```

When a completion handler has JUST marked a block as completed, it passes `force: true` to skip the stale gate check.

**1b. Update all completion handlers to pass `force: true`:**

- `handleVideoComplete` (line 233): `goToStep(currentStepIndex + 1, true)`
- `handleRoleDescriptionComplete` (line 214): `goToStep(currentStepIndex + 1, true)`
- `handleDiagnosticTableComplete` (line 246): `goToStep(currentStepIndex + 1, true)`

**1c. Simplify `video_unskippable` gate** (lines 100-112):

Remove `videoProgress` check entirely. The block is already gated by `isBlockCompleted(block.id)` at line 87. Replace the body with:

```
case 'video_unskippable': {
  const videoUrl = ((block.content as any)?.url || '').trim();
  if (!videoUrl) {
    return allowBypassEmptyVideo === true;
  }
  // P0.9.12: completion is via manual button, checked by isBlockCompleted above
  return false;
}
```

**1d. Remove `onProgress` call from video handler** (line 360):

Remove the `onProgress` prop entirely from video_unskippable rendering since percent tracking is gone. Only keep `onComplete`.

### File 2: `src/components/admin/lesson-editor/blocks/VideoUnskippableBlock.tsx`

**2a. Remove `onProgress(100)` from `handleConfirmWatched`** (line 106):

```
const handleConfirmWatched = () => {
  onComplete?.();
};
```

**2b. Change button text** (line 255):

From: `Я просмотрел(а) видео`
To: `Я просмотрел(а) урок`

**2c. Show confirmation button always** (not gated by `content.required !== false`):

The button should always appear since the block is always mandatory by design. Remove the `content.required !== false` condition at line 247.

## What we do NOT touch

- DiagnosticTableBlock.tsx: mobile layout is already correct (verified: `block sm:hidden` / `hidden sm:block` classes are properly applied)
- useLessonProgressState.tsx: debounce logic is correct
- No SQL/DB changes
- No other block types

## Technical Details

```text
goToStep call flow (BEFORE fix):

  handleVideoComplete()
    -> markBlockCompleted(blockId)     // updates state (async React batch)
    -> goToStep(next)                  // checks isCurrentBlockGateOpen (STALE!)
       -> gate says "closed" -> toast error

goToStep call flow (AFTER fix):

  handleVideoComplete()
    -> markBlockCompleted(blockId)
    -> goToStep(next, force=true)      // skips stale gate check
       -> advances to next step immediately
```

## DoD

1. Single click on "Я просмотрел(а) урок" immediately advances to next step (no error toast)
2. Single click on "Диагностика завершена" immediately advances to next step
3. After reload, completed blocks remain completed
4. On mobile (375px), diagnostic table renders as vertical cards
5. No `onProgress` calls remain in video block code
6. No `videoProgress` threshold checks in gate logic

