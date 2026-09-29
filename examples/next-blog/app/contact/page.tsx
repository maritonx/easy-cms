import { EasyForm } from './easy-form'

export const metadata = { title: 'Contact' }

export default function ContactPage() {
  return (
    <section>
      <h1>Contact</h1>
      {/* A form built in the admin under Forms, with the slug "contact". */}
      <EasyForm form="contact" />
    </section>
  )
}
