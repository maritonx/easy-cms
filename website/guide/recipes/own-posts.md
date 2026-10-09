# Authors edit only their own posts

::: info What you'll build
An `author` role that can write posts but change only its own, while editors and admins manage
everything. **Uses:** [roles](../auth#roles), [access control](../access-control), [hooks](../hooks).
:::

## 1. Add the role

```ts
auth: { roles: ['admin', 'editor', 'author'] },
```

Give people the role under **Settings → Users**.

## 2. Record who wrote each post

```ts
{
  slug: 'posts',
  fields: [
    // …
    {
      name: 'author',
      type: 'relationship',
      to: 'users',
      admin: { position: 'sidebar' },
      // Only editors and admins may reassign a post.
      access: { update: ({ user }) => user?.role !== 'author' },
    },
  ],
  hooks: {
    beforeChange: [
      ({ data, operation, user }) =>
        operation === 'create' && user && !data.author ? { ...data, author: user.id } : data,
    ],
  },
}
```

## 3. Limit what authors may change

```ts
access: {
  read: () => true,
  create: ({ user }) => !!user,
  // A `where` result allows only the matching documents.
  update: ({ user }) =>
    user?.role === 'author' ? { author: { equals: user.id } } : !!user,
  delete: ({ user }) => user?.role === 'admin' || user?.role === 'editor',
},
```

In the admin, authors can open every post but only save their own; Delete is hidden for them.
To hide other people's posts from the list as well, return the same `where` from `read` for
logged-in authors:

```ts
read: ({ user }) =>
  user?.role === 'author'
    ? { author: { equals: user.id } }
    : user
      ? true
      : { status: { equals: 'published' } },
```

## Check it

Log in as an author: create a post, then open one by someone else. Saving it answers
**403 Forbidden**, and the admin says you can only view it.
