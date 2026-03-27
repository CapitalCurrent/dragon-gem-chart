// Custom dragon avatars — sliced from AI-generated art
// Stored as image paths, rendered via DragonAvatar component

export const DRAGON_CATEGORIES = [
  {
    name: 'Shadow Dragons',
    avatars: [
      { id: 'dragon_01', name: 'Shadow Wing' },
      { id: 'dragon_13', name: 'Dark Spike' },
      { id: 'dragon_25', name: 'Night Claw' },
      { id: 'dragon_37', name: 'Dusk Fang' },
      { id: 'dragon_40', name: 'Phantom Horn' },
      { id: 'dragon_49', name: 'Shade Runner' },
    ],
  },
  {
    name: 'Ice Dragons',
    avatars: [
      { id: 'dragon_02', name: 'Frost Fang' },
      { id: 'dragon_14', name: 'Crystal Horn' },
      { id: 'dragon_18', name: 'Snow Pearl' },
      { id: 'dragon_21', name: 'Blizzard Spike' },
      { id: 'dragon_26', name: 'Glacier Eye' },
      { id: 'dragon_32', name: 'Ice Shard' },
      { id: 'dragon_38', name: 'Frost Crown' },
      { id: 'dragon_44', name: 'Frozen Heart' },
      { id: 'dragon_50', name: 'Winter Gale' },
    ],
  },
  {
    name: 'Fire Dragons',
    avatars: [
      { id: 'dragon_06', name: 'Blaze Jaw' },
      { id: 'dragon_17', name: 'Inferno King' },
      { id: 'dragon_30', name: 'Flame Fury' },
      { id: 'dragon_42', name: 'Ember Lord' },
    ],
  },
  {
    name: 'Armored Dragons',
    avatars: [
      { id: 'dragon_03', name: 'Iron Bite' },
      { id: 'dragon_22', name: 'Plated Guard' },
      { id: 'dragon_33', name: 'Steel Shell' },
      { id: 'dragon_39', name: 'Stone Jaw' },
      { id: 'dragon_43', name: 'Dark Plate' },
      { id: 'dragon_47', name: 'Titan Guard' },
      { id: 'dragon_51', name: 'Boulder Back' },
    ],
  },
  {
    name: 'Wild Dragons',
    avatars: [
      { id: 'dragon_04', name: 'Ridge Runner' },
      { id: 'dragon_05', name: 'Thorn Crest' },
      { id: 'dragon_16', name: 'Spike Crown' },
      { id: 'dragon_19', name: 'Storm Spike' },
      { id: 'dragon_27', name: 'Speckle Snout' },
      { id: 'dragon_29', name: 'Rose Spike' },
      { id: 'dragon_41', name: 'Razor Wing' },
    ],
  },
  {
    name: 'Baby Dragons',
    avatars: [
      { id: 'dragon_20', name: 'Tiny Puff' },
      { id: 'dragon_31', name: 'Little Wing' },
      { id: 'dragon_34', name: 'Flutter' },
      { id: 'dragon_46', name: 'Dewdrop' },
      { id: 'dragon_55', name: 'Sprout' },
    ],
  },
  {
    name: 'Sky Dragons',
    avatars: [
      { id: 'dragon_10', name: 'Owl Wing' },
      { id: 'dragon_23', name: 'Feather Glide' },
      { id: 'dragon_45', name: 'Wind Rider' },
      { id: 'dragon_58', name: 'Cloud Dancer' },
    ],
  },
  {
    name: 'Special Dragons',
    avatars: [
      { id: 'dragon_15', name: 'Twin Head' },
      { id: 'dragon_28', name: 'Double Fang' },
      { id: 'dragon_48', name: 'Thunder Strike' },
    ],
  },
];

export const ALL_DRAGONS = DRAGON_CATEGORIES.flatMap(c => c.avatars);

export function isDragonAvatar(value) {
  return value && value.startsWith('dragon_');
}

export function getDragonSrc(id) {
  return `${process.env.PUBLIC_URL}/dragons/${id}.png`;
}
