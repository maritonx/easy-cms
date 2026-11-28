/**
 * The templates Studio offers (the Templates dialog): one config per kind of system, each with
 * its own sample documents (samples.ts). The configs are real files, so typecheck covers them.
 */
import {
  Briefcase,
  Building2,
  CalendarCheck,
  GraduationCap,
  Handshake,
  House,
  type IconNode,
  Layers,
  Newspaper,
  ShoppingBag,
  UtensilsCrossed,
} from 'lucide'
import blog from './blog.config.ts?raw'
import booking from './booking.config.ts?raw'
import company from './company.config.ts?raw'
import courses from './courses.config.ts?raw'
import crm from './crm.config.ts?raw'
import jobs from './jobs.config.ts?raw'
import realEstate from './realestate.config.ts?raw'
import restaurant from './restaurant.config.ts?raw'
import saas from './saas.config.ts?raw'
import shop from './shop.config.ts?raw'

export interface Template {
  /** In links (`?template=shop`) and analytics; samples.ts uses the same ids. */
  readonly id: string
  readonly name: string
  readonly description: string
  /** What of Easy CMS it shows. */
  readonly features: readonly string[]
  readonly icon: IconNode
  readonly code: string
}

export const TEMPLATES: readonly Template[] = [
  {
    id: 'blog',
    name: 'Blog',
    description: 'Posts with drafts, in categories, with SEO fields.',
    features: ['Drafts', 'SEO plugin'],
    icon: Newspaper,
    code: blog,
  },
  {
    id: 'company',
    name: 'Company website',
    description: 'Pages laid out from blocks, services, the team and company details.',
    features: ['Blocks', 'Global', 'SEO plugin'],
    icon: Building2,
    code: company,
  },
  {
    id: 'shop',
    name: 'Online shop',
    description: 'Products in categories, customers, and orders with their lines.',
    features: ['Arrays', 'Relationships'],
    icon: ShoppingBag,
    code: shop,
  },
  {
    id: 'booking',
    name: 'Booking',
    description: 'Services, staff and appointments for a clinic or a salon.',
    features: ['Access rules', 'Dates'],
    icon: CalendarCheck,
    code: booking,
  },
  {
    id: 'crm',
    name: 'CRM',
    description: 'Companies, their people, and deals moving through a pipeline.',
    features: ['Selects', 'Relationships'],
    icon: Handshake,
    code: crm,
  },
  {
    id: 'jobs',
    name: 'Job board',
    description: 'Open positions at companies, and the applications candidates send.',
    features: ['Drafts', 'Access rules'],
    icon: Briefcase,
    code: jobs,
  },
  {
    id: 'restaurant',
    name: 'Restaurant',
    description: 'A menu in Thai and English, its categories, and branches.',
    features: ['Localization'],
    icon: UtensilsCrossed,
    code: restaurant,
  },
  {
    id: 'courses',
    name: 'Online courses',
    description: 'Courses made of lessons, instructors, and enrolled students.',
    features: ['Has many', 'Drafts'],
    icon: GraduationCap,
    code: courses,
  },
  {
    id: 'real-estate',
    name: 'Real estate',
    description: 'Homes for sale or rent, their agents, and enquiries.',
    features: ['Groups', 'Drafts'],
    icon: House,
    code: realEstate,
  },
  {
    id: 'saas',
    name: 'Multi-tenant SaaS',
    description: 'Each customer sees only its own projects and tasks.',
    features: ['Multi-tenant plugin', 'Roles'],
    icon: Layers,
    code: saas,
  },
]

export const templateById = (id: string | null | undefined): Template | undefined =>
  TEMPLATES.find((t) => t.id === id)
