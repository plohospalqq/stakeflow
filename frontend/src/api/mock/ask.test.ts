import { describe, expect, it } from 'vitest';

import { ASK_TABLES, GOOD_FIRST_QUESTIONS, answerQuestion } from './ask';

const KNOWN_TABLES = new Set(ASK_TABLES.map((t) => t.name));

describe('Ask preview answers', () => {
  it.each(GOOD_FIRST_QUESTIONS)('answers "%s"', (question) => {
    expect(answerQuestion(question, 'offline').matched).toBe(true);
  });

  it('never suggests a follow-up it cannot answer', () => {
    const questions = [...GOOD_FIRST_QUESTIONS, 'What will Brent cost?'];
    for (const question of questions) {
      for (const followUp of answerQuestion(question, 'offline').followUps) {
        expect(answerQuestion(followUp, 'offline').matched, `${question} → ${followUp}`).toBe(true);
      }
    }
  });

  it('says why a prepared example answered', () => {
    expect(answerQuestion('Top 10 gas fields in 2025', 'aiOff').preview).toBe('aiOff');
    expect(answerQuestion('What will Brent cost?', 'unavailable')).toMatchObject({
      matched: false,
      preview: 'unavailable',
    });
  });

  it('only shows SQL that uses tables listed under "Data you can ask about"', () => {
    for (const question of GOOD_FIRST_QUESTIONS) {
      const tables = answerQuestion(question, 'offline').sql.match(/marts\.\w+/g) ?? [];
      expect(tables.length).toBeGreaterThan(0);
      tables.forEach((t) => expect(KNOWN_TABLES.has(t), t).toBe(true));
    }
  });
});
