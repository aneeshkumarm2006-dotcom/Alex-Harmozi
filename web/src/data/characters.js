// The data-driven character registry. Adding a future persona = one entry here
// (and its `id` must match a key in the backend engine.CHARACTERS).
// `photo` is null for now -> Avatar renders a styled initials placeholder.

export const characters = [
  {
    id: 'alex',
    name: 'Alex Hormozi',
    tagline: 'Acquisition · Offers · Leverage',
    blurb: 'Grounded in 527 long-form videos.',
    topics: ['Offers', 'Lead gen', 'Sales', 'Scaling', 'Mindset'],
    videos: 527,
    words: '2.4M',
    accent: '#10B981',
    featured: true,
    photo: '/alex.jpg',
    available: true,
  },
  {
    id: 'coming-1',
    name: 'More coaches',
    tagline: 'Operators, closers & founders',
    accent: '#A1A1AA',
    photo: null,
    available: false,
  },
  {
    id: 'coming-2',
    name: 'Request a coach',
    tagline: "Tell us who you'd think with",
    accent: '#A1A1AA',
    photo: null,
    available: false,
  },
]

export const getCharacter = (id) => characters.find((c) => c.id === id)
