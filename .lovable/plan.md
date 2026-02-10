
# PATCH P1.0.2.1 — Fix Regressions and Missing Features

## Summary of All Changes (7 items)

---

### P1 — Client realtime: new messages without F5
**File: `src/hooks/useTickets.ts` (useTicketMessages, lines 164-186)**

Current `useTicketMessages` is a plain `useQuery` with no realtime subscription. When admin replies, client sees nothing until refresh.

**Fix:** Convert to a custom hook that adds a `useEffect` with supabase channel subscription:
- Channel: `ticket-messages-rt-{ticketId}`
- Filter: `ticket_id=eq.${ticketId}` on `ticket_messages` table
- Events: `*` (INSERT/UPDATE/DELETE)
- On change: `queryClient.invalidateQueries({ queryKey: ["ticket-messages", ticketId, isAdmin] })`
- Cleanup: `supabase.removeChannel(channel)` on unmount
- Dependencies: `[ticketId, isAdmin, queryClient]`

This requires adding `useQueryClient` and `useEffect` to the hook (useEffect already imported at file level).

---

### P2 — Client realtime: ticket list + unread badge without F5
**File: `src/hooks/useTickets.ts` (useUserTickets, lines 65-88)**

`useUserTickets` has no realtime subscription. Client ticket list and status changes require F5.

**Fix:** Add `useEffect` with supabase channel:
- Channel: `user-tickets-rt`
- Filter: `user_id=eq.${user.id}` on `support_tickets` table
- On change: invalidate both `["user-tickets", user.id]` and `["unread-tickets-count", user.id]`
- Cleanup on unmount

Note: `useUnreadTicketsCount` (line 189) already has a realtime subscription on `support_tickets`, so only `useUserTickets` needs it for the ticket list to update.

---

### P3 — Unread indicator always visible (not just in dropdown)
**File: `src/components/layout/AppSidebar.tsx` (lines 288-321)**

Currently the unread badge is inside the `DropdownMenuContent` on the "Техподдержка" item (line 357-361). User never sees it without clicking the profile avatar.

**Fix:** Add a small red dot on the profile trigger button (the avatar area, line 294):
- After the `Avatar` component (line 294-301), add an absolutely positioned red dot when `unreadTicketsCount > 0`
- The dot sits on the top-right corner of the avatar, similar to the unread dot on TicketCard
- Wrap the Avatar in a `relative` container and add `absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background`

---

### P4 — Fix compact badge labels
**File: `src/components/support/TicketStatusBadge.tsx` (lines 16 and 40)**

- Line 16: `compactLabel: "Откр."` --> `compactLabel: "Открыт"`
- Line 40: `compactLabel: "Закр."` --> `compactLabel: "Закрыт"`

---

### P5 — Reactions: scoped queryKey + correct invalidation
**File: `src/hooks/useTicketReactions.ts`**

Current issues:
- `queryKey: ["ticket-reactions", messageIds]` -- uses the full messageIds array. When messages change (new message added), the key changes and old reactions data is orphaned
- Realtime invalidation uses `queryKey: ["ticket-reactions"]` (too broad, but actually this is fine -- it matches all queries starting with "ticket-reactions")
- The `useToggleReaction` also invalidates `["ticket-reactions"]` which is correct (prefix match)

The actual bug risk: `messageIds` in the queryKey changes reference on every render if `visibleMessages` changes. This is handled by `useMemo` in TicketChat (line 35-38), so it should be stable. However, when a new message arrives via realtime, `visibleMessages` changes, `messageIds` changes, and a new query is created with the new key while the old cached data doesn't apply.

**Fix:** Add `ticketId` as a parameter to `useTicketReactions` for scoped caching:
- Change signature: `useTicketReactions(ticketId: string, messageIds: string[])`
- queryKey: `["ticket-reactions", ticketId, messageIds]`
- Realtime invalidation: `queryClient.invalidateQueries({ queryKey: ["ticket-reactions", ticketId] })`
- Channel name: `ticket-reactions-rt-{ticketId}` (unique per ticket)

**File: `src/hooks/useTicketReactions.ts` (useToggleReaction)**
- Add `ticketId` param: `useToggleReaction(ticketId: string)`
- onSuccess invalidation: `queryClient.invalidateQueries({ queryKey: ["ticket-reactions", ticketId] })`

**File: `src/components/support/TicketChat.tsx` (lines 39-40)**
- Pass ticketId: `useTicketReactions(ticketId, messageIds)` and `useToggleReaction(ticketId)`

---

### P6 — Telegram Bridge: explicit toggle + auto-prefill
**File: `src/components/admin/communication/SupportTabContent.tsx` (lines 101-114)**

Current: resolves `telegram_user_id` from profile into local state but never writes it to the ticket or toggles `telegram_bridge_enabled`.

**Fix (add-only):**
1. After fetching `telegram_user_id` from profile (line 111-113), check if ticket needs updating:
   - If `selectedTicket.telegram_user_id` is null AND profile has `telegram_user_id`: auto-update ticket with `telegram_user_id` and `telegram_bridge_enabled=true`
   - Use `updateTicket.mutate()` (already available)

2. Add a visible toggle in the ticket header (between Info button and Status/Priority selects, around line 390):
   - Small Switch or toggle button labeled "TG" or with a Telegram icon
   - Reads from `(selectedTicket as any).telegram_bridge_enabled`
   - On toggle: `updateTicket.mutate({ ticketId, updates: { telegram_bridge_enabled: !current } })`
   - Only visible when `ticketTelegramUserId` is set

---

### P7 — Better error diagnostics for send message
**File: `src/hooks/useTickets.ts` (useSendMessage, lines 352-359)**

Current error handler:
```typescript
onError: (error) => {
  console.error("Error sending message:", error);
  toast({ title: "Ошибка", description: "Не удалось отправить сообщение" });
}
```

**Fix:** Show actual error message and log context:
```typescript
onError: (error: any, variables) => {
  console.error("[useSendMessage] Error:", {
    ticketId: variables.ticket_id,
    authorType: variables.author_type,
    isInternal: variables.is_internal,
    error: error?.message || error,
  });
  toast({
    title: "Ошибка",
    description: error?.message || "Не удалось отправить сообщение",
    variant: "destructive",
  });
}
```

---

## Files Modified

| File | Changes |
|------|---------|
| `src/hooks/useTickets.ts` | P1: realtime in useTicketMessages; P2: realtime in useUserTickets; P7: better error in useSendMessage |
| `src/components/layout/AppSidebar.tsx` | P3: red dot on avatar trigger |
| `src/components/support/TicketStatusBadge.tsx` | P4: "Открыт"/"Закрыт" labels |
| `src/hooks/useTicketReactions.ts` | P5: scoped queryKey with ticketId |
| `src/components/support/TicketChat.tsx` | P5: pass ticketId to reaction hooks |
| `src/components/admin/communication/SupportTabContent.tsx` | P6: auto-prefill + TG bridge toggle UI |

## Files NOT Touched
- `TicketMessage.tsx` -- rendering is correct
- `TicketCard.tsx` -- layout already fixed
- Edge functions -- bridge logic already exists
- DB/RLS -- no changes needed

## DoD
1. Client `/support/{ticketId}`: admin sends message --> client sees it without F5
2. Client ticket list updates without F5 (status changes, new messages)
3. Red dot on avatar visible when unread > 0 (without opening dropdown)
4. Badge labels: "Открыт" / "Закрыт" (full words)
5. Reactions from admin visible to client without F5 (scoped invalidation)
6. TG Bridge: toggle visible in admin header, auto-prefill works
7. Send error: toast shows actual error reason, console logs context
