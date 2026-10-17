import { useEffect, useRef } from 'react';
import { createFold } from './foldAnimation.js';
import './FoldAnimation.css';

/**
 * Animação decorativa: a URL longa (papel bruto) é dobrada até virar o origami (link curto).
 * Monte este componente ao enviar o formulário e desmonte no onDone.
 * O link curto continua sendo texto real fora daqui (aria-live); isto é só visual.
 */
export function FoldAnimation({ url, status, shortUrl, onDone, speed = 1 }) {
  const ref = useRef(null);
  const ctl = useRef(null);
  const done = useRef(onDone);

  /* Mantém o callback mais recente sem escrever no ref durante a renderização */
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    ctl.current = createFold(ref.current, { url, speed, onDone: (r) => done.current?.(r) });
    ctl.current.start();
    return () => ctl.current.destroy();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (status === 'success' && shortUrl) ctl.current?.resolve(shortUrl);
    else if (status === 'error') ctl.current?.fail();
  }, [status, shortUrl]);

  return <div ref={ref} className="fold" aria-hidden="true" />;
}
