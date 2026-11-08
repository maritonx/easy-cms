import { siFacebook, siLine, siX } from 'simple-icons'

// Logos are trademarks of their owners, shown only to name their services. From simple-icons
// (CC0), bundled at build time.
const logo = (icon: { path: string; hex: string }) => ({
  paths: [{ d: icon.path }],
  color: `#${icon.hex}`,
})

export const FACEBOOK = logo(siFacebook)
export const LINE = logo(siLine)
export const X = logo(siX)
