/**
 * Each template's sample documents (runtime/seed.ts), so its admin opens looking like the
 * system it stands for. `@slug:n` is the id of the n-th document made in `slug`. Collections a
 * template leaves out here (and any a user adds) get generic documents instead.
 */
import type { Samples } from '../runtime/seed.ts'

const p = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})
const day = (offset: number, hour = 10) => {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + offset)
  date.setUTCHours(hour, 0, 0, 0)
  return date.toISOString()
}
const published = { status: 'published' }

const blog: Samples = {
  categories: [{ name: 'Product' }, { name: 'Engineering' }, { name: 'Stories' }],
  posts: [
    {
      ...published,
      title: 'Getting started with Easy CMS',
      excerpt: 'From an empty folder to a working admin in five minutes.',
      body: p('Write the content model in code; the admin, the API and the types follow.'),
      category: '@categories:0',
      tags: ['guide'],
      featured: true,
      publishedAt: day(-6),
    },
    {
      ...published,
      title: 'Ten small things that make a site fast',
      excerpt: 'Most speed comes from things you leave out.',
      body: p('Fewer requests, smaller images, and caching the pages that rarely change.'),
      category: '@categories:1',
      tags: ['guide'],
      publishedAt: day(-4),
    },
    {
      ...published,
      title: 'How a bakery moved its menu online',
      excerpt: 'A story about prices that change every morning.',
      body: p('The staff edit the menu from a phone before the shop opens.'),
      category: '@categories:2',
      tags: ['story'],
      publishedAt: day(-2),
    },
    {
      status: 'draft',
      title: 'What is new this month',
      excerpt: 'A draft: only signed-in editors see it.',
      category: '@categories:0',
      tags: ['news'],
    },
  ],
}

const company: Samples = {
  pages: [
    {
      ...published,
      title: 'Home',
      layout: [
        {
          blockType: 'hero',
          heading: 'Software that fits how you work',
          text: 'We design and build web apps for growing teams.',
        },
        { blockType: 'cta', label: 'Talk to us', link: '/contact' },
      ],
    },
    {
      ...published,
      title: 'About us',
      layout: [{ blockType: 'content', body: p('Founded in 2015, a team of twelve in Bangkok.') }],
    },
    { status: 'draft', title: 'Careers' },
  ],
  services: [
    { name: 'Web apps', summary: 'From the first sketch to running in production.', order: 1 },
    { name: 'Design systems', summary: 'One set of parts for every screen.', order: 2 },
    { name: 'Support', summary: 'Updates, monitoring and fixes, every month.', order: 3 },
  ],
  team: [
    { name: 'Ann Lee', role: 'Founder', email: 'ann@example.com' },
    { name: 'Somchai Dee', role: 'Lead developer', email: 'somchai@example.com' },
    { name: 'Maya Chen', role: 'Designer', email: 'maya@example.com' },
  ],
}

const shop: Samples = {
  categories: [{ name: 'Coffee' }, { name: 'Equipment' }],
  products: [
    {
      ...published,
      name: 'Doi Chang single origin',
      price: 420,
      stock: 35,
      category: '@categories:0',
      description: p('Medium roast from northern Thailand; notes of cocoa and plum.'),
    },
    {
      ...published,
      name: 'House espresso blend',
      price: 350,
      stock: 60,
      category: '@categories:0',
    },
    { ...published, name: 'Pour-over kettle', price: 1290, stock: 8, category: '@categories:1' },
    { ...published, name: 'Hand grinder', price: 1850, stock: 0, category: '@categories:1' },
    { status: 'draft', name: 'Cold brew bottles', price: 490, category: '@categories:1' },
  ],
  customers: [
    { name: 'Nok Suda', email: 'nok@example.com', phone: '081 234 5678' },
    { name: 'Lukas Weber', email: 'lukas@example.com' },
  ],
  orders: [
    {
      number: 'A-1001',
      customer: '@customers:0',
      lines: [
        { product: '@products:0', quantity: 2 },
        { product: '@products:2', quantity: 1 },
      ],
      total: 2130,
      status: 'shipped',
    },
    {
      number: 'A-1002',
      customer: '@customers:1',
      lines: [{ product: '@products:1', quantity: 1 }],
      total: 350,
      status: 'paid',
    },
    {
      number: 'A-1003',
      customer: '@customers:0',
      lines: [{ product: '@products:3', quantity: 1 }],
      total: 1850,
      status: 'pending',
    },
  ],
}

const booking: Samples = {
  services: [
    { name: 'Haircut', minutes: 45, price: 400 },
    { name: 'Colour', minutes: 120, price: 1800 },
    { name: 'Head massage', minutes: 30, price: 300 },
  ],
  staff: [
    { name: 'Maya Chen', services: ['@services:0', '@services:1'] },
    { name: 'Sam Rivera', services: ['@services:0', '@services:2'] },
  ],
  bookings: [
    {
      customer: 'Nok Suda',
      phone: '081 234 5678',
      service: '@services:0',
      staff: '@staff:0',
      startsAt: day(1, 3),
      status: 'confirmed',
    },
    {
      customer: 'Ann Lee',
      phone: '089 555 0101',
      service: '@services:1',
      staff: '@staff:0',
      startsAt: day(1, 6),
      status: 'requested',
      notes: 'First visit; would like a consultation first.',
    },
    {
      customer: 'Lukas Weber',
      phone: '062 111 2233',
      service: '@services:2',
      staff: '@staff:1',
      startsAt: day(-1, 4),
      status: 'done',
    },
  ],
}

const crm: Samples = {
  companies: [
    { name: 'Northwind Retail', website: 'https://northwind.example', industry: 'retail' },
    { name: 'Bluebird Clinics', website: 'https://bluebird.example', industry: 'health' },
    { name: 'Acorn Learning', industry: 'education' },
  ],
  contacts: [
    { name: 'Ann Lee', email: 'ann@northwind.example', company: '@companies:0', title: 'COO' },
    {
      name: 'Somchai Dee',
      email: 'somchai@bluebird.example',
      company: '@companies:1',
      title: 'IT lead',
    },
    { name: 'Maya Chen', email: 'maya@acorn.example', company: '@companies:2', title: 'Founder' },
  ],
  deals: [
    {
      name: 'Online store rebuild',
      company: '@companies:0',
      contact: '@contacts:0',
      value: 480000,
      stage: 'proposal',
      closeDate: day(21),
    },
    {
      name: 'Patient booking portal',
      company: '@companies:1',
      contact: '@contacts:1',
      value: 320000,
      stage: 'qualified',
      closeDate: day(45),
    },
    {
      name: 'Course platform',
      company: '@companies:2',
      contact: '@contacts:2',
      value: 150000,
      stage: 'won',
    },
    { name: 'Loyalty app', company: '@companies:0', value: 90000, stage: 'lead' },
  ],
}

const jobs: Samples = {
  companies: [
    { name: 'Northwind Retail', location: 'Bangkok' },
    { name: 'Bluebird Clinics', location: 'Chiang Mai' },
  ],
  positions: [
    {
      ...published,
      title: 'Frontend developer',
      company: '@companies:0',
      type: 'full-time',
      remote: true,
      salaryFrom: 60000,
      description: p('Build the store our customers use every day, in React and TypeScript.'),
    },
    {
      ...published,
      title: 'Clinic coordinator',
      company: '@companies:1',
      type: 'full-time',
      remote: false,
      salaryFrom: 30000,
    },
    {
      ...published,
      title: 'Content writer',
      company: '@companies:0',
      type: 'contract',
      remote: true,
    },
    { status: 'draft', title: 'Data analyst', company: '@companies:1', type: 'part-time' },
  ],
  applications: [
    {
      position: '@positions:0',
      name: 'Lukas Weber',
      email: 'lukas@example.com',
      stage: 'interview',
    },
    {
      position: '@positions:0',
      name: 'Nok Suda',
      email: 'nok@example.com',
      coverLetter: 'Five years of React, and I shop at Northwind every week.',
      stage: 'new',
    },
    { position: '@positions:2', name: 'Sam Rivera', email: 'sam@example.com', stage: 'offer' },
  ],
}

// Thai is the default language: these are the Thai versions; switch to English in the admin.
const restaurant: Samples = {
  categories: [
    { name: 'อาหารจานเดียว', order: 1 },
    { name: 'ต้มและแกง', order: 2 },
    { name: 'ของหวาน', order: 3 },
  ],
  dishes: [
    {
      name: 'ผัดไทยกุ้งสด',
      description: 'เส้นจันท์ผัดซอสมะขาม กุ้งแม่น้ำ ถั่วงอก กุยช่าย',
      price: 120,
      category: '@categories:0',
      spicy: false,
      available: true,
    },
    {
      name: 'ข้าวกะเพราหมูสับไข่ดาว',
      description: 'กะเพราแดง พริกสด ไข่ดาวกรอบ',
      price: 80,
      category: '@categories:0',
      spicy: true,
      available: true,
    },
    {
      name: 'ต้มยำกุ้งน้ำข้น',
      description: 'ข่า ตะไคร้ ใบมะกรูด น้ำพริกเผา',
      price: 180,
      category: '@categories:1',
      spicy: true,
      available: true,
    },
    {
      name: 'ข้าวเหนียวมะม่วง',
      description: 'มะม่วงน้ำดอกไม้ ราดกะทิ',
      price: 90,
      category: '@categories:2',
      spicy: false,
      available: false,
    },
  ],
  branches: [
    { name: 'สาขาสยาม', phone: '02 123 4567', hours: '10:00–21:00' },
    { name: 'สาขาอารีย์', phone: '02 765 4321', hours: '11:00–22:00' },
  ],
}

const courses: Samples = {
  instructors: [
    { name: 'Maya Chen', bio: 'Designer for ten years; teaches interface design.' },
    { name: 'Somchai Dee', bio: 'Backend developer; teaches TypeScript and databases.' },
  ],
  courses: [
    {
      ...published,
      title: 'TypeScript from zero',
      instructor: '@instructors:1',
      level: 'beginner',
      price: 1490,
      summary: 'Types, functions and modules, with a small project at the end.',
    },
    {
      ...published,
      title: 'Designing calm interfaces',
      instructor: '@instructors:0',
      level: 'intermediate',
      price: 1990,
      summary: 'Layout, type and colour for screens people use all day.',
    },
    {
      status: 'draft',
      title: 'Databases in practice',
      instructor: '@instructors:1',
      level: 'advanced',
    },
  ],
  lessons: [
    {
      title: 'Why types?',
      course: '@courses:0',
      order: 1,
      minutes: 12,
      content: p('What a type checker catches before your users do.'),
    },
    { title: 'Your first function', course: '@courses:0', order: 2, minutes: 18 },
    { title: 'Modules and imports', course: '@courses:0', order: 3, minutes: 15 },
    { title: 'A grid you can trust', course: '@courses:1', order: 1, minutes: 20 },
  ],
  students: [
    { name: 'Nok Suda', email: 'nok@example.com', courses: ['@courses:0'] },
    { name: 'Lukas Weber', email: 'lukas@example.com', courses: ['@courses:0', '@courses:1'] },
  ],
}

const realEstate: Samples = {
  agents: [
    { name: 'Ann Lee', phone: '081 000 1111', email: 'ann@example.com' },
    { name: 'Sam Rivera', phone: '082 000 2222', email: 'sam@example.com' },
  ],
  listings: [
    {
      ...published,
      title: 'Two-bedroom condo near the BTS',
      deal: 'sale',
      price: 5900000,
      bedrooms: 2,
      area: 68,
      location: { district: 'Ari', city: 'Bangkok' },
      agent: '@agents:0',
      description: p('Five minutes on foot to Ari station; pool and gym on the roof.'),
    },
    {
      ...published,
      title: 'Garden house for rent',
      deal: 'rent',
      price: 45000,
      bedrooms: 3,
      area: 180,
      location: { district: 'Hang Dong', city: 'Chiang Mai' },
      agent: '@agents:1',
    },
    {
      ...published,
      title: 'Studio by the river',
      deal: 'rent',
      price: 16000,
      bedrooms: 1,
      area: 32,
      location: { district: 'Khlong San', city: 'Bangkok' },
      agent: '@agents:0',
    },
    {
      status: 'draft',
      title: 'Shophouse in the old town',
      deal: 'sale',
      price: 12500000,
      agent: '@agents:1',
    },
  ],
  enquiries: [
    {
      listing: '@listings:0',
      name: 'Lukas Weber',
      phone: '062 111 2233',
      message: 'Can I see it on Saturday?',
    },
    { listing: '@listings:1', name: 'Nok Suda', message: 'Are pets allowed?' },
  ],
}

// Tenants first: every project and task belongs to one.
const saas: Samples = {
  tenants: [
    { name: 'Northwind', domains: [{ domain: 'northwind.example' }] },
    { name: 'Bluebird', domains: [{ domain: 'bluebird.example' }] },
  ],
  projects: [
    { tenant: '@tenants:0', name: 'Spring campaign', status: 'active', dueDate: day(30) },
    { tenant: '@tenants:0', name: 'New checkout', status: 'paused' },
    { tenant: '@tenants:1', name: 'Clinic website', status: 'active', dueDate: day(14) },
  ],
  tasks: [
    {
      tenant: '@tenants:0',
      project: '@projects:0',
      title: 'Write the landing page',
      priority: 'high',
    },
    {
      tenant: '@tenants:0',
      project: '@projects:0',
      title: 'Book the photo shoot',
      done: true,
      priority: 'medium',
    },
    {
      tenant: '@tenants:0',
      project: '@projects:1',
      title: 'Compare payment providers',
      priority: 'low',
    },
    {
      tenant: '@tenants:1',
      project: '@projects:2',
      title: 'Collect doctor profiles',
      priority: 'high',
    },
  ],
}

/** By template id (templates/index.ts). */
export const SAMPLES: Readonly<Record<string, Samples>> = {
  blog,
  company,
  shop,
  booking,
  crm,
  jobs,
  restaurant,
  courses,
  'real-estate': realEstate,
  saas,
}
