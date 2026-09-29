'use client'

import { useEffect } from 'react'
import '@easy-cms/plugin-form-builder/element.css'

/** <easy-form>, defined in the browser only: it renders a form from the CMS and sends it. */
export function EasyForm({ form }: { form: string }) {
  useEffect(() => {
    void import('@easy-cms/plugin-form-builder/element')
  }, [])
  return <easy-form form={form} />
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'easy-form': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        form: string
        api?: string
        locale?: string
      }
    }
  }
}
