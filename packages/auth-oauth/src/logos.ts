import { siGithub, siGoogle, siOpenid } from 'simple-icons'

// Logos are trademarks of their owners, shown only to name their services. From simple-icons
// (CC0), bundled at build time; Microsoft's four squares are drawn here.
export const GOOGLE = { paths: [{ d: siGoogle.path }], color: `#${siGoogle.hex}` }
export const GITHUB = { paths: [{ d: siGithub.path }], color: `#${siGithub.hex}` }
export const OPENID = { paths: [{ d: siOpenid.path }], color: `#${siOpenid.hex}` }
export const MICROSOFT = {
  paths: [
    { d: 'M1 1h10.5v10.5H1z', fill: '#f25022' },
    { d: 'M12.5 1H23v10.5H12.5z', fill: '#7fba00' },
    { d: 'M1 12.5h10.5V23H1z', fill: '#00a4ef' },
    { d: 'M12.5 12.5H23V23H12.5z', fill: '#ffb900' },
  ],
}
