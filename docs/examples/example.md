---
title: React Server Components
eyebrow: Server Components
brand:
  handle: "@daily.techtalks"
  instagram: "@daily.techtalks"
  youtube: "daily.techtalks"
  website: "dailytechtalks.dev"
---

# Where your code actually runs

### Five things Server Components changed

---

## They never reach the browser

The component runs once, on the server. No bundle cost, no hydration.

```tsx
export default async function Page() {
  const posts = await db.post.findMany();
  return <PostList posts={posts} />;
}
```

---

## What you give up

- No `useState` or `useEffect`
- No `window`, no `localStorage`
- No event handlers passed as props

Reach for a Client Component at the leaf, not the root.

---

## Only the rendered output crosses

![Server renders HTML, the client receives it](./diagram.svg)

The component itself never leaves the server.

---

> The question is not "server or client".
> It is which parts of this tree need to be interactive.

---

<!-- role: cta -->

## Follow for more

Daily tech breakdowns, one carousel at a time.
