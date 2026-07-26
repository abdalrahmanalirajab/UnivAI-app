# Lint Fix Report — Landing Page

## Files fixed

### `app/components/landing/Hero.tsx`

**Error (line 33):** `react-hooks/set-state-in-effect` — `setShowAfter(true)` called synchronously inside `useEffect`.

**Root cause:** The effect checked `prefers-reduced-motion: reduce` and called `setShowAfter(true)` directly in the effect body. The rule prohibits synchronous `setState` calls inside an effect because they cause cascading renders.

**Fix:**
- Replaced `useState(false)` with a lazy initializer `useState(() => ...)` that evaluates `window.matchMedia` at initialisation time.
- The effect now returns early when motion is reduced (no synchronous `setState`), and otherwise only starts the interval (which calls `setShowAfter` inside a `setInterval` callback — permitted by the rule).

```tsx
const [showAfter, setShowAfter] = useState(() => {
  if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return true;
  }
  return false;
});

useEffect(() => {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (mq.matches) return;
  const interval = setInterval(() => {
    setShowAfter((prev) => !prev);
  }, 4000);
  return () => clearInterval(interval);
}, []);
```

---

### `app/components/landing/RaiseHandTeaser.tsx`

**Error (line 34):** `react-hooks/set-state-in-effect` — `setDisplayedText("")` called synchronously inside `useEffect` when `!raised`.

**Root cause:** The effect reset `displayedText` to `""` synchronously every time `raised` became `false`.

**Fix:**
- Moved `setDisplayedText("")` into the `handleRaiseHand` click handler (outside any effect — this is an event-driven state update, which is the correct pattern).
- Removed the synchronous `setDisplayedText("")` call from the effect body. The effect now only resets the ref `indexRef.current = 0`.

```tsx
const handleRaiseHand = () => {
  if (raised) return;
  setDisplayedText("");
  setRaised(true);
};

useEffect(() => {
  if (!raised) {
    indexRef.current = 0;
    return;
  }
  // ... typing logic
}, [raised, raiseHandTeaser.fullAnswer]);
```

**Warning (line 56):** `react-hooks/exhaustive-deps` — `raiseHandTeaser.fullAnswer` was used inside the effect but omitted from the dependency array.

**Fix:** Added `raiseHandTeaser.fullAnswer` to the dependency array.

```tsx
}, [raised, raiseHandTeaser.fullAnswer]);
```

---

## Verification

```bash
$ npx eslint app/components/landing/
# → no output (zero errors, zero warnings)
```

All three landing-related lint issues are resolved. The entire `app/components/landing/` directory lints clean.
