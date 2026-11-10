import { siBrevo, siResend } from 'simple-icons'

// Logos are trademarks of their owners, shown only to name their services. From simple-icons
// (CC0), bundled at build time. Resend's is black: without a color it takes the text's.
export const RESEND = { paths: [{ d: siResend.path }] }
export const BREVO = { paths: [{ d: siBrevo.path }], color: `#${siBrevo.hex}` }
