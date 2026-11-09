import { Fragment, type ReactNode } from 'react';
import { fill, type Vars } from './text';

interface RichProps {
  /** A dictionary string; <b>…</b> becomes emphasis. No other markup is interpreted. */
  text: string;
  vars?: Vars;
  /** How emphasis looks; defaults to semibold ink. */
  strong?: (children: ReactNode, key: number) => ReactNode;
}

/**
 * Renders dictionary text with <b> emphasis as React elements. Values are filled in after
 * splitting, as plain text, so data can never inject markup.
 */
export function Rich({ text, vars, strong }: RichProps) {
  const parts = text.split(/(<b>.*?<\/b>)/g);
  return (
    <>
      {parts.map((part, i) => {
        const bold = /^<b>(.*)<\/b>$/.exec(part);
        if (bold) {
          const content = fill(bold[1] ?? '', vars);
          return strong ? (
            <Fragment key={i}>{strong(content, i)}</Fragment>
          ) : (
            <strong key={i} className="font-semibold text-ink">
              {content}
            </strong>
          );
        }
        return <Fragment key={i}>{fill(part, vars)}</Fragment>;
      })}
    </>
  );
}
