import type {IcebreakerQuestion} from '@/api/types';

export const pickIcebreakerText = (
  question: IcebreakerQuestion,
  language: string = navigator.language,
) => {
  if (question.source === 'CUSTOM') return question.text;

  return question.text[language.toLowerCase().startsWith('fr') ? 'fr' : 'en'];
};
