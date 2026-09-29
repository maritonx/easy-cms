// The site's name and tagline, in Thai or English (`?locale=en`).
export default defineEventHandler(async (event) => {
  const cms = await useEasyCMS()
  return cms.findGlobal('site', { locale: getQuery(event).locale === 'en' ? 'en' : 'th' })
})
