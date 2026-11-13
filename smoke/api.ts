// What a running Easy CMS answers, through REST, the way an editor's browser and a site use it:
// sign in, upload an image, create, change, read and delete a post (ADR-0067's smoke test).
// Used by scaffold.ts after the server starts, on every package manager and runtime.

/** The smallest PNG: one transparent pixel. */
const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
)

type Doc = Record<string, unknown> & { id: string | number }

export async function checkApi(origin: string, email: string, password: string): Promise<void> {
  const api = `${origin}/api/cms`
  const cookies = new Map<string, string>()
  let cookie = ''
  let csrf = ''
  const call = async (method: string, path: string, body?: unknown): Promise<unknown> => {
    const headers: Record<string, string> = { origin }
    if (cookie) headers.cookie = cookie
    if (csrf) headers['x-csrf-token'] = csrf
    if (body !== undefined && !(body instanceof FormData))
      headers['content-type'] = 'application/json'
    const response = await fetch(`${api}${path}`, {
      method,
      headers,
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    })
    for (const set of response.headers.getSetCookie()) {
      const [pair = ''] = set.split(';')
      cookies.set(pair.slice(0, pair.indexOf('=')), pair)
    }
    cookie = [...cookies.values()].join('; ')
    const text = await response.text()
    if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text.slice(0, 300)}`)
    return text ? JSON.parse(text) : undefined
  }
  const docOf = (result: unknown) => ((result as { doc?: Doc }).doc ?? result) as Doc

  const login = (await call('POST', '/auth/login', { email, password })) as { csrfToken?: string }
  if (!login.csrfToken) throw new Error('signing in gave no CSRF token')
  csrf = login.csrfToken
  console.log('✓ signed in')

  const form = new FormData()
  form.append('file', new Blob([PNG], { type: 'image/png' }), 'pixel.png')
  form.append('alt', 'A pixel')
  const media = docOf(await call('POST', '/media', form))
  const fileUrl = String(media.url ?? '')
  if (!fileUrl) throw new Error(`the upload has no url: ${JSON.stringify(media)}`)
  const file = new Uint8Array(await (await fetch(new URL(fileUrl, origin))).arrayBuffer())
  if (file.byteLength !== PNG.byteLength || !file.every((b, i) => b === PNG[i]))
    throw new Error(`${fileUrl} is not the uploaded file (${file.byteLength} bytes)`)
  console.log('✓ uploaded an image and read it back')

  const post = docOf(
    await call('POST', '/posts', { title: 'Hello', cover: media.id, status: 'published' }),
  )
  docOf(await call('PATCH', `/posts/${post.id}`, { title: 'Hello again' }))
  // Read as a site does: without signing in.
  const read = await fetch(`${api}/posts?where[slug][equals]=${post.slug}&depth=1`)
  const list = (await read.json()) as { docs?: Doc[] }
  const found = list.docs?.[0]
  if (found?.title !== 'Hello again') throw new Error(`read back: ${JSON.stringify(list)}`)
  if ((found.cover as Doc | undefined)?.id !== media.id)
    throw new Error(`the cover isn't the upload: ${JSON.stringify(found.cover)}`)
  console.log('✓ created, changed and read a post')

  await call('DELETE', `/posts/${post.id}`)
  await call('DELETE', `/media/${media.id}`)
  const gone = await fetch(`${api}/posts/${post.id}`)
  if (gone.status !== 404) throw new Error(`a deleted post answers ${gone.status}`)
  console.log('✓ deleted them')
}
