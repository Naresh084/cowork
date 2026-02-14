import type { QuestionOption, UserQuestion } from '../../stores/chat-store';

function normalizeOptionText(value: string | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function optionTokens(option: QuestionOption): string[] {
  const label = normalizeOptionText(option.label);
  const value = normalizeOptionText(option.value);
  return Array.from(new Set([label, value].filter((token) => token.length > 0)));
}

function isAllowSessionOption(option: QuestionOption): boolean {
  return optionTokens(option).some((token) => token.includes('allow') && token.includes('session'));
}

function isAllowOption(option: QuestionOption): boolean {
  return optionTokens(option).some(
    (token) =>
      token === 'allow' ||
      token.startsWith('allow ') ||
      token.includes('approve') ||
      token === 'yes',
  );
}

function isDenyOption(option: QuestionOption): boolean {
  return optionTokens(option).some(
    (token) =>
      token.includes('deny') ||
      token.includes('reject') ||
      token.includes('decline') ||
      token.includes('block') ||
      token === 'no',
  );
}

function optionAnswer(option: QuestionOption | undefined, fallback: string): string {
  if (!option) return fallback;
  return (option.value || option.label || fallback).trim() || fallback;
}

export function isPermissionStyleQuestion(question: Pick<UserQuestion, 'options'>): boolean {
  const options = question.options || [];
  if (options.length === 0) return false;
  const hasAllow = options.some((option) => isAllowOption(option));
  const hasDeny = options.some((option) => isDenyOption(option));
  return hasAllow && hasDeny;
}

export function mapPermissionDecisionToQuestionAnswer(
  question: Pick<UserQuestion, 'options'>,
  decision: 'allow_once' | 'allow_session' | 'deny',
): string {
  const options = question.options || [];
  const allowSessionOption = options.find((option) => isAllowSessionOption(option));
  const allowOption =
    options.find((option) => isAllowOption(option) && !isAllowSessionOption(option)) ||
    options.find((option) => isAllowOption(option));
  const denyOption = options.find((option) => isDenyOption(option));

  if (decision === 'allow_session') {
    return optionAnswer(allowSessionOption, 'allow session');
  }
  if (decision === 'deny') {
    return optionAnswer(denyOption, 'deny');
  }
  return optionAnswer(allowOption, 'allow');
}
