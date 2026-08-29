import React from 'react';
import * as icons from 'lucide-react';

/**
 * Renders a lucide icon by name with a safe fallback.
 */
export function Icon({ name, size = 16, ...props }) {
  const Comp = icons[name] || icons.Box;
  return <Comp size={size} {...props} />;
}
