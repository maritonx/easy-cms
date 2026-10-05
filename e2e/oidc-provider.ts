// A sign-in provider for the suite (OpenID Connect, on its own port): the examples use it
// through OIDC_ISSUER. Who signs in is chosen on its form.
import { startMockProvider } from '../packages/auth-oauth/test/mock-provider.ts'

const provider = await startMockProvider(Number(process.argv[2] ?? 3110))
console.log(`Mock OpenID Connect provider on ${provider.url}`)
