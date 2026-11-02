// The posts' `readingTime` ui field: how long the body takes to read, worked out as you type.
// A self-contained module (no imports), listed in `admin.modules`.
class ReadingTime extends HTMLElement {
  set doc(value) {
    this._doc = value
    this.render()
  }
  set uiLocale(value) {
    this._locale = value
    this.render()
  }
  render() {
    const text = []
    const walk = (node) => {
      if (!node || typeof node !== 'object') return
      if (typeof node.text === 'string') text.push(node.text)
      for (const child of node.content ?? []) walk(child)
    }
    walk(this._doc?.body)
    const all = text.join(' ')
    // Thai runs words together: about six characters a word.
    const words = /[฀-๿]/.test(all)
      ? all.replace(/\s+/g, '').length / 6
      : all.split(/\s+/).filter(Boolean).length
    const minutes = Math.max(1, Math.round(words / 220))
    this.textContent =
      this._locale === 'th' ? `อ่านประมาณ ${minutes} นาที` : `About ${minutes} min read`
  }
}
if (!customElements.get('ecms-reading-time'))
  customElements.define('ecms-reading-time', ReadingTime)
