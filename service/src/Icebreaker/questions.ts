// SPDX-License-Identifier: CC0-1.0
// The question bank is public domain (CC0-1.0), unlike the rest of Pit Stop (AGPL-3.0):
// a self-hosted copy may edit or redistribute it freely. Ids are never reused; a question
// is retired with `active: false`, never deleted, so archived retros still show it.

export interface IcebreakerQuestion {
  active: boolean;
  id: string;
  text: string;
}

/** Light and playful on purpose: the icebreaker is there to set a good mood, not to assess. */
export const ICEBREAKER_QUESTIONS: readonly IcebreakerQuestion[] = [
  {active: true, id: 'fun-001', text: 'If you could give one boring task a superpower, which task would it be?'},
  {active: true, id: 'fun-002', text: 'What dream side job would you try for a year?'},
  {active: true, id: 'fun-003', text: 'Which fictional world would you like to work in for a day?'},
  {active: true, id: 'fun-004', text: 'If your desk had a theme song, what would it be?'},
  {active: true, id: 'fun-005', text: 'Which animal would make the best mascot for our team?'},
  {active: true, id: 'fun-006', text: 'What would your usual lunch order say about your personality?'},
  {active: true, id: 'fun-007', text: 'If you could teleport to any city for lunch, where would you go?'},
  {active: true, id: 'fun-008', text: 'Which invention from history would you like on your desk today?'},
  {active: true, id: 'fun-009', text: 'Which board game would best describe how our team works?'},
  {active: true, id: 'fun-010', text: 'If you were a tool in a toolbox, which one would you be?'},
  {active: true, id: 'fun-011', text: 'Which fictional detective would be best at debugging our code?'},
  {active: true, id: 'fun-012', text: 'Which emoji best describes your week so far?'},
  {active: true, id: 'fun-013', text: 'If you could add one new word to the dictionary, what would it be?'},
  {active: true, id: 'fun-014', text: 'What would your personal theme park ride be called?'},
  {active: true, id: 'fun-015', text: 'If you could master any instrument overnight, which one would you pick?'},
  {active: true, id: 'fun-016', text: 'If your week were a movie, what would its title be?'},
  {active: true, id: 'fun-017', text: 'Which superpower would be the most useful in a meeting?'},
  {active: true, id: 'fun-018', text: 'Which cartoon character would you swap jobs with for a day?'},
  {active: true, id: 'fun-019', text: 'What is your most useless talent?'},
  {active: true, id: 'fun-020', text: 'If our office had a secret room, what would be inside?'},
  {active: true, id: 'fun-021', text: 'Which snack deserves a statue?'},
  {active: true, id: 'fun-022', text: 'If you had a robot assistant, what would it do for you first?'},
  {active: true, id: 'fun-023', text: 'What would you name a pet dragon?'},
  {active: true, id: 'fun-024', text: 'Which video game world would you spend a weekend in?'},
  {active: true, id: 'fun-025', text: 'If you opened a tiny shop, what would it sell?'},
  {active: true, id: 'fun-026', text: 'What would your superhero name be?'},
  {active: true, id: 'fun-027', text: 'Which object on your desk has the best story?'},
  {active: true, id: 'fun-028', text: 'Which silly skill would you love to master perfectly?'},
  {active: true, id: 'fun-029', text: 'What would be the perfect name for our team\'s band?'},
  {active: true, id: 'fun-030', text: 'If you could add one fun rule to every meeting, what would it be?'},
  {active: true, id: 'fun-031', text: 'With a time machine, which era would you visit for a day?'},
  {active: true, id: 'fun-032', text: 'Which pizza topping deserves more fans?'},
  {active: true, id: 'fun-033', text: 'If your code could talk, what would it say about you?'},
  {active: true, id: 'fun-034', text: 'Which planet would you pick for a team offsite?'},
  {active: true, id: 'fun-035', text: 'Which fictional sidekick would you hire as your assistant?'},
  {active: true, id: 'fun-036', text: 'What could your dream office chair do?'},
  {active: true, id: 'fun-037', text: 'Which ice cream flavor should be invented next?'},
  {active: true, id: 'fun-038', text: 'Which chore would you make disappear forever?'},
  {active: true, id: 'fun-039', text: 'What would you do with one extra hour every day?'},
  {active: true, id: 'fun-040', text: 'If you could talk with one kind of animal, which would you choose?'},
  {active: true, id: 'fun-041', text: 'What would be your signature move in a dance battle?'},
  {active: true, id: 'fun-042', text: 'Which app do you wish existed?'},
  {active: true, id: 'fun-043', text: 'If you were a font, which one would you be?'},
  {active: true, id: 'fun-044', text: 'What is your go-to karaoke song?'},
  {active: true, id: 'fun-045', text: 'If you could rename Monday, what would you call it?'},
  {active: true, id: 'fun-046', text: 'What would you put in a time capsule for the team?'},
  {active: true, id: 'fun-047', text: 'Which sport would you invent?'},
  {active: true, id: 'fun-048', text: 'If your keyboard had one extra key, what would it do?'},
  {active: true, id: 'fun-049', text: 'What is the best name for a coffee machine?'},
  {active: true, id: 'fun-050', text: 'Which famous painting would you live in for a day?'},
  {active: true, id: 'fun-051', text: 'What would be the slogan of your personal brand?'},
  {active: true, id: 'fun-052', text: 'If you were invisible for an hour at work, what would you do?'},
  {active: true, id: 'fun-053', text: 'Which mythical creature would make the best coworker?'},
  {active: true, id: 'fun-054', text: 'How would you sum up your ideal Sunday in three words?'},
  {active: true, id: 'fun-055', text: 'If you shrank to the size of an ant for a day, where would you go?'},
  {active: true, id: 'fun-056', text: 'Which movie quote do you use far too often?'},
  {active: true, id: 'fun-057', text: 'What would be on the menu of your own restaurant?'},
  {active: true, id: 'fun-058', text: 'If our team were a spaceship crew, what would your role be?'},
  {active: true, id: 'fun-059', text: 'What gift would you give a robot?'},
  {active: true, id: 'fun-060', text: 'If you could install a slide at the office, where would it go?'},
];
