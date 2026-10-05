import { Link } from 'react-router';
import { Compass } from 'lucide-react';
import { EmptyState, Section } from '@/components/app/Primitives';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <Section>
      <h1 tabIndex={-1} className="sr-only">
        Page not found
      </h1>
      <EmptyState
        icon={<Compass className="size-5" />}
        title="Page not found"
        action={
          <Button asChild size="lg">
            <Link to="/">Go to overview</Link>
          </Button>
        }
      >
        The page you opened doesn't exist. It may have moved.
      </EmptyState>
    </Section>
  );
}
