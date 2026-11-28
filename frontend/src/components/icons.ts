import { svg } from 'lit';

// Original SVG artwork on a 24-unit grid. PbIcon supplies the shared stroke.
export const icons = {
  'check': svg`<path d="m4.5 12 5 5 10-10"/>`,
  'cross': svg`<path d="m6 6 12 12M18 6 6 18"/>`,
  'error': svg`<path d="M12 4 20 12 12 20 4 12Z"/><path d="M12 9v3m0 3h.01"/>`,
  'warning': svg`<path d="M12 4l9 16H3Z"/><path d="M12 10v3m0 3h.01"/>`,
  'circle': svg`<circle cx="12" cy="12" r="7.5"/>`,
  'dash': svg`<path d="M5 12h14"/>`,
  'question': svg`<path d="M8 8a4 4 0 1 1 6.8 2.9c-1.6 1.3-2.8 2.1-2.8 4m0 4h.01"/>`,
  'external-link': svg`<path d="M13 4h7v7m0-7-9 9m-1-8H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-5"/>`,
  'attestation': svg`<path d="M12 3.5 5 6.5v5c0 4.3 2.9 7.6 7 9 4.1-1.4 7-4.7 7-9v-5Z"/><path d="m9 12 2.2 2.2 4.3-4.4"/>`,
  'release': svg`<path d="M4 12.5V5a1 1 0 0 1 1-1h7.5l7.3 7.3a1 1 0 0 1 0 1.4l-6.6 6.6a1 1 0 0 1-1.4 0Z"/><path d="M8.5 8.5h.01"/>`,
  'deployment': svg`<path d="M12 15V4m-4 4 4-4 4 4"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>`,
  'sign-out': svg`<path d="M10 4H5v16h5m-1-8h11m-4-4 4 4-4 4"/>`,
  'sort': svg`<path d="m8 9 4-4 4 4m-8 6 4 4 4-4"/>`,
  'sort-ascending': svg`<path d="M12 19V5m-5 5 5-5 5 5"/>`,
  'sort-descending': svg`<path d="M12 5v14m-5-5 5 5 5-5"/>`,
};

export type IconName = keyof typeof icons;
