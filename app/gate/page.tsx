import { redirect } from 'next/navigation';
import { gateEnabled } from '@/lib/gate';
import { instance } from '@/lib/instance';
import GateForm from './GateForm';

export const dynamic = 'force-dynamic';

// The shared-password prompt. Only meaningful when PUBLIC_GATE_ENABLED=1; on an
// ungated deployment there is nothing to enter, so bounce to the catalogue
// rather than show a dead page.
//
// The copy comes from lib/instance.ts. It used to be hardcoded here, written for
// gallerists opening an invitation to the catalogue raisonné — which read as
// nonsense the moment a second gated instance existed, since a studio inventory
// has no "message that brought you here". The fallback below is deliberately
// neutral, so an instance that sets nothing still says something true.
export default function GatePage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  if (!gateEnabled()) redirect('/');

  const next = searchParams.next && searchParams.next.startsWith('/') ? searchParams.next : '/';
  const copy = instance.gate ?? {
    title: instance.wordmark,
    intro: 'This catalogue is private. Please enter the password to continue.',
    help: undefined,
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center">
      <h1 className="font-serif text-2xl">{copy.title}</h1>
      <p className="mt-2 text-sm text-muted">{copy.intro}</p>
      <GateForm next={next} />
      {copy.help && <p className="mt-6 text-xs text-muted">{copy.help}</p>}
    </div>
  );
}
