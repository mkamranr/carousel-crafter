---
title: React Server Components
eyebrow: Server Components
brand:
  handle: "@daily.techtalks"
  instagram: "@daily.techtalks"
  youtube: "daily.techtalks"
  website: "dailytechtalks.dev"
---

# React Server Components

### Five things that actually changed

---

## They run only on the server

No hydration cost. The component never ships to the client bundle.

```tsx
export default async function Page() {
  const posts = await db.post.findMany();
  return <PostList posts={posts} />;
}
```

---

## What you give up

- No `useState` or `useEffect`
- No browser APIs — no `window`, no `localStorage`
- No event handlers passed as props

Reach for a Client Component at the leaf, not the root.

---

> The mental model is not "server vs client".
> It is "which parts of this tree need to be interactive".

---

<!-- role: cta -->

## Follow for more

Daily tech breakdowns → **@daily.techtalks**
