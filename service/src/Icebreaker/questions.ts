// SPDX-License-Identifier: CC0-1.0
// The question bank is public domain (CC0-1.0), unlike the rest of Pit Stop (AGPL-3.0):
// a self-hosted copy may edit or redistribute it freely. Ids are never reused; a question
// is retired with `active: false`, never deleted, so archived retros still show it.

export const ICEBREAKER_CATEGORIES = ['FUN'] as const;
export type IcebreakerCategory = (typeof ICEBREAKER_CATEGORIES)[number];

export interface IcebreakerQuestion {
  active: boolean;
  category: IcebreakerCategory;
  id: string;
  text: {en: string; fr: string};
}

/** Light and playful on purpose: the icebreaker is there to set a good mood, not to assess. */
export const ICEBREAKER_QUESTIONS: readonly IcebreakerQuestion[] = [
  {active: true, category: 'FUN', id: 'fun-001', text: {en: 'If you could give one boring task a superpower, which task would it be?', fr: 'Si tu pouvais donner un super-pouvoir à une tâche ennuyeuse, laquelle choisirais-tu ?'}},
  {active: true, category: 'FUN', id: 'fun-002', text: {en: 'What dream side job would you try for a year?', fr: 'Quel petit boulot de rêve tu tenterais pendant un an ?'}},
  {active: true, category: 'FUN', id: 'fun-003', text: {en: 'Which fictional world would you like to work in for a day?', fr: 'Dans quel univers de fiction aimerais-tu travailler une journée ?'}},
  {active: true, category: 'FUN', id: 'fun-004', text: {en: 'If your desk had a theme song, what would it be?', fr: 'Si ton bureau avait une musique de générique, ce serait laquelle ?'}},
  {active: true, category: 'FUN', id: 'fun-005', text: {en: 'Which animal would make the best mascot for our team?', fr: 'Quel animal ferait la meilleure mascotte pour notre équipe ?'}},
  {active: true, category: 'FUN', id: 'fun-006', text: {en: 'What would your usual lunch order say about your personality?', fr: 'Que dirait ta commande habituelle au restaurant sur ta personnalité ?'}},
  {active: true, category: 'FUN', id: 'fun-007', text: {en: 'If you could teleport to any city for lunch, where would you go?', fr: 'Si tu pouvais te téléporter dans n\'importe quelle ville pour déjeuner, laquelle choisirais-tu ?'}},
  {active: true, category: 'FUN', id: 'fun-008', text: {en: 'Which invention from history would you like on your desk today?', fr: 'Quelle invention de l\'histoire aimerais-tu avoir sur ton bureau aujourd\'hui ?'}},
  {active: true, category: 'FUN', id: 'fun-009', text: {en: 'Which board game would best describe how our team works?', fr: 'Quel jeu de société décrirait le mieux la façon dont notre équipe travaille ?'}},
  {active: true, category: 'FUN', id: 'fun-010', text: {en: 'If you were a tool in a toolbox, which one would you be?', fr: 'Si tu étais un outil dans une boîte à outils, lequel serais-tu ?'}},
  {active: true, category: 'FUN', id: 'fun-011', text: {en: 'Which fictional detective would be best at debugging our code?', fr: 'Quel détective de fiction serait le meilleur pour déboguer notre code ?'}},
  {active: true, category: 'FUN', id: 'fun-012', text: {en: 'Which emoji best describes your week so far?', fr: 'Quel emoji décrit le mieux ta semaine jusqu\'ici ?'}},
  {active: true, category: 'FUN', id: 'fun-013', text: {en: 'If you could add one new word to the dictionary, what would it be?', fr: 'Si tu pouvais ajouter un mot au dictionnaire, lequel inventerais-tu ?'}},
  {active: true, category: 'FUN', id: 'fun-014', text: {en: 'What would your personal theme park ride be called?', fr: 'Comment s\'appellerait ton manège personnel dans un parc d\'attractions ?'}},
  {active: true, category: 'FUN', id: 'fun-015', text: {en: 'If you could master any instrument overnight, which one would you pick?', fr: 'Si tu pouvais maîtriser un instrument du jour au lendemain, lequel choisirais-tu ?'}},
  {active: true, category: 'FUN', id: 'fun-016', text: {en: 'If your week were a movie, what would its title be?', fr: 'Si ta semaine était un film, quel serait son titre ?'}},
  {active: true, category: 'FUN', id: 'fun-017', text: {en: 'Which superpower would be the most useful in a meeting?', fr: 'Quel super-pouvoir serait le plus utile en réunion ?'}},
  {active: true, category: 'FUN', id: 'fun-018', text: {en: 'Which cartoon character would you swap jobs with for a day?', fr: 'Avec quel personnage de dessin animé échangerais-tu ton travail pour une journée ?'}},
  {active: true, category: 'FUN', id: 'fun-019', text: {en: 'What is your most useless talent?', fr: 'Quel est ton talent le plus inutile ?'}},
  {active: true, category: 'FUN', id: 'fun-020', text: {en: 'If our office had a secret room, what would be inside?', fr: 'Si nos bureaux avaient une pièce secrète, qu\'y aurait-il dedans ?'}},
  {active: true, category: 'FUN', id: 'fun-021', text: {en: 'Which snack deserves a statue?', fr: 'Quel en-cas mériterait sa statue ?'}},
  {active: true, category: 'FUN', id: 'fun-022', text: {en: 'If you had a robot assistant, what would it do for you first?', fr: 'Si tu avais un robot assistant, que ferait-il pour toi en premier ?'}},
  {active: true, category: 'FUN', id: 'fun-023', text: {en: 'What would you name a pet dragon?', fr: 'Comment appellerais-tu un dragon de compagnie ?'}},
  {active: true, category: 'FUN', id: 'fun-024', text: {en: 'Which video game world would you spend a weekend in?', fr: 'Dans quel monde de jeu vidéo aimerais-tu passer un week-end ?'}},
  {active: true, category: 'FUN', id: 'fun-025', text: {en: 'If you opened a tiny shop, what would it sell?', fr: 'Si tu ouvrais une toute petite boutique, que vendrait-elle ?'}},
  {active: true, category: 'FUN', id: 'fun-026', text: {en: 'What would your superhero name be?', fr: 'Quel serait ton nom de super-héros ?'}},
  {active: true, category: 'FUN', id: 'fun-027', text: {en: 'Which object on your desk has the best story?', fr: 'Quel objet de ton bureau a la meilleure histoire ?'}},
  {active: true, category: 'FUN', id: 'fun-028', text: {en: 'Which silly skill would you love to master perfectly?', fr: 'Quel talent farfelu aimerais-tu maîtriser à la perfection ?'}},
  {active: true, category: 'FUN', id: 'fun-029', text: {en: 'What would be the perfect name for our team\'s band?', fr: 'Quel serait le nom parfait pour le groupe de musique de l\'équipe ?'}},
  {active: true, category: 'FUN', id: 'fun-030', text: {en: 'If you could add one fun rule to every meeting, what would it be?', fr: 'Si tu pouvais ajouter une règle amusante à toutes les réunions, laquelle choisirais-tu ?'}},
  {active: true, category: 'FUN', id: 'fun-031', text: {en: 'With a time machine, which era would you visit for a day?', fr: 'Avec une machine à remonter le temps, quelle époque visiterais-tu une journée ?'}},
  {active: true, category: 'FUN', id: 'fun-032', text: {en: 'Which pizza topping deserves more fans?', fr: 'Quelle garniture de pizza mériterait plus de fans ?'}},
  {active: true, category: 'FUN', id: 'fun-033', text: {en: 'If your code could talk, what would it say about you?', fr: 'Si ton code pouvait parler, que dirait-il de toi ?'}},
  {active: true, category: 'FUN', id: 'fun-034', text: {en: 'Which planet would you pick for a team offsite?', fr: 'Quelle planète choisirais-tu pour un séminaire d\'équipe ?'}},
  {active: true, category: 'FUN', id: 'fun-035', text: {en: 'Which fictional sidekick would you hire as your assistant?', fr: 'Quel acolyte de fiction embaucherais-tu comme assistant ?'}},
  {active: true, category: 'FUN', id: 'fun-036', text: {en: 'What could your dream office chair do?', fr: 'Que saurait faire ton fauteuil de bureau idéal ?'}},
  {active: true, category: 'FUN', id: 'fun-037', text: {en: 'Which ice cream flavor should be invented next?', fr: 'Quel parfum de glace devrait être inventé ?'}},
  {active: true, category: 'FUN', id: 'fun-038', text: {en: 'Which chore would you make disappear forever?', fr: 'Quelle corvée ferais-tu disparaître pour toujours ?'}},
  {active: true, category: 'FUN', id: 'fun-039', text: {en: 'What would you do with one extra hour every day?', fr: 'Que ferais-tu d\'une heure de plus chaque jour ?'}},
  {active: true, category: 'FUN', id: 'fun-040', text: {en: 'If you could talk with one kind of animal, which would you choose?', fr: 'Si tu pouvais parler avec une espèce animale, laquelle choisirais-tu ?'}},
  {active: true, category: 'FUN', id: 'fun-041', text: {en: 'What would be your signature move in a dance battle?', fr: 'Quel serait ton pas signature dans une battle de danse ?'}},
  {active: true, category: 'FUN', id: 'fun-042', text: {en: 'Which app do you wish existed?', fr: 'Quelle appli aimerais-tu voir exister ?'}},
  {active: true, category: 'FUN', id: 'fun-043', text: {en: 'If you were a font, which one would you be?', fr: 'Si tu étais une police d\'écriture, laquelle serais-tu ?'}},
  {active: true, category: 'FUN', id: 'fun-044', text: {en: 'What is your go-to karaoke song?', fr: 'Quelle est ta chanson fétiche au karaoké ?'}},
  {active: true, category: 'FUN', id: 'fun-045', text: {en: 'If you could rename Monday, what would you call it?', fr: 'Si tu pouvais renommer le lundi, comment l\'appellerais-tu ?'}},
  {active: true, category: 'FUN', id: 'fun-046', text: {en: 'What would you put in a time capsule for the team?', fr: 'Que mettrais-tu dans une capsule temporelle pour l\'équipe ?'}},
  {active: true, category: 'FUN', id: 'fun-047', text: {en: 'Which sport would you invent?', fr: 'Quel sport inventerais-tu ?'}},
  {active: true, category: 'FUN', id: 'fun-048', text: {en: 'If your keyboard had one extra key, what would it do?', fr: 'Si ton clavier avait une touche en plus, à quoi servirait-elle ?'}},
  {active: true, category: 'FUN', id: 'fun-049', text: {en: 'What is the best name for a coffee machine?', fr: 'Quel serait le meilleur prénom pour une machine à café ?'}},
  {active: true, category: 'FUN', id: 'fun-050', text: {en: 'Which famous painting would you live in for a day?', fr: 'Dans quel tableau célèbre aimerais-tu vivre une journée ?'}},
  {active: true, category: 'FUN', id: 'fun-051', text: {en: 'What would be the slogan of your personal brand?', fr: 'Quel serait le slogan de ta marque personnelle ?'}},
  {active: true, category: 'FUN', id: 'fun-052', text: {en: 'If you were invisible for an hour at work, what would you do?', fr: 'Si tu étais invisible une heure au travail, que ferais-tu ?'}},
  {active: true, category: 'FUN', id: 'fun-053', text: {en: 'Which mythical creature would make the best coworker?', fr: 'Quelle créature légendaire ferait le meilleur collègue ?'}},
  {active: true, category: 'FUN', id: 'fun-054', text: {en: 'How would you sum up your ideal Sunday in three words?', fr: 'Comment résumerais-tu ton dimanche idéal en trois mots ?'}},
  {active: true, category: 'FUN', id: 'fun-055', text: {en: 'If you shrank to the size of an ant for a day, where would you go?', fr: 'Si tu rétrécissais à la taille d\'une fourmi pour une journée, où irais-tu ?'}},
  {active: true, category: 'FUN', id: 'fun-056', text: {en: 'Which movie quote do you use far too often?', fr: 'Quelle réplique de film utilises-tu beaucoup trop souvent ?'}},
  {active: true, category: 'FUN', id: 'fun-057', text: {en: 'What would be on the menu of your own restaurant?', fr: 'Que servirait ton propre restaurant ?'}},
  {active: true, category: 'FUN', id: 'fun-058', text: {en: 'If our team were a spaceship crew, what would your role be?', fr: 'Si l\'équipe était l\'équipage d\'un vaisseau spatial, quel serait ton rôle ?'}},
  {active: true, category: 'FUN', id: 'fun-059', text: {en: 'What gift would you give a robot?', fr: 'Quel cadeau ferais-tu à un robot ?'}},
  {active: true, category: 'FUN', id: 'fun-060', text: {en: 'If you could install a slide at the office, where would it go?', fr: 'Si tu pouvais installer un toboggan au bureau, où le mettrais-tu ?'}},
];
