// 100 avatar emojis for kids to choose from
// Grouped by category for browsing

export const AVATAR_CATEGORIES = [
  {
    name: 'Dragons & Magic',
    emojis: ['🐉', '🐲', '🔮', '⚡', '🔥', '🌟', '✨', '💫', '🪄', '🧙‍♂️', '🧙‍♀️', '🧚', '🧜‍♀️', '🧝‍♀️', '🧝‍♂️'],
  },
  {
    name: 'Animals',
    emojis: ['🦁', '🐺', '🦊', '🐻', '🐼', '🐨', '🐯', '🦄', '🐴', '🦅', '🦉', '🐬', '🐙', '🦈', '🐢', '🦋', '🐝', '🐞', '🦎', '🐾'],
  },
  {
    name: 'Ocean & Nature',
    emojis: ['🌊', '🌈', '🌸', '🌺', '🍀', '🌴', '🌙', '⭐', '☀️', '❄️', '🌋', '🏔️', '🌵', '🍄', '🪸'],
  },
  {
    name: 'Space & Science',
    emojis: ['🚀', '🛸', '👽', '🤖', '🌍', '🪐', '☄️', '🔭', '⚗️', '🧬'],
  },
  {
    name: 'Food & Treats',
    emojis: ['🍦', '🍩', '🧁', '🍪', '🍫', '🍭', '🍬', '🎂', '🍉', '🍓'],
  },
  {
    name: 'Sports & Games',
    emojis: ['⚽', '🏀', '🎮', '🎯', '🏆', '🥇', '🎸', '🎨', '🎭', '🎪'],
  },
  {
    name: 'Heroes & Characters',
    emojis: ['🦸‍♀️', '🦸‍♂️', '🦹‍♀️', '🦹‍♂️', '🥷', '👸', '🤴', '🧛', '🧟', '👻'],
  },
  {
    name: 'Hearts & Symbols',
    emojis: ['💎', '👑', '🏅', '💖', '💜', '💙', '💚', '🧡', '❤️‍🔥', '🩵'],
  },
];

// Flat list of all avatars
export const ALL_AVATARS = AVATAR_CATEGORIES.flatMap(c => c.emojis);
