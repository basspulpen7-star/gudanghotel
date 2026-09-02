export const ITEM_TYPES = [
  'Sheet single',
  'Sheet double',
  'Duvet single',
  'Duvet double',
  'Pillowcase',
  'Bath towel',
  'Inner duvet single',
  'Bed protektor',
  'Keset',
  'Sheet Topper 340x300'
] as const;

export type ItemType = typeof ITEM_TYPES[number] | string;
