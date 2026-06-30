import type { ReactNode } from 'react';

type WorldPhysicsProps = {
  children: ReactNode;
};

export function WorldPhysics({ children }: WorldPhysicsProps) {
  return <>{children}</>;
}
