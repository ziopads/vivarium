import { redirect } from 'next/navigation';
import { gateEnabled } from '@/lib/gate';
import GateForm from './GateForm';

export const dynamic = 'force-dynamic';

// The shared-password prompt. Only meaningful when PUBLIC_GATE_ENABLED=1; on an
// ungated deployment there is nothing to enter, so bounce to the catalogue
// rather than show a dead page.
export default function GatePage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  if (!gateEnabled()) redirect('/');

  const next = searchParams.next && searchParams.next.startsWith('/') ? searchParams.next : '/';

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center">
      <h1 className="font-serif text-2xl">Selected Works</h1>
      <p className="mt-2 text-sm text-muted">
        This catalogue is shared privately. Please enter the password you were given.
      </p>
      <GateForm next={next} />
      <p className="mt-6 text-xs text-muted">
        An access issue? Reply to the message that brought you here.
      </p>
    </div>
  );
}
